// SANTA ON FOOT (his slice, Nov 23): hop out of the seat and stand on the deck while the sleigh flies itself (it holds its
// heading), walk around and shoot any direction; walk or jump off the edge and fall; land (hard landings knock him flat);
// a crash THROWS him out; on the ground he walks, runs, jumps and shoots; CALL brings the sleigh down low and slow, and he
// gets back on by touching its deck (or jumping into it). States: seat | deck | air | ground.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { loadModels, makeSanta } from './characters.js';
import { makeLegs } from './loco.js';

export const FOOT = {
  deckY: 1.25, deckX: 0.75, deckZ0: -0.7, deckZ1: 1.7,    // the walkable floor of his sleigh (sleigh-local metres)
  walk: 4.2, run: 7.5, walkClip: 3.2, runClip: 6.5, hipY: 1.0,   // clip speeds (m/s at timeScale 1) so the feet don't skate; hip = air-spin pivot
  jump: 10.5, jump2: 9.5, flipT: 0.55, gravity: 22,   // jump ~2.5 m; the 2nd jump (in the air) is a front flip, ~+2 m
  splat: 13, splatDrop: 7, slamDrop: 4.5, landT: 0.75, landSpeed: 1.6,   // a drop over slamDrop m = the superhero landing (clip 2.1 s at 1.6x, locked landT s)
  getupT: 2.1, getupSpeed: 1.3,   // splat = landing speed AND a drop of splatDrop m (or thrown); get-up clip 2.7 s at 1.3x                                              // landing faster than this knocks him flat
  catchR: 2.6, noCatch: 1.2,                            // after he leaves the deck the sleigh can't grab him back for this long                                            // how close the deck must pass to grab it from the ground / air
};
// THIRD-PERSON CAMERA (b61, his: "the camera doesn't align with the direction the player is running... you turn the camera
// yourself"): the RIGHT pad (gun unlocked) orbits it round him. yawRate / pitchRate = rad/s at full stick (the stick is curved by
// `curve`), pitch = the camera's height angle above his shoulders (pitch0 rest, clamped pitchMin..pitchMax), dist = metres back
// from the pivot (pivotY above his feet), lookAhead = metres past him it looks. recentre = OFF by default: when ON, running
// straight for recentreAfter s with no camera input eases the camera behind him at recentreRate. aimTurn = LOCKED, the aim pushed
// past aimEdge turns the camera at this rate (the right stick is busy aiming).
export const CAMERA = {
  yawRate: 2.6, pitchRate: 1.5, curve: 1.5, pitch0: 0.24, pitchMin: -0.2, pitchMax: 1.05, dist: 6.7, pivotY: 1.6, lookAhead: 3,
  recentre: false, recentreAfter: 2.0, recentreRate: 0.9, aimEdge: 0.7, aimTurn: 3.5,
};
// DODGE (b61, his: "swipes on the left stick to dodge -- a roll or a slide"): a left-pad FLICK (input.js FLICK) rolls him `dist` m
// in `time` s with an ease-out (speed 2*dist/time at the start -> 0), the way the flick pointed RELATIVE TO THE CAMERA. More than
// backAngle from where he faces = a BACK dodge (he keeps facing, hops back: Jump_Backward), else a forward ROLL that turns him
// that way (Sprinting_Forward_Roll, in place; the code moves him). inv = s of no snowman blows (foot.knock ignores him); cool = s
// after the dodge ends before the next. Clip speeds: roll 1.17 s / rollSpeed, back hop 0.87 s / backSpeed.
export const DODGE = { dist: 4.6, time: 0.5, backDist: 3.8, backAngle: 1.9, inv: 0.55, cool: 0.6, rollSpeed: 2.2, backSpeed: 1.7, camKick: 0.08 };

const _look = new THREE.Vector3(), _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _hip = new THREE.Vector3(), _hip2 = new THREE.Vector3();
export function makeOnFoot({ scene, rig, input, camera, sfx, onSplat, onSlam, onDodge }) {
  const st = { mode: 'seat', santa: null, local: new THREE.Vector3(0, FOOT.deckY, -0.3), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    face: 0, stun: 0, tumble: 0, calling: false, camYaw: 0, camPos: new THREE.Vector3(), ready: false, firing: false, zoom: 1, kick: 0, jumps: 0, flip: 0, camLook: new THREE.Vector3(), bodyQ: new THREE.Quaternion(), peakY: 0, thrown: false,
    camPitch: CAMERA.pitch0, straightT: 0, dodgeT: 0, dodgeCd: 0, inv: 0, dodgeDir: new THREE.Vector3(), dodgeBack: false };
  loadModels().then(M => {
    st.santa = makeSanta(M.santa, { role: 'idle', stance: 'foot' });
    st.santa.anim.preload('idle', 'walk', 'run', 'air', 'fire', 'tipsy', 'getup', 'land', 'roll', 'dodgeBack');
    // the LEGS layer (src/loco.js): strafe / backpedal blends under the held upper-body pose while he aims
    { const H = st.santa.holder; H.updateMatrixWorld(true); const hp = st.santa.B.Hips?.getWorldPosition(new THREE.Vector3());
      const hipH = hp ? Math.max(0.5, hp.y - H.position.y) : 1.0;
      st.legs = makeLegs({ rest: M.santa.scene, mixer: st.santa.anim.mixer, hipH }); }   // no first-use hitch when he changes gait
    try { st.santa.setWeapon(localStorage.getItem('weapon') || 'gatling'); } catch (e) { st.santa.setWeapon('gatling'); }
    st.santa.holder.visible = false; scene.add(st.santa.holder); st.ready = true;
  });

  // ---- buttons: HOP (out / sit / call), JUMP --------------------------------------------------------------------------
  const mk = (id, txt, css) => { const b = document.createElement('div'); b.className = 'btn'; b.id = id; b.textContent = txt; b.style.cssText = css; document.getElementById('hud').appendChild(b); return b; };
  const hop = mk('hopBtn', 'HOP OUT', 'width:auto;height:auto;z-index:7;font-size:12px;top:calc(env(safe-area-inset-top) + 8px);right:calc(50% + 6px)');
  const jump = mk('jumpBtn', 'JUMP', 'width:70px;height:70px;z-index:7;right:calc(env(safe-area-inset-right) + 18px);bottom:calc(env(safe-area-inset-bottom) + 150px);display:none');
  let jumpPress = false;
  const press = (b, f) => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f(); });
  press(hop, () => hopAction());
  press(jump, () => { jumpPress = true; });
  addEventListener('keydown', e => { if (e.code === 'KeyE') hopAction(); if (e.code === 'KeyF') jumpPress = true; });

  const sleighWorld = (v, out = new THREE.Vector3()) => { rig.sleigh.g.updateMatrixWorld(); return out.copy(v).applyMatrix4(rig.sleigh.g.matrixWorld); };
  const toSleighLocal = (w, out = new THREE.Vector3()) => out.copy(w).applyMatrix4(rig.sleigh.g.matrixWorld.clone().invert());
  const crewSanta = () => rig.crew?.debug?.santa;

  function setMode(m) {
    st.mode = m;
    const out = m !== 'seat';
    if (st.santa) st.santa.holder.visible = out;
    if (crewSanta()) crewSanta().holder.visible = !out;
    hop.textContent = m === 'seat' ? 'HOP OUT' : m === 'deck' ? 'SIT DOWN' : st.calling ? 'CALLING…' : 'CALL SLEIGH';
    jump.style.display = 'none';   // jump = a tap on the right pad (F on a keyboard)
    document.getElementById('boost').style.display = out ? 'none' : '';
  }
  function hopAction() {
    if (!st.ready) return;
    if (st.mode === 'seat') {   // stand up on the deck, a step behind the seat
      st.local.set(0, FOOT.deckY, 1.1); st.face = rig.yaw; st.camYaw = rig.yaw; st.camPitch = CAMERA.pitch0; st.calling = false;
      setMode('deck'); sfx('whoosh', { vol: 0.4, rate: 1.3 });
    } else if (st.mode === 'deck') { setMode('seat'); sfx('ui_tap'); }
    else { st.calling = true; hop.textContent = 'CALLING…'; sfx('ui_start', { vol: 0.6 }); }
  }
  /** a crash: throw him out of the seat */
  function eject(power, at) {
    if (!st.ready || st.mode === 'air' || st.mode === 'ground') return;
    if (st.mode === 'seat' && power < 0.35) return;
    sleighWorld(st.mode === 'seat' ? new THREE.Vector3(0, 1.4, -0.3) : st.local, st.pos);
    st.vel.copy(rig.SV).multiplyScalar(0.9);
    st.vel.y = Math.max(st.vel.y, 0) + 6 + power * 6; st.vel.x += (Math.random() - 0.5) * 6; st.vel.z += (Math.random() - 0.5) * 6;
    st.tumble = 1.2; st.face = rig.yaw; st.camYaw = rig.yaw; st.calling = false; st.kick = 0.8; st.thrown = true;
    // the camera picks up from where the chase cam IS and keeps him centred (his note b40: on a crash you couldn't tell where Santa
    // was, then it cracked into place)
    st.camPos.copy(camera.position); st.camLook.copy(st.pos).setY(st.pos.y + 1.2);
    setMode('air'); sfx('whoosh', { vol: 0.9, rate: 0.7 });
  }

  // ---- what the sleigh does while he's out: flies on (holds its heading), or comes when CALLED --------------------------
  const pilot = { steer: 0, climb: 0, boost: false, slow: false };
  function sleighInput() {
    pilot.steer = 0; pilot.climb = 0; pilot.slow = false; pilot.boost = false;
    if (st.mode === 'seat') return null;
    if (st.mode === 'deck') { pilot.climb = THREE.MathUtils.clamp((Math.max(groundH(rig.lead.x, rig.lead.z) + 14, rig.lead.y) - rig.lead.y) / 8, -0.4, 0.4); return pilot; }
    if (st.calling) {
      // swoop to him: turn toward him, drop to ~2.5 m above his head, slow down near him
      const dx = st.pos.x - rig.lead.x, dz = st.pos.z - rig.lead.z, dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz); let dy = want - rig.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      pilot.steer = THREE.MathUtils.clamp(-dy * 2.2, -1, 1);           // stick right = yaw decreases (sleigh.js)
      const alt = st.pos.y + (dist < 40 ? 2.5 : 14);
      pilot.climb = THREE.MathUtils.clamp((alt - rig.lead.y) / 6, -1, 1);
      pilot.slow = dist < 60;
    }
    return pilot;
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------------
  const v3 = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), deckW = new THREE.Vector3();
  function solidY(x, z, y) {   // ground or a roof under him
    let f = Math.max(groundH(x, z), rig.roadTop ? rig.roadTop(x, z) : -1e9);
    for (const c of (rig.colliders || [])) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && y > c.top - 1.5) f = Math.max(f, c.top);
    return f;
  }
  const _dd = new THREE.Vector3();
  function startDodge(fl) {
    const S = st.santa;
    fwd.set(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); right.set(-fwd.z, 0, fwd.x);
    _dd.copy(fwd).multiplyScalar(fl.y).addScaledVector(right, fl.x);
    if (_dd.lengthSq() < 0.01) _dd.set(Math.sin(st.face), 0, Math.cos(st.face));   // no direction (a key with no stick) = forward
    _dd.normalize();
    let rel = Math.atan2(_dd.x, _dd.z) - st.face; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    st.dodgeBack = Math.abs(rel) > DODGE.backAngle;
    st.dodgeDir.copy(_dd); st.dodgeT = DODGE.time; st.dodgeCd = DODGE.time + DODGE.cool; st.inv = DODGE.inv;
    if (!st.dodgeBack) { st.face = Math.atan2(_dd.x, _dd.z); st.bodyQ.setFromAxisAngle(_Y, st.face); }   // the roll turns him that way at once
    S.setFiring(false); S.playOnce(st.dodgeBack ? 'dodgeBack' : 'roll', st.dodgeBack ? DODGE.backSpeed : DODGE.rollSpeed);
    st.kick = Math.max(st.kick, DODGE.camKick);
    sfx('whoosh', { vol: 0.75, rate: st.dodgeBack ? 1.25 : 0.95 }); sfx('snow_puff', { vol: 0.5, rate: 1.3 });
    onDodge?.(st.pos.clone(), _dd.clone(), st.dodgeBack);
  }
  function update(dt, t) {
    if (input.tap) { input.tap = false; if (st.mode !== 'seat') jumpPress = true; }   // right-pad tap = jump
    if (!st.ready || st.mode === 'seat') { if (st.santa) st.santa.holder.visible = false; return; }
    const S = st.santa;
    // stick -> a world direction, relative to the camera
    fwd.set(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); right.set(-fwd.z, 0, fwd.x);   // forward (sin h, cos h) -> right (-fz, fx)
    // THIRD-PERSON (b61): the stick moves him RELATIVE TO THE CAMERA (up = away from it) and he turns to face where he goes; the
    // camera never auto-turns after him. A flick's first FLICK.ms never starts a walk (input.moveHold); a dodge owns the legs.
    const hold = st.stun > 0 || input.moveHold || st.dodgeT > 0;
    const mx = hold ? 0 : input.steer, my = hold ? 0 : input.climb, mag = Math.min(1, Math.hypot(mx, my));
    const want = v3.copy(fwd).multiplyScalar(my).addScaledVector(right, mx);
    const spd = mag > 0.85 ? FOOT.run : FOOT.walk;
    if (mag > 0.15 && st.dodgeT <= 0) st.face = Math.atan2(want.x, want.z);
    // his note b40: turning made the gun point odd ways + the left arm vanish -- on foot his BODY turns to the aim whenever he
    // shoots or aims (the gun only fine-aims within a small arc, CREW.footStance.aimYaw). b61: the legs keep the move direction
    // (strafe / backward clips below)
    // he faces the aim only with the gun LOCKED (aiming / shooting); unlocked he runs wherever the left stick goes
    const aiming = st.dodgeT <= 0 && (st.firing || (input.locked && Math.hypot(input.aimX || 0, input.aimY || 0) > 0.15));
    if (aiming) { const a = rig.aimTarget; if (a) st.face = Math.atan2(a.x - st.pos.x, a.z - st.pos.z); }
    const doJump = jumpPress && st.stun <= 0 && st.dodgeT <= 0; jumpPress = false;
    // DODGE: a left flick (input.dodge), on the ground, not knocked down, off cooldown
    const fl = input.dodge; input.dodge = null;
    if (fl && st.mode === 'ground' && st.stun <= 0 && st.dodgeT <= 0 && st.dodgeCd <= 0) startDodge(fl);
    st.dodgeCd = Math.max(0, st.dodgeCd - dt); st.inv = Math.max(0, st.inv - dt);

    if (st.mode === 'deck') {
      // move in sleigh-local space; the deck carries him
      const inv = rig.sleigh.g.quaternion.clone().invert();
      const lv = want.clone().applyQuaternion(inv); lv.y = 0;
      st.local.addScaledVector(lv, spd * dt);
      if (doJump) { st.mode = 'air'; st.jumps = 1; st.noCatch = FOOT.noCatch; st.peakY = st.pos.y; sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); st.vel.y += FOOT.jump; sfx('whoosh', { vol: 0.4, rate: 1.5 }); setMode('air'); }
      else if (Math.abs(st.local.x) > FOOT.deckX + 0.15 || st.local.z < FOOT.deckZ0 - 0.2 || st.local.z > FOOT.deckZ1 + 0.2) {
        sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); st.jumps = 1; st.noCatch = FOOT.noCatch; st.peakY = st.pos.y; setMode('air');   // walked off the edge
      } else sleighWorld(st.local, st.pos);
    } else {
      // air + ground: real world physics
      const onGround = st.mode === 'ground';
      if (onGround && st.dodgeT > 0) {
        // the roll: ease-out along the dodge line (speed 2*d/T at the start -> 0 at the end: covers exactly d)
        st.dodgeT = Math.max(0, st.dodgeT - dt);
        const d = st.dodgeBack ? DODGE.backDist : DODGE.dist, sp = 2 * d / DODGE.time * (st.dodgeT / DODGE.time);
        st.vel.x = st.dodgeDir.x * sp; st.vel.z = st.dodgeDir.z * sp;
      } else if (onGround) {
        const k = 1 - Math.exp(-12 * dt);
        st.vel.x += (want.x * spd - st.vel.x) * k; st.vel.z += (want.z * spd - st.vel.z) * k;
        if (doJump) { st.vel.y = FOOT.jump; st.jumps = 1; st.mode = 'air'; setMode('air'); sfx('whoosh', { vol: 0.3, rate: 1.6 }); }
      } else {
        // DOUBLE JUMP: a second press in the air = a front flip (one per jump; not while knocked out / cartwheeling)
        if (doJump && st.jumps < 2 && st.tumble <= 0) {
          st.jumps = 2; st.vel.y = Math.max(st.vel.y, 0) * 0.3 + FOOT.jump2; st.flip = FOOT.flipT;
          if (mag > 0.15) { st.vel.x += (want.x * spd - st.vel.x) * 0.6; st.vel.z += (want.z * spd - st.vel.z) * 0.6; }
          sfx('whoosh', { vol: 0.5, rate: 1.2 });
        } st.vel.x += want.x * 3 * dt; st.vel.z += want.z * 3 * dt; st.vel.x *= Math.exp(-0.3 * dt); st.vel.z *= Math.exp(-0.3 * dt); }
      st.vel.y -= FOOT.gravity * dt;
      st.peakY = st.mode === 'air' ? Math.max(st.peakY, st.pos.y) : st.pos.y;
      st.pos.addScaledVector(st.vel, dt);
      // house walls push him out (below the roof)
      for (const c of (rig.colliders || [])) {
        const dx = st.pos.x - c.x, dz = st.pos.z - c.z, d = Math.hypot(dx, dz);
        if (d < c.r && st.pos.y < c.top - 1.5) { st.pos.x = c.x + dx / (d || 1) * c.r; st.pos.z = c.z + dz / (d || 1) * c.r; }
      }
      const floor = solidY(st.pos.x, st.pos.z, st.pos.y);
      if (st.pos.y <= floor) {
        const impact = -st.vel.y;
        st.pos.y = floor; st.vel.y = 0;
        if (st.mode === 'air') {
          st.mode = 'ground'; setMode('ground'); st.tumble = 0; st.jumps = 0; st.flip = 0; st.dodgeT = 0;
          // knocked flat only by a REAL fall (his: "whenever I jump I fall over" -- a double jump lands at ~14 m/s): high drop or thrown
          const drop = (st.peakY ?? st.pos.y) - floor;
          // his rule (Nov 24): he LANDS ON HIS FEET from any jump / drop (out of the sleigh, off a roof, from way up) -- a big drop is a
          // superhero SLAM (crouch-land clip, shake, boom, powder burst). Only being THROWN (a crash; later: shot / blown up) lands him
          // on his back and plays the get-up
          if (st.thrown && impact > FOOT.splat * 0.6) { st.stun = FOOT.getupT; S.playOnce('getup', FOOT.getupSpeed); onSplat?.(st.pos.clone(), impact); sfx('debris', { vol: 1, rate: 0.6 }); }
          else if (drop > FOOT.slamDrop) { st.stun = FOOT.landT; S.playOnce('land', FOOT.landSpeed); onSlam?.(st.pos.clone(), impact, drop); }
          else sfx('snow_puff', { vol: 0.7 });
          st.thrown = false;
        }
      } else if (st.mode === 'ground' && st.pos.y > floor + 0.4) { st.mode = 'air'; st.jumps = 1; st.dodgeT = 0; setMode('air'); }
      // catch the sleigh: its deck passes close -> he's on it
      sleighWorld(new THREE.Vector3(0, FOOT.deckY, 0), deckW);
      st.noCatch = Math.max(0, (st.noCatch || 0) - dt);
      if (st.stun <= 0 && st.noCatch <= 0 && st.pos.distanceTo(deckW) < FOOT.catchR) {
        toSleighLocal(st.pos, st.local); st.local.y = FOOT.deckY;
        st.local.x = THREE.MathUtils.clamp(st.local.x, -FOOT.deckX, FOOT.deckX); st.local.z = THREE.MathUtils.clamp(st.local.z, FOOT.deckZ0, FOOT.deckZ1);
        st.calling = false; st.jumps = 0; st.flip = 0; setMode('deck'); sfx('debris', { vol: 0.5, rate: 1.4 });
      }
    }
    st.stun = Math.max(0, st.stun - dt);
    st.tumble = Math.max(0, st.tumble - dt);

    // place + pose him
    S.holder.position.copy(st.pos);
    const baseQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.face);
    // the body's facing eases on its OWN quaternion; air spins are applied on top every frame (they used to be blended back
    // into it, so flips stacked into a glitchy multi-spin). Knocked flat = the Getting Up clip, not a rotation at his feet.
    st.bodyQ.slerp(baseQ, 1 - Math.exp(-14 * dt));
    S.holder.quaternion.copy(st.bodyQ);
    if (st.stun <= 0 && st.dodgeT <= 0 && S.busy) S.endOnce();
    // AIR SPINS turn round his HIPS, never his boots (his note): the cartwheel when he's thrown / hit, and the double-jump flip
    let spin = 0;
    if (st.tumble > 0) spin = st.tumbleA = (st.tumbleA || 0) + 9 * dt;                       // cartwheeling out
    else st.tumbleA = 0;
    if (st.flip > 0) {
      st.flip = Math.max(0, st.flip - dt);
      const u = 1 - st.flip / FOOT.flipT; spin = Math.PI * 2 * (u * u * (3 - 2 * u));
    }
    if (spin) {
      const fq = _sq.setFromAxisAngle(_X, spin), q = _sq2.copy(S.holder.quaternion).multiply(fq);
      _hip.set(0, FOOT.hipY, 0);
      S.holder.position.add(_hip).sub(_hip2.set(0, FOOT.hipY, 0).applyQuaternion(q));
      S.holder.quaternion.copy(q);
    }
    const moving = (st.mode === 'deck' ? mag : Math.hypot(st.vel.x, st.vel.z) / FOOT.run) > 0.15;
    // airborne (a jump, a fall, thrown / hit) = the in-air loop straight away -- never the jump START, which looks like he's
    // pushing off the ground while he's already up (his note). Legs keep pace with the ground speed.
    const hv = Math.hypot(st.vel.x, st.vel.z), run = mag > 0.85;
    // the base role stays walk / run (the upper body + hips stance; characters.js twists the spine while it reads 'walk' / 'run');
    // AIMING, the LEGS layer (src/loco.js LOCO) takes the leg bones: fwd / back / strafe by travel vs facing, turn-in-place shuffle
    S.setIdle(st.mode === 'air' || st.tumble > 0 ? 'air' : moving ? (run ? 'run' : 'walk') : 'idle');
    if (!S.busy) S.anim.setSpeed(st.mode === 'air' || !moving ? 1 : THREE.MathUtils.clamp(hv / (run ? FOOT.runClip : FOOT.walkClip), 0.75, 1.8));
    { const q = st.bodyQ, yaw = 2 * Math.atan2(q.y, q.w); let dyaw = yaw - (st.prevYaw ?? yaw); dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); st.prevYaw = yaw;
      st.turnRate = dt > 0 ? dyaw / dt : 0;
      st.legs?.update(dt, { aim: aiming, grounded: st.mode === 'ground', busy: !!S.busy || st.dodgeT > 0, vel: st.vel, face: st.face, turnRate: st.turnRate }); }
    if (st.dodgeT <= 0) S.setFiring(st.firing && !moving && st.mode !== 'air');   // shooting on the move keeps his legs walking (hands stay on the gun)
    // THE CAMERA IS HIS (b61): the right pad (gun unlocked) orbits it -- x = yaw rate, y = pitch; stick right = the view turns right,
    // stick up = look up. No auto-follow (CAMERA.recentre is an opt-in). LOCKED, the aim pushed hard to a side still turns it.
    const cc = v => Math.sign(v) * Math.pow(Math.abs(v), CAMERA.curve);
    const cx = input.camX || 0, cy = input.camY || 0;
    st.camYaw -= cc(cx) * CAMERA.yawRate * dt;
    st.camPitch = THREE.MathUtils.clamp(st.camPitch - cc(cy) * CAMERA.pitchRate * dt, CAMERA.pitchMin, CAMERA.pitchMax);
    if (Math.abs(input.aimX) > CAMERA.aimEdge) st.camYaw -= Math.sign(input.aimX) * (Math.abs(input.aimX) - CAMERA.aimEdge) * CAMERA.aimTurn * dt;
    st.straightT = (mag > 0.85 && Math.abs(mx) < 0.35 && Math.abs(cx) < 0.1 && !aiming) ? st.straightT + dt : 0;
    if (CAMERA.recentre && st.straightT > CAMERA.recentreAfter) {
      let dy = st.face - st.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.camYaw += dy * (1 - Math.exp(-CAMERA.recentreRate * dt));
    }
    st.zoom += ((st.mode === 'air' || st.stun > 0 ? 1.5 : 1) + st.kick - st.zoom) * (1 - Math.exp(-2.5 * dt));
    st.kick *= Math.exp(-1.2 * dt);
  }

  function cameraUpdate(dt) {
    // an orbit round a pivot over his shoulders: yaw = st.camYaw, height angle = st.camPitch (CAMERA)
    const back = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)), D = CAMERA.dist * st.zoom;
    const want = st.pos.clone().addScaledVector(back, -D * Math.cos(st.camPitch)); want.y = st.pos.y + CAMERA.pivotY + D * Math.sin(st.camPitch);
    want.y = Math.max(want.y, groundH(want.x, want.z) + 1.2);
    for (const c of (rig.colliders || [])) if (c.r > 0 && (want.x - c.x) ** 2 + (want.z - c.z) ** 2 < (c.r + 1) ** 2) want.y = Math.max(want.y, c.top + 1.5);   // never inside a house
    if (st.camPos.lengthSq() === 0 || st.camPos.distanceTo(want) > 60) st.camPos.copy(want);
    st.camPos.lerp(want, 1 - Math.exp(-(st.mode === 'air' || st.tumble > 0 ? 2.2 : 5) * dt));
    camera.position.copy(st.camPos);
    // the look point eases too, so a tumbling / bouncing Santa never whips the camera round
    _look.set(st.pos.x + back.x * CAMERA.lookAhead, st.pos.y + CAMERA.pivotY, st.pos.z + back.z * CAMERA.lookAhead);
    if (st.camLook.lengthSq() === 0 || st.camLook.distanceTo(_look) > 60) st.camLook.copy(_look);
    st.camLook.lerp(_look, 1 - Math.exp(-(st.tumble > 0 || st.mode === 'air' ? 7 : 8) * dt));   // the LOOK stays on him; the position eases
    camera.lookAt(st.camLook);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  }

  return {
    st, update, cameraUpdate, sleighInput, eject,
    get active() { return st.ready && st.mode !== 'seat'; },
    get santa() { return st.santa; },
    /** where the reticle rests when he's on foot: ahead of the camera, at about his height */
    aimRest(out) { const b = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); return out.copy(st.pos).addScaledVector(b, 22).setY(st.pos.y + 1.0 + 22 * Math.tan(CAMERA.pitch0 - st.camPitch) * 0.6); },
    get dodging() { return st.dodgeT > 0; },
    setFiring(on) { st.firing = on; },
    /** a blow from an enemy: 'small' = knocked back a few metres + a stagger (lands on his feet); 'big' = sent flying, lands on his
     *  back, gets up. Only on foot (the sleigh shields him). */
    knock(dir, kind = 'small') {
      if (!st.ready || st.mode === 'seat' || st.mode === 'deck' || st.stun > 0 || st.inv > 0) return false;   // a dodge's i-frames
      const big = kind === 'big';
      st.vel.set(dir.x * (big ? 12 : 7), big ? 8 : 4.5, dir.z * (big ? 12 : 7));
      st.mode = 'air'; setMode('air'); st.peakY = st.pos.y; st.jumps = 2; st.noCatch = FOOT.noCatch;
      if (big) { st.thrown = true; st.tumble = 0.9; st.kick = 0.6; } else st.kick = 0.25;
      st.face = Math.atan2(-dir.x, -dir.z);   // knocked backwards, facing the brute
      return true;
    },
    crashZoom(k) { st.kick = Math.max(st.kick, k); },
  };
}
