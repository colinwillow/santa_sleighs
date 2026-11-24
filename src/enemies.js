// SNOWMAN MONSTERS (his rig models/enemies/snowman_monster_rig.glb: Auto-Rig Pro -> Mixamo names, hand mounts). Big brutes
// (~2.6 m) standing on clear spots just off the village road loop. Presence + reaction only, no attack yet: a menacing idle,
// they turn to face Santa inside SNOW.face m (a roar when he first comes close), flinch when shot, die in a snow burst after
// SNOW.hp Gatling hits and come back after SNOW.respawn s. One skinned mesh each; clips are retargeted ONCE and shared.
// b69: shot parts come OFF (SNOW.parts: arms, legs; head / chest / belly are lethal) as rigid chunks baked from his pose, and
// death BLOWS HIM APART (every part a chunk). No arms = no swipe / punch / throw (he roars + body-slams); no right arm = no throw.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { clone as skClone } from 'three/addons/SkeletonUtils.js';
import { prep, spreadArms, ik2, ARMFIT } from './characters.js';
import { CLIPS } from './anim.js';
import { retargetClip } from './retarget.js';

export const SNOW = {
  url: './models/enemies/snowman_monster_rig.glb',
  height: 2.6, count: 4,
  extra: 4,               // b56: hidden pool spawn() draws from (taken-over houses burst them out); they never respawn
  hp: 25,                 // Gatling hits (a rifle slug = SNOW.slug, a rocket blast kills)
  slug: 5,
  face: 25,               // m: turn to face Santa inside this
  // b52 (his: "rig him up with some of the mutant animations"): ON FOOT Santa inside `aggro` m gets chased -- RUN while farther
  // than `runAt`, WALK in, stop at `reach` and SWIPE / PUNCH (animation only, no damage yet); a JUMP ATTACK now and then from
  // `jumpMin..jumpMax` m (the clip's own forward travel moves him); FLEX / ROAR now and then while he watches; back home past `leash`.
  bright: 1.12, glow: 0.32,   // b67: snow colour boost + self-glow from his texture (he read grey at dusk)
  aggro: 25, runAt: 12, reach: 3.0, leash: 45, jumpMin: 5, jumpMax: 8.5, jumpCd: 9,
  walkRate: 1.1, runRate: 1.0,   // clip timeScale; ground speed = the clip's own stride speed x this (measured at load, no skating)
  tauntCd: [7, 14],       // s between flex / roar taunts while Santa is near but not chased (sleigh overhead, or out of leash)
  attackGap: 0.35,        // s of idle between swings
  contact: { swipe: 0.42, punch: 0.38, jump: 0.62 },   // fraction of each attack clip where the blow lands
  turn: 3,                // rad/s-ish smoothing of the turn
  roarCd: 14,             // s between roars
  respawn: 20,            // s dead before he's back
  stun: 2.2,              // b56: s a spawned (stunned) snowman takes to get up off his back (the Getting_Up clip, sped to fit)
  off: 8.2,               // m off the road centre line (just past the sidewalk)
  hide: 220,              // m from the camera: skip animating + hide
  // b54 (his: "he picks up snow and throws fairly hefty soccer-ball-size snowballs at you... from the ground up at you"): SCOOP
  // (Mixamo Pick Up Item, the right hand to the snow) -> overhand HEAVE (Mixamo Throw). The ball appears in his right hand at the
  // scoop's lowest hand point and leaves it at the throw's peak forward hand speed (both measured from the clips at load).
  fit: { scoop: { spread: 0.65 }, throw: { spread: 0.65 } },   // per-role arm fit over ARMFIT.snowman (snowcheck: 0 flags at .65)
  ball: {
    r: 0.3,               // m (a ~0.6 m soccer-ball-size lump)
    scoopRate: 0.9, throwRate: 1.1,
    footMin: 6, footMax: 30,   // m: on-foot Santa beyond swipe reach, inside this
    skyMax: 45, skyAbove: 3,   // m: Santa in the sleigh within this and at least this far above him
    cd: [5, 8],           // s between one snowman's throws
    chance: 0.7,          // per s, once allowed
    g: 14,                // m/s^2 (a hefty ball)
    speedFoot: 22, speedSky: 28, speedMax: 34,   // m/s: the lob's flight time is the shortest one under the wanted speed
    splash: 2.2, direct: 1.0, // m from an on-foot Santa: knocked 'small' / 'big'
    sleighR: 2.6,         // m: a hit on the sleigh
    shootR: 0.75,         // m: bullets pop it inside this
    life: 6,
  },
  // b69 DISMEMBERMENT (his: "I want to be able to blow pieces of the snowman off"): his one skinned mesh is split at load into
  // REGIONS by each triangle's dominant bone (index ranges sorted by region, one draw still). A region's hp runs out -> its range
  // collapses and its triangles are BAKED in the current skinned pose into a rigid chunk that flies, bounces and settles in the snow.
  // a..b(..mid) = the bones the hit point is measured against (minus r, m); cut = the joint the wound clumps sit on. lethal = he dies.
  parts: {
    head:  { hp: 7,  r: 0.42, a: 'Neck', b: 'HeadTop_End', cut: 'Neck', lethal: true },
    armL:  { hp: 6,  r: 0.30, a: 'LeftArm', mid: 'LeftForeArm', b: 'LeftHand', cut: 'LeftArm' },
    armR:  { hp: 6,  r: 0.30, a: 'RightArm', mid: 'RightForeArm', b: 'RightHand', cut: 'RightArm' },
    chest: { hp: 16, r: 0.75, a: 'Spine2', b: 'Neck', lethal: true },
    belly: { hp: 20, r: 0.90, a: 'Hips', b: 'Spine1', lethal: true },
    legL:  { hp: 9,  r: 0.36, a: 'LeftUpLeg', mid: 'LeftLeg', b: 'LeftFoot', cut: 'LeftUpLeg' },
    legR:  { hp: 9,  r: 0.36, a: 'RightUpLeg', mid: 'RightLeg', b: 'RightFoot', cut: 'RightUpLeg' },
  },
  chunkLife: 8,           // s a chunk lies in the snow before it sinks away
  chunkPool: 4,           // pooled chunk meshes per region (oldest reused)
  legSlow: 0.6,           // ground speed x this per lost leg (both legs gone = he dies)
};
const PARTS = Object.entries(SNOW.parts).map(([name, p]) => ({ name, ...p })), NREG = PARTS.length;
/** which region a bone's weight belongs to (index into PARTS) */
function regionOf(name) {
  const n = name.replace(/^mixamorig[_:]?/, ''), I = k => PARTS.findIndex(p => p.name === k);
  if (/^(Neck|Head)/.test(n)) return I('head');
  if (/^Left(Arm|ForeArm|Hand)/.test(n) || /^(weapon_root_left|gun_tip_left|weapon_tip)$/.test(n)) return I('armL');
  if (/^Right(Arm|ForeArm|Hand)/.test(n) || /^(weapon_root_right|gun_tip_right|weapon_tip_2)$/.test(n)) return I('armR');
  if (/^(Spine2|LeftShoulder|RightShoulder)$/.test(n)) return I('chest');
  if (/^Left(UpLeg|Leg|Foot|Toe)/.test(n)) return I('legL');
  if (/^Right(UpLeg|Leg|Foot|Toe)/.test(n)) return I('legR');
  return I('belly');
}
/** sort his triangles by region (dominant summed weight of its 3 vertices) + each region's compact chunk data */
function prepRegions(src) {
  const g = src.geometry, idx = g.index.array, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const boneReg = src.skeleton.bones.map(b => regionOf(b.name)), tris = PARTS.map(() => []), acc = new Float32Array(NREG);
  for (let t = 0; t < idx.length; t += 3) {
    acc.fill(0);
    for (let c = 0; c < 3; c++) { const v = idx[t + c]; for (let k = 0; k < 4; k++) acc[boneReg[si.getComponent(v, k)]] += sw.getComponent(v, k); }
    let best = 0; for (let r = 1; r < NREG; r++) if (acc[r] > acc[best]) best = r;
    tris[best].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const sorted = new idx.constructor(idx.length); let o = 0;
  const regions = tris.map(T => {
    const start = o; sorted.set(T, o); o += T.length;
    const map = new Map(), verts = [], loc = new Uint16Array(T.length);
    T.forEach((v, i) => { let j = map.get(v); if (j === undefined) { j = verts.length; map.set(v, j); verts.push(v); } loc[i] = j; });
    const n = verts.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    verts.forEach((v, j) => {
      P[j * 3] = pos.getX(v); P[j * 3 + 1] = pos.getY(v); P[j * 3 + 2] = pos.getZ(v);
      if (nor) { N[j * 3] = nor.getX(v); N[j * 3 + 1] = nor.getY(v); N[j * 3 + 2] = nor.getZ(v); }
      if (uv) { UV[j * 2] = uv.getX(v); UV[j * 2 + 1] = uv.getY(v); }
      for (let k = 0; k < 4; k++) { SI[j * 4 + k] = si.getComponent(v, k); SW[j * 4 + k] = sw.getComponent(v, k); }
    });
    return { start, count: T.length, n, P, N, SI, SW, uv: new THREE.BufferAttribute(UV, 2), index: new THREE.BufferAttribute(loc, 1) };
  });
  console.log('snowman regions', PARTS.map((p, r) => p.name + ' ' + regions[r].count / 3 + ' tris').join(', '));
  return { sorted, regions };
}
/** ARM FIT (his: "his body is very wide, the Mixamo arms swing into it"), run AFTER mixer.update every frame, all in his CHEST
 *  frame (shoulder line + spine, so a punch's body twist carries it): open both upper arms by fit.spread rad round the chest's
 *  forward axis; then (fit.elbow > 0) a two-bone IK keeps each hand where the clip put it -- pushed out to at least fit.hand m
 *  from the chest centre when it is BEHIND the chest front (a hand out in front, e.g. a swipe, may cross) -- with the elbow bent
 *  toward a pole fit.elbow m out to that side (a bit down + back). tools/pose/snowcheck.html measures exactly this function. */
const _fX = new THREE.Vector3(), _fU = new THREE.Vector3(), _fF = new THREE.Vector3(), _fc = new THREE.Vector3(), _fp = new THREE.Vector3(), _fh = new THREE.Vector3(), _fo = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion();
export function fitSnowArms(B, H, fit = ARMFIT.snowman) {
  if (!fit) return;
  H.updateMatrixWorld(true);
  B.LeftShoulder.getWorldPosition(_fX); B.RightShoulder.getWorldPosition(_fo); _fX.sub(_fo).normalize();            // +X = his left
  B.Neck.getWorldPosition(_fU); B.Spine1.getWorldPosition(_fc); _fU.sub(_fc); _fU.addScaledVector(_fX, -_fU.dot(_fX)).normalize();
  _fF.crossVectors(_fX, _fU);                                                                                       // forward
  B.Spine2.getWorldPosition(_fc);
  for (const [s, a] of [[1, B.LeftArm], [-1, B.RightArm]]) {
    if (!a || !fit.spread) continue;
    a.getWorldQuaternion(_fq2); _fq.setFromAxisAngle(_fF, s * fit.spread).multiply(_fq2);
    a.parent.getWorldQuaternion(_fq2).invert(); a.quaternion.copy(_fq2.multiply(_fq)); a.updateMatrixWorld(true);
  }
  if (!fit.elbow) return;
  for (const [s, a, f, h] of [[1, B.LeftArm, B.LeftForeArm, B.LeftHand], [-1, B.RightArm, B.RightForeArm, B.RightHand]]) {
    if (!a || !f || !h) continue;
    h.getWorldPosition(_fh); _fo.subVectors(_fh, _fc);
    const x = _fo.dot(_fX) * s, z = _fo.dot(_fF);
    if (fit.hand && x < fit.hand && z < (fit.front ?? 0.4)) _fh.addScaledVector(_fX, s * (fit.hand - x));   // out of the belly, to its own side
    a.getWorldPosition(_fp); _fp.addScaledVector(_fX, s * fit.elbow).addScaledVector(_fU, -fit.elbow * 0.35).addScaledVector(_fF, -fit.elbow * 0.25);
    ik2(a, f, h, _fh, _fp);
  }
}

// the village road loop (a copy of village.js LOOP -- keep in sync); spots are picked along it
const _jv = new THREE.Vector3();

const LOOP = [[-50, -30], [-20, -46], [14, -36], [44, -52], [62, -22], [40, 4], [56, 30], [36, 54], [2, 40], [-24, 58], [-58, 38], [-42, 6]];

const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/draco/'); loader.setDRACOLoader(draco);
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

/** clear spots beside the road: away from houses (their front paths too) and from each other */
function pickSpots(world, groundH, n) {
  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const out = [], p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const u = (k / n + 0.07 + tries * 0.011) % 1;
      curve.getPointAt(u, p); curve.getTangentAt(u, t);
      for (const side of [1, -1]) {
        const x = p.x - t.z * side * SNOW.off, z = p.z + t.x * side * SNOW.off;
        if (world.colliders.some(c => c.r > 0 && Math.hypot(c.x - x, c.z - z) < Math.max(11, c.r + 4))) continue;
        if (out.some(o => Math.hypot(o.x - x, o.z - z) < 25)) continue;
        out.push({ x, z, y: groundH(x, z), ry: Math.atan2(-(x - p.x), -(z - p.z)) });   // facing the road
        tries = 99; break;
      }
    }
  }
  return out;
}

/** ray (o, unit d, len) vs a vertical capsule (a..b, radius r): distance along the ray or -1 (closest-approach test) */
const _w = new THREE.Vector3(), _u = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
function rayCapsule(o, d, len, a, b, r) {
  _u.subVectors(b, a); _w.subVectors(o, a);
  const A = 1, B = d.dot(_u), C = _u.dot(_u), D = d.dot(_w), E = _u.dot(_w), den = A * C - B * B;
  let s = den > 1e-6 ? (B * E - C * D) / den : 0, tt;
  s = THREE.MathUtils.clamp(s, 0, len);
  tt = THREE.MathUtils.clamp((E + s * B) / C, 0, 1);
  s = THREE.MathUtils.clamp(B * tt - D, 0, len);   // re-project onto the ray after clamping the segment
  _c1.copy(o).addScaledVector(d, s); _c2.copy(a).addScaledVector(_u, tt);
  const dist = _c1.distanceTo(_c2);
  if (dist > r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - dist * dist));
}

/**
 * makeSnowmen({ scene, world, groundH, puff(p, color, n, spread, life), onKill(p) }) -> { list, raycast, shoot, blast, update }
 * Loads in the background; until then every call is a no-op.
 */
export function makeSnowmen({ scene, world, groundH, puff = () => {}, onKill = () => {}, sfx = () => {}, onHitSanta = null, onHitSleigh = null }) {
  const list = [], clips = {}, gait = { walk: 1.8, run: 5 }, jumpPath = [], ballAt = { grab: 0.3, release: 0.38 };
  let ready = false, RG = null, chunkMat = null;
  /** stride speed of the in-place walk / run (2 x the planted foot's sweep a cycle) + the jump attack's forward path (holder m), then
   *  the jump's hips x/z are pinned to frame 0 so the HOLDER carries the travel (no snap back when the clip ends) */
  function measureClips(src) {
    const inst = skClone(src), P = prep(inst, SNOW.height), H = P.holder, mx = new THREE.AnimationMixer(inst), v = new THREE.Vector3();
    for (const [role, lo, hi] of [['walk', 0.8, 3], ['run', 2.5, 8]]) {
      if (!clips[role]) continue;
      const a = mx.clipAction(clips[role]); a.play(); let z0 = 1e9, z1 = -1e9;
      for (let k = 0; k <= 40; k++) { mx.setTime(clips[role].duration * k / 40); H.updateMatrixWorld(true); for (const f of [P.B.LeftFoot, P.B.RightFoot]) { H.worldToLocal(f.getWorldPosition(v)); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } }
      gait[role] = THREE.MathUtils.clamp(2 * (z1 - z0) / clips[role].duration, lo, hi); a.stop(); mx.setTime(0);
    }
    const jc = clips.jump, tr = jc?.tracks.find(t => /Hips\.position$/.test(t.name));
    if (tr) {
      const hips = P.B.Hips, par = hips.parent, n = tr.times.length; H.updateMatrixWorld(true);
      const p0 = H.worldToLocal(par.localToWorld(v.fromArray(tr.values, 0))).clone();
      for (let i = 0; i < n; i++) { const p = H.worldToLocal(par.localToWorld(v.fromArray(tr.values, i * 3))); jumpPath.push(tr.times[i], p.x - p0.x, p.z - p0.z); }
      for (let i = 1; i < n; i++) { tr.values[i * 3] = tr.values[0]; tr.values[i * 3 + 2] = tr.values[2]; }
    }
    // the SNOWBALL moments, from the clips themselves: grab = the scoop's lowest right hand, release = the throw's peak FORWARD
    // right-hand speed (holder frame, +z forward, the game's own arm fit applied)
    for (const [role, key] of [['scoop', 'grab'], ['throw', 'release']]) {
      const c = clips[role]; if (!c) continue;
      const a = mx.clipAction(c); a.play(); const N = 90, fit = { ...ARMFIT.snowman, ...(SNOW.fit[role] || {}) };
      let best = -1e9, bestF = ballAt[key], prev = null;
      for (let k = 0; k <= N; k++) {
        mx.setTime(c.duration * k / N); H.updateMatrixWorld(true); fitSnowArms(P.B, H, fit); H.updateMatrixWorld(true);
        H.worldToLocal((P.B.weapon_root_right || P.B.RightHand).getWorldPosition(v));
        if (key === 'grab') { if (-v.y > best) { best = -v.y; bestF = k / N; } }
        else if (prev) { const sp = (v.z - prev.z) / (c.duration / N); if (sp > best) { best = sp; bestF = (k - 0.5) / N; } }
        prev = v.clone();
      }
      ballAt[key] = bestF; a.stop(); mx.setTime(0);
      console.log('snowball', key, 'at', bestF.toFixed(3), 'of', role, key === 'grab' ? 'hand y ' + (-best).toFixed(2) : 'fwd hand speed ' + best.toFixed(1) + ' m/s');
    }
    console.log('snowmen gait', gait, 'jump travel', jumpPath.length ? Math.hypot(jumpPath.at(-2), jumpPath.at(-1)).toFixed(2) : '-');
  }
  /** the jump's forward offset (holder-local x, z) at clip time t */
  function jumpAt(t, out) {
    let i = 0; while (i + 3 < jumpPath.length && jumpPath[i + 3] < t) i += 3;
    const t0 = jumpPath[i], t1 = jumpPath[i + 3] ?? t0, k = t1 > t0 ? THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1) : 0;
    return out.set(jumpPath[i + 1] + ((jumpPath[i + 4] ?? jumpPath[i + 1]) - jumpPath[i + 1]) * k, 0, jumpPath[i + 2] + ((jumpPath[i + 5] ?? jumpPath[i + 2]) - jumpPath[i + 2]) * k);
  }
  (async () => {
    const gltf = await load(SNOW.url);
    const roles = CLIPS.snowman;
    await Promise.all(Object.entries(roles).map(async ([role, stem]) => {
      const g = await load(`./models/anims/${stem}.glb`);
      clips[role] = retargetClip(g.scene, g.animations[0], gltf.scene, { name: role });
    }));
    measureClips(gltf.scene);
    // SNOW READS WHITE (b67, his: "the snowman's not as bright... supposed to be white like snow"): the matte Tripo material went grey
    // under the dusk light with nothing to reflect -- no metalness, a touch brighter, + a soft self-glow from his own texture (shared
    // by every clone, so it costs nothing)
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const fix = m => { m.metalness = 0; m.roughness = Math.min(m.roughness ?? 0.9, 0.85); if (m.color) m.color.multiplyScalar(SNOW.bright);
        if (m.emissive) { m.emissive.setRGB(1, 1, 1); m.emissiveMap = m.map || null; m.emissiveIntensity = SNOW.glow; } m.needsUpdate = true; };
      Array.isArray(o.material) ? o.material.forEach(fix) : fix(o.material);
    });
    { let src = null; gltf.scene.traverse(o => { if (o.isSkinnedMesh && !src) src = o; }); RG = prepRegions(src);
      chunkMat = src.material.clone(); chunkMat.side = THREE.DoubleSide; }   // b69: the chunk's open side shows its inside
    const makeOne = (s, extra = false) => {
      const inst = skClone(gltf.scene);
      const P = prep(inst, SNOW.height), H = P.holder;
      H.position.set(s.x, s.y, s.z); H.rotation.y = s.ry; scene.add(H);
      H.updateMatrixWorld(true);
      let rad = 0; const wsc = new THREE.Vector3();
      inst.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; o.getWorldScale(wsc); rad = Math.max(rad, (bb.max.x - bb.min.x) * wsc.x, (bb.max.z - bb.min.z) * wsc.z); } });
      const r = THREE.MathUtils.clamp(rad * 0.5 * 0.8, 0.55, 1.3);   // hit capsule radius (m), from the bind-pose bounds
      // b69: his own index buffer (sorted by region; the vertex attributes stay shared with every clone = one GPU copy)
      let mesh = null; inst.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
      { const g0 = mesh.geometry, g = new THREE.BufferGeometry(); for (const k in g0.attributes) g.setAttribute(k, g0.attributes[k]);
        g.setIndex(new THREE.BufferAttribute(RG.sorted.slice(), 1)); g.boundingBox = g0.boundingBox; g.boundingSphere = g0.boundingSphere; mesh.geometry = g; }
      const mixer = new THREE.AnimationMixer(inst), act = {};
      for (const k in clips) act[k] = mixer.clipAction(clips[k]);
      const e = { H, B: P.B, mixer, act, home: s, r, hp: SNOW.hp, dead: false, deadT: 0, hitT: 0, roarT: 0, near: false, cur: null, yaw: s.ry, pulse: 0,
        oneT: 0, gapT: 0, jumpCdT: 0, throwCdT: 3 + Math.random() * 4, ball: null, spr: ARMFIT.snowman.spread, fit: { ...ARMFIT.snowman }, tauntT: 4 + Math.random() * 6, swing: 0, jump0: new THREE.Vector3(),
        extra, free: extra, fly: null, mesh, reg: PARTS.map(p => ({ hp: p.hp, alive: true })), arms: 2, legs: 2, lastAt: null, lastDir: null, nod: 0 };
      e.play = (role, fade = 0.2, once = false, speed = 1) => {
        const a = act[role]; if (!a) return;
        a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.play();
        if (e.cur && e.cur !== a) e.cur.crossFadeTo(a, fade, false); else a.fadeIn(fade);
        e.cur = a; e.role = role;
      };
      mixer.setTime(Math.random() * 3);
      e.play('idle', 0);
      if (extra) H.visible = false;
      list.push(e);
    };
    for (const s of pickSpots(world, groundH, SNOW.count)) makeOne(s);
    // b56: a small pool of EXTRA snowmen (hidden) that spawn() brings in -- the ones waiting inside a taken-over house
    for (let k = 0; k < SNOW.extra; k++) makeOne({ x: 0, y: -50, z: 0, ry: 0 }, true);
    ready = true;
  })().catch(err => console.warn('snowmen', err));

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const capsule = e => { _a.copy(e.H.position); _a.y += e.r * 0.9; _b.copy(e.H.position); _b.y += SNOW.height - e.r * 0.8; };

  const _up = new THREE.Vector3(0, 1, 0), _zero = new THREE.Vector3();
  /** play a one-shot role to its end (clip length / speed, minus a little so the hand-back blends) */
  function oneShot(e, role, speed = 1, fade = 0.2) {
    const a = e.act[role]; if (!a) return;
    e.play(role, fade, true, speed); e.oneT = a.getClip().duration / speed - 0.2; e.landed = false;
  }
  // ---- b69 DISMEMBERMENT: regions lost to hits fly off as rigid chunks baked from his current pose; death blows him apart ----
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sm = new THREE.Vector3(), _sp = new THREE.Vector3();
  const segD = (p, a, b) => { _sm.subVectors(b, a); const L = _sm.lengthSq(), t = L > 1e-8 ? THREE.MathUtils.clamp(_sp.subVectors(p, a).dot(_sm) / L, 0, 1) : 0; return _sp.copy(a).addScaledVector(_sm, t).distanceTo(p); };
  /** distance from p to region r's bone line (minus its radius) */
  function regionD(e, r, p) {
    const D = PARTS[r], A = e.B[D.a], Bb = e.B[D.b], M = D.mid && e.B[D.mid]; if (!A || !Bb) return 1e9;
    A.getWorldPosition(_sa);
    if (M) { M.getWorldPosition(_sb); const d1 = segD(p, _sa, _sb); Bb.getWorldPosition(_sa); return Math.min(d1, segD(p, _sb, _sa)) - D.r; }
    Bb.getWorldPosition(_sb); return segD(p, _sa, _sb) - D.r;
  }
  function pickRegion(e, p) { let best = -1, bd = 1e9; for (let r = 0; r < NREG; r++) { if (!e.reg[r].alive) continue; const d = regionD(e, r, p); if (d < bd) { bd = d; best = r; } } return best; }
  function restore(e) {
    const ix = e.mesh.geometry.index; ix.array.set(RG.sorted); ix.needsUpdate = true;
    e.reg.forEach((s, r) => { s.hp = PARTS[r].hp; s.alive = true; }); e.arms = 2; e.legs = 2; e.nod = 0;
    for (const c of caps) if (c.e === e) c.e = null;
  }
  // chunks: pooled meshes per region (geometry buffers sized for that region, uv + index shared), positions baked per throw
  const pool = PARTS.map(() => []), live = [], _bmat = [], AX6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
  function getChunk(r) {
    const P = pool[r], R = RG.regions[r];
    let c = P.find(o => !o.busy);
    if (!c && P.length < SNOW.chunkPool) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(R.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(R.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', R.uv); g.setIndex(R.index);
      const m = new THREE.Mesh(g, chunkMat); m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m);
      c = { r, m, g, busy: false, v: new THREE.Vector3(), w: new THREE.Vector3(), corners: Array.from({ length: 8 }, () => new THREE.Vector3()), life: 0, restT: 0, rest: false, born: 0 };
      P.push(c);
    }
    if (!c) c = P.reduce((a, b) => (b.born < a.born ? b : a));   // all out: reuse the oldest
    c.busy = true; c.born = performance.now(); c.life = 0; c.restT = 0; c.rest = false; c.m.visible = true; c.m.scale.setScalar(1); c.m.quaternion.identity();
    if (!live.includes(c)) live.push(c);
    return c;
  }
  /** bake region r of snowman e in its CURRENT skinned pose into a pooled chunk; launch it away from `at` */
  function throwChunk(e, r, at, dir, power) {
    const R = RG.regions[r], c = getChunk(r), mesh = e.mesh, sk = mesh.skeleton;
    e.H.updateMatrixWorld(true);
    for (let k = 0; k < sk.bones.length; k++) (_bmat[k] || (_bmat[k] = new THREE.Matrix4())).multiplyMatrices(sk.bones[k].matrixWorld, sk.boneInverses[k]).multiply(mesh.bindMatrix);
    const P = c.g.attributes.position.array, N = c.g.attributes.normal.array;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < R.n; j++) {
      const x = R.P[j * 3], y = R.P[j * 3 + 1], z = R.P[j * 3 + 2], nx = R.N[j * 3], ny = R.N[j * 3 + 1], nz = R.N[j * 3 + 2];
      let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
      for (let k = 0; k < 4; k++) {
        const w = R.SW[j * 4 + k]; if (!w) continue; const m = _bmat[R.SI[j * 4 + k]].elements;
        px += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); py += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); pz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
        qx += w * (m[0] * nx + m[4] * ny + m[8] * nz); qy += w * (m[1] * nx + m[5] * ny + m[9] * nz); qz += w * (m[2] * nx + m[6] * ny + m[10] * nz);
      }
      const ql = Math.hypot(qx, qy, qz) || 1;
      P[j * 3] = px; P[j * 3 + 1] = py; P[j * 3 + 2] = pz; N[j * 3] = qx / ql; N[j * 3 + 1] = qy / ql; N[j * 3 + 2] = qz / ql;
      cx += px; cy += py; cz += pz;
    }
    cx /= R.n; cy /= R.n; cz /= R.n;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let j = 0; j < R.n; j++) {
      const x = P[j * 3] -= cx, y = P[j * 3 + 1] -= cy, z = P[j * 3 + 2] -= cz;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    let k = 0; for (const sx of [x0, x1]) for (const sy of [y0, y1]) for (const sz of [z0, z1]) c.corners[k++].set(sx * 0.8, sy * 0.8, sz * 0.8);   // sinks a little into the snow
    c.g.attributes.position.needsUpdate = true; c.g.attributes.normal.needsUpdate = true; c.g.computeBoundingSphere();
    c.m.position.set(cx, cy, cz);
    const out = _sa.set(cx, cy, cz).sub(at); out.y = Math.max(out.y, 0); if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5); out.normalize();
    c.v.copy(out).multiplyScalar(power * (0.7 + Math.random() * 0.6)); if (dir) c.v.addScaledVector(_sb.copy(dir).setY(0), power * 0.3); c.v.y += power * (0.55 + Math.random() * 0.5);
    c.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * power * 0.6);
    puff(_sb.set(cx, cy, cz), '#ffffff', 14, 4, 0.9); puff(_sb, '#dfe8ff', 6, 2.5, 1.1);
    return c;
  }
  const _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cv = new THREE.Vector3(), _cdn = new THREE.Vector3(0, -1, 0);
  function updateChunks(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i], m = c.m; c.life += dt;
      if (!c.rest) {
        c.v.y -= 20 * dt; m.position.addScaledVector(c.v, dt);
        const w = c.w.length(); if (w > 1e-4) { _cq.setFromAxisAngle(_cv.copy(c.w).multiplyScalar(1 / w), w * dt); m.quaternion.premultiply(_cq).normalize(); }
        let pen = 0; for (const k of c.corners) { _cv.copy(k).applyQuaternion(m.quaternion).add(m.position); pen = Math.max(pen, groundH(_cv.x, _cv.z) - _cv.y); }
        if (pen > 0) {
          m.position.y += pen;
          if (c.v.y < -5) { puff(m.position, '#ffffff', 6, 2.5, 0.6); sfx('snow_puff', { vol: 0.35, rate: 0.8 }); }
          if (c.v.y < 0) c.v.y *= -0.25;
          const k = Math.exp(-5 * dt); c.v.x *= k; c.v.z *= k; c.w.multiplyScalar(Math.exp(-3 * dt));
          if (c.v.lengthSq() < 3) {   // settle on whichever side is nearest the ground
            c.w.multiplyScalar(Math.exp(-6 * dt));
            let ba = null, by = 2; for (const a of AX6) { const y = _cv.copy(a).applyQuaternion(m.quaternion).y; if (y < by) { by = y; ba = a; } }
            _cq2.setFromUnitVectors(_cv.copy(ba).applyQuaternion(m.quaternion), _cdn).multiply(m.quaternion); m.quaternion.slerp(_cq2, 1 - Math.exp(-4 * dt));
            c.restT += dt; if (c.restT > 1.5) { c.rest = true; c.v.set(0, 0, 0); c.w.set(0, 0, 0); }
          }
        }
      }
      if (c.life > SNOW.chunkLife) {   // sink away into the snow
        const k = (c.life - SNOW.chunkLife) / 1.2; m.position.y -= dt * 0.5; m.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) { m.visible = false; c.busy = false; live.splice(i, 1); }
      }
    }
  }
  // the WOUND: a few lumpy snow clumps on the joint the part came off (instanced, one draw for every snowman)
  const CAPN = 128, capMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#f6f8ff', roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.12 }), CAPN), caps = [];
  capMesh.count = 0; capMesh.frustumCulled = false; capMesh.castShadow = true; scene.add(capMesh);
  function capWound(e, r) {
    const D = PARTS[r], bone = e.B[D.cut]; if (!bone) return;
    const big = /head/.test(D.name) ? 1.4 : 1;
    for (let k = 0; k < 4; k++) {
      let c = caps.find(o => !o.e); if (!c) { if (caps.length >= CAPN) return; c = { off: new THREE.Vector3(), q: new THREE.Quaternion() }; caps.push(c); }
      c.e = e; c.bone = bone; c.s = (k ? 0.13 + Math.random() * 0.09 : 0.24) * big;
      c.off.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(k ? 0.32 * big : 0.05);
      c.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0));
    }
  }
  const _cm = new THREE.Matrix4(), _cs = new THREE.Vector3(), _cpq = new THREE.Quaternion();
  function updateCaps() {
    let n = 0;
    for (const c of caps) {
      if (!c.e || !c.e.H.visible) continue;
      c.bone.getWorldPosition(_cv); c.bone.parent.getWorldQuaternion(_cpq);
      _cv.add(_sa.copy(c.off).applyQuaternion(_cpq)); _cs.setScalar(c.s * (c.e.H.scale.x));
      capMesh.setMatrixAt(n++, _cm.compose(_cv, _cpq.multiply(c.q), _cs));
    }
    capMesh.count = n; capMesh.instanceMatrix.needsUpdate = true;
  }
  /** a part comes off (non-lethal): hide its range, throw the chunk, cap the wound, flinch */
  function loseRegion(e, r, at, dir) {
    const s = e.reg[r]; if (!s.alive) return; s.alive = false; s.hp = 0;
    throwChunk(e, r, at, dir, 3.2);
    const R = RG.regions[r], ix = e.mesh.geometry.index; ix.array.fill(0, R.start, R.start + R.count); ix.needsUpdate = true;
    capWound(e, r);
    const n = PARTS[r].name;
    if (n === 'armL' || n === 'armR') e.arms--;
    if (n === 'legL' || n === 'legR') e.legs--;
    if (n === 'armR' && e.ball) dropBall(e);
    sfx('snow_puff', { vol: 0.9, rate: 0.75 }); sfx('crunch', { vol: 0.9, rate: 0.7 });
    e.play('hit', 0.08, true, 1.5); e.hitT = 0.7; e.oneT = 0.7;   // even a committed scoop / heave flinches when a part comes off
    if (e.legs <= 0) kill(e, at, dir);
  }
  /** BLOWN APART (his: no die clip): every part still on flies off, a big snow burst */
  function kill(e, at = null, dir = null, big = false) {
    if (e.ball) dropBall(e);
    e.dead = true; e.deadT = 0; e.hp = 0;
    const c = e.H.position.clone(); c.y += SNOW.height * 0.55;
    const from = at ? at.clone().lerp(c, 0.35) : c.clone().add(_sa.set(Math.random() - 0.5, -0.6, Math.random() - 0.5));
    for (let r = 0; r < NREG; r++) if (e.reg[r].alive) { e.reg[r].alive = false; throwChunk(e, r, from, dir, big ? 7 : 5); }
    e.H.visible = false;
    for (const o of caps) if (o.e === e) o.e = null;
    burst(c, true);
    puff(c, '#ffffff', 26, 6, 1.2); puff(c, '#dfe8ff', 14, 3.5, 0.9);
    sfx('snow_puff', { vol: 1, rate: 0.6 }); sfx('crunch', { vol: 0.9, rate: 0.55 });
    onKill(c);
  }
  /** n hits; `at` = where (picks the region), dir = the shot's direction */
  function damage(e, n, from, at = null, dir = null, blastAt = null) {
    if (e.dead || !ready) return;
    e.pulse = 1;
    let lethal = false;
    if (at && n < e.hp) {
      const r = pickRegion(e, at);
      if (r >= 0) { const s = e.reg[r]; s.hp -= n; if (s.hp <= 0) { if (PARTS[r].lethal) lethal = true; else loseRegion(e, r, at, dir); } }
      if (e.dead) return;
    }
    e.hp -= n; e.lastAt = at; e.lastDir = dir;
    if (e.hp <= 0 || lethal) { kill(e, at || blastAt, dir, n >= 30); return; }
    // a scoop / heave is committed (shoot the BALL instead)
    if (e.hitT <= 0 && e.role !== 'roar' && e.role !== 'jump' && !((e.role === 'scoop' || e.role === 'throw') && e.oneT > 0)) { e.play('hit', 0.08, true, 1.6); e.hitT = 0.75; e.oneT = 0.75; }
    else if (e.role === 'hit') { e.hitT = Math.max(e.hitT, 0.35); e.oneT = Math.max(e.oneT, 0.35); }
    // a hit makes him look at whoever did it
    if (from) e.wantYaw = Math.atan2(from.x - e.H.position.x, from.z - e.H.position.z);
  }

  // ---- SNOWBALLS: held in his right hand, then ballistic; burst on the ground / a house / Santa / the sleigh, or shot down ----
  const B_ = SNOW.ball, balls = [];
  const ballGeo = (() => { const g = new THREE.IcosahedronGeometry(B_.r, 2), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.09 * Math.sin(v.x * 17 + 1.3) * Math.sin(v.y * 13 + 0.7) * Math.sin(v.z * 15 + 2.1) + 0.05 * Math.sin(v.x * 31 + v.z * 23); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g; })();
  const ballMat = new THREE.MeshStandardMaterial({ color: '#f6f8ff', roughness: 0.9 });
  // debris: chunks of packed snow (one instanced draw)
  const CH = 64, chunkMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), ballMat, CH), chunks = [];
  chunkMesh.frustumCulled = false; chunkMesh.count = 0; scene.add(chunkMesh);
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s4 = new THREE.Vector3(), _e4 = new THREE.Euler();
  let chunkI = 0;
  function burst(p, big = true) {
    puff(p, '#ffffff', big ? 30 : 14, big ? 8 : 4, 1.3); puff(p, '#e4ecff', big ? 16 : 8, big ? 4 : 2.5, 1.6, 0.6);
    for (let k = 0; k < (big ? 14 : 6); k++) {
      const c = chunks[chunkI % CH] || (chunks[chunkI % CH] = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), life: 0, s: 1 }); chunkI++;
      c.p.copy(p); c.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).multiplyScalar(big ? 9 : 5); c.r.set(Math.random() * 6, Math.random() * 6, 0);
      c.life = 1.2 + Math.random() * 0.8; c.s = 0.6 + Math.random() * 1.1;
    }
    sfx('snow_puff', { vol: big ? 1 : 0.6, rate: 0.6 }); if (big) { sfx('explosion', { vol: 0.35, rate: 0.45 }); sfx('debris', { vol: 0.5, rate: 0.5 }); }
  }
  function release(e, target, tvel, sky) {
    const b = e.ball; e.ball = null; if (!b) return;
    // LEAD: the shortest flight time t whose launch speed is under the wanted speed, aiming at where he'll be at t
    const want = sky ? B_.speedSky : B_.speedFoot, d = new THREE.Vector3(), v = new THREE.Vector3();
    let best = null, bestS = 1e9;
    for (let t = 0.3; t <= 3.5; t += 0.05) {
      d.copy(target).addScaledVector(tvel, t).sub(b.m.position);
      v.copy(d).divideScalar(t); v.y += 0.5 * B_.g * t;
      const sp = v.length();
      if (sp <= want) { best = v.clone(); break; }
      if (sp < bestS) { bestS = sp; best = v.clone(); }
    }
    if (best.length() > B_.speedMax) best.setLength(B_.speedMax);
    b.v.copy(best); b.held = false; b.life = B_.life; b.spin.set(Math.random() * 8 - 4, Math.random() * 4, Math.random() * 8 - 4);
    sfx('whoosh', { vol: 0.8, rate: 0.55 });
  }
  function dropBall(e) { const b = e.ball; if (!b) return; e.ball = null; b.held = false; b.harmless = true; b.v.set(0, 1, 0); b.life = B_.life; }
  function popBall(b, big) { burst(b.m.position, big); scene.remove(b.m); b.dead = true; }
  const _hp = new THREE.Vector3(), _hm = new THREE.Vector3(), _bp = new THREE.Vector3();
  /** where the held ball sits: the palm (weapon_root_right mount) pushed a little out along the hand toward the fingers */
  function holdPos(e, out) {
    const m = e.B.weapon_root_right || e.B.RightHand; m.getWorldPosition(out);
    const f = e.B.RightHandMiddle1; if (f) { f.getWorldPosition(_hm); e.B.RightHand.getWorldPosition(_hp); out.addScaledVector(_hm.sub(_hp).normalize(), B_.r * 0.55); }
    return out;
  }
  function updateBalls(dt, santa, ctx) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.dead) { balls.splice(i, 1); continue; }
      if (b.held) { b.grow = Math.min(1, b.grow + dt * 4); b.m.scale.setScalar(0.25 + 0.75 * b.grow); continue; }
      b.life -= dt; b.trailT -= dt;
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps && !b.dead; s++) {
        b.v.y -= B_.g * h; b.m.position.addScaledVector(b.v, h);
        const p = b.m.position;
        const hitGround = p.y - B_.r * 0.6 < groundH(p.x, p.z), hitHouse = !!world.town?.solidAt(p);
        let hitSanta = false, hitSleigh = false;
        if (!b.harmless) {
          if (ctx.onFoot) { _bp.copy(santa); _bp.y += 1.0; hitSanta = p.distanceTo(_bp) < B_.r + 0.65; }
          if (ctx.sleigh && p.distanceTo(ctx.sleigh) < B_.sleighR) hitSleigh = true;
        }
        if (hitGround || hitHouse || hitSanta || hitSleigh || b.life <= 0) {
          popBall(b, !b.harmless);
          if (b.harmless) break;
          world.town?.blast(p, 1.2, 2);
          if (ctx.onFoot && onHitSanta) {
            _bp.copy(santa); _bp.y += 1.0; const dd = p.distanceTo(_bp);
            if (dd < B_.splash) { const dir = new THREE.Vector3(b.v.x, 0, b.v.z); if (dir.lengthSq() < 1e-4) dir.set(santa.x - p.x, 0, santa.z - p.z); dir.normalize();
              onHitSanta(dir, hitSanta || dd < B_.direct ? 'big' : 'small', p.clone()); }
          }
          if (hitSleigh) onHitSleigh?.(p.clone());
        }
      }
      if (b.dead) continue;
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      if (b.trailT <= 0) { b.trailT = 0.045; puff(b.m.position, '#ffffff', 2, 0.8, 0.5, 0.3); }
    }
    // chunks
    let n = 0;
    for (const c of chunks) {
      if (!c || c.life <= 0) continue;
      c.life -= dt; c.v.y -= 18 * dt; c.p.addScaledVector(c.v, dt);
      const gy = groundH(c.p.x, c.p.z) + 0.05; if (c.p.y < gy) { c.p.y = gy; c.v.multiplyScalar(Math.exp(-12 * dt)); c.v.y = Math.abs(c.v.y) * 0.2; }
      c.r.x += dt * 5; c.r.y += dt * 4;
      _s4.setScalar(c.s * Math.min(1, c.life * 2)); _q4.setFromEuler(_e4.set(c.r.x, c.r.y, 0)); _m4.compose(c.p, _q4, _s4); chunkMesh.setMatrixAt(n++, _m4);
    }
    chunkMesh.count = n; chunkMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- b56 SPAWN: an extra snowman flung out of a house (a ballistic arc), lands, then lies DAZED (stunned: Getting_Up) or
  // comes up ROARING (angry), then the normal chase / throw brain takes over with home = where he landed ----
  function flyTick(e, dt) {
    const H = e.H, f = e.fly;
    f.v.y -= 20 * dt; H.position.addScaledVector(f.v, dt);
    for (const c of world.colliders) { if (!(c.r > 0) || H.position.y > c.top) continue; const ox = H.position.x - c.x, oz = H.position.z - c.z, d = Math.hypot(ox, oz); if (d < c.r && d > 1e-4 && f.v.y < 0) { H.position.x = c.x + ox / d * c.r; H.position.z = c.z + oz / d * c.r; } }
    e.yaw += f.spin * dt; H.rotation.y = e.yaw; H.rotation.x = Math.sin(f.t * 9) * 0.25; f.t += dt;
    const gy = groundH(H.position.x, H.position.z);
    if (H.position.y <= gy && f.v.y < 0) {
      H.position.y = gy; H.rotation.x = 0; e.fly = null;
      e.home = { x: H.position.x, y: gy, z: H.position.z, ry: e.yaw };
      const c = H.position.clone(); c.y += 0.4; puff(c, '#ffffff', 16, 4, 0.9); sfx('crunch', { vol: 0.7, rate: 0.55 });
      if (f.stunned && clips.getup) { oneShot(e, 'getup', clips.getup.duration / SNOW.stun, 0.05); e.hitT = e.oneT; }
      else { oneShot(e, 'roar', 1.3, 0.1); e.roarT = SNOW.roarCd; }
      e.gapT = 0.4; e.jumpCdT = 3;
    }
    e.mixer.update(dt); H.updateMatrixWorld(true); fitSnowArms(e.B, H, e.fit);
  }
  function spawn(pos, yaw = 0, { stunned = false, vel = null } = {}) {
    if (!ready) return null;
    const e = list.find(o => o.extra && o.free); if (!e) return null;
    const H = e.H;
    restore(e);
    e.free = false; e.dead = false; e.poofed = false; e.hp = SNOW.hp; e.hitT = 0; e.oneT = 0; e.grow = null; e.ball = null; e.wantYaw = null;
    H.visible = true; H.scale.setScalar(1); H.position.copy(pos); e.yaw = yaw; H.rotation.set(0, yaw, 0);
    e.fly = { v: vel ? vel.clone() : new THREE.Vector3(Math.sin(yaw) * 5, 9, Math.cos(yaw) * 5), spin: (Math.random() - 0.5) * 6, t: 0, stunned };
    e.play('hit', 0.05, false, 0.8);
    return e;
  }

  return {
    list, SNOW, balls, ballAt, spawn,
    /** first snowman a ray hits: { dist, point, e } or null */
    raycast(o, d, len = 250) {
      if (!ready) return null;
      let best = null;
      for (const e of list) {
        if (e.dead || e.free || !e.H.visible) continue;
        capsule(e);
        const s = rayCapsule(o, d, len, _a, _b, e.r);
        if (s >= 0 && (!best || s < best.dist)) best = { dist: s, point: o.clone().addScaledVector(d, s), e };
      }
      for (const b of balls) {   // a snowball in flight can be shot down (a ray vs its sphere, a little generous)
        if (b.held || b.dead) continue;
        _w.subVectors(b.m.position, o); const s = _w.dot(d); if (s < 0 || s > len) continue;
        if (_w.lengthSq() - s * s < B_.shootR * B_.shootR && (!best || s < best.dist)) best = { dist: s, point: o.clone().addScaledVector(d, s), ball: b };
      }
      return best;
    },
    shoot(h, n = 1, from = null) {
      if (h.ball) { if (!h.ball.dead) popBall(h.ball, false); return; }
      damage(h.e, n, from, h.point, from && h.point ? h.point.clone().sub(from).normalize() : null);
    },
    /** area damage: a rocket (r ~3.6, big n) or a snowball */
    blast(p, r, n, from = null) {
      if (!ready) return;
      for (const b of balls) if (!b.held && !b.dead && b.m.position.distanceTo(p) < r + B_.r) popBall(b, false);
      for (const e of list) {
        if (e.dead || e.free || e.fly) continue;
        capsule(e);
        const seg = _b.clone().sub(_a), t = THREE.MathUtils.clamp(p.clone().sub(_a).dot(seg) / seg.lengthSq(), 0, 1);
        if (_a.clone().addScaledVector(seg, t).distanceTo(p) >= r + e.r) continue;
        // b69: every part inside the blast takes it too (a part's hp out = it comes off); then the body
        if (n < e.hp) for (let k = 0; k < NREG && !e.dead; k++) {
          const s = e.reg[k]; if (!s.alive || regionD(e, k, p) > r) continue;
          s.hp -= n; if (s.hp <= 0 && !PARTS[k].lethal) loseRegion(e, k, p, null);
        }
        if (!e.dead) damage(e, n, from || p, null, null, p);
      }
    },
    /** dt, the point Santa is at (sleigh or on foot), the camera (to sleep far ones) */
    update(dt, santa, camera, ctx = {}) {
      if (!ready) return;
      const tvel = ctx.vel || _zero; let someoneThrowing = list.some(o => !o.dead && (o.role === 'scoop' || o.role === 'throw') && o.oneT > 0);
      ctx.onFoot = santa.y - groundH(santa.x, santa.z) < 2.5;
      updateBalls(dt, santa, ctx); updateChunks(dt);
      for (const e of list) {
        const H = e.H;
        if (e.free) continue;
        if (e.fly) { flyTick(e, dt); continue; }
        if (e.dead) {   // b69: blown apart (hidden at once); extras go back to the pool, the rest grow back after SNOW.respawn
          e.deadT += dt;
          if (e.extra) { if (e.deadT > 1) e.free = true; continue; }
          if (e.deadT > SNOW.respawn) {   // back, with a puff, growing out of the snow
            restore(e);
            e.dead = false; e.poofed = false; e.hp = SNOW.hp; e.hitT = 0; e.grow = 0; H.visible = true; H.scale.setScalar(0.001);
            H.position.set(e.home.x, e.home.y, e.home.z); e.yaw = e.home.ry; e.oneT = 0; e.play('idle', 0);
            const c = H.position.clone(); c.y += 0.6; puff(c, '#ffffff', 18, 4, 1.0);
          }
          if (H.visible) e.mixer.update(dt);
          continue;
        }
        if (e.grow != null) { e.grow += dt * 2.2; H.scale.setScalar(Math.min(1, 1 - Math.pow(1 - Math.min(1, e.grow), 3))); if (e.grow >= 1) e.grow = null; }
        const far = camera && H.position.distanceTo(camera.position) > SNOW.hide;
        H.visible = !far; if (far) continue;
        // what he does: chase an ON-FOOT Santa (run far, walk in, swipe / punch at reach, a jump attack now and then), taunt a
        // flying one, go home when it's over. One-shots (hit / roar / flex / swipe / punch / jump) run to their end (e.oneT).
        const P = H.position, dx = santa.x - P.x, dz = santa.z - P.z, flat = Math.hypot(dx, dz), dist = Math.hypot(dx, dz, santa.y - P.y);
        const onFoot = santa.y - groundH(santa.x, santa.z) < 2.5;
        const homeD = Math.hypot(P.x - e.home.x, P.z - e.home.z);
        const chase = onFoot && flat < SNOW.aggro && Math.hypot(santa.x - e.home.x, santa.z - e.home.z) < SNOW.leash;
        const near = dist < SNOW.face;
        e.roarT -= dt; e.jumpCdT -= dt; e.tauntT -= dt; e.gapT -= dt; e.throwCdT -= dt;
        if (e.ball && e.role !== 'scoop' && e.role !== 'throw') dropBall(e);   // a hit knocked it out of his hand
        // THE SNOWBALL: Santa out of swipe reach on foot (or overhead in the sleigh) -> sometimes scoop + heave instead of walking in
        const sky = !onFoot && dist < B_.skyMax && santa.y - P.y > B_.skyAbove;
        if (e.oneT <= 0 && e.gapT <= 0 && e.throwCdT <= 0 && !someoneThrowing && clips.scoop && clips.throw && e.reg[2].alive &&
            ((onFoot && flat > B_.footMin && dist < B_.footMax) || sky) && Math.random() < dt * B_.chance) {
          oneShot(e, 'scoop', B_.scoopRate, 0.2); someoneThrowing = true; e.throwCdT = B_.cd[0] + Math.random() * (B_.cd[1] - B_.cd[0]); e.wantYaw = null;
        }
        if (e.hitT > 0) e.hitT -= dt;
        let want = e.home.ry, move = 0;
        if (e.oneT > 0) {                       // a one-shot is playing
          e.oneT -= dt;
          if (e.role === 'jump') { const a = e.act.jump; jumpAt(a.time, _jv).applyAxisAngle(_up, e.jumpYaw); P.set(e.jump0.x + _jv.x, P.y, e.jump0.z + _jv.z); }
          want = e.role === 'jump' ? e.jumpYaw : (near ? Math.atan2(dx, dz) : e.yaw);
          // THE HIT LANDS (his: "sure" -- swipes / punches knock Santa back, the jump attack sends him flying): once per swing, at the
          // clip's contact moment, if he's on foot, in reach and in front of the snowman
          const ct = SNOW.contact[e.role];
          if (ct != null && !e.landed && onFoot) {
            const a = e.act[e.role], f = a.time / a.getClip().duration;
            if (f >= ct) {
              e.landed = true;
              const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), front = (dx * fx + dz * fz) / Math.max(flat, 1e-3);
              if (flat < SNOW.reach + (e.role === 'jump' ? 1.6 : 0.8) && front > 0.35) onHitSanta?.(new THREE.Vector3(dx, 0, dz).normalize(), e.role === 'jump' ? 'big' : 'small', P.clone());
            }
          }
          if (e.role === 'scoop' || e.role === 'throw') {   // face Santa the whole way; the ball in at the grab, out at the release
            want = Math.atan2(dx, dz);
            const a = e.act[e.role], f = a.time / a.getClip().duration;
            if (e.role === 'scoop' && !e.ball && f >= ballAt.grab) {
              const m = new THREE.Mesh(ballGeo, ballMat); m.scale.setScalar(0.25); scene.add(m);
              e.ball = { m, v: new THREE.Vector3(), spin: new THREE.Vector3(), held: true, grow: 0, life: 0, trailT: 0, owner: e };
              balls.push(e.ball); holdPos(e, m.position);
              _bp.copy(P); _bp.y += 0.15; _bp.x += Math.sin(e.yaw) * 0.8; _bp.z += Math.cos(e.yaw) * 0.8; puff(_bp, '#ffffff', 8, 2.5, 0.7); sfx('crunch', { vol: 0.6, rate: 0.7 });
            }
            if (e.role === 'throw' && e.ball && f >= ballAt.release) {
              _bp.copy(santa); if (onFoot) _bp.y += 1.0;
              release(e, _bp, tvel, !onFoot);
            }
          }
          if (e.oneT <= 0) {
            if (e.role === 'scoop' && e.ball) oneShot(e, 'throw', B_.throwRate, 0.2);
            else { if (e.ball) dropBall(e); e.gapT = SNOW.attackGap; e.play('idle', 0.3); }
          }
        } else if (chase) {
          want = Math.atan2(dx, dz);
          if (!e.near && e.roarT <= 0) { oneShot(e, 'roar', 1.4, 0.25); e.roarT = SNOW.roarCd; sfx('crunch', { vol: 0.5, rate: 0.5 }); }
          else if (flat <= SNOW.reach) {        // in reach: swing (alternating swipe / punch), a breath between
            if (e.gapT <= 0 && e.arms <= 0) {   // b69 no arms: he roars, then throws himself at you (the jump attack as a body slam)
              if (e.nod++ % 2 === 0) { oneShot(e, 'roar', 1.5, 0.2); sfx('crunch', { vol: 0.5, rate: 0.5 }); }
              else { e.jumpYaw = want; e.yaw = want; e.jump0.copy(P); oneShot(e, 'jump', 1.1, 0.15); sfx('whoosh', { vol: 0.6, rate: 0.5 }); }
            } else if (e.gapT <= 0) { oneShot(e, e.swing++ % 2 ? 'punch' : 'swipe', 1.15, 0.15); sfx('whoosh', { vol: 0.5, rate: 0.6 }); }
            else if (e.role !== 'idle') e.play('idle', 0.25);
          } else if (flat > SNOW.jumpMin && flat < SNOW.jumpMax && e.jumpCdT <= 0 && Math.random() < dt * 0.8) {
            e.jumpYaw = want; e.yaw = want; e.jump0.copy(P); oneShot(e, 'jump', 1, 0.15); e.jumpCdT = SNOW.jumpCd;
            sfx('whoosh', { vol: 0.6, rate: 0.5 });
          } else {
            const run = flat > SNOW.runAt, role = run ? 'run' : 'walk';
            if (e.role !== role) e.play(role, 0.3, false, run ? SNOW.runRate : SNOW.walkRate);
            move = gait[role] * (run ? SNOW.runRate : SNOW.walkRate) * SNOW.legSlow ** (2 - e.legs);
          }
        } else if (homeD > 1.2) {               // back to his spot
          want = Math.atan2(e.home.x - P.x, e.home.z - P.z);
          if (e.role !== 'walk') e.play('walk', 0.35, false, SNOW.walkRate);
          move = gait.walk * SNOW.walkRate;
        } else {
          if (e.role !== 'idle') e.play('idle', 0.4);
          if (near) {
            want = Math.atan2(dx, dz);
            if (!e.near && e.roarT <= 0) { oneShot(e, 'roar', 1, 0.25); e.roarT = SNOW.roarCd; sfx('crunch', { vol: 0.5, rate: 0.5 }); }
            else if (e.tauntT <= 0) { oneShot(e, Math.random() < 0.6 ? 'flex' : 'roar', 1, 0.3); e.tauntT = SNOW.tauntCd[0] + Math.random() * (SNOW.tauntCd[1] - SNOW.tauntCd[0]); }
          }
        }
        e.near = near;
        if (e.wantYaw != null) { if (e.oneT <= 0 && !chase) want = e.wantYaw; if (near) e.wantYaw = null; }
        let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        e.yaw += dy * (1 - Math.exp(-SNOW.turn * (move ? 1.6 : 1) * dt)); H.rotation.y = e.yaw;
        if (move) { const k = Math.max(0, Math.cos(dy)); P.x += Math.sin(e.yaw) * move * k * dt; P.z += Math.cos(e.yaw) * move * k * dt; }
        // houses + each other push him out (circles), feet on the snow
        if (move || e.role === 'jump') {
          for (const c of world.colliders) { if (!(c.r > 0)) continue; const ox = P.x - c.x, oz = P.z - c.z, d = Math.hypot(ox, oz), m = c.r + e.r; if (d < m && d > 1e-4) { P.x = c.x + ox / d * m; P.z = c.z + oz / d * m; } }
          for (const o of list) { if (o === e || o.dead) continue; const ox = P.x - o.H.position.x, oz = P.z - o.H.position.z, d = Math.hypot(ox, oz), m = e.r + o.r; if (d < m && d > 1e-4) { P.x = o.H.position.x + ox / d * m; P.z = o.H.position.z + oz / d * m; } }
          P.y = groundH(P.x, P.z);
        }
        e.pulse *= Math.exp(-14 * dt);
        if (e.grow == null) H.scale.set(1 + e.pulse * 0.06, 1 - e.pulse * 0.07, 1 + e.pulse * 0.06);   // a squash on each hit
        e.mixer.update(dt);
        H.updateMatrixWorld(true);
        const ws = SNOW.fit[e.role]?.spread ?? ARMFIT.snowman.spread;   // per-role arm fit, eased (no pop at the crossfade)
        e.spr += (ws - e.spr) * (1 - Math.exp(-8 * dt)); e.fit.spread = e.spr;
        fitSnowArms(e.B, H, e.fit);   // his round body: Mixamo arms swing into it
        if (e.ball?.held) holdPos(e, e.ball.m.position);
      }
      updateCaps();
    },
  };
}
