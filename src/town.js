// THE DESTRUCTIBLE TOWN (his slice, Nov 23: "all the houses in the map ... completely destructible ... shoot them, crash into
// them"). b43 (his note on b40: "the far version looks like a completely different building ... make them like GINGERBREAD,
// faces that break along JAGGED lines"): every wall / gable / roof slope is a COOKIE SLAB pre-snapped into irregular chunks
// (a row-offset jittered grid, so the cracks zig-zag and never line up; every cell is an extruded prism with a pillowy baked
// front, crumb-coloured inner sides that only show once a neighbour is gone, and a dark back). Chunks sit flush, no gaps.
// Piped icing runs along the edges (wall tops, eaves + drips, ridges, rakes, window + door frames) and belongs to the chunk
// under it. EVERY chunk of EVERY house is a range of ONE merged mesh (one draw): knocking a chunk out collapses its index
// range. There is NO far LOD any more: near and far are the same geometry, so nothing ever swaps (~2-3k tris a house).
// Chunk ids are multiplayer-ready (a hit = "these ids are gone"). A chunk with no path to the ground through touching chunks
// falls; a house that loses its wall tops drops its roof; falling chunks tumble as debris and settle as rubble.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { rand, rr, shadowProxy } from './util.js';

export const TOWN = {
  mod: 1.2, course: 0.5,               // the old brick module: house sizes are still nx / nz modules x courses (village spacing)
  wallsX: 6, wallsZ: 4, courses: 9,
  T: 0.3, roofT: 0.3,                  // slab (cookie) thickness, m
  cell: { wall: [1.45, 1.1], gable: [1.4, 1.25], roof: [1.9, 1.8] },   // target chunk width / height per surface
  jit: 0.3,                            // vertex jitter, share of the neighbouring gap
  bulge: 0.05,                         // the baked pillow on each chunk's front
  hp: 5, hpArea: 2.2,                  // chunk hp = hp + hpArea * area (m2): Gatling (3 a bullet) ~3-4 bullets a chunk
  span: 2,                             // a chunk can hang sideways this many chunks off one held from below
  debrisMax: 420, gravity: 20,
  door: [1.2, 2.0], win: [1.2, 2.0, 3.0],   // door w x h; window w, y0, y1
  cookie: ['#d98f4e', '#cf8446', '#e39a58'], roof: ['#8a4c2a', '#9a5631', '#7c4325'], icing: '#fff8f0', crumb: '#efc08a',
};

// ---- 2D helpers (u, y in a surface frame) --------------------------------------------------------------------------
const area2 = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length], c = q[0] * r[1] - r[0] * q[1]; a += c; cx += (q[0] + r[0]) * c; cy += (q[1] + r[1]) * c; }
  return Math.abs(a) < 1e-9 ? p[0].slice() : [cx / (3 * a), cy / (3 * a)];
}
function clipPoly(p, [a, b, k]) {
  const out = [], f = q => a * q[0] + b * q[1] - k;
  for (let i = 0; i < p.length; i++) {
    const P = p[i], Q = p[(i + 1) % p.length], fp = f(P), fq = f(Q);
    if (fp <= 0) out.push(P);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function inPoly(p, u, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > y) !== (b[1] > y) && u < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function polyDist(p, u, y) {
  if (inPoly(p, u, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(u - a[0] - dx * t, y - a[1] - dy * t));
  }
  return best;
}

export function makeTown(scene) {
  const chunks = [];       // { h, S, kind, poly, bb, i0, i1, v0, vb, v1, hp, alive, col, lmin, lmax, band, top, ground, up, side, rest }
  const houses = [];
  let built = false, mesh, debrisMesh, wallProxy, roofProxy;
  const G = { pos: [], nrm: [], col: [], idx: [] };
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const V3 = THREE.Vector3;
  const icingC = new THREE.Color(TOWN.icing), crumbC = new THREE.Color(TOWN.crumb);

  // ---- emission (house-local points -> world, straight into the merged arrays) --------------------------------------
  let curH = null, curQ = null;
  const _v = new V3(), _n = new V3();
  function vert(p, n, c) {
    const i = G.pos.length / 3;
    _v.copy(p).applyMatrix4(curH); G.pos.push(_v.x, _v.y, _v.z);
    _n.copy(n).applyQuaternion(curQ).normalize(); G.nrm.push(_n.x, _n.y, _n.z);
    G.col.push(c.r, c.g, c.b);
    return i;
  }
  const tri = (a, b, c) => G.idx.push(a, b, c);
  const FP = (S, u, y, v) => S.O.clone().addScaledVector(S.A, u).addScaledVector(S.B, y).addScaledVector(S.N, v);

  /** one chunk: the polygon (CCW in u, y) extruded through the slab; front fan bulged into a baked pillow */
  function prism(S, poly, col, inner) {
    const h = S.T / 2, n = poly.length, [cu, cy] = centroid(poly);
    const cf = col.clone().multiplyScalar(1.07), cr = col.clone().multiplyScalar(0.88), cb = col.clone().multiplyScalar(0.6);
    const ci = crumbC.clone().multiply(new THREE.Color(1, 1, 1).lerp(col, 0.25)), ce = col.clone().multiplyScalar(0.82);
    // front
    const c0 = vert(FP(S, cu, cy, h + TOWN.bulge), S.N, cf), rim = [];
    for (const [u, y] of poly) {
      const rad = S.A.clone().multiplyScalar(u - cu).addScaledVector(S.B, y - cy).normalize();
      rim.push(vert(FP(S, u, y, h), S.N.clone().addScaledVector(rad, 0.45), cr));
    }
    for (let k = 0; k < n; k++) tri(c0, rim[k], rim[(k + 1) % n]);
    // back (fan from vertex 0, reversed)
    const bk = poly.map(([u, y]) => vert(FP(S, u, y, -h), S.N.clone().negate(), cb));
    for (let k = 1; k < n - 1; k++) tri(bk[0], bk[k + 1], bk[k]);
    // sides: crumb where the edge is a seam with a neighbour (shows once it is gone), cookie on the outside
    for (let k = 0; k < n; k++) {
      const [u0, y0] = poly[k], [u1, y1] = poly[(k + 1) % n], o = S.A.clone().multiplyScalar(y1 - y0).addScaledVector(S.B, -(u1 - u0)).normalize();
      const c = inner[k] ? ci : ce;
      const f0 = vert(FP(S, u0, y0, h), o, c), f1 = vert(FP(S, u1, y1, h), o, c), b0 = vert(FP(S, u0, y0, -h), o, c), b1 = vert(FP(S, u1, y1, -h), o, c);
      tri(f0, b0, b1); tri(f0, b1, f1);
    }
  }
  /** a piped icing run from P to Q (house-local): a soft diamond tube; nA = across the slab, oA = across the edge */
  function tube(P, Q, nA, oA, wn, hb) {
    const ends = [P, Q].map(c => [nA.clone().multiplyScalar(wn), oA.clone().multiplyScalar(hb), nA.clone().multiplyScalar(-wn), oA.clone().multiplyScalar(-hb)]
      .map(d => vert(c.clone().add(d), d, icingC)));
    for (let k = 0; k < 4; k++) { const a = ends[0][k], b = ends[0][(k + 1) % 4], c = ends[1][(k + 1) % 4], d = ends[1][k]; tri(a, b, c); tri(a, c, d); }
  }
  /** an icing drip hanging straight down from P (house-local), e = along the edge */
  function drip(P, e, len, w) {
    const down = new V3(0, -1, 0), s = new V3().crossVectors(e, down).normalize(), base = [e.clone().multiplyScalar(w), s.clone().multiplyScalar(w), e.clone().multiplyScalar(-w), s.clone().multiplyScalar(-w)];
    const tip = P.clone().addScaledVector(down, len);
    for (let k = 0; k < 4; k++) {
      const a = P.clone().add(base[k]), b = P.clone().add(base[(k + 1) % 4]), nrm = base[k].clone().add(base[(k + 1) % 4]).normalize().addScaledVector(down, 0.25);
      tri(vert(a, nrm, icingC), vert(tip, nrm, icingC), vert(b, nrm, icingC));
    }
  }

  // ---- FRACTURE one slab: row-offset jittered grid in the surface's (u, y), holes kept open, clips trim (gables) -----
  function fracture(hs, S, c) {
    const E = 1e-4, holes = c.holes || [], clips = c.clips || [];
    const [cw, ch] = c.cell;
    // horizontal lines: the rect + hole edges, gaps filled evenly
    const fy = [...new Set([c.y0, c.y1, ...holes.flatMap(o => [o.y0, o.y1]).filter(y => y > c.y0 + 0.05 && y < c.y1 - 0.05)])].sort((a, b) => a - b);
    const Y = [c.y0];
    for (let i = 1; i < fy.length; i++) { const g = fy[i] - fy[i - 1], nb = Math.max(1, Math.round(g / ch)); for (let k = 1; k <= nb; k++) Y.push(fy[i - 1] + g * k / nb); }
    const inHole = (u, y) => holes.some(o => u > o.u0 + E && u < o.u1 - E && y > o.y0 + E && y < o.y1 - E);
    const inside = (u, y) => u > c.u0 - E && u < c.u1 + E && y > c.y0 - E && y < c.y1 + E && clips.every(([a, b, k]) => a * u + b * y <= k + 1e-5) && !inHole(u, y);
    // per band: cell boundaries in u (fixed = rect ends + hole sides; fills alternate a half step row to row)
    const bnd = [];
    for (let j = 0; j < Y.length - 1; j++) {
      const ym = (Y[j] + Y[j + 1]) / 2;
      const fu = [...new Set([c.u0, c.u1, ...holes.filter(o => ym > o.y0 && ym < o.y1).flatMap(o => [o.u0, o.u1])])].sort((a, b) => a - b);
      const out = [fu[0]];
      for (let i = 1; i < fu.length; i++) {
        const a = fu[i - 1], b = fu[i], g = b - a;
        if (!inHole((a + b) / 2, ym)) {
          const nb = Math.max(1, Math.round(g / cw)), step = g / nb;
          if (j % 2 && step > 0.9) for (let k = 0; k < nb; k++) out.push(a + step * (k + 0.5) + (rand() - 0.5) * step * 0.3);
          else for (let k = 1; k < nb; k++) out.push(a + step * k + (rand() - 0.5) * step * 0.3);
        }
        out.push(b);
      }
      bnd.push(out);
    }
    // the vertices on each line (shared by the band below and above), jittered unless they sit on an outline
    const VX = [];
    for (let j = 0; j < Y.length; j++) {
      const us = [...new Set([...(bnd[j - 1] || []), ...(bnd[j] || [])].map(u => +u.toFixed(5)))].sort((a, b) => a - b);
      const m = new Map(), y = Y[j], gy = Math.min(j > 0 ? y - Y[j - 1] : Infinity, j < Y.length - 1 ? Y[j + 1] - y : Infinity);
      us.forEach((u, i) => {
        const gu = Math.min(i > 0 ? u - us[i - 1] : Infinity, i < us.length - 1 ? us[i + 1] - u : Infinity);
        const fixU = Math.abs(u - c.u0) < E || Math.abs(u - c.u1) < E || holes.some(o => (Math.abs(u - o.u0) < E || Math.abs(u - o.u1) < E) && y > o.y0 - E && y < o.y1 + E);
        const fixY = j === 0 || j === Y.length - 1 || holes.some(o => (Math.abs(y - o.y0) < E || Math.abs(y - o.y1) < E) && u > o.u0 - E && u < o.u1 + E);
        m.set(u, [u + (fixU ? 0 : (rand() - 0.5) * 2 * TOWN.jit * gu), y + (fixY ? 0 : (rand() - 0.5) * 2 * TOWN.jit * gy)]);
      });
      VX.push(m);
    }
    const cells = [], byBand = [];
    for (let j = 0; j < Y.length - 1; j++) {
      byBand.push([]);
      const B = bnd[j];
      for (let i = 0; i < B.length - 1; i++) {
        const a = +B[i].toFixed(5), b = +B[i + 1].toFixed(5);
        if (inHole((a + b) / 2, (Y[j] + Y[j + 1]) / 2)) continue;
        const bot = [...VX[j].keys()].filter(u => u >= a - E && u <= b + E).sort((p, q) => p - q).map(u => VX[j].get(u));
        const top = [...VX[j + 1].keys()].filter(u => u >= a - E && u <= b + E).sort((p, q) => q - p).map(u => VX[j + 1].get(u));
        let poly = [...bot, ...top];
        for (const cl of clips) { poly = clipPoly(poly, cl); if (poly.length < 3) break; }
        if (poly.length < 3) continue;
        if (area2(poly) < 0) poly.reverse();
        const ar = area2(poly); if (ar < 0.03) continue;
        cells.push({ j, a, b, poly, ar }); byBand[j].push(cells[cells.length - 1]);
      }
    }
    // emit each cell as a chunk (+ the icing along its outline edges)
    const pal = c.kind === 'roof' ? TOWN.roof : TOWN.cookie, h = S.T / 2;
    for (const cl of cells) {
      const poly = cl.poly, n = poly.length, [gu, gy] = centroid(poly);
      const col = new THREE.Color(pal[(rand() * pal.length) | 0]).multiplyScalar(rr(0.93, 1.06));
      const types = poly.map((A, k) => {
        const Bp = poly[(k + 1) % n]; let ou = Bp[1] - A[1], oy = -(Bp[0] - A[0]); const l = Math.hypot(ou, oy) || 1; ou /= l; oy /= l;
        const mu = (A[0] + Bp[0]) / 2, my = (A[1] + Bp[1]) / 2;
        if (inside(mu + ou * 0.03, my + oy * 0.03)) return null;     // a seam with a neighbour
        if (Math.abs(my - c.y1) < 0.02) return 'top';
        if (Math.abs(my - c.y0) < 0.02) return 'bottom';
        if (Math.abs(mu - c.u0) < 0.02 || Math.abs(mu - c.u1) < 0.02) return 'end';
        if (clips.some(([a, b, k]) => Math.abs(a * mu + b * my - k) < 0.03 * Math.hypot(a, b))) return 'rake';
        return 'hole';
      });
      const v0 = G.pos.length / 3, i0 = G.idx.length;
      prism(S, poly, col, types.map(t => !t));
      const vb = G.pos.length / 3;
      // icing along the outline edges this chunk owns
      for (let k = 0; k < n; k++) {
        const how = types[k] && c.ice[types[k]]; if (!how) continue;
        const [u0, y0] = poly[k], [u1, y1] = poly[(k + 1) % n], L = Math.hypot(u1 - u0, y1 - y0); if (L < 0.08) continue;
        const eu = (u1 - u0) / L, ey = (y1 - y0) / L, ex = 0.03;
        const o = S.A.clone().multiplyScalar(ey).addScaledVector(S.B, -eu).normalize();
        if (how === 'pipe') {
          tube(FP(S, u0 - eu * ex, y0 - ey * ex, h + 0.03), FP(S, u1 + eu * ex, y1 + ey * ex, h + 0.03), S.N, o, 0.06, 0.075);
        } else {   // cap: wraps the edge (wall tops, eaves, ridges), drips hang off it
          const lift = 0.04;
          tube(FP(S, u0 - eu * ex, y0 - ey * ex, 0).addScaledVector(o, lift), FP(S, u1 + eu * ex, y1 + ey * ex, 0).addScaledVector(o, lift), S.N, o, h * 1.25, 0.1);
          if (how === 'drip') {
            const e = S.A.clone().multiplyScalar(eu).addScaledVector(S.B, ey).normalize();
            const nd = Math.floor(L * 0.9 + rand());
            for (let d = 0; d < nd; d++) {
              const t = rr(0.15, 0.85), p = FP(S, u0 + (u1 - u0) * t, y0 + (y1 - y0) * t, c.kind === 'roof' ? 0 : h + 0.04).addScaledVector(o, c.kind === 'roof' ? 0.02 : -0.03);
              drip(p, e, rr(0.14, 0.34), 0.055);
            }
          }
        }
      }
      let bu0 = Infinity, bu1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (const [u, y] of poly) { bu0 = Math.min(bu0, u); bu1 = Math.max(bu1, u); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
      // house-local bounds (for the contacts between surfaces)
      const lmin = new V3(Infinity, Infinity, Infinity), lmax = new V3(-Infinity, -Infinity, -Infinity);
      for (const [u, y] of poly) for (const v of [-h, h]) { const p = FP(S, u, y, v); lmin.min(p); lmax.max(p); }
      const id = chunks.length;
      const ch2 = { id, h: hs, S, kind: c.kind, poly, c: [gu, gy], bb: [bu0, bu1, by0, by1], i0, i1: G.idx.length, v0, vb, v1: G.pos.length / 3,
        hp: TOWN.hp + TOWN.hpArea * cl.ar, alive: true, col, lmin, lmax, band: cl.j, ground: c.kind === 'wall' && cl.j === 0,
        top: c.kind === 'wall' && cl.j === Y.length - 2, up: [], side: [], rest: [], world: FP(S, gu, gy, 0).applyMatrix4(hs.H) };
      cl.id = id; chunks.push(ch2); S.chunks.push(ch2); hs.ids.push(id);
      if (c.kind === 'roof') hs.roof.push(id); if (ch2.top) hs.top.push(id);
    }
    // contacts inside the slab: same band side by side, band j -> j + 1 where they overlap
    for (let j = 0; j < byBand.length; j++) {
      const row = byBand[j];
      for (let i = 0; i < row.length - 1; i++) if (Math.abs(row[i].b - row[i + 1].a) < E) { chunks[row[i].id].side.push(row[i + 1].id); chunks[row[i + 1].id].side.push(row[i].id); }
      for (const p of row) for (const q of byBand[j + 1] || []) if (Math.min(p.b, q.b) - Math.max(p.a, q.a) > 0.05) {
        if (c.kind === 'roof') { chunks[p.id].side.push(q.id); chunks[q.id].side.push(p.id); } else chunks[p.id].up.push(q.id);
      }
    }
  }

  // ---- build one house (called by the village layout) ----------------------------------------------------------------
  function house(x, z, ry, o = {}) {
    const M = TOWN.mod;
    const nx = o.nx ?? TOWN.wallsX + (rand() < 0.4 ? 1 : 0), nz = o.nz ?? TOWN.wallsZ, rows = o.courses ?? TOWN.courses - (rand() < 0.3 ? 2 : 0);
    const W = nx * M, D = nz * M, gy = groundH(x, z), T = TOWN.T, Tr = TOWN.roofT;
    const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), ry);
    const H = new THREE.Matrix4().compose(new V3(x, gy, z), q, new V3(1, 1, 1));
    const hs = { x, z, ry, W, D, gy, H, ids: [], roof: [], top: [], surfs: [], alive: 0, total: 0, dead: false, decor: [] };
    curH = H; curQ = q;
    const top = rows * TOWN.course, gRows = Math.round(W / 2 / TOWN.course * 0.7), gh = gRows * TOWN.course;
    const peak = top + gh + 0.25, run = W / 2 + 0.55, rise = peak - top + 0.3, slope = Math.hypot(run, rise), pitch = Math.atan2(rise, run);
    const surf = (O, A, B, T0) => { const S = { O, A, B, N: new V3().crossVectors(A, B), T: T0, chunks: [], hs }; hs.surfs.push(S); return S; };
    const [dw, dh] = TOWN.door, [ww, wy0, wy1] = TOWN.win;
    const win = cu => ({ u0: cu - ww / 2, u1: cu + ww / 2, y0: wy0, y1: Math.min(wy1, top - 0.35) });
    const wallIce = { top: 'pipe', hole: 'pipe' }, eaveIce = { top: 'drip', hole: 'pipe' };
    // walls: front (+z, the door) + back run the full width; the sides fit between them
    const front = surf(new V3(-W / 2, 0, D / 2 - T / 2), new V3(1, 0, 0), new V3(0, 1, 0), T);
    fracture(hs, front, { kind: 'wall', u0: 0, u1: W, y0: 0, y1: top, cell: TOWN.cell.wall, ice: wallIce,
      holes: [{ u0: W / 2 - dw / 2, u1: W / 2 + dw / 2, y0: 0, y1: dh }, win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] });
    const back = surf(new V3(W / 2, 0, -D / 2 + T / 2), new V3(-1, 0, 0), new V3(0, 1, 0), T);
    fracture(hs, back, { kind: 'wall', u0: 0, u1: W, y0: 0, y1: top, cell: TOWN.cell.wall, ice: wallIce, holes: [win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] });
    const SL = D - 2 * T;
    for (const s of [1, -1]) {
      const side = surf(new V3(s * (W / 2 - T / 2), 0, s * (D / 2 - T)), new V3(0, 0, -s), new V3(0, 1, 0), T);
      fracture(hs, side, { kind: 'wall', u0: 0, u1: SL, y0: 0, y1: top, cell: TOWN.cell.wall, ice: eaveIce, holes: [win(SL / 2)] });
    }
    // gables front + back: clipped under the roof's underside
    const yU0 = top - 0.15 + rise - (Tr / 2) / Math.cos(pitch) - 0.02, k = rise / run;
    for (const s of [1, -1]) {
      const g = surf(new V3(-s * W / 2, 0, s * (D / 2 - T / 2)), new V3(s, 0, 0), new V3(0, 1, 0), T);
      fracture(hs, g, { kind: 'gable', u0: 0, u1: W, y0: top, y1: yU0, cell: TOWN.cell.gable, ice: { rake: 'pipe', top: 'pipe' },
        clips: [[k, 1, yU0 + k * W / 2], [-k, 1, yU0 - k * W / 2]] });
    }
    // roof: one chocolate slab per side, eave + ridge capped in icing, drips off the eave
    const RW = D + 1.0;
    for (const sgn of [1, -1]) {
      const B = new V3(-sgn * run, rise, 0).normalize(), A = new V3(0, 0, -sgn);
      const O = new V3(sgn * run, top - 0.15, 0).addScaledVector(B, -0.1);
      const S = surf(O, A, B, Tr);
      fracture(hs, S, { kind: 'roof', u0: -RW / 2, u1: RW / 2, y0: 0, y1: slope + 0.1 + 0.1, cell: TOWN.cell.roof, ice: { bottom: 'drip', top: 'cap', end: 'pipe' } });
    }
    hs.total = hs.alive = hs.ids.length;
    hs.wallH = top; hs.roofBase = top - 0.15; hs.roofW = run * 2; hs.roofH = rise + 0.1; hs.roofD = RW;   // shadow proxy sizes
    // dressing: door, glowing windows, candy canes, gumdrops, a chimney smoke point
    const D2 = D / 2, q0 = new THREE.Quaternion(), qy = a => new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), a);
    const wc = (wy0 + Math.min(wy1, top - 0.35)) / 2, wh = Math.min(wy1, top - 0.35) - wy0;
    hs.decor.push({ kind: 'door', m: H.clone().multiply(new THREE.Matrix4().compose(new V3(0, dh / 2, D2 - T / 2), q0, new V3(dw - 0.04, dh - 0.02, 0.12))) });
    for (const s of [-1, 1]) {
      hs.decor.push({ kind: 'win', m: H.clone().multiply(new THREE.Matrix4().compose(new V3(s * W * 0.28, wc, D2 - T / 2), q0, new V3(ww, wh, 1))) });
      hs.decor.push({ kind: 'win', m: H.clone().multiply(new THREE.Matrix4().compose(new V3(s * W * 0.28, wc, -D2 + T / 2), qy(Math.PI), new V3(ww, wh, 1))) });
      hs.decor.push({ kind: 'win', m: H.clone().multiply(new THREE.Matrix4().compose(new V3(s * (W / 2 - T / 2), wc, 0), qy(s * Math.PI / 2), new V3(ww, wh, 1))) });
      hs.decor.push({ kind: 'cane', m: H.clone().multiply(new THREE.Matrix4().makeTranslation(s * 1.1 + 0.3, 0, D2 + 0.6)) });
      hs.decor.push({ kind: 'gum', m: H.clone().multiply(new THREE.Matrix4().compose(new V3(s * 2.2, 0.25, D2 + 0.9), q0, new V3(1, 1, 1).multiplyScalar(rr(0.8, 1.2)))), col: rand() < 0.5 ? '#e8303a' : '#3aa85a' });
    }
    hs.smoke = new V3(W * 0.25, peak + 0.6, -D * 0.2).applyMatrix4(H);
    hs.collider = { x, z, r: Math.max(W, D) * 0.62, top: gy + peak + 0.4, town: hs };
    houses.push(hs);
    return { x, z, r: Math.max(W, D) * 0.72 + 3, front: new V3(0, 0, D2).applyMatrix4(H), w: W, d: D, collider: hs.collider, smoke: hs.smoke };
  }

  // ---- after the layout: the merged mesh, debris, dressing, shadow stand-ins -------------------------------------------
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(2.2), toneMapped: false });
  const decorMeshes = [];
  let ixLive = null;
  function finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
    ixLive = new THREE.BufferAttribute(new Uint32Array(G.idx), 1);
    g.setIndex(ixLive); g.computeBoundingSphere();
    mesh = new THREE.Mesh(g, mat); mesh.name = 'townChunks';
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.noMerge = true;   // the merger must not swallow the index trick
    scene.add(mesh);
    G.pos = G.nrm = G.col = G.idx = null;
    // debris: a snapped-cookie prism (hexagon, jittered), scaled per chunk
    const dg = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).rotateX(Math.PI / 2).toNonIndexed();
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) { const a = Math.atan2(dp.getY(i), dp.getX(i)), f = 0.8 + 0.25 * Math.sin(a * 3 + 1.3) + 0.1 * Math.cos(a * 5); if (Math.hypot(dp.getX(i), dp.getY(i)) > 0.01) dp.setXY(i, dp.getX(i) * f, dp.getY(i) * f); }
    dg.computeVertexNormals();
    debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 0.78 }), TOWN.debrisMax); debrisMesh.count = 0; debrisMesh.castShadow = true; debrisMesh.frustumCulled = false;
    debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOWN.debrisMax * 3), 3); scene.add(debrisMesh);
    // dressing: one instanced mesh per kind
    const kinds = {
      door: [new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b82a26', roughness: 0.5 })],
      win: [new THREE.PlaneGeometry(1, 1), glowMat],
      cane: [(() => { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(t < 0.75 ? new V3(0, t / 0.75 * 1.3, 0) : new V3(0.18 - Math.cos((t - 0.75) / 0.25 * Math.PI) * 0.18, 1.3 + Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.18, 0)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.07, 5); })(),
        new THREE.MeshStandardMaterial({ map: caneTex(), roughness: 0.4 })],
      gum: [(() => { const g2 = new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); g2.scale(1, 1.3, 1); return g2; })(), new THREE.MeshStandardMaterial({ roughness: 0.35 })],
    };
    for (const [k, [g2, m]] of Object.entries(kinds)) {
      const list = []; houses.forEach((h, hi) => h.decor.forEach(d => { if (d.kind === k) list.push({ h: hi, d }); }));
      const im = new THREE.InstancedMesh(g2, m, Math.max(1, list.length));
      list.forEach((e, i) => { im.setMatrixAt(i, e.d.m); if (e.d.col) im.setColorAt(i, new THREE.Color(e.d.col)); });
      im.castShadow = false; im.receiveShadow = k !== 'win'; im.frustumCulled = false; scene.add(im); decorMeshes.push({ im, list });
    }
    // SHADOW PROXIES: walls = a unit box (base at y 0) scaled W x wall height x D; roof = a unit prism over the gables
    wallProxy = shadowProxy(scene, new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), houses.length, houses.length);
    const triS = new THREE.Shape(); triS.moveTo(-0.5, 0); triS.lineTo(0.5, 0); triS.lineTo(0, 1); triS.lineTo(-0.5, 0);
    roofProxy = shadowProxy(scene, new THREE.ExtrudeGeometry(triS, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), houses.length, houses.length);
    houses.forEach((hs, i) => {
      hs.pi = i; hs.walls = hs.ids.filter(id => chunks[id].kind === 'wall'); hs.wallTotal = hs.walls.length;
      roofProxy.setMatrixAt(i, hs.H.clone().multiply(new THREE.Matrix4().compose(new V3(0, hs.roofBase, 0), new THREE.Quaternion(), new V3(hs.roofW, hs.roofH, hs.roofD))));
      proxyFollow(hs);
    });
    built = true;
  }
  function caneTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fff6ec' : '#e3283a'; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  /** b43: no far LOD -- near and far are the same chunks (kept so main.js's call stays valid) */
  function lodTick() {}

  // ---- hits ----------------------------------------------------------------------------------------------------------------
  const _o = new V3(), _d = new V3(), _p = new V3(), _q = new THREE.Quaternion();
  /** a world point / direction into a surface frame (house rotation, then the frame's axes) */
  function toLocal(hs, S, p, out) {
    _p.set(p.x - hs.x, p.y - hs.gy, p.z - hs.z).applyQuaternion(_q.setFromAxisAngle(_YA, -hs.ry)).sub(S.O);
    return out.set(_p.dot(S.A), _p.dot(S.B), _p.dot(S.N));
  }
  function dirLocal(hs, S, d, out) {
    _p.copy(d).applyQuaternion(_q.setFromAxisAngle(_YA, -hs.ry));
    return out.set(_p.dot(S.A), _p.dot(S.B), _p.dot(S.N));
  }
  const _YA = new V3(0, 1, 0);
  const near2 = (hs, p, pad) => (p.x - hs.x) ** 2 + (p.z - hs.z) ** 2 < (Math.max(hs.W, hs.D) * 0.8 + pad) ** 2;
  function findLive(S, u, y) {
    for (const c of S.chunks) if (c.alive && u >= c.bb[0] && u <= c.bb[1] && y >= c.bb[2] && y <= c.bb[3] && inPoly(c.poly, u, y)) return c;
    return null;
  }
  /** nearest live chunk along a world ray: { id, dist, point, house } or null */
  function raycast(from, dir, maxD = 250) {
    let best = null;
    for (const hs of houses) {
      const ox = from.x - hs.x, oz = from.z - hs.z, R = Math.max(hs.W, hs.D) * 0.8 + 1;
      const t0 = -(ox * dir.x + oz * dir.z) / Math.max(1e-6, dir.x * dir.x + dir.z * dir.z);
      const cx = ox + dir.x * t0, cz = oz + dir.z * t0;
      if (cx * cx + cz * cz > R * R && ox * ox + oz * oz > R * R) continue;
      for (const S of hs.surfs) {
        toLocal(hs, S, from, _o); dirLocal(hs, S, dir, _d);
        if (Math.abs(_d.z) < 1e-6) continue;
        const h = S.T / 2 + TOWN.bulge * 0.5;
        let t1 = (-h - _o.z) / _d.z, t2 = (h - _o.z) / _d.z; if (t1 > t2) [t1, t2] = [t2, t1];
        t1 = Math.max(0, t1); const lim = best ? best.dist : maxD;
        if (t1 > t2 || t1 > lim) continue;
        for (const t of [t1, (t1 + t2) / 2, t2]) {
          if (t > lim) break;
          const c = findLive(S, _o.x + _d.x * t, _o.y + _d.y * t);
          if (c) { best = { id: c.id, dist: t, point: from.clone().addScaledVector(dir, t), house: hs }; break; }
        }
      }
    }
    return best;
  }
  /** is a world point inside a live chunk? (rockets / snowballs) */
  function solidAt(p) {
    for (const hs of houses) {
      if (!near2(hs, p, 2)) continue;
      for (const S of hs.surfs) {
        toLocal(hs, S, p, _o);
        if (Math.abs(_o.z) < S.T / 2 + 0.06 && findLive(S, _o.x, _o.y)) return true;
      }
    }
    return false;
  }
  /** knock out chunks near a world point (power = damage per chunk); returns how many fell. A chunk is in when the point is
   *  within r * .45 of its outline, or r * .85 of its middle (a rifle punches a hole, a rocket blows a big one) */
  function blast(p, radius, power = 99, push = null) {
    let n = 0;
    for (const hs of houses) {
      if (!near2(hs, p, radius + 1)) continue;
      const kill = [];
      for (const S of hs.surfs) {
        toLocal(hs, S, p, _o);
        const dv = Math.max(0, Math.abs(_o.z) - S.T / 2);
        if (dv > radius) continue;
        for (const c of S.chunks) {
          if (!c.alive) continue;
          const dc = Math.hypot(_o.x - c.c[0], _o.y - c.c[1], dv);
          if (dc > radius * 0.85 + 2) continue;
          const de = Math.hypot(polyDist(c.poly, _o.x, _o.y), dv);
          if (de < radius * 0.45 || dc < radius * 0.85) { c.hp -= power; if (c.hp <= 0) kill.push(c.id); }
        }
      }
      if (kill.length) n += remove(hs, kill, p, push);
    }
    return n;
  }
  /** damage one chunk (bullets): it bruises darker each hit */
  function hitBrick(id, dmg, from) {
    const c = chunks[id]; if (!c || !c.alive) return 0;
    c.hp -= dmg;
    const ca = mesh.geometry.attributes.color;
    for (let i = c.v0; i < c.vb; i++) ca.setXYZ(i, ca.getX(i) * 0.88, ca.getY(i) * 0.88, ca.getZ(i) * 0.88);
    ca.addUpdateRange(c.v0 * 3, (c.vb - c.v0) * 3); ca.needsUpdate = true;
    c.col.multiplyScalar(0.88);
    if (c.hp > 0) return 0;
    return remove(c.h, [id], c.world.clone(), from);
  }

  /** contacts between surfaces (corners, wall top -> gable, roof resting on walls / gables, roof ridge), once per house */
  function links(hs) {
    if (hs.linked) return; hs.linked = true;
    const ov = (a, b, e) => a.lmin.x - e <= b.lmax.x && b.lmin.x - e <= a.lmax.x && a.lmin.y - e <= b.lmax.y && b.lmin.y - e <= a.lmax.y && a.lmin.z - e <= b.lmax.z && b.lmin.z - e <= a.lmax.z;
    const ids = hs.ids.map(i => chunks[i]);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j]; if (a.S === b.S) continue;
      const ra = a.kind === 'roof', rb = b.kind === 'roof';
      if (ra && rb) { if (ov(a, b, 0.05)) { a.side.push(b.id); b.side.push(a.id); } continue; }
      if (ra || rb) { if (ov(a, b, 0.2)) (ra ? a : b).rest.push((ra ? b : a).id); continue; }
      if (!ov(a, b, 0.05)) continue;
      if (a.kind === 'wall' && b.kind === 'wall') { a.side.push(b.id); b.side.push(a.id); }
      else if (a.kind === 'gable' && b.kind === 'gable') { a.side.push(b.id); b.side.push(a.id); }
      else (a.kind === 'wall' ? a : b).up.push((a.kind === 'wall' ? b : a).id);
    }
  }
  function remove(hs, ids, at, push) {
    links(hs);
    const gone = new Set(ids), live = id => chunks[id].alive && !gone.has(id);
    // SUPPORT (his note: one shot dropped a whole wall -- he wants to chip pieces out until it gives): a chunk stands if it
    // reaches the ground through living chunks -- up from one below it, or sideways for up to TOWN.span chunks
    let changed = true;
    while (changed) {
      changed = false;
      const best = new Map(), q = [];
      for (const id of hs.ids) { const c = chunks[id]; if (c.ground && live(id)) { best.set(id, 0); q.push(id); } }
      while (q.length) {
        const id = q.shift(), c = chunks[id], k = best.get(id);
        for (const u of c.up) if (live(u) && !(best.get(u) <= 0)) { best.set(u, 0); q.push(u); }
        if (k < TOWN.span) for (const u of c.side) if (chunks[u].kind !== 'roof' && live(u) && !(best.get(u) <= k + 1)) { best.set(u, k + 1); q.push(u); }
      }
      for (const id of hs.ids) if (chunks[id].kind !== 'roof' && live(id) && !best.has(id)) { gone.add(id); changed = true; }
      // the roof: drops when the wall tops are mostly gone; else a roof chunk holds if it reaches one resting on a live wall / gable
      const topAlive = hs.top.filter(live).length;
      if (hs.top.length && topAlive < hs.top.length * 0.4) { for (const r of hs.roof) if (live(r)) { gone.add(r); changed = true; } continue; }
      const held = new Set(), rq = [];
      for (const r of hs.roof) if (live(r) && chunks[r].rest.some(live)) { held.add(r); rq.push(r); }
      while (rq.length) { const r = rq.pop(); for (const u of chunks[r].side) if (live(u) && !held.has(u)) { held.add(u); rq.push(u); } }
      for (const r of hs.roof) if (live(r) && !held.has(r)) { gone.add(r); changed = true; }
    }
    const ix = mesh.geometry.index;
    for (const id of gone) {
      const c = chunks[id]; c.alive = false; hs.alive--;
      ix.array.fill(ix.array[c.i0], c.i0, c.i1);     // collapse its triangles to one point
      ix.addUpdateRange(c.i0, c.i1 - c.i0);
      spawnDebris(c, at, push, ids.includes(id));
    }
    ix.needsUpdate = true;
    proxyFollow(hs);
    // the house's crash collider + dressing follow what's left
    const frac = hs.alive / hs.total;
    if (frac < 0.35 && !hs.dead) {
      hs.dead = true; hs.collider.r = 0;
      decorMeshes.forEach(({ im, list }) => { list.forEach((e, i) => { if (houses[e.h] === hs) im.setMatrixAt(i, ZERO); }); im.instanceMatrix.needsUpdate = true; });
    }
    window.sfx?.play(gone.size > 6 ? 'debris' : 'crunch', { vol: Math.min(1, 0.4 + gone.size * 0.05) });
    return gone.size;
  }

  /** the house's shadow stand-ins follow what is left: the wall box's height = the share of wall chunks still up, the roof
   *  prism goes when most of the roof has dropped */
  const _pm = new THREE.Matrix4(), _ps = new V3(), _pp = new V3(), _pq = new THREE.Quaternion();
  function proxyFollow(hs) {
    if (!wallProxy || hs.pi === undefined) return;
    let w = 0; for (const id of hs.walls) if (chunks[id].alive) w++;
    const f = hs.wallTotal ? w / hs.wallTotal : 0;
    wallProxy.setMatrixAt(hs.pi, f > 0.02 ? _pm.multiplyMatrices(hs.H, new THREE.Matrix4().compose(_pp.set(0, 0, 0), _pq, _ps.set(hs.W, hs.wallH * f, hs.D))) : ZERO);
    let r = 0; for (const id of hs.roof) if (chunks[id].alive) r++;
    if (r < hs.roof.length * 0.5) roofProxy.setMatrixAt(hs.pi, ZERO);
    wallProxy.instanceMatrix.needsUpdate = roofProxy.instanceMatrix.needsUpdate = true;
  }

  // ---- debris: knocked-out chunks tumble, bounce, settle as rubble (oldest recycled) -----------------------------------
  const deb = [];
  let debI = 0;
  const _bm = new THREE.Matrix4();
  function spawnDebris(c, at, push, direct) {
    const S = c.S, hs = c.h;
    const pos = c.world.clone();
    const q = new THREE.Quaternion().setFromRotationMatrix(_bm.makeBasis(S.A, S.B, S.N)).premultiply(new THREE.Quaternion().setFromAxisAngle(_YA, hs.ry));
    const s = new V3((c.bb[1] - c.bb[0]) * 0.85, (c.bb[3] - c.bb[2]) * 0.85, S.T);
    const away = pos.clone().sub(at); const L = away.length() || 1; away.multiplyScalar(1 / L);
    const vel = direct ? away.multiplyScalar(4 + Math.random() * 3) : new V3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
    if (push) vel.addScaledVector(push, direct ? 0.35 : 0.1);
    vel.y += direct ? 2 + Math.random() * 3 : 0;
    const i = debI++ % TOWN.debrisMax;
    deb[i] = { pos, vel, q, s, spin: new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(direct ? 8 : 3), rest: false, life: 0 };
    debrisMesh.setColorAt(i, c.col); debrisMesh.instanceColor.needsUpdate = true;
    debrisMesh.count = Math.min(TOWN.debrisMax, Math.max(debrisMesh.count, i + 1));
  }
  const _m = new THREE.Matrix4(), _e = new THREE.Quaternion(), _eu = new THREE.Euler();
  function update(dt) {
    if (!built) return;
    let moved = false;
    for (let i = 0; i < deb.length; i++) {
      const d = deb[i]; if (!d || d.rest) continue;
      moved = true; d.life += dt;
      d.vel.y -= TOWN.gravity * dt; d.pos.addScaledVector(d.vel, dt);
      _e.setFromEuler(_eu.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)); d.q.multiply(_e);
      const gy = groundH(d.pos.x, d.pos.z) + 0.15;
      if (d.pos.y < gy) {
        d.pos.y = gy; d.vel.y *= -0.3; d.vel.x *= 0.55; d.vel.z *= 0.55; d.spin.multiplyScalar(0.5);
        if (Math.abs(d.vel.y) < 0.8 && d.vel.lengthSq() < 0.6 || d.life > 5) { d.rest = true; d.vel.set(0, 0, 0); }
      }
      debrisMesh.setMatrixAt(i, _m.compose(d.pos, d.q, d.s));
    }
    if (moved) debrisMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    house, finish, update, lodTick, raycast, solidAt, blast, hitBrick, houses,
    get stats() {
      const tris = mesh ? mesh.geometry.index.count / 3 : 0;
      return { bricks: chunks.length, chunks: chunks.length, alive: chunks.filter(c => c.alive).length, houses: houses.length, tris, trisPerHouse: houses.length ? Math.round(tris / houses.length) : 0, far: 0 };
    },
  };
}
