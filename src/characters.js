// CHARACTERS: his models (Mixamo rigs) set up for play -- scaled + faced, a clip animator (src/anim.js), and the layers
// code adds on top of the clip every frame: Santa's fists IK'd onto the gun's grips, the cigar on his Head bone, elf
// arm overrides (reins / waving), elf jiggle springs. Used by the game (crew.js) and the white sandbox (sandbox.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { clone as skClone } from 'three/addons/SkeletonUtils.js';
import { Batch, T, BOX, CYL, BALL, bevBox } from './util.js';
import { animator } from './anim.js';
import { loadGuns, heldGun, WEAPONS } from './weapons.js';

export const CREW = {
  santaH: 2.0, elfH: 1.8,           // elves: just a little shorter than him (his, Nov 23)           // metres, standing
  floorY: 1.42,                       // he stands on the seat cushion of his sleigh model (sleigh local)
  santaZ: 0.35,                       // where he stands
  gunScale: 1.3,
  // where the gun sits + which way his elbows bend (H-local pole points; +X is his LEFT). On foot (his note b24: walking, his
  // arms were inside his body) the gun is held further out and the elbows flare to the sides so the arms read from behind.
  seatStance: { fwd: 0.3, poleR: [-1.2, 0.2, -0.6], poleL: [1.0, -0.6, 0.2] },
  footStance: { fwd: 0.4, poleR: [-1.2, 0.2, -0.6], poleL: [1.0, -0.6, 0.2], still: true },   // b29: the sleigh's working elbows; `still` = walk/run clips don't swing his shoulders + hands (they dragged the IK arms through his body)
  aimYaw: 1.5, aimUp: 0.6, aimDown: 1.1,   // aim limits (rad) relative to the sleigh
  recoil: 0.11,                       // metres of kick per shot
  // secondary motion on the elves' jiggle bones (models/elf_girl_jiggle.glb, see tools/blender/)
  jiggle: { k: 150, damp: 7, inertia: 0.35, max: 0.03, bounce: 0.035 },
};


const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/draco/'); loader.setDRACOLoader(draco);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
let modelsP = null;
// which Santa: TOUGH (his Nov 23 model: goggles, milk-bottle belt; rigged here with hand mounts + a hat chain), NOCOAT (his coatless
// Santa, Auto-Rig Pro + fingers + mounts + hat chain) or CLASSIC
export const SANTAS = { tough: './models/santa_tough_rig.glb', nocoat: './models/santa_no_coat_rig.glb', classic: './models/santa.glb' };
export function santaChoice() { try { const v = localStorage.getItem('santa'); if (SANTAS[v]) return v; } catch (e) {} return 'tough'; }
// which elf: RED (his Nov 23 model, closer to the tough Santa's style; no jiggle bones yet) or CLASSIC (the first elf + jiggle rig)
export const ELVES = { red: './models/elf_girl_red_rig.glb', classic: './models/elf_girl_jiggle.glb' };
export function elfChoice() { try { const v = localStorage.getItem('elf'); if (ELVES[v]) return v; } catch (e) {} return 'red'; }
export const loadModels = () => modelsP || (modelsP = Promise.all([load(SANTAS[santaChoice()]), load(ELVES[elfChoice()]).catch(() => load(ELVES.classic))]).then(([santa, elf]) => ({ santa, elf })));

// ---- bone helpers --------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const wpos = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);
function bones(root) { const m = {}; root.traverse(o => { if (o.isBone) m[o.name.replace(/^mixamorig[_:]?/, '')] = o; }); return m; }

/** rotate `bone` so that its child's world position lies along the world direction to `target` */
export function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  const bp = wpos(bone, _a), cur = wpos(child, _b).sub(bp).normalize(), want = _c.copy(target).sub(bp).normalize();
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  const delta = _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_q2);
  const newWorld = delta.multiply(_q2);
  const parentQ = new THREE.Quaternion(); bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateWorldMatrix(false, true);
}
/** two-bone IK: put `end` on `target`, the middle joint bending toward `pole` (a world point) */
export function ik2(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  const A = wpos(upper), B = wpos(lower), C = wpos(end);
  const a = A.distanceTo(B), b = B.distanceTo(C);
  const toT = target.clone().sub(A); let c = toT.length();
  c = Math.min(c, (a + b) * 0.999); c = Math.max(c, Math.abs(a - b) + 1e-3);
  const dir = toT.normalize();
  const x = (a * a - b * b + c * c) / (2 * c), h = Math.sqrt(Math.max(0, a * a - x * x));
  const side = pole.clone().sub(A); side.addScaledVector(dir, -side.dot(dir)).normalize();
  const elbow = A.clone().addScaledVector(dir, x).addScaledVector(side, h);
  aimBone(upper, lower, elbow);
  aimBone(lower, end, A.clone().addScaledVector(dir, c));
}
function storeBind(B) { for (const k in B) B[k].userData.bind = B[k].quaternion.clone(); }
function resetBind(B) { for (const k in B) B[k].quaternion.copy(B[k].userData.bind); }

/** load a character, scale it to `height`, turn it to face +Z, wrap it in a group whose origin is between its feet */
export function prep(gltfScene, height) {
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.add(gltfScene); holder.add(inner);
  gltfScene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const B = bones(gltfScene);
  holder.updateMatrixWorld(true);
  const top = wpos(B.HeadTop_End).y, feet = Math.min(wpos(B.LeftToeBase).y, wpos(B.RightToeBase).y, wpos(B.LeftFoot).y - 0.0);
  const s = height / Math.max(1e-3, top - feet);
  inner.scale.setScalar(s);
  holder.updateMatrixWorld(true);
  // face +Z: his left (LeftArm) must sit on +X
  if (wpos(B.LeftArm).x < wpos(B.RightArm).x) inner.rotation.y = Math.PI;
  holder.updateMatrixWorld(true);
  const hip = wpos(B.Hips), lowest = Math.min(wpos(B.LeftToeBase).y, wpos(B.RightToeBase).y, wpos(B.LeftFoot).y, wpos(B.RightFoot).y);
  inner.position.set(-hip.x, -lowest + 0.02, -hip.z);
  holder.updateMatrixWorld(true);
  storeBind(B);
  return { holder, B, s };
}

// ---- the gun: a big belt-fed machine gun, +Z forward, origin at the pistol grip ------------------------
export function buildGun() {
  const g = new THREE.Group(), S = new Batch();
  const steel = '#3a3f4a', dark = '#23262e', wood = '#6b4228', olive = '#4f5a34', brass = '#d8a842';
  S.add(bevBox(0.2, 0.26, 0.8, 0.04), steel, T(0, 0.12, 0.15));                 // receiver
  S.add(bevBox(0.22, 0.08, 0.5, 0.03), dark, T(0, 0.27, 0.05));                  // feed cover
  S.add(bevBox(0.14, 0.2, 0.6, 0.05), wood, T(0, 0.06, -0.5, 1, 1, 1, 0.08, 0, 0)); // stock
  S.add(bevBox(0.16, 0.26, 0.06, 0.03), dark, T(0, 0.04, -0.82));               // butt plate
  S.add(bevBox(0.09, 0.24, 0.12, 0.03), wood, T(0, -0.1, 0, 1, 1, 1, -0.3, 0, 0)); // pistol grip
  S.add(bevBox(0.05, 0.05, 0.14, 0.02), dark, T(0, -0.02, 0.12));                // trigger guard
  S.add(bevBox(0.2, 0.2, 0.6, 0.05), wood, T(0, 0.1, 0.82));                     // handguard
  S.add(bevBox(0.08, 0.24, 0.1, 0.03), dark, T(0, -0.08, 0.75));                 // front grip
  S.add(CYL, steel, T(0, 0.14, 1.55, 0.05, 1.3, 0.05, Math.PI / 2, 0, 0));        // barrel
  for (let k = 0; k < 6; k++) S.add(CYL, dark, T(0, 0.14, 1.25 + k * 0.1, 0.075, 0.05, 0.075, Math.PI / 2, 0, 0));  // cooling rings
  S.add(CYL, dark, T(0, 0.14, 2.22, 0.08, 0.16, 0.08, Math.PI / 2, 0, 0));        // flash hider
  S.add(bevBox(0.04, 0.12, 0.04, 0.01), dark, T(0, 0.26, 2.1));                  // front sight
  for (const z of [-0.05, 0.35]) S.add(bevBox(0.04, 0.12, 0.04, 0.01), dark, T(0, 0.33, z));
  S.add(bevBox(0.04, 0.04, 0.46, 0.015), dark, T(0, 0.4, 0.15));                 // carry handle
  for (const sx of [-1, 1]) S.add(CYL, dark, T(sx * 0.05, 0.02, 1.7, 0.015, 0.55, 0.015, 1.35, 0, sx * 0.12)); // folded bipod
  S.add(bevBox(0.2, 0.3, 0.34, 0.03), olive, T(0.22, -0.06, 0.2));               // ammo can on the left
  S.add(bevBox(0.05, 0.05, 0.2, 0.02), dark, T(0.22, 0.1, 0.2));
  const body = new THREE.Mesh(S.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.45 }));
  body.castShadow = true; g.add(body);
  // the ammo belt: brass rounds from the can up into the feed, swinging a little
  const N = 16, belt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), new THREE.MeshStandardMaterial({ color: brass, metalness: 0.9, roughness: 0.3 }), N);
  belt.castShadow = true; g.add(belt);
  const grips = { right: new THREE.Object3D(), left: new THREE.Object3D() };
  grips.right.position.set(0, -0.06, 0.0); grips.left.position.set(0, -0.05, 0.75);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.14, 2.32);
  const eject = new THREE.Object3D(); eject.position.set(-0.12, 0.18, 0.2);
  g.add(grips.right, grips.left, muzzle, eject);
  // muzzle flash: a star of additive cards, shown for a frame or two per shot
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fl = new THREE.Group(); fl.position.copy(muzzle.position);
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), flashMat); m.rotation.set(Math.PI / 2, k * Math.PI / 3, 0); m.position.z = 0.35; fl.add(m); }
  fl.visible = false; g.add(fl);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const updBelt = t => {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      p.set(0.2 - u * 0.15 + Math.sin(t * 3 + u * 4) * 0.02 * Math.sin(u * Math.PI), 0.1 - Math.sin(u * Math.PI) * 0.35 + u * 0.12, 0.2 + Math.sin(t * 2.4 + u * 5) * 0.03 * Math.sin(u * Math.PI));
      p.x += 0.05 * Math.sin(u * Math.PI);
      q.setFromEuler(e.set(0, 0, Math.PI / 2 + (u - 0.5) * 0.8));
      belt.setMatrixAt(i, m4.compose(p, q, one));
    }
    belt.instanceMatrix.needsUpdate = true;
  };
  return { g, grips, muzzle, eject, flash: fl, updBelt };
}

function buildCigar() {
  const c = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5a3420', roughness: 0.9 }));
  leaf.position.z = 0.16; c.add(leaf);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8b84a', metalness: 0.7, roughness: 0.35 }));
  band.position.z = 0.06; c.add(band);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a20').multiplyScalar(3), toneMapped: false }));
  ember.position.z = 0.34; c.add(ember);
  const tip = new THREE.Object3D(); tip.position.z = 0.38; c.add(tip);
  return { c, tip, ember };
}

/** spring the jiggle bones: each one lags its anchor (where the bind pose puts it) and springs back */
function makeJiggle(E) {
  const J = ['jiggle_L', 'jiggle_R'].map(n => E.B[n]).filter(Boolean).map((bone, i) => ({
    bone, bind: bone.position.clone(), prev: null, warm: 0, vel: new THREE.Vector3(), accS: new THREE.Vector3(), accAvg: new THREE.Vector3(), o: new THREE.Vector3(), ov: new THREE.Vector3(), phase: i * 0.7,
  }));
  const anchor = new THREE.Vector3(), acc = new THREE.Vector3(), pq = new THREE.Quaternion(), ps = new THREE.Vector3(), lo = new THREE.Vector3();
  const fn = dt => {
    if (!J.length || dt <= 0) return;
    const P = CREW.jiggle;
    for (const j of J) {
      j.bone.position.copy(j.bind);
      j.bone.parent.updateWorldMatrix(true, false);
      anchor.copy(j.bind).applyMatrix4(j.bone.parent.matrixWorld);
      if (!j.prev) { j.prev = anchor.clone(); continue; }
      const v = lo.copy(anchor).sub(j.prev).divideScalar(dt);
      acc.copy(v).sub(j.vel).divideScalar(dt); j.vel.copy(v); j.prev.copy(anchor);
      if (j.warm++ < 3) continue;                                     // first frames: no velocity history yet
      if (acc.lengthSq() > 4e4) acc.setLength(200);                 // ignore teleports / first frames
      j.accS.lerp(acc, 1 - Math.exp(-25 * dt));                       // smooth frame-time noise
      j.accAvg.lerp(j.accS, 1 - Math.exp(-0.8 * dt));                 // the steady part (a long turn) ...
      acc.subVectors(j.accS, j.accAvg);                               // ... is ignored: only CHANGES in motion jiggle
      // o'' = -k o - c o' - inertia * a   (the flesh lags the body)
      j.ov.addScaledVector(j.o, -P.k * dt).addScaledVector(j.ov, -P.damp * dt).addScaledVector(acc, -P.inertia * dt);
      j.o.addScaledVector(j.ov, dt);
      const ol = j.o.length();
      if (ol > P.max) { j.o.multiplyScalar(P.max / ol); const out = j.ov.dot(j.o) / P.max; if (out > 0) j.ov.addScaledVector(j.o, -out / P.max); }   // stop at the limit, don't wind up
      // world offset -> parent-local
      j.bone.parent.getWorldQuaternion(pq); j.bone.parent.getWorldScale(ps);
      lo.copy(j.o).applyQuaternion(pq.invert()).divideScalar(ps.x);
      j.bone.position.copy(j.bind).add(lo);
    }
  };
  fn.J = J;
  return fn;
}


const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();

/** HAT DYNAMICS: the hat_01..hat_tip chain (tools/blender/hat_chain_rig.py) swings on a spring driven by the head's
 *  changes in motion (high-passed, like the jiggle), each bone further out bending a little more, plus a lazy idle wobble. */
export const HAT = { k: 45, damp: 5, inertia: 0.16, max: 0.7, share: [0.35, 0.65, 1.0, 0.45], wobble: 0.07 };
function makeHatSway(B) {
  const chain = ['hat_01', 'hat_02', 'hat_03', 'hat_tip'].map(n => B[n]).filter(Boolean);
  if (!chain.length) return () => {};
  for (const b of chain) b.userData.hatBind = b.quaternion.clone();
  const anchor = B.Head, prev = new THREE.Vector3(), vel = new THREE.Vector3(), accS = new THREE.Vector3(), accAvg = new THREE.Vector3();
  const off = new THREE.Vector3(), offV = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Vector3(), axis = new THREE.Vector3();
  const pq = new THREE.Quaternion(), q = new THREE.Quaternion();
  let warm = 0, t = 0;
  return dt => {
    if (dt <= 0) return; t += dt;
    for (const b of chain) b.quaternion.copy(b.userData.hatBind);
    anchor.getWorldPosition(p);
    if (warm++ < 3) { prev.copy(p); return; }
    const v = tmp.copy(p).sub(prev).divideScalar(dt); prev.copy(p);
    const acc = v.clone().sub(vel).divideScalar(dt); vel.copy(v);
    if (acc.lengthSq() > 4e4) acc.setLength(200);
    accS.lerp(acc, 1 - Math.exp(-25 * dt)); accAvg.lerp(accS, 1 - Math.exp(-0.8 * dt));
    acc.subVectors(accS, accAvg);
    // off = the hat's lean (world space, ~radians): it lags the head, then springs back
    offV.addScaledVector(off, -HAT.k * dt).addScaledVector(offV, -HAT.damp * dt).addScaledVector(acc, -HAT.inertia * dt);
    off.addScaledVector(offV, dt);
    if (off.length() > HAT.max) off.setLength(HAT.max);
    chain.forEach((b, i) => {
      const lean = tmp.set(Math.sin(t * 1.3 + i) * HAT.wobble, 0, Math.cos(t * 1.1 + i) * HAT.wobble).add(off);
      const ang = lean.length() * HAT.share[i]; if (ang < 1e-4) return;
      axis.set(0, 1, 0).cross(lean).normalize();             // tip the bone toward the lean direction
      b.parent.getWorldQuaternion(pq);
      axis.applyQuaternion(pq.invert());
      b.quaternion.premultiply(q.setFromAxisAngle(axis, ang));
    });
  };
}

// ---- SANTA: his model + a clip + the gun on his Spine with both fists IK'd onto its grips -------------------------
/** ARM FIT per character (his, Nov 24: "any fat or wide rig always needs the arms adjusted"): Mixamo clips are made for a slim
 *  body, so on a wide one the arms swing INTO the belly. `spread` (rad) opens both upper arms outward after the clip; `fwd` (m)
 *  pushes the held gun out from the belly; `pole` scales how far out to the side the elbows bend under the gun IK. */
export const ARMFIT = {
  tough:   { spread: 0.15, fwd: 0.05, pole: 1.15 },
  nocoat:  { spread: 0.5,  fwd: 0.22, pole: 1.6 },
  classic: { spread: 0.1,  fwd: 0,    pole: 1 },
  snowman: { spread: 0.6,  fwd: 0.25, pole: 1.7 },
};
const _sa = new THREE.Vector3(), _sq1 = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sq3 = new THREE.Quaternion();
/** open both upper arms outward by `a` rad round the character's forward axis (world-space, after the clip) */
export function spreadArms(B, H, a) {
  if (!a) return;
  H.getWorldQuaternion(_sq1); _sa.set(0, 0, 1).applyQuaternion(_sq1);
  for (const [bone, s] of [[B.LeftArm, 1], [B.RightArm, -1]]) {
    if (!bone) continue;
    bone.getWorldQuaternion(_sq2); _sq3.setFromAxisAngle(_sa, s * a).multiply(_sq2);   // +X is his LEFT: +a about forward lifts it outward
    bone.parent.getWorldQuaternion(_sq2).invert(); bone.quaternion.copy(_sq2.multiply(_sq3)); bone.updateMatrixWorld(true);
  }
}

export function makeSanta(gltf, { role = 'idle', stance = 'seat', fit = ARMFIT[santaChoice()] || ARMFIT.tough } = {}) {
  const ST0 = stance === 'foot' ? CREW.footStance : CREW.seatStance;
  const ST = { ...ST0, fwd: ST0.fwd + fit.fwd, poleR: [ST0.poleR[0] * fit.pole, ST0.poleR[1], ST0.poleR[2]], poleL: [ST0.poleL[0] * fit.pole, ST0.poleL[1], ST0.poleL[2]] };
  const inst = skClone(gltf.scene);
  const S = prep(inst, CREW.santaH), B = S.B, H = S.holder;
  H.updateMatrixWorld(true);
  const local = (x, y, z) => H.localToWorld(new THREE.Vector3(x, y, z));

  // cigar on the Head bone, out of the side of the beard
  const cig = buildCigar();
  {
    const head = B.Head, hp = wpos(head), hh = wpos(B.HeadTop_End).y - hp.y, hl = H.worldToLocal(hp.clone());
    const mouth = local(hl.x - 0.06, hl.y + hh * 0.22, hl.z + hh * 0.62);
    const q = H.getWorldQuaternion(Q()).multiply(Q().setFromEuler(new THREE.Euler(0.22, -0.45, 0)));
    head.add(cig.c);
    cig.c.position.copy(head.worldToLocal(mouth));
    cig.c.quaternion.copy(head.getWorldQuaternion(Q()).invert().multiply(q));
    cig.c.scale.setScalar(1 / head.getWorldScale(V()).x);
  }

  // the gun rides on the Spine bone (so the body's motion carries it); its aim is set in HIS frame each update
  let gun = buildGun(); const pivot = new THREE.Group();
  const hipL = H.worldToLocal(wpos(B.RightUpLeg)), chestL = H.worldToLocal(wpos(B.Spine2));
  B.Spine.add(pivot);
  pivot.position.copy(B.Spine.worldToLocal(local(hipL.x * 0.55, hipL.y + (chestL.y - hipL.y) * 0.55, hipL.z + ST.fwd)));   // across the belly (on foot: held out in front, so his arms show)
  pivot.scale.setScalar(1 / B.Spine.getWorldScale(V()).x);
  gun.g.scale.setScalar(CREW.gunScale); pivot.add(gun.g);

  const anim = animator('santa', gltf.scene, inst);
  const hat = makeHatSway(B);
  anim.play(role);
  let idleRole = role, firing = false, kick = 0, flashT = 0, aimWorld = null;
  const aimQ = Q(), wantQ = Q(), tmp = V(), hq = Q(), sq = Q();
  const self = {
    holder: H, B, anim, cigarTip: cig.tip, weapon: null,
    get gun() { return gun; }, get muzzle() { return gun.muzzle; }, get eject() { return gun.eject; },
    get def() { return gun.def || WEAPONS.gatling; }, get rate() { return (gun.def || WEAPONS.gatling).rate; },
    /** swap to one of his rigged guns (WEAPONS key); the procedural gun stays until they load */
    async setWeapon(key) {
      self.weapon = key;
      const scene = await loadGuns();
      if (self.weapon !== key) return;
      const next = heldGun(scene, key);
      pivot.remove(gun.g); gun = next; pivot.add(gun.g);
    },
    setIdle(r) { idleRole = r; if (!firing) anim.play(r); },
    setFiring(on) { if (on === firing) return; firing = on; anim.play(on ? 'fire' : idleRole, 0.15); },
    kick() { kick = gun.def?.kick ?? CREW.recoil; flashT = 0.045; gun.flash.rotation.z = Math.random() * 3; },
    aimAt(world) { aimWorld = world ? (aimWorld || V()).copy(world) : null; },
    update(dt, t) {
      anim.update(dt);
      spreadArms(B, H, fit.spread);
      H.updateMatrixWorld(true);
      // aim, in his own frame, clamped to the arc in front of him
      if (aimWorld) {
        tmp.copy(aimWorld); H.worldToLocal(tmp).sub(H.worldToLocal(pivot.getWorldPosition(V())));
        const yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -CREW.aimYaw, CREW.aimYaw);
        const pitch = THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -CREW.aimDown, CREW.aimUp);
        wantQ.setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
      } else wantQ.identity();
      aimQ.slerp(wantQ, 1 - Math.exp(-12 * dt));
      H.getWorldQuaternion(hq); B.Spine.getWorldQuaternion(sq);
      pivot.quaternion.copy(sq.invert().multiply(hq).multiply(aimQ));
      kick *= Math.exp(-18 * dt);
      gun.g.position.set(0, 0, -kick); gun.g.rotation.x = -kick * 1.4;
      flashT -= dt; gun.flash.visible = flashT > 0;
      gun.firing = firing; gun.updBelt(t, dt);
      cig.ember.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      // on foot the walk / run clips swing the clavicles and wrists; with both fists on a gun that throws the IK'd arms
      // through his chest -- hold shoulders + hands at the bind pose so only the IK moves the arms
      if (ST.still) for (const k of ['LeftShoulder', 'RightShoulder', 'LeftHand', 'RightHand']) if (B[k]?.userData.bind) B[k].quaternion.copy(B[k].userData.bind);
      pivot.updateMatrixWorld(true);
      ik2(B.RightArm, B.RightForeArm, B.RightHand, gun.grips.right.getWorldPosition(V()), local(...ST.poleR));
      // support hand: the gun's front grip if he can reach it, else slide back along the gun to the farthest point he can
      {
        const sh = B.LeftArm.getWorldPosition(V()), reach = (wpos(B.LeftForeArm).distanceTo(sh) + wpos(B.LeftHand).distanceTo(wpos(B.LeftForeArm))) * 0.97;
        const gl = gun.grips.left.getWorldPosition(V()), gr = gun.grips.right.getWorldPosition(V()), tgt = gl.clone();
        if (tgt.distanceTo(sh) > reach) { let lo = 0, hi = 1; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; tgt.lerpVectors(gr, gl, m); if (tgt.distanceTo(sh) > reach) hi = m; else lo = m; } tgt.lerpVectors(gr, gl, lo); }
        ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, tgt, local(...ST.poleL));
      }
      hat(dt);
    },
  };
  return self;
}

// ---- ELF: her model (jiggle rig) + a clip, optional seat height, optional arm override, jiggle springs ----------------
export function makeElf(gltf, { role = 'idle', seat = null } = {}) {
  const inst = skClone(gltf.scene);
  const E = prep(inst, CREW.elfH), H = E.holder;
  const anim = animator('elf', gltf.scene, inst);
  let ready = false, seatDone = seat == null;
  anim.play(role).then(() => { ready = true; });
  const jig = makeJiggle(E);
  const self = {
    holder: H, B: E.B, anim, armIK: null,
    L: (x, y, z) => H.localToWorld(new THREE.Vector3(x, y, z)),
    update(dt, t) {
      anim.update(dt);
      if (!seatDone && ready) {   // sit her hips on the seat once the sitting clip is on
        H.updateMatrixWorld(true);
        const hy = H.worldToLocal(wpos(E.B.Hips)).y;
        H.children[0].position.y += seat - hy; seatDone = true;
      }
      H.updateMatrixWorld(true);
      if (self.armIK) self.armIK(self, t);
      jig(dt);
    },
  };
  return self;
}
