// LAYOUT of the village (after images/reference/village_dusk.jpg): a winding road loop with curbs + sidewalks,
// kit houses facing it (victorian + gingerbread), lamp posts, telephone poles + wires, benches, fire pits,
// a plaza round the big tree, a dirt road out to the farms, yard dressing, cars. Pieces come from kit.js;
// this file only decides where they go.
import * as THREE from 'three';
import { groundH, VILLAGE_R, POND, MENU_SPOT } from './terrain.js';
import { rand, rr, T, Batch, BOX, BLOB, CYL, bevBox, softDot } from './util.js';
import { makeKit, finishKit, house, lampPost, telePole, wires, bench, firePit, PAL } from './kit.js';
import { makeFlora } from './ground.js';

const LOOP = [[-50, -30], [-20, -46], [14, -36], [44, -52], [62, -22], [40, 4], [56, 30], [36, 54], [2, 40], [-24, 58], [-58, 38], [-42, 6]];
export const ROAD = { half: 3.6, curbH: 0.22, walk: 2.2, y: 0.06 };
const DIRT = [[62, -22], [90, -26], [120, -12], [150, -20], [182, -4], [212, 10]];

export function buildVillage(scene, world) {
  const K = makeKit(), flora = makeFlora(scene);
  const R = new Batch();
  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const NS = 420, pts = curve.getSpacedPoints(NS).slice(0, NS), tan = [], nrm = [];
  for (let i = 0; i < NS; i++) {
    const t = new THREE.Vector3().subVectors(pts[(i + 1) % NS], pts[(i + NS - 1) % NS]).setY(0).normalize();
    tan.push(t); nrm.push(new THREE.Vector3(-t.z, 0, t.x));
  }
  const roadDist = (x, z) => { let m = 1e9; for (let i = 0; i < NS; i += 2) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };

  // ---- dirt road out to the farms (its own ribbon, follows the terrain) ------------------------
  const dirtCurve = new THREE.CatmullRomCurve3(DIRT.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const DN = 120, dpts = dirtCurve.getSpacedPoints(DN);
  const dirtDist = (x, z) => { let m = 1e9; for (const p of dpts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  world.avoid.push((x, z) => dirtDist(x, z) < 7 || roadDist(x, z) < 9);

  // ---- road ribbons ----------------------------------------------------------------------------
  const ribbon = (P, N, o1, o2, yf1, yf2, color, closed = true) => {
    const out = [], n = P.length - (closed ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % P.length, p = P[i], q = P[j], a_ = N[i], b_ = N[j];
      const v = (pp, nn, o, yf) => [pp.x + nn.x * o, yf(pp.x + nn.x * o, pp.z + nn.z * o), pp.z + nn.z * o];
      const A = v(p, a_, o1, yf1), B = v(p, a_, o2, yf2), C = v(q, b_, o1, yf1), D = v(q, b_, o2, yf2);
      out.push(...A, ...B, ...C, ...C, ...B, ...D);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.computeVertexNormals();
    const Nn = g.attributes.normal; for (let i = 0; i < Nn.count; i++) if (Nn.getY(i) < 0) Nn.setXYZ(i, -Nn.getX(i), -Nn.getY(i), -Nn.getZ(i));
    R.add(g, color, null, 0.02);
  };
  const { half, curbH, walk, y } = ROAD, top = y + curbH, K0 = () => y, K1 = () => top, G = () => 0;
  ribbon(pts, nrm, -half, half, K0, K0, '#2c3040');                              // asphalt
  for (const s of [-1, 1]) {
    ribbon(pts, nrm, s * (half - 0.7), s * half, () => y + 0.012, () => y + 0.03, '#e8ecfa');   // slush drifted against the curb
    ribbon(pts, nrm, s * half, s * half, K0, K1, '#d9d6e2');                    // curb face
    ribbon(pts, nrm, s * half, s * (half + 0.3), K1, K1, '#e6e3ee');            // curb top
    ribbon(pts, nrm, s * (half + 0.3), s * (half + walk), K1, K1, '#bdb6c6');   // sidewalk
    ribbon(pts, nrm, s * (half + walk), s * (half + walk), K1, G, '#c9c3d2');   // outer lip
  }
  for (let i = 0; i < NS; i += 6) {   // centre dashes
    const p = pts[i], t = tan[i];
    R.add(BOX, '#efe2b0', T(p.x, y + 0.012, p.z, 0.14, 0.01, 2.2, 0, Math.atan2(t.x, t.z), 0), 0);
  }
  for (let i = 0; i < NS; i += 2) for (const s of [-1, 1]) {   // sidewalk slab seams
    const p = pts[i], n = nrm[i], o = s * (half + 0.3 + walk / 2), t = tan[i];
    R.add(BOX, '#9e97a8', T(p.x + n.x * o, top + 0.005, p.z + n.z * o, walk - 0.1, 0.01, 0.05, 0, Math.atan2(t.x, t.z), 0), 0);
  }
  {   // dirt road: snow shoulders, a muddy bed, two dark ruts
    const dn = [], gy = (x, z) => groundH(x, z) + 0.22;
    for (let i = 0; i <= DN; i++) { const a = dpts[Math.max(0, i - 1)], b = dpts[Math.min(DN, i + 1)]; const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize(); dn.push(new THREE.Vector3(-t.z, 0, t.x)); }
    ribbon(dpts, dn, -2.6, 2.6, gy, gy, '#8a7468', false);
    for (const o of [-1.05, 1.05]) ribbon(dpts, dn, o - 0.3, o + 0.3, (x, z) => groundH(x, z) + 0.24, (x, z) => groundH(x, z) + 0.24, '#4e3a30', false);
    ribbon(dpts, dn, -0.4, 0.4, (x, z) => groundH(x, z) + 0.24, (x, z) => groundH(x, z) + 0.24, '#d8d4e4', false);   // snow between ruts
    for (let i = 2; i < DN; i += 2) for (const s of [-1, 1]) {
      const p = dpts[i], n = dn[i], o = s * rr(2.6, 3.4), x = p.x + n.x * o, z = p.z + n.z * o;
      flora.mound(x, z, rr(0.8, 1.5), rr(0.3, 0.55), rr(0.8, 1.4));
      if (rand() < 0.25) flora.patch(x + n.x * s * 1.5, z + n.z * s * 1.5, rr(1.2, 2.2), 'grass', 5);
    }
    // fence posts with a single wire along one side
    let prev = null;
    for (let i = 4; i < DN; i += 5) {
      const p = dpts[i], n = dn[i], x = p.x + n.x * 4.2, z = p.z + n.z * 4.2, gy0 = groundH(x, z);
      K.S.add(CYL, PAL.woodDark, T(x, gy0 + 0.6, z, 0.08, 1.2, 0.08));
      K.S.add(BLOB, PAL.snow, T(x, gy0 + 1.22, z, 0.1, 0.06, 0.1), 0.02);
      const cur = new THREE.Vector3(x, gy0 + 1.0, z);
      if (prev) wires(K, [prev], [cur], 0.15);
      prev = cur;
    }
  }

  // ---- houses along the loop -------------------------------------------------------------------
  const OFF = 17, houses = [], placed = [];
  for (let i = 0; i < NS; i += 9) for (const side of [-1, 1]) {
    if (rand() < 0.25) continue;
    const p = pts[i], n = nrm[i], x = p.x + n.x * side * OFF, z = p.z + n.z * side * OFF;
    if (Math.hypot(x, z) < 24 || Math.hypot(x, z) > VILLAGE_R - 4) continue;
    if (roadDist(x, z) < OFF - 1.5 || dirtDist(x, z) < 12) continue;
    if (Math.hypot(x - MENU_SPOT.x, z - MENU_SPOT.z) < MENU_SPOT.clear + 6) continue;   // keep the start-screen stage clear
    if (placed.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < 16 ** 2)) continue;
    placed.push({ x, z });
    const style = rand() < 0.4 ? 'gingerbread' : 'victorian';
    houses.push(house(K, x, z, Math.atan2(-n.x * side, -n.z * side), { style, toRoad: OFF, walkOut: half + walk }));
  }
  // farms at the end of the dirt road and out in the hills
  const end = dpts[DN];
  houses.push(house(K, end.x + 4, end.z + 14, Math.PI, { style: 'gingerbread' }));
  for (let k = 0; k < 8; k++) {
    const a = rr(0, Math.PI * 2), r = rr(140, 230), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 22 || dirtDist(x, z) < 14) continue;
    houses.push(house(K, x, z, rr(0, 6.28), { style: rand() < 0.5 ? 'gingerbread' : 'victorian' }));
  }
  const obstacles = houses.map(h => ({ x: h.x, z: h.z, r: h.r }));
  // THE START-SCREEN STAGE: cleared ground, a fire pit beside the crew, a lamp, a bench, two framing pines behind the camera line
  {
    const M = MENU_SPOT, d = Math.hypot(M.x, M.z), ox = M.x / d, oz = M.z / d, sx = oz, sz = -ox;   // out (toward the pond) + side
    obstacles.push({ x: M.x, z: M.z, r: M.clear });
    firePit(K, M.x - sx * 3.6 - ox * 1.2, M.z - sz * 3.6 - oz * 1.2, { s: 0.9, seats: false });
    lampPost(K, M.x + sx * 4.2 - ox * 2.5, M.z + sz * 4.2 - oz * 2.5);
    bench(K, M.x + sx * 3.2 - ox * 1.0, M.z + sz * 3.2 - oz * 1.0, Math.atan2(-sx, -sz));
    for (const [a, b] of [[-9, -3], [8.5, -4], [-12, 4], [12, 3]]) flora.tree(a < 0 ? 'pine' : 'frost', M.x + sx * a - ox * b, M.z + sz * a - oz * b, 1.3);
    for (let k = 0; k < 10; k++) { const a = rr(-14, 14), b = rr(-8, 2); if (Math.abs(a) < 6 && b > -4) continue; flora.mound(M.x + sx * a - ox * b, M.z + sz * a - oz * b, rr(0.8, 1.6), rr(0.3, 0.6), rr(0.8, 1.4)); }
  }
  const pathNear = (hh, x, z) => {
    const dx = hh.front.x - hh.x, dz = hh.front.z - hh.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = x - hh.x, pz = z - hh.z;
    return Math.abs(px * -uz + pz * ux) < 1.8 && px * ux + pz * uz > 0 && px * px + pz * pz < 500;
  };
  const free = (x, z, r) => roadDist(x, z) > half + walk + 1.0 + r && dirtDist(x, z) > 3.5 + r && Math.hypot(x, z) > 9 + r
    && obstacles.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + r) ** 2) && !houses.some(hh => pathNear(hh, x, z));

  // backyard fire pits
  for (const hh of houses.slice(0, -1)) {
    if (rand() > 0.4) continue;
    const bx = hh.x - (hh.front.x - hh.x) / (hh.d / 2) * (hh.d / 2 + 6), bz = hh.z - (hh.front.z - hh.z) / (hh.d / 2) * (hh.d / 2 + 6);
    if (!free(bx, bz, 3.2)) continue;
    firePit(K, bx, bz); obstacles.push({ x: bx, z: bz, r: 3.4 });
  }

  // ---- the plaza: benches round the big tree, a big fire pit, string-light poles ----------------
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.3, x = Math.cos(a) * 11.5, z = Math.sin(a) * 11.5;
    if (!free(x, z, 1.2)) continue;
    bench(K, x, z, Math.atan2(-x, -z)); obstacles.push({ x, z, r: 1.6 });
  }
  for (let tries = 0; tries < 200; tries++) {
    const a = rand() * 6.28, r = rr(15, 22), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 3.5)) continue;
    firePit(K, x, z, { s: 1.3 }); obstacles.push({ x, z, r: 4 }); break;
  }

  // ---- street furniture along the loop ----------------------------------------------------------
  for (let i = 3, s = 1; i < NS; i += 15, s = -s) {
    const p = pts[i], n = nrm[i], o = s * (half + 1.1);
    lampPost(K, p.x + n.x * o, p.z + n.z * o, top);
  }
  let prev = null, prevI = -99;
  for (let i = 0; i < NS; i += 26) {
    const p = pts[i], n = nrm[i], o = half + walk + 0.9, x = p.x + n.x * o, z = p.z + n.z * o;
    if (houses.some(hh => pathNear(hh, x, z)) || roadDist(x, z) < o - 0.5) { prev = null; continue; }
    const anchors = telePole(K, x, z, Math.atan2(tan[i].x, tan[i].z) + Math.PI / 2);
    obstacles.push({ x, z, r: 1 });
    if (prev && i - prevI <= 52) wires(K, prev, anchors, 0.9);
    prev = anchors; prevI = i;
  }
  for (let i = 40; i < NS; i += 70) {
    const p = pts[i], n = nrm[i], o = -(half + walk - 0.55), x = p.x + n.x * o, z = p.z + n.z * o;
    if (houses.some(hh => pathNear(hh, x, z))) continue;
    bench(K, x, z, Math.atan2(n.x, n.z));
  }

  // ---- snow banks along the sidewalk edges (gaps at the paths) ----------------------------------
  for (let i = 0; i < NS; i++) for (const s of [-1, 1]) {
    if (rand() < 0.35) continue;
    const p = pts[i], n = nrm[i], o = s * (half + walk + rr(0.6, 1.4)), x = p.x + n.x * o, z = p.z + n.z * o;
    if (roadDist(x, z) < half + walk + 0.3 || houses.some(hh => pathNear(hh, x, z))) continue;
    flora.mound(x, z, rr(0.7, 1.5), rr(0.35, 0.7), rr(0.7, 1.4), 0);
  }

  // ---- yards: trees, bushes, mounds, grass + dirt showing through --------------------------------
  const trees = [];
  for (let tries = 0; tries < 7000; tries++) {
    const a = rr(0, 6.283), r = Math.sqrt(rand()) * (VILLAGE_R + 14), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const k = rand(), kind = k < 0.4 ? 'frost' : k < 0.72 ? 'pine' : k < 0.86 ? 'bush' : 'mound';
    const R_ = kind === 'frost' ? 2.4 : kind === 'pine' ? 2.2 : 1;
    if (!free(x, z, R_) || trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + R_) ** 2)) continue;
    if (kind === 'mound') flora.mound(x, z, rr(1, 2.2), rr(0.4, 0.8), rr(1, 2));
    else {
      flora.tree(kind, x, z);
      if (kind !== 'bush' && rand() < 0.5) flora.patch(x, z, rr(1.6, 2.6), rand() < 0.6 ? 'dirt' : 'grass', 4);   // melt ring under the tree
    }
    trees.push({ x, z, r: R_ });
  }
  for (let tries = 0, n = 0; tries < 2000 && n < 90; tries++) {
    const a = rr(0, 6.283), r = Math.sqrt(rand()) * (VILLAGE_R + 10), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 1)) continue;
    flora.patch(x, z, rr(1.2, 3), rand() < 0.75 ? 'grass' : 'dirt', 8); n++;
  }

  // ---- meshes ------------------------------------------------------------------------------------
  finishKit(K, scene, world);
  const road = R.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }));
  road.castShadow = false; scene.add(road);

  // ---- cars: two parked, three driving the loop ---------------------------------------------------
  const carDefs = ['#c42a2a', '#2a3440', '#5a6a88', '#e0d8c0', '#3a5a4a'];
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); lightMat.color.setScalar(2);
  const length = curve.getLength();
  const cars = carDefs.map((col, i) => {
    const b = new Batch(), l = new Batch(), parked = i < 2;
    b.add(bevBox(1.9, 0.75, 4.2, 0.25, 3), col, T(0, 0.62, 0));
    b.add(bevBox(1.62, 0.6, 2.1, 0.22, 3), '#1c2233', T(0, 1.22, -0.25));
    b.add(bevBox(1.68, 0.14, 2.0, 0.07), col, T(0, 1.52, -0.25));
    if (parked) b.add(BLOB, PAL.snow, T(0, 1.62, -0.25, 0.8, 0.14, 1.0), 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) b.add(CYL, '#15151b', T(sx * 0.9, 0.36, sz, 0.36, 0.26, 0.36, 0, 0, Math.PI / 2));
    for (const sx of [-0.62, 0.62]) { l.add(BOX, parked ? '#332d20' : '#fff2cc', T(sx, 0.72, 2.12, 0.42, 0.18, 0.05), 0); l.add(BOX, parked ? '#200808' : '#ff2a2a', T(sx, 0.72, -2.12, 0.42, 0.16, 0.05), 0); }
    const g = new THREE.Group();
    const body = new THREE.Mesh(b.geometry(), solidMat); body.castShadow = true;
    g.add(body, new THREE.Mesh(l.geometry(), lightMat));
    if (!parked) {
      const hp = new THREE.Mesh(new THREE.PlaneGeometry(4, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffe8b0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      hp.position.set(0, 0.05, 5.5); g.add(hp);
    }
    scene.add(g);
    return { g, parked, u: (i * 0.23 + 0.05) % 1, dir: i % 2 ? -1 : 1, speed: rr(6, 9) };
  });
  const _t = new THREE.Vector3(), _p = new THREE.Vector3();
  const placeCar = (c, lane) => {
    curve.getPointAt(c.u, _p); curve.getTangentAt(c.u, _t); _t.y = 0; _t.normalize();
    const o = lane * c.dir;
    c.g.position.set(_p.x - _t.z * o, ROAD.y, _p.z + _t.x * o);
    c.g.rotation.y = Math.atan2(_t.x * c.dir, _t.z * c.dir);
  };
  for (const c of cars) placeCar(c, c.parked ? 2.6 : 1.75);
  world.update.push((t, dt) => { for (const c of cars) if (!c.parked) { c.u = (c.u + c.dir * c.speed * dt / length + 1) % 1; placeCar(c, 1.75); } });
}
