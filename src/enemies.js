// SNOWMAN MONSTERS (his rig models/enemies/snowman_monster_rig.glb: Auto-Rig Pro -> Mixamo names, hand mounts). Big brutes
// (~2.6 m) standing on clear spots just off the village road loop. Presence + reaction only, no attack yet: a menacing idle,
// they turn to face Santa inside SNOW.face m (a roar when he first comes close), flinch when shot, die in a snow burst after
// SNOW.hp Gatling hits and come back after SNOW.respawn s. One skinned mesh each; clips are retargeted ONCE and shared.
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
  hp: 25,                 // Gatling hits (a rifle slug = SNOW.slug, a rocket blast kills)
  slug: 5,
  face: 25,               // m: turn to face Santa inside this
  // b52 (his: "rig him up with some of the mutant animations"): ON FOOT Santa inside `aggro` m gets chased -- RUN while farther
  // than `runAt`, WALK in, stop at `reach` and SWIPE / PUNCH (animation only, no damage yet); a JUMP ATTACK now and then from
  // `jumpMin..jumpMax` m (the clip's own forward travel moves him); FLEX / ROAR now and then while he watches; back home past `leash`.
  aggro: 25, runAt: 12, reach: 3.0, leash: 45, jumpMin: 5, jumpMax: 8.5, jumpCd: 9,
  walkRate: 1.1, runRate: 1.0,   // clip timeScale; ground speed = the clip's own stride speed x this (measured at load, no skating)
  tauntCd: [7, 14],       // s between flex / roar taunts while Santa is near but not chased (sleigh overhead, or out of leash)
  attackGap: 0.35,        // s of idle between swings
  contact: { swipe: 0.42, punch: 0.38, jump: 0.62 },   // fraction of each attack clip where the blow lands
  turn: 3,                // rad/s-ish smoothing of the turn
  roarCd: 14,             // s between roars
  respawn: 20,            // s dead before he's back
  off: 8.2,               // m off the road centre line (just past the sidewalk)
  hide: 220,              // m from the camera: skip animating + hide
};
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
export function makeSnowmen({ scene, world, groundH, puff = () => {}, onKill = () => {}, sfx = () => {}, onHitSanta = null }) {
  const list = [], clips = {}, gait = { walk: 1.8, run: 5 }, jumpPath = [];
  let ready = false;
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
    for (const s of pickSpots(world, groundH, SNOW.count)) {
      const inst = skClone(gltf.scene);
      const P = prep(inst, SNOW.height), H = P.holder;
      H.position.set(s.x, s.y, s.z); H.rotation.y = s.ry; scene.add(H);
      H.updateMatrixWorld(true);
      let rad = 0; const wsc = new THREE.Vector3();
      inst.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; o.getWorldScale(wsc); rad = Math.max(rad, (bb.max.x - bb.min.x) * wsc.x, (bb.max.z - bb.min.z) * wsc.z); } });
      const r = THREE.MathUtils.clamp(rad * 0.5 * 0.8, 0.55, 1.3);   // hit capsule radius (m), from the bind-pose bounds
      const mixer = new THREE.AnimationMixer(inst), act = {};
      for (const k in clips) act[k] = mixer.clipAction(clips[k]);
      const e = { H, B: P.B, mixer, act, home: s, r, hp: SNOW.hp, dead: false, deadT: 0, hitT: 0, roarT: 0, near: false, cur: null, yaw: s.ry, pulse: 0,
        oneT: 0, gapT: 0, jumpCdT: 0, tauntT: 4 + Math.random() * 6, swing: 0, jump0: new THREE.Vector3() };
      e.play = (role, fade = 0.2, once = false, speed = 1) => {
        const a = act[role]; if (!a) return;
        a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.play();
        if (e.cur && e.cur !== a) e.cur.crossFadeTo(a, fade, false); else a.fadeIn(fade);
        e.cur = a; e.role = role;
      };
      mixer.setTime(Math.random() * 3);
      e.play('idle', 0);
      list.push(e);
    }
    ready = true;
  })().catch(err => console.warn('snowmen', err));

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const capsule = e => { _a.copy(e.H.position); _a.y += e.r * 0.9; _b.copy(e.H.position); _b.y += SNOW.height - e.r * 0.8; };

  const _up = new THREE.Vector3(0, 1, 0);
  /** play a one-shot role to its end (clip length / speed, minus a little so the hand-back blends) */
  function oneShot(e, role, speed = 1, fade = 0.2) {
    const a = e.act[role]; if (!a) return;
    e.play(role, fade, true, speed); e.oneT = a.getClip().duration / speed - 0.2; e.landed = false;
  }
  function kill(e) {
    e.dead = true; e.deadT = 0; e.hp = 0;
    e.play('die', 0.15, true, 1.15);
    const c = e.H.position.clone(); c.y += SNOW.height * 0.55;
    puff(c, '#ffffff', 26, 6, 1.2); puff(c, '#dfe8ff', 14, 3.5, 0.9);
    sfx('snow_puff', { vol: 0.9, rate: 0.7 }); sfx('crunch', { vol: 0.8, rate: 0.6 });
    onKill(c);
  }
  function damage(e, n, from) {
    if (e.dead || !ready) return;
    e.hp -= n; e.pulse = 1;
    if (e.hp <= 0) { kill(e); return; }
    if (e.hitT <= 0 && e.role !== 'roar' && e.role !== 'jump') { e.play('hit', 0.08, true, 1.6); e.hitT = 0.75; e.oneT = 0.75; }
    else if (e.role === 'hit') { e.hitT = Math.max(e.hitT, 0.35); e.oneT = Math.max(e.oneT, 0.35); }
    // a hit makes him look at whoever did it
    if (from) e.wantYaw = Math.atan2(from.x - e.H.position.x, from.z - e.H.position.z);
  }

  return {
    list, SNOW,
    /** first snowman a ray hits: { dist, point, e } or null */
    raycast(o, d, len = 250) {
      if (!ready) return null;
      let best = null;
      for (const e of list) {
        if (e.dead || !e.H.visible) continue;
        capsule(e);
        const s = rayCapsule(o, d, len, _a, _b, e.r);
        if (s >= 0 && (!best || s < best.dist)) best = { dist: s, point: o.clone().addScaledVector(d, s), e };
      }
      return best;
    },
    shoot(h, n = 1, from = null) { damage(h.e, n, from); },
    /** area damage: a rocket (r ~3.6, big n) or a snowball */
    blast(p, r, n, from = null) {
      if (!ready) return;
      for (const e of list) {
        if (e.dead) continue;
        capsule(e);
        const seg = _b.clone().sub(_a), t = THREE.MathUtils.clamp(p.clone().sub(_a).dot(seg) / seg.lengthSq(), 0, 1);
        if (_a.clone().addScaledVector(seg, t).distanceTo(p) < r + e.r) damage(e, n, from || p);
      }
    },
    /** dt, the point Santa is at (sleigh or on foot), the camera (to sleep far ones) */
    update(dt, santa, camera) {
      if (!ready) return;
      for (const e of list) {
        const H = e.H;
        if (e.dead) {
          e.deadT += dt;
          if (e.deadT > 2.6 && e.deadT < 3.2) {   // the body crumbles into a poof
            const k = Math.max(0.001, 1 - (e.deadT - 2.6) / 0.6); H.scale.setScalar(k);
            if (!e.poofed) { e.poofed = true; const c = H.position.clone(); c.y += 0.8; puff(c, '#ffffff', 22, 5, 1.1); sfx('snow_puff', { vol: 0.7 }); }
          } else if (e.deadT >= 3.2 && H.visible) { H.visible = false; }
          if (e.deadT > SNOW.respawn) {   // back, with a puff, growing out of the snow
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
        e.roarT -= dt; e.jumpCdT -= dt; e.tauntT -= dt; e.gapT -= dt;
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
          if (e.oneT <= 0) { e.gapT = SNOW.attackGap; e.play('idle', 0.3); }
        } else if (chase) {
          want = Math.atan2(dx, dz);
          if (!e.near && e.roarT <= 0) { oneShot(e, 'roar', 1.4, 0.25); e.roarT = SNOW.roarCd; sfx('crunch', { vol: 0.5, rate: 0.5 }); }
          else if (flat <= SNOW.reach) {        // in reach: swing (alternating swipe / punch), a breath between
            if (e.gapT <= 0) { oneShot(e, e.swing++ % 2 ? 'punch' : 'swipe', 1.15, 0.15); sfx('whoosh', { vol: 0.5, rate: 0.6 }); }
            else if (e.role !== 'idle') e.play('idle', 0.25);
          } else if (flat > SNOW.jumpMin && flat < SNOW.jumpMax && e.jumpCdT <= 0 && Math.random() < dt * 0.8) {
            e.jumpYaw = want; e.yaw = want; e.jump0.copy(P); oneShot(e, 'jump', 1, 0.15); e.jumpCdT = SNOW.jumpCd;
            sfx('whoosh', { vol: 0.6, rate: 0.5 });
          } else {
            const run = flat > SNOW.runAt, role = run ? 'run' : 'walk';
            if (e.role !== role) e.play(role, 0.3, false, run ? SNOW.runRate : SNOW.walkRate);
            move = gait[role] * (run ? SNOW.runRate : SNOW.walkRate);
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
        fitSnowArms(e.B, H);   // his round body: Mixamo arms swing into it
      }
    },
  };
}
