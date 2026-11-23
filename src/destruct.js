// DESTRUCT: breakable gingerbread houses. A house is built from MODULAR rounded pieces (pillowy cookie-dough blocks laid in
// courses with a running bond, icing piping, candy, glowing windows with icing frames, roof panels of chocolate under a
// pillow of icing, a chimney). Method ported from Korajin m4595 (BREAKABLE ON HIT): the house is ONE merged mesh per
// material (vertex colours, like util.js Batch) where every piece owns a contiguous vertex range. A hit finds every piece
// inside the hit radius (an oriented box test), takes HP off it (machine-gun bullet = small radius, power 1; blast = big
// radius, big power); a piece at 0 HP is copied out as CPU DEBRIS (gravity, bounce, spin, settle, then stays as rubble)
// and its range in the house mesh collapses to a point -- nothing is rebuilt, the draw count never moves.
// Structure: a block with every supporter below it gone falls; decor (piping, gumdrops, glass) falls with its host;
// a roof panel drops when most of the wall tops under it are gone; the chimney goes with its panel.
// API:  buildBreakableHouse(scene, {x, y, z, ry, seed, w, d, floors}) -> house
//       DESTRUCT.hitAt(point, radius, power, {dir}) / .raycast(raycaster) / .update(dt) / .clear() / .stats() / .burst(...)
import * as THREE from 'three';

export const GB = {
  cookie: ['#a85a2a', '#9a4e22', '#b4632e', '#a2552a', '#ad6030'], cookieDark: '#6a3a1c', icing: '#fffaf2', choc: '#4a2a1c',
  candy: ['#e8303a', '#3aa85a', '#ffd23a', '#ff7ab8', '#4ab8ff'], warm: ['#ffcf86', '#ffc070', '#ffd9a0'],
  blockSegs: 2,                                // pillow subdivision for blocks/slabs: 2 = 48 tris, bulgier; 3 = 108 tris
  wallT: 0.55, courseH: 0.72, floorH: 2.9, base: 0.45, overhang: 0.65, pitch: 1.05,
  hp: { block: 3, frame: 4, decor: 1, panel: 18, chimney: 10 },
  glow: 1.9,                                   // window glow multiplier (past the bloom threshold)
  gravity: 18, bounce: 0.3, friction: 5, settleV: 0.45, settleT: 6, shrink: 0.9,
  maxMoving: 160, debrisVerts: 220000, particles: 1200,
};

const V3 = THREE.Vector3;
const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(GB.glow) }),
};

// ---- seeded random ------------------------------------------------------------------------
function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.r = (lo, hi) => lo + f() * (hi - lo);
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}

// ---- unit shapes (non-indexed arrays + a per-vertex "edge" shade for the baked-cookie look) -------------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
/** a pillow: a unit box whose edges and corners are rounded (radius r of the unit), smooth analytic normals */
function pillowGeo(s, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, s, s, s).toNonIndexed();
  const P = g.attributes.position.array, N = g.attributes.normal.array, sh = new Float32Array(P.length / 3), lim = 0.5 - r;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const ix = clamp(x, -lim, lim), iy = clamp(y, -lim, lim), iz = clamp(z, -lim, lim);
    let dx = x - ix, dy = y - iy, dz = z - iz; const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    P[i] = ix + dx * r; P[i + 1] = iy + dy * r; P[i + 2] = iz + dz * r;
    N[i] = dx; N[i + 1] = dy; N[i + 2] = dz;
    sh[i / 3] = 1 - Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));      // 0 on the flat, ~.42 at a corner
  }
  const out = { p: P, n: N, sh, count: P.length / 3 }; g.dispose(); return out;
}
function ballGeo(detail) {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const P = g.attributes.position.array, N = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) { const l = Math.hypot(P[i], P[i + 1], P[i + 2]) || 1; N[i] = P[i] / l; N[i + 1] = P[i + 1] / l; N[i + 2] = P[i + 2] / l; }
  const out = { p: P, n: N, sh: new Float32Array(P.length / 3), count: P.length / 3 }; g.dispose(); return out;
}
const GEO = { pil: pillowGeo(GB.blockSegs, 0.3), soft: pillowGeo(3, 0.45), ball: ballGeo(1), dot: ballGeo(0) };   // 48 (segs 2) or 108 (segs 3) / 108 / 80 / 20 tris

// ---- a vertex-coloured builder that hands out ranges ----------------------------------------------------
class Buf {
  constructor() { this.parts = []; this.n = 0; }
  add(G, color, M, bake, jit, R, piece) {
    const n = G.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    const e = M.elements, nm = new THREE.Matrix3().getNormalMatrix(M).elements, c = new THREE.Color(color);
    const k0 = 1 + (R() - 0.5) * jit, lo = piece.lo, hi = piece.hi;
    for (let i = 0; i < n; i++) {
      const x = G.p[i * 3], y = G.p[i * 3 + 1], z = G.p[i * 3 + 2];
      const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
      P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
      if (px < lo.x) lo.x = px; if (py < lo.y) lo.y = py; if (pz < lo.z) lo.z = pz;
      if (px > hi.x) hi.x = px; if (py > hi.y) hi.y = py; if (pz > hi.z) hi.z = pz;
      const a = G.n[i * 3], b = G.n[i * 3 + 1], d = G.n[i * 3 + 2];
      let nx = nm[0] * a + nm[3] * b + nm[6] * d, ny = nm[1] * a + nm[4] * b + nm[7] * d, nz = nm[2] * a + nm[5] * b + nm[8] * d;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
      // baked edges darker, tops a touch lighter, a whisper of painterly noise
      const k = k0 * (1 - bake * G.sh[i]) * (1 + 0.07 * ny) * (1 + (Math.sin(px * 12.9 + py * 78.2 + pz * 37.7) * 0.5) * 0.04);
      C[i * 3] = c.r * k; C[i * 3 + 1] = c.g * k; C[i * 3 + 2] = c.b * k;
    }
    this.parts.push({ P, N, C }); this.n += n;
  }
  geometry() {
    const P = new Float32Array(this.n * 3), N = new Float32Array(this.n * 3), C = new Float32Array(this.n * 3);
    let o = 0;
    for (const q of this.parts) { P.set(q.P, o); N.set(q.N, o); C.set(q.C, o); o += q.P.length; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// oriented box from a part's matrix (the unit shape spans +-.5)
const _p = new V3(), _q = new THREE.Quaternion(), _s = new V3();
function obbOf(M, pad = 0) {
  M.decompose(_p, _q, _s);
  return { c: _p.clone(), ax: [new V3(1, 0, 0).applyQuaternion(_q), new V3(0, 1, 0).applyQuaternion(_q), new V3(0, 0, 1).applyQuaternion(_q)],
    he: [_s.x / 2 + pad, _s.y / 2 + pad, _s.z / 2 + pad] };
}
const _d = new V3();
function obbDist(o, p) {
  _d.subVectors(p, o.c); let s = 0;
  for (let i = 0; i < 3; i++) { const e = Math.abs(_d.dot(o.ax[i])) - o.he[i]; if (e > 0) s += e * e; }
  return Math.sqrt(s);
}

// ---- the registry ---------------------------------------------------------------------------------------
export const DESTRUCT = {
  houses: [], scene: null, debris: null, parts: null, ground: () => 0, _t: 0, _crunchT: -1, _debT: -1,
  hitAt, raycast, update, clear, stats, burst,
};

function init(scene) {
  if (DESTRUCT.scene === scene && DESTRUCT.debris) return;
  DESTRUCT.scene = scene;
  DESTRUCT.debris = makeDebris(scene);
  DESTRUCT.parts = makeParticles(scene);
}

// ---- THE HOUSE -----------------------------------------------------------------------------------------
/** o: {x, y, z, ry, seed, w, d, floors} -- w across the front (x), d deep (z), the front (door) faces local +z */
export function buildBreakableHouse(scene, o = {}) {
  init(scene);
  const R = rng(o.seed ?? 1);
  const w = Math.max(5.5, o.w ?? 8), d = Math.max(5, o.d ?? 7), floors = o.floors ?? 1;
  const t = GB.wallT, base = GB.base, fh = GB.floorH, h = base + floors * fh;
  const tanA = GB.pitch, rise = (w / 2) * tanA, ov = GB.overhang, A = Math.atan(tanA);
  const yR = ax => h + rise - ax * tanA;           // underside of the roof at |x|
  const S = new Buf(), G = new Buf(), pieces = [];
  let cur = null;
  const begin = (kind, op = {}) => {
    cur = { id: pieces.length, kind, wall: op.wall ?? -1, hp: op.hp ?? Infinity, alive: true, struct: !!op.struct,
      lo: new V3(Infinity, Infinity, Infinity), hi: new V3(-Infinity, -Infinity, -Infinity), s0: S.n, g0: G.n, sn: 0, gn: 0,
      obb: null, col: null, sup: [], above: [], deps: [], panels: [], host: null, grounded: false };
  };
  const part = (geo, color, M, op = {}) => {
    (op.glow ? G : S).add(geo, color, M, op.bake ?? 0.15, op.jit ?? 0.05, R, cur);
    if (!cur.col) cur.col = new THREE.Color(color);
    if (op.obb) cur.obb = obbOf(M, op.pad ?? 0);
  };
  const end = () => {
    cur.sn = S.n - cur.s0; cur.gn = G.n - cur.g0;
    if (!cur.obb) {
      const c = cur.lo.clone().add(cur.hi).multiplyScalar(0.5), e = cur.hi.clone().sub(cur.lo).multiplyScalar(0.5);
      cur.obb = { c, ax: [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)], he: [e.x, e.y, e.z] };
    }
    cur.c = cur.obb.c; cur.grounded = cur.lo.y < base + 0.12;
    pieces.push(cur); const p = cur; cur = null; return p;
  };
  const M = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(new THREE.Euler(rx, ry, rz)), _s.set(sx, sy, sz));

  // ---- walls: frame (origin, along a, outward n) -------------------------------------------------
  const walls = [
    { o: new V3(0, 0, d / 2 - t / 2), a: new V3(1, 0, 0), L: w, gable: true, front: true },
    { o: new V3(0, 0, -(d / 2 - t / 2)), a: new V3(-1, 0, 0), L: w, gable: true },
    { o: new V3(w / 2 - t / 2, 0, 0), a: new V3(0, 0, -1), L: d - 2 * t, side: 1 },
    { o: new V3(-(w / 2 - t / 2), 0, 0), a: new V3(0, 0, 1), L: d - 2 * t, side: -1 },
  ];
  for (const W of walls) {
    W.n = new V3().crossVectors(W.a, new V3(0, 1, 0));
    W.q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(W.a, new V3(0, 1, 0), W.n));
  }
  const WM = (W, u, y, v, sx, sy, sz, rz = 0) => {
    const pos = W.o.clone().addScaledVector(W.a, u).addScaledVector(W.n, v); pos.y = y;
    const q = W.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), rz));
    return new THREE.Matrix4().compose(pos, q, new V3(sx, sy, sz));
  };

  // courses: the walls' share sums exactly to h; the gables continue up under the roof
  const courses = [];
  {
    const n = Math.max(3, Math.round((h - base) / GB.courseH)), hs = Array.from({ length: n }, () => R.r(0.85, 1.15));
    const sum = hs.reduce((a, b) => a + b, 0); let y = base;
    for (const k of hs) { const hh = k / sum * (h - base); courses.push({ y0: y, y1: y + hh, gable: false }); y += hh; }
    const top = h + rise - 0.5;
    while (y < top - 0.3) { const hh = Math.min(GB.courseH * R.r(0.9, 1.1), top - y); if (hh < 0.32) break; courses.push({ y0: y, y1: y + hh, gable: true }); y += hh; }
  }
  const nWall = courses.filter(c => !c.gable).length;
  const coursesIn = (y0, y1) => courses.map((c, i) => [c, i]).filter(([c]) => { const m = (c.y0 + c.y1) / 2; return m > y0 && m < y1; }).map(([, i]) => i);

  // openings
  for (const W of walls) W.open = [];
  const addOpen = (W, u0, u1, lo, hi, kind) => { const cs = coursesIn(lo, hi); if (cs.length >= 2) W.open.push({ u0, u1, c0: cs[0], c1: cs[cs.length - 1], kind }); };
  {
    const F = walls[0];
    const c1 = courses.findIndex(c => c.y1 >= base + 2.0);
    F.open.push({ u0: -0.78, u1: 0.78, c0: 0, c1, kind: 'door' });
    for (let f = 0; f < floors; f++) {
      const lo = base + f * fh + 0.8, hi = base + f * fh + 2.45;
      for (const W of walls) {
        const ww = R.r(1.05, 1.3);
        const us = W.front ? (f === 0 ? [-(w / 2 - 1.45), w / 2 - 1.45] : (w > 8 ? [-w / 3.2, 0, w / 3.2] : [-w / 4.2, w / 4.2]))
          : W.gable ? [-w / 4.2, w / 4.2] : (W.L > 6.5 ? [-W.L / 4, W.L / 4] : [0]);
        for (const u of us) addOpen(W, u - ww / 2, u + ww / 2, lo, hi, 'win');
      }
    }
    if (rise > 2.6) for (const W of walls.slice(0, 2)) addOpen(W, -0.5, 0.5, h + 0.35, h + 1.75, 'win');
  }
  const halfAt = (W, ci) => { const c = courses[ci]; return c.gable ? (w / 2) * (1 - (c.y1 - h) / rise) - 0.1 : W.L / 2; };

  // blocks
  walls.forEach((W, wi) => {
    courses.forEach((c, ci) => {
      if (c.gable && !W.gable) return;
      const hw = halfAt(W, ci); if (hw < 0.3) return;
      let free = [[-hw, hw]];
      for (const op of W.open) if (ci >= op.c0 && ci <= op.c1) {
        const nf = [];
        for (const [a, b] of free) { if (op.u1 <= a || op.u0 >= b) { nf.push([a, b]); continue; } if (op.u0 > a) nf.push([a, op.u0]); if (op.u1 < b) nf.push([op.u1, b]); }
        free = nf;
      }
      for (const [a, b] of free) {
        if (b - a < 0.28) continue;
        const cuts = [a]; let x = a + ((ci + wi) % 2 ? R.r(0.45, 0.75) : R.r(0.9, 1.25));
        if (b - a < 1.5) x = b;
        while (x < b - 0.45) { cuts.push(x); x += R.r(0.85, 1.35); }
        cuts.push(b);
        for (let k = 0; k < cuts.length - 1; k++) {
          const x0 = cuts[k], x1 = cuts[k + 1], ch = c.y1 - c.y0;
          begin('block', { wall: wi, hp: GB.hp.block, struct: true });
          part(GEO.pil, R.pick(GB.cookie), WM(W, (x0 + x1) / 2 + R.r(-0.02, 0.02), (c.y0 + c.y1) / 2 + R.r(-0.015, 0.015), R.r(-0.035, 0.035),
            x1 - x0 - 0.05, ch - 0.05, t * R.r(0.92, 1.05), R.r(-0.025, 0.025)), { bake: 0.6, jit: 0.1, obb: true });
          const blk = end();
          if (R() < 0.13 && x1 - x0 > 0.6) {          // a gumdrop or an icing dot stuck on the face
            begin('decor', { wall: wi, hp: GB.hp.decor }); const gd = R() < 0.6;
            part(gd ? GEO.ball : GEO.dot, gd ? R.pick(GB.candy) : GB.icing,
              WM(W, (x0 + x1) / 2 + R.r(-0.2, 0.2), (c.y0 + c.y1) / 2 + R.r(-0.1, 0.1), t / 2 + 0.03, gd ? 0.2 : 0.13, gd ? 0.17 : 0.13, gd ? 0.12 : 0.08));
            end().host = blk;
          }
        }
      }
    });
  });

  // openings: icing frames, glass, mullions, the door
  walls.forEach((W, wi) => {
    for (const op of W.open) {
      const y0 = op.kind === 'door' ? base : courses[op.c0].y0, y1 = courses[op.c1].y1, uw = op.u1 - op.u0, uc = (op.u0 + op.u1) / 2;
      if (op.kind === 'win') {
        begin('frame', { wall: wi, hp: GB.hp.frame, struct: true }); part(GEO.soft, GB.icing, WM(W, uc, y0 + 0.1, 0.05, uw + 0.34, 0.2, t + 0.16), { obb: true }); const sill = end();
        const ys0 = y0 + 0.2, ys1 = y1 - 0.24, yc = (ys0 + ys1) / 2, hs = ys1 - ys0;
        for (const u of [op.u0 + 0.1, op.u1 - 0.1]) { begin('frame', { wall: wi, hp: GB.hp.frame, struct: true }); part(GEO.soft, GB.icing, WM(W, u, yc, 0.02, 0.2, hs, t + 0.06), { obb: true }); end(); }
        begin('frame', { wall: wi, hp: GB.hp.frame, struct: true }); part(GEO.soft, GB.icing, WM(W, uc, y1 - 0.13, 0.06, uw + 0.42, 0.26, t + 0.22, R.r(-0.03, 0.03)), { obb: true }); const brow = end();
        begin('decor', { wall: wi, hp: GB.hp.decor }); part(GEO.pil, R.pick(GB.warm), WM(W, uc, yc, 0, uw - 0.34, hs, 0.14), { glow: true, bake: 0.1, obb: true }); end().host = sill;
        begin('decor', { wall: wi, hp: GB.hp.decor });
        const mc = R() < 0.7 ? '#e8303a' : R.pick(GB.candy);
        part(GEO.soft, mc, WM(W, uc, yc, 0.1, 0.1, hs, 0.08)); part(GEO.soft, mc, WM(W, uc, yc, 0.1, uw - 0.34, 0.1, 0.08));
        end().host = sill;
        begin('decor', { wall: wi, hp: GB.hp.decor }); part(GEO.ball, R.pick(GB.candy), WM(W, uc, y1 + 0.04, t / 2 + 0.02, 0.24, 0.2, 0.24)); end().host = brow;
      } else {   // the door: chocolate slab, icing frame, piping squiggles, a gumdrop knob, two glowing peep-holes (creepy-cute)
        const hd = y1 - 0.28 - base;
        begin('frame', { wall: wi, hp: GB.hp.frame + 2, struct: true }); part(GEO.pil, GB.choc, WM(W, uc, base + hd / 2, 0.02, uw - 0.34, hd, 0.24), { bake: 0.3, obb: true }); const slab = end();
        for (const u of [op.u0 + 0.1, op.u1 - 0.1]) { begin('frame', { wall: wi, hp: GB.hp.frame, struct: true }); part(GEO.soft, GB.icing, WM(W, u, base + hd / 2, 0.03, 0.2, hd, t + 0.08), { obb: true }); end(); }
        begin('frame', { wall: wi, hp: GB.hp.frame, struct: true }); part(GEO.soft, GB.icing, WM(W, uc, y1 - 0.15, 0.07, uw + 0.5, 0.3, t + 0.24), { obb: true }); end();
        begin('decor', { wall: wi, hp: GB.hp.decor });
        for (const f of [0.22, 0.48]) part(GEO.soft, GB.icing, WM(W, uc, base + hd * f, 0.15, uw - 0.6, 0.07, 0.05, Math.sin(f * 9) * 0.08));
        part(GEO.ball, '#ffd23a', WM(W, uc + 0.36, base + hd * 0.5 + 0.12, 0.17, 0.15, 0.15, 0.1));
        end().host = slab;
        begin('decor', { wall: wi, hp: GB.hp.decor });
        for (const s of [-1, 1]) part(GEO.ball, '#ffd070', WM(W, uc + s * 0.18, base + hd * 0.74, 0.14, 0.15, 0.17, 0.05), { glow: true });
        end().host = slab;
      }
    }
  });

  // nearest structural piece (for hanging decor on a host)
  const nearest = (p, wi) => {
    let best = null, bd = Infinity;
    for (const q of pieces) if (q.struct && (wi < 0 || q.wall === wi)) { const dd = obbDist(q.obb, p); if (dd < bd) { bd = dd; best = q; } }
    return best;
  };
  const inOpen = (W, u, y) => W.open.some(op => u > op.u0 - 0.2 && u < op.u1 + 0.2 && y > (op.kind === 'door' ? base : courses[op.c0].y0) - 0.1 && y < courses[op.c1].y1 + 0.15);

  // icing piping: a wavy bead band at each floor line and the eave line, beads down every corner
  const bands = [h - 0.02]; for (let f = 1; f < floors; f++) { let best = courses[0].y0, bd = 9; for (const c of courses) if (!c.gable && Math.abs(c.y1 - (base + f * fh)) < bd) { bd = Math.abs(c.y1 - (base + f * fh)); best = c.y1; } bands.push(best); }
  walls.forEach((W, wi) => {
    for (const by of bands) {
      const n = Math.max(2, Math.round(W.L / 0.36));
      for (let k = 0; k <= n; k++) {
        const u = -W.L / 2 + W.L * k / n; if (inOpen(W, u, by)) continue;
        const y = by + Math.sin(k * 1.7) * 0.05;
        begin('decor', { wall: wi, hp: GB.hp.decor }); const m = WM(W, u, y, t / 2 + 0.05, 0.2, 0.16, 0.17);
        part(GEO.dot, GB.icing, m, { jit: 0.02 }); const pc = end(); pc.host = nearest(pc.c, wi);
      }
    }
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const n = Math.round((h - base) / 0.3);
    for (let k = 0; k <= n; k++) {
      const y = base + (h - base) * k / n;
      begin('decor', { hp: GB.hp.decor }); part(GEO.dot, GB.icing, M(sx * (w / 2 + 0.02), y, sz * (d / 2 + 0.02), 0.22, 0.22, 0.22), { jit: 0.02 });
      const pc = end(); pc.host = nearest(pc.c, sz > 0 ? 0 : 1);
    }
  }

  // ---- roof panels ------------------------------------------------------------------------------------
  const xe = w / 2 + ov, ye = yR(xe), Ls = Math.hypot(xe, xe * tanA) + 0.2, ovz = 0.55, deep = d + 2 * ovz;
  const nP = Math.max(2, Math.round(deep / 3.4)), pl = deep / nP, panels = [];
  for (const s of [1, -1]) for (let k = 0; k < nP; k++) {
    const zA = -deep / 2 + k * pl, zB = zA + pl, zc = (zA + zB) / 2;
    const as = new V3(s * Math.cos(A), -Math.sin(A), 0), nr = new V3(s * Math.sin(A), Math.cos(A), 0), rz = -s * A;
    const mid = new V3(s * xe / 2, (h + rise + ye) / 2, zc);
    const at = (along, off, z) => new V3(0, h + rise, z).addScaledVector(as, along).addScaledVector(nr, off);
    begin('panel', { hp: GB.hp.panel });
    let c = mid.clone().addScaledVector(nr, 0.15);
    part(GEO.pil, GB.choc, M(c.x, c.y, c.z, Ls, 0.3, pl - 0.03, 0, 0, rz), { bake: 0.35 });
    c = mid.clone().addScaledVector(nr, 0.52);
    part(GEO.soft, GB.icing, M(c.x, c.y, c.z, Ls - 0.1, 0.5, pl + 0.06, 0, 0, rz), { obb: true, pad: 0.1, jit: 0.03, bake: 0.08 });
    for (let z = zA + 0.2; z < zB - 0.1; z += R.r(0.34, 0.48)) {      // icing drips over the eave
      const sy = R.r(0.18, 0.42), e = at(Ls - 0.25, 0.45, z); part(GEO.ball, GB.icing, M(e.x, e.y - sy * 0.45, e.z, 0.16, sy, 0.16), { jit: 0.02 });
    }
    for (let g = 0, n = 2 + Math.floor(R() * 2); g < n; g++) { const e = at(R.r(0.25, 0.85) * Ls, 0.8, R.r(zA + 0.4, zB - 0.4)); part(GEO.ball, R.pick(GB.candy), M(e.x, e.y, e.z, 0.26, 0.2, 0.26, 0, 0, rz)); }
    if (s === -1) {   // the ridge roll + gumdrops along it
      part(GEO.soft, GB.icing, M(0, h + rise + 0.6, zc, 0.75, 0.62, pl + 0.06), { jit: 0.02 });
      for (let z = zA + 0.5; z < zB - 0.2; z += 1.0) part(GEO.ball, R.pick(GB.candy), M(0, h + rise + 0.98, z, 0.26, 0.24, 0.26));
    }
    const pn = end(); pn.side = s; pn.zA = zA; pn.zB = zB; panels.push(pn);
  }
  // panel supports: wall tops (and the gable steps) under each panel
  for (const pn of panels) {
    for (const q of pieces) {
      if (!q.struct) continue;
      const W = walls[q.wall], onSide = W.side ? W.side === pn.side : pn.side * q.c.x > -0.25;
      if (!onSide || q.c.z < pn.zA - 0.6 || q.c.z > pn.zB + 0.6) continue;
      if (q.hi.y < yR(Math.min(Math.abs(q.c.x), w / 2)) - 0.9) continue;
      pn.sup.push(q); q.panels.push(pn);
    }
    pn.supN = pn.sup.length;
  }

  // ---- chimney (rides panel s=+1, k=0) -----------------------------------------------------------------
  {
    const pn = panels[0], cx = w / 4, cz = pn.zA + pl * R.r(0.45, 0.6), yb = yR(cx) - 0.6, yt = Math.max(yR(cx) + 2.0, h + rise + 0.6);
    begin('chimney', { hp: GB.hp.chimney });
    const n = Math.max(2, Math.round((yt - yb) / 0.66));
    for (let k = 0; k < n; k++) {
      const hh = (yt - yb) / n;
      part(GEO.pil, k % 2 ? GB.cookieDark : R.pick(GB.cookie), M(cx + R.r(-0.04, 0.04), yb + hh * (k + 0.5), cz, 1.0 + R.r(-0.05, 0.05), hh - 0.04, 1.0, 0, R.r(-0.06, 0.06), 0), { bake: 0.6, jit: 0.08 });
    }
    for (const f of [0.45, 0.8]) part(GEO.soft, GB.icing, M(cx, yb + (yt - yb) * f, cz, 1.16, 0.16, 1.16));
    part(GEO.soft, GB.icing, M(cx, yt + 0.08, cz, 1.3, 0.34, 1.3), { jit: 0.02 });
    part(GEO.ball, GB.icing, M(cx + 0.1, yt + 0.32, cz - 0.05, 0.9, 0.42, 0.85), { jit: 0.02 });
    part(GEO.soft, '#e8303a', M(cx - 0.25, yt + 0.62, cz + 0.1, 0.12, 0.7, 0.12, 0.15, 0, 0.25));       // a candy stick poking out of the snow
    const ch = end(); ch.obb = { c: new V3(cx, (yb + yt) / 2 + 0.2, cz), ax: [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)], he: [0.6, (yt - yb) / 2 + 0.4, 0.6] };
    ch.c = ch.obb.c; ch.host = pn;
  }

  // ---- static: plinth, icing skirt, a door step, a hearth glowing inside -------------------------------
  begin('static');
  part(GEO.pil, GB.cookieDark, M(0, base / 2, 0, w + 0.7, base + 0.02, d + 0.7), { bake: 0.4 });
  const per = 2 * (w + d + 1.4), nS = Math.round(per / 0.55);
  for (let k = 0; k < nS; k++) {
    let q = k / nS * per, x, z; const W2 = w / 2 + 0.38, D2 = d / 2 + 0.38;
    if (q < 2 * W2) { x = -W2 + q; z = D2; } else if ((q -= 2 * W2) < 2 * D2) { x = W2; z = D2 - q; } else if ((q -= 2 * D2) < 2 * W2) { x = W2 - q; z = -D2; } else { q -= 2 * W2; x = -W2; z = -D2 + q; }
    if (z > 0 && Math.abs(x) < 1.1) continue;
    part(GEO.ball, GB.icing, M(x, base, z, R.r(0.35, 0.5), R.r(0.25, 0.34), R.r(0.35, 0.5)), { jit: 0.02 });
  }
  part(GEO.pil, GB.cookieDark, M(0, base * 0.35, d / 2 + 0.75, 2.0, base * 0.7, 0.8), { bake: 0.4 });
  part(GEO.pil, GB.cookieDark, M(0, base + 0.5, -d / 2 + t + 0.45, 1.6, 1.0, 0.7), { bake: 0.4 });
  part(GEO.ball, '#ff8a3a', M(0, base + 0.35, -d / 2 + t + 0.85, 0.7, 0.45, 0.35), { glow: true });
  end();

  // ---- support graph ----------------------------------------------------------------------------------
  const struct = pieces.filter(p => p.struct);
  for (const a of struct) {
    if (a.grounded) continue;
    for (const b of struct) {
      if (b === a || b.wall !== a.wall) continue;
      if (b.hi.y < a.lo.y - 0.2 || b.hi.y > a.lo.y + 0.27 || b.lo.y > a.lo.y - 0.05) continue;
      if (Math.min(a.hi.x, b.hi.x) - Math.max(a.lo.x, b.lo.x) < 0.04 || Math.min(a.hi.z, b.hi.z) - Math.max(a.lo.z, b.lo.z) < 0.04) continue;
      a.sup.push(b); b.above.push(a);
    }
    if (!a.sup.length) a.grounded = true;      // nothing found under it: treat as anchored rather than dropping on build
  }
  for (const p of pieces) if (p.host) p.host.deps.push(p);

  // ---- meshes -----------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0); group.rotation.y = o.ry ?? 0;
  const solid = new THREE.Mesh(S.geometry(), MAT.solid); solid.castShadow = solid.receiveShadow = true;
  const glow = new THREE.Mesh(G.geometry(), MAT.glow);
  solid.name = 'gingerbread'; glow.name = 'gingerbread:glow';
  group.add(solid, glow); scene.add(group); group.updateMatrixWorld(true);
  const house = {
    group, solid, glow, pieces, w, d, h, rise, dying: [],
    inv: group.matrixWorld.clone().invert(), center: new V3(0, (h + rise) / 2, 0).applyMatrix4(group.matrixWorld),
    radius: Math.hypot(w, d) / 2 + rise + 1.5,
    tris: (S.n + G.n) / 3,
  };
  solid.userData.house = glow.userData.house = house;
  DESTRUCT.houses.push(house);
  return house;
}

// ---- hits ------------------------------------------------------------------------------------------------
const _lp = new V3(), _ld = new V3(), _w = new V3();
const rv = (k) => new V3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
/** point (world), radius m, power (bullet 1, blast ~30); o.dir = travel direction of the shot (world) */
function hitAt(point, radius, power = 1, o = {}) {
  let touched = 0, killed = 0; const blast = radius > 1;
  const col = new THREE.Color(); let hitCol = null;
  for (const H of DESTRUCT.houses) {
    if (point.distanceTo(H.center) > H.radius + radius) continue;
    _lp.copy(point).applyMatrix4(H.inv);
    if (o.dir) _ld.copy(o.dir).transformDirection(H.inv); else _ld.set(0, 0, 0);
    for (const p of H.pieces) {
      if (!p.alive || p.hp === Infinity) continue;
      const dd = obbDist(p.obb, _lp); if (dd > radius) continue;
      touched++;
      if (!hitCol || dd < 0.05) hitCol = p.col;
      p.hp -= blast ? power * (1 - 0.6 * dd / radius) : power;
      if (p.hp <= 0) {
        const away = p.c.clone().sub(_lp); const L = away.length() || 1; away.multiplyScalar(1 / L);
        const v = blast ? away.multiplyScalar(Math.min(16, 5 + power * 0.25) * (1 - 0.5 * L / (radius + 2))).add(new V3(0, 3 + Math.random() * 3, 0))
          : away.multiplyScalar(1.5).addScaledVector(_ld, 3).add(new V3(0, 1.5, 0));
        kill(H, p, v.add(rv(1.5)), rv(blast ? 9 : 5));
        killed++;
      } else bite(H, p);
    }
    settle(H);
  }
  // feedback: crumbs + icing chips + a dust puff
  if (touched) {
    const c = hitCol || col.set(GB.cookie[0]);
    const back = o.dir ? o.dir.clone().multiplyScalar(-1) : null;
    burst(point, { kind: 'crumb', n: blast ? 60 : 7, color: c, speed: blast ? 9 : 3.5, dir: back });
    burst(point, { kind: 'chip', n: blast ? 30 : 3, speed: blast ? 8 : 3, dir: back });
    burst(point, { kind: 'dust', n: blast ? 14 : 1, speed: blast ? 2.5 : 0.6 });
    const t = DESTRUCT._t;
    if (t - DESTRUCT._crunchT > 0.06) { DESTRUCT._crunchT = t; window.sfx?.play('crunch'); }
    if (killed && t - DESTRUCT._debT > 0.12) { DESTRUCT._debT = t; window.sfx?.play('debris'); }
  }
  if (blast) burst(point, { kind: 'ember', n: 26, speed: 10 });
  return { touched, killed };
}

function kill(H, p, vLocal, w) { if (!p.alive) return; p.alive = false; H.dying.push({ p, v: vLocal, w: w || rv(3) }); }

// cascade, then copy the dead out as debris and collapse their ranges
function settle(H) {
  for (let i = 0; i < H.dying.length; i++) {
    const { p, v } = H.dying[i];
    for (const q of p.deps) if (q.alive) kill(H, q, v.clone().multiplyScalar(0.7).add(rv(1)), q.kind === 'chimney' ? rv(2) : null);
    for (const q of p.above) if (q.alive && !q.grounded && !q.sup.some(s => s.alive)) kill(H, q, rv(0.6), rv(1.5));
    for (const pn of p.panels) if (pn.alive && pn.sup.filter(s => s.alive).length < pn.supN * 0.45)
      kill(H, pn, new V3(pn.side * 1.4, 0.3, 0), new V3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, -pn.side * 1.3));
  }
  if (!H.dying.length) return;
  H.group.updateMatrixWorld(true);
  for (const { p, v, w } of H.dying) {
    DESTRUCT.debris.spawn(H, p, v.applyQuaternion(H.group.quaternion), w.applyQuaternion(H.group.quaternion));
    collapse(H, p);
  }
  H.dying.length = 0;
}

function forRanges(H, p, fn) {
  if (p.sn) fn(H.solid.geometry, p.s0, p.sn);
  if (p.gn) fn(H.glow.geometry, p.g0, p.gn);
}
function collapse(H, p) {
  forRanges(H, p, (g, s0, n) => {
    const P = g.attributes.position; const a = P.array, c = p.c;
    for (let i = s0; i < s0 + n; i++) { a[i * 3] = c.x; a[i * 3 + 1] = c.y; a[i * 3 + 2] = c.z; }
    P.addUpdateRange(s0 * 3, n * 3); P.needsUpdate = true;
  });
}
// a damaged piece shrinks a little and goes a touch darker (bitten / scorched)
function bite(H, p) {
  p.bites = (p.bites || 0) + 1; if (p.bites > 3) return;
  const k = p.kind === 'panel' || p.kind === 'chimney' ? 0.985 : 0.93;
  forRanges(H, p, (g, s0, n) => {
    const P = g.attributes.position, C = g.attributes.color, a = P.array, cc = C.array, c = p.c;
    for (let i = s0; i < s0 + n; i++) {
      a[i * 3] = c.x + (a[i * 3] - c.x) * k; a[i * 3 + 1] = c.y + (a[i * 3 + 1] - c.y) * k; a[i * 3 + 2] = c.z + (a[i * 3 + 2] - c.z) * k;
      cc[i * 3] *= 0.9; cc[i * 3 + 1] *= 0.88; cc[i * 3 + 2] *= 0.88;
    }
    P.addUpdateRange(s0 * 3, n * 3); P.needsUpdate = true; C.addUpdateRange(s0 * 3, n * 3); C.needsUpdate = true;
  });
}

const _ray = [];
function raycast(raycaster) {
  _ray.length = 0;
  for (const H of DESTRUCT.houses) _ray.push(H.solid, H.glow);
  const hits = raycaster.intersectObjects(_ray, false);
  return hits.length ? { point: hits[0].point, house: hits[0].object.userData.house, distance: hits[0].distance, normal: hits[0].face?.normal } : null;
}

// ---- DEBRIS: one dynamic mesh; each item owns a vertex range, moved on the CPU, then left as rubble --------
function makeDebris(scene) {
  const cap = GB.debrisVerts;
  const P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), C = new Float32Array(cap * 3);
  const g = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage), aN = new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage), aC = new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aP); g.setAttribute('normal', aN); g.setAttribute('color', aC); g.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(g, MAT.solid); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'gingerbread:debris';
  scene.add(mesh);
  let cursor = 0, high = 0; const items = [];
  const nq = new THREE.Quaternion(), dq = new THREE.Quaternion(), tmp = new V3(), wv = new V3();

  function write(it) {
    const L = it.local, LN = it.ln, o = it.o, n = it.n, q = it.q, e = it.p;
    // rotate locals, find the lowest point, rest it on the ground
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      tmp.set(L[i * 3], L[i * 3 + 1], L[i * 3 + 2]).applyQuaternion(q);
      P[(o + i) * 3] = tmp.x + e.x; P[(o + i) * 3 + 1] = tmp.y + e.y; P[(o + i) * 3 + 2] = tmp.z + e.z;
      if (tmp.y + e.y < minY) minY = tmp.y + e.y;
    }
    const gy = DESTRUCT.ground(e.x, e.z);
    if (minY < gy) { const dy = gy - minY; e.y += dy; for (let i = 0; i < n; i++) P[(o + i) * 3 + 1] += dy; it.ground = true; } else it.ground = minY < gy + 0.03;
    for (let i = 0; i < n; i++) {
      tmp.set(LN[i * 3], LN[i * 3 + 1], LN[i * 3 + 2]).applyQuaternion(q);
      N[(o + i) * 3] = tmp.x; N[(o + i) * 3 + 1] = tmp.y; N[(o + i) * 3 + 2] = tmp.z;
    }
    aP.addUpdateRange(o * 3, n * 3); aN.addUpdateRange(o * 3, n * 3); aP.needsUpdate = aN.needsUpdate = true;
    return minY;
  }
  function freeRange(o, n) {     // kill any items overlapping [o, o+n): the oldest rubble makes room
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k]; if (it.o < o + n && it.o + it.n > o) {
        for (let i = it.o; i < it.o + it.n; i++) P[i * 3] = P[i * 3 + 1] = P[i * 3 + 2] = 0;
        aP.addUpdateRange(it.o * 3, it.n * 3); aP.needsUpdate = true; items.splice(k, 1);
      }
    }
  }
  return {
    mesh, items,
    spawn(H, p, v, w) {
      const n = p.sn + p.gn; if (!n || n > cap) return;
      if (cursor + n > cap) cursor = 0;
      const o = cursor; cursor += n; high = Math.max(high, cursor); g.setDrawRange(0, high);
      freeRange(o, n);
      const M = H.group.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(M);
      const centre = p.c.clone().applyMatrix4(M);
      const local = new Float32Array(n * 3), ln = new Float32Array(n * 3);
      let j = 0;
      const shrink = p.kind === 'panel' || p.kind === 'chimney' ? 1 : GB.shrink;
      forRanges(H, p, (sg, s0, cnt) => {
        const sp = sg.attributes.position.array, sn = sg.attributes.normal.array, sc = sg.attributes.color.array, glowy = sg === H.glow.geometry;
        for (let i = s0; i < s0 + cnt; i++, j++) {
          tmp.set(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]).applyMatrix4(M).sub(centre).multiplyScalar(shrink);
          local[j * 3] = tmp.x; local[j * 3 + 1] = tmp.y; local[j * 3 + 2] = tmp.z;
          tmp.set(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]).applyMatrix3(nm).normalize();
          ln[j * 3] = tmp.x; ln[j * 3 + 1] = tmp.y; ln[j * 3 + 2] = tmp.z;
          const k = glowy ? 1.15 : 1;      // glass shards keep a warm candy colour
          C[(o + j) * 3] = sc[i * 3] * k; C[(o + j) * 3 + 1] = sc[i * 3 + 1] * k; C[(o + j) * 3 + 2] = sc[i * 3 + 2] * k;
        }
      });
      aC.addUpdateRange(o * 3, n * 3); aC.needsUpdate = true;
      const big = p.kind === 'panel' || p.kind === 'chimney';
      // big pieces topple until they lie flat: the axis that should end up pointing up (panel normal / chimney side)
      const flat = big ? (p.kind === 'panel' ? new V3(p.side * Math.sin(Math.atan(GB.pitch)), Math.cos(Math.atan(GB.pitch)), 0) : new V3(1, 0, 0)).transformDirection(M) : null;
      const it = { o, n, local, ln, p: centre, q: new THREE.Quaternion(), v: v.clone(), w: w.clone(), age: 0, rest: 0, asleep: false, ground: false, big, flat };
      items.push(it); write(it);
    },
    update(dt) {
      let moving = 0;
      for (const it of items) if (!it.asleep) moving++;
      let excess = moving - GB.maxMoving;
      for (const it of items) {
        if (it.asleep) continue;
        it.age += dt;
        const slam = excess > 0 && !it.big; if (slam) { excess--; it.v.set(0, -30, 0); it.w.multiplyScalar(0.2); }    // oldest settle first: slammed to the ground
        it.v.y -= GB.gravity * dt;
        it.p.addScaledVector(it.v, dt);
        const wl = it.w.length();
        if (wl > 1e-4) { dq.setFromAxisAngle(wv.copy(it.w).multiplyScalar(1 / wl), wl * dt); it.q.premultiply(dq).normalize(); }
        const vy = it.v.y;
        write(it);
        if (it.ground) {
          if (vy < 0) it.v.y = -vy * GB.bounce; if (Math.abs(it.v.y) < 1.2) it.v.y = 0;
          const f = Math.exp(-GB.friction * dt); it.v.x *= f; it.v.z *= f; it.w.multiplyScalar(Math.exp(-(it.big ? 3 : 4.5) * dt));
          let flatOK = true;
          if (it.flat) {     // tip over toward lying flat (either face down)
            const ax = wv.copy(it.flat).applyQuaternion(it.q), up = ax.y >= 0 ? 1 : -1;
            const tq = new V3(-ax.z * up, 0, ax.x * up);         // ax x (0, up, 0): turns ax toward up
            it.w.addScaledVector(tq, 14 * dt);
            flatOK = Math.abs(ax.y) > 0.93;
          }
          if (flatOK && it.v.length() < GB.settleV && it.w.length() < 1.0) it.rest += dt; else it.rest = 0;
        }
        if (it.rest > 0.25 || it.age > GB.settleT * (it.big ? 1.6 : 1) || (slam && it.ground)) {
          if (it.ground || it.age > GB.settleT + 2) { it.asleep = true; moving--; }
        }
      }
    },
    clear() { items.length = 0; cursor = high = 0; P.fill(0); g.setDrawRange(0, 0); aP.needsUpdate = true; },
    count: () => items.length,
    moving: () => items.filter(i => !i.asleep).length,
  };
}

// ---- PARTICLES: crumbs, icing chips, dust puffs, embers -- one Points draw ---------------------------------
function makeParticles(scene) {
  const n = GB.particles;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
  const vel = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n), grav = new Float32Array(n), drag = new Float32Array(n), grow = new Float32Array(n), a0 = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float size; attribute vec4 pcol; varying vec4 vC; uniform float uScale;
      void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = vC.a * smoothstep(0.5, 0.25, r); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a);
      #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.name = 'gingerbread:particles';
  const _sz = new THREE.Vector2();
  pts.onBeforeRender = (r, s, cam) => { r.getDrawingBufferSize(_sz); mat.uniforms.uScale.value = _sz.y / (2 * Math.tan((cam.fov || 50) * Math.PI / 360)); };
  scene.add(pts);
  let next = 0;
  const c = new THREE.Color();
  return {
    pts,
    spawn(p, v, color, alpha, sz, lf, gr, dr, gw) {
      const i = next; next = (next + 1) % n;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      col[i * 4] = color.r; col[i * 4 + 1] = color.g; col[i * 4 + 2] = color.b; col[i * 4 + 3] = a0[i] = alpha;
      size[i] = sz; life[i] = max[i] = lf; grav[i] = gr; drag[i] = dr; grow[i] = gw;
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) { if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= grav[i] * dt;
        const f = Math.exp(-drag[i] * dt); vel[i * 3] *= f; vel[i * 3 + 1] *= f; vel[i * 3 + 2] *= f;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const gy = DESTRUCT.ground(pos[i * 3], pos[i * 3 + 2]);
        if (pos[i * 3 + 1] < gy) { pos[i * 3 + 1] = gy; vel[i * 3 + 1] *= -0.25; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
        size[i] += grow[i] * dt;
        const k = life[i] / max[i]; col[i * 4 + 3] = a0[i] * Math.min(1, k * 3) * (grow[i] > 0 ? k : 1);
      }
      for (const a of ['position', 'pcol', 'size']) g.attributes[a].needsUpdate = true;
    },
    clear() { life.fill(0); col.fill(0); g.attributes.pcol.needsUpdate = true; },
    c,
  };
}

const _bc = new THREE.Color(), _bv = new V3();
/** burst(point, {kind: 'crumb'|'chip'|'dust'|'snow'|'ember', n, color, speed, dir}) */
function burst(point, o = {}) {
  const P = DESTRUCT.parts; if (!P) return;
  const kind = o.kind || 'crumb', n = o.n ?? 6, sp = o.speed ?? 3;
  for (let i = 0; i < n; i++) {
    _bv.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(sp * (0.4 + Math.random() * 0.8));
    if (o.dir) _bv.addScaledVector(o.dir, sp * 0.6);
    if (kind === 'crumb') { _bc.copy(o.color || _bc.set(GB.cookie[0])).multiplyScalar(0.8 + Math.random() * 0.4); P.spawn(point, _bv, _bc, 1, 0.05 + Math.random() * 0.08, 1.2 + Math.random(), GB.gravity, 0.6, 0); }
    else if (kind === 'chip') { _bc.set(Math.random() < 0.8 ? GB.icing : GB.candy[i % GB.candy.length]); P.spawn(point, _bv, _bc, 1, 0.05 + Math.random() * 0.06, 1 + Math.random(), GB.gravity, 0.8, 0); }
    else if (kind === 'dust') { _bc.set('#eadbc8'); _bv.multiplyScalar(0.5).y += 0.6; P.spawn(point, _bv, _bc, 0.5, 0.5 + Math.random() * 0.5, 0.9 + Math.random() * 0.7, -0.3, 2.2, 1.6 + Math.random()); }
    else if (kind === 'snow') { _bc.set('#ffffff'); P.spawn(point, _bv, _bc, 0.85, 0.07 + Math.random() * 0.08, 0.7 + Math.random() * 0.5, GB.gravity * 0.6, 1.5, 0); }
    else if (kind === 'ember') { _bc.setRGB(3.2, 1.4 + Math.random(), 0.35); P.spawn(point, _bv.multiplyScalar(1.2), _bc, 1, 0.08 + Math.random() * 0.08, 0.6 + Math.random() * 0.8, GB.gravity * 0.35, 1.2, 0); }
  }
}

function update(dt) {
  DESTRUCT._t += dt;
  DESTRUCT.debris?.update(dt);
  DESTRUCT.parts?.update(dt);
}

function clear() {
  for (const H of DESTRUCT.houses) { H.group.removeFromParent(); H.solid.geometry.dispose(); H.glow.geometry.dispose(); }
  DESTRUCT.houses.length = 0;
  DESTRUCT.debris?.clear(); DESTRUCT.parts?.clear();
}

function stats() {
  let alive = 0, total = 0, tris = 0;
  for (const H of DESTRUCT.houses) { tris += H.tris; for (const p of H.pieces) { if (p.hp === Infinity) continue; total++; if (p.alive) alive++; } }
  return { houses: DESTRUCT.houses.length, alive, total, tris, debris: DESTRUCT.debris?.count() || 0, moving: DESTRUCT.debris?.moving() || 0 };
}
