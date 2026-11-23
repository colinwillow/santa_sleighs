// ?scene=kit -- THE KIT SHOWROOM: every neighborhood piece on one snowy lot, round the big tree, for inspecting
// pieces one by one. Same builders as the village (kit.js / ground.js).
import * as THREE from 'three';
import { rand, rr } from './util.js';
import { makeKit, finishKit, house, lampPost, telePole, wires, bench, firePit } from './kit.js';
import { makeFlora } from './ground.js';

export function buildKitShow(scene, world) {
  const K = makeKit(), flora = makeFlora(scene);
  const R = 30;
  const houses = [
    { style: 'victorian', floors: 2, gableFront: true }, { style: 'gingerbread', floors: 2, gableFront: true },
    { style: 'victorian', floors: 2, gableFront: false }, { style: 'gingerbread', floors: 1, gableFront: false },
    { style: 'gingerbread', floors: 2, gableFront: false }, { style: 'victorian', floors: 1, gableFront: true },
  ];
  houses.forEach((o, i) => {
    const a = i / houses.length * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
    house(K, x, z, Math.atan2(-x, -z), { ...o, toRoad: 13, walkOut: 0, fence: true });
    const b = a + Math.PI / houses.length, lx = Math.cos(b) * 20, lz = Math.sin(b) * 20;
    lampPost(K, lx, lz);
    flora.tree(i % 2 ? 'frost' : 'pine', Math.cos(b) * 34, Math.sin(b) * 34);
    flora.patch(Math.cos(b) * 26, Math.sin(b) * 26, 2.4, i % 2 ? 'grass' : 'dirt', 8);
  });
  // a run of telephone poles with wires behind the ring
  let prev = null;
  for (let k = 0; k < 6; k++) {
    const a = -0.5 + k * 0.32, x = Math.cos(a) * 46, z = Math.sin(a) * 46;
    const anc = telePole(K, x, z, -a);
    if (prev) wires(K, prev, anc, 0.9);
    prev = anc;
  }
  firePit(K, 9, 5, { s: 1.2 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.6; bench(K, Math.cos(a) * 12, Math.sin(a) * 12, Math.atan2(-Math.cos(a), -Math.sin(a))); }
  for (let k = 0; k < 60; k++) { const a = rand() * 6.28, r = rr(14, 44); flora.mound(Math.cos(a) * r, Math.sin(a) * r, rr(0.8, 1.8), rr(0.3, 0.6), rr(0.8, 1.6)); }
  finishKit(K, scene, world);
}
