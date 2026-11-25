// CHARACTERS: his models (Mixamo rigs) set up for play -- scaled + faced, a clip animator (src/anim.js), and the layers
// code adds on top of the clip every frame: Santa's fists IK'd onto the gun's grips, the cigar on his Head bone, elf
// arm overrides (reins / waving), elf jiggle springs. Used by the game (crew.js) and the white sandbox (sandbox.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { clone as skClone } from 'three/addons/SkeletonUtils.js';
import { Batch, T, BOX, CYL, BALL, bevBox } from './util.js';
import { animator, cleanClip } from './anim.js';
import { retargetClip } from './retarget.js';
import { loadGuns, heldGun, WEAPONS } from './weapons.js';

export const CREW = {
  santaH: 2.0, elfH: 1.8,           // elves: just a little shorter than him (his, Nov 23)           // metres, standing
  floorY: 1.42,                       // he stands on the seat cushion of his sleigh model (sleigh local)
  santaZ: 0.35,                       // where he stands
  gunScale: 1.3,
  handGunScale: 0.85, gunTilt: 0.05, handSpread: 0.35,
  blade: 0.3, bladeHead: 0.85, leftGrip: false,
  hipShare: 0.5,   // b60: share of the side-on turn taken by the hips when standing (0 while walking / running: legs face the run)
  hold: 'pose',   // b58: 'pose' = fixed per-weapon upper body from the Gun Pose sandbox (HOLD poses); 'gunner' = b50 hands-first; 'hand' = b45   // b50 (his: left elbow UP + out, hand in onto the gun, gun inside the right arm): 'gunner' two-handed; 'hand' = b45-49 right-hand carry. Was b47: 'gunner' = side-on body, gun in front of the belly, both hands IK'd with elbows out; 'hand' = b45 gun in the right hand
  gunnerPose: { R: [-0.17, -0.33, 0.3], L: [0.24, -0.25, 0.4], turn: 1, head: 0.8, poleR: [-1.4, -0.3, -0.2], poleL: [0.9, 0.3, 0.1] },   // hand spots from the shoulders' midpoint (his frame); poles from each shoulder   // b45 bladed stance: torso twist (rad, left shoulder forward), share of it the head turns back; left hand IK'd to the front grip   // b44 hand-held gun: size, a touch of muzzle-down, arm spread kept small (it moves the gun hand)
  // where the gun sits + which way his elbows bend (H-local pole points; +X is his LEFT). On foot (his note b24: walking, his
  // arms were inside his body) the gun is held further out and the elbows flare to the sides so the arms read from behind.
  // side = gun pivot x as a multiple of his right hip's x (0.55 = across the belly; bigger = out at his right hip, Rambo carry);
  // h = height between hip (0) and chest (1); scale = gun size multiplier for this stance
  // b39 HIP CARRY (his: "his arms are completely gone"): the gun sits low at his right hip, not across the belly
  seatStance: { swivel: 1.4, side: 1.9, h: 0.15, scale: 0.85, fwd: 0.3, poleR: [-1.2, 0.2, -0.6], poleL: [1.0, -0.6, 0.2] },
  footStance: { aimYaw: 0.35, side: 1.9, h: 0.15, scale: 0.85, fwd: 0.4, poleR: [-1.2, 0.2, -0.6], poleL: [1.0, -0.6, 0.2], still: true },   // b29: the sleigh's working elbows; `still` = walk/run clips don't swing his shoulders + hands (they dragged the IK arms through his body)
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
  tough:   { spread: 0.15, fwd: 0.05, pole: 1.15, leftOut: 0.6, rightOut: 0.45, rightHand: 0.32 },
  nocoat:  { spread: 0.5,  fwd: 0.22, pole: 1.6, leftOut: 0.52, rightOut: 0.45, rightHand: 0.28 },
  classic: { spread: 0.1,  fwd: 0,    pole: 1, leftOut: 0.38, rightOut: 0.4, rightHand: 0.26 },
  snowman: { spread: 0.5,  fwd: 0.25, pole: 1.7, elbow: 0, hand: 0 },   // b52: spread in his CHEST frame (enemies.js fitSnowArms); snowcheck: 0 flags on all 10 clips
  elf:     { spread: 0.22, fwd: 0,    pole: 1 },
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

/** cigar placement per Santa (mouth = head bone + fractions of head-bone->HeadTop height; rx/ry = tilt) */
const RIFLE_ROLES = new Set(['idle', 'fire', 'walk', 'run']);
const UNARMED = { idle: 'uidle', walk: 'uwalk', run: 'urun', tipsy: 'uidle' };   // b75: role swaps while he holds no gun
/** HOLD POSES (b58, his call: "sandbox is fine") -- his upper body is a FIXED pose per weapon, set in the Gun Pose sandbox
 *  (?scene=gunpose) and saved to localStorage 'holdpose.v1' { santaKey: { weapon: pose } }; legs keep the clips. Units: metres /
 *  degrees, in his TORSO frame (x = his LEFT, y up, z forward) from the midpoint of his shoulders.
 *  gx gy gz = rear grip; yaw pitch roll = the gun (yaw/pitch add to the aim); twist = body turned to his right from the hips;
 *  head = share of the twist the head turns back; lSlide = left hand along the gun from the rear grip, lUp = above (+) / below (-)
 *  its axis; rOut rUp / lOut lUp = which way each elbow points (from its shoulder); scale = gun size. */
export const HOLD_DEFAULT = { gx: -0.12, gy: -0.33, gz: 0.32, yaw: 0, pitch: 0, roll: 0, twist: 55, head: 0.8, lSlide: 0.35, lUp: 0.06,
  rOut: 0.8, rUp: -0.3, lOut: 0.7, lUp2: 0.5, scale: 0.85 };
export const HOLD_BASE = {};   // committed per-weapon defaults (his saved poses go here once he sends them): { santaKey: { weapon: {...} } }
export function holdPose(santaKey, weapon) {
  let saved = null; try { saved = JSON.parse(localStorage.getItem('holdpose.v1') || 'null'); } catch (e) {}
  return { ...HOLD_DEFAULT, ...(HOLD_BASE[santaKey]?.[weapon] || {}), ...(saved?.[santaKey]?.[weapon] || {}) };
}
export const CIGAR = {
  tough:   { side: -0.06, up: 0.22, fwd: 0.62, rx: 0.22, ry: -0.45 },
  classic: { side: -0.06, up: 0.22, fwd: 0.62, rx: 0.22, ry: -0.45 },
  nocoat:  { side: -0.07, up: 0.03, fwd: 0.6, rx: -0.15, ry: -1.1 },   // b41: in the corner of his mouth, out to the side (it stuck into his face)
};

export function makeSanta(gltf, { role = 'idle', stance = 'seat', fit = ARMFIT[santaChoice()] || ARMFIT.tough, cigarKey = santaChoice() } = {}) {
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
    const C = CIGAR[cigarKey] || CIGAR.tough;   // per model: his head-top bone sits at a different height on each Santa
    const mouth = local(hl.x + C.side, hl.y + hh * C.up, hl.z + hh * C.fwd);
    const q = H.getWorldQuaternion(Q()).multiply(Q().setFromEuler(new THREE.Euler(C.rx, C.ry, 0)));
    head.add(cig.c);
    cig.c.position.copy(head.worldToLocal(mouth));
    cig.c.quaternion.copy(head.getWorldQuaternion(Q()).invert().multiply(q));
    cig.c.scale.setScalar(1 / head.getWorldScale(V()).x);
  }

  // b44 (his: "Santa's arms are still fucked"): the gun is IN HIS RIGHT HAND and the Mixamo RIFLE clips pose both arms (they're
  // made for holding a gun) -- no more arm IK fighting the clip. The gun is lined up with his facing once, in the rifle idle pose
  // (calibrated on the first frames), then it simply rides the hand; AIM = a twist through his spine (+ a swivel on the seat).
  let gun = buildGun(); const pivot = new THREE.Group();
  // the gun mounts on his WEAPON bone (mounts.py: weapon_root_right, at the palm) -- his rule: never a wrist guess; the hand
  // bone + a palm offset only for a rig without mounts (classic)
  const mount = B.weapon_root_right || B.RightHand;
  const GUNNER = CREW.hold === 'gunner' || CREW.hold === 'pose', POSED = CREW.hold === 'pose';
  if (GUNNER) H.add(pivot); else { mount.add(pivot); pivot.scale.setScalar(1 / mount.getWorldScale(V()).x); }
  gun.g.scale.setScalar(CREW.gunScale * CREW.handGunScale); pivot.add(gun.g);
  let calib = 0;   // frames of the rifle pose seen; lined up at a few frames in

  const anim = animator('santa', gltf.scene, inst);
  const hat = makeHatSway(B);
  anim.play(role);
  let idleRole = role, firing = false, kick = 0, flashT = 0, aimWorld = null, aimY = 0, aimP = 0, baseYaw = null, swiv = 0, hipShare = CREW.hipShare;
  const aimQ = Q(), wantQ = Q(), tmp = V(), hq = Q(), sq = Q();
  /** GUNNER (b47, his: "his left arm is completely gone -- it's inside his body"): stubby arms can't reach across that belly, so
   *  his whole body turns side-on from the HIPS (left shoulder leads), the gun is held out in front of the belly in the turned
   *  torso's frame pointing at the aim, and BOTH hands are IK'd onto its grips with the elbows pushed OUT to the sides. */
  const G = CREW.gunnerPose, up0 = new THREE.Vector3(0, 1, 0);
  function gunnerPose(dt) {
    if (self.freeArms) return;
    for (const k of ['LeftShoulder', 'RightShoulder']) if (B[k]?.userData.bind) B[k].quaternion.copy(B[k].userData.bind);   // no clavicle swing under the gun
    H.updateMatrixWorld(true);
    // aim (his unturned frame)
    let wy = 0, wp = 0;
    if (aimWorld) {
      tmp.copy(aimWorld); H.worldToLocal(tmp).sub(H.worldToLocal(wpos(B.Spine2)));
      wy = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -(ST.aimYaw ?? CREW.aimYaw), ST.aimYaw ?? CREW.aimYaw);
      wp = THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -CREW.aimDown, CREW.aimUp);
    }
    const ka = 1 - Math.exp(-12 * dt); aimY += (wy - aimY) * ka; aimP += (wp - aimP) * ka;
    // HANDS FIRST (b50, his: left elbow UP and out, hand in onto the gun ~45 deg; gun INSIDE the right arm): the two spots his short
    // arms reach comfortably, from the shoulders' midpoint in his own frame; the gun runs through both, and his whole body turns
    // (from the hips) until that line points at the target -- a side-on heavy-gun stance
    const ls = H.worldToLocal(wpos(B.LeftArm)), rs = H.worldToLocal(wpos(B.RightArm)), M = ls.clone().add(rs).multiplyScalar(0.5);
    const Rp = M.clone().add(V().fromArray(G.R)), Lp = M.clone().add(V().fromArray(G.L)), d = Lp.clone().sub(Rp);
    const theta = Math.atan2(d.x, d.z) * G.turn;                 // how far the line points to his left
    const phi = aimY - theta;                                      // body turn so the gun line points at the aim
    H.getWorldQuaternion(hq); const up = up0.clone().applyQuaternion(hq);
    twist(['Hips'], Q().setFromAxisAngle(up, phi));
    twist(['Neck', 'Head'], Q().setFromAxisAngle(up, -phi * G.head / 2));   // eyes stay on the target
    H.updateMatrixWorld(true);
    const hip = H.worldToLocal(wpos(B.Hips)), rot = v => { const o = v.clone().sub(hip); o.applyAxisAngle(up0, phi); return o.add(hip); };
    const R2 = rot(Rp), L2 = rot(Lp);
    pivot.position.copy(R2);
    pivot.quaternion.setFromEuler(new THREE.Euler(-aimP, aimY, 0, 'YXZ'));
    pivot.updateMatrixWorld(true);
    // right hand on the rear grip (elbow out, back, down); left hand onto the gun where it passes his left hand's spot (elbow UP, out)
    ik2(B.RightArm, B.RightForeArm, B.RightHand, gun.grips.right.getWorldPosition(V()), H.localToWorld(rot(rs.clone().add(V().fromArray(G.poleR)))));
    const a0 = gun.grips.right.getWorldPosition(V()), ax = V().set(0, 0, 1).applyQuaternion(pivot.getWorldQuaternion(Q())), Lw = H.localToWorld(L2.clone());
    const tgt = a0.clone().addScaledVector(ax, Math.max(0.05, Lw.clone().sub(a0).dot(ax)));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, tgt, H.localToWorld(rot(ls.clone().add(V().fromArray(G.poleL)))));
  }
  /** POSED HOLD: fixed upper body per weapon (HOLD poses), legs from the clip; aim = gun yaw / pitch on top */
  // TUMBLES CARRY THE GUN (b68, his: "he does the roll and the gun doesn't rotate with him"): during a roll / back hop / get-up /
  // landing the clip owns his arms, so the gun stops being posed and RIDES HIS RIGHT HAND (the hand->gun offset is captured the
  // moment the move starts), then eases back into the posed hold when it's over
  const FREE_ROLES = new Set(['roll', 'dodgeBack', 'getup', 'land', 'air']),   // b73: + 'air' (thrown by a crash / falling: the gun floated)
  _rel = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  let riding = false;
  function rideHand() {
    H.updateMatrixWorld(true);
    if (!riding) { riding = true; _rel.copy(B.RightHand.matrixWorld).invert().multiply(pivot.matrixWorld); }
    _m1.multiplyMatrices(B.RightHand.matrixWorld, _rel); _m2.copy(H.matrixWorld).invert().multiply(_m1);
    _m2.decompose(pivot.position, pivot.quaternion, tmp); pivot.updateMatrixWorld(true);
  }
  // AIR SPLIT (b86, his: "in the air pose, legs only -- if he's shooting the upper torso holds the gun and shoots it"): in the 'air'
  // role (jump / fall / jetpack) with self.airAim on (aiming or firing), an UPPER layer (Rifle_Idle_2, every track but the Hips +
  // legs) takes Spine-and-up the way loco.js takes the legs (weight s / (1 - s) against the air clip's ~1, so each bone sums to 1),
  // and the posed hold + aim run on top as on the ground. Not aiming = the full-body air clip, the gun riding his hand. airK eases
  // 0..1 in ~0.15 s; while it's between, the arms + gun are slerped from the hand-ride pose to the hold.
  let airK = 0, upperAct = null;
  const SPLIT_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'].filter(k => B[k]);
  const _snap = SPLIT_BONES.map(() => Q()), _rp = V(), _rq = Q();
  new GLTFLoader().load('./models/anims/Rifle_Idle_2.glb', g => {
    try {
      const rc = retargetClip(g.scene, g.animations[0], gltf.scene, { name: 'airUpper' });
      rc.tracks = rc.tracks.filter(t => !/(Hips|UpLeg|Leg|Foot|Toe)[^.]*\.(quaternion|position)$/.test(t.name));
      cleanClip(rc, { loop: true });
      upperAct = anim.mixer.clipAction(rc); upperAct.setLoop(THREE.LoopRepeat, Infinity); upperAct.enabled = true; upperAct.setEffectiveWeight(0); upperAct.play();
    } catch (e) { console.warn('air upper layer', e); }
  });
  function heldPose(dt) {
    const airSplit = anim.role === 'air' && airK > 0.001;
    if (self.freeArms || (FREE_ROLES.has(anim.role) && !airSplit)) { rideHand(); return; }
    const blend = airSplit && airK < 0.999;
    if (blend) { SPLIT_BONES.forEach((k, i) => _snap[i].copy(B[k].quaternion)); rideHand(); _rp.copy(pivot.position); _rq.copy(pivot.quaternion); }
    else riding = false;
    const Pz = self.pose || (self.pose = holdPose(cigarKey, self.weapon || 'gatling')), D = THREE.MathUtils.degToRad;
    for (const k of ['LeftShoulder', 'RightShoulder']) if (B[k]?.userData.bind) B[k].quaternion.copy(B[k].userData.bind);
    H.updateMatrixWorld(true);
    let wy = 0, wp = 0;
    if (aimWorld) {
      tmp.copy(aimWorld); H.worldToLocal(tmp).sub(H.worldToLocal(wpos(B.Spine2)));
      wy = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -(ST.aimYaw ?? CREW.aimYaw), ST.aimYaw ?? CREW.aimYaw);
      wp = THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -CREW.aimDown, CREW.aimUp);
    }
    const ka = 1 - Math.exp(-12 * dt); aimY += (wy - aimY) * ka; aimP += (wp - aimP) * ka;
    const phi = -D(Pz.twist) + aimY;                                    // the body turns; the gun keeps pointing at the aim
    H.getWorldQuaternion(hq); const up = up0.clone().applyQuaternion(hq);
    // his note (b59): running forward he RAN SIDEWAYS -- the side-on turn came from the hips, so the legs turned too. Now: moving
    // (walk / run) = the turn lives in the SPINE (legs keep running the way he goes); standing = half of it from the hips (a planted
    // gunner stance), eased between
    const moving = anim.role === 'walk' || anim.role === 'run' || anim.role === 'air';   // b86: in the air the turn lives in the spine too (legs keep the air pose)
    hipShare += ((moving ? 0 : CREW.hipShare) - hipShare) * (1 - Math.exp(-6 * dt));
    twist(['Hips'], Q().setFromAxisAngle(up, phi * hipShare));
    twist(['Spine', 'Spine1', 'Spine2'], Q().setFromAxisAngle(up, phi * (1 - hipShare) / 3));
    twist(['Neck', 'Head'], Q().setFromAxisAngle(up, -phi * Pz.head / 2));
    H.updateMatrixWorld(true);
    const ls = H.worldToLocal(wpos(B.LeftArm)), rs = H.worldToLocal(wpos(B.RightArm)), M = ls.clone().add(rs).multiplyScalar(0.5);
    const tf = v => v.applyAxisAngle(up0, phi);                        // torso frame -> his (holder) frame
    pivot.position.copy(M).add(tf(V().set(Pz.gx, Pz.gy, Pz.gz)));
    pivot.quaternion.setFromEuler(new THREE.Euler(-D(Pz.pitch) - aimP, D(Pz.yaw) + aimY, D(Pz.roll), 'YXZ'));
    gun.g.scale.setScalar((self.baseScale ?? CREW.gunScale) * Pz.scale);
    pivot.updateMatrixWorld(true);
    const a0 = gun.grips.right.getWorldPosition(V()), wq = pivot.getWorldQuaternion(Q());
    const ax = V().set(0, 0, 1).applyQuaternion(wq), upg = V().set(0, 1, 0).applyQuaternion(wq);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, a0, H.localToWorld(rs.clone().add(tf(V().set(-Pz.rOut, Pz.rUp, -0.2)))));
    const lt = a0.clone().addScaledVector(ax, Pz.lSlide).addScaledVector(upg, Pz.lUp);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, lt, H.localToWorld(ls.clone().add(tf(V().set(Pz.lOut, Pz.lUp2, 0.1)))));
    if (blend) {   // b86: part way into / out of the air split -> ease from the hand-ride pose to the hold
      SPLIT_BONES.forEach((k, i) => B[k].quaternion.slerpQuaternions(_snap[i], B[k].quaternion, airK));
      pivot.position.lerpVectors(_rp, pivot.position, airK); pivot.quaternion.slerpQuaternions(_rq, pivot.quaternion, airK);
      H.updateMatrixWorld(true);
    }
  }
  /** apply a world rotation `r` to each named bone (additive, after the clip) */
  const twist = (names, r) => { for (const k of names) { const b = B[k]; if (!b) continue; b.getWorldQuaternion(sq); const w = r.clone().multiply(sq); b.parent.getWorldQuaternion(sq).invert(); b.quaternion.copy(sq.multiply(w)); b.updateMatrixWorld(true); } };
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
      self.baseScale = next.g.scale.x; next.g.scale.multiplyScalar(CREW.handGunScale); pivot.remove(gun.g); gun = next; pivot.add(gun.g); self.pose = null;
    },
    setIdle(r) { if (!self.armed && UNARMED[r]) r = UNARMED[r]; idleRole = r; if (!firing && !self.busy) anim.play(r); },
    /** b75: armed = holding a gun (the posed hold); unarmed / grenade = his own arms from relaxed clips, the gun hidden */
    armed: true,
    /** b86: aiming / firing (onfoot.js) -- in the 'air' role it splits the body: air clip on the legs, the gun hold up top */
    airAim: false,
    setArmed(on) { if (self.armed === !!on) return; self.armed = !!on; pivot.visible = self.armed; const base = Object.keys(UNARMED).find(k => UNARMED[k] === idleRole) || idleRole; self.setIdle(base); },
    /** a one-shot clip (get up...) that owns the body until it ends; arms leave the gun meanwhile */
    playOnce(r, speed = 1) { self.busy = true; self.freeArms = true; anim.play(r, 0.12, { once: true, speed }); },
    endOnce() { self.busy = false; self.freeArms = false; anim.play(idleRole, 0.2); },
    setFiring(on) { if (on === firing) return; firing = on; anim.play(on ? 'fire' : idleRole, 0.15); },
    kick() { kick = gun.def?.kick ?? CREW.recoil; flashT = 0.045; gun.flash.rotation.z = Math.random() * 3; },
    aimAt(world) { aimWorld = world ? (aimWorld || V()).copy(world) : null; },
    update(dt, t) {
      // every bone back to its rest pose first (b61, his: "his upper torso is just rotating in a circle"): the hold twists the spine
      // each frame, and a bone the clip doesn't key kept last frame's twist -> it spun. Reset, then the clip, then the layers.
      for (const k in B) { const b = B[k]; if (b.userData.bind) b.quaternion.copy(b.userData.bind); }
      { const want = anim.role === 'air' && self.airAim && self.armed && !self.freeArms && POSED ? 1 : 0;   // b86 AIR SPLIT
        airK += (want - airK) * (1 - Math.exp(-20 * dt)); if (airK < 1e-3 && !want) airK = 0;
        const s = airK * 0.995; upperAct?.setEffectiveWeight(s / (1 - s)); }
      anim.update(dt);
      spreadArms(B, H, fit.spread * CREW.handSpread);
      // seated: he swivels on the seat toward the aim (the spine twist does the rest)
      if (ST.swivel && aimWorld && H.parent) {
        if (baseYaw === null) baseYaw = H.rotation.y;
        tmp.copy(aimWorld); H.parent.worldToLocal(tmp).sub(H.position);
        let yp = Math.atan2(tmp.x, tmp.z) - baseYaw; yp = Math.atan2(Math.sin(yp), Math.cos(yp));
        swiv += (THREE.MathUtils.clamp(yp, -ST.swivel, ST.swivel) * 0.8 - swiv) * (1 - Math.exp(-5 * dt));
        H.rotation.y = baseYaw + swiv;
      }
      H.updateMatrixWorld(true);
      if (GUNNER) { if (!self.armed) { /* unarmed: the clip's own arms */ } else if (POSED) heldPose(dt); else gunnerPose(dt); kick *= Math.exp(-18 * dt); gun.g.position.set(0, 0, -kick); gun.g.rotation.x = -kick * 1.4; flashT -= dt; gun.flash.visible = flashT > 0; gun.firing = firing; gun.updBelt(t, dt); cig.ember.scale.setScalar(1 + Math.sin(t * 3) * 0.15); hat(dt); return; }
      // BLADED STANCE (his: "stubby thick arms -- he needs to turn his torso to the side to shoot a two-handed gun"): the torso
      // twists side-on (left shoulder forward) and the neck + head turn back toward the target; the gun is lined up AFTER this,
      // so it still points ahead, and the left hand can now reach the front grip
      if (!self.freeArms && CREW.blade) {
        H.getWorldQuaternion(hq); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
        twist(['Spine', 'Spine1', 'Spine2'], Q().setFromAxisAngle(up, -CREW.blade / 3));
        twist(['Neck', 'Head'], Q().setFromAxisAngle(up, CREW.blade * CREW.bladeHead / 2));
      }
      // RIGHT ELBOW OUT (pose check, Nov 24: in the rifle idle / fire his right elbow tucked behind his back, inside his body):
      // keep the hand exactly where the clip put it (the gun rides it) and swing the elbow out to his right side
      if (!self.freeArms && fit.rightOut) { const rh = H.worldToLocal(wpos(B.RightHand)); rh.x = Math.min(rh.x, -fit.rightHand); ik2(B.RightArm, B.RightForeArm, B.RightHand, H.localToWorld(rh), local(-fit.rightOut * 4, -0.2, 0.15)); }
      // line the gun up with his facing once the rifle pose is on (hand -> gun offset fixed after that)
      if (calib < 4 && RIFLE_ROLES.has(anim.role)) {   // only a RIFLE clip's hand pose defines how he holds it
        calib++;
        const hw = mount.getWorldQuaternion(Q()), want = H.getWorldQuaternion(Q()).multiply(Q().setFromEuler(new THREE.Euler(CREW.gunTilt, 0, 0)));
        pivot.quaternion.copy(hw.invert().multiply(want));
        if (mount === B.RightHand) { const palm = (B.RightHandMiddle1 ? wpos(B.RightHandMiddle1) : wpos(B.RightHand)).lerp(wpos(B.RightHand), 0.35); pivot.position.copy(B.RightHand.worldToLocal(palm)); }
      }
      // AIM: yaw + pitch toward the target, spread through Spine / Spine1 / Spine2 (additive, in his frame)
      let wy = 0, wp = 0;
      if (aimWorld && !self.freeArms) {
        tmp.copy(aimWorld); H.worldToLocal(tmp).sub(H.worldToLocal(wpos(B.Spine2)));
        wy = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -(ST.aimYaw ?? CREW.aimYaw), ST.aimYaw ?? CREW.aimYaw);
        wp = THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -CREW.aimDown, CREW.aimUp);
      }
      const ka = 1 - Math.exp(-12 * dt); aimY += (wy - aimY) * ka; aimP += (wp - aimP) * ka;
      if (Math.abs(aimY) + Math.abs(aimP) > 1e-4) {
        H.getWorldQuaternion(hq); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hq), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
        const r = Q().setFromAxisAngle(up, aimY / 3).multiply(Q().setFromAxisAngle(rt, -aimP / 3));
        twist(['Spine', 'Spine1', 'Spine2'], r);
      }
      // LEFT ARM KEPT OUTSIDE HIS BODY (b47, his: "his left arm is completely gone -- it's inside his body"; measured: in the rifle
      // clips his left elbow sits at his chest's centre-line). His arms are too short to reach a Gatling's front grip across that
      // belly, so the left hand follows the clip's motion but is pushed out to his side (never past fit.leftOut from his middle)
      if (!self.freeArms && fit.leftOut) {
        const lh = H.worldToLocal(wpos(B.LeftHand)), sh0 = H.worldToLocal(wpos(B.LeftArm));
        lh.x = Math.max(lh.x, fit.leftOut); lh.z = THREE.MathUtils.clamp(lh.z, -0.15, 0.35); lh.y = Math.min(lh.y, sh0.y - 0.15);
        ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, H.localToWorld(lh), local(2.6, 0.2, -0.3));   // elbow out to his side (pose check)
      }
      // the support hand on the gun's front grip (slides back along the gun to what his arm can reach)
      if (!self.freeArms && gun.grips?.left && CREW.leftGrip) {
        pivot.updateMatrixWorld(true);
        const sh = wpos(B.LeftArm), reach = (wpos(B.LeftForeArm).distanceTo(sh) + wpos(B.LeftHand).distanceTo(wpos(B.LeftForeArm))) * 0.97;
        const gl = gun.grips.left.getWorldPosition(V()), gr = gun.grips.right.getWorldPosition(V()), tgt = gl.clone();
        if (tgt.distanceTo(sh) > reach) { let lo = 0, hi = 1; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; tgt.lerpVectors(gr, gl, m); if (tgt.distanceTo(sh) > reach) hi = m; else lo = m; } tgt.lerpVectors(gr, gl, lo); }
        ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, tgt, local(1.2, -0.8, -0.2));
      }
      kick *= Math.exp(-18 * dt);
      gun.g.position.set(0, 0, -kick); gun.g.rotation.x = -kick * 1.4;
      flashT -= dt; gun.flash.visible = flashT > 0;
      gun.firing = firing; gun.updBelt(t, dt);
      cig.ember.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
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
      spreadArms(E.B, H, ARMFIT.elf.spread);   // her dance idles swung the arms through her body
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
