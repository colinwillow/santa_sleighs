// SANTA ON FOOT (his slice, Nov 23): hop out of the seat and stand on the deck while the sleigh flies itself (it holds its
// heading), walk around and shoot any direction; walk or jump off the edge and fall; land (hard landings knock him flat);
// a crash THROWS him out; on the ground he walks, runs, jumps and shoots; CALL brings the sleigh down low and slow, and he
// gets back on by touching its deck (or jumping into it). States: seat | deck | air | ground.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { loadModels, makeSanta } from './characters.js';

export const FOOT = {
  deckY: 1.25, deckX: 0.75, deckZ0: -0.7, deckZ1: 1.7,    // the walkable floor of his sleigh (sleigh-local metres)
  walk: 4.2, run: 7.5, walkClip: 3.2, runClip: 6.5, hipY: 1.0,   // clip speeds (m/s at timeScale 1) so the feet don't skate; hip = air-spin pivot
  jump: 10.5, jump2: 9.5, flipT: 0.55, gravity: 22,   // jump ~2.5 m; the 2nd jump (in the air) is a front flip, ~+2 m
  splat: 13,                                              // landing faster than this knocks him flat
  catchR: 2.6, noCatch: 1.2,                            // after he leaves the deck the sleigh can't grab him back for this long                                            // how close the deck must pass to grab it from the ground / air
};

const _look = new THREE.Vector3(), _X = new THREE.Vector3(1, 0, 0), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _hip = new THREE.Vector3(), _hip2 = new THREE.Vector3();
export function makeOnFoot({ scene, rig, input, camera, sfx, onSplat }) {
  const st = { mode: 'seat', santa: null, local: new THREE.Vector3(0, FOOT.deckY, -0.3), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    face: 0, stun: 0, tumble: 0, calling: false, camYaw: 0, camPos: new THREE.Vector3(), ready: false, firing: false, zoom: 1, kick: 0, jumps: 0, flip: 0, camLook: new THREE.Vector3() };
  loadModels().then(M => {
    st.santa = makeSanta(M.santa, { role: 'idle', stance: 'foot' });
    st.santa.anim.preload('idle', 'walk', 'run', 'air', 'fire', 'tipsy');   // no first-use hitch when he changes gait
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
      st.local.set(0, FOOT.deckY, 1.1); st.face = rig.yaw; st.camYaw = rig.yaw; st.calling = false;
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
    st.tumble = 1.2; st.face = rig.yaw; st.camYaw = rig.yaw; st.calling = false; st.kick = 0.8;
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
    let f = groundH(x, z);
    for (const c of (rig.colliders || [])) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && y > c.top - 1.5) f = Math.max(f, c.top);
    return f;
  }
  function update(dt, t) {
    if (input.tap) { input.tap = false; if (st.mode !== 'seat') jumpPress = true; }   // right-pad tap = jump
    if (!st.ready || st.mode === 'seat') { if (st.santa) st.santa.holder.visible = false; return; }
    const S = st.santa;
    // stick -> a world direction, relative to the camera
    fwd.set(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); right.set(-fwd.z, 0, fwd.x);   // forward (sin h, cos h) -> right (-fz, fx)
    const mx = st.stun > 0 ? 0 : input.steer, my = st.stun > 0 ? 0 : input.climb, mag = Math.min(1, Math.hypot(mx, my));
    const want = v3.copy(fwd).multiplyScalar(my).addScaledVector(right, mx);
    const spd = mag > 0.85 ? FOOT.run : FOOT.walk;
    if (mag > 0.15) st.face = Math.atan2(want.x, want.z);
    if (st.firing) { const a = rig.aimTarget; if (a) st.face = Math.atan2(a.x - st.pos.x, a.z - st.pos.z); }
    const doJump = jumpPress && st.stun <= 0; jumpPress = false;

    if (st.mode === 'deck') {
      // move in sleigh-local space; the deck carries him
      const inv = rig.sleigh.g.quaternion.clone().invert();
      const lv = want.clone().applyQuaternion(inv); lv.y = 0;
      st.local.addScaledVector(lv, spd * dt);
      if (doJump) { st.mode = 'air'; st.jumps = 1; st.noCatch = FOOT.noCatch; sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); st.vel.y += FOOT.jump; sfx('whoosh', { vol: 0.4, rate: 1.5 }); setMode('air'); }
      else if (Math.abs(st.local.x) > FOOT.deckX + 0.15 || st.local.z < FOOT.deckZ0 - 0.2 || st.local.z > FOOT.deckZ1 + 0.2) {
        sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); st.jumps = 1; st.noCatch = FOOT.noCatch; setMode('air');   // walked off the edge
      } else sleighWorld(st.local, st.pos);
    } else {
      // air + ground: real world physics
      const onGround = st.mode === 'ground';
      if (onGround) {
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
          st.mode = 'ground'; setMode('ground'); st.tumble = 0; st.jumps = 0; st.flip = 0;
          if (impact > FOOT.splat) { st.stun = 1.4; onSplat?.(st.pos.clone(), impact); sfx('debris', { vol: 1, rate: 0.6 }); }
          else sfx('snow_puff', { vol: 0.7 });
        }
      } else if (st.mode === 'ground' && st.pos.y > floor + 0.4) { st.mode = 'air'; st.jumps = 1; setMode('air'); }
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
    if (st.stun > 0) baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 * Math.min(1, st.stun * 3)));   // flat on his back
    S.holder.quaternion.slerp(baseQ, st.stun > 0 ? 1 : 1 - Math.exp(-14 * dt));
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
    S.setIdle(st.mode === 'air' || st.tumble > 0 ? 'air' : moving ? (run ? 'run' : 'walk') : 'idle');
    S.anim.setSpeed(st.mode === 'air' || !moving ? 1 : THREE.MathUtils.clamp(hv / (run ? FOOT.runClip : FOOT.walkClip), 0.75, 1.8));
    S.setFiring(st.firing && !moving && st.mode !== 'air');   // shooting on the move keeps his legs walking (hands stay on the gun)
    // the camera (his note: it went crazy): level, never spins round when he backs up; it follows him only while he
    // moves forward / sideways, and turns when the aim is pushed hard to one side
    if (mag > 0.15 && my > -0.3 && st.mode !== 'air') {
      let dy = st.face - st.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.camYaw += dy * (1 - Math.exp(-1.2 * dt));
    }
    if (Math.abs(input.aimX) > 0.7) st.camYaw -= Math.sign(input.aimX) * (Math.abs(input.aimX) - 0.7) * 3.5 * dt;
    st.zoom += ((st.mode === 'air' || st.stun > 0 ? 1.5 : 1) + st.kick - st.zoom) * (1 - Math.exp(-2.5 * dt));
    st.kick *= Math.exp(-1.2 * dt);
  }

  function cameraUpdate(dt) {
    const back = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw));
    const want = st.pos.clone().addScaledVector(back, -6.5 * st.zoom); want.y = st.pos.y + 3.2 * st.zoom;
    want.y = Math.max(want.y, groundH(want.x, want.z) + 1.2);
    for (const c of (rig.colliders || [])) if (c.r > 0 && (want.x - c.x) ** 2 + (want.z - c.z) ** 2 < (c.r + 1) ** 2) want.y = Math.max(want.y, c.top + 1.5);   // never inside a house
    if (st.camPos.lengthSq() === 0 || st.camPos.distanceTo(want) > 60) st.camPos.copy(want);
    st.camPos.lerp(want, 1 - Math.exp(-(st.mode === 'air' || st.tumble > 0 ? 2.2 : 5) * dt));
    camera.position.copy(st.camPos);
    // the look point eases too, so a tumbling / bouncing Santa never whips the camera round
    _look.set(st.pos.x + back.x * 3, st.pos.y + 1.6, st.pos.z + back.z * 3);
    if (st.camLook.lengthSq() === 0 || st.camLook.distanceTo(_look) > 60) st.camLook.copy(_look);
    st.camLook.lerp(_look, 1 - Math.exp(-(st.mode === 'air' ? 3 : 8) * dt));
    camera.lookAt(st.camLook);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  }

  return {
    st, update, cameraUpdate, sleighInput, eject,
    get active() { return st.ready && st.mode !== 'seat'; },
    get santa() { return st.santa; },
    /** where the reticle rests when he's on foot: ahead of the camera, at about his height */
    aimRest(out) { const b = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); return out.copy(st.pos).addScaledVector(b, 22).setY(st.pos.y + 1.0); },
    setFiring(on) { st.firing = on; },
    crashZoom(k) { st.kick = Math.max(st.kick, k); },
  };
}
