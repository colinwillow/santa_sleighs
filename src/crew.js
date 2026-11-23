// THE CREW IN THE SLEIGH: Santa on a present crate (rifle idle clip, fires with the firing clip, fists on the gun),
// the driver elf on the front bench (sitting clip, hands on the reins), an elf on the sack (sitting clip, waving).
// Characters come from characters.js; this file only places them. Stand-ins stay until the GLBs load.
import * as THREE from 'three';
import { bevBox } from './util.js';
import { Rope } from './rope.js';
import { CREW, loadModels, makeSanta, makeElf, ik2 } from './characters.js';
export { CREW };

export async function loadCrew(rig, scene) {
  const M = await loadModels();
  const sl = rig.sleigh.g;

  const santa = makeSanta(M.santa);
  santa.holder.position.set(0, CREW.floorY, CREW.santaZ); sl.add(santa.holder);
  const crate = new THREE.Mesh(bevBox(1.3, CREW.floorY - 0.65, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: '#2f6a40', roughness: 0.7 }));
  crate.position.set(0, 0.65 + (CREW.floorY - 0.65) / 2, CREW.santaZ); crate.castShadow = true; sl.add(crate);
  const bench = new THREE.Mesh(bevBox(1.5, 0.3, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: '#7a1a20', roughness: 0.7 }));
  bench.position.set(0, 1.55, 1.15); bench.castShadow = true; sl.add(bench);

  const driver = makeElf(M.elf, { role: 'sit', seat: 0 });
  driver.holder.position.set(0.1, 1.78, 1.05); sl.add(driver.holder);
  const sackElf = makeElf(M.elf, { role: 'sit', seat: 0 });
  sackElf.holder.position.set(0.2, 2.5, -1.5); sackElf.holder.rotation.y = 0.35; sl.add(sackElf.holder);

  // driver: hands out on the reins, bobbing with the gallop
  const handR = new THREE.Vector3(), handL = new THREE.Vector3();
  driver.armIK = (e, t) => {
    const bob = Math.sin(t * 6) * 0.03, B = e.B;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, e.L(-0.18, 0.5 + bob, 0.42), e.L(-0.8, 0, -0.3));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, e.L(0.18, 0.5 - bob, 0.42), e.L(0.8, 0, -0.3));
    B.RightHand.getWorldPosition(handR); B.LeftHand.getWorldPosition(handL);
  };
  // sack elf: waves with her right hand
  sackElf.armIK = (e, t) => {
    const B = e.B;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, e.L(-0.32 + Math.sin(t * 7) * 0.1, 0.95, 0.15), e.L(-0.6, 0.2, -0.4));
  };
  const reins = [new Rope(scene, handL, rig.deer[2].hook, { segs: 10, radius: 0.025, color: '#8a2a20' }), new Rope(scene, handR, rig.deer[3].hook, { segs: 10, radius: 0.025, color: '#8a2a20' })];

  rig.santa.g.visible = false;
  rig.sleigh.mount.visible = false;

  const driverY = driver.holder.position.y;
  return {
    muzzle: santa.muzzle, eject: santa.eject, cigarTip: santa.cigarTip, rate: santa.rate,
    kick: () => santa.kick(), aim: p => santa.aimAt(p), setFiring: on => santa.setFiring(on),
    update(dt, t) {
      driver.holder.position.y = driverY + Math.abs(Math.sin(t * 6)) * CREW.jiggle.bounce;   // bouncing on the bench with the gallop
      santa.update(dt, t); driver.update(dt, t); sackElf.update(dt, t);
      for (const r of reins) r.update(dt);
    },
    debug: { santa, driver, sackElf },
  };
}
