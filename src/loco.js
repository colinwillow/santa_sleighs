// LOCO (b61): Santa's on-foot LEGS layer -- ported from Korajin's locomotion (index.html CLIPS `__legs` split + the committed
// directional blend + TURNSTEP shuffle), only the generic pieces. His words: "if you're SHOOTING he stays facing the gun's
// direction, if you're NOT shooting he runs wherever the left stick goes".
//   NOT aiming: this layer is OFF -- the base role (walk / run, src/anim.js) plays the whole body and he faces his travel.
//   AIMING (gun locked + stick pushed, or firing): he faces the aim; the LEGS blend forward / back / strafeL / strafeR by the angle
//   between travel and facing: fwd |cos| / (|cos| + |sin|) to walk-run (cos >= 0) or backpedal, lat |sin| / (...) to strafeL
//   (sin >= 0: +X IS HIS LEFT) or strafeR. Each clip plays at ground speed / its MEASURED ref speed.
//   STANDING + turning faster than turnAt rad/s: the legs shuffle (a strafe clip the way he turns) -- "he just rotates, not
//   moving his feet" (Korajin m53).
// THE SPLIT (Korajin's `isUpper`): the leg clips keep ONLY UpLeg / Leg / Foot / Toe rotations + the Hips TRANSLATION (height +
// stride bounce). The Hips ROTATION is the stance and stays with the base clip, and the upper body is the lead's held POSE
// (src/characters.js) -- so nothing up there changes. Three.js averages tracks by weight, so the layer takes a leg bone by
// weighing share / (1 - share) against the base clip's ~1 (share .995 = the base keeps 0.5% of the legs).
// MEASURED, never trusted by name (Korajin NOTES: a library "Strafe Right" can walk LEFT on a character): at load each clip's
// travel is measured off the PLANTED foot relative to the hips (works for in-place and root-motion clips alike), which gives
// its direction (strafe L / R assigned by the measured sign) and its ref speed (scaled by hip height to Santa). Logged once.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { retargetClip } from './retarget.js';
import { cleanClip } from './anim.js';

export const LOCO = {
  clips: { walk: 'Rifle_Walk', run: 'Rifle_Run', back: 'Backwards_Rifle_Walk', backRun: 'Backwards_Rifle_Run', strafeA: 'Left_Strafe_Walk', strafeB: 'Right_Strafe_Walk' },
  fallback: { walk: 3.2, run: 6.5, back: 1.6, backRun: 3.6, strafeL: 2.0, strafeR: 2.0 },   // m/s at timeScale 1 if a measure fails
  ref: {},                       // the measured refs land here (m/s at timeScale 1, Santa's size)
  measured: true,                // false = use `fallback` (a switch if a measure reads wrong)
  runBand: [4.4, 6.6],           // m/s: forward / back legs cross from the walk to the run clip over this band
  rateLo: 0.6, rateHi: 2.4,      // clip playback clamp
  share: 0.995, ease: 12,        // the layer's max share of the leg bones; 1/s it eases in / out
  moveAt: 0.3,                   // m/s: above = the directional blend
  turnAt: 1.2, turnFull: 3.5, turnMax: 0.9, turnRateK: 0.45, turnUpTo: 0.6,   // TURNSTEP shuffle (rad/s; speed it fades out by, m/s)
};

const LEGS = /(UpLeg|Leg|Foot|Toe)[^.]*\.quaternion$/, HIPPOS = /Hips\.position$/;
const loader = new GLTFLoader();

/** where the clip walks: the planted (lower) foot's velocity relative to the hips, negated, averaged; source units / s */
function measure(scene, clip) {
  const f = {}; scene.traverse(o => { if (/LeftFoot$/.test(o.name)) f.L = o; if (/RightFoot$/.test(o.name)) f.R = o; if (/Hips$/.test(o.name)) f.H = o; });
  if (!f.L || !f.R || !f.H) return null;
  const mixer = new THREE.AnimationMixer(scene), a = mixer.clipAction(clip); a.play();
  const n = Math.max(8, Math.round(clip.duration * 30)), pL = [], pR = [], pH = [];
  for (let i = 0; i <= n; i++) {
    mixer.setTime(clip.duration * i / n); scene.updateMatrixWorld(true);
    pL.push(f.L.getWorldPosition(new THREE.Vector3())); pR.push(f.R.getWorldPosition(new THREE.Vector3())); pH.push(f.H.getWorldPosition(new THREE.Vector3()));
  }
  const hip0 = pH[0].y; a.stop(); mixer.uncacheRoot(scene);
  const minY = Math.min(...pL.map(p => p.y), ...pR.map(p => p.y)), dtF = clip.duration / n;
  let vx = 0, vz = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const low = pL[i].y < pR[i].y ? pL : pR;
    if (low[i].y > minY + hip0 * 0.04) continue;   // that foot is not planted this frame
    vx -= ((low[i + 1].x - pH[i + 1].x) - (low[i].x - pH[i].x)) / dtF; vz -= ((low[i + 1].z - pH[i + 1].z) - (low[i].z - pH[i].z)) / dtF; c++;
  }
  if (!c) return null;
  return { x: vx / c / hip0, z: vz / c / hip0 };   // in hip heights / s (Y Bot faces +Z, +X = his left)
}

export function makeLegs({ rest, mixer, hipH }) {
  const acts = {}, info = {};
  let share = 0;
  const ready = (async () => {
    const out = [];
    for (const [key, stem] of Object.entries(LOCO.clips)) {
      try {
        const g = await new Promise((res, rej) => loader.load(`./models/anims/${stem}.glb`, res, undefined, rej));
        const src = g.scene, clip = g.animations[0];
        const rc = retargetClip(src, clip, rest, { name: 'legs_' + key });   // first: it needs the source AT REST
        const m = measure(src, clip);
        rc.tracks = rc.tracks.filter(t => LEGS.test(t.name) || HIPPOS.test(t.name));
        cleanClip(rc, { loop: true });   // b67 THE HITCH: drop the duplicate first key (a 33 ms freeze every stride) + close the wrap
        const a = mixer.clipAction(rc); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.setEffectiveWeight(0); a.play();
        out.push({ key, stem, a, m });
      } catch (e) { console.warn('loco: no', stem, e); }
    }
    // strafe L / R by the MEASURED sideways sign, not the file name
    const st = out.filter(o => o.key === 'strafeA' || o.key === 'strafeB');
    if (st.length === 2) {
      const [p, q] = st; const px = p.m ? p.m.x : 1, qx = q.m ? q.m.x : -1;
      const left = px >= qx ? p : q, right = left === p ? q : p;
      left.key = 'strafeL'; right.key = 'strafeR';
    }
    for (const o of out) {
      acts[o.key] = o.a;
      const sp = o.m ? Math.hypot(o.m.x, o.m.z) * hipH : 0;
      info[o.key] = o.m ? `${o.stem} ${(Math.atan2(o.m.x, o.m.z) * 180 / Math.PI).toFixed(0)}deg ${sp.toFixed(2)}m/s` : o.stem + ' (no measure)';
      if (sp > 0.3) LOCO.ref[o.key] = sp;
    }
    console.log('LOCO legs', info);
  })();
  const ref = k => (LOCO.measured && LOCO.ref[k]) || LOCO.fallback[k];
  const sm = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const w = {}, last = {};
  return {
    ready, info, acts,
    get share() { return share; },
    /** o: { aim, grounded, busy, vel (world), face (rad), turnRate (rad/s, + = toward his left) } */
    update(dt, o) {
      for (const k in acts) w[k] = 0;
      const sp = Math.hypot(o.vel.x, o.vel.z);
      let want = 0;
      if (o.grounded && !o.busy) {
        if (o.aim && sp > LOCO.moveAt) {
          want = 1;
          let rel = Math.atan2(o.vel.x, o.vel.z) - o.face; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          const c = Math.cos(rel), sn = Math.sin(rel), fwd = Math.abs(c), lat = Math.abs(sn), tot = fwd + lat || 1;
          const r = sm(LOCO.runBand[0], LOCO.runBand[1], sp);
          if (c >= 0) { w.walk = fwd / tot * (1 - r); w.run = fwd / tot * r; }
          else { w.back = fwd / tot * (1 - r); w.backRun = fwd / tot * r; }
          w[sn >= 0 ? 'strafeL' : 'strafeR'] = lat / tot;   // +X IS HIS LEFT: a positive sine is LEFT
          for (const k in acts) if (w[k] > 0) acts[k].timeScale = THREE.MathUtils.clamp(sp / ref(k), LOCO.rateLo, LOCO.rateHi);
        } else {
          // TURNSTEP: standing and turning -> the feet shuffle the way he turns
          const tr = Math.abs(o.turnRate || 0), tw = LOCO.turnMax * sm(LOCO.turnAt, LOCO.turnFull, tr) * (1 - sm(0, LOCO.turnUpTo, sp));
          if (tw > 0.01) {
            const k = o.turnRate > 0 ? 'strafeL' : 'strafeR'; want = tw; w[k] = 1;
            if (acts[k]) acts[k].timeScale = THREE.MathUtils.clamp(tr * LOCO.turnRateK, LOCO.rateLo, LOCO.rateHi);
          }
        }
      }
      share += (want * LOCO.share - share) * (1 - Math.exp(-LOCO.ease * dt));
      const W = share / Math.max(1e-3, 1 - share);
      // the blend's parts share W; letting go, the last blend fades out with the share (no pop)
      let tot = 0; for (const k in acts) tot += w[k];
      if (tot > 0) for (const k in acts) last[k] = w[k] / tot;
      for (const k in acts) acts[k].setEffectiveWeight(W * (last[k] || 0));
    },
  };
}
