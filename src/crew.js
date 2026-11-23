// THE CREW: his models (models/santa.glb, models/elf_girl.glb -- Mixamo rigs, no clips yet) posed procedurally.
//   SANTA stands in the sleigh hip-firing a Rambo-size belt-fed machine gun. The gun is placed and aimed first;
//   both hands are then solved onto its grips with two-bone IK, so the fists stay on the gun through aim + recoil.
//   The cigar is parented to his Head bone. ELF #1 drives (sits up front, hands on the reins); ELF #2 sits on the
//   sack waving. Until the GLBs load, the primitive stand-in Santa + rail minigun stay in place.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { clone as skClone } from 'three/addons/SkeletonUtils.js';
import { Batch, T, BOX, CYL, BALL, bevBox } from './util.js';
import { Rope } from './rope.js';

export const CREW = {
  santaH: 2.0, elfH: 1.4,           // metres, standing
  floorY: 1.05,                       // he stands on a crate of presents (sleigh local)
  santaZ: -0.35,                      // where he stands
  gunScale: 1.3,
  aimYaw: 0.9, aimUp: 0.35, aimDown: 0.7,   // aim limits (rad) relative to the sleigh
  recoil: 0.11,                       // metres of kick per shot
};

const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/draco/'); loader.setDRACOLoader(draco);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

// ---- bone helpers --------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const wpos = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);
function bones(root) { const m = {}; root.traverse(o => { if (o.isBone) m[o.name.replace(/^mixamorig[_:]?/, '')] = o; }); return m; }

/** rotate `bone` so that its child's world position lies along the world direction to `target` */
function aimBone(bone, child, target) {
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
function ik2(upper, lower, end, target, pole) {
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
function prep(gltfScene, height) {
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
function buildGun() {
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

// ---- the crew ----------------------------------------------------------------------------------------
export async function loadCrew(rig, scene) {
  const [santaG, elfG] = await Promise.all([load('./models/santa.glb'), load('./models/elf_girl.glb')]);
  const sl = rig.sleigh.g;

  // SANTA
  const santa = prep(santaG.scene, CREW.santaH);
  santa.holder.position.set(0, CREW.floorY, CREW.santaZ);
  sl.add(santa.holder);
  const SB = santa.B;
  // legs: a wide, planted stance
  sl.updateMatrixWorld(true);
  const local = (x, y, z) => santa.holder.localToWorld(new THREE.Vector3(x, y, z));
  for (const [up, lo, ft, sx] of [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 1], ['RightUpLeg', 'RightLeg', 'RightFoot', -1]]) {
    const hp = santa.holder.worldToLocal(wpos(SB[up]));
    ik2(SB[up], SB[lo], SB[ft], local(hp.x + sx * 0.22, 0.12, hp.z + (sx > 0 ? 0.18 : -0.12)), local(hp.x + sx * 0.4, hp.y * 0.5, 1.5));
  }
  for (const k of [...Object.keys(SB)]) SB[k].userData.bind = SB[k].quaternion.clone();   // stance becomes the rest pose
  // the cigar, from the Head bone
  const cig = buildCigar();
  {
    santa.holder.updateMatrixWorld(true);
    const head = SB.Head, hp = wpos(head), top = wpos(SB.HeadTop_End), hh = top.y - hp.y;
    const want = local(0, 0, 0).set(0, 0, 0); // placeholder
    const hl = santa.holder.worldToLocal(hp.clone());
    const mouth = local(hl.x - 0.06, hl.y + hh * 0.22, hl.z + hh * 0.62);
    const q = new THREE.Quaternion(); santa.holder.getWorldQuaternion(q);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, -0.45, 0)));   // angled down + out of the side of the beard
    head.add(cig.c);
    cig.c.position.copy(head.worldToLocal(mouth));
    const hq = new THREE.Quaternion(); head.getWorldQuaternion(hq);
    cig.c.quaternion.copy(hq.invert().multiply(q));
    cig.c.scale.setScalar(1 / head.getWorldScale(new THREE.Vector3()).x);
    void want;
  }

  // THE GUN, held at the right hip, Rambo-style
  const gun = buildGun();
  const gunPivot = new THREE.Group(); santa.holder.add(gunPivot);
  const hipL = santa.holder.worldToLocal(wpos(SB.RightUpLeg));
  const chestL = santa.holder.worldToLocal(wpos(SB.Spine2));
  gunPivot.position.set(hipL.x - 0.12, hipL.y + (chestL.y - hipL.y) * 0.55, hipL.z + 0.3);
  gun.g.scale.setScalar(CREW.gunScale); gunPivot.add(gun.g);

  // the present crate he stands on
  const crate = new THREE.Mesh(bevBox(1.3, CREW.floorY - 0.65, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: '#2f6a40', roughness: 0.7 }));
  crate.position.set(0, 0.65 + (CREW.floorY - 0.65) / 2, CREW.santaZ); crate.castShadow = true; sl.add(crate);
  // the driver's bench up front
  const bench = new THREE.Mesh(bevBox(1.5, 0.3, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: '#7a1a20', roughness: 0.7 }));
  bench.position.set(0, 1.55, 1.15); bench.castShadow = true; sl.add(bench);

  // ELVES (one model, two copies)
  const elfFor = () => prep(skClone(elfG.scene), CREW.elfH);
  const driver = elfFor(), sackElf = elfFor();
  driver.holder.position.set(0.1, 1.72, 1.15); sl.add(driver.holder);
  sackElf.holder.position.set(0.2, 2.5, -1.5); sackElf.holder.rotation.y = 0.35; sl.add(sackElf.holder);
  const sit = (E, legFwd = 0.45) => {
    const B = E.B, h = E.holder;
    E.holder.updateMatrixWorld(true);
    const L = (x, y, z) => h.localToWorld(new THREE.Vector3(x, y, z));
    // lower the body so the hips sit on the holder origin
    const hipY = h.worldToLocal(wpos(B.Hips)).y;
    E.holder.children[0].position.y -= hipY;
    E.holder.updateMatrixWorld(true);
    for (const [up, lo, ft, sx] of [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 1], ['RightUpLeg', 'RightLeg', 'RightFoot', -1]]) {
      const hp = h.worldToLocal(wpos(B[up]));
      aimBone(B[up], B[lo], L(hp.x + sx * 0.06, hp.y - 0.05, hp.z + legFwd));
      const kp = h.worldToLocal(wpos(B[lo]));
      aimBone(B[lo], B[ft], L(kp.x, kp.y - 0.5, kp.z + 0.06));
    }
    storeBind(B);
  };
  sit(driver); sit(sackElf, 0.4);

  // reins: from the driver's hands to the rear reindeer
  const handR = new THREE.Vector3(), handL = new THREE.Vector3();
  const reins = [new Rope(scene, handL, rig.deer[2].hook, { segs: 10, radius: 0.025, color: '#8a2a20' }), new Rope(scene, handR, rig.deer[3].hook, { segs: 10, radius: 0.025, color: '#8a2a20' })];

  // retire the stand-ins
  rig.santa.g.visible = false;
  rig.sleigh.mount.visible = false;

  const aimQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tgt = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let kick = 0, flashT = 0;
  const crew = {
    muzzle: gun.muzzle, eject: gun.eject, cigarTip: cig.tip,
    rate: 0.075,
    kick() { kick = CREW.recoil; flashT = 0.045; gun.flash.rotation.z = Math.random() * 3; },
    /** aim at a world point (clamped to the arc in front of the sleigh) */
    aim(world) {
      tgt.copy(world); gunPivot.parent.worldToLocal(tgt).sub(gunPivot.position);
      let yaw = Math.atan2(tgt.x, tgt.z), pitch = Math.atan2(tgt.y, Math.hypot(tgt.x, tgt.z));
      yaw = THREE.MathUtils.clamp(yaw, -CREW.aimYaw, CREW.aimYaw); pitch = THREE.MathUtils.clamp(pitch, -CREW.aimDown, CREW.aimUp);
      aimQ.setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
      gunPivot.quaternion.slerp(aimQ, 0.35);
    },
    update(dt, t) {
      kick *= Math.exp(-18 * dt);
      gun.g.position.set(0, 0, -kick);
      gun.g.rotation.x = -kick * 1.4;
      flashT -= dt; gun.flash.visible = flashT > 0;
      gun.updBelt(t);
      cig.ember.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      // santa: rest pose + a breathing sway, then both fists onto the grips
      resetBind(SB);
      SB.Spine1.quaternion.multiply(_q.setFromAxisAngle(up, Math.sin(t * 0.9) * 0.04));
      santa.holder.updateMatrixWorld(true);
      const pR = gun.grips.right.getWorldPosition(new THREE.Vector3()), pL = gun.grips.left.getWorldPosition(new THREE.Vector3());
      ik2(SB.RightArm, SB.RightForeArm, SB.RightHand, pR, santa.holder.localToWorld(new THREE.Vector3(-1.2, 0.2, -0.6)));
      ik2(SB.LeftArm, SB.LeftForeArm, SB.LeftHand, pL, santa.holder.localToWorld(new THREE.Vector3(1.0, -0.6, 0.2)));
      // head looks along the gun a little, bobs on recoil
      SB.Head.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), kick * 0.8 + Math.sin(t * 1.3) * 0.03));
      // driver: hands out on the reins with a little bob
      resetBind(driver.B); resetBind(sackElf.B);
      driver.holder.updateMatrixWorld(true);
      const bob = Math.sin(t * 6) * 0.03;
      const DR = (x, y, z) => driver.holder.localToWorld(new THREE.Vector3(x, y, z));
      ik2(driver.B.RightArm, driver.B.RightForeArm, driver.B.RightHand, DR(-0.18, 0.55 + bob, 0.42), DR(-0.8, 0, -0.3));
      ik2(driver.B.LeftArm, driver.B.LeftForeArm, driver.B.LeftHand, DR(0.18, 0.55 - bob, 0.42), DR(0.8, 0, -0.3));
      driver.B.RightHand.getWorldPosition(handR); driver.B.LeftHand.getWorldPosition(handL);
      for (const r of reins) r.update(dt);
      // sack elf: waves with her right hand, left hand on the sack
      sackElf.holder.updateMatrixWorld(true);
      const SE = (x, y, z) => sackElf.holder.localToWorld(new THREE.Vector3(x, y, z));
      ik2(sackElf.B.RightArm, sackElf.B.RightForeArm, sackElf.B.RightHand, SE(-0.32 + Math.sin(t * 7) * 0.1, 0.95, 0.15), SE(-0.6, 0.2, -0.4));
      ik2(sackElf.B.LeftArm, sackElf.B.LeftForeArm, sackElf.B.LeftHand, SE(0.3, 0.05, 0.05), SE(0.6, 0.4, -0.3));
      void tmpM;
    },
  };
  crew.debug = { driver, sackElf, santa };
  return crew;
}
