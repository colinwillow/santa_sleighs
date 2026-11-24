// Animation: Mixamo clips from colinwillow/retarget-anims (Y Bot, copied into models/anims/), retargeted at load onto
// each character's OWN rest skeleton (src/retarget.js), cached per (character, clip), crossfaded by role.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { retargetClip } from './retarget.js';

// role -> clip file stem, per character kind. Add a role here + drop the GLB in models/anims/.
export const CLIPS = {
  santa: {
    idle: 'Rifle_Idle_2', fire: 'Firing_Rifle_2', walk: 'Rifle_Walk', run: 'Rifle_Run', jump: 'Jumping_5', air: 'Falling_Idle', getup: 'Getting_Up', land: 'Landing',
    tipsy: 'Drunk_Idle', dance: 'Silly_Dancing', cheer: 'Cheering',
    uidle: 'Drunk_Idle', uwalk: 'Walking', urun: 'Standard_Run',   // b75 UNARMED (nothing on the ring / the grenade): his own arms, no gun hold
    roll: 'Sprinting_Forward_Roll', dodgeBack: 'Jump_Backward',   // b61 DODGE (in place; onfoot.js moves him). Strafe / backpedal legs: src/loco.js
  },
  elf: {
    idle: 'Idle_14', happy: 'Happy_Idle', walk: 'Walking', run: 'Standard_Run', jump: 'Jumping_5', air: 'Falling_Idle',
    samba: 'Samba_Dancing', hiphop: 'Hip_Hop_Dancing', wave_dance: 'Wave_Hip_Hop_Dance', wave: 'Waving',
    sit: 'Sitting_Idle_3', cheer: 'Cheering', cheer_sit: 'Cheering_While_Sitting',
  },
  snowman: { idle: 'Mutant_Breathing_Idle', roar: 'Mutant_Roaring', hit: 'Hit_Reaction', die: 'Mutant_Dying',
    walk: 'Mutant_Walking', run: 'Mutant_Run', swipe: 'Mutant_Swiping', punch: 'Mutant_Punch', jump: 'Mutant_Jump_Attack', flex: 'Mutant_Flexing_Muscles_1',
    scoop: 'Pick_Up_Item', throw: 'Throw', getup: 'Getting_Up' },
};

// ONE-SHOT roles (everything else LOOPS): a loop gets its wrap closed (cleanClip), a one-shot only loses the duplicate first key.
export const ONCE = { santa: ['jump', 'getup', 'land', 'cheer', 'roll', 'dodgeBack'], elf: ['jump', 'cheer', 'cheer_sit', 'wave'], snowman: [] };
// ROOT TRAVEL (b67 DODGE SYNC, his: "he moves before the animation"): these one-shots carry their own travel -- at bake the hips
// path (holder frame) becomes a normalised travel curve (travelAt) and the hips' horizontal drift is pinned to the first key, so
// the code moves him exactly as the clip moves (onfoot.js). dir = +1 forward / -1 backward: hips motion AGAINST dir is not travel
// (the roll's hips swinging back over his feet while he rises still counts as height change, the back hop's settle does not).
export const ROOT = { santa: { roll: 1, dodgeBack: -1 } };

/** THE HITCH (b67, measured): every retargeted clip opened with a DUPLICATE key (frame 0 == frame 1, ~0.07 deg max bone step vs
 *  5-25 deg a frame mid-clip) -- a loop froze one frame (33 ms) every cycle: Rifle_Walk / Rifle_Run / Firing_Rifle_2 (a 10-frame
 *  loop: 10% of it frozen) / Falling_Idle / the loco legs. Drops that key. A LOOP whose last key still differs from its first
 *  (Rifle_Walk: 2.2 deg RightLeg) gets the wrap blended: the last `win` s ease onto the first key. Returns the numbers. */
export function cleanClip(clip, { loop = true, win = 0.15 } = {}) {
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), I = new THREE.Quaternion();
  const T = clip.tracks; if (!T.length) return {};
  const n = T[0].times.length; if (n < 4 || T.some(t => t.times.length !== n)) return {};
  const ang = (t, i, j) => t.getValueSize() === 4 ? qa.fromArray(t.values, i * 4).angleTo(qb.fromArray(t.values, j * 4)) * 57.2958 : 0;
  const pos = (t, i, j) => t.getValueSize() === 3 ? Math.hypot(t.values[i * 3] - t.values[j * 3], t.values[i * 3 + 1] - t.values[j * 3 + 1], t.values[i * 3 + 2] - t.values[j * 3 + 2]) : 0;
  const hip = T.find(t => t.getValueSize() === 3), hipScale = hip ? Math.abs(hip.values[1]) || 1 : 1;
  const dup = Math.max(...T.map(t => ang(t, 0, 1))), dupP = hip ? pos(hip, 0, 1) / hipScale : 0, out = { dupDeg: +dup.toFixed(2) };
  let tracks = T;
  if (dup < 0.2 && dupP < 0.002) {   // drop key 0, every track gets its OWN times array (retargetClip shares one)
    const t0 = T[0].times[1];
    tracks = T.map(t => { const k = t.getValueSize(), times = new Float32Array(n - 1), vals = new Float32Array((n - 1) * k);
      for (let i = 1; i < n; i++) times[i - 1] = t.times[i] - t0; vals.set(t.values.subarray(k)); return new t.constructor(t.name, times, vals); });
    clip.duration = Math.max(1 / 60, clip.duration - t0); out.dropped = +t0.toFixed(3);
  }
  const m = tracks[0].times.length, last = m - 1;
  out.wrapDeg = +Math.max(...tracks.map(t => ang(t, last, 0))).toFixed(2);
  if (loop && out.wrapDeg > 0.5) {
    const dur = tracks[0].times[last], from = dur - Math.min(win, dur / 3);
    for (const t of tracks) {
      const k = t.getValueSize(), v = t.values;
      if (k === 4) qc.fromArray(v, last * 4).invert().multiply(qb.fromArray(v, 0));   // correction: last -> first, in local space
      for (let i = 0; i <= last; i++) {
        if (t.times[i] < from) continue;
        let w = (t.times[i] - from) / (dur - from); w = w * w * (3 - 2 * w);
        if (k === 4) { qa.fromArray(v, i * 4).multiply(qb.copy(I).slerp(qc, w)); qa.toArray(v, i * 4); }
        else if (k === 3) for (let c = 0; c < 3; c++) v[i * 3 + c] += (v[c] - v[last * 3 + c]) * w;
      }
    }
    out.wrapFixed = true;
  }
  clip.tracks = tracks; clip.resetDuration?.(); clip.duration = tracks[0].times[last];
  return out;
}

/** a root-travel curve from the clip's hips path in `frame` (the holder): returns { times, f (0..1 cumulative), dur } and pins the
 *  hips' horizontal position to the first key (the code carries the travel) */
function rootTravel(clip, liveScene, dir) {
  const tr = clip.tracks.find(t => /Hips\.position$/.test(t.name)); if (!tr) return null;
  let hips = null; liveScene.traverse(o => { if (!hips && /Hips$/.test(o.name) && o.isBone) hips = o; });
  const frame = liveScene.parent?.parent || liveScene.parent || liveScene; if (!hips) return null;   // characters.js prep: holder > inner (scaled, maybe turned PI) > scene
  frame.updateMatrixWorld(true);
  const M = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(hips.parent.matrixWorld), Mi = M.clone().invert();
  const n = tr.times.length, P = [], v = new THREE.Vector3();
  for (let i = 0; i < n; i++) P.push(v.fromArray(tr.values, i * 3).applyMatrix4(M).clone());
  const f = new Float32Array(n); let acc = 0;
  for (let i = 1; i < n; i++) { const dy = P[i].y - P[i - 1].y, dz = Math.max(0, (P[i].z - P[i - 1].z) * dir); acc += Math.hypot(dy, dz, (P[i].x - P[i - 1].x) * 0.3); f[i] = acc; }
  if (acc <= 1e-6) return null;
  for (let i = 0; i < n; i++) f[i] /= acc;
  for (let i = 0; i < n; i++) { v.set(P[0].x, P[i].y, P[0].z).applyMatrix4(Mi); v.toArray(tr.values, i * 3); }   // keep the height, pin the drift
  return { times: Float32Array.from(tr.times), f, dur: clip.duration, drift: +Math.hypot(P[n - 1].x - P[0].x, P[n - 1].z - P[0].z).toFixed(2), peak: +Math.max(...P.map(p => Math.abs(p.z - P[0].z))).toFixed(2) };
}

const loader = new GLTFLoader();
const srcCache = new Map();
function loadSrc(stem) {
  if (!srcCache.has(stem)) srcCache.set(stem, new Promise((res, rej) => loader.load(`./models/anims/${stem}.glb`, g => res({ scene: g.scene, clip: g.animations[0] }), undefined, rej)));
  return srcCache.get(stem);
}

/**
 * animator(kind, restScene, liveScene): restScene = an untouched copy of the character (never posed), liveScene = the
 * instance in the world. play(role) loads + retargets on first use, then crossfades.
 */
export function animator(kind, restScene, liveScene) {
  const mixer = new THREE.AnimationMixer(liveScene);
  const baked = new Map();      // role -> Promise<AnimationAction>
  const meta = new Map();       // role -> { dur, travel, clean } once baked
  let current = null, currentRole = null;
  const action = role => {
    if (!baked.has(role)) baked.set(role, (async () => {
      const stem = CLIPS[kind][role]; if (!stem) throw new Error('no clip for ' + kind + '.' + role);
      const { scene, clip } = await loadSrc(stem);
      const rc = retargetClip(scene, clip, restScene, { name: role });
      const clean = cleanClip(rc, { loop: !(ONCE[kind] || []).includes(role) });
      const dir = ROOT[kind]?.[role], travel = dir ? rootTravel(rc, liveScene, dir) : null;
      meta.set(role, { dur: rc.duration, travel, clean });
      if (clean.dropped || clean.wrapFixed || travel) console.log('anim', kind, role, stem, clean, travel ? { drift: travel.drift, peak: travel.peak } : '');
      return mixer.clipAction(rc);
    })());
    return baked.get(role);
  };
  return {
    mixer, roles: Object.keys(CLIPS[kind]),
    get role() { return currentRole; },
    /** baked facts for a role (null until it has loaded): { dur, travel, clean } */
    info(role) { return meta.get(role) || null; },
    /** ROOT TRAVEL: the share (0..1) of the role's own travel done at clip time t (onfoot.js drives the dodge with it) */
    travelAt(role, t) {
      const tv = meta.get(role)?.travel; if (!tv) return null;
      const T = tv.times, n = T.length; if (t <= T[0]) return 0; if (t >= T[n - 1]) return 1;
      let i = 1; while (i < n - 1 && T[i] < t) i++;
      const k = (t - T[i - 1]) / (T[i] - T[i - 1] || 1); return tv.f[i - 1] + (tv.f[i] - tv.f[i - 1]) * k;
    },
    get current() { return current; },
    async play(role, fade = 0.18, { once = false, speed = 1 } = {}) {
      if (role === currentRole) return current;
      currentRole = role;
      const a = await action(role);
      if (currentRole !== role) return a;              // a newer request won while this one loaded
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed;
      a.play();
      if (current && current !== a) current.crossFadeTo(a, fade, false); else a.fadeIn(fade);
      current = a;
      return a;
    },
    /** playback speed of the current clip (legs matched to ground speed) */
    setSpeed(s) { if (current) current.timeScale += (s - current.timeScale) * 0.2; },
    preload(...roles) { return Promise.all(roles.map(action)); },
    update(dt) { mixer.update(dt); },
  };
}
