// DESTRUCT: breakable gingerbread houses, built from a MODULAR KIT (his sheet: images/reference/gingerbread_kit_sheet.jpg,
// his house: images/reference/gingerbread_house_ref.jpg). Every module is a builder function writing into a context K:
//   kWall (square slab panel: plain / flake / swirl / window (awning + lattice) / lattice / dark / door / arch),
//   kRope + kPost (twisted icing-rope pillars), kGable (triangle end: round window + swirls, or a snowflake),
//   kRoof (one slope section: round cookie shingles, thick icing eave + drips, rake trim, ridge roll, candy dots),
//   kDormer, kChimney, kLantern, kCane, kPeppermint, kGumdrop, kPlinth (cookie-stone ring + snow), kSteps, kFence, kSnow.
// A house = modules snapped to the GB.mod grid (assembleHouse); the kit row (buildKit) lays each module out on its own.
// WALLS ARE SOLID: each slab is a jittered grid of chunks that share their seams exactly (flush, no see-through). A chunk is
// an extruded prism: a bumpy baked front, crumb-coloured inner sides (hidden until a neighbour dies), a dark back.
// Method (Korajin m4595): ONE merged mesh per material per house (solid + glow); every piece owns a contiguous vertex range.
// A hit takes HP off pieces in its radius (oriented boxes); a bitten chunk dents in + darkens (its crumb seams show like
// cracks); a dead one is copied out as CPU debris and its range collapsed to a point -- the draw count never moves.
// Structure: struct pieces (chunks, rope pillars, roof sections) link by contact; after a kill, anything no longer connected
// to the ground falls. Decor (windows, door, awning, chimney, dormer, lantern) rides a host piece and goes with it.
// API:  buildBreakableHouse(scene, {x, y, z, ry, seed, nx, nz, floors, front, left, right, back, dormer, chimney, ...}) -> house
//       buildKit(scene, {x, z, ry}) -> the kit laid out like his sheet (shootable too)
//       DESTRUCT.hitAt(point, radius, power, {dir}) / .raycast(raycaster) / .update(dt) / .clear() / .stats() / .burst(...)
import * as THREE from 'three';

export const GB = {
  // palette (one family: baked cookie, icing, candy)
  cookie: '#b4642c', cookieLt: '#c4783a', crumb: '#e0aa6c', reveal: '#9a5020', inner: '#7a4220', roofSlab: '#8e4c24',
  shingle: '#b66a34', stone: '#a65c2a', choc: '#4a2a1c', door: '#c22e28', icing: '#fff8f0', red: '#e3283a', green: '#2f8f44',
  gold: '#f2b742', mullion: '#7a3e1c', candy: ['#e3283a', '#2f9a4a', '#ffd23a', '#ff7ab8'], warm: ['#ffcf86', '#ffc474', '#ffd9a0'],
  // the module grid + proportions
  // squat cottage (his ref): low walls, a big steep overhanging roof that dominates, chunky posts + plinth
  mod: 2.4, storey: 2.55, base: 0.62, wallT: 0.36, pitch: 1.3, overhang: 0.42, overhangZ: 0.6, roofT: 0.28,
  postR: 0.36, ropeR: 0.17, plinthPad: 0.6, chimneyHW: 0.62, doorH: 2.05, winY: [0.5, 1.32],
  lodNear: 40, lodFar: 52,                     // build the breakable version inside lodNear, drop it (if untouched) past lodFar
  cell: 0.72, jit: 0.22, bulge: 0.03,
  hp: { chunk: 3, roof: 3, rope: 5, frame: 4, door: 5, decor: 2, dormer: 6, chimney: 10 },
  glow: 1.9,                                   // window glow multiplier (past the bloom threshold)
  gravity: 18, bounce: 0.3, friction: 5, settleV: 0.45, settleT: 6, shrink: 0.9,
  maxMoving: 160, debrisVerts: 300000, particles: 1200,
};

const V3 = THREE.Vector3, XA = new V3(1, 0, 0), YA = new V3(0, 1, 0), ZA = new V3(0, 0, 1);

// baked-cookie speckle + sugar dust, by world position, gated by the vertex colour's alpha (1 cookie, .75 dusted, .5 sugar)
const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
solidMat.onBeforeCompile = s => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpk;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpk = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSpk;
float spkH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_COLOR_ALPHA
  {
    float m = vColor.a; vec3 sp = vSpk * 30.0; vec3 q = floor(sp); float h = spkH(q), h2 = spkH(q + 17.3);
    float dd = length(fract(sp) - 0.5);                 // a round speck: the slice of a little sphere in each cell
    float fw = clamp(1.5 - length(fwidth(sp)) * 0.9, 0.0, 1.0);
    float ck = step(0.6, m), sg = step(0.3, m) * (1.0 - step(0.9, m));
    diffuseColor.rgb *= 1.0 - ck * step(0.8, h) * smoothstep(0.36, 0.22, dd) * 0.3 * fw;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.93), sg * step(0.72, h2) * smoothstep(0.34, 0.2, dd) * 0.85 * fw);
    diffuseColor.a = 1.0;
  }
#endif
  float iceM = 0.0, glwM = 0.0;
#ifdef USE_COLOR_ALPHA
  iceM = step(0.1, vColor.a) * (1.0 - step(0.25, vColor.a));   // mask .15 = icing: glossy, warm see-through
  glwM = step(0.02, vColor.a) * (1.0 - step(0.08, vColor.a));  // mask .05 = baked glow (far windows)
#endif`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.3, iceM);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * (vec3(1.0, 0.8, 0.62) * 0.09 * iceM + 1.9 * glwM);`);
};
solidMat.customProgramCacheKey = () => 'gb-speckle';
const MAT = {
  solid: solidMat,
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(GB.glow) }),
};

// ---- seeded random + noise ---------------------------------------------------------------------------
function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.r = (lo, hi) => lo + f() * (hi - lo);
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const _rgb = new Map([[GB.icing, [1.12, 1.08, 1.05]]]);        // icing: a warm cream a touch past white (reads bright under ACES)
const ICE = 0.15, GLOWM = 0.05;                                 // mask values: icing (gloss) / baked glow
function rgbOf(hex) {
  let v = _rgb.get(hex); if (v) return v;
  const c = new THREE.Color(hex); v = [c.r, c.g, c.b]; _rgb.set(hex, v); return v;
}
/** painterly tone: soft low-frequency variation + a little warm/cool drift */
function toneRGB(rgb, x, y, z, k = 1) {
  const n1 = noise3(x * 0.9 + 7.1, y * 0.9, z * 0.9) - 0.5, n2 = noise3(x * 3.7, y * 3.7 + 3.3, z * 3.7) - 0.5;
  const kk = k * (1 + 0.22 * n1 + 0.1 * n2);
  return [rgb[0] * kk * (1 + 0.04 * n2), rgb[1] * kk, rgb[2] * kk * (1 - 0.06 * n1)];
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---- unit shapes ------------------------------------------------------------------------------------------
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
    sh[i / 3] = 1 - Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  }
  const out = { p: P, n: N, sh, count: P.length / 3 }; g.dispose(); return out;
}
function ballGeo(detail) {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const P = g.attributes.position.array, N = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) { const l = Math.hypot(P[i], P[i + 1], P[i + 2]) || 1; N[i] = P[i] / l; N[i + 1] = P[i + 1] / l; N[i + 2] = P[i + 2] / l; }
  const out = { p: P, n: N, sh: new Float32Array(P.length / 3), count: P.length / 3 }; g.dispose(); return out;
}
function latheGeo(prof, sides, shK = 0) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), sides).toNonIndexed();
  const P = g.attributes.position.array, N = g.attributes.normal.array, sh = new Float32Array(P.length / 3);
  for (let i = 0; i < sh.length; i++) sh[i] = shK * (1 - Math.abs(N[i * 3 + 1]));
  const out = { p: P, n: N, sh, count: P.length / 3 }; g.dispose(); return out;
}
/** a cookie disc (shingle): domed top, baked rim (sh), 8 sides, 24 tris */
function discGeo(n) {
  const P = [], N = [], SH = [];
  const v = (x, y, z, nx, ny, nz, s) => { const l = Math.hypot(nx, ny, nz); P.push(x, y, z); N.push(nx / l, ny / l, nz / l); SH.push(s); };
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    v(0, 0.5, 0, 0, 1, 0, 0); v(0.5 * c0, 0.2, 0.5 * s0, c0 * 0.7, 0.8, s0 * 0.7, 0.35); v(0.5 * c1, 0.2, 0.5 * s1, c1 * 0.7, 0.8, s1 * 0.7, 0.35);
    v(0.5 * c0, 0.2, 0.5 * s0, c0, 0.3, s0, 0.45); v(0.46 * c0, -0.5, 0.46 * s0, c0, -0.3, s0, 0.55); v(0.46 * c1, -0.5, 0.46 * s1, c1, -0.3, s1, 0.55);
    v(0.5 * c0, 0.2, 0.5 * s0, c0, 0.3, s0, 0.45); v(0.46 * c1, -0.5, 0.46 * s1, c1, -0.3, s1, 0.55); v(0.5 * c1, 0.2, 0.5 * s1, c1, 0.3, s1, 0.45);
  }
  return { p: new Float32Array(P), n: new Float32Array(N), sh: new Float32Array(SH), count: P.length / 3 };
}
function boxGeo() {        // a plain unit box (12 tris, flat normals): the far version's blocks
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), P = g.attributes.position.array, N = g.attributes.normal.array;
  const out = { p: P, n: N, sh: new Float32Array(P.length / 3), count: P.length / 3 }; g.dispose(); return out;
}
const GEO = {
  box: boxGeo(), pil: pillowGeo(2, 0.3), lump: pillowGeo(2, 0.45), brick: pillowGeo(1, 0.22), ball: ballGeo(1), dot: ballGeo(0), disc: discGeo(7),
  drip: latheGeo([[0.001, 0.06], [0.5, 0.0], [0.38, -0.55], [0.46, -0.82], [0.28, -0.97], [0.001, -1]], 5),
  gum: latheGeo([[0.001, 0], [0.5, 0], [0.5, 0.12], [0.45, 0.48], [0.34, 0.78], [0.18, 0.96], [0.001, 1]], 9),
};

// ---- the vertex buffer every piece writes into -------------------------------------------------------------
// vertex = [x, y, z, nx, ny, nz, r, g, b, mask]; tri() orients each triangle by its normals, so builders never fuss winding
class Buf {
  constructor() { this.P = []; this.N = []; this.C = []; this.n = 0; this.cur = null; }
  vert(V) {
    this.P.push(V[0], V[1], V[2]); this.N.push(V[3], V[4], V[5]); this.C.push(V[6], V[7], V[8], V[9]); this.n++;
    const c = this.cur; if (!c) return;
    const lo = c.lo, hi = c.hi;
    if (V[0] < lo.x) lo.x = V[0]; if (V[1] < lo.y) lo.y = V[1]; if (V[2] < lo.z) lo.z = V[2];
    if (V[0] > hi.x) hi.x = V[0]; if (V[1] > hi.y) hi.y = V[1]; if (V[2] > hi.z) hi.z = V[2];
  }
  tri(A, B, C) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const s = fx * (A[3] + B[3] + C[3]) + fy * (A[4] + B[4] + C[4]) + fz * (A[5] + B[5] + C[5]);
    this.vert(A); if (s < 0) { this.vert(C); this.vert(B); } else { this.vert(B); this.vert(C); }
  }
  /** a unit shape through matrix M, tinted (baked edges darker, tops lighter, painterly tone) */
  add(G, color, M, op = {}) {
    const e = M.elements, nm = new THREE.Matrix3().getNormalMatrix(M).elements, base = rgbOf(color);
    const bake = op.bake ?? 0.15, k0 = op.k ?? 1, mask = op.mask ?? (color === GB.icing ? ICE : 0), flat = !!op.flat;
    const vs = [null, null, null];
    for (let i = 0; i < G.count; i++) {
      const x = G.p[i * 3], y = G.p[i * 3 + 1], z = G.p[i * 3 + 2];
      const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = G.n[i * 3], b = G.n[i * 3 + 1], d = G.n[i * 3 + 2];
      let nx = nm[0] * a + nm[3] * b + nm[6] * d, ny = nm[1] * a + nm[4] * b + nm[7] * d, nz = nm[2] * a + nm[5] * b + nm[8] * d;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const k = k0 * (1 - bake * G.sh[i]) * (1 + 0.06 * ny);
      const c = flat ? [base[0] * k, base[1] * k, base[2] * k] : toneRGB(base, px, py, pz, k);
      vs[i % 3] = [px, py, pz, nx, ny, nz, c[0], c[1], c[2], mask];
      if (i % 3 === 2) this.tri(vs[0], vs[1], vs[2]);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 4).setUsage(THREE.DynamicDrawUsage));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.P = this.N = this.C = null;
    return g;
  }
}

// ---- frames + matrices -------------------------------------------------------------------------------------
/** a surface frame: o origin, a along (u), b up (y), n outward (v) */
const frame = (o, a, b, n) => ({ o, a, b, n });
const FP = (F, u, y, v) => new V3(F.o.x + F.a.x * u + F.b.x * y + F.n.x * v, F.o.y + F.a.y * u + F.b.y * y + F.n.y * v, F.o.z + F.a.z * u + F.b.z * y + F.n.z * v);
/** a unit shape at pos with axes X Y Z (any handedness) scaled sx sy sz */
function MB(pos, X, Y, Z, sx, sy, sz) { return new THREE.Matrix4().makeBasis(X, Y, Z).scale(new V3(sx, sy, sz)).setPosition(pos); }
function M(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
}
/** in frame F: a unit shape at (u, y, v), rotated by rot about F.n */
function MF(F, u, y, v, sx, sy, sz, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const X = F.a.clone().multiplyScalar(c).addScaledVector(F.b, s), Y = F.b.clone().multiplyScalar(c).addScaledVector(F.a, -s);
  return MB(FP(F, u, y, v), X, Y, F.n, sx, sy, sz);
}

// ---- tube: piping, ropes, candy canes, icing rolls ------------------------------------------------------
// o: {r, rh, up (V3 | fn), sides, col | colFn(s, th) (crisp per-quad stripes), mask, caps, rAt(p, i, s), twist, twistF}
function tube(B, pts, o) {
  const n = pts.length; if (n < 2) return;
  const sides = o.sides ?? (o.r < 0.08 ? 5 : 7), r0 = o.r, rh0 = o.rh ?? o.r, up0 = o.up ?? YA, base = rgbOf(o.col ?? GB.icing);
  const mask = o.mask ?? ((o.col ?? GB.icing) === GB.icing && !o.vcol && !o.jcol && !o.colFn ? ICE : 0);
  const rings = []; let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += pts[i].distanceTo(pts[i - 1]);
    const T = new V3().subVectors(i === n - 1 && o.tB ? o.tB : pts[Math.min(n - 1, i + 1)], i === 0 && o.tA ? o.tA : pts[Math.max(0, i - 1)]).normalize();
    const up = typeof up0 === 'function' ? up0(i, pts[i]) : up0;
    let U = up.clone().addScaledVector(T, -up.dot(T));
    if (U.lengthSq() < 1e-6) { U = (Math.abs(T.y) < 0.9 ? YA.clone() : XA.clone()); U.addScaledVector(T, -U.dot(T)); }
    U.normalize(); const Sd = new V3().crossVectors(T, U).normalize();
    const k = o.rAt ? o.rAt(pts[i], i, s) : 1, rw = r0 * k, rh = rh0 * k;
    const ring = [];
    for (let j = 0; j <= sides; j++) {
      // helix: the ring turns with s, so quads run along helical lines (crisp candy stripes / rope strands at any ring step)
      const thl = j / sides * Math.PI * 2, th = thl + (o.helix ? (s + (o.s0 ?? 0)) * o.helix * Math.PI * 2 : 0), c = Math.cos(th), sn = Math.sin(th);
      const tw = o.twist ? 1 + o.twist * Math.cos(2 * thl) : 1, dtw = o.twist ? -2 * o.twist * Math.sin(2 * thl) : 0;
      const p = pts[i].clone().addScaledVector(Sd, c * rw * tw).addScaledVector(U, sn * rh * tw);
      const nr = new V3().addScaledVector(Sd, c / rw).addScaledVector(U, sn / rh).normalize();
      if (o.twist) nr.multiplyScalar(tw).addScaledVector(new V3().addScaledVector(Sd, -sn).addScaledVector(U, c), -dtw).normalize();
      ring.push({ p, n: nr, th, j });
    }
    rings.push({ ring, s, T });
  }
  const V = (q, c) => [q.p.x, q.p.y, q.p.z, q.n.x, q.n.y, q.n.z, c[0], c[1], c[2], mask];
  const tv = q => toneRGB(base, q.p.x, q.p.y, q.p.z, 1 + 0.05 * q.n.y);
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const a = rings[i].ring[j], b = rings[i].ring[j + 1], c = rings[i + 1].ring[j + 1], d = rings[i + 1].ring[j];
    if (o.jcol || o.vcol) {
      const vc = q => toneRGB(rgbOf(o.jcol ? o.jcol(j) : o.vcol(q.j % sides)), q.p.x, q.p.y, q.p.z, 1 + 0.05 * q.n.y);
      const ca = vc(a), cb = vc(b), cc = vc(c), cd = vc(d);
      B.tri(V(a, ca), V(b, cb), V(c, cc)); B.tri(V(a, ca), V(c, cc), V(d, cd));
    } else if (o.colFn) {
      const col = toneRGB(rgbOf(o.colFn((rings[i].s + rings[i + 1].s) / 2, (a.th + b.th) / 2)), a.p.x, a.p.y, a.p.z, 1 + 0.05 * a.n.y);
      B.tri(V(a, col), V(b, col), V(c, col)); B.tri(V(a, col), V(c, col), V(d, col));
    } else {
      const ca = tv(a), cb = tv(b), cc = tv(c), cd = tv(d);
      B.tri(V(a, ca), V(b, cb), V(c, cc)); B.tri(V(a, ca), V(c, cc), V(d, cd));
    }
  }
  if (o.caps !== false) for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
    if ((i === 0 && o.capA === false) || (i === n - 1 && o.capB === false)) continue;
    const T = rings[i].T, ctr = pts[i], cN = [T.x * sg, T.y * sg, T.z * sg];
    const col = o.colFn ? toneRGB(rgbOf(o.colFn(rings[i].s, 0)), ctr.x, ctr.y, ctr.z) : o.vcol || o.jcol ? toneRGB(rgbOf((o.vcol || o.jcol)(0)), ctr.x, ctr.y, ctr.z) : toneRGB(base, ctr.x, ctr.y, ctr.z);
    const C0 = [ctr.x, ctr.y, ctr.z, ...cN, col[0], col[1], col[2], mask];
    for (let j = 0; j < sides; j++) {
      const a = rings[i].ring[j], b = rings[i].ring[j + 1];
      B.tri(C0, [a.p.x, a.p.y, a.p.z, ...cN, col[0], col[1], col[2], mask], [b.p.x, b.p.y, b.p.z, ...cN, col[0], col[1], col[2], mask]);
    }
  }
}
const circlePts = (F, u, y, v, R, n = 24, a0 = 0, a1 = Math.PI * 2) => {
  const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push(FP(F, u + Math.cos(a) * R, y + Math.sin(a) * R, v)); } return out;
};
const lumpy = (amp = 0.18, f = 2.3) => p => 1 + amp * (noise3(p.x * f, p.y * f + 4.1, p.z * f) - 0.5) * 2;
const stripes = (a, b, f, tw = 1) => (s, th) => (((s * f + tw * th / (Math.PI * 2)) % 1 + 1) % 1 < 0.5 ? a : b);

// ---- lens disc (peppermint, round window glass) ----------------------------------------------------------
function polarDisc(B, c, X, Y, Z, R, th, o = {}) {
  const nr = o.rings ?? 4, ns = o.segs ?? 18, mask = o.mask ?? 0, hz = th / 2;
  const P = (rr, a, sd) => {
    const x = rr * Math.cos(a), y = rr * Math.sin(a), z = sd * hz * Math.sqrt(Math.max(0, 1 - (rr / R) ** 2));
    const p = c.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Z, z);
    const n = new V3().addScaledVector(X, x / (R * R)).addScaledVector(Y, y / (R * R)).addScaledVector(Z, z / (hz * hz) + (rr === 0 ? sd : 0)).normalize();
    return [p, n];
  };
  for (const sd of (o.half ? [1] : [1, -1])) for (let i = 0; i < nr; i++) {
    const r0 = R * Math.sin(i / nr * Math.PI / 2), r1 = R * Math.sin((i + 1) / nr * Math.PI / 2);
    for (let k = 0; k < ns; k++) {
      const a0 = k / ns * Math.PI * 2, a1 = (k + 1) / ns * Math.PI * 2;
      const hex = o.colFn ? o.colFn((r0 + r1) / 2 / R, (a0 + a1) / 2) : o.col;
      const [pa, na] = P(r0, a0, sd), [pb, nb] = P(r1, a0, sd), [pc, nc] = P(r1, a1, sd), [pd, nd] = P(r0, a1, sd);
      const col = toneRGB(rgbOf(hex), pa.x, pa.y, pa.z, o.k ?? 1);
      const V = (p, n) => [p.x, p.y, p.z, n.x, n.y, n.z, col[0], col[1], col[2], mask];
      B.tri(V(pa, na), V(pb, nb), V(pc, nc)); if (i) B.tri(V(pa, na), V(pc, nc), V(pd, nd));
    }
  }
}

// ---- 2D polygon helpers ----------------------------------------------------------------------------------
function clipPoly(poly, [a, b, k]) {
  const out = [], f = P => a * P[0] + b * P[1] - k;
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
    if (fp <= 0) out.push(P);
    if ((fp <= 0) !== (fq <= 0)) {       // canonical endpoint order so both neighbours compute the identical point
      const sw = P[0] < Q[0] || (P[0] === Q[0] && P[1] < Q[1]);
      const A = sw ? P : Q, B = sw ? Q : P, fa = sw ? fp : fq, fb = sw ? fq : fp, t = fa / (fa - fb);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  return out;
}
const polyArea = P => { let s = 0; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length]; s += A[0] * B[1] - B[0] * A[1]; } return Math.abs(s) / 2; };
const centroid = P => { let u = 0, y = 0; for (const p of P) { u += p[0]; y += p[1]; } return [u / P.length, y / P.length]; };
function inConvex(P, u, y, eps = 1e-5) {
  let pos = 0, neg = 0;
  for (let i = 0; i < P.length; i++) {
    const A = P[i], B = P[(i + 1) % P.length], ex = B[0] - A[0], ey = B[1] - A[1], l = Math.hypot(ex, ey) || 1;
    const cr = (ex * (y - A[1]) - ey * (u - A[0])) / l;
    if (cr > eps) pos++; else if (cr < -eps) neg++;
    if (pos && neg) return false;
  }
  return true;
}
function segDist(u, y, A, B) {
  const ex = B[0] - A[0], ey = B[1] - A[1], l2 = ex * ex + ey * ey || 1;
  const t = clamp(((u - A[0]) * ex + (y - A[1]) * ey) / l2, 0, 1);
  return Math.hypot(u - A[0] - ex * t, y - A[1] - ey * t);
}
function fillLines(lines, a, b, cell) {
  const s = lines.filter(x => x >= a - 1e-9 && x <= b + 1e-9).sort((p, q) => p - q), u = [];
  for (const x of s) if (!u.length || x - u[u.length - 1] > 0.06) u.push(x);
  u[0] = a; if (b - u[u.length - 1] > 0.06) u.push(b); else u[u.length - 1] = b;
  const out = [u[0]];
  for (let k = 1; k < u.length; k++) { const len = u[k] - u[k - 1], n = Math.max(1, Math.round(len / cell)); for (let m = 1; m <= n; m++) out.push(m === n ? u[k] : u[k - 1] + len * m / n); }
  return out;
}

// ---- prism: one chunk (front bumpy + baked, crumb sides, dark back) -------------------------------------------
function prism(B, poly, F, v0, v1, o) {
  const L = o.L ?? 2, disp = o.disp || (() => 0), N = poly.length, mask = o.mask ?? 1;
  const front = rgbOf(o.col ?? GB.cookie), crumb = rgbOf(o.crumb ?? GB.crumb), reveal = rgbOf(o.reveal ?? GB.reveal), inner = rgbOf(o.inner ?? GB.inner);
  const exposed = o.exposed || poly.map(() => true);
  const exE = poly.map((A, i) => exposed[i] ? [A, poly[(i + 1) % N]] : null).filter(Boolean);
  const fv = (u, y) => {
    const dv = disp(u, y), p = FP(F, u, y, v1 + dv), e = 0.02;
    const du = (disp(u + e, y) - disp(u - e, y)) / (2 * e), dy = (disp(u, y + e) - disp(u, y - e)) / (2 * e);
    const n = F.n.clone().addScaledVector(F.a, -du).addScaledVector(F.b, -dy).normalize();
    let dm = 9; for (const [A, Bp] of exE) dm = Math.min(dm, segDist(u, y, A, Bp));
    const c = toneRGB(front, p.x, p.y, p.z, (1 - 0.2 * Math.max(0, 1 - dm / 0.2)) * (1 + 0.05 * n.y));
    return [p.x, p.y, p.z, n.x, n.y, n.z, c[0], c[1], c[2], mask];
  };
  const [cu, cy] = o.fan0 ? poly[0] : centroid(poly);
  const memo = new Map(), fvm = (u, y) => { const key = u.toFixed(6) + ',' + y.toFixed(6); let v = memo.get(key); if (!v) { v = fv(u, y); memo.set(key, v); } return v; };
  for (let i = 0; i < N; i++) {
    const A = poly[i], Bp = poly[(i + 1) % N];
    if (o.fan0 && (i === 0 || (i + 1) % N === 0)) continue;
    const pt = (r, j) => fvm(cu + (A[0] - cu) * (r / L) + (Bp[0] - A[0]) * (j / L), cy + (A[1] - cy) * (r / L) + (Bp[1] - A[1]) * (j / L));
    for (let r = 0; r < L; r++) for (let j = 0; j <= r; j++) {
      B.tri(pt(r, j), pt(r + 1, j), pt(r + 1, j + 1));
      if (j < r) B.tri(pt(r, j), pt(r + 1, j + 1), pt(r, j + 1));
    }
  }
  const [gu, gy] = centroid(poly);
  for (let i = 0; i < N; i++) {
    const A = poly[i], Bp = poly[(i + 1) % N];
    let ou = Bp[1] - A[1], oy = -(Bp[0] - A[0]); const l = Math.hypot(ou, oy); if (l < 1e-7) continue; ou /= l; oy /= l;
    if (ou * ((A[0] + Bp[0]) / 2 - gu) + oy * ((A[1] + Bp[1]) / 2 - gy) < 0) { ou = -ou; oy = -oy; }
    const nn = F.a.clone().multiplyScalar(ou).addScaledVector(F.b, oy);
    const sc = exposed[i] ? reveal : crumb;
    for (let j = 0; j < L; j++) {
      const t0 = j / L, t1 = (j + 1) / L;
      const u0 = A[0] + (Bp[0] - A[0]) * t0, y0 = A[1] + (Bp[1] - A[1]) * t0, u1 = A[0] + (Bp[0] - A[0]) * t1, y1 = A[1] + (Bp[1] - A[1]) * t1;
      const f0 = FP(F, u0, y0, v1 + disp(u0, y0)), f1 = FP(F, u1, y1, v1 + disp(u1, y1)), b0 = FP(F, u0, y0, v0), b1 = FP(F, u1, y1, v0);
      const V = p => { const c = toneRGB(sc, p.x, p.y, p.z, 1); return [p.x, p.y, p.z, nn.x, nn.y, nn.z, c[0], c[1], c[2], mask]; };
      B.tri(V(f0), V(b0), V(b1)); B.tri(V(f0), V(b1), V(f1));
    }
  }
  const nb = F.n.clone().negate(), C0 = FP(F, gu, gy, v0);
  const Vb = p => { const c = toneRGB(inner, p.x, p.y, p.z, 1); return [p.x, p.y, p.z, nb.x, nb.y, nb.z, c[0], c[1], c[2], mask]; };
  for (let i = 0; i < N; i++) B.tri(Vb(C0), Vb(FP(F, poly[i][0], poly[i][1], v0)), Vb(FP(F, poly[(i + 1) % N][0], poly[(i + 1) % N][1], v0)));
}

// ---- the build context: pieces collect ops, emitted in order into the two buffers ------------------------------
function newCtx(seed) { return { R: rng(seed), seed, pieces: [], surfN: 0, allGround: false }; }
function piece(K, kind, op = {}) {
  const p = { id: K.pieces.length, kind, hp: op.hp ?? Infinity, alive: true, struct: !!op.struct, grounded: !!op.grounded || (!!op.struct && K.allGround),
    lo: new V3(Infinity, Infinity, Infinity), hi: new V3(-Infinity, -Infinity, -Infinity), s0: 0, sn: 0, g0: 0, gn: 0,
    ops: [], adj: [], deps: [], host: op.host ?? null, obb: op.obb ?? null, dn: op.dn ?? null, surf: op.surf ?? -1 - K.pieces.length,
    col: new THREE.Color(op.col ?? GB.cookie) };
  K.pieces.push(p); return p;
}
const add = (p, geo, color, Mx, op = {}) => p.ops.push((S, G) => (op.glow ? G : S).add(geo, color, Mx, op));
const addTube = (p, pts, o) => p.ops.push((S, G) => tube(o.glow ? G : S, pts, o));
const drip = (p, pos, len, wid, col = GB.icing) => add(p, GEO.drip, col, M(pos.x, pos.y, pos.z, wid, len, wid), { jit: 0, bake: 0 });

// ---- ICING DRAPE --------------------------------------------------------------------------------------------
// Thick, soft, glossy royal icing swept along an edge (his ref): a pillowy layer on the top surface with a wavy inner rim, a
// round lip rolling over the edge, and a hanging curtain with a scalloped bottom; long finger drips with round ends hang off
// it. The sweep is ONE continuous sheet: its rows are split per host piece (each run rides the chunk under it and dies with
// it) but neighbouring runs share their boundary row, so it flows on across module joints with no seams or caps.
// ctrl: [{p (edge point on the top surface), U (surface normal), O (outward, off the edge along the surface), q?, host?}]
// o: {w inner width, th thickness, hang curtain, drip scallop depth, finger drip length, lobes (inner-rim lobes), dw width k,
//     space, fingerSpace, step, closed, taper, lite (8-point profile), hostAt(row), host}
//            in    up    out  down    hint: U     O     D
const PROF = [[1, -0.25, 0, 0, 1, -0.6, 0], [0.8, 0.55, 0, 0, 1, -0.3, 0], [0.45, 0.92, 0, 0, 1, 0, 0], [0.12, 1, 0, 0, 1, 0.1, 0],
  [0, 0.82, 0.5, 0, 0.8, 0.6, 0], [0, 0.3, 0.95, 0, 0.2, 1, 0], [0, 0, 1, 0.45, 0, 1, 0.2], [0, 0, 0.85, 0.85, 0, 0.8, 0.6],
  [0, 0, 0.45, 1, 0, 0.1, 1], [0, 0, 0.06, 0.8, 0, -1, 0.3], [0, -0.4, 0.03, 0.06, -0.3, -1, 0]];
const PROF_LITE = [0, 2, 4, 5, 7, 8, 9, 10].map(j => PROF[j]);
const smooth01 = x => x >= 1 ? 1 : x <= 0 ? 0 : x * x * (3 - 2 * x);
function iceDrape(K, ctrl, o = {}) {
  const step = o.step ?? 0.1, closed = !!o.closed, n = ctrl.length;
  const R = rng((K.seed ?? 1) * 131 + (K.iceN = (K.iceN || 0) + 1) * 17);
  const lerpRow = (A, B, f) => ({ p: A.p.clone().lerp(B.p, f), U: A.U.clone().lerp(B.U, f).normalize(), O: A.O.clone().lerp(B.O, f).normalize(),
    q: A.q ? A.q.map((v, i) => v + (B.q[i] - v) * f) : null, host: f < 0.5 ? A.host : B.host });
  const rows = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const A = ctrl[i], B = ctrl[(i + 1) % n], m = Math.max(1, Math.ceil(A.p.distanceTo(B.p) / step));
    for (let k = 0; k < m; k++) rows.push(lerpRow(A, B, k / m));
  }
  if (!closed) rows.push(lerpRow(ctrl[n - 1], ctrl[n - 1], 0));
  const N = rows.length; if (N < 2) return null;
  let S = 0;
  for (let i = 0; i < N; i++) { if (i) S += rows[i].p.distanceTo(rows[i - 1].p); rows[i].s = S; }
  const total = closed ? S + rows[N - 1].p.distanceTo(rows[0].p) : S;
  if (o.hostAt) for (const r of rows) r.host = o.hostAt(r) ?? r.host;
  let hh = o.host ?? rows.find(r => r.host)?.host ?? null;
  for (const r of rows) { if (r.host) hh = r.host; else r.host = hh; }
  const sd = (a, b) => { let d = Math.abs(a - b); if (closed) d = Math.min(d, total - d); return d; };
  const scal = [];
  if ((o.drip ?? 0) > 0 || o.lobes) for (let s = R.r(0, 0.25); s < total; s += R.r(0.18, 0.38) * (o.space ?? 1)) scal.push([s, R.r(0.07, 0.15) * (o.dw ?? 1), R.r(0.25, 1)]);
  const bump = s => { let b = 0; for (const [c, hw, L] of scal) { const x = sd(s, c) / hw; if (x < 1) b = Math.max(b, L * Math.sqrt(1 - x * x)); } return b; };
  const off = R.r(0, 50), nz = (s, f) => noise3(s * f + off, off * 0.3, 1.7) * 2 - 1;
  const D = new V3(0, -1, 0), prof = o.lite ? PROF_LITE : PROF, np = prof.length;
  const P = [], H = [];
  for (const r of rows) {
    const f = closed ? 1 : smooth01(Math.min(r.s, total - r.s) / (o.taper ?? 0.3));
    const th = (o.th ?? 0.18) * (1 + 0.18 * nz(r.s, 1.3)) * f;
    const w = ((o.w ?? 0.4) * (1 + 0.3 * nz(r.s, 0.9)) + (o.lobes ? o.lobes * bump(r.s) : 0)) * f;
    const hang = ((o.hang ?? 0.2) * (1 + 0.35 * nz(r.s + 9, 1.7)) + (o.drip ?? 0) * bump(r.s)) * f;
    r.th = th; r.hang = hang;
    const ring = [], hint = [];
    for (const [ai, au, ao, ad, hu, ho, hd] of prof) {
      ring.push(r.p.clone().addScaledVector(r.O, -ai * w + ao * th).addScaledVector(r.U, au * th).addScaledVector(D, ad * hang));
      hint.push(new V3().addScaledVector(r.U, hu).addScaledVector(r.O, ho).addScaledVector(D, hd).normalize());
    }
    P.push(ring); H.push(hint);
  }
  const base = rgbOf(GB.icing), V = [], ta = new V3(), tb = new V3(), nn = new V3();
  for (let i = 0; i < N; i++) {
    const ip = closed ? (i + 1) % N : Math.min(N - 1, i + 1), im = closed ? (i - 1 + N) % N : Math.max(0, i - 1), row = [];
    for (let j = 0; j < np; j++) {
      ta.subVectors(P[ip][j], P[im][j]); tb.subVectors(P[i][(j + 1) % np], P[i][(j - 1 + np) % np]);
      nn.crossVectors(ta, tb); const h = H[i][j];
      if (nn.lengthSq() < 1e-12) nn.copy(h); else { nn.normalize(); if (nn.dot(h) < 0) nn.negate(); nn.addScaledVector(h, 0.2).normalize(); }
      const q = P[i][j], tip = prof[j][3], c = toneRGB(base, q.x, q.y, q.z, 1.03 - 0.05 * tip + 0.04 * Math.max(0, nn.y));
      row.push([q.x, q.y, q.z, nn.x, nn.y, nn.z, c[0], c[1] * (1 - 0.04 * tip), c[2] * (1 - 0.11 * tip), ICE]);
    }
    V.push(row);
  }
  const quads = (B, i0, i1) => {
    for (let i = i0; i < i1; i++) { const a = V[i], b = V[(i + 1) % N]; for (let j = 0; j < np; j++) { const j1 = (j + 1) % np; B.tri(a[j], b[j], b[j1]); B.tri(a[j], b[j1], a[j1]); } }
  };
  const last = closed ? N : N - 1;
  for (let st = 0, i = 1; i <= last; i++) {
    if (i < last && rows[i].host === rows[st].host) continue;
    const h = rows[st].host, a = st, b = i; if (h) h.ops.push(B => quads(B, a, b)); st = i;
  }
  // finger drips: long, round-ended, hanging from the curtain
  if (o.finger) for (let s = R.r(0.1, 0.5), i = 0; s < total; s += R.r(0.38, 0.8) * (o.fingerSpace ?? 1)) {
    while (i < N - 1 && rows[i + 1].s <= s) i++;
    const r = rows[i]; if (!r.host || r.hang < 0.04) continue;
    const len = o.finger * R.r(0.45, 1.5), wid = R.r(0.11, 0.16) * (o.dw ?? 1);
    drip(r.host, r.p.clone().addScaledVector(r.O, r.th * 0.55).addScaledVector(D, r.hang * 0.72), len, wid);
  }
  return { rows, total };
}
/** a tube across several hosts: split into runs per host (shared tangents, no inner caps), so it flows on unbroken */
function pipeAcross(pts, hosts, o) {
  for (let st = 0, k = 1; k <= pts.length; k++) {
    if (k < pts.length && hosts[k] === hosts[st]) continue;
    const e = Math.min(k + 1, pts.length), run = pts.slice(st, e);
    if (hosts[st] && run.length >= 2) addTube(hosts[st], run, { ...o, tA: pts[st - 1], tB: pts[e], capA: st === 0, capB: e === pts.length });
    st = k;
  }
}
/** rounded-rectangle path (closed) at height y: [{p, U, O}]; starts at the front-right (+x +z) corner, the front edge (+z) is the wrap */
function rrPath(X0, X1, Z0, Z1, rc, y, nArc = 3) {
  const out = [], cs = [[X1 - rc, Z1 - rc, Math.PI / 2], [X1 - rc, Z0 + rc, 0], [X0 + rc, Z0 + rc, -Math.PI / 2], [X0 + rc, Z1 - rc, -Math.PI]];
  for (const [cx, cz, a0] of cs) for (let k = 0; k <= nArc; k++) {
    const a = a0 - k / nArc * Math.PI / 2, ox = Math.cos(a), oz = Math.sin(a);
    out.push({ p: new V3(cx + ox * rc, y, cz + oz * rc), U: YA.clone(), O: new V3(ox, 0, oz) });
  }
  return out;
}
/** ROOF ICING for one slope (one or more sections sharing a frame): eave + both rakes as ONE drape (round corners), a lobed
 *  ridge cap, the ridge roll (o.ridge), candy dots on the lip. o: {rake0, rake1, ridge, far} */
function roofIce(K, secs, s, zA, zB, Ls, o = {}) {
  const F = secs[0].F, rt = GB.roofT, R = K.R, far = !!o.far;
  const secAt = u => secs.find(q => u >= q.u0 - 1e-6 && u <= q.u1 + 1e-6) ?? (u < secs[0].u0 ? secs[0] : secs[secs.length - 1]);
  const hostOf = (u, l) => secAt(u).find(clamp(u, zA + 0.02, zB - 0.02), clamp(l, 0.05, Ls - 0.05));
  const hostAt = r => hostOf(r.q[0], r.q[1]);
  const pt = (u, l, ou, ol) => ({ p: FP(F, u, l, rt), U: F.n.clone(), O: F.a.clone().multiplyScalar(ou).addScaledVector(F.b, ol).normalize(), q: [u, l] });
  const rc = 0.32, l0 = 0.22, C = [], arc = (cu, cl, a0, a1) => { for (let k = 0; k <= 4; k++) { const a = a0 + (a1 - a0) * k / 4; C.push(pt(cu + Math.cos(a) * rc, cl + Math.sin(a) * rc, Math.cos(a), Math.sin(a))); } };
  if (o.rake0) { C.push(pt(zA, l0, -1, 0)); arc(zA + rc, Ls - rc, Math.PI, Math.PI / 2); } else C.push(pt(zA, Ls, 0, 1));
  if (o.rake1) { arc(zB - rc, Ls - rc, Math.PI / 2, 0); C.push(pt(zB, l0, 1, 0)); } else C.push(pt(zB, Ls, 0, 1));
  const ed = iceDrape(K, C, far ? { hostAt, w: 0.6, th: 0.22, hang: 0.4, drip: 0, step: 0.3, lite: true, taper: 0.35 }
    : { hostAt, w: 0.62, th: 0.23, hang: 0.3, drip: 0.36, finger: 0.5, fingerSpace: 1.45, taper: 0.35, step: 0.12, lite: true });
  // ridge cap: icing poured over the ridge, lobes running down the shingles
  iceDrape(K, [pt(zA + 0.02, 0, 0, -1), pt(zB - 0.02, 0, 0, -1)], { hostAt, w: 0.38, lobes: 0.6, th: 0.17, hang: 0, taper: 0.22, space: 1.3, dw: 1.7, step: far ? 0.4 : 0.12, lite: true });
  const ridgeTop = u => new V3(F.o.x, F.o.y + rt / Math.cos(Math.atan(GB.pitch)) + 0.02, F.o.z).addScaledVector(F.a, u);
  if (o.ridge) {
    const pts = [], hs = [];
    for (let u = zA - 0.06; u <= zB + 0.06 + 1e-6; u += far ? 0.6 : 0.2) { const uu = Math.min(u, zB + 0.06); pts.push(ridgeTop(uu)); hs.push(hostOf(uu, 0.1)); }
    pipeAcross(pts, hs, { r: 0.3, rh: 0.24, sides: far ? 6 : 9, up: YA, rAt: lumpy(0.18) });
    if (!far) for (let z = zA + 0.5; z < zB - 0.3; z += 1.0) add(hostOf(z, 0.1), GEO.ball, GB.red, M(...ridgeTop(z).add(new V3(0, 0.3, 0)).toArray(), 0.22, 0.22, 0.22), { bake: 0 });
  }
  if (far) return ed;
  // candy dots sitting in the icing on the lip
  for (let z = zA + 0.7; z < zB - 0.4; z += 1.45) add(hostOf(z, Ls - 0.2), GEO.ball, GB.red, MB(FP(F, z, Ls - 0.22, rt + 0.27), F.a, F.b, F.n, 0.2, 0.2, 0.2), { bake: 0 });
  for (const [on, zr] of [[o.rake0, zA + 0.22], [o.rake1, zB - 0.22]]) if (on) for (let l = 1.0; l < Ls - 0.5; l += 1.4) add(hostOf(zr, l), GEO.ball, GB.red, MB(FP(F, zr, l, rt + 0.28), F.a, F.b, F.n, 0.21, 0.21, 0.21), { bake: 0 });
  return ed;
}

/** a chunked slab on frame F: a jittered grid whose cells share seams exactly; openings are grid holes; clips trim (gables) */
function chunkSlab(K, c) {
  const F = c.F, cell = c.cell ?? GB.cell, opens = c.opens ?? [], clips = c.clips ?? [], v0 = c.v0, v1 = c.v1, L = c.L ?? 2;
  const amp = c.amp ?? GB.bulge, surfId = K.surfN++, E = 1e-6;
  const lu = [c.u0, c.u1, ...(c.uLines ?? [])], ly = [c.y0, c.y1, ...(c.yLines ?? [])];
  for (const op of opens) { lu.push(op.u0, op.u1); ly.push(op.y0, op.y1); }
  const U = fillLines(lu, c.u0, c.u1, cell), Yl = fillLines(ly, c.y0, c.y1, c.cellY ?? cell);
  const inOpen = (u, y) => opens.some(op => u > op.u0 + E && u < op.u1 - E && y > op.y0 + E && y < op.y1 - E);
  const inside = (u, y) => u > c.u0 - E && u < c.u1 + E && y > c.y0 - E && y < c.y1 + E && clips.every(([a, b, k]) => a * u + b * y <= k + 1e-5) && !inOpen(u, y);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const onV = (u, y) => near(u, c.u0) || near(u, c.u1) || opens.some(op => (near(u, op.u0) || near(u, op.u1)) && y > op.y0 - E && y < op.y1 + E);
  const onH = (u, y) => near(y, c.y0) || near(y, c.y1) || opens.some(op => (near(y, op.y0) || near(y, op.y1)) && u > op.u0 - E && u < op.u1 + E);
  const V = U.map((u, i) => Yl.map((y, j) => {
    let ju = 0, jy = 0;
    if (!onV(u, y)) ju = (hash3(i * 7 + 1, j * 13 + 3, K.seed * 31 + surfId) - 0.5) * 2 * GB.jit * Math.min(U[i] - U[i - 1], U[i + 1] - U[i]);
    if (!onH(u, y)) jy = (hash3(i * 11 + 5, j * 3 + 9, K.seed * 17 + surfId) - 0.5) * 2 * GB.jit * Math.min(Yl[j] - Yl[j - 1], Yl[j + 1] - Yl[j]);
    return [u + ju, y + jy];
  }));
  const disp = (u, y) => {
    const x = F.o.x + F.a.x * u + F.b.x * y, yy = F.o.y + F.a.y * u + F.b.y * y, z = F.o.z + F.a.z * u + F.b.z * y;
    return amp * ((noise3(x * 1.3 + 3.1, yy * 1.3, z * 1.3) - 0.5) * 2 + 0.35 * (noise3(x * 4.1, yy * 4.1 + 1.7, z * 4.1) - 0.5) * 2);
  };
  const cells = [], grid = [];
  for (let i = 0; i < U.length - 1; i++) {
    grid.push([]);
    for (let j = 0; j < Yl.length - 1; j++) {
      if (inOpen((U[i] + U[i + 1]) / 2, (Yl[j] + Yl[j + 1]) / 2)) { grid[i].push(null); continue; }
      let poly = [V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]];
      for (const cl of clips) { poly = clipPoly(poly, cl); if (poly.length < 3) break; }
      if (poly.length < 3 || polyArea(poly) < 3e-3) { grid[i].push(null); continue; }
      const [gu, gy] = centroid(poly);
      const exposed = poly.map((A, k) => {
        const Bp = poly[(k + 1) % poly.length]; let ou = Bp[1] - A[1], oy = -(Bp[0] - A[0]); const l = Math.hypot(ou, oy) || 1; ou /= l; oy /= l;
        const mu = (A[0] + Bp[0]) / 2, my = (A[1] + Bp[1]) / 2; if (ou * (mu - gu) + oy * (my - gy) < 0) { ou = -ou; oy = -oy; }
        return !inside(mu + ou * 0.03, my + oy * 0.03);
      });
      let bu0 = Infinity, bu1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (const [u, y] of poly) { bu0 = Math.min(bu0, u); bu1 = Math.max(bu1, u); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
      const pad = c.padN ?? 0.04;
      const obb = { c: FP(F, (bu0 + bu1) / 2, (by0 + by1) / 2, (v0 + v1 + pad) / 2), ax: [F.a.clone(), F.b.clone(), F.n.clone()], he: [(bu1 - bu0) / 2, (by1 - by0) / 2, (v1 - v0 + pad) / 2] };
      const p = piece(K, c.kind ?? 'chunk', { hp: c.hp ?? GB.hp.chunk, struct: true, grounded: !!c.grounded && j === 0, dn: F.n.clone(), surf: surfId, obb, col: c.color ?? GB.cookie });
      p.ops.push(S => prism(S, poly, F, v0, v1, { L, disp, exposed, col: c.color, reveal: c.reveal, mask: c.mask ?? 1 }));
      p.poly = poly; grid[i].push(p); cells.push(p);
    }
  }
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i].length; j++) {
    const p = grid[i][j]; if (!p) continue;
    for (const q of [grid[i + 1]?.[j], grid[i][j + 1]]) if (q) { p.adj.push(q); q.adj.push(p); }
  }
  const surf = {
    F, v0, v1, disp, cells, id: surfId, inside, u0: c.u0, u1: c.u1,
    find(u, y) {
      for (const p of cells) if (inConvex(p.poly, u, y, 1e-4)) return p;
      let best = null, bd = Infinity;
      for (const p of cells) { const [gu, gy] = centroid(p.poly), dd = (gu - u) ** 2 + (gy - y) ** 2; if (dd < bd) { bd = dd; best = p; } }
      return best;
    },
    P(u, y, lift = 0) { return FP(F, u, y, v1 + disp(u, y) + lift); },
    /** piping split per chunk: each run rides the chunk under it (dies with it); o.v = absolute depth, o.p3 = custom 3D */
    pipe(pts2, o = {}) {
      const ids = pts2.map(([u, y]) => this.find(u, y));
      const at = ([u, y]) => o.p3 ? o.p3(u, y) : o.v !== undefined ? FP(F, u, y, o.v) : this.P(u, y, (o.lift ?? 0) + (o.rh ?? o.r) * 0.55);
      const all = pts2.map(at);
      let st = 0;
      for (let k = 1; k <= pts2.length; k++) {
        if (k < pts2.length && ids[k] === ids[st]) continue;
        const e = Math.min(k + 1, pts2.length), run = all.slice(st, e);
        // tangents from the whole line so runs on neighbouring chunks join without a kink
        if (ids[st] && run.length >= 2) addTube(ids[st], run, { up: F.n, ...o, tA: all[st - 1], tB: all[e], capA: st === 0, capB: e === all.length });
        st = k;
      }
    },
    dot(u, y, r, col = GB.icing, o = {}) {
      const p = this.find(u, y); if (!p) return;
      add(p, o.geo ?? GEO.dot, col, MB(this.P(u, y, r * 0.2), F.a, F.b, F.n, r * 2, r * 2, r * 1.3), { bake: 0, mask: o.mask ?? 0 });
    },
    drip(u, y, len, wid, v) { const p = this.find(u, y); if (p) drip(p, FP(F, u, y, v ?? v1 + 0.06), len, wid); },
  };
  return surf;
}

// ---- decorative curves (in a surface's u, y) -----------------------------------------------------------------
function scrollPts(cu, cy, R, mir = 1, rot = 0) {
  const one = [];
  for (let k = 0; k <= 14; k++) { const t = k / 14, a = rot + mir * (Math.PI * 0.5 + t * Math.PI * 1.7), r = R * (0.16 + 0.84 * t); one.push([cu + Math.cos(a) * r * mir * -1, cy + Math.sin(a) * r]); }
  const E = one[one.length - 1], two = one.slice(0, -1).reverse().map(([u, y]) => [E[0] + (E[0] - u) * 0.7, E[1] + (E[1] - y) * 0.7]);
  return one.concat(two);
}
function flakeArms(cu, cy, R) {
  const arms = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
    arms.push([[cu, cy], [cu + ca * R * 0.5, cy + sa * R * 0.5], [cu + ca * R, cy + sa * R]]);
    for (const sd of [-1, 1]) { const b = a + sd * 0.7, m = 0.55 * R; arms.push([[cu + ca * m, cy + sa * m], [cu + ca * m + Math.cos(b) * R * 0.32, cy + sa * m + Math.sin(b) * R * 0.32]]); }
  }
  return arms;
}
const roundRect = (u0, y0, u1, y1, rr, n = 4) => {
  const out = [], cs = [[u1 - rr, y0 + rr, -Math.PI / 2], [u1 - rr, y1 - rr, 0], [u0 + rr, y1 - rr, Math.PI / 2], [u0 + rr, y0 + rr, Math.PI]];
  for (const [cu, cy, a0] of cs) for (let k = 0; k <= n; k++) { const a = a0 + k / n * Math.PI / 2; out.push([cu + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  out.push(out[0]); return out;
};

// =====================================================================================================
// THE KIT
// =====================================================================================================

/** twisted icing-rope pillar (cookie strands, icing in the grooves) in segments that break separately */
function kRope(K, F, u, ya, yb, r, o = {}) {
  const segs = Math.max(1, Math.round((yb - ya) / (o.segLen ?? 1.0))), out = [], v = o.v ?? 0;
  for (let k = 0; k < segs; k++) {
    const y0 = ya + (yb - ya) * k / segs, y1 = ya + (yb - ya) * (k + 1) / segs, pts = [];
    const n = Math.max(2, Math.round((y1 - y0) / 0.16));
    for (let m = 0; m <= n; m++) pts.push(FP(F, u, y0 + (y1 - y0) * m / n, v));
    const c = FP(F, u, (y0 + y1) / 2, v);
    const p = piece(K, 'rope', { hp: GB.hp.rope, struct: true, grounded: !!o.grounded && k === 0, col: GB.cookieLt,
      obb: { c, ax: [F.a.clone(), F.b.clone(), F.n.clone()], he: [r * 1.1, (y1 - y0) / 2, r * 1.1] } });
    // colour phase from absolute height so the twist runs on unbroken across segments
    addTube(p, pts, { r, sides: 8, twist: 0.17, helix: 2.4 * 0.14 / r, s0: y0 - ya, vcol: j => j % 4 === 2 ? GB.icing : (o.col ?? GB.cookieLt), caps: true });
    if (k === segs - 1 && o.cap !== false) {
      const top = FP(F, u, yb, v);
      const ring = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, O = new V3(Math.cos(a), 0, Math.sin(a)); ring.push({ p: top.clone().addScaledVector(O, r * 1.02), U: YA.clone(), O }); }
      iceDrape(K, ring, { host: p, closed: true, w: r * 1.05, th: r * 0.6, hang: r * 0.45, drip: r * 0.9, finger: r > 0.25 ? 0.3 : 0, fingerSpace: 1.3, dw: 0.9, step: r * 0.55, lite: true });
      add(p, GEO.ball, GB.icing, M(top.x, top.y + r * 0.45, top.z, r * 1.5, r * 0.7, r * 1.5), { bake: 0 });
    }
    out.push(p);
  }
  return out;
}
/** corner post: a thick twisted pillar with a snow cap */
function kPost(K, x, z, ya, yb, o = {}) {
  return kRope(K, frame(new V3(x, 0, z), XA.clone(), YA.clone(), ZA.clone()), 0, ya, yb, o.r ?? GB.postR, { grounded: o.grounded ?? true, segLen: 0.9, col: GB.cookie });
}

/** WALL PANEL: one square module of solid chunked cookie slab + its decoration. variant: plain | flake | swirl | window |
 *  lattice | dark | door | arch. o: {grounded, cap, foot, ropeL, ropeR, awning, door} */
function kWall(K, F, u0, y0, W, H, variant = 'plain', o = {}) {
  const t = GB.wallT, uc = u0 + W / 2, opens = [];
  const win = variant === 'window' || variant === 'lattice' || variant === 'dark';
  if (win) opens.push({ u0: uc - 0.62, u1: uc + 0.62, y0: y0 + GB.winY[0], y1: y0 + GB.winY[1] });
  if (variant === 'door' || variant === 'arch') opens.push({ u0: uc - 0.62, u1: uc + 0.62, y0, y1: y0 + GB.doorH });
  const surf = chunkSlab(K, { F, u0, u1: u0 + W, y0, y1: y0 + H, opens, v0: -t / 2, v1: t / 2, L: 1, grounded: o.grounded, color: o.color ?? GB.cookie });
  const ym = y0 + H * 0.52;
  if (variant === 'flake') kFlake(surf, uc, ym, 0.42);
  if (variant === 'swirl') { surf.pipe(scrollPts(uc - 0.05, ym + 0.05, 0.3, 1), { r: 0.045, rh: 0.035 }); surf.dot(uc + 0.38, ym - 0.3, 0.05); surf.dot(uc - 0.4, ym + 0.36, 0.05); }
  if (win) {
    kLattice(K, surf, opens[0], { lit: variant !== 'dark', awning: variant === 'window' ? (o.awning ?? GB.red) : null });
    for (const [du, dy, r] of [[-0.22, 0.42, 0.045], [0, 0.5, 0.06], [0.22, 0.42, 0.045], [0, 0.34, 0.04]]) surf.dot(uc + du, y0 + dy, r);
  }
  if (variant === 'door' || variant === 'arch') kDoor(K, surf, opens[0], { open: variant === 'arch', col: o.door ?? GB.door });
  if (o.cap) {             // icing snow cap along the top, drips down the front
    const pts = []; for (let u = u0 + 0.02; u <= u0 + W - 0.02 + 1e-6; u += 0.2) pts.push([Math.min(u, u0 + W - 0.02), y0 + H - 0.03]);
    surf.pipe(pts, { r: 0.12, rh: 0.25, v: 0.02, rAt: lumpy(0.22) });
    for (let u = u0 + 0.15; u < u0 + W - 0.1; u += K.R.r(0.22, 0.4)) surf.drip(u, y0 + H - 0.12, K.R.r(0.12, 0.38), K.R.r(0.12, 0.17), t / 2 + 0.12);
  }
  if (o.foot) { const pts = []; for (let u = u0 + 0.05; u <= u0 + W - 0.05 + 1e-6; u += 0.22) pts.push([Math.min(u, u0 + W - 0.05), y0 + 0.06]); surf.pipe(pts, { r: 0.1, rh: 0.13, v: t / 2 + 0.02, rAt: lumpy(0.3) }); }
  if (o.ropeL) kRope(K, F, u0 + 0.02, y0, y0 + H, GB.ropeR, { v: t / 2 + 0.07, grounded: o.grounded });
  if (o.ropeR) kRope(K, F, u0 + W - 0.02, y0, y0 + H, GB.ropeR, { v: t / 2 + 0.07, grounded: o.grounded });
  return surf;
}
function kFlake(surf, u, y, R) {
  for (const arm of flakeArms(u, y, R)) surf.pipe(arm, { r: 0.04, rh: 0.03 });
  surf.dot(u, y, 0.07);
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + (k + 0.5) * Math.PI / 3; surf.dot(u + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95, 0.035); }
}

/** square lattice window (lit or dark) in an opening, icing sill, optional striped scalloped AWNING */
function kLattice(K, surf, op, o = {}) {
  const F = surf.F, t = GB.wallT, uc = (op.u0 + op.u1) / 2, yc = (op.y0 + op.y1) / 2, uw = op.u1 - op.u0, hh = op.y1 - op.y0;
  const host = surf.find(uc, op.y1 + 0.15);
  const p = piece(K, 'window', { hp: GB.hp.frame, host, col: GB.cookieLt });
  if (o.lit) add(p, GEO.pil, K.R.pick(GB.warm), MF(F, uc, yc, -0.03, uw - 0.02, hh - 0.02, 0.06), { glow: true, bake: 0.05 });
  else add(p, GEO.pil, '#3a2216', MF(F, uc, yc, -0.03, uw - 0.02, hh - 0.02, 0.06), { bake: 0 });
  const fv = t / 2 + 0.03, fw = 0.15;
  add(p, GEO.brick, GB.cookieLt, MF(F, uc, op.y1 + fw * 0.3, fv, uw + 0.36, fw, 0.16), { bake: 0.45, mask: 1 });
  add(p, GEO.brick, GB.cookieLt, MF(F, uc, op.y0 - fw * 0.3, fv + 0.02, uw + 0.42, fw, 0.2), { bake: 0.45, mask: 1 });
  for (const u of [op.u0 - fw * 0.3, op.u1 + fw * 0.3]) add(p, GEO.brick, GB.cookieLt, MF(F, u, yc, fv, fw, hh + 0.1, 0.16), { bake: 0.45, mask: 1 });
  // mullions: a centre bar + an X in each pane (the lattice)
  const mv = t / 2 - 0.08;
  add(p, GEO.brick, GB.mullion, MF(F, uc, yc, mv, 0.08, hh, 0.07), { bake: 0.2 });
  add(p, GEO.brick, GB.mullion, MF(F, uc, yc, mv, uw, 0.07, 0.07), { bake: 0.2 });
  for (const sd of [-1, 1]) {
    const pu = uc + sd * uw / 4, pw = uw / 2, len = Math.hypot(pw, hh) * 0.96, ang = Math.atan2(hh, pw);
    for (const a of [ang, -ang]) add(p, GEO.brick, GB.mullion, MF(F, pu, yc, mv - 0.01, len, 0.055, 0.05, a), { bake: 0.2 });
  }
  // icing on the sill + drips
  const sy = op.y0 - fw * 0.3 + fw / 2, sv = fv + 0.12;
  iceDrape(K, [op.u0 - 0.23, op.u1 + 0.23].map(u => ({ p: FP(F, u, sy, sv), U: F.b.clone(), O: F.n.clone() })),
    { host: p, w: 0.17, th: 0.09, hang: 0.08, drip: 0.14, finger: 0.24, fingerSpace: 1.3, taper: 0.12, step: 0.1, dw: 0.9, lite: true });
  if (o.awning) kAwning(K, F, uc, op.y1 + 0.2, uw + 0.5, o.awning, host, t / 2);
  return p;
}
function kAwning(K, F, uc, yTop, width, col, host, vS) {
  const p = piece(K, 'awning', { hp: GB.hp.decor, host, col });
  const n = Math.max(5, Math.round(width / 0.27)), sw = width / n, len = 0.72;
  const D = F.n.clone().multiplyScalar(0.72).addScaledVector(F.b, -0.69).normalize();       // down + out
  const Nn = new V3().crossVectors(F.a, D); if (Nn.dot(YA) < 0) Nn.negate();
  const top = FP(F, uc, yTop, vS + 0.02);
  for (let k = 0; k < n; k++) {
    const c = k % 2 ? '#fff4ea' : col, du = -width / 2 + sw * (k + 0.5);
    const ctr = top.clone().addScaledVector(F.a, du).addScaledVector(D, len / 2);
    add(p, GEO.pil, c, MB(ctr, F.a, D, Nn, sw * 1.01, len, 0.07), { bake: 0.12 });
    const lip = top.clone().addScaledVector(F.a, du).addScaledVector(D, len);
    add(p, GEO.ball, c, MB(lip, F.a, D, Nn, sw * 0.98, 0.26, 0.07), { bake: 0 });       // the scallop
  }
  addTube(p, [top.clone().addScaledVector(F.a, -width / 2 - 0.05), top.clone().addScaledVector(F.a, width / 2 + 0.05)].map(q => q.addScaledVector(Nn, 0.03)), { r: 0.07, rh: 0.07, sides: 6 });
  return p;
}

/** DOOR module: red arched plank door (or an open arch), candy-cane posts, cookie arch + icing hood, wreath, glowing cross */
function kDoor(K, surf, op, o = {}) {
  const F = surf.F, t = GB.wallT, dc = (op.u0 + op.u1) / 2, hw = (op.u1 - op.u0) / 2, y0 = op.y0, y1 = op.y1, yA = y1 - hw * 0.72;
  const arch = u => yA + (y1 - yA) * Math.sqrt(Math.max(0, 1 - ((u - dc) / hw) ** 2));
  const host = surf.find(dc, y1 + 0.2);
  const fr = piece(K, 'frame', { hp: GB.hp.frame, host, col: GB.cookie });
  // spandrels: cookie filling the opening's top corners above the arch (fanned from the corner)
  for (const sd of [-1, 1]) {
    const cu = dc + sd * hw, pts = [[cu, y1], [cu, yA]];
    for (let k = 1; k <= 8; k++) { const u = cu - sd * hw * k / 8; pts.push([u, arch(u)]); }
    pts.push([dc, y1]);
    fr.ops.push(S => prism(S, pts, F, -t / 2, t / 2, { L: 1, fan0: true, disp: surf.disp }));
  }
  // candy-cane posts + cookie arch + icing hood with drips
  const cv = t / 2 + 0.1, cane = j => (j >> 1) % 2 ? '#fff6ee' : GB.red;
  for (const u of [op.u0 - 0.13, op.u1 + 0.13]) {
    const pts = []; for (let k = 0; k <= 14; k++) pts.push(FP(F, u, y0 + (yA + 0.12 - y0) * k / 14, cv));
    addTube(fr, pts, { r: 0.12, sides: 8, helix: 1.5, jcol: cane });
  }
  const R1 = hw + 0.14, arc = circlePts(F, dc, yA + 0.1, cv - 0.02, R1, 16, Math.PI, 0);
  addTube(fr, arc, { r: 0.14, sides: 7, col: GB.cookieLt, mask: 1 });
  const hood = []; for (let k = 0; k <= 14; k++) { const a = Math.PI + 0.12 - (Math.PI + 0.24) * k / 14, U = F.a.clone().multiplyScalar(Math.cos(a)).addScaledVector(F.b, Math.sin(a));
    hood.push({ p: FP(F, dc + Math.cos(a) * (R1 + 0.1), yA + 0.1 + Math.sin(a) * (R1 + 0.1), cv + 0.1), U, O: F.n.clone() }); }
  iceDrape(K, hood, { host: fr, w: 0.2, th: 0.15, hang: 0.13, drip: 0.22, finger: 0.3, fingerSpace: 0.9, taper: 0.28, step: 0.08 });
  add(fr, GEO.ball, GB.red, MB(FP(F, dc, yA + 0.1 + R1 + 0.3, cv + 0.05), F.a, F.b, F.n, 0.2, 0.2, 0.2), { bake: 0 });
  if (o.open) return fr;
  // planks + glow cross + knob + wreath
  const d = piece(K, 'door', { hp: GB.hp.door, host, col: o.col ?? GB.door });
  const np = 4, pw = (2 * hw - 0.04) / np;
  for (let k = 0; k < np; k++) {
    const u = dc - hw + 0.02 + pw * (k + 0.5), top = Math.max(arch(u - pw / 2), arch(u + pw / 2)) - 0.02;
    add(d, GEO.pil, o.col ?? GB.door, MF(F, u, (y0 + top) / 2, -0.02, pw - 0.025, top - y0, 0.12), { bake: 0.35, k: K.R.r(0.88, 1.06) });
  }
  const gy = y0 + GB.doorH * 0.68;
  add(d, GEO.pil, '#ffd27a', MF(F, dc, gy, 0.05, 0.36, 0.12, 0.05), { glow: true, bake: 0 });
  add(d, GEO.pil, '#ffd27a', MF(F, dc, gy, 0.05, 0.12, 0.36, 0.05), { glow: true, bake: 0 });
  addTube(d, circlePts(F, dc, gy, 0.07, 0.24, 16), { r: 0.035, sides: 5, col: GB.gold });
  add(d, GEO.ball, GB.gold, MF(F, dc + hw * 0.7, y0 + GB.doorH * 0.45, 0.08, 0.12, 0.12, 0.1), { bake: 0 });
  const wy = y0 + GB.doorH * 0.45;
  addTube(d, circlePts(F, dc, wy, 0.11, 0.24, 18), { r: 0.085, sides: 6, colFn: (s, th) => (Math.floor(s * 9 + th) % 2 ? GB.green : '#3fa456') });
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; add(d, GEO.dot, GB.red, MF(F, dc + Math.cos(a) * 0.24, wy + Math.sin(a) * 0.24, 0.19, 0.07, 0.07, 0.07), { bake: 0 }); }
  for (const sd of [-1, 1]) add(d, GEO.ball, GB.red, MF(F, dc + sd * 0.08, wy + 0.25, 0.17, 0.14, 0.1, 0.07, sd * 0.4), { bake: 0 });
  add(d, GEO.dot, GB.red, MF(F, dc, wy + 0.25, 0.19, 0.06, 0.06, 0.06), { bake: 0 });
  return fr;
}

/** ROUND WINDOW: glowing lens, cross mullion, cookie + icing rings, scallop dots */
function kRoundWin(K, surf, u, y, R, host) {
  const F = surf.F, p = piece(K, 'window', { hp: GB.hp.frame, host: host ?? surf.find(u, y), col: GB.cookieLt });
  const c = surf.P(u, y, 0.0);
  p.ops.push((S, G) => polarDisc(G, c, F.a, F.b, F.n, R * 0.86, 0.12, { half: true, colFn: rn => rn < 0.5 ? '#ffe0a0' : '#ffc070', rings: 3, segs: 16 }));
  add(p, GEO.pil, GB.mullion, MB(surf.P(u, y, 0.06), F.a, F.b, F.n, R * 1.75, 0.09, 0.07), { bake: 0.2 });
  add(p, GEO.pil, GB.mullion, MB(surf.P(u, y, 0.06), F.a, F.b, F.n, 0.09, R * 1.75, 0.07), { bake: 0.2 });
  addTube(p, circlePts(F, u, y, GB.wallT / 2 + 0.07, R, 24), { r: 0.1, sides: 6, col: GB.cookieLt, mask: 1 });
  addTube(p, circlePts(F, u, y, GB.wallT / 2 + 0.06, R * 1.2, 28), { r: 0.065, sides: 6 });
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; add(p, GEO.dot, GB.icing, MB(FP(F, u + Math.cos(a) * R * 1.42, y + Math.sin(a) * R * 1.42, GB.wallT / 2 + 0.05), F.a, F.b, F.n, 0.15, 0.15, 0.1), { bake: 0 }); }
  return p;
}

/** GABLE END: chunked triangle; 'front' = round window + swirls + fleur + dots; 'back' = big snowflake. o.trim = rake icing (kit) */
function kGable(K, F, uC, yb, W, rise, o = {}) {
  const t = GB.wallT, tanA = rise / (W / 2), yR = yb + rise;
  const clips = [[tanA, 1, yR + tanA * uC], [-tanA, 1, yR - tanA * uC]];
  const surf = chunkSlab(K, { F, u0: uC - W / 2, u1: uC + W / 2, y0: yb, y1: yR, clips, v0: -t / 2, v1: t / 2, L: 1, grounded: o.grounded });
  const halfAt = y => (yR - y) / tanA;
  if ((o.style ?? 'front') === 'front') {
    const R = clamp(rise * 0.15, 0.38, 0.55), yw = yb + rise * 0.36;
    kRoundWin(K, surf, uC, yw, R);
    if (halfAt(yw - R * 0.3) > R + 0.95) for (const sd of [-1, 1]) surf.pipe(scrollPts(uC + sd * (R + 0.6), yw - R * 0.4, 0.3, sd), { r: 0.05, rh: 0.04 });
    const fy = yw + R * 1.45 + 0.12;
    if (halfAt(fy + 0.4) > 0.3) {
      surf.pipe([[uC, fy], [uC, fy + 0.32]], { r: 0.045, rh: 0.035 });
      for (const sd of [-1, 1]) surf.pipe(scrollPts(uC + sd * 0.13, fy + 0.2, 0.09, -sd), { r: 0.035, rh: 0.03 });
      surf.dot(uC, fy + 0.42, 0.05);
    }
    if (halfAt(yb + 0.3) > R + 1.6) for (const sd of [-1, 1]) surf.dot(uC + sd * (R + 0.4), yw + R + 0.1, 0.05);
  } else {
    const Rf = clamp(rise * 0.2, 0.35, 0.62); kFlake(surf, uC, yb + rise * 0.36, Rf);
  }
  if (o.trim) {             // rake icing + drips + candy dots (the standalone kit piece)
    for (const sd of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 16; k++) { const f = k / 16; pts.push([uC + sd * (W / 2) * (1 - f), yb + rise * f]); }
      const up = new V3().addScaledVector(F.b, 1).addScaledVector(F.a, sd * tanA).normalize();
      surf.pipe(pts, { r: 0.16, rh: 0.26, v: 0.02, p3: (u, y) => FP(F, u, y, 0.02).addScaledVector(up, 0.06), rAt: lumpy(0.25) });
      for (let k = 1; k < 16; k += 1.4) { const f = k / 16, u = uC + sd * (W / 2) * (1 - f), y = yb + rise * f; surf.drip(u, y - 0.08, K.R.r(0.1, 0.32), 0.13, t / 2 + 0.12); }
      for (let k = 2; k < 15; k += 4) { const f = k / 16, u = uC + sd * (W / 2) * (1 - f), y = yb + rise * f; const h = surf.find(u, y - 0.1); if (h) add(h, GEO.ball, GB.red, M(...FP(F, u, y, 0.02).addScaledVector(up, 0.3).toArray(), 0.2, 0.2, 0.2), { bake: 0 }); }
    }
  }
  return surf;
}

/** ROOF SECTION: one slope s (+1 = +x side) from z0 to z1 along the ridge; ridge line at (xr, yRidge). o: {rake0, rake1, ridge, grounded} */
function kRoof(K, s, z0, z1, xr, yRidge, tanA, Ls, o = {}) {
  const A = Math.atan(tanA), cA = Math.cos(A), sA = Math.sin(A), rt = GB.roofT, R = K.R;
  const F = frame(new V3(xr, yRidge, 0), ZA.clone(), new V3(s * cA, -sA, 0), new V3(s * sA, cA, 0));
  const surf = chunkSlab(K, { F, u0: z0, u1: z1, y0: 0, y1: Ls, v0: 0, v1: rt, L: 1, cell: 0.85, kind: 'roof', hp: GB.hp.roof, color: GB.roofSlab, padN: 0.32, amp: 0.008, grounded: o.grounded });
  // shingles: rows of big round cookies from the eave up, every other row offset; lower edges lifted (they overlap downhill)
  const tilt = 0.2, Yd = F.n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(F.b, -Math.sin(tilt)), Zd = F.b.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(F.n, Math.sin(tilt));
  let row = 0;
  for (let l = Ls - 0.5; l > 0.36; l -= 0.56, row++) {
    const off = (row % 2) * 0.42 + (hash3(row, 3, K.seed) - 0.5) * 0.12;
    for (let z = z0 + 0.12 + off; z < z1 - 0.14; z += 0.84) {
      const host = surf.find(z, l); if (!host) continue;
      const zz = z + R.r(-0.05, 0.05), ll = l + R.r(-0.03, 0.03);
      add(host, GEO.disc, GB.shingle, MB(FP(F, zz, ll, rt + 0.1), F.a, Yd, Zd, R.r(0.9, 1.0), 0.15, R.r(0.72, 0.8)), { bake: 0.55, mask: 0.75, k: R.r(0.9, 1.1) });
    }
  }
  // icing: one continuous drape over the eave + rakes, ridge cap + roll (a house does it once per slope across its sections)
  if (o.ice !== false) roofIce(K, [surf], s, z0, z1, Ls, o);
  surf.F = F; surf.Ls = Ls; surf.s = s;
  return surf;
}

/** DORMER on slope s: front wall + window, cheeks, its own icing roof. roofY(x) = the main roof surface height at x */
function kDormer(K, s, xf, zc, roofY, host, o = {}) {
  const dw = o.w ?? 1.5, R = K.R, yb = roofY(xf) - 0.3, yE = roofY(xf) + 1.25, yA = yE + 0.62;
  const xr = o.xr ?? 0, xIn = y => { let lo = xf, hi = xr; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (roofY(m) > y) hi = m; else lo = m; } return (lo + hi) / 2; };
  const xc = xIn(yE), xb = xIn(yA);
  const Ff = frame(new V3(xf, 0, zc), new V3(0, 0, -s), YA.clone(), new V3(s, 0, 0));
  const fw = piece(K, 'dormer', { hp: GB.hp.dormer, host, col: GB.cookie });
  const poly = [[-dw / 2, yb], [dw / 2, yb], [dw / 2, yE], [0, yA], [-dw / 2, yE]];
  fw.ops.push(S => prism(S, poly, Ff, -0.13, 0.13, { L: 1, disp: () => 0 }));
  for (const sd of [-1, 1]) {
    const Fc = frame(new V3(0, 0, zc + sd * (dw / 2 - 0.12)), XA.clone(), YA.clone(), new V3(0, 0, sd));
    const cp = [[xf, yb], [xf, yE], [xc, yE]];
    fw.ops.push(S => prism(S, cp, Fc, -0.12, 0.12, { L: 1 }));
  }
  // window: warm glow, cookie frame (arched top), cross mullion, icing sill
  const wy = (yb + yE) / 2 + 0.25, win = piece(K, 'window', { hp: GB.hp.frame, host: fw, col: GB.cookieLt });
  add(win, GEO.pil, '#ffcf80', MF(Ff, 0, wy, 0.14, 0.58, 0.72, 0.05), { glow: true, bake: 0 });
  addTube(win, roundRect(-0.36, wy - 0.42, 0.36, wy + 0.42, 0.3, 4).map(([u, y]) => FP(Ff, u, y, 0.19)), { r: 0.07, sides: 6, col: GB.cookieLt, mask: 1 });
  add(win, GEO.pil, GB.mullion, MF(Ff, 0, wy, 0.18, 0.07, 0.78, 0.06), { bake: 0.2 });
  add(win, GEO.pil, GB.mullion, MF(Ff, 0, wy + 0.05, 0.18, 0.66, 0.07, 0.06), { bake: 0.2 });
  add(win, GEO.lump, GB.icing, MF(Ff, 0, wy - 0.48, 0.2, 0.9, 0.12, 0.22), { bake: 0.05 });
  for (let k = 0; k < 3; k++) drip(win, FP(Ff, -0.25 + k * 0.25, wy - 0.5, 0.3), R.r(0.1, 0.22), 0.11);
  // the little roof: two slabs, icing on top, drips off the eaves and the front rakes, a candy at the apex
  const rf = piece(K, 'dormer', { hp: GB.hp.decor + 2, host: fw, col: GB.icing });
  const x0 = xf + s * 0.32, xm = (x0 + xb) / 2, lx = Math.abs(xb - x0) + 0.1, apex = new V3(0, yA + 0.08, zc);
  for (const sd of [-1, 1]) {
    const eave = new V3(0, yE - 0.14, zc + sd * (dw / 2 + 0.3)), D = eave.clone().sub(apex), dl = D.length(); D.normalize();
    const Nn = new V3().crossVectors(XA, D); if (Nn.y < 0) Nn.negate();
    const mid = apex.clone().addScaledVector(D, dl / 2); mid.x = xm;
    add(rf, GEO.pil, GB.roofSlab, MB(mid, XA, Nn, D, lx, 0.16, dl), { bake: 0.3, mask: 1 });
    add(rf, GEO.lump, GB.icing, MB(mid.clone().addScaledVector(Nn, 0.16), XA, Nn, D, lx + 0.1, 0.3, dl + 0.14), { bake: 0.05 });
    // the front rake then round the corner along the eave: one soft drape
    const top = mid.clone().addScaledVector(Nn, 0.08), xF = xm + s * lx / 2, xB = xm - s * lx / 2, Dn = D.clone(), Ox = new V3(s, 0, 0);
    const at = (x, f) => top.clone().addScaledVector(Dn, (f - 0.5) * dl).setX(x);
    const C = [{ p: at(xF, 0.04), U: Nn.clone(), O: Ox.clone() }, { p: at(xF, 0.86), U: Nn.clone(), O: Ox.clone() },
      { p: at(xF - s * 0.06, 0.97), U: Nn.clone(), O: Ox.clone().add(Dn).normalize() }, { p: at(xF - s * 0.16, 1), U: Nn.clone(), O: Dn.clone() }, { p: at(xB, 1), U: Nn.clone(), O: Dn.clone() }];
    iceDrape(K, C, { host: rf, w: 0.28, th: 0.15, hang: 0.2, drip: 0.26, finger: 0.32, fingerSpace: 0.9, taper: 0.2, step: 0.08 });
  }
  addTube(rf, [new V3(x0, apex.y + 0.1, zc), new V3(xb, apex.y + 0.1, zc)], { r: 0.17, rh: 0.15, sides: 7 });
  add(rf, GEO.ball, GB.red, M(x0 - s * 0.05, apex.y + 0.32, zc, 0.22, 0.22, 0.22), { bake: 0 });
  return fw;
}

/** CHIMNEY: gingerbread bricks, a candy-stripe band, cookie cap, icing heap with drips + candy dots */
function kChimney(K, x, z, yb, yt, host, o = {}) {
  const hw = o.hw ?? 0.48, R = K.R, bh = 0.27;
  const p = piece(K, 'chimney', { hp: GB.hp.chimney, host, col: GB.cookie });
  add(p, GEO.pil, GB.inner, M(x, (yb + yt) / 2, z, hw * 2 - 0.1, yt - yb, hw * 2 - 0.1), { bake: 0.1 });
  const nC = Math.max(2, Math.round((yt - yb) / bh)), ch = (yt - yb) / nC, yBand = yt - 0.72;
  for (let k = 0; k < nC; k++) {
    const y = yb + ch * (k + 0.5); if (Math.abs(y - yBand) < 0.26) continue;
    for (let f = 0; f < 4; f++) {
      const a = f * Math.PI / 2, nx = Math.sin(a), nz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
      const cuts = (k + f) % 2 ? [-1, 0, 1] : [-1, -0.5, 0.5, 1];
      for (let m = 0; m < cuts.length - 1; m++) {
        const c0 = cuts[m] * hw, c1 = cuts[m + 1] * hw, cc = (c0 + c1) / 2;
        add(p, GEO.brick, R.pick([GB.cookie, GB.cookieLt, '#a85a28']), MB(new V3(x + nx * (hw - 0.08) + tx * cc, y, z + nz * (hw - 0.08) + tz * cc), new V3(tx, 0, tz), YA, new V3(nx, 0, nz), c1 - c0 - 0.04, ch - 0.04, 0.2), { bake: 0.4, mask: 1 });
      }
    }
  }
  const band = []; for (let k = 0; k <= 28; k++) { const a = k / 28 * Math.PI * 2; band.push(new V3(x + Math.cos(a) * hw * 1.08, yBand, z + Math.sin(a) * hw * 1.08)); }
  addTube(p, band, { r: 0.2, rh: 0.2, sides: 8, helix: 1.6, jcol: j => (j >> 1) % 2 ? '#fff6ee' : GB.red, caps: false });
  add(p, GEO.pil, GB.cookieLt, M(x, yt + 0.08, z, hw * 2 + 0.24, 0.26, hw * 2 + 0.24), { bake: 0.45, mask: 1 });
  const ca = hw + 0.12;
  iceDrape(K, rrPath(x - ca, x + ca, z - ca, z + ca, 0.16, yt + 0.21), { host: p, closed: true, w: hw * 0.85, th: 0.2, hang: 0.2, drip: 0.32, finger: 0.4, step: 0.12 });
  add(p, GEO.ball, GB.icing, M(x + 0.05, yt + 0.36, z - 0.04, hw * 1.7, 0.36, hw * 1.6), { bake: 0 });
  for (let k = 0; k < 4; k++) { const a = k * 1.7; add(p, GEO.ball, GB.red, M(x + Math.cos(a) * 0.3, yt + 0.6 + (k % 2) * 0.06, z + Math.sin(a) * 0.3, 0.17, 0.17, 0.17), { bake: 0 }); }
  p.obb = { c: new V3(x, (yb + yt) / 2 + 0.3, z), ax: [XA.clone(), YA.clone(), ZA.clone()], he: [hw + 0.1, (yt - yb) / 2 + 0.4, hw + 0.1] };
  return p;
}

/** LANTERN on a bracket: p = wall attach point, dir = out along the bracket */
function kLantern(K, at, dir, host) {
  const p = piece(K, 'lamp', { hp: GB.hp.decor, host, col: GB.choc });
  const side = new V3().crossVectors(YA, dir).normalize();
  add(p, GEO.pil, GB.cookieLt, MB(at.clone().addScaledVector(dir, 0.45), dir, YA, side, 0.92, 0.15, 0.15), { bake: 0.4, mask: 1 });
  const brace = new V3().addScaledVector(dir, 0.7).addScaledVector(YA, 0.7).normalize();
  add(p, GEO.pil, GB.cookieLt, MB(at.clone().addScaledVector(dir, 0.22).add(new V3(0, -0.22, 0)), brace, new V3().crossVectors(side, brace), side, 0.55, 0.1, 0.1), { bake: 0.4, mask: 1 });
  add(p, GEO.lump, GB.icing, MB(at.clone().addScaledVector(dir, 0.48).add(new V3(0, 0.1, 0)), dir, YA, side, 0.95, 0.09, 0.2), { bake: 0 });
  drip(p, at.clone().addScaledVector(dir, 0.3).add(new V3(0, 0.06, 0)), 0.15, 0.1);
  const q = at.clone().addScaledVector(dir, 0.78).add(new V3(0, -0.2, 0));
  addTube(p, [q.clone().add(new V3(0, 0.14, 0)), q.clone().add(new V3(0, -0.04, 0))], { r: 0.025, sides: 5, col: GB.choc });
  const Mq = (dy, sx, sy, sz) => M(q.x, q.y + dy, q.z, sx, sy, sz);
  add(p, GEO.pil, GB.choc, Mq(-0.1, 0.42, 0.1, 0.42), { bake: 0.2 });
  add(p, GEO.lump, GB.choc, Mq(-0.02, 0.3, 0.14, 0.3), { bake: 0.2 });
  add(p, GEO.lump, GB.icing, Mq(0.04, 0.34, 0.1, 0.34), { bake: 0 });
  add(p, GEO.pil, '#ffcf80', Mq(-0.36, 0.28, 0.4, 0.28), { glow: true, bake: 0 });
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(p, GEO.pil, GB.choc, Mq(-0.36, 0.05, 0.44, 0.05).setPosition(q.x + a * 0.15, q.y - 0.36, q.z + b * 0.15), { bake: 0 });
  add(p, GEO.pil, GB.choc, Mq(-0.6, 0.36, 0.08, 0.36), { bake: 0.2 });
  add(p, GEO.ball, GB.gold, Mq(-0.68, 0.1, 0.1, 0.1), { bake: 0 });
  return p;
}
function kCane(K, at, H, yaw = 0, host = null) {
  const p = piece(K, 'decor', { hp: GB.hp.decor, host, col: GB.red });
  const d = new V3(Math.cos(yaw), 0, Math.sin(yaw)), rc = 0.16, pts = [];
  for (let k = 0; k <= 10; k++) pts.push(at.clone().add(new V3(0, H * k / 10, 0)));
  const c = at.clone().add(new V3(0, H, 0)).addScaledVector(d, rc);
  for (let k = 1; k <= 10; k++) { const a = Math.PI - k / 10 * Math.PI; pts.push(c.clone().addScaledVector(d, Math.cos(a) * rc).add(new V3(0, Math.sin(a) * rc, 0))); }
  pts.push(c.clone().addScaledVector(d, rc).add(new V3(0, -0.14, 0)));
  addTube(p, pts, { r: 0.075, sides: 8, helix: 2.6, jcol: j => (j >> 1) % 2 ? '#fff6ee' : GB.red });
  return p;
}
function kPeppermint(K, c, X, Z, R, host) {
  const p = piece(K, 'decor', { hp: GB.hp.decor, host, col: GB.red }), Y = new V3().crossVectors(Z, X).normalize();
  p.ops.push(S => polarDisc(S, c, X, Y, Z, R, R * 0.5, { rings: 4, segs: 20, colFn: (rn, a) => (((a / (Math.PI * 2)) * 8 + rn * 1.1) % 1 + 1) % 1 < 0.5 ? GB.red : '#fff6ee' }));
  for (const sd of [-1, 1]) {
    const lc = c.clone().addScaledVector(X, sd * R * 1.15).addScaledVector(Y, -R * 0.45).addScaledVector(Z, -0.05);
    const ax = X.clone().multiplyScalar(Math.cos(sd * 0.5)).addScaledVector(Y, Math.sin(sd * 0.5) * sd);
    add(p, GEO.ball, '#2f8a3c', MB(lc, ax, new V3().crossVectors(Z, ax), Z, R * 1.3, R * 0.55, R * 0.18), { bake: 0 });
    add(p, GEO.ball, '#3fa04e', MB(lc.clone().addScaledVector(Y, -R * 0.3).addScaledVector(X, -sd * R * 0.2), ax, new V3().crossVectors(Z, ax), Z, R * 1.0, R * 0.45, R * 0.16), { bake: 0 });
  }
  for (let k = 0; k < 3; k++) add(p, GEO.dot, GB.red, MB(c.clone().addScaledVector(X, (k - 1) * R * 0.25).addScaledVector(Y, -R * 0.95).addScaledVector(Z, 0.1), X, Y, Z, R * 0.3, R * 0.3, R * 0.3), { bake: 0 });
  return p;
}
function kGumdrop(K, at, col, sz = 0.5) {
  const p = piece(K, 'decor', { hp: GB.hp.decor, col });
  add(p, GEO.gum, col, M(at.x, at.y, at.z, sz, sz * 1.05, sz, 0, K.R.r(0, 6), 0), { bake: 0, mask: 0.5, k: 1.05 });
  return p;
}
function kSnow(K, p, at, sz = 1) {
  const R = K.R;
  for (let k = 0; k < 3; k++) add(p, GEO.lump, GB.icing, M(at.x + R.r(-0.25, 0.25) * sz, at.y + 0.04, at.z + R.r(-0.18, 0.18) * sz, R.r(0.35, 0.6) * sz, R.r(0.12, 0.2) * sz, R.r(0.3, 0.45) * sz, 0, R.r(0, 3), 0), { bake: 0 });
}
/** PLINTH: a ring of chunky cookie stones under one continuous soft snow-icing drape; optional floor tiles; gaps = [[xa, xb]]
 *  on the front edge (the drape opens there) */
function kPlinth(K, x0, x1, z0, z1, top, o = {}) {
  const p = piece(K, 'static'), R = K.R, gaps = o.gaps ?? [], dep = 0.74, hh = top + 0.12, snowRuns = [];
  add(p, GEO.pil, GB.stone, M((x0 + x1) / 2, top / 2 - 0.02, (z0 + z1) / 2, x1 - x0 - 0.5, top, z1 - z0 - 0.5), { bake: 0.3, mask: 1 });
  if (o.tiles) {
    const nx = Math.max(1, Math.round((x1 - x0 - 1.1) / 0.75)), nz = Math.max(1, Math.round((z1 - z0 - 1.1) / 0.75)), tw = (x1 - x0 - 1.1) / nx, td = (z1 - z0 - 1.1) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) add(p, GEO.brick, R.pick([GB.cookieLt, GB.cookie]), M(x0 + 0.55 + tw * (i + 0.5), top + 0.01, z0 + 0.55 + td * (j + 0.5), tw - 0.05, 0.08, td - 0.05), { bake: 0.3, mask: 1 });
  }
  const edges = [[[x0, z1], [x1, z1], true], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]];
  for (const [[ax, az], [bx, bz], front] of edges) {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nX = dz, nZ = -dx;
    const inGap = s => front && gaps.some(([ga, gb]) => { const x = ax + dx * s; return x > ga && x < gb; });
    let s = 0, run = null;
    const flush = () => { if (run && run.length > 1) snowRuns.push(run); run = null; };
    while (s < L - 0.05) {
      const len = Math.min(R.r(0.75, 1.05), L - s), mid = s + len / 2;
      if (inGap(mid) || R() < 0.14) flush();
      else {
        const O = new V3(-nX, 0, -nZ), at = u => ({ p: new V3(ax + dx * u - nX * (dep - 0.12), hh, az + dz * u - nZ * (dep - 0.12)), U: YA.clone(), O: O.clone() });
        if (!run) run = [at(s + 0.08)];
        run.push(at(s + len - (s + len > L - 0.06 ? 0.1 : 0)));
      }
      if (!inGap(mid)) {
        const h = hh + R.r(-0.03, 0.02), cx = ax + dx * mid - nX * (dep / 2 - 0.05), cz = az + dz * mid - nZ * (dep / 2 - 0.05);
        add(p, GEO.pil, R.pick([GB.stone, GB.cookie, '#9a5226']), MB(new V3(cx, h / 2, cz), new V3(dx, 0, dz), YA, new V3(nX, 0, nZ), len - 0.05, h, dep), { bake: 0.35, mask: 1 });
      }
      s += len;
    }
    flush();
  }
  // the snow: soft drifts poured over the stones' outer edges -- long runs over several stones, a bare stone between some
  for (const run of snowRuns) iceDrape(K, run, { host: p, w: R.r(0.38, 0.55), th: 0.12, hang: 0.08, drip: 0.13, finger: 0.2, fingerSpace: 2.5, taper: 0.22, step: 0.2, lite: true, space: 1.3 });
  return p;
}
function kSteps(K, x, z0, top, w) {
  const p = piece(K, 'static');
  for (const [k, hh, zc] of [[0, top * 0.68, z0 + 0.32], [1, top * 0.36, z0 + 0.92]]) {
    add(p, GEO.lump, k ? GB.stone : GB.cookie, M(x, hh / 2, zc, w + k * 0.5, hh, 0.62), { bake: 0.35, mask: 1 });
    add(p, GEO.lump, GB.icing, M(x, hh + 0.02, zc - 0.02, w + k * 0.5 - 0.1, 0.08, 0.5), { bake: 0 });
  }
  return p;
}
function kFence(K, a, b, n = 3) {
  const R = K.R, d = b.clone().sub(a), L = d.length(); d.normalize();
  const side = new V3().crossVectors(YA, d), out = [];
  for (let k = 0; k < n; k++) {
    const pp = a.clone().addScaledVector(d, L * k / (n - 1)), p = piece(K, 'decor', { hp: GB.hp.decor, col: GB.cookie });
    add(p, GEO.lump, GB.cookie, MB(pp.clone().add(new V3(0, 0.38, 0)), d, YA, side, 0.24, 0.76, 0.24), { bake: 0.35, mask: 1 });
    add(p, GEO.lump, GB.icing, MB(pp.clone().add(new V3(0, 0.8, 0)), d, YA, side, 0.32, 0.16, 0.32), { bake: 0 });
    drip(p, pp.clone().add(new V3(0, 0.76, 0)).addScaledVector(side, 0.12), 0.12, 0.08);
    if (k < n - 1) {
      const seg = L / (n - 1), mid = pp.clone().addScaledVector(d, seg / 2);
      for (const hy of [0.32, 0.58]) add(p, GEO.pil, GB.cookieLt, MB(mid.clone().add(new V3(0, hy, 0)), d, YA, side, seg - 0.1, 0.1, 0.08), { bake: 0.3, mask: 1 });
      add(p, GEO.lump, GB.icing, MB(mid.clone().add(new V3(0, 0.65, 0)), d, YA, side, seg - 0.2, 0.06, 0.12), { bake: 0 });
    }
    out.push(p);
  }
  return out;
}

// =====================================================================================================
// HOUSES FROM THE KIT
// =====================================================================================================
const DEF = {
  front: { 2: ['flake', 'door'], 3: ['swirl', 'door', 'lattice'], 4: ['lattice', 'flake', 'door', 'swirl'] },
};
function wallsOf(nx, nz, o, floor) {
  const pick = (arr, n, fallback) => Array.from({ length: n }, (_, i) => (arr && arr[i]) || fallback[i % fallback.length]);
  if (floor > 0) return {
    front: pick(o.front2, nx, ['lattice', 'plain', 'lattice']), back: pick(o.back2, nx, ['plain', 'dark']),
    left: pick(o.left2, nz, ['plain', 'lattice']), right: pick(o.right2, nz, ['lattice', 'plain']),
  };
  return {
    front: pick(o.front, nx, DEF.front[nx] ?? ['flake', 'door', 'swirl']), back: pick(o.back, nx, ['plain', 'dark', 'swirl']),
    left: pick(o.left, nz, ['plain', 'window', 'flake']), right: pick(o.right, nz, ['lattice', 'swirl', 'plain']),
  };
}

/** o: {nx, nz (modules), floors, front/left/right/back (+2 for the upper floor): variant lists, dormer, chimney (-1 | 1 | 0),
 *  lantern, fence, awning, door, seed} -- the door faces local +z, the left side (awning) is -x */
/** the numbers a house's near AND far versions share */
function houseDims(o) {
  const Gm = GB.mod, nx = o.nx ?? Math.max(2, Math.round((o.w ?? 4.8) / Gm)), nz = o.nz ?? Math.max(2, Math.round((o.d ?? 4.8) / Gm));
  const floors = clamp(o.floors ?? 1, 1, 2), t = GB.wallT, base = GB.base, H = GB.storey;
  const Wt = nx * Gm, Dt = nz * Gm, h = base + floors * H, tanA = GB.pitch, A = Math.atan(tanA), rise = Wt / 2 * tanA, yRidge = h + rise;
  const ov = GB.overhang, ovz = GB.overhangZ, Ls = (Wt / 2 + ov) / Math.cos(A);
  return { Gm, nx, nz, floors, t, base, H, Wt, Dt, h, tanA, A, rise, yRidge, ov, ovz, Ls, roofY: x => yRidge - tanA * Math.abs(x),
    radius: Math.hypot(Wt, Dt) / 2 + rise + 2, cy: yRidge / 2 };
}
function assembleHouse(K, o) {
  const { Gm, nx, nz, floors, t, base, H, Wt, Dt, h, tanA, A, rise, yRidge, ovz, Ls, roofY } = houseDims(o), R = K.R;
  const F = {
    front: frame(new V3(0, 0, Dt / 2 - t / 2), XA.clone(), YA.clone(), ZA.clone()),
    back: frame(new V3(0, 0, -(Dt / 2 - t / 2)), XA.clone().negate(), YA.clone(), ZA.clone().negate()),
    right: frame(new V3(Wt / 2 - t / 2, 0, 0), ZA.clone().negate(), YA.clone(), XA.clone()),
    left: frame(new V3(-(Wt / 2 - t / 2), 0, 0), ZA.clone(), YA.clone(), XA.clone().negate()),
  };
  const span = { front: [Wt, nx], back: [Wt, nx], right: [Dt - 2 * t, nz], left: [Dt - 2 * t, nz] };
  let doorX = null;
  for (let f = 0; f < floors; f++) {
    const V = wallsOf(nx, nz, o, f), y0 = base + f * H;
    for (const side of ['front', 'back', 'left', 'right']) {
      const [L, n] = span[side], W = L / n;
      V[side].forEach((variant, i) => {
        const u0 = -L / 2 + i * W;
        kWall(K, F[side], u0, y0, W, H, variant, { grounded: f === 0, awning: o.awning, door: o.door });
        if (side === 'front' && (variant === 'door' || variant === 'arch')) doorX = u0 + W / 2;
        if (i > 0) kRope(K, F[side], u0, y0, y0 + H, GB.ropeR, { v: t / 2 + 0.07, grounded: f === 0, cap: false });
      });
    }
  }
  const posts = {};
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts[sx + ',' + sz] = kPost(K, sx * (Wt / 2 - 0.05), sz * (Dt / 2 - 0.05), base, h + 0.06);
  kGable(K, F.front, 0, h, Wt, rise, { style: 'front' });
  kGable(K, F.back, 0, h, Wt, rise, { style: 'back' });
  const roofs = { 1: [], '-1': [] };
  for (const s of [1, -1]) for (let k = 0; k < nz; k++) {
    let z0 = -Dt / 2 + k * Gm, z1 = z0 + Gm; if (k === 0) z0 -= ovz; if (k === nz - 1) z1 += ovz;
    roofs[s].push(kRoof(K, s, z0, z1, 0, yRidge, tanA, Ls, { ice: false }));
  }
  for (const s of [1, -1]) roofIce(K, roofs[s], s, -Dt / 2 - ovz, Dt / 2 + ovz, Ls, { rake0: true, rake1: true, ridge: s === -1 });
  const atRoof = (s, x, z) => { const sec = roofs[s][clamp(Math.floor((z + Dt / 2) / Gm), 0, nz - 1)]; return sec.find(z, Math.abs(x) / Math.cos(A)); };
  if (o.dormer ?? true) {
    const ds = o.dormerSide ?? -1, zc = Dt / 2 - Gm / 2, xf = ds * (Wt / 2 - 0.5);
    kDormer(K, ds, xf, zc, roofY, atRoof(ds, xf + ds * -0.6, zc), { w: 1.7 });
  }
  if (o.chimney !== 0 && o.chimney !== false) {
    const cs = o.chimney ?? -1, z = -Dt / 2 + Gm * 0.5, x = cs * Wt * 0.22;
    kChimney(K, x, z, roofY(Math.abs(x) + GB.chimneyHW) - 0.25, yRidge + 0.85, atRoof(cs, x, z), { hw: GB.chimneyHW });
  }
  const top = roofs[-1][nz - 1];
  kPeppermint(K, new V3(0, yRidge + 0.62, Dt / 2 + ovz - 0.02), XA.clone(), ZA.clone(), 0.46, top.find(Dt / 2 + ovz - 0.1, 0.1));
  if (o.lantern !== false) { const pr = posts['1,1']; kLantern(K, new V3(Wt / 2 - 0.05, h - 1.1, Dt / 2 + 0.25), ZA.clone(), pr[pr.length - 1]); }
  // base: plinth, steps, canes, gumdrops, fence, snow
  const px = GB.plinthPad, gaps = doorX !== null ? [[doorX - 1.05, doorX + 1.05]] : [];
  kPlinth(K, -Wt / 2 - px, Wt / 2 + px, -Dt / 2 - px, Dt / 2 + px, base, { gaps });
  if (doorX !== null) {
    kSteps(K, doorX, Dt / 2 + px - 0.32, base, 1.9);
    kCane(K, new V3(doorX - 1.3, base, Dt / 2 + 0.42), 0.95, 0.3);
    if (doorX + 1.45 < Wt / 2 + px) kCane(K, new V3(doorX + 1.35, base, Dt / 2 + 0.45), 0.75, Math.PI - 0.4);
    kGumdrop(K, new V3(doorX + 0.95, base, Dt / 2 + 0.3), GB.green, 0.4);
    kGumdrop(K, new V3(doorX + 1.3, base, Dt / 2 + 0.1), GB.red, 0.34);
  }
  kGumdrop(K, new V3(-Wt / 2 + 0.55, base, Dt / 2 + 0.38), GB.green, 0.48);
  kGumdrop(K, new V3(-Wt / 2 + 1.1, base, Dt / 2 + 0.42), GB.red, 0.52);
  if (o.fence !== false) kFence(K, new V3(-Wt / 2 - 0.85, base, Dt / 2 + 0.6), new V3(-Wt / 2 - 0.85, base, Dt / 2 - 1.3), 3);
  const sn = piece(K, 'static');
  for (let k = 0; k < 4; k++) { const a = R.r(0, Math.PI * 2), rr = 1.05; kSnow(K, sn, new V3(Math.cos(a) * (Wt / 2 + px + 0.9) * rr, 0, Math.sin(a) * (Dt / 2 + px + 0.9) * rr), R.r(0.8, 1.4)); }
  if (o.interior) {        // a cosy room for whoever lives here: dark warm floorboards + a rug (the host lights it)
    const fl = piece(K, 'static'), iw = Wt - 2 * t - 0.04, id = Dt - 2 * t - 0.04, nb = Math.round(iw / 0.42);
    for (let k = 0; k < nb; k++) add(fl, GEO.brick, R.pick(['#5a2e18', '#4e2814', '#663620']), M(-iw / 2 + iw * (k + 0.5) / nb, base + 0.02, 0, iw / nb - 0.03, 0.06, id), { bake: 0.3, mask: 1 });
    add(fl, GEO.dot, '#b8343a', M(0.3, base + 0.06, 0.6, 2.2, 0.03, 1.5), { bake: 0 });
  }
  return { Wt, Dt, h, rise, yRidge };
}

export function buildBreakableHouse(scene, o = {}) {
  init(scene);
  const K = newCtx(o.seed ?? 1), dims = assembleHouse(K, o), hd = houseDims(o);
  return finish(K, scene, o, { ...dims, radius: hd.radius, cy: hd.cy });
}

/** THE KIT laid out like his sheet: each module on its own (every one still breakable; nothing falls) */
export function buildKit(scene, o = {}) {
  init(scene);
  const K = newCtx(o.seed ?? 5); K.allGround = true;
  const Gm = GB.mod, t = GB.wallT, H = GB.storey, b = 0, tanA = GB.pitch;
  const FW = x => frame(new V3(x, 0, 0), XA.clone(), YA.clone(), ZA.clone());
  const at = (x, z) => frame(new V3(x, 0, z), XA.clone(), YA.clone(), ZA.clone());
  // row 1: gable front, gable back, roof section (eaves on the ground), dormer on its slope, chimney
  let z = -9.5;
  kGable(K, at(0, z), -9.6, b, 4.8, 2.4 * tanA, { style: 'front', trim: true, grounded: true });
  kGable(K, at(0, z), -4.4, b, 4.8, 2.4 * tanA, { style: 'back', trim: true, grounded: true });
  { const Ls = 2.2, yR = Ls * Math.sin(Math.atan(tanA)) + 0.05; for (const s of [1, -1]) kRoof(K, s, z - 1.2, z + 1.2, 0.8, yR, tanA, Ls, { rake0: true, rake1: true, ridge: s === -1 }); }
  { const Ls = 3.0, xr = 7.4, yR = Ls * Math.sin(Math.atan(tanA)) + 0.05, ry = x => yR - tanA * Math.abs(x - xr);
    const piv = new V3(xr - 1.0, 0, z), Mx = new THREE.Matrix4().makeTranslation(piv.x, 0, piv.z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, 0, -piv.z));
    withXform(K, Mx, () => {        // turned so the dormer faces the camera
      const sec = kRoof(K, -1, z - 1.15, z + 1.15, xr, yR, tanA, Ls, { rake0: true, rake1: true, ridge: true });
      kDormer(K, -1, xr - 1.9, z, ry, sec.find(z, 1.2), { xr });
    }); }
  kChimney(K, 10.6, z, 0, 2.0, null);
  // row 2: wall panels (window, plain, flake, swirl, dark) + corner post + divider rope
  z = -4.4;
  ['window', 'plain', 'flake', 'swirl', 'dark'].forEach((v, i) => kWall(K, at(-10.2 + i * 2.95, z), -Gm / 2, 0, Gm, H, v, { grounded: true, cap: true, foot: true, ropeL: true, ropeR: true }));
  kPost(K, 5.0, z, 0, H + 0.1);
  kRope(K, at(6.2, z), 0, 0, H, 0.14, { grounded: true });
  // row 3: door, arch, lattice (lit), round window medallion
  z = 0.8;
  kWall(K, at(-9.6, z), -Gm / 2, 0, Gm, H, 'door', { grounded: true, cap: true, foot: true, ropeL: true, ropeR: true });
  kWall(K, at(-6.5, z), -Gm / 2, 0, Gm, H, 'arch', { grounded: true, cap: true, foot: true, ropeL: true, ropeR: true });
  kWall(K, at(-3.4, z), -Gm / 2, 0, Gm, H, 'lattice', { grounded: true, cap: true, foot: true, ropeL: true, ropeR: true });
  { // round window medallion: a cookie disc carrying the window
    const Fm = at(0, z), surf = chunkSlab(K, { F: Fm, u0: -0.85, u1: 0.85, y0: 0.4, y1: 2.1, v0: -0.15, v1: 0.15, grounded: true, clips: Array.from({ length: 10 }, (_, k) => { const a = k / 10 * Math.PI * 2; return [Math.cos(a), Math.sin(a), Math.cos(a) * 0 + Math.sin(a) * 1.25 + 0.85]; }) });
    kRoundWin(K, surf, 0, 1.25, 0.5);
  }
  kLantern(K, new V3(2.0, 2.0, z), XA.clone(), kRope(K, at(2.0, z), 0, 0, 2.1, 0.12, { grounded: true }).pop());
  kCane(K, new V3(4.6, 0, z), 1.1, 0);
  kPeppermint(K, new V3(6.6, 0.75, z), XA.clone(), ZA.clone(), 0.5, null);
  kGumdrop(K, new V3(8.6, 0, z), GB.green, 0.55); kGumdrop(K, new V3(9.4, 0, z), GB.red, 0.6);
  // row 4: plinth with tiles, steps, fence, snow lumps
  z = 6.4;
  kPlinth(K, -10.8, -6.0, z - 1.8, z + 1.8, 0.5, { tiles: true });
  kSteps(K, -3.6, z - 0.6, 0.5, 1.8);
  kFence(K, new V3(-0.2, 0, z), new V3(2.6, 0, z), 3);
  const sn = piece(K, 'static'); kSnow(K, sn, new V3(5, 0, z), 1.3); kSnow(K, sn, new V3(7, 0, z), 1);
  { // small roof cap: a short double slope, turned gable-on
    const Mx = new THREE.Matrix4().makeTranslation(9.3, 0, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(-9.3, 0, -z));
    withXform(K, Mx, () => { for (const s of [1, -1]) kRoof(K, s, z - 0.8, z + 0.8, 9.3, 1.25 * Math.sin(Math.atan(tanA)) + 0.05, tanA, 1.25, { rake0: true, rake1: true, ridge: s === -1 }); });
  }
  return finish(K, scene, o, { radius: 18, cy: 1.5 });
}

/** build some modules, then turn them (about a pivot): lets the kit show a piece from its best side */
function withXform(K, Mx, fn) { const from = K.pieces.length; fn(); (K.xf ??= []).push({ from, to: K.pieces.length, M: Mx }); }
function applyXforms(K, S, G) {
  for (const { from, to, M: Mx } of K.xf ?? []) {
    const nm = new THREE.Matrix3().getNormalMatrix(Mx), v = new V3();
    for (let i = from; i < to; i++) {
      const p = K.pieces[i];
      for (const [B, s0, n] of [[S, p.s0, p.sn], [G, p.g0, p.gn]]) for (let k = s0; k < s0 + n; k++) {
        v.fromArray(B.P, k * 3).applyMatrix4(Mx).toArray(B.P, k * 3);
        v.fromArray(B.N, k * 3).applyMatrix3(nm).normalize().toArray(B.N, k * 3);
      }
      const corners = []; for (const x of [p.lo.x, p.hi.x]) for (const y of [p.lo.y, p.hi.y]) for (const z of [p.lo.z, p.hi.z]) corners.push(new V3(x, y, z).applyMatrix4(Mx));
      p.lo.set(Infinity, Infinity, Infinity); p.hi.set(-Infinity, -Infinity, -Infinity); for (const c of corners) { p.lo.min(c); p.hi.max(c); }
      p.obb.c.applyMatrix4(Mx); p.obb.ax.forEach(a => a.transformDirection(Mx)); if (p.dn) p.dn.transformDirection(Mx);
    }
  }
}

// ---- emit: run every piece's ops into the buffers, link the structure, make the meshes ------------------------
function finish(K, scene, o, info) {
  const S = new Buf(), G = new Buf(), pieces = K.pieces;
  for (const p of pieces) {
    S.cur = G.cur = p; p.s0 = S.n; p.g0 = G.n;
    for (const op of p.ops) op(S, G);
    p.sn = S.n - p.s0; p.gn = G.n - p.g0; p.ops = null;
    if (!p.sn && !p.gn) { p.hp = Infinity; p.alive = false; p.lo.set(0, 0, 0); p.hi.set(0, 0, 0); }
    if (!p.obb) {
      const c = p.lo.clone().add(p.hi).multiplyScalar(0.5), e = p.hi.clone().sub(p.lo).multiplyScalar(0.5);
      p.obb = { c, ax: [XA.clone(), YA.clone(), ZA.clone()], he: [e.x, e.y, e.z] };
    }
    p.c = p.obb.c;
  }
  S.cur = G.cur = null;
  applyXforms(K, S, G);
  // contact links between struct pieces of different surfaces (walls <-> posts <-> roof <-> gables)
  const struct = pieces.filter(p => p.struct && p.sn + p.gn > 0);
  const samples = struct.map(p => { const out = []; const { c, ax, he } = p.obb; for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const d of [-1, 0, 1]) out.push(c.clone().addScaledVector(ax[0], a * he[0]).addScaledVector(ax[1], b * he[1]).addScaledVector(ax[2], d * he[2])); return out; });
  for (let i = 0; i < struct.length; i++) for (let j = i + 1; j < struct.length; j++) {
    const a = struct[i], b = struct[j]; if (a.surf === b.surf) continue;
    const m = 0.2;
    if (a.lo.x > b.hi.x + m || b.lo.x > a.hi.x + m || a.lo.y > b.hi.y + m || b.lo.y > a.hi.y + m || a.lo.z > b.hi.z + m || b.lo.z > a.hi.z + m) continue;
    if (samples[i].some(q => obbDist(b.obb, q) < 0.12) || samples[j].some(q => obbDist(a.obb, q) < 0.12)) { if (!a.adj.includes(b)) { a.adj.push(b); b.adj.push(a); } }
  }
  for (const p of pieces) if (p.host) p.host.deps.push(p);
  const group = new THREE.Group();
  group.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0); group.rotation.y = o.ry ?? 0;
  const tris = (S.n + G.n) / 3;
  const solid = new THREE.Mesh(S.geometry(), MAT.solid); solid.castShadow = solid.receiveShadow = true;
  const glow = new THREE.Mesh(G.geometry(), MAT.glow);
  solid.name = 'gingerbread'; glow.name = 'gingerbread:glow';
  group.add(solid, glow); scene.add(group); group.updateMatrixWorld(true);
  const house = {
    group, solid, glow, pieces, struct, dying: [], info,
    inv: group.matrixWorld.clone().invert(), center: new V3(0, info.cy, 0).applyMatrix4(group.matrixWorld), radius: info.radius, tris,
  };
  solid.userData.house = glow.userData.house = house;
  DESTRUCT.houses.push(house);
  return house;
}

// =====================================================================================================
// FAR VERSION + LOD: a cheap distant house from the SAME params (one merged mesh, one draw: blocks + the same icing drape at
// low resolution, glowing windows baked in via the GLOWM mask). placeHouse() shows it; the breakable near version is built
// on demand (the camera comes inside GB.lodNear, or a shot / blast reaches it) and dropped again past GB.lodFar if untouched.
// =====================================================================================================
function assembleFar(K, o) {
  const { Gm, nx, nz, floors, t, base, H, Wt, Dt, h, A, rise, yRidge, ovz, Ls, roofY } = houseDims(o);
  const p = piece(K, 'far'), px = GB.plinthPad, e = 0.62, rt = GB.roofT, cA = Math.cos(A), sA = Math.sin(A);
  // plinth + its snow
  add(p, GEO.box, GB.stone, M(0, (base + 0.12) / 2, 0, Wt + 2 * (px + e), base + 0.12, Dt + 2 * (px + e)), { bake: 0.35, mask: 1 });
  iceDrape(K, rrPath(-Wt / 2 - px - e + 0.05, Wt / 2 + px + e - 0.05, -Dt / 2 - px - e + 0.05, Dt / 2 + px + e - 0.05, 0.4, base + 0.12, 1),
    { host: p, closed: true, w: 0.5, th: 0.12, hang: 0.1, drip: 0.12, step: 0.9, lite: true });
  // walls: one cookie block + the two gable prisms
  add(p, GEO.box, GB.cookie, M(0, base + floors * H / 2, 0, Wt - 0.04, floors * H, Dt - 0.04), { bake: 0.12, mask: 1 });
  const Fw = {
    front: frame(new V3(0, 0, Dt / 2 - t / 2), XA.clone(), YA.clone(), ZA.clone()),
    back: frame(new V3(0, 0, -(Dt / 2 - t / 2)), XA.clone().negate(), YA.clone(), ZA.clone().negate()),
    right: frame(new V3(Wt / 2 - t / 2, 0, 0), ZA.clone().negate(), YA.clone(), XA.clone()),
    left: frame(new V3(-(Wt / 2 - t / 2), 0, 0), ZA.clone(), YA.clone(), XA.clone().negate()),
  };
  for (const side of ['front', 'back']) p.ops.push(S => prism(S, [[-Wt / 2, h], [Wt / 2, h], [0, yRidge]], Fw[side], -t / 2, t / 2, { L: 1, mask: 1 }));
  // windows (baked glow), awnings, doors -- the same variant lists as the near house
  const span = { front: [Wt, nx], back: [Wt, nx], right: [Dt - 2 * t, nz], left: [Dt - 2 * t, nz] }, warm = GB.warm[0];
  for (let f = 0; f < floors; f++) {
    const V = wallsOf(nx, nz, o, f), y0 = base + f * H;
    for (const side of ['front', 'back', 'left', 'right']) {
      const [L, n] = span[side], W = L / n, Fs = Fw[side];
      V[side].forEach((v, i) => {
        const uc = -L / 2 + W * (i + 0.5);
        if (v === 'window' || v === 'lattice') {
          const yc = y0 + (GB.winY[0] + GB.winY[1]) / 2, hh = GB.winY[1] - GB.winY[0];
          add(p, GEO.box, GB.cookieLt, MF(Fs, uc, yc, t / 2, 1.5, hh + 0.3, 0.12), { bake: 0.3, mask: 1 });
          add(p, GEO.box, warm, MF(Fs, uc, yc, t / 2 + 0.06, 1.22, hh, 0.04), { mask: GLOWM, bake: 0 });
          add(p, GEO.box, GB.icing, MF(Fs, uc, y0 + GB.winY[0] - 0.08, t / 2 + 0.1, 1.6, 0.12, 0.22), { bake: 0 });
          if (v === 'window') add(p, GEO.box, o.awning ?? GB.red, MB(FP(Fs, uc, y0 + GB.winY[1] + 0.05, t / 2 + 0.3), Fs.a, Fs.b.clone().multiplyScalar(0.7).addScaledVector(Fs.n, 0.7).normalize(), Fs.n.clone().multiplyScalar(0.7).addScaledVector(Fs.b, -0.7).normalize(), 1.7, 0.7, 0.08), { bake: 0.1 });
        } else if (v === 'dark') add(p, GEO.box, '#3a2216', MF(Fs, uc, y0 + 1.0, t / 2 + 0.02, 1.2, 0.9, 0.04), { bake: 0 });
        else if (v === 'door' || v === 'arch') {
          add(p, GEO.box, o.door ?? GB.door, MF(Fs, uc, y0 + GB.doorH / 2, t / 2 + 0.02, 1.24, GB.doorH, 0.08), { bake: 0.2 });
          add(p, GEO.box, '#ffd27a', MF(Fs, uc, y0 + GB.doorH * 0.68, t / 2 + 0.08, 0.3, 0.3, 0.04), { mask: GLOWM, bake: 0 });
          add(p, GEO.lump, GB.icing, MF(Fs, uc, y0 + GB.doorH + 0.25, t / 2 + 0.12, 1.9, 0.3, 0.3), { bake: 0 });
        }
      });
    }
  }
  const R = clamp(rise * 0.15, 0.38, 0.55);
  add(p, GEO.dot, '#ffd08a', MB(FP(Fw.front, 0, h + rise * 0.36, t / 2 + 0.03), XA, YA, ZA, R * 1.9, R * 1.9, 0.08), { mask: GLOWM, bake: 0 });
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addTube(p, [new V3(sx * (Wt / 2 - 0.05), base, sz * (Dt / 2 - 0.05)), new V3(sx * (Wt / 2 - 0.05), h + 0.1, sz * (Dt / 2 - 0.05))], { r: GB.postR, sides: 6, col: GB.cookieLt, mask: 1 });
  // roof slabs + the same drape (low res)
  for (const s of [1, -1]) {
    const Fr = frame(new V3(0, yRidge, 0), ZA.clone(), new V3(s * cA, -sA, 0), new V3(s * sA, cA, 0));
    add(p, GEO.box, GB.shingle, MB(FP(Fr, 0, Ls / 2, rt / 2 + 0.04), Fr.a, Fr.b, Fr.n, Dt + 2 * ovz, Ls, rt + 0.08), { bake: 0.3, mask: 0.75 });
    roofIce(K, [{ F: Fr, u0: -1e9, u1: 1e9, find: () => p }], s, -Dt / 2 - ovz, Dt / 2 + ovz, Ls, { rake0: true, rake1: true, ridge: s === -1, far: true });
  }
  if (o.dormer ?? true) {
    const ds = o.dormerSide ?? -1, zc = Dt / 2 - Gm / 2, xf = ds * (Wt / 2 - 0.5), y = roofY(xf);
    add(p, GEO.box, GB.cookie, M(xf - ds * 0.55, y + 0.5, zc, 1.1, 1.6, 1.6), { bake: 0.2, mask: 1 });
    add(p, GEO.box, '#ffcf80', M(xf + ds * 0.01, y + 0.55, zc, 0.05, 0.7, 0.55), { mask: GLOWM, bake: 0 });
    add(p, GEO.lump, GB.icing, M(xf - ds * 0.5, y + 1.42, zc, 1.3, 0.5, 2.1), { bake: 0 });
  }
  if (o.chimney !== 0 && o.chimney !== false) {
    const cs = o.chimney ?? -1, z = -Dt / 2 + Gm * 0.5, x = cs * Wt * 0.22, hw = GB.chimneyHW, yb = roofY(Math.abs(x) + hw) - 0.25, yt = yRidge + 0.85;
    add(p, GEO.box, GB.cookie, M(x, (yb + yt) / 2, z, hw * 2, yt - yb, hw * 2), { bake: 0.3, mask: 1 });
    add(p, GEO.box, GB.red, M(x, yt - 0.72, z, hw * 2 + 0.12, 0.34, hw * 2 + 0.12), { bake: 0.1 });
    add(p, GEO.lump, GB.icing, M(x, yt + 0.22, z, hw * 2 + 0.4, 0.5, hw * 2 + 0.4), { bake: 0 });
  }
  add(p, GEO.ball, GB.red, M(0, yRidge + 0.62, Dt / 2 + ovz - 0.02, 0.92, 0.92, 0.4), { bake: 0 });
  return p;
}
/** the far mesh on its own (one draw) */
export function buildFarHouse(o = {}) {
  const K = newCtx(o.seed ?? 1); assembleFar(K, o);
  const S = new Buf();
  for (const q of K.pieces) for (const op of q.ops) op(S, S);
  const tris = S.n / 3, mesh = new THREE.Mesh(S.geometry(), MAT.solid);
  mesh.name = 'gingerbread:far'; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.tris = tris;
  mesh.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0); mesh.rotation.y = o.ry ?? 0;
  return mesh;
}
/** a house that lives as its far version until it is needed close up. -> entry {o, far, near, center, radius} */
export function placeHouse(scene, o = {}) {
  init(scene);
  const far = buildFarHouse(o); scene.add(far); far.updateMatrixWorld(true);
  const d = houseDims(o), e = { o, far, near: null, center: new V3(0, d.cy, 0).applyMatrix4(far.matrixWorld), radius: d.radius, farTris: far.userData.tris };
  far.userData.lod = e; DESTRUCT.lods.push(e);
  return e;
}
function ensureNear(e) {
  if (!e.near) {
    e.near = buildBreakableHouse(DESTRUCT.scene, e.o); e.near.lod = e; e.far.visible = false;
    DESTRUCT.onNear?.(e.near, e);
  }
  return e.near;
}
function dropNear(e) {
  const H = e.near; if (!H || H.damaged) return;          // a house you have shot stays breakable
  DESTRUCT.onFar?.(H, e);
  H.group.removeFromParent(); H.solid.geometry.dispose(); H.glow.geometry.dispose();
  DESTRUCT.houses.splice(DESTRUCT.houses.indexOf(H), 1);
  e.near = null; e.far.visible = true;
}
const _cp = new V3();
/** swap by distance from the camera; DESTRUCT.lodForce = 'near' | 'far' | null pins one for checks */
function lodUpdate(camera) {
  camera.getWorldPosition(_cp);
  for (const e of DESTRUCT.lods) {
    const f = DESTRUCT.lodForce, d = _cp.distanceTo(e.center);
    if (f === 'near' || (!f && d < GB.lodNear)) ensureNear(e);
    else if (!f && d > GB.lodFar) dropNear(e);
    if (e.near) { e.near.group.visible = f !== 'far'; e.far.visible = f === 'far'; } else e.far.visible = true;
  }
}

// oriented box distance
const _d = new V3();
function obbDist(o, p) {
  _d.subVectors(p, o.c); let s = 0;
  for (let i = 0; i < 3; i++) { const e = Math.abs(_d.dot(o.ax[i])) - o.he[i]; if (e > 0) s += e * e; }
  return Math.sqrt(s);
}

// ---- the registry ---------------------------------------------------------------------------------------
export const DESTRUCT = {
  houses: [], lods: [], scene: null, debris: null, parts: null, ground: () => 0, _t: 0, _crunchT: -1, _debT: -1,
  lodForce: null, onNear: null, onFar: null,
  hitAt, raycast, update, clear, stats, burst, ensureNear, lodUpdate,
};
function init(scene) {
  if (DESTRUCT.scene === scene && DESTRUCT.debris) return;
  DESTRUCT.scene = scene;
  DESTRUCT.debris = makeDebris(scene);
  DESTRUCT.parts = makeParticles(scene);
}

// ---- hits ------------------------------------------------------------------------------------------------
const _lp = new V3(), _ld = new V3();
const rv = (k) => new V3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
/** point (world), radius m, power (bullet 1, blast ~30); o.dir = travel direction of the shot (world) */
function hitAt(point, radius, power = 1, o = {}) {
  let touched = 0, killed = 0; const blast = radius > 1;
  let hitCol = null, best = Infinity;
  for (const e of DESTRUCT.lods) if (!e.near && point.distanceTo(e.center) < e.radius + radius) ensureNear(e);
  for (const H of DESTRUCT.houses) {
    if (point.distanceTo(H.center) > H.radius + radius) continue;
    _lp.copy(point).applyMatrix4(H.inv);
    if (o.dir) _ld.copy(o.dir).transformDirection(H.inv); else _ld.set(0, 0, 0);
    for (const p of H.pieces) {
      if (!p.alive || p.hp === Infinity) continue;
      const dd = obbDist(p.obb, _lp); if (dd > radius) continue;
      touched++; H.damaged = true;
      if (dd < best) { best = dd; hitCol = p.col; }
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
  if (touched) {
    const c = hitCol || new THREE.Color(GB.cookie);
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

// cascade (hosted decor goes with its host; struct pieces cut off from the ground fall), then debris + collapse
function settle(H) {
  let i = 0;
  for (;;) {
    let structDied = false;
    for (; i < H.dying.length; i++) {
      const { p, v } = H.dying[i]; if (p.struct) structDied = true;
      for (const q of p.deps) if (q.alive) kill(H, q, v.clone().multiplyScalar(0.7).add(rv(1)), q.kind === 'chimney' ? rv(2) : null);
    }
    if (!structDied) break;
    const seen = new Set(), st = [];
    for (const p of H.struct) if (p.alive && p.grounded) { seen.add(p); st.push(p); }
    while (st.length) { const p = st.pop(); for (const q of p.adj) if (q.alive && !seen.has(q)) { seen.add(q); st.push(q); } }
    let any = false;
    for (const p of H.struct) if (p.alive && !seen.has(p)) { kill(H, p, rv(0.8), rv(1.6)); any = true; }
    if (!any) break;
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
// a bitten chunk dents in (its crumb seams show like cracks) and darkens; other pieces just darken
function bite(H, p) {
  p.bites = (p.bites || 0) + 1; if (p.bites > 3) return;
  const dn = p.dn, dk = 0.035;
  forRanges(H, p, (g, s0, n) => {
    const P = g.attributes.position, C = g.attributes.color, a = P.array, cc = C.array, c = p.c;
    for (let i = s0; i < s0 + n; i++) {
      if (dn && (a[i * 3] - c.x) * dn.x + (a[i * 3 + 1] - c.y) * dn.y + (a[i * 3 + 2] - c.z) * dn.z > 0) {
        a[i * 3] -= dn.x * dk; a[i * 3 + 1] -= dn.y * dk; a[i * 3 + 2] -= dn.z * dk;
      }
      cc[i * 4] *= 0.9; cc[i * 4 + 1] *= 0.87; cc[i * 4 + 2] *= 0.86;
    }
    P.addUpdateRange(s0 * 3, n * 3); P.needsUpdate = true; C.addUpdateRange(s0 * 4, n * 4); C.needsUpdate = true;
  });
}

const _ray = [];
function raycast(raycaster, again = true) {
  _ray.length = 0;
  for (const H of DESTRUCT.houses) if (H.group.visible) _ray.push(H.solid, H.glow);
  for (const e of DESTRUCT.lods) if (!e.near || !e.near.group.visible) _ray.push(e.far);
  const hits = raycaster.intersectObjects(_ray, false);
  const lod = hits[0]?.object.userData.lod;
  if (lod && again) { ensureNear(lod); if (DESTRUCT.lodForce !== 'far') return raycast(raycaster, false); }
  return hits.length ? { point: hits[0].point, house: hits[0].object.userData.house, distance: hits[0].distance, normal: hits[0].face?.normal } : null;
}

// ---- DEBRIS: one dynamic mesh; each item owns a vertex range, moved on the CPU, then left as rubble --------
function makeDebris(scene) {
  const cap = GB.debrisVerts;
  const P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), C = new Float32Array(cap * 4);
  const g = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage), aN = new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage), aC = new THREE.BufferAttribute(C, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aP); g.setAttribute('normal', aN); g.setAttribute('color', aC); g.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(g, MAT.solid); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'gingerbread:debris';
  scene.add(mesh);
  let cursor = 0, high = 0; const items = [];
  const dq = new THREE.Quaternion(), tmp = new V3(), wv = new V3();

  function write(it) {
    const L = it.local, LN = it.ln, o = it.o, n = it.n, q = it.q, e = it.p;
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
      const Mw = H.group.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(Mw);
      const centre = p.c.clone().applyMatrix4(Mw);
      const local = new Float32Array(n * 3), ln = new Float32Array(n * 3);
      let j = 0;
      const big = p.kind === 'chimney';
      const shrink = big ? 1 : GB.shrink;
      forRanges(H, p, (sg, s0, cnt) => {
        const sp = sg.attributes.position.array, sn = sg.attributes.normal.array, sc = sg.attributes.color.array, glowy = sg === H.glow.geometry;
        for (let i = s0; i < s0 + cnt; i++, j++) {
          tmp.set(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]).applyMatrix4(Mw).sub(centre).multiplyScalar(shrink);
          local[j * 3] = tmp.x; local[j * 3 + 1] = tmp.y; local[j * 3 + 2] = tmp.z;
          tmp.set(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]).applyMatrix3(nm).normalize();
          ln[j * 3] = tmp.x; ln[j * 3 + 1] = tmp.y; ln[j * 3 + 2] = tmp.z;
          const k = glowy ? 1.15 : 1;      // glass shards keep a warm candy colour
          C[(o + j) * 4] = sc[i * 4] * k; C[(o + j) * 4 + 1] = sc[i * 4 + 1] * k; C[(o + j) * 4 + 2] = sc[i * 4 + 2] * k; C[(o + j) * 4 + 3] = sc[i * 4 + 3];
        }
      });
      aC.addUpdateRange(o * 4, n * 4); aC.needsUpdate = true;
      const flat = big ? new V3(1, 0, 0).transformDirection(Mw) : null;     // the chimney topples onto its side
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
        const slam = excess > 0 && !it.big; if (slam) { excess--; it.v.set(0, -30, 0); it.w.multiplyScalar(0.2); }
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
          if (it.flat) {
            const ax = wv.copy(it.flat).applyQuaternion(it.q), up = ax.y >= 0 ? 1 : -1;
            it.w.addScaledVector(new V3(-ax.z * up, 0, ax.x * up), 14 * dt);
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
    if (kind === 'crumb') { _bc.copy(o.color || _bc.set(GB.cookie)).multiplyScalar(0.8 + Math.random() * 0.4); P.spawn(point, _bv, _bc, 1, 0.05 + Math.random() * 0.08, 1.2 + Math.random(), GB.gravity, 0.6, 0); }
    else if (kind === 'chip') { _bc.set(Math.random() < 0.8 ? GB.icing : GB.candy[i % GB.candy.length]); P.spawn(point, _bv, _bc, 1, 0.05 + Math.random() * 0.06, 1 + Math.random(), GB.gravity, 0.8, 0); }
    else if (kind === 'dust') { _bc.set('#eadbc8'); _bv.multiplyScalar(0.5).y += 0.6; P.spawn(point, _bv, _bc, 0.5, 0.5 + Math.random() * 0.5, 0.9 + Math.random() * 0.7, -0.3, 2.2, 1.6 + Math.random()); }
    else if (kind === 'snow') { _bc.set('#ffffff'); P.spawn(point, _bv, _bc, 0.85, 0.07 + Math.random() * 0.08, 0.7 + Math.random() * 0.5, GB.gravity * 0.6, 1.5, 0); }
    else if (kind === 'ember') { _bc.setRGB(3.2, 1.4 + Math.random(), 0.35); P.spawn(point, _bv.multiplyScalar(1.2), _bc, 1, 0.08 + Math.random() * 0.08, 0.6 + Math.random() * 0.8, GB.gravity * 0.35, 1.2, 0); }
  }
}

function update(dt, camera) {
  DESTRUCT._t += dt;
  if (camera && DESTRUCT.lods.length) lodUpdate(camera);
  DESTRUCT.debris?.update(dt);
  DESTRUCT.parts?.update(dt);
}
function clear() {
  for (const H of DESTRUCT.houses) { H.group.removeFromParent(); H.solid.geometry.dispose(); H.glow.geometry.dispose(); }
  DESTRUCT.houses.length = 0;
  for (const e of DESTRUCT.lods) { e.far.removeFromParent(); e.far.geometry.dispose(); }
  DESTRUCT.lods.length = 0;
  DESTRUCT.debris?.clear(); DESTRUCT.parts?.clear();
}
function stats() {
  let alive = 0, total = 0, tris = 0;
  for (const H of DESTRUCT.houses) { tris += H.tris; for (const p of H.pieces) { if (p.hp === Infinity) continue; total++; if (p.alive) alive++; } }
  return { houses: DESTRUCT.houses.length, lods: DESTRUCT.lods.length, far: DESTRUCT.lods.filter(e => !e.near).length, alive, total, tris, debris: DESTRUCT.debris?.count() || 0, moving: DESTRUCT.debris?.moving() || 0,
    perHouse: DESTRUCT.houses.map(H => Math.round(H.tris)) };
}
