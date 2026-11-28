// Copied from colinwillow/retarget-anims src/retarget.js (layer 1: rotation transfer from rest). Keep in sync by hand.
// retarget-anims: carry an animation clip from one Mixamo-named skeleton onto another.
//
// LAYER 1 (this file, working): ROTATION TRANSFER FROM REST. Per target bone, the source bone's WORLD rotation relative to
// its own rest is applied to the target bone's rest:
//     Wt(t) = Ws(t) * Ws_rest^-1 * Wt_rest
// then made local down the TARGET's own chain. So it does not care how either export orients its bones (Blender and
// Auto-Rig Pro re-orient them on import, which is why copying local rotations bone-for-bone fails), nor whether one
// rig rests in a T-pose and the other in an A-pose -- EXCEPT THE ARMS (b92, measured): the delta is applied to the target's OWN rest,
// so a rest-pose difference rides along for the whole clip. The Y Bot rests in a T-pose (upper arm 0 deg below horizontal); his rigs
// rest in A-poses: brown elf 49 deg, Santas 17, red elf / snowman 8 -> every clip put the brown elf's arms ~49 deg INTO her body
// (Happy_Idle: Y Bot upper arm 6..27 deg out from straight down, brown -29..-48). REST ALIGNMENT: for each ALIGN bone the target's
// rest is first swung so the bone points (bone -> child) the way the source's rest does, then the delta transfer runs on that.
// Legs / spine / feet keep their own rest (planted feet, his stance). Hips travel is scaled by hip height. Bones the source lacks
// (fingers, `root`) keep their rest. First used in zap m919 (Clancy's stretch onto the CEO).
//
// LAYERS STILL TO BUILD (see README): foot IK (plant where the source planted), arm clearance (the "penguin" fix),
// per-character offset layer (his sliders), and the library / converter / tuning page around it.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/SkeletonUtils.js';

export const HIPS = 'mixamorig_Hips';
// REST ALIGNMENT (b92): bone -> the child that gives its direction. Arms only: that is where T-pose vs A-pose differs.
export const ALIGN = {};
for (const s of ['Left', 'Right']) Object.assign(ALIGN, { [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand', [s + 'Hand']: s + 'HandMiddle1' });

// src / dst: scenes (or any Object3D) holding a skeleton AT REST -- they are cloned here, never posed in place.
// Returns a THREE.AnimationClip whose tracks name the DESTINATION's bones.
export function retargetClip(srcRoot, clip, dstRoot, opts = {}) {
  const fps = opts.fps || 30, hipsName = opts.hips || HIPS;
  const Q = () => new THREE.Quaternion(), V = () => new THREE.Vector3();
  const src = skeletonClone(srcRoot), dst = skeletonClone(dstRoot);
  src.updateMatrixWorld(true); dst.updateMatrixWorld(true);
  const sb = {}, db = [];
  src.traverse(o => { if (o.isBone || /^mixamorig/.test(o.name)) sb[o.name] = o; });   // animation-only GLBs load as plain nodes, not bones
  dst.traverse(o => { if (o.isBone) db.push(o); });
  const restS = {}, restT = db.map(b => b.getWorldQuaternion(Q())), restL = db.map(b => b.quaternion.clone());
  for (const n in sb) restS[n] = sb[n].getWorldQuaternion(Q()).invert();
  const align = opts.align ?? ALIGN, dn = {}; db.forEach(b => { dn[b.name] = b; });
  db.forEach((b, i) => {   // swing the target's rest onto the source's rest direction (world), keeping its own twist via the minimal swing
    const k = b.name.replace(/^mixamorig_?/, ''), c = align[k] && 'mixamorig_' + align[k];
    if (!c || !sb[b.name] || !sb[c] || !dn[c]) return;
    const dT = dn[c].getWorldPosition(V()).sub(b.getWorldPosition(V())), dS = sb[c].getWorldPosition(V()).sub(sb[b.name].getWorldPosition(V()));
    if (dT.lengthSq() < 1e-12 || dS.lengthSq() < 1e-12) return;
    restT[i].premultiply(Q().setFromUnitVectors(dT.normalize(), dS.normalize()));
  });
  const hipS = sb[hipsName], hi = db.findIndex(b => b.name === hipsName), hipT = db[hi];
  if (!hipS || !hipT) throw new Error('retargetClip: no ' + hipsName + ' on ' + (hipS ? 'the target' : 'the source'));
  const hS0 = hipS.getWorldPosition(V()), hT0 = hipT.getWorldPosition(V()), k = hT0.y / (hS0.y || 1);
  const parInv = hipT.parent.matrixWorld.clone().invert();
  const mixer = new THREE.AnimationMixer(src); mixer.clipAction(clip).play();
  const nf = Math.max(2, Math.round(clip.duration * fps) + 1), times = new Float32Array(nf);
  const use = db.map(b => !!sb[b.name] && b.name !== 'root');
  const qv = db.map(() => new Float32Array(nf * 4)), pv = new Float32Array(nf * 3);
  const W = new Map(), ws = Q(), loc = Q();
  for (let f = 0; f < nf; f++) {
    const t = Math.min(clip.duration, f / fps); times[f] = t; mixer.setTime(t); src.updateMatrixWorld(true);
    W.clear();
    db.forEach((b, i) => {
      const par = b.parent, P = par && W.has(par) ? W.get(par) : (par ? par.getWorldQuaternion(Q()) : Q());
      const w = use[i] ? sb[b.name].getWorldQuaternion(ws).clone().multiply(restS[b.name]).multiply(restT[i]) : P.clone().multiply(restL[i]);
      W.set(b, w); loc.copy(P).invert().multiply(w); qv[i].set([loc.x, loc.y, loc.z, loc.w], f * 4);
    });
    const hp = hipS.getWorldPosition(V()).sub(hS0).multiplyScalar(k).add(hT0).applyMatrix4(parInv);
    pv.set([hp.x, hp.y, hp.z], f * 3);
  }
  const tracks = [];
  db.forEach((b, i) => { if (use[i]) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qv[i])); });
  tracks.push(new THREE.VectorKeyframeTrack(hipsName + '.position', times, pv));
  return new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);
}
