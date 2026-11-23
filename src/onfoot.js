// SANTA ON FOOT (his slice, Nov 23): hop out of the seat and stand on the deck while the sleigh flies itself (it holds its
// heading), walk around and shoot any direction; walk or jump off the edge and fall; land (hard landings knock him flat);
// a crash THROWS him out; on the ground he walks, runs, jumps and shoots; CALL brings the sleigh down low and slow, and he
// gets back on by touching its deck (or jumping into it). States: seat | deck | air | ground.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { loadModels, makeSanta } from './characters.js';

export const FOOT = {
  deckY: 0.72, deckX: 1.0, deckZ0: -2.0, deckZ1: 2.1,      // the sleigh's floor (sleigh-local metres)
  walk: 4.2, run: 7.5, jump: 7.5, gravity: 22,
  splat: 13,                                              // landing faster than this knocks him flat
  catchR: 2.6,                                            // how close the deck must pass to grab it from the ground / air
};

export function makeOnFoot({ scene, rig, input, camera, sfx, onSplat }) {
  const st = { mode: 'seat', santa: null, local: new THREE.Vector3(0, FOOT.deckY, -0.3), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    face: 0, stun: 0, tumble: 0, calling: false, camYaw: 0, camPos: new THREE.Vector3(), ready: false, firing: false };
  loadModels().then(M => {
    st.santa = makeSanta(M.santa, { role: 'idle' });
    try { st.santa.setWeapon(localStorage.getItem('weapon') || 'gatling'); } catch (e) { st.santa.setWeapon('gatling'); }
    st.santa.holder.visible = false; scene.add(st.santa.holder); st.ready = true;
  });

  // ---- buttons: HOP (out / sit / call), JUMP --------------------------------------------------------------------------
  const mk = (id, txt, css) => { const b = document.createElement('div'); b.className = 'btn'; b.id = id; b.textContent = txt; b.style.cssText = css; document.getElementById('hud').appendChild(b); return b; };
  const hop = mk('hopBtn', 'HOP OUT', 'width:auto;height:auto;border-radius:16px;padding:9px 12px;z-index:7;font-size:12px;top:calc(env(safe-area-inset-top) + 8px);right:calc(50% + 6px);background:linear-gradient(#e0343c,#a8141e)');
  const jump = mk('jumpBtn', 'JUMP', 'width:70px;height:70px;z-index:7;right:calc(env(safe-area-inset-right) + 18px);bottom:calc(env(safe-area-inset-bottom) + 150px);background:radial-gradient(circle at 40% 35%,#7fc8ff,#1a5aa8);display:none');
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
    jump.style.display = out ? 'grid' : 'none';
    document.getElementById('boost').style.display = out ? 'none' : '';
  }
  function hopAction() {
    if (!st.ready) return;
    if (st.mode === 'seat') {   // stand up on the deck, a step behind the seat
      st.local.set(0, FOOT.deckY, -0.6); st.face = rig.yaw; st.camYaw = rig.yaw; st.calling = false;
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
    st.tumble = 1.2; st.face = rig.yaw; st.camYaw = rig.yaw; st.calling = false;
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
      if (doJump) { st.mode = 'air'; sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); st.vel.y += FOOT.jump; sfx('whoosh', { vol: 0.4, rate: 1.5 }); setMode('air'); }
      else if (Math.abs(st.local.x) > FOOT.deckX + 0.15 || st.local.z < FOOT.deckZ0 - 0.2 || st.local.z > FOOT.deckZ1 + 0.2) {
        sleighWorld(st.local, st.pos); st.vel.copy(rig.SV).add(want.clone().multiplyScalar(spd)); setMode('air');   // walked off the edge
      } else sleighWorld(st.local, st.pos);
    } else {
      // air + ground: real world physics
      const onGround = st.mode === 'ground';
      if (onGround) {
        const k = 1 - Math.exp(-12 * dt);
        st.vel.x += (want.x * spd - st.vel.x) * k; st.vel.z += (want.z * spd - st.vel.z) * k;
        if (doJump) { st.vel.y = FOOT.jump; st.mode = 'air'; setMode('air'); sfx('whoosh', { vol: 0.3, rate: 1.6 }); }
      } else { st.vel.x += want.x * 3 * dt; st.vel.z += want.z * 3 * dt; st.vel.x *= Math.exp(-0.3 * dt); st.vel.z *= Math.exp(-0.3 * dt); }
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
          st.mode = 'ground'; setMode('ground'); st.tumble = 0;
          if (impact > FOOT.splat) { st.stun = 1.4; onSplat?.(st.pos.clone(), impact); sfx('debris', { vol: 1, rate: 0.6 }); }
          else sfx('snow_puff', { vol: 0.7 });
        }
      } else if (st.mode === 'ground' && st.pos.y > floor + 0.4) { st.mode = 'air'; setMode('air'); }
      // catch the sleigh: its deck passes close -> he's on it
      sleighWorld(new THREE.Vector3(0, FOOT.deckY, 0), deckW);
      if (st.stun <= 0 && st.pos.distanceTo(deckW) < FOOT.catchR) {
        toSleighLocal(st.pos, st.local); st.local.y = FOOT.deckY;
        st.local.x = THREE.MathUtils.clamp(st.local.x, -FOOT.deckX, FOOT.deckX); st.local.z = THREE.MathUtils.clamp(st.local.z, FOOT.deckZ0, FOOT.deckZ1);
        st.calling = false; setMode('deck'); sfx('debris', { vol: 0.5, rate: 1.4 });
      }
    }
    st.stun = Math.max(0, st.stun - dt);
    st.tumble = Math.max(0, st.tumble - dt);

    // place + pose him
    S.holder.position.copy(st.pos);
    const baseQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.face);
    if (st.stun > 0) baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 * Math.min(1, st.stun * 3)));   // flat on his back
    if (st.tumble > 0) baseQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t * 9));                                // cartwheeling out
    S.holder.quaternion.slerp(baseQ, st.tumble > 0 || st.stun > 0 ? 1 : 1 - Math.exp(-14 * dt));
    const moving = (st.mode === 'deck' ? mag : Math.hypot(st.vel.x, st.vel.z) / FOOT.run) > 0.15;
    S.setIdle(st.mode === 'air' ? 'jump' : moving ? (mag > 0.85 ? 'run' : 'walk') : 'tipsy');
    // the camera: behind him, turning slowly with where he faces
    let dy = st.face - st.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    st.camYaw += dy * (1 - Math.exp(-(mag > 0.15 ? 1.6 : 0.5) * dt));
  }

  function cameraUpdate(dt) {
    const back = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw));
    const want = st.pos.clone().addScaledVector(back, -6.5); want.y = st.pos.y + 3.2;
    want.y = Math.max(want.y, groundH(want.x, want.z) + 1.2);
    if (st.camPos.lengthSq() === 0) st.camPos.copy(want);
    st.camPos.lerp(want, 1 - Math.exp(-6 * dt));
    camera.position.copy(st.camPos);
    camera.lookAt(st.pos.x + back.x * 3, st.pos.y + 1.6, st.pos.z + back.z * 3);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  }

  return {
    st, update, cameraUpdate, sleighInput, eject,
    get active() { return st.ready && st.mode !== 'seat'; },
    get santa() { return st.santa; },
    /** where the reticle rests when he's on foot: ahead of the camera, at about his height */
    aimRest(out) { const b = new THREE.Vector3(Math.sin(st.camYaw), 0, Math.cos(st.camYaw)); return out.copy(st.pos).addScaledVector(b, 22).setY(st.pos.y + 1.0); },
    setFiring(on) { st.firing = on; st.santa?.setFiring(on); },
  };
}
