// The village, after images/reference/village_dusk.jpg: a winding road with curbs + sidewalks, two-storey houses
// facing it (puffy snow roofs, porches, string lights, glowing windows), lamp posts with warm light pools,
// frosted round trees + snowy pines in the yards, snow banks, cars (some parked, some driving the loop).
// Everything static is batched into a handful of meshes (vertex colours) so the phone draws few calls.
import * as THREE from 'three';
import { groundH, VILLAGE_R, POND } from './terrain.js';
import { rand, rr, pick, T, Batch, BOX, BLOB, BALL, CYL, bevBox, gable, softDot } from './util.js';

const SIDING = ['#a8443a', '#5f6f8f', '#d6c3a3', '#7d8aa3', '#8a5a6a', '#4f5f7f'];
const TRIM = '#efe6da', SNOW = '#f3f5ff', SNOW_SHADE = '#cdd6f2', BRICK = '#8c4a3c';
const WARM = ['#ffcf86', '#ffc070', '#ffd9a0'];
const BULBS_MULTI = ['#ff4b4b', '#ffd34a', '#4bc3ff', '#7dff7a', '#ff8bf0'];

// the road: a closed winding loop around the square (the big tree sits in the middle)
const LOOP = [[-50, -30], [-20, -46], [14, -36], [44, -52], [62, -22], [40, 4], [56, 30], [36, 54], [2, 40], [-24, 58], [-58, 38], [-42, 6]];
const ROAD = { half: 3.6, curbH: 0.22, walk: 2.2, y: 0.06 };

export function buildVillage(scene, world) {
  const S = new Batch();   // solid, lit
  const L = new Batch();   // emissive (windows, bulbs, lamps)
  const R = new Batch();   // road surfaces (double sided)
  const halos = [], haloCol = [];     // big soft glows (windows, lamps)
  const sparks = [], sparkCol = [];   // small glows (bulbs)
  const pools = [];                   // warm light pools on the ground {x,z,r,c}
  const houses = [];

  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const NS = 420, pts = curve.getSpacedPoints(NS), tan = [], nrm = [];
  for (let i = 0; i < NS; i++) {
    const a = pts[(i + NS - 1) % NS], b = pts[(i + 1) % NS];
    const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    tan.push(t); nrm.push(new THREE.Vector3(-t.z, 0, t.x));
  }
  const roadDist = (x, z) => { let m = 1e9; for (let i = 0; i < NS; i += 2) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };

  // ---- road ribbons ------------------------------------------------------------------------
  const ribbon = (o1, o2, y1, y2, color) => {
    const P = [];
    for (let i = 0; i < NS; i++) {
      const j = (i + 1) % NS, p = pts[i], q = pts[j], n = nrm[i], m = nrm[j];
      const a = [p.x + n.x * o1, y1, p.z + n.z * o1], b = [p.x + n.x * o2, y2, p.z + n.z * o2];
      const c = [q.x + m.x * o1, y1, q.z + m.z * o1], d = [q.x + m.x * o2, y2, q.z + m.z * o2];
      P.push(...a, ...b, ...c, ...c, ...b, ...d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
    // ribbons wind either way; point every normal up-ish / outward consistently
    const N = g.attributes.normal; for (let i = 0; i < N.count; i++) if (y1 === y2 && N.getY(i) < 0) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    R.add(g, color, null, 0.02);
  };
  const { half, curbH, walk, y } = ROAD, top = y + curbH;
  ribbon(-half, half, y, y, '#2c3040');                                   // asphalt
  for (const s of [-1, 1]) {
    ribbon(s * half, s * half, y, top, '#d9d6e2');                        // curb face
    ribbon(s * half, s * (half + 0.3), top, top, '#e6e3ee');              // curb top
    ribbon(s * (half + 0.3), s * (half + walk), top, top, '#bdb6c6');     // sidewalk
    ribbon(s * (half + walk), s * (half + walk), top, 0, '#c9c3d2');      // outer lip
  }
  // centre-line dashes
  for (let i = 0; i < NS; i += 6) {
    const p = pts[i], t = tan[i];
    R.add(BOX, '#efe2b0', T(p.x, y + 0.012, p.z, 0.14, 0.01, 2.2, 0, Math.atan2(t.x, t.z), 0), 0);
  }

  // ---- houses along the road ---------------------------------------------------------------
  const OFF = 16.5;
  const placed = [];
  for (let i = 0; i < NS; i += 9) {
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      const p = pts[i], n = nrm[i];
      const x = p.x + n.x * side * OFF, z = p.z + n.z * side * OFF;
      if (Math.hypot(x, z) < 22) continue;                                    // the square
      if (Math.hypot(x, z) > VILLAGE_R - 4) continue;
      if (roadDist(x, z) < OFF - 1.5) continue;                               // too close to another stretch of road
      if (placed.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < 15.5 ** 2)) continue;
      const ry = Math.atan2(-n.x * side, -n.z * side);                        // front (+Z) faces the road
      placed.push({ x, z });
      houses.push(house(x, z, ry, OFF));
    }
  }
  // a few farmhouses out in the hills
  for (let k = 0; k < 9; k++) {
    const a = rr(0, Math.PI * 2), r = rr(140, 230), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 22) continue;
    houses.push(house(x, z, rr(0, 6.28), 0));
  }

  function house(x, z, ry, toRoad) {
    const gy = groundH(x, z);
    const H = T(x, gy, z, 1, 1, 1, 0, ry, 0);
    const at = (...a) => H.clone().multiply(T(...a));
    const wp = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(H);
    const w = rr(8.2, 10.5), d = rr(7.2, 9), floors = rand() < 0.8 ? 2 : 1, fh = 3.2, base = 0.6;
    const h = base + floors * fh;
    const wall = pick(SIDING), multi = rand() < 0.5;
    const bulbCol = () => multi ? pick(BULBS_MULTI) : '#ffd890';

    S.add(bevBox(w + 0.4, base, d + 0.4, 0.08), '#77707e', at(0, base / 2, 0));
    S.add(bevBox(w, h - base, d, 0.12), wall, at(0, base + (h - base) / 2, 0));
    if (floors === 2) S.add(bevBox(w + 0.16, 0.2, d + 0.16, 0.06), TRIM, at(0, base + fh, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add(bevBox(0.26, h - base, 0.26, 0.06), TRIM, at(sx * w / 2, base + (h - base) / 2, sz * d / 2));

    // roof + pillowy snow cap + drips
    const front = rand() < 0.5;                       // gable faces the street, or ridge along the street
    const span = (front ? w : d) + 1.3, deep = (front ? d : w) + 1.3, rise = span * 0.42;
    const rot = front ? 0 : Math.PI / 2;
    S.add(gable(span, rise, deep, 0.1), pick(['#4a3a44', '#3e4658', '#5a3c34']), at(0, h - 0.1, 0, 1, 1, 1, 0, rot, 0));
    S.add(gable(span + 0.2, rise + 0.3, deep + 0.1, 0.5, 4), SNOW, at(0, h + 0.12, 0, 1, 1, 1, 0, rot, 0), 0.03);
    // eave lines (local) where snow drips and lights hang
    const eaves = [], rakes = [];
    const ex = w / 2 + 0.65, ez = d / 2 + 0.65;
    if (front) {
      eaves.push([[-ex, -ez], [-ex, ez]], [[ex, -ez], [ex, ez]]);
      rakes.push([new THREE.Vector3(-ex, h, ez + 0.1), new THREE.Vector3(0, h + rise + 0.15, ez + 0.1), new THREE.Vector3(ex, h, ez + 0.1)]);
    } else {
      eaves.push([[-ex, ez], [ex, ez]], [[-ex, -ez], [ex, -ez]]);
      rakes.push([new THREE.Vector3(-ex - 0.1, h, -ez), new THREE.Vector3(-ex - 0.1, h + rise + 0.15, 0), new THREE.Vector3(-ex - 0.1, h, ez)]);
      rakes.push([new THREE.Vector3(ex + 0.1, h, -ez), new THREE.Vector3(ex + 0.1, h + rise + 0.15, 0), new THREE.Vector3(ex + 0.1, h, ez)]);
    }
    for (const [[ax, az], [bx, bz]] of eaves) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.9));
      for (let k = 0; k <= n; k++) {
        const t = k / n, lx = ax + (bx - ax) * t, lz = az + (bz - az) * t;
        S.add(BLOB, SNOW, at(lx * 1.01, h + 0.08, lz * 1.01, rr(0.4, 0.6), rr(0.22, 0.34), rr(0.4, 0.6), 0, rand() * 6, 0), 0.04);
      }
      lights(new THREE.Vector3(ax * 1.03, h - 0.12, az * 1.03), new THREE.Vector3(bx * 1.03, h - 0.12, bz * 1.03), 0.18);
    }
    for (const [a, b, c] of rakes) { lights(a, b, 0.05); lights(b, c, 0.05); }
    function lights(a, b, sag) {
      const len = a.distanceTo(b), n = Math.max(2, Math.round(len / 0.6));
      for (let k = 0; k <= n; k++) {
        const t = k / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI * Math.max(1, Math.round(len / 2.5))) ** 2 * sag;
        const c = bulbCol(); L.add(BALL, c, at(p.x, p.y, p.z, 0.08, 0.08, 0.08), 0);
        sparks.push(wp(p.x, p.y, p.z)); sparkCol.push(c);
      }
    }
    if (front) {   // round attic window in the street gable
      const r = rise * 0.16;
      S.add(CYL, TRIM, at(0, h + rise * 0.38, d / 2 + 0.04, r + 0.12, 0.1, r + 0.12, Math.PI / 2, 0, 0));
      L.add(CYL, pick(WARM), at(0, h + rise * 0.38, d / 2 + 0.1, r, 0.06, r, Math.PI / 2, 0, 0), 0);
      halos.push(wp(0, h + rise * 0.38, d / 2 + 0.5)); haloCol.push('#ffb050');
    } else if (rand() < 0.75) {   // dormer on the street slope
      const dz = d * 0.22, dy = h + rise * 0.3, dw = 2.4;
      S.add(bevBox(dw, 2.0, 2.6, 0.08), wall, at(0, dy + 0.6, dz));
      S.add(gable(dw + 0.6, 1.1, 3.0, 0.08), '#3e4658', at(0, dy + 1.55, dz));
      S.add(gable(dw + 0.8, 1.35, 3.1, 0.35, 3), SNOW, at(0, dy + 1.65, dz), 0.03);
      window_(0, dy + 0.6, dz + 1.3, 1.0, 1.1);
    }

    // chimney with a snow cap (smoke source)
    const cx = (front ? 1 : 0.6) * w * 0.26, cz = front ? -d * 0.2 : -d * 0.2;
    const roofAt = front ? h + rise * (1 - Math.abs(cx) / (span / 2)) : h + rise * (1 - Math.abs(cz) / (span / 2));
    S.add(bevBox(1.1, 3.4, 1.1, 0.06), BRICK, at(cx, roofAt + 0.4, cz));
    S.add(BLOB, SNOW, at(cx, roofAt + 2.15, cz, 0.75, 0.32, 0.75), 0.03);
    world.chimneys.push(wp(cx, roofAt + 2.4, cz));

    // windows
    function window_(lx, ly, lz, ww = 1.05, wh = 1.45, rotY = 0) {
      const lit = rand() > 0.12;
      const M = (ox, oy, oz, sx, sy, sz) => at(lx + Math.cos(rotY) * ox + Math.sin(rotY) * oz, ly + oy, lz - Math.sin(rotY) * ox + Math.cos(rotY) * oz, sx, sy, sz, 0, rotY, 0);
      S.add(BOX, TRIM, M(0, 0, 0, ww + 0.28, wh + 0.28, 0.12));
      S.add(BOX, TRIM, M(0, -wh / 2 - 0.16, 0.08, ww + 0.5, 0.12, 0.3));          // sill
      S.add(BLOB, SNOW, M(0, -wh / 2 - 0.06, 0.12, ww * 0.55, 0.1, 0.16), 0.02);  // snow on the sill
      if (lit) {
        const c = pick(WARM);
        L.add(BOX, c, M(0, 0, 0.04, ww, wh, 0.1), 0.08);
        const hp = M(0, 0, 0.6, 1, 1, 1); halos.push(new THREE.Vector3().setFromMatrixPosition(hp)); haloCol.push('#ffae55');
      } else S.add(BOX, '#2d3550', M(0, 0, 0.04, ww, wh, 0.1));
      S.add(BOX, TRIM, M(0, 0, 0.1, 0.08, wh, 0.04)); S.add(BOX, TRIM, M(0, 0.1, 0.1, ww, 0.08, 0.04));
    }
    const fz = d / 2 + 0.02;
    for (let f = 0; f < floors; f++) {
      const wy = base + f * fh + 1.75;
      const xs = f === 0 ? [-w * 0.3, w * 0.3] : (w > 9.4 ? [-w * 0.32, 0, w * 0.32] : [-w * 0.24, w * 0.24]);
      for (const lx of xs) window_(lx, wy, fz);
      for (const sx of [-1, 1]) for (const lz of (d > 8 ? [-d * 0.22, d * 0.22] : [0])) window_(sx * (w / 2 + 0.02), wy, lz, 1.05, 1.45, sx * Math.PI / 2);
      for (const lx of (w > 9 ? [-w * 0.25, w * 0.25] : [0])) window_(lx, wy, -fz, 1.05, 1.45, Math.PI);
    }

    // porch: deck, posts, roof with snow + garland lights, steps, door, wreath
    const pw = Math.min(w * 0.62, 5.6), pd = 2.4, py = base + fh - 0.35;
    S.add(bevBox(pw, 0.35, pd, 0.06), '#8a6a58', at(0, base - 0.1, d / 2 + pd / 2));
    for (const sx of [-1, 1]) S.add(CYL, TRIM, at(sx * (pw / 2 - 0.2), (base + py) / 2, d / 2 + pd - 0.2, 0.1, py - base, 0.1));
    S.add(bevBox(pw + 0.4, 0.22, pd + 0.4, 0.06), '#4a4050', at(0, py + 0.05, d / 2 + pd / 2));
    S.add(bevBox(pw + 0.5, 0.36, pd + 0.45, 0.17, 3), SNOW, at(0, py + 0.3, d / 2 + pd / 2), 0.03);
    for (let k = 0; k <= 8; k++) S.add(BLOB, SNOW, at(-pw / 2 + pw * k / 8, py + 0.18, d / 2 + pd + 0.15, 0.32, 0.2, 0.3), 0.04);
    {
      const a = new THREE.Vector3(-pw / 2 - 0.1, py - 0.12, d / 2 + pd + 0.25), b = new THREE.Vector3(pw / 2 + 0.1, py - 0.12, d / 2 + pd + 0.25);
      for (let k = 0; k <= 14; k++) {
        const t = k / 14, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI * 2) ** 2 * 0.25;
        S.add(BLOB, '#2f5a3e', at(p.x, p.y, p.z, 0.2, 0.17, 0.17), 0.1);
        if (k % 2 === 0) { const c = bulbCol(); L.add(BALL, c, at(p.x, p.y - 0.12, p.z + 0.12, 0.08, 0.08, 0.08), 0); sparks.push(wp(p.x, p.y - 0.12, p.z + 0.12)); sparkCol.push(c); }
      }
    }
    for (let k = 0; k < 3; k++) S.add(bevBox(1.8, 0.2, 0.45, 0.04), '#9a8a92', at(0, base - 0.25 - k * 0.2, d / 2 + pd + 0.2 + k * 0.4));
    S.add(bevBox(1.25, 2.3, 0.14, 0.04), '#5a2e2a', at(0, base + 1.15, d / 2 + 0.05));
    L.add(BOX, '#ffcf86', at(0, base + 1.75, d / 2 + 0.13, 0.6, 0.5, 0.04), 0);
    S.add(new THREE.TorusGeometry(0.32, 0.1, 6, 14), '#2f6a40', at(0, base + 1.75, d / 2 + 0.2));
    S.add(BLOB, '#c8202a', at(0, base + 1.45, d / 2 + 0.25, 0.1, 0.1, 0.06));
    pools.push({ p: wp(0, 0, d / 2 + pd + 1.2), r: 4.5, c: '#ffb860' });

    // front path to the sidewalk, bushes either side of it
    if (toRoad) {
      const z0 = d / 2 + pd + 1.2, z1 = toRoad - (ROAD.half + ROAD.walk) + 0.2, len = z1 - z0;
      if (len > 0.3) S.add(bevBox(1.6, 0.14, len, 0.05), '#b9b2c2', at(0, 0.07, z0 + len / 2));
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
        const bx = sx * rr(1.6, 3.6), bz = d / 2 + pd + rr(0.6, Math.max(1, len));
        const s = rr(0.5, 0.9);
        S.add(BLOB, '#8396bd', at(bx, s * 0.6, bz, s, s * 0.8, s));
        S.add(BLOB, SNOW, at(bx, s * 1.05, bz, s * 0.85, s * 0.45, s * 0.85), 0.04);
      }
    }
    const top = gy + h + rise + 0.6;
    world.colliders.push({ x, z, r: Math.max(w, d) * 0.62, top });
    return { x, z, r: Math.max(w, d) * 0.75 + (toRoad ? 3 : 0), front: wp(0, 0, d / 2) };
  }

  // ---- lamp posts on the sidewalks, with warm light pools ------------------------------------
  for (let i = 3, s = 1; i < NS; i += 15, s = -s) {
    const p = pts[i], n = nrm[i], o = s * (ROAD.half + 1.1), x = p.x + n.x * o, z = p.z + n.z * o, ly = top;
    S.add(CYL, '#262833', T(x, ly + 0.15, z, 0.22, 0.3, 0.22));
    S.add(CYL, '#262833', T(x, ly + 2.2, z, 0.08, 4.2, 0.08));
    S.add(CYL, '#262833', T(x, ly + 4.35, z, 0.18, 0.1, 0.18));
    L.add(BLOB, '#ffe2a8', T(x, ly + 4.7, z, 0.28, 0.36, 0.28), 0);
    S.add(new THREE.ConeGeometry(0.42, 0.35, 8), '#262833', T(x, ly + 5.15, z));
    S.add(BLOB, SNOW, T(x, ly + 5.35, z, 0.3, 0.12, 0.3), 0.02);
    halos.push(new THREE.Vector3(x, ly + 4.7, z)); haloCol.push('#ffc070');
    pools.push({ p: new THREE.Vector3(x, 0, z), r: 8, c: '#ffbe6a' });
  }

  // ---- snow banks along the outer sidewalk edges (gaps at the front paths) --------------------
  {
    const N = 900, m = new THREE.InstancedMesh(BLOB, new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.95 }), N);
    let c = 0;
    for (let i = 0; i < NS && c < N; i++) for (const s of [-1, 1]) {
      if (rand() < 0.35) continue;
      const p = pts[i], n = nrm[i], o = s * (ROAD.half + ROAD.walk + rr(0.6, 1.4)), x = p.x + n.x * o, z = p.z + n.z * o;
      if (roadDist(x, z) < ROAD.half + ROAD.walk + 0.3) continue;
      if (houses.some(hh => hh.front && (hh.front.x - x) ** 2 + (hh.front.z - z) ** 2 < 60 && pathNear(hh, x, z))) continue;
      m.setMatrixAt(c++, T(x, 0.05, z, rr(0.7, 1.5), rr(0.35, 0.7), rr(0.7, 1.4), 0, rand() * 6, 0));
    }
    m.count = c; m.receiveShadow = true; scene.add(m);
  }
  function pathNear(hh, x, z) {   // is (x,z) within ~1.6 m of the line from the house front toward the road
    const dx = hh.front.x - hh.x, dz = hh.front.z - hh.z, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, px = x - hh.x, pz = z - hh.z;
    return Math.abs(px * -uz + pz * ux) < 1.8 && px * ux + pz * uz > 0;
  }

  // ---- trees, bushes, snow mounds in the yards ------------------------------------------------
  const frost = new Batch();        // round frosted tree: trunk + snowy blob clusters
  frost.add(CYL, '#4a3428', T(0, 1.2, 0, 0.25, 2.4, 0.25));
  for (const [bx, by, bz, s] of [[0, 3.2, 0, 1.6], [0.9, 2.7, 0.3, 1.1], [-0.8, 2.8, -0.4, 1.15], [0.2, 4.3, -0.2, 1.15], [-0.3, 2.5, 0.9, 1.0], [0.4, 2.6, -1.0, 1.0]])
    frost.add(BLOB, by > 3 ? '#eef2ff' : '#c4d0ee', T(bx, by, bz, s, s * 0.9, s), 0.1);
  const pine = new Batch();          // snowy pine: dark tiers with snow on each
  pine.add(CYL, '#4a3428', T(0, 0.6, 0, 0.25, 1.2, 0.25));
  for (let k = 0; k < 4; k++) {
    const r = 2.2 - k * 0.45, yb = 1.2 + k * 1.35;
    pine.add(new THREE.ConeGeometry(r, 2.2, 8), '#1f4a3c', T(0, yb + 1.1, 0));
    pine.add(new THREE.ConeGeometry(r * 0.78, 0.9, 8), '#eef2ff', T(0, yb + 1.75, 0), 0.03);
  }
  pine.add(new THREE.ConeGeometry(0.4, 0.7, 8), '#eef2ff', T(0, 7.2, 0));
  const bush = new Batch();
  bush.add(BLOB, '#8396bd', T(0, 0.45, 0, 0.9, 0.7, 0.9)); bush.add(BLOB, SNOW, T(0, 0.85, 0, 0.8, 0.4, 0.8), 0.03);
  const mats = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const inst = (b, n) => { const m = new THREE.InstancedMesh(b.geometry(), mats, n); m.castShadow = m.receiveShadow = true; m.count = 0; scene.add(m); return m; };
  const iFrost = inst(frost, 160), iPine = inst(pine, 160), iBush = inst(bush, 260), iMound = new THREE.InstancedMesh(BLOB, new THREE.MeshStandardMaterial({ color: SNOW, roughness: 0.95 }), 200);
  iMound.count = 0; iMound.receiveShadow = true; scene.add(iMound);
  const trees = [];
  const free = (x, z, rr_) => roadDist(x, z) > ROAD.half + ROAD.walk + 1.2 + rr_ && Math.hypot(x, z) > 15 + rr_
    && houses.every(hh => (hh.x - x) ** 2 + (hh.z - z) ** 2 > (hh.r + rr_) ** 2) && !houses.some(hh => hh.front && pathNear(hh, x, z) && (hh.x - x) ** 2 + (hh.z - z) ** 2 < 400);
  const ic = new THREE.Color();
  for (let tries = 0; tries < 6000; tries++) {
    const a = rr(0, 6.283), r = Math.sqrt(rand()) * (VILLAGE_R + 12), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const kind = rand();
    const R_ = kind < 0.4 ? 2.4 : kind < 0.75 ? 2.2 : 1;
    if (!free(x, z, R_) || trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + R_) ** 2)) continue;
    const gy = groundH(x, z), s = rr(0.8, 1.35);
    const m = T(x, gy, z, s, s * rr(0.9, 1.2), s, 0, rand() * 6, 0);
    const im = kind < 0.4 ? iFrost : kind < 0.75 ? iPine : (rand() < 0.5 ? iBush : iMound);
    if (im.count >= im.instanceMatrix.count) continue;
    if (im === iMound) m.multiply(T(0, 0, 0, rr(1, 2.2), rr(0.4, 0.8), rr(1, 2)));
    im.setMatrixAt(im.count, m); if (im !== iMound) im.setColorAt(im.count, ic.setScalar(rr(0.9, 1.05)));
    im.count++;
    trees.push({ x, z, r: R_ * s });
  }

  // ---- the batched meshes -------------------------------------------------------------------
  scene.add(S.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  const lm = L.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); lm.castShadow = false; scene.add(lm);
  const road = R.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }));
  road.castShadow = false; scene.add(road);

  // glows: additive soft sprites (no post-processing needed)
  const glow = (P, C, size, opacity) => {
    const g = new THREE.BufferGeometry(), pa = new Float32Array(P.length * 3), ca = new Float32Array(P.length * 3), c = new THREE.Color();
    P.forEach((p, i) => { pa.set([p.x, p.y, p.z], i * 3); c.set(C[i]); ca.set([c.r, c.g, c.b], i * 3); });
    g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    const pts_ = new THREE.Points(g, new THREE.PointsMaterial({ size, map: softDot(), vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(pts_); return pts_;
  };
  glow(halos, haloCol, 6, 0.7);
  const sparkPts = glow(sparks, sparkCol, 0.9, 0.9);
  // warm light pools on the snow (one instanced additive decal)
  {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), pools.length);
    pools.forEach((q, i) => { m.setMatrixAt(i, T(q.p.x, groundH(q.p.x, q.p.z) + top + 0.03, q.p.z, q.r, 1, q.r)); m.setColorAt(i, ic.set(q.c)); });
    m.renderOrder = 2; scene.add(m);
  }

  // ---- cars: two parked, three driving the loop -----------------------------------------------
  const carDefs = ['#c42a2a', '#2a3440', '#5a6a88', '#e0d8c0', '#3a5a4a'];
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const length = curve.getLength();
  const cars = carDefs.map((col, i) => {
    const b = new Batch(), l = new Batch(), parked = i < 2;
    b.add(bevBox(1.9, 0.75, 4.2, 0.25, 3), col, T(0, 0.62, 0));
    b.add(bevBox(1.62, 0.6, 2.1, 0.22, 3), '#1c2233', T(0, 1.22, -0.25));
    b.add(bevBox(1.68, 0.14, 2.0, 0.07), col, T(0, 1.52, -0.25));
    if (parked) b.add(BLOB, SNOW, T(0, 1.62, -0.25, 0.8, 0.14, 1.0), 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) b.add(CYL, '#15151b', T(sx * 0.9, 0.36, sz, 0.36, 0.26, 0.36, 0, 0, Math.PI / 2));
    for (const sx of [-0.62, 0.62]) { l.add(BOX, parked ? '#665a40' : '#fff2cc', T(sx, 0.72, 2.12, 0.42, 0.18, 0.05), 0); l.add(BOX, parked ? '#401010' : '#ff2a2a', T(sx, 0.72, -2.12, 0.42, 0.16, 0.05), 0); }
    const g = new THREE.Group();
    const body = new THREE.Mesh(b.geometry(), solidMat); body.castShadow = true;
    g.add(body, new THREE.Mesh(l.geometry(), lightMat));
    if (!parked) {   // headlight pool
      const hp = new THREE.Mesh(new THREE.PlaneGeometry(4, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffe8b0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      hp.position.set(0, 0.05, 5.5); g.add(hp);
    }
    scene.add(g);
    return { g, parked, u: (i * 0.23 + 0.05) % 1, dir: i % 2 ? -1 : 1, speed: rr(6, 9) };
  });
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
  const placeCar = (c, lane) => {
    curve.getPointAt(c.u, _p); curve.getTangentAt(c.u, _t); _t.y = 0; _t.normalize();
    _n.set(-_t.z, 0, _t.x);
    const o = lane * c.dir;
    c.g.position.set(_p.x + _n.x * o, ROAD.y, _p.z + _n.z * o);
    c.g.rotation.y = Math.atan2(_t.x * c.dir, _t.z * c.dir);
  };
  for (const c of cars) placeCar(c, c.parked ? 2.6 : 1.75);

  world.update.push((t, dt) => {
    for (const c of cars) if (!c.parked) { c.u = (c.u + c.dir * c.speed * dt / length + 1) % 1; placeCar(c, 1.75); }
    sparkPts.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.15;   // fairy lights breathe
  });
}
