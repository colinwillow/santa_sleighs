// THE NEIGHBORHOOD KIT. Every piece is a builder `piece(K, x, z, ry, opts)` that writes into a kit context K
// (batched solid + emissive geometry, glow points, light pools, fires, smoke sources, colliders).
// `finishKit(K, scene, world)` turns the whole context into a handful of meshes. Layout code (village.js,
// kitshow.js) only decides WHERE pieces go; pieces decide what they look like.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { rand, rr, pick, T, Batch, BOX, BLOB, BALL, CYL, CYL6, bevBox, gable } from './util.js';
import { glowPoints, lightPools } from './fx.js';

export const PAL = {
  snow: '#f3f5ff', trim: '#efe6da', brick: '#8c4a3c', iron: '#262833', wood: '#6b4a38', woodDark: '#4a3428',
  siding: ['#a8443a', '#5f6f8f', '#d6c3a3', '#7d8aa3', '#8a5a6a', '#4f5f7f'],
  roof: ['#4a3a44', '#3e4658', '#5a3c34'],
  warm: ['#ffcf86', '#ffc070', '#ffd9a0'],
  bulbs: ['#ff4b4b', '#ffd34a', '#4bc3ff', '#7dff7a', '#ff8bf0'],
  // gingerbread family
  cookie: ['#a85a2a', '#9a4e22', '#b4632e'], cookieDark: '#6a3a1c', icing: '#fffaf2', choc: '#4a2a1c',
  candy: ['#e8303a', '#3aa85a', '#ffd23a', '#ff7ab8', '#4ab8ff'],
};

export function makeKit() {
  return { S: new Batch(), L: new Batch(), halos: [], haloCol: [], sparks: [], sparkCol: [], pools: [], fires: [], smoke: [], colliders: [], wires: [] };
}

// helpers bound to a placement
function place(x, z, ry, y) {
  const gy = y ?? groundH(x, z);
  const H = T(x, gy, z, 1, 1, 1, 0, ry, 0);
  return {
    gy, H,
    at: (...a) => H.clone().multiply(T(...a)),
    wp: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(H),
  };
}
const bulb = (K, P, lx, ly, lz, c) => { K.L.add(BALL, c, P.at(lx, ly, lz, 0.08, 0.08, 0.08), 0); K.sparks.push(P.wp(lx, ly, lz)); K.sparkCol.push(c); };
function stringLights(K, P, a, b, sag, colorFn) {
  const len = a.distanceTo(b), n = Math.max(2, Math.round(len / 0.6)), loops = Math.max(1, Math.round(len / 2.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI * loops) ** 2 * sag;
    bulb(K, P, p.x, p.y, p.z, colorFn());
  }
}

// ---- HOUSE --------------------------------------------------------------------------------
/** opts: style 'victorian' | 'gingerbread', toRoad (distance to road centre, adds path/fence/mailbox), fence, walkOut */
export function house(K, x, z, ry, opts = {}) {
  const P = place(x, z, ry), { at, wp, gy } = P, S = K.S, L = K.L;
  const ginger = opts.style === 'gingerbread';
  const w = rr(8.2, 10.5), d = rr(7.2, 9), floors = opts.floors ?? (rand() < 0.75 ? 2 : 1), fh = 3.2, base = 0.6;
  const h = base + floors * fh;
  const wall = ginger ? pick(PAL.cookie) : pick(PAL.siding);
  const trim = ginger ? PAL.icing : PAL.trim;
  const multi = ginger || rand() < 0.5;
  const bulbCol = () => multi ? pick(PAL.bulbs) : '#ffd890';

  S.add(bevBox(w + 0.4, base, d + 0.4, 0.08), ginger ? PAL.cookieDark : '#77707e', at(0, base / 2, 0));
  S.add(bevBox(w, h - base, d, ginger ? 0.3 : 0.12, ginger ? 3 : 2), wall, at(0, base + (h - base) / 2, 0));
  if (ginger) {   // icing piping: fat rounded corner tubes, a wavy band between floors, dots
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add(CYL, trim, at(sx * w / 2, base + (h - base) / 2, sz * d / 2, 0.17, h - base, 0.17), 0.02);
    for (let f = 1; f < floors; f++) for (const [ax, az, bx, bz] of [[-w / 2, d / 2, w / 2, d / 2], [-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2]]) {
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.45);
      for (let k = 0; k <= n; k++) { const t = k / n; S.add(BALL, trim, at(ax + (bx - ax) * t, base + f * fh + Math.sin(k * 1.6) * 0.07, az + (bz - az) * t, 0.16, 0.13, 0.16), 0.02); }
    }
    for (let k = 0; k < 10; k++) S.add(BALL, pick(PAL.candy), at(rr(-w / 2 + 0.6, w / 2 - 0.6), rr(base + 0.4, h - 0.4), d / 2 + 0.06, 0.13, 0.13, 0.08), 0.05);
  } else {
    if (floors === 2) S.add(bevBox(w + 0.16, 0.2, d + 0.16, 0.06), trim, at(0, base + fh, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add(bevBox(0.26, h - base, 0.26, 0.06), trim, at(sx * w / 2, base + (h - base) / 2, sz * d / 2));
  }

  // roof + pillowy snow (icing on gingerbread) + drips
  const front = opts.gableFront ?? rand() < 0.5;
  const span = (front ? w : d) + 1.3, deep = (front ? d : w) + 1.3, rise = span * (ginger ? 0.5 : 0.42);
  const rot = front ? 0 : Math.PI / 2;
  S.add(gable(span, rise, deep, 0.1), ginger ? PAL.choc : pick(PAL.roof), at(0, h - 0.1, 0, 1, 1, 1, 0, rot, 0));
  S.add(gable(span + 0.2, rise + 0.3, deep + 0.1, 0.5, 4), ginger ? PAL.icing : PAL.snow, at(0, h + 0.12, 0, 1, 1, 1, 0, rot, 0), 0.03);
  const ex = w / 2 + 0.65, ez = d / 2 + 0.65, eaves = [], rakes = [];
  if (front) {
    eaves.push([[-ex, -ez], [-ex, ez]], [[ex, -ez], [ex, ez]]);
    rakes.push([new THREE.Vector3(-ex, h, ez + 0.1), new THREE.Vector3(0, h + rise + 0.15, ez + 0.1), new THREE.Vector3(ex, h, ez + 0.1)]);
  } else {
    eaves.push([[-ex, ez], [ex, ez]], [[-ex, -ez], [ex, -ez]]);
    for (const s of [-1, 1]) rakes.push([new THREE.Vector3(s * (ex + 0.1), h, -ez), new THREE.Vector3(s * (ex + 0.1), h + rise + 0.15, 0), new THREE.Vector3(s * (ex + 0.1), h, ez)]);
  }
  for (const [[ax, az], [bx, bz]] of eaves) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.9));
    for (let k = 0; k <= n; k++) {
      const t = k / n, lx = ax + (bx - ax) * t, lz = az + (bz - az) * t;
      S.add(BLOB, ginger ? PAL.icing : PAL.snow, at(lx * 1.01, h + 0.08, lz * 1.01, rr(0.4, 0.6), rr(0.22, 0.34), rr(0.4, 0.6), 0, rand() * 6, 0), 0.04);
      if (ginger && k % 2) S.add(BALL, PAL.icing, at(lx * 1.03, h - 0.25, lz * 1.03, 0.12, 0.3, 0.12), 0.02);   // icing drip
    }
    stringLights(K, P, new THREE.Vector3(ax * 1.03, h - 0.12, az * 1.03), new THREE.Vector3(bx * 1.03, h - 0.12, bz * 1.03), 0.18, bulbCol);
  }
  for (const [a, b, c] of rakes) { stringLights(K, P, a, b, 0.05, bulbCol); stringLights(K, P, b, c, 0.05, bulbCol); }
  if (ginger) {   // gumdrops along the ridge
    const n = Math.round(deep / 0.9);
    for (let k = 0; k <= n; k++) {
      const t = k / n - 0.5, m = front ? at(0, h + rise + 0.55, t * (deep - 0.6), 0.32, 0.38, 0.32) : at(t * (deep - 0.6), h + rise + 0.55, 0, 0.32, 0.38, 0.32);
      S.add(BALL, pick(PAL.candy), m, 0.05);
    }
  }
  if (front) {   // round attic window (a peppermint on gingerbread)
    const r = rise * 0.16, wy = h + rise * 0.38;
    S.add(CYL, trim, at(0, wy, d / 2 + 0.04, r + 0.14, 0.1, r + 0.14, Math.PI / 2, 0, 0));
    L.add(CYL, pick(PAL.warm), at(0, wy, d / 2 + 0.1, r, 0.06, r, Math.PI / 2, 0, 0), 0);
    if (ginger) for (let k = 0; k < 6; k++) S.add(BOX, '#e8303a', at(0, wy, d / 2 + 0.14, 0.12, r * 1.9, 0.02, 0, 0, k * Math.PI / 6));
    K.halos.push(wp(0, wy, d / 2 + 0.5)); K.haloCol.push('#ffb050');
  } else if (rand() < 0.75) {
    const dz = d * 0.22, dy = h + rise * 0.3, dw = 2.4;
    S.add(bevBox(dw, 2.0, 2.6, 0.08), wall, at(0, dy + 0.6, dz));
    S.add(gable(dw + 0.6, 1.1, 3.0, 0.08), ginger ? PAL.choc : '#3e4658', at(0, dy + 1.55, dz));
    S.add(gable(dw + 0.8, 1.35, 3.1, 0.35, 3), ginger ? PAL.icing : PAL.snow, at(0, dy + 1.65, dz), 0.03);
    win(0, dy + 0.6, dz + 1.3, 1.0, 1.1);
  }

  // chimney (smoke source)
  const cx = (front ? 1 : 0.6) * w * 0.26, cz = -d * 0.2;
  const roofAt = front ? h + rise * (1 - Math.abs(cx) / (span / 2)) : h + rise * (1 - Math.abs(cz) / (span / 2));
  S.add(bevBox(1.2, 3.4, 1.2, 0.08), ginger ? PAL.cookieDark : PAL.brick, at(cx, roofAt + 0.4, cz));
  if (ginger) for (const yy of [0.9, 1.6]) S.add(bevBox(1.3, 0.12, 1.3, 0.05), PAL.icing, at(cx, roofAt + yy, cz));
  S.add(BLOB, ginger ? PAL.icing : PAL.snow, at(cx, roofAt + 2.15, cz, 0.78, 0.32, 0.78), 0.03);
  K.smoke.push(wp(cx, roofAt + 2.4, cz));

  // windows
  function win(lx, ly, lz, ww = 1.05, wh = 1.45, rotY = 0) {
    const lit = rand() > 0.12;
    const M = (ox, oy, oz, sx, sy, sz) => at(lx + Math.cos(rotY) * ox + Math.sin(rotY) * oz, ly + oy, lz - Math.sin(rotY) * ox + Math.cos(rotY) * oz, sx, sy, sz, 0, rotY, 0);
    S.add(BOX, trim, M(0, 0, 0, ww + 0.28, wh + 0.28, 0.12));
    if (ginger) S.add(BALL, PAL.icing, M(0, wh / 2 + 0.2, 0.06, ww * 0.7, 0.16, 0.12), 0.02);   // icing brow
    S.add(BOX, trim, M(0, -wh / 2 - 0.16, 0.08, ww + 0.5, 0.12, 0.3));
    S.add(BALL, PAL.snow, M(0, -wh / 2 - 0.06, 0.12, ww * 0.55, 0.1, 0.16), 0.02);
    if (lit) {
      L.add(BOX, pick(PAL.warm), M(0, 0, 0.04, ww, wh, 0.1), 0.08);
      K.halos.push(new THREE.Vector3().setFromMatrixPosition(M(0, 0, 0.6, 1, 1, 1))); K.haloCol.push('#ffae55');
    } else S.add(BOX, '#2d3550', M(0, 0, 0.04, ww, wh, 0.1));
    S.add(BOX, trim, M(0, 0, 0.1, 0.08, wh, 0.04)); S.add(BOX, trim, M(0, 0.1, 0.1, ww, 0.08, 0.04));
  }
  const fz = d / 2 + 0.02;
  for (let f = 0; f < floors; f++) {
    const wy = base + f * fh + 1.75;
    const xs = f === 0 ? [-w * 0.3, w * 0.3] : (w > 9.4 ? [-w * 0.32, 0, w * 0.32] : [-w * 0.24, w * 0.24]);
    for (const lx of xs) win(lx, wy, fz);
    for (const sx of [-1, 1]) for (const lz of [0]) win(sx * (w / 2 + 0.02), wy, lz, 1.05, 1.45, sx * Math.PI / 2);
    for (const lx of [w * 0.2]) win(lx, wy, -fz, 1.05, 1.45, Math.PI);
  }

  // porch
  const pw = Math.min(w * 0.62, 5.6), pd = 2.4, py = base + fh - 0.35;
  S.add(bevBox(pw, 0.35, pd, 0.06), ginger ? PAL.cookieDark : '#8a6a58', at(0, base - 0.1, d / 2 + pd / 2));
  for (const sx of [-1, 1]) {
    const px = sx * (pw / 2 - 0.2), pz = d / 2 + pd - 0.2;
    if (ginger) {   // candy-cane posts: stacked red / white bands
      const n = 8, hh = (py - base) / n;
      for (let k = 0; k < n; k++) S.add(CYL6, k % 2 ? '#e8303a' : PAL.icing, at(px, base + hh * (k + 0.5), pz, 0.12, hh, 0.12), 0);
    } else S.add(CYL, trim, at(px, (base + py) / 2, pz, 0.1, py - base, 0.1));
  }
  S.add(bevBox(pw + 0.4, 0.22, pd + 0.4, 0.06), ginger ? PAL.choc : '#4a4050', at(0, py + 0.05, d / 2 + pd / 2));
  S.add(bevBox(pw + 0.5, 0.36, pd + 0.45, 0.17, 3), ginger ? PAL.icing : PAL.snow, at(0, py + 0.3, d / 2 + pd / 2), 0.03);
  for (let k = 0; k <= 8; k++) S.add(BLOB, ginger ? PAL.icing : PAL.snow, at(-pw / 2 + pw * k / 8, py + 0.18, d / 2 + pd + 0.15, 0.32, 0.2, 0.3), 0.04);
  {
    const a = new THREE.Vector3(-pw / 2 - 0.1, py - 0.12, d / 2 + pd + 0.25), b = new THREE.Vector3(pw / 2 + 0.1, py - 0.12, d / 2 + pd + 0.25);
    for (let k = 0; k <= 14; k++) {
      const t = k / 14, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI * 2) ** 2 * 0.25;
      S.add(BALL, '#2f5a3e', at(p.x, p.y, p.z, 0.2, 0.17, 0.17), 0.1);
      if (k % 2 === 0) bulb(K, P, p.x, p.y - 0.12, p.z + 0.12, bulbCol());
    }
  }
  for (let k = 0; k < 3; k++) S.add(bevBox(1.8, 0.2, 0.45, 0.04), ginger ? PAL.cookieDark : '#9a8a92', at(0, base - 0.25 - k * 0.2, d / 2 + pd + 0.2 + k * 0.4));
  S.add(bevBox(1.25, 2.3, 0.14, 0.04), ginger ? PAL.choc : '#5a2e2a', at(0, base + 1.15, d / 2 + 0.05));
  L.add(BOX, '#ffcf86', at(0, base + 1.75, d / 2 + 0.13, 0.6, 0.5, 0.04), 0);
  S.add(new THREE.TorusGeometry(0.32, 0.1, 6, 14), '#2f6a40', at(0, base + 1.75, d / 2 + 0.2));
  S.add(BALL, '#c8202a', at(0, base + 1.45, d / 2 + 0.25, 0.1, 0.1, 0.06));
  K.pools.push({ p: wp(0, 0, d / 2 + pd + 1.2), r: 4.5, c: '#ffb860' });

  // yard: path to the road, bushes, picket fence with a gate gap, mailbox, candy canes on gingerbread paths
  const res = { x, z, r: Math.max(w, d) * 0.75, front: wp(0, 0, d / 2), w, d };
  if (opts.toRoad) {
    const walkOut = opts.walkOut ?? 5.8;
    const z0 = d / 2 + pd + 1.2, z1 = opts.toRoad - walkOut + 0.2, len = z1 - z0;
    if (len > 0.3) S.add(bevBox(1.6, 0.14, len, 0.05), '#b9b2c2', at(0, 0.07, z0 + len / 2));
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) bushAt(K, P, sx * rr(1.7, 3.8), d / 2 + pd + rr(0.6, Math.max(1, len - 1)));
    if (ginger) for (let k = 0; k < Math.floor(len / 1.4); k++) for (const sx of [-1, 1]) candyCane(K, P, sx * 1.1, z0 + 0.7 + k * 1.4);
    if (opts.fence ?? rand() < 0.6) fence(K, P, -w / 2 - 2, w / 2 + 2, z1 - 0.5, 1.1, ginger);
    mailbox(K, P, 1.6, z1 - 0.3);
    res.r += 3;
  }
  K.colliders.push({ x, z, r: Math.max(w, d) * 0.62, top: gy + h + rise + 0.6 });
  return res;
}

function bushAt(K, P, lx, lz, s = rr(0.5, 0.9)) {
  K.S.add(BLOB, '#8396bd', P.at(lx, s * 0.6, lz, s, s * 0.8, s));
  K.S.add(BLOB, PAL.snow, P.at(lx, s * 1.05, lz, s * 0.85, s * 0.45, s * 0.85), 0.04);
}

/** picket fence along local x from x0 to x1 at local z, with a gate gap |x| < gap */
function fence(K, P, x0, x1, lz, gap, ginger) {
  const S = K.S, col = ginger ? PAL.icing : '#f1ece4';
  for (const [a, b] of [[x0, -gap], [gap, x1]]) {
    const len = b - a; if (len < 0.5) continue;
    for (const yy of [0.35, 0.85]) S.add(BOX, col, P.at((a + b) / 2, yy, lz, len, 0.08, 0.06));
    S.add(BALL, PAL.snow, P.at((a + b) / 2, 0.92, lz, len / 2, 0.05, 0.07), 0.02);
    const n = Math.floor(len / 0.32);
    for (let k = 0; k <= n; k++) {
      const px = a + (k / n) * len, c = ginger && k % 3 === 0 ? '#e8303a' : col;
      S.add(BOX, c, P.at(px, 0.5, lz + 0.05, 0.11, 1.0, 0.04));
      S.add(BOX, c, P.at(px, 1.0, lz + 0.05, 0.078, 0.078, 0.04, 0, 0, Math.PI / 4));
    }
    for (const px of [a, b]) S.add(bevBox(0.18, 1.2, 0.18, 0.03), col, P.at(px, 0.6, lz));
  }
}
function mailbox(K, P, lx, lz) {
  K.S.add(CYL, PAL.woodDark, P.at(lx, 0.55, lz, 0.06, 1.1, 0.06));
  K.S.add(bevBox(0.35, 0.35, 0.6, 0.12, 3), '#c42a2a', P.at(lx, 1.2, lz));
  K.S.add(BALL, PAL.snow, P.at(lx, 1.4, lz, 0.2, 0.07, 0.3), 0.02);
}
function candyCane(K, P, lx, lz) {
  const n = 6;
  for (let k = 0; k < n; k++) K.S.add(CYL6, k % 2 ? '#e8303a' : PAL.icing, P.at(lx, 0.1 * (k + 0.5) * 1.3, lz, 0.05, 0.13, 0.05), 0);
  for (let k = 0; k < 5; k++) { const a = (k / 4) * Math.PI; K.S.add(BALL, k % 2 ? '#e8303a' : PAL.icing, P.at(lx + (1 - Math.cos(a)) * 0.1, 0.78 + Math.sin(a) * 0.1, lz, 0.055, 0.055, 0.055), 0); }
}

// ---- STREET FURNITURE -------------------------------------------------------------------------
export function lampPost(K, x, z, y) {
  const P = place(x, z, 0, y), S = K.S, iron = PAL.iron;
  S.add(CYL, iron, P.at(0, 0.15, 0, 0.22, 0.3, 0.22));
  S.add(CYL, iron, P.at(0, 2.2, 0, 0.08, 4.2, 0.08));
  S.add(CYL, iron, P.at(0, 4.35, 0, 0.18, 0.1, 0.18));
  K.L.add(BLOB, '#ffe2a8', P.at(0, 4.7, 0, 0.28, 0.36, 0.28), 0);
  S.add(new THREE.ConeGeometry(0.42, 0.35, 8), iron, P.at(0, 5.15, 0));
  S.add(BALL, PAL.snow, P.at(0, 5.35, 0, 0.3, 0.12, 0.3), 0.02);
  // a wreath with a bow halfway up
  S.add(new THREE.TorusGeometry(0.28, 0.08, 6, 12), '#2f6a40', P.at(0, 3.3, 0.1));
  S.add(BALL, '#c8202a', P.at(0, 3.05, 0.16, 0.08, 0.08, 0.05));
  K.halos.push(P.wp(0, 4.7, 0)); K.haloCol.push('#ffc070');
  K.pools.push({ p: P.wp(0, 0, 0), y: P.gy, r: 6, c: '#ffd890' });
}

/** telephone pole; returns the three wire anchor points (world) for wiring to the next pole */
export function telePole(K, x, z, ry) {
  const P = place(x, z, ry), S = K.S, hgt = 8.5;
  S.add(CYL, '#5a4434', P.at(0, hgt / 2, 0, 0.17, hgt, 0.17), 0.1);
  S.add(bevBox(2.4, 0.18, 0.18, 0.04), '#5a4434', P.at(0, hgt - 0.6, 0));
  S.add(BALL, PAL.snow, P.at(0, hgt - 0.48, 0, 1.1, 0.07, 0.1), 0.02);
  S.add(BALL, PAL.snow, P.at(0, hgt + 0.05, 0, 0.2, 0.1, 0.2), 0.02);
  const anchors = [];
  for (const ax of [-1.05, 0, 1.05]) {
    const ins = ax === 0 ? hgt + 0.05 : hgt - 0.38;
    S.add(CYL, '#7fa0a8', P.at(ax, ins - 0.08, 0, 0.06, 0.18, 0.06));
    anchors.push(P.wp(ax, ins, 0));
  }
  S.add(bevBox(0.5, 0.7, 0.4, 0.06), '#5a6070', P.at(0.35, hgt - 1.6, 0));   // transformer can
  return anchors;
}
/** sagging wires between two anchor sets */
export function wires(K, A, B, sag = 0.9) {
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = B[i], pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    K.S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.025, 4), '#1a1c24', null, 0);
  }
}

export function bench(K, x, z, ry) {
  const P = place(x, z, ry), S = K.S;
  for (const k of [0, 1, 2]) S.add(bevBox(2.2, 0.07, 0.16, 0.02), PAL.wood, P.at(0, 0.5, -0.2 + k * 0.19));
  for (const k of [0, 1]) S.add(bevBox(2.2, 0.14, 0.06, 0.02), PAL.wood, P.at(0, 0.8 + k * 0.22, -0.32, 1, 1, 1, -0.15, 0, 0));
  for (const sx of [-1, 1]) {
    S.add(bevBox(0.08, 0.5, 0.5, 0.02), PAL.iron, P.at(sx * 0.95, 0.25, 0));
    S.add(bevBox(0.08, 0.6, 0.08, 0.02), PAL.iron, P.at(sx * 0.95, 0.8, -0.32));
  }
  S.add(BALL, PAL.snow, P.at(0.2, 0.56, 0, 0.8, 0.07, 0.24), 0.02);
  S.add(BALL, PAL.snow, P.at(0, 1.14, -0.36, 1.0, 0.05, 0.06), 0.02);
}

/** a fire pit: stone ring, logs, fire (flames + embers + a nearby light), log seats around it */
export function firePit(K, x, z, opts = {}) {
  const P = place(x, z, rr(0, 6)), S = K.S, s = opts.s ?? 1;
  const n = 11;
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; S.add(BLOB, pick(['#6c6878', '#7d7888', '#5d5a6a']), P.at(Math.cos(a) * 1.0 * s, 0.18, Math.sin(a) * 1.0 * s, 0.32 * s, 0.24 * s, 0.26 * s, 0, -a, 0), 0.1); }
  for (let k = 0; k < 4; k++) S.add(CYL, '#3a2418', P.at(0, 0.25, 0, 0.09 * s, 1.2 * s, 0.09 * s, 0.9, k * 0.8, 0.5), 0.1);
  K.L.add(BLOB, '#ff7a1a', P.at(0, 0.12, 0, 0.55 * s, 0.1, 0.55 * s), 0);    // hot coals
  K.fires.push({ p: P.wp(0, 0.2, 0), s });
  K.pools.push({ p: P.wp(0, 0, 0), y: P.gy, r: 6 * s, c: '#ff9a40' });
  K.smoke.push(P.wp(0, 1.6 * s, 0));
  if (opts.seats !== false) for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.4;
    S.add(CYL, PAL.wood, P.at(Math.cos(a) * 2.6 * s, 0.3, Math.sin(a) * 2.6 * s, 0.3, 1.5, 0.3, Math.PI / 2, -a + Math.PI / 2, 0));
    S.add(BALL, PAL.snow, P.at(Math.cos(a) * 2.6 * s, 0.6, Math.sin(a) * 2.6 * s, 0.55, 0.06, 0.2, 0, -a + Math.PI / 2, 0), 0.02);
  }
}

// ---- finish ---------------------------------------------------------------------------------
export const MATS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};
MATS.glow.color.setScalar(2.2);   // emissive pieces go past 1 so bloom picks them up

export function finishKit(K, scene, world) {
  if (K.S.count) scene.add(K.S.mesh(MATS.solid));
  if (K.L.count) { const m = K.L.mesh(MATS.glow); m.castShadow = false; scene.add(m); }
  // with bloom on, the real glow comes from bloom; the sprite halos only stand in for it when ?bloom=0
  const bloomOn = new URLSearchParams(location.search).get('bloom') !== '0';
  if (!bloomOn) glowPoints(scene, K.halos, K.haloCol, 4.5, 0.35);
  const sparks = glowPoints(scene, K.sparks, K.sparkCol, bloomOn ? 0.5 : 0.8, bloomOn ? 0.5 : 0.8);
  lightPools(scene, K.pools, 0.38);
  world.colliders.push(...K.colliders);
  world.chimneys.push(...K.smoke);
  world.fireList.push(...K.fires);
  world.update.push(t => { sparks.material.opacity = 0.65 + Math.sin(t * 2.2) * 0.15; });
}
