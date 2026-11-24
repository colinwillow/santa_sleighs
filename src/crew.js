// THE CREW IN THE SLEIGH: Santa on a present crate (rifle idle clip, fires with the firing clip, fists on the gun),
// the driver elf on the front dash (sitting clip, hands on the reins) and the SIDEKICK elf on the sack right behind him
// (sitting clip, waves now and then, leans into turns, cheers when a house goes down / he grabs a cookie / a snowman drops).
// Characters come from characters.js; this file only places them. Stand-ins stay until the GLBs load.
// b41: both elves were never on screen -- their `sl.add(...)` calls had slipped onto the end of a `//` comment line.
import * as THREE from 'three';
import { bevBox } from './util.js';
import { Rope } from './rope.js';
import { CREW, loadModels, makeSanta, makeElf, ik2 } from './characters.js';
export { CREW };
// the sidekick elf on the sack (sleigh local; the sack top is ~3.1 m up round z -1.4)
export const SIDEKICK = { x: 0.3, y: 3.0, z: -1.35, ry: 0.25, lean: 0.35, cheerLen: 2.6 };

export async function loadCrew(rig, scene) {
  const M = await loadModels();
  const sl = rig.sleigh.g;

  const santa = makeSanta(M.santa, { role: 'tipsy' });   // milk-drunk Bad Santa: swaying even at rest
  santa.holder.position.set(0, CREW.floorY, CREW.santaZ); sl.add(santa.holder);
  const driver = makeElf(M.elf, { role: 'sit', seat: 0 });
  driver.holder.position.set(0.1, 1.55, 1.85);   // on the front dash, feet in the footwell
  sl.add(driver.holder);
  const sackElf = makeElf(M.elf, { role: 'sit', seat: 0 });
  sackElf.holder.position.set(SIDEKICK.x, SIDEKICK.y, SIDEKICK.z);   // on top of the sack, right behind Santa's left shoulder
  sackElf.holder.rotation.y = SIDEKICK.ry; sl.add(sackElf.holder);

  // driver: hands out on the reins, bobbing with the gallop
  const handR = new THREE.Vector3(), handL = new THREE.Vector3(), _rv = new THREE.Vector3();
  driver.armIK = (e, t) => {
    const bob = Math.sin(t * 6) * 0.03, B = e.B;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, e.L(-0.18, 0.5 + bob, 0.42), e.L(-0.8, 0, -0.3));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, e.L(0.18, 0.5 - bob, 0.42), e.L(0.8, 0, -0.3));
    B.RightHand.getWorldPosition(handR); B.LeftHand.getWorldPosition(handL);
  };
  // SIDEKICK (the sack elf): a wave now and then (right hand), cheers on the big moments, leans into the turns
  const SK = { waveT: 3, waving: 0, cheerT: 0, lean: 0, yaw: null, deadHouses: -1 };
  sackElf.armIK = (e, t) => {
    if (SK.waving <= 0 || SK.cheerT > 0) return;
    const B = e.B;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, e.L(-0.32 + Math.sin(t * 7) * 0.1, 0.95, 0.15), e.L(-0.6, 0.2, -0.4));
  };
  const cheer = () => {
    if (SK.cheerT > 0.8) return;
    SK.cheerT = SIDEKICK.cheerLen; SK.waving = 0;
    sackElf.anim.play('cheer_sit', 0.15, { once: true }).catch(() => {});
    window.sfx?.play('cookie_pickup', { vol: 0.25, rate: 1.6 });
  };
  const reins = [new Rope(scene, handL, rig.deer[2].hook, { segs: 10, radius: 0.025, color: '#8a2a20' }), new Rope(scene, handR, rig.deer[3].hook, { segs: 10, radius: 0.025, color: '#8a2a20' })];

  rig.santa.g.visible = false;
  rig.sleigh.mount.visible = false;

  const driverY = driver.holder.position.y;
  return {
    get muzzle() { return santa.muzzle; }, get eject() { return santa.eject; }, cigarTip: santa.cigarTip,
    get rate() { return santa.rate; }, get def() { return santa.def; }, setWeapon: k => santa.setWeapon(k),
    kick: () => santa.kick(), aim: p => santa.aimAt(p), setFiring: on => santa.setFiring(on),
    /** the sidekick's reactions: 'cheer' */
    react(kind) { if (kind === 'cheer') cheer(); },
    update(dt, t) {
      // sidekick: cheer when a house goes down (a town collider shrinks to 0), wave now and then, lean into turns
      if (rig.colliders) {
        let n = 0; for (const c of rig.colliders) if (c.town && c.r === 0) n++;
        if (SK.deadHouses >= 0 && n > SK.deadHouses) cheer();
        SK.deadHouses = n;
      }
      if (SK.cheerT > 0) { SK.cheerT -= dt; if (SK.cheerT <= 0) sackElf.anim.play('sit', 0.3); }
      else { SK.waveT -= dt; if (SK.waveT <= 0) { SK.waving = 2.2; SK.waveT = 6 + Math.random() * 6; } }
      SK.waving -= dt;
      sl.updateMatrixWorld();
      const fx = sl.matrixWorld.elements[8], fz = sl.matrixWorld.elements[10], yaw = Math.atan2(fx, fz);
      let w = 0; if (SK.yaw != null && dt > 0) { let d = yaw - SK.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w = d / dt; } SK.yaw = yaw;
      // +X is her LEFT: a left turn (yaw growing) leans her left = negative roll round her forward axis
      SK.lean += (THREE.MathUtils.clamp(-w * SIDEKICK.lean, -0.35, 0.35) - SK.lean) * (1 - Math.exp(-4 * dt));
      sackElf.holder.rotation.z = SK.lean;
      driver.holder.position.y = driverY + Math.abs(Math.sin(t * 6)) * CREW.jiggle.bounce;   // bouncing on the bench with the gallop
      santa.update(dt, t); driver.update(dt, t); sackElf.update(dt, t);
      // the RED LINES he kept seeing: the reins start at the driver elf's hands, which sat at the world origin (on the ground)
      // until her clip was ready / when her IK didn't run -- if a hand isn't on the sleigh, hold the rein at the dash instead
      if (handL.distanceTo(sl.position) > 4) handL.copy(sl.localToWorld(_rv.set(0.25, 1.9, 2.0)));
      if (handR.distanceTo(sl.position) > 4) handR.copy(sl.localToWorld(_rv.set(-0.25, 1.9, 2.0)));
      for (const r of reins) r.update(dt);
    },
    debug: { santa, driver, sackElf },
  };
}
