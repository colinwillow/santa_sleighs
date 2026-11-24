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
  turn: 3,                // rad/s-ish smoothing of the turn
  roarCd: 14,             // s between roars
  respawn: 20,            // s dead before he's back
  off: 8.2,               // m off the road centre line (just past the sidewalk)
  hide: 220,              // m from the camera: skip animating + hide
};
// the village road loop (a copy of village.js LOOP -- keep in sync); spots are picked along it
/** ARM FIT (his: "his body is very wide, the Mixamo arms swing into it"): after the clip, open both upper arms by fit.spread rad,
 *  then (fit.elbow > 0) a two-bone IK keeps each hand where the clip put it -- pushed out by fit.hand m from his centre line --
 *  with the elbow bending toward a pole far out to that side. Run AFTER mixer.update every frame; tools/pose/snowcheck.html
 *  measures exactly this function. */
const _fp = new THREE.Vector3(), _fh = new THREE.Vector3(), _fo = new THREE.Vector3();
export function fitSnowArms(B, H, fit = ARMFIT.snowman) {
  if (!fit) return;
  H.updateMatrixWorld(true);
  spreadArms(B, H, fit.spread);
  if (!fit.elbow) return;
  for (const [s, a, f, h] of [[1, B.LeftArm, B.LeftForeArm, B.LeftHand], [-1, B.RightArm, B.RightForeArm, B.RightHand]]) {
    if (!a || !f || !h) continue;
    h.getWorldPosition(_fh); H.worldToLocal(_fh);
    if (fit.hand) _fh.x = s > 0 ? Math.max(_fh.x, fit.hand) : Math.min(_fh.x, -fit.hand);   // the hand stays on its own side, clear of the belly
    H.localToWorld(_fh);
    a.getWorldPosition(_fo); H.worldToLocal(_fo);
    _fp.set(_fo.x + s * fit.elbow, _fo.y - fit.elbow * 0.35, _fo.z - fit.elbow * 0.25); H.localToWorld(_fp);   // far out, a bit down + back
    ik2(a, f, h, _fh, _fp);
  }
}

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
export function makeSnowmen({ scene, world, groundH, puff = () => {}, onKill = () => {}, sfx = () => {} }) {
  const list = [], clips = {};
  let ready = false;
  (async () => {
    const gltf = await load(SNOW.url);
    const roles = CLIPS.snowman;
    await Promise.all(Object.entries(roles).map(async ([role, stem]) => {
      const g = await load(`./models/anims/${stem}.glb`);
      clips[role] = retargetClip(g.scene, g.animations[0], gltf.scene, { name: role });
    }));
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
      const e = { H, B: P.B, mixer, act, home: s, r, hp: SNOW.hp, dead: false, deadT: 0, hitT: 0, roarT: 0, near: false, cur: null, yaw: s.ry, pulse: 0 };
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
    if (e.hitT <= 0 && e.role !== 'roar') { e.play('hit', 0.08, true, 1.6); e.hitT = 0.75; }
    else if (e.role === 'hit') e.hitT = Math.max(e.hitT, 0.35);
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
            H.position.set(e.home.x, e.home.y, e.home.z); e.play('idle', 0);
            const c = H.position.clone(); c.y += 0.6; puff(c, '#ffffff', 18, 4, 1.0);
          }
          if (H.visible) e.mixer.update(dt);
          continue;
        }
        if (e.grow != null) { e.grow += dt * 2.2; H.scale.setScalar(Math.min(1, 1 - Math.pow(1 - Math.min(1, e.grow), 3))); if (e.grow >= 1) e.grow = null; }
        const far = camera && H.position.distanceTo(camera.position) > SNOW.hide;
        H.visible = !far; if (far) continue;
        // face Santa when he's close; a roar the first time he comes in
        const dx = santa.x - H.position.x, dz = santa.z - H.position.z, dist = Math.hypot(dx, dz, santa.y - H.position.y);
        const near = dist < SNOW.face;
        e.roarT -= dt;
        if (near && !e.near && e.roarT <= 0 && e.hitT <= 0) { e.play('roar', 0.25, true, 1); e.roarT = SNOW.roarCd; e.roarEnd = 2.6; sfx('crunch', { vol: 0.5, rate: 0.5 }); }
        e.near = near;
        let want = near ? Math.atan2(dx, dz) : e.home.ry;
        if (e.wantYaw != null) { want = e.wantYaw; if (near) e.wantYaw = null; }
        let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        e.yaw += dy * (1 - Math.exp(-SNOW.turn * dt)); H.rotation.y = e.yaw;
        // one-shots hand back to the idle
        if (e.hitT > 0) { e.hitT -= dt; if (e.hitT <= 0) e.play('idle', 0.3); }
        if (e.role === 'roar') { e.roarEnd -= dt; if (e.roarEnd <= 0) e.play('idle', 0.4); }
        e.pulse *= Math.exp(-14 * dt);
        if (e.grow == null) H.scale.set(1 + e.pulse * 0.06, 1 - e.pulse * 0.07, 1 + e.pulse * 0.06);   // a squash on each hit
        e.mixer.update(dt);
        H.updateMatrixWorld(true);
        fitSnowArms(e.B, H);   // his round body: Mixamo arms swing into it
      }
    },
  };
}
