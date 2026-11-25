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
// b44 DETAIL PASS (his ok: "yeah that sounds good"): one shared canvas ATLAS painted in metres per surface layout (front /
// back / side wall, gable, roof; one region per house size, ~56 px/m) -- piped icing swirls, snowflakes, drapes, dots,
// a round amber medallion in the gable, glossy chocolate shingle rows with sugar + candies on the roof, dough speckle on
// the cookie. Each slab's (u, y) maps linearly into its region, so a pattern is CUT across chunks and breaks with them.
// Vertex colour on the fronts is now a TINT over the painted cookie (per-chunk bake variation, a few toasted ones); seam
// edges are GROOVED (the front inset TOWN.groove, sides slope back to the flush back -- a dark crack lip, crumb deeper in),
// zero extra triangles. Everything that is not a painted front samples a white texel, so it keeps its vertex colour.
// b48 (his ok on both): ROOF COURSES IN GEOMETRY -- roof chunk fronts are stepped at the painted row lines (each course's lower
// edge `TOWN.shingle.step` proud, a riser under it, sides follow the sawtooth), ~+580 tris a house. ATLAS: regions are packed
// tallest-first at finish() and shared per layout (side per D, gable per W, roof per W x D), ppm 56 -> 44: 1024 x 2048 (and
// overflowing -- the last house size painted off the canvas) -> 1024 x 1024, ~10.7 -> ~5.3 MB GPU with mips.
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
  hp: 1.5, hpArea: 1.0,                // chunk hp = hp + hpArea * area (m2): b86 (his: "it takes so much to take a house down") 5 + 2.2a -> 1.5 + 1a,
                                       // a 1.6 m2 wall chunk = 3.1 hp, a 3.4 m2 roof chunk = 4.9
  bullet: { dmg: 2, splash: 1.1, splashDmg: 1.2, push: 15, crumbs: 5 },   // b86 a Gatling round: dmg on the chunk it hits + splashDmg (falling off
                                       // to 30 % at `splash` m) on every chunk round it, so holding the trigger carves a hole; push = m/s the pieces fly
  collapseAt: 0.55,                    // b86 THE CAVE-IN: a house whose wall chunks drop under this share comes down whole (roof caves, walls topple)
  span: 2,                             // a chunk can hang sideways this many chunks off one held from below
  debrisMax: 700, crumbMax: 360, debrisLife: 9, gravity: 20,   // b86 one InstancedMesh: debrisMax chunk pieces + crumbMax impact crumbs;
                                       // settled rubble sinks away debrisLife s after it stops (recycled)
  door: [1.2, 2.0], win: [1.2, 2.0, 3.0],   // door w x h; window w, y0, y1
  ppm: 44, groove: 0.035, toast: 0.12,  // atlas px a metre (b48: 56 -> 44, the packed atlas fits 1024 x 1024); crack groove inset (m); share of toasted chunks
  shingle: { y0: 0.1, rh: 0.5, step: 0.045, tilt: 0.3 },   // b48 roof courses in GEOMETRY: row lines at y0 + j*rh up the slope (= the painted rows),
                                       // each course's lower edge sits `step` proud of the one below; tilt = extra normal lean for the read
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

// ---- the painted ICING ATLAS (b44): regions painted in metres (y up), sampled by the slab fronts ------------------------
const ICE = '#f2e8de', ICE_SH = 'rgba(70,30,10,0.42)', CANDY = '#d42a36';
const AT = { W: 1024, pad: 5, list: [], keys: new Map() };
const WHITE = [-1, 0, 0];   // uv entries are [region id, local px u, local px v]; -1 = the white block (vertex colour only)
/** b47: regions are only REGISTERED while houses build (local metres 0..w x 0..h, y up) and packed + painted in finish(),
 *  tallest first, so the atlas is as small as the paint allows. One region per distinct layout (front / back per W x top,
 *  side per D x top, gable per W, roof per W x D). */
function region(key, w, h, paint) {
  let r = AT.keys.get(key); if (r) return r;
  r = { id: AT.list.length, key, w, h, paint, ox: 0, oy: 0 }; AT.list.push(r); AT.keys.set(key, r);
  return r;
}
/** shelf-pack + paint every region; returns the canvas (width AT.W, height = what was used, a multiple of 16) */
function paintAtlas() {
  const ppm = TOWN.ppm, p = AT.pad, W = AT.W;
  const rs = AT.list.map(r => ({ r, w: Math.ceil(r.w * ppm) + 2 * p, h: Math.ceil(r.h * ppm) + 2 * p })).sort((a, b) => b.h - a.h);
  let x = 16, y = 0, rowH = 16;
  for (const e of rs) {
    if (x + e.w > W) { y += rowH; x = 0; rowH = 0; }
    e.x = x; e.y = y; e.r.ox = x + p; e.r.oy = y + e.h - p;   // canvas px of local (0, 0)
    x += e.w; rowH = Math.max(rowH, e.h);
  }
  const H = Math.max(16, Math.ceil((y + rowH) / 16) * 16);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16);
  for (const e of rs) {
    const r = e.r; g.save(); g.beginPath(); g.rect(e.x, e.y, e.w, e.h); g.clip();
    g.setTransform(ppm, 0, 0, -ppm, r.ox, r.oy);
    r.paint(g, -p / ppm, r.w + p / ppm, -p / ppm, r.h + p / ppm);
    g.restore();
  }
  AT.size = [W, H];
  return cv;
}
/** a piped line: shadow under, icing, a thin highlight on top */
function iced(g, path, w) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(0.012, -0.02); g.strokeStyle = ICE_SH; g.lineWidth = w * 1.25; g.beginPath(); path(g); g.stroke(); g.restore();
  g.strokeStyle = ICE; g.lineWidth = w; g.beginPath(); path(g); g.stroke();
  g.save(); g.translate(-w * 0.12, w * 0.16); g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.4; g.beginPath(); path(g); g.stroke(); g.restore();
}
function blob(g, x, y, r, col = ICE) {
  g.fillStyle = ICE_SH; g.beginPath(); g.arc(x + r * 0.2, y - r * 0.35, r * 1.08, 0, 7); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x - r * 0.3, y + r * 0.32, r * 0.36, 0, 7); g.fill();
}
function flake(g, x, y, r) {
  iced(g, g2 => {
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      g2.moveTo(x, y); g2.lineTo(x + ca * r, y + sa * r);
      for (const t of [0.5, 0.78]) {
        const bx = x + ca * r * t, by = y + sa * r * t, l = r * (t < 0.6 ? 0.3 : 0.2);
        for (const s of [-1, 1]) { const b = a + s * 0.8; g2.moveTo(bx, by); g2.lineTo(bx + Math.cos(b) * l, by + Math.sin(b) * l); }
      }
    }
  }, r * 0.11);
  blob(g, x, y, r * 0.14);
}
/** a curl from its outer end inward; dir -1 + rot PI = the mirror image */
function swirl(g, x, y, r, dir = 1, rot = 0) {
  iced(g, g2 => { for (let i = 0; i <= 48; i++) { const t = i / 48, a = rot + dir * t * Math.PI * 2.4, q = r * (1 - t * 0.82); const px = x + Math.cos(a) * q, py = y + Math.sin(a) * q; i ? g2.lineTo(px, py) : g2.moveTo(px, py); } }, r * 0.17);
  blob(g, x + Math.cos(rot) * r, y + Math.sin(rot) * r, r * 0.13);
}
/** hanging scallops along a line, dots at the joints */
function drape(g, u0, u1, y, amp, per) {
  const n = Math.max(1, Math.round((u1 - u0) / per)), p = (u1 - u0) / n;
  iced(g, g2 => { for (let i = 0; i < n; i++) { const cx = u0 + p * (i + 0.5); g2.moveTo(cx - p / 2, y); g2.ellipse(cx, y, p / 2, amp, 0, Math.PI, Math.PI * 2); } }, 0.055);
  for (let i = 0; i <= n; i++) blob(g, u0 + p * i, y, 0.05, i % 3 === 1 ? CANDY : ICE);
}
function fleur(g, x, y, s) {
  iced(g, g2 => { g2.moveTo(x, y + s * 0.25); g2.lineTo(x, y - s * 0.4); }, s * 0.12);
  blob(g, x, y + s * 0.5, s * 0.18); blob(g, x - s * 0.36, y + s * 0.12, s * 0.14); blob(g, x + s * 0.36, y + s * 0.12, s * 0.14);
}
function dough(g, U0, U1, Y0, Y1, hex) {
  g.fillStyle = hex; g.fillRect(U0, Y0, U1 - U0, Y1 - Y0);
  const A = (U1 - U0) * (Y1 - Y0), R = Math.random;
  for (let i = 0; i < A * 12; i++) {
    const x = U0 + R() * (U1 - U0), y = Y0 + R() * (Y1 - Y0), r = 0.15 + R() * 0.35, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < 0.55 ? 'rgba(120,55,20,0.13)' : 'rgba(255,215,160,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < A * 150; i++) {
    g.fillStyle = R() < 0.6 ? 'rgba(90,38,12,0.28)' : 'rgba(255,232,195,0.32)';
    g.beginPath(); g.arc(U0 + R() * (U1 - U0), Y0 + R() * (Y1 - Y0), 0.006 + R() * 0.01, 0, 7); g.fill();
  }
}
/** a wall panel: drape under the top, dots along the base, sill scallops, flakes / swirls / fleurs in the free bays */
function paintWall(g, U0, U1, Y0, Y1, L) {
  const { len, top, wins, door, ww, wy0, wy1, dw, dh } = L;
  dough(g, U0, U1, Y0, Y1, TOWN.cookie[0]);
  drape(g, 0.05, len - 0.05, top - 0.1, 0.15, 0.5);
  const skip = u => door != null && Math.abs(u - door) < dw / 2 + 0.12;
  for (let u = 0.2; u < len - 0.1; u += 0.3) if (!skip(u)) blob(g, u, 0.32, 0.045);
  for (const cu of wins) {
    drape(g, cu - ww / 2 - 0.12, cu + ww / 2 + 0.12, wy0 - 0.12, 0.09, 0.3);
    if (top - 0.3 - wy1 > 0.55) { swirl(g, cu - 0.28, wy1 + 0.32, 0.18, 1, 0); swirl(g, cu + 0.28, wy1 + 0.32, 0.18, -1, Math.PI); }
  }
  if (door != null) {
    for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; blob(g, door + Math.cos(a) * (dw / 2 + 0.22), dh + 0.08 + Math.sin(a) * 0.5, 0.05, i === 4 ? CANDY : ICE); }
    if (top - 0.3 - dh > 1.0) fleur(g, door, dh + 0.85, 0.32);
  }
  // free bays: between the holes (and the wall ends)
  const holes = [...wins.map(c => [c - ww / 2, c + ww / 2]), ...(door != null ? [[door - dw / 2, door + dw / 2]] : [])].sort((a, b) => a[0] - b[0]);
  const bays = []; let at = 0;
  for (const [a, b] of holes) { bays.push([at, a]); at = b; }
  bays.push([at, len]);
  bays.forEach(([a, b], i) => {
    const w = b - a, cx = (a + b) / 2; if (w < 0.5) return;
    const end = i === 0 || i === bays.length - 1, r = Math.min(end ? 0.27 : 0.42, w * 0.36);
    if (!end && door == null && w > 1.8) { flake(g, cx, (wy0 + wy1) / 2, Math.min(0.55, w * 0.25)); fleur(g, cx - w * 0.33, 2.6, 0.24); fleur(g, cx + w * 0.33, 2.6, 0.24); }
    else if (!end) { flake(g, cx, 1.55, r); if (top - 0.35 > 2.75) blob(g, cx, 2.55, 0.07, CANDY); }
    else {
      const mir = i === 0 ? 1 : -1;
      swirl(g, cx, Math.min(2.4, top - 0.75), r, mir, mir > 0 ? 0 : Math.PI);
      fleur(g, cx, 1.35, Math.min(0.26, w * 0.3));
    }
  });
}
/** a gable: dots under the rakes, the round amber medallion with an iced cross, swirls either side */
function paintGable(g, U0, U1, Y0, Y1, L) {
  const { W, top, yU0, k } = L, hgt = yU0 - top, cx = W / 2, under = u => yU0 - k * Math.abs(u - cx);
  dough(g, U0, U1, Y0, Y1, TOWN.cookie[0]);
  for (let u = 0.35; u < W - 0.3; u += 0.3) { const y = under(u) - 0.32; if (y > top + 0.3) blob(g, u, y, 0.045, Math.round(u / 0.3) % 4 === 0 ? CANDY : ICE); }
  for (let u = 0.4; u < W - 0.3; u += 0.34) if (under(u) - 0.35 > top + 0.22) blob(g, u, top + 0.22, 0.04);
  const my = top + hgt * 0.45, R = Math.min(0.55, hgt * 0.2);
  const gr = g.createRadialGradient(cx, my, 0, cx, my, R); gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(0.7, '#f0a842'); gr.addColorStop(1, '#b8641e');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, my, R, 0, 7); g.fill();
  iced(g, g2 => { g2.moveTo(cx - R, my); g2.lineTo(cx + R, my); g2.moveTo(cx, my - R); g2.lineTo(cx, my + R); }, 0.06);
  iced(g, g2 => g2.arc(cx, my, R, 0, Math.PI * 2), 0.1);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; blob(g, cx + Math.cos(a) * (R + 0.17), my + Math.sin(a) * (R + 0.17), 0.035); }
  if (my + R + 0.55 < yU0 - 0.25) fleur(g, cx, my + R + 0.42, 0.24);
  for (const s of [-1, 1]) {
    const x = cx + s * (R + 0.62), y = top + hgt * 0.3;
    if (y + 0.3 < under(x) - 0.25) swirl(g, x, y, 0.26, -s, s < 0 ? Math.PI : 0);
  }
}
/** a roof slab: overlapping scalloped chocolate shingles (glossy lip, sugar, a few candies), frosting along the eave */
function paintRoof(g, U0, U1, Y0, Y1, len) {
  g.fillStyle = '#4e2612'; g.fillRect(U0, Y0, U1 - U0, Y1 - Y0);
  const rh = TOWN.shingle.rh, per = 0.56, rows = Math.ceil(len / rh) + 1, R = Math.random;
  for (let j = rows; j >= 0; j--) {
    const yb = TOWN.shingle.y0 + j * rh, off = (j % 2) * per / 2, ry = rh * 0.62, tp = yb + rh * 1.45;
    for (let cx = U0 - per + off; cx < U1 + per; cx += per) {
      const sh = 0.92 + R() * 0.16, gr = g.createLinearGradient(0, yb, 0, tp);
      gr.addColorStop(0, `rgb(${168 * sh | 0},${101 * sh | 0},${59 * sh | 0})`); gr.addColorStop(0.3, `rgb(${138 * sh | 0},${76 * sh | 0},${42 * sh | 0})`); gr.addColorStop(1, '#4a2410');
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - per / 2, tp); g.lineTo(cx - per / 2, yb + ry); g.ellipse(cx, yb + ry, per / 2, ry, 0, Math.PI, Math.PI * 2); g.lineTo(cx + per / 2, tp); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(38,14,5,0.75)'; g.lineWidth = 0.03; g.beginPath(); g.ellipse(cx, yb + ry, per / 2, ry, 0, Math.PI, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,236,214,0.55)'; g.lineWidth = 0.032; g.beginPath(); g.ellipse(cx, yb + ry, per / 2 * 0.72, ry * 0.72, 0, Math.PI * 1.12, Math.PI * 1.45); g.stroke();
      g.fillStyle = 'rgba(255,242,228,0.6)'; g.beginPath(); g.arc(cx - per * 0.17, yb + ry * 0.5, 0.026, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,250,244,0.7)';
      for (let s = 0; s < 4; s++) { g.beginPath(); g.arc(cx + (R() - 0.5) * per * 0.8, yb + R() * rh, 0.008 + R() * 0.008, 0, 7); g.fill(); }
      if (R() < 0.06) blob(g, cx, yb + ry * 1.15, 0.065, CANDY);
    }
  }
  // frosting along the eave (the cap tube + drips sit on it)
  const wave = u => 0.24 + 0.05 * Math.sin(u * 7.3) + 0.03 * Math.sin(u * 17.1 + 1);
  const band = g2 => { g2.moveTo(U0, Y0); for (let u = U0; u <= U1 + 0.05; u += 0.05) g2.lineTo(u, wave(u)); g2.lineTo(U1, Y0); g2.closePath(); };
  g.save(); g.translate(0.01, -0.03); g.fillStyle = ICE_SH; g.beginPath(); band(g); g.fill(); g.restore();
  g.fillStyle = ICE; g.beginPath(); band(g); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.025; g.beginPath(); for (let u = U0; u <= U1; u += 0.05) { const y = wave(u) - 0.035; u === U0 ? g.moveTo(u, y) : g.lineTo(u, y); } g.stroke();
  // the ridge: a sugar band under the cap
  g.fillStyle = ICE; g.fillRect(U0, len - 0.22, U1 - U0, Y1 - len + 0.22);
}
/** a polygon (CCW) with each edge k pulled in by d[k] (the crack grooves); outline edges (d 0) stay put */
function insetPoly(poly, d) {
  const n = poly.length, N = poly.map((A, k) => { const B = poly[(k + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], l = Math.hypot(ex, ey) || 1; return [-ey / l, ex / l]; });
  return poly.map((P, k) => {
    const kp = (k - 1 + n) % n, n1 = N[kp], n2 = N[k], d1 = d[kp], d2 = d[k];
    if (!d1 && !d2) return P;
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    let x, y;
    if (Math.abs(det) < 0.25) { const m = Math.max(d1, d2), ax = n1[0] + n2[0], ay = n1[1] + n2[1], l = Math.hypot(ax, ay) || 1; x = ax / l * m; y = ay / l * m; }
    else { x = (d1 * n2[1] - d2 * n1[1]) / det; y = (n1[0] * d2 - n2[0] * d1) / det; }
    const L = Math.hypot(x, y), mx = 2.2 * Math.max(d1, d2); if (L > mx) { x *= mx / L; y *= mx / L; }
    return [P[0] + x, P[1] + y];
  });
}

export function makeTown(scene) {
  Object.assign(AT, { list: [], keys: new Map() });   // a fresh atlas per town
  const chunks = [];       // { h, S, kind, poly, bb, i0, i1, v0, vb, v1, hp, alive, col, lmin, lmax, band, top, ground, up, side, rest }
  const houses = [];
  let built = false, mesh, debrisMesh, wallProxy, roofProxy;
  const G = { pos: [], nrm: [], col: [], uv: [], idx: [] };   // uv: 3 a vertex (region id, local px) until finish()
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const V3 = THREE.Vector3;
  const icingC = new THREE.Color(TOWN.icing), crumbC = new THREE.Color(TOWN.crumb);

  // ---- emission (house-local points -> world, straight into the merged arrays) --------------------------------------
  let curH = null, curQ = null;
  const _v = new V3(), _n = new V3();
  function vert(p, n, c, uv = WHITE) {
    const i = G.pos.length / 3;
    _v.copy(p).applyMatrix4(curH); G.pos.push(_v.x, _v.y, _v.z);
    _n.copy(n).applyQuaternion(curQ).normalize(); G.nrm.push(_n.x, _n.y, _n.z);
    G.col.push(c.r, c.g, c.b); G.uv.push(uv[0], uv[1], uv[2]);
    return i;
  }
  const tri = (a, b, c) => G.idx.push(a, b, c);
  const FP = (S, u, y, v) => S.O.clone().addScaledVector(S.A, u).addScaledVector(S.B, y).addScaledVector(S.N, v);

  /** one chunk: the polygon (CCW in u, y) extruded through the slab; front fan bulged into a baked pillow, painted from the
   *  surface's atlas region (vertex colour = a tint over the painted cookie); seam edges grooved (front inset, sides slope) */
  function prism(S, poly, col, inner) {
    const h = S.T / 2, n = poly.length, [cu, cy] = centroid(poly), R = S.uvr, ppm = TOWN.ppm;
    const tint = R ? new THREE.Color(col.r / S.base.r, col.g / S.base.g, col.b / S.base.b) : col;
    const cf = tint.clone().multiplyScalar(1.08), cr = tint.clone().multiplyScalar(0.78), cb = col.clone().multiplyScalar(0.6);
    const ci = crumbC.clone().multiply(new THREE.Color(1, 1, 1).lerp(col, 0.25)), ce = col.clone().multiplyScalar(0.82), ck = col.clone().multiplyScalar(0.4);
    const uv = (u, y) => R ? [R.R.id, (u - R.u0) * ppm, (y - R.y0) * ppm] : WHITE;
    const ip = insetPoly(poly, inner.map(s => s ? TOWN.groove : 0));
    if (S.rows) return shingled(S, poly, ip, inner, { cf, cr, cb, ce, ck, ci }, uv);
    // front
    const c0 = vert(FP(S, cu, cy, h + TOWN.bulge), S.N, cf, uv(cu, cy)), rim = [];
    for (const [u, y] of ip) {
      const rad = S.A.clone().multiplyScalar(u - cu).addScaledVector(S.B, y - cy).normalize();
      rim.push(vert(FP(S, u, y, h), S.N.clone().addScaledVector(rad, 0.45), cr, uv(u, y)));
    }
    for (let k = 0; k < n; k++) tri(c0, rim[k], rim[(k + 1) % n]);
    // back (fan from vertex 0, reversed)
    const bk = poly.map(([u, y]) => vert(FP(S, u, y, -h), S.N.clone().negate(), cb));
    for (let k = 1; k < n - 1; k++) tri(bk[0], bk[k + 1], bk[k]);
    // sides: from the (inset) front to the flush back; a seam = a dark crack lip over crumb (shows once the neighbour is gone)
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, [u0, y0] = poly[k], [u1, y1] = poly[k1], o = S.A.clone().multiplyScalar(y1 - y0).addScaledVector(S.B, -(u1 - u0)).normalize();
      if (inner[k]) o.addScaledVector(S.N, TOWN.groove / S.T).normalize();
      const cF = inner[k] ? ck : ce, cB = inner[k] ? ci : ce;
      const f0 = vert(FP(S, ip[k][0], ip[k][1], h), o, cF), f1 = vert(FP(S, ip[k1][0], ip[k1][1], h), o, cF), b0 = vert(FP(S, u0, y0, -h), o, cB), b1 = vert(FP(S, u1, y1, -h), o, cB);
      tri(f0, b0, b1); tri(f0, b1, f1);
    }
  }
  /** b47 a ROOF chunk with real shingle courses: the (inset) front is cut into bands at the row lines; each band runs from
   *  `step` proud at its lower edge to flush at its top (tucked under the next course), a riser closes each step (faces down
   *  the slope), and the sides follow the sawtooth down to the flat back. Same chunk, same index range, so it breaks as one. */
  function shingled(S, poly, ip, inner, C, uv) {
    const h = S.T / 2, n = poly.length, SH = TOWN.shingle, B = S.rows, nb = B.length - 1;
    let ylo = Infinity, yhi = -Infinity; for (const p of ip) { ylo = Math.min(ylo, p[1]); yhi = Math.max(yhi, p[1]); }
    const band = y => { let j = 0; while (j < nb - 1 && y >= B[j + 1]) j++; return j; };
    const lip = (y, j) => (B[j + 1] - y) / (B[j + 1] - B[j]);                 // 1 at a course's lower edge, 0 at its top
    const vAt = (y, j) => j ? h + SH.step * lip(y, j) : h;               // the eave band lies flat under the frosting + cap
    const nF = (S.N.clone().addScaledVector(S.B, SH.tilt)).normalize(), nR = S.B.clone().negate();
    const cRise = C.cr.clone().multiplyScalar(0.62);
    // front bands
    for (let j = 0; j < nb; j++) {
      if (B[j + 1] <= ylo || B[j] >= yhi) continue;
      let bp = clipPoly(ip, [0, -1, -B[j]]); if (bp.length >= 3) bp = clipPoly(bp, [0, 1, B[j + 1]]);
      if (bp.length < 3 || Math.abs(area2(bp)) < 1e-4) continue;
      const vi = bp.map(([u, y]) => vert(FP(S, u, y, vAt(y, j)), nF, C.cr.clone().lerp(C.cf, lip(y, j)), uv(u, y)));
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(bp.map(([u, y]) => new THREE.Vector2(u, y)), [])) {
        const A = bp[a], Bq = bp[b], Cq = bp[c];
        ((Bq[0] - A[0]) * (Cq[1] - A[1]) - (Bq[1] - A[1]) * (Cq[0] - A[0]) >= 0) ? tri(vi[a], vi[b], vi[c]) : tri(vi[a], vi[c], vi[b]);
      }
    }
    // risers: the chord of the front at each interior row line, from flush (below) up to the proud lip (above)
    for (let j = 1; j < nb; j++) {
      const L = B[j]; if (L <= ylo || L >= yhi) continue;
      let ua = Infinity, ub = -Infinity;
      for (let k = 0; k < n; k++) {
        const P = ip[k], Q = ip[(k + 1) % n];
        if ((P[1] - L) * (Q[1] - L) < 0) { const u = P[0] + (Q[0] - P[0]) * (L - P[1]) / (Q[1] - P[1]); ua = Math.min(ua, u); ub = Math.max(ub, u); }
      }
      if (!(ub - ua > 0.01)) continue;
      const a0 = vert(FP(S, ua, L, h), nR, cRise, uv(ua, L)), b0 = vert(FP(S, ub, L, h), nR, cRise, uv(ub, L));
      const b1 = vert(FP(S, ub, L, h + SH.step), nR, cRise, uv(ub, L)), a1 = vert(FP(S, ua, L, h + SH.step), nR, cRise, uv(ua, L));
      tri(a0, b0, b1); tri(a0, b1, a1);
    }
    // back (flat)
    const bk = poly.map(([u, y]) => vert(FP(S, u, y, -h), S.N.clone().negate(), C.cb));
    for (let k = 1; k < n - 1; k++) tri(bk[0], bk[k + 1], bk[k]);
    // sides: split where the front edge crosses a row line, each piece from the sawtooth front down to the flat back
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, F0 = ip[k], F1 = ip[k1], P0 = poly[k], P1 = poly[k1];
      const o = S.A.clone().multiplyScalar(P1[1] - P0[1]).addScaledVector(S.B, -(P1[0] - P0[0])).normalize();
      if (inner[k]) o.addScaledVector(S.N, TOWN.groove / S.T).normalize();
      const cF = inner[k] ? C.ck : C.ce, cB = inner[k] ? C.ci : C.ce;
      const ts = [0, 1];
      for (let j = 1; j < nb; j++) { const L = B[j]; if ((F0[1] - L) * (F1[1] - L) < 0) ts.push((L - F0[1]) / (F1[1] - F0[1])); }
      ts.sort((a, b) => a - b);
      for (let i = 0; i < ts.length - 1; i++) {
        const ta = ts[i], tb = ts[i + 1]; if (tb - ta < 1e-5) continue;
        const j = band(F0[1] + (F1[1] - F0[1]) * (ta + tb) / 2);
        const fe = t => { const u = F0[0] + (F1[0] - F0[0]) * t, y = F0[1] + (F1[1] - F0[1]) * t; return vert(FP(S, u, y, vAt(y, j)), o, cF); };
        const be = t => vert(FP(S, P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t, -h), o, cB);
        const f0 = fe(ta), f1 = fe(tb), b0 = be(ta), b1 = be(tb);
        tri(f0, b0, b1); tri(f0, b1, f1);
      }
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
      const bake = rand(), col = new THREE.Color(pal[(rand() * pal.length) | 0]).multiplyScalar(bake < TOWN.toast ? 0.8 : 0.93 + (bake - TOWN.toast) / (1 - TOWN.toast) * 0.15);
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
    const surf = (O, A, B, T0, uvr = null, base = TOWN.cookie[0]) => { const S = { O, A, B, N: new V3().crossVectors(A, B), T: T0, chunks: [], hs, uvr, base: new THREE.Color(base) }; hs.surfs.push(S); return S; };
    const [dw, dh] = TOWN.door, [ww, wy0, wy1] = TOWN.win;
    // b44: the painted atlas regions for this house size (shared by every house of the same size)
    const f2 = v => v.toFixed(2), kz = `${f2(W)}:${f2(top)}`, wy1c = Math.min(wy1, top - 0.35);
    const wallL = (len, wins, door) => ({ len, top, wins, door, ww, wy0, wy1: wy1c, dw, dh });
    const at = (R, u0 = 0, y0 = 0) => ({ R, u0, y0 });   // a surface's view into a region (local origin offset)
    const rFront = at(region('front:' + kz, W, top, (g, ...b) => paintWall(g, ...b, wallL(W, [W / 2 - W * 0.28, W / 2 + W * 0.28], W / 2))));
    const rBack = at(region('back:' + kz, W, top, (g, ...b) => paintWall(g, ...b, wallL(W, [W / 2 - W * 0.28, W / 2 + W * 0.28], null))));
    const rSide = at(region(`side:${f2(D)}:${f2(top)}`, D - 2 * T, top, (g, ...b) => paintWall(g, ...b, wallL(D - 2 * T, [(D - 2 * T) / 2], null))));
    const win = cu => ({ u0: cu - ww / 2, u1: cu + ww / 2, y0: wy0, y1: Math.min(wy1, top - 0.35) });
    const wallIce = { top: 'pipe', hole: 'pipe' }, eaveIce = { top: 'drip', hole: 'pipe' };
    // walls: front (+z, the door) + back run the full width; the sides fit between them
    const front = surf(new V3(-W / 2, 0, D / 2 - T / 2), new V3(1, 0, 0), new V3(0, 1, 0), T, rFront);
    fracture(hs, front, { kind: 'wall', u0: 0, u1: W, y0: 0, y1: top, cell: TOWN.cell.wall, ice: wallIce,
      holes: [{ u0: W / 2 - dw / 2, u1: W / 2 + dw / 2, y0: 0, y1: dh }, win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] });
    const back = surf(new V3(W / 2, 0, -D / 2 + T / 2), new V3(-1, 0, 0), new V3(0, 1, 0), T, rBack);
    fracture(hs, back, { kind: 'wall', u0: 0, u1: W, y0: 0, y1: top, cell: TOWN.cell.wall, ice: wallIce, holes: [win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] });
    const SL = D - 2 * T;
    for (const s of [1, -1]) {
      const side = surf(new V3(s * (W / 2 - T / 2), 0, s * (D / 2 - T)), new V3(0, 0, -s), new V3(0, 1, 0), T, rSide);
      fracture(hs, side, { kind: 'wall', u0: 0, u1: SL, y0: 0, y1: top, cell: TOWN.cell.wall, ice: eaveIce, holes: [win(SL / 2)] });
    }
    // gables front + back: clipped under the roof's underside
    const yU0 = top - 0.15 + rise - (Tr / 2) / Math.cos(pitch) - 0.02, k = rise / run;
    const rGable = at(region('gable:' + f2(W), W, yU0 - top, (g, ...b) => paintGable(g, ...b, { W, top: 0, yU0: yU0 - top, k })), 0, top);
    for (const s of [1, -1]) {
      const g = surf(new V3(-s * W / 2, 0, s * (D / 2 - T / 2)), new V3(s, 0, 0), new V3(0, 1, 0), T, rGable);
      fracture(hs, g, { kind: 'gable', u0: 0, u1: W, y0: top, y1: yU0, cell: TOWN.cell.gable, ice: { rake: 'pipe', top: 'pipe' },
        clips: [[k, 1, yU0 + k * W / 2], [-k, 1, yU0 - k * W / 2]] });
    }
    // roof: one chocolate slab per side, eave + ridge capped in icing, drips off the eave
    const RW = D + 1.0, rLen = slope + 0.2;
    const rRoof = at(region(`roof:${f2(W)}:${f2(D)}`, RW, rLen, (g, ...b) => paintRoof(g, ...b, rLen)), -RW / 2, 0);
    for (const sgn of [1, -1]) {
      const B = new V3(-sgn * run, rise, 0).normalize(), A = new V3(0, 0, -sgn);
      const O = new V3(sgn * run, top - 0.15, 0).addScaledVector(B, -0.1);
      const S = surf(O, A, B, Tr, rRoof, TOWN.roof[0]);
      S.rows = [0]; for (let y = TOWN.shingle.y0 + TOWN.shingle.rh; y < rLen - 0.3; y += TOWN.shingle.rh) S.rows.push(y); S.rows.push(rLen);
      fracture(hs, S, { kind: 'roof', u0: -RW / 2, u1: RW / 2, y0: 0, y1: rLen, cell: TOWN.cell.roof, ice: { bottom: 'drip', top: 'cap', end: 'pipe' } });
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
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(2.2), toneMapped: false });
  const decorMeshes = [];
  let ixLive = null;
  function finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
    // the painted atlas: pack + paint the registered regions, then (region, local px) -> uv
    const cv = AT.list.length ? paintAtlas() : null, [AW, AH] = AT.size || [1, 1], UV = new Float32Array(G.uv.length / 3 * 2);
    for (let i = 0, j = 0; i < G.uv.length; i += 3, j += 2) {
      const r = AT.list[G.uv[i]];
      UV[j] = r ? (r.ox + G.uv[i + 1]) / AW : 8 / AW; UV[j + 1] = r ? 1 - (r.oy - G.uv[i + 2]) / AH : 1 - 8 / AH;
    }
    if (cv) console.log(`town atlas ${AW}x${AH} (${AT.list.length} regions, ppm ${TOWN.ppm}) ~${(AW * AH * 4 * 4 / 3 / 1048576).toFixed(1)} MB GPU with mips`);
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    if (cv) {
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      mat.map = tex; mat.needsUpdate = true;
    }
    ixLive = new THREE.BufferAttribute(new Uint32Array(G.idx), 1);
    g.setIndex(ixLive); g.computeBoundingSphere();
    mesh = new THREE.Mesh(g, mat); mesh.name = 'townChunks';
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.noMerge = true;   // the merger must not swallow the index trick
    scene.add(mesh);
    G.pos = G.nrm = G.col = G.uv = G.idx = null; AT.list.forEach(r => { r.paint = null; });
    // debris: a snapped-cookie prism (hexagon, jittered), scaled per chunk
    const dg = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).rotateX(Math.PI / 2).toNonIndexed();
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) { const a = Math.atan2(dp.getY(i), dp.getX(i)), f = 0.8 + 0.25 * Math.sin(a * 3 + 1.3) + 0.1 * Math.cos(a * 5); if (Math.hypot(dp.getX(i), dp.getY(i)) > 0.01) dp.setXY(i, dp.getX(i) * f, dp.getY(i) * f); }
    dg.computeVertexNormals();
    const DN = TOWN.debrisMax + TOWN.crumbMax;   // b86: slots [0, debrisMax) = chunk pieces, the rest = crumbs (same mesh, one draw)
    debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 0.78 }), DN); debrisMesh.castShadow = true; debrisMesh.frustumCulled = false;
    for (let i = 0; i < DN; i++) debrisMesh.setMatrixAt(i, ZERO);
    debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DN * 3), 3); scene.add(debrisMesh);
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
  /** b56 (delivery): tint one house's glowing windows (a colour multiplies the warm glow; null = back to normal) */
  const _tc = new THREE.Color();
  function tintWindows(hs, col) {
    const d = decorMeshes.find(e => e.im.material === glowMat); if (!d) return;
    const im = d.im;
    if (!im.instanceColor) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3).fill(1), 3);
    if (col == null) _tc.setRGB(1, 1, 1); else if (col.isColor) _tc.copy(col); else _tc.set(col);
    d.list.forEach((e, i) => { if (houses[e.h] === hs) im.setColorAt(i, _tc); });
    im.instanceColor.needsUpdate = true;
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
      if (kill.length) n += remove(hs, kill, p, push, 3 + radius * 1.6);   // b86: a bigger blast throws harder (rocket r 3.6 ~ 9 m/s, crash r 5 ~ 11)
    }
    return n;
  }
  function bruise(c) {
    const ca = mesh.geometry.attributes.color;
    for (let i = c.v0; i < c.vb; i++) ca.setXYZ(i, ca.getX(i) * 0.88, ca.getY(i) * 0.88, ca.getZ(i) * 0.88);
    ca.addUpdateRange(c.v0 * 3, (c.vb - c.v0) * 3); ca.needsUpdate = true;
    c.col.multiplyScalar(0.88);
  }
  /** damage one chunk (bullets): it bruises darker each hit */
  function hitBrick(id, dmg, from) {
    const c = chunks[id]; if (!c || !c.alive) return 0;
    c.hp -= dmg; bruise(c);
    if (c.hp > 0) return 0;
    return remove(c.h, [id], c.world.clone(), from);
  }
  /** b86 A GATLING ROUND (his: "the bullets need to have velocity behind them ... fucking destroying these homes"): the chunk it
   *  hits takes TOWN.bullet.dmg, every chunk within `splash` m of the impact takes splashDmg (falling off with distance), a spray
   *  of crumbs + icing bits kicks back off the face, and what dies flies OUT along the bullet at `push` m/s, spinning */
  function bullet(id, point, dir, B = TOWN.bullet) {
    const c = chunks[id]; if (!c || !c.alive) return 0;
    const hs = c.h, kill = [];
    c.hp -= B.dmg; bruise(c); if (c.hp <= 0) kill.push(id);
    for (const S of hs.surfs) {
      toLocal(hs, S, point, _o);
      const dv = Math.max(0, Math.abs(_o.z) - S.T / 2); if (dv > B.splash) continue;
      for (const o of S.chunks) {
        if (!o.alive || o === c || o.hp <= 0) continue;
        if (Math.abs(_o.x - o.c[0]) > B.splash + 2 || Math.abs(_o.y - o.c[1]) > B.splash + 2) continue;
        const d = Math.hypot(polyDist(o.poly, _o.x, _o.y), dv); if (d > B.splash) continue;
        o.hp -= B.splashDmg * (1 - 0.7 * d / B.splash); if (o.hp <= 0) kill.push(o.id);
      }
    }
    crumbs(point, dir, c.col, B.crumbs, 7);
    snd('crunch', { vol: 0.32, rate: 1.5 }, point, 70);
    if (!kill.length) return 0;
    return remove(hs, kill, point.clone().addScaledVector(dir, -0.4), _push.copy(dir).multiplyScalar(B.push));
  }
  const _push = new V3();
  // b86 sound / shake / dust go through hooks main.js fills (distance-scaled there); rate-limited per name
  const sndT = {};
  function snd(name, o, p, gap = 0) {
    const t = performance.now(); if (gap && t - (sndT[name] || 0) < gap) return; sndT[name] = t;
    api.hooks.sfx ? api.hooks.sfx(name, o, p) : window.sfx?.play(name, o);
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
  function remove(hs, ids, at, push, kick = 5) {
    links(hs);
    const direct = new Set(ids), gone = new Set(ids), live = id => chunks[id].alive && !gone.has(id);
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
    // b86 THE CAVE-IN (his: "houses toppling ... it takes so much to take a house down"): once the walls fall under
    // TOWN.collapseAt the whole house comes down -- the roof caves in, each wall tips over as a slab (mostly outward)
    let caved = false;
    if (!hs.collapsed && hs.wallTotal) {
      let w = 0; for (const id of hs.walls) if (live(id)) w++;
      if (w < hs.wallTotal * TOWN.collapseAt) { hs.collapsed = caved = true; for (const id of hs.ids) if (chunks[id].alive) gone.add(id); }
    }
    // the falling pieces TIP: one hinge + one tip per wall face (walls + the gable above share a face), so a cut-loose section
    // topples as a slab, then breaks up when it lands; the wave starts at the impact and runs outward
    const faces = new Map();
    for (const id of gone) {
      const c = chunks[id]; if (direct.has(id) || c.kind === 'roof') continue;
      const key = `${Math.round(c.S.N.x)},${Math.round(c.S.N.z)}`;
      let f = faces.get(key);
      if (!f) { f = { sign: Math.random() < 0.72 ? 1 : -1, w: rr(0.7, 1.5), hinge: Infinity, delay: caved ? 0.25 + Math.random() * 0.45 : 0, N: c.S.N.clone().applyAxisAngle(_YA, hs.ry) }; faces.set(key, f); }
      f.hinge = Math.min(f.hinge, caved ? 0 : c.bb[2]);
      if (!caved) f.delay = Math.max(f.delay, Math.min(0.45, c.world.distanceTo(at) * 0.03));
    }
    const ix = mesh.geometry.index;
    let big = 0;
    for (const id of gone) {
      const c = chunks[id]; c.alive = false; hs.alive--;
      ix.array.fill(ix.array[c.i0], c.i0, c.i1);     // collapse its triangles to one point
      ix.addUpdateRange(c.i0, c.i1 - c.i0);
      if (direct.has(id)) {
        const away = c.world.clone().sub(at); away.normalize();
        const vel = push ? push.clone().multiplyScalar(rr(0.7, 1.3)).addScaledVector(away, rr(1, 3)) : away.multiplyScalar(kick * rr(0.7, 1.3));
        vel.y += rr(1.5, 4.5);
        spawnDebris(c, vel, new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(rr(8, 15)), 0);
        crumbs(c.world, push ? _push.copy(push).normalize().negate() : null, c.col, 6, 6);
      } else if (c.kind === 'roof') {
        // the roof caves IN: down + toward the ridge, tumbling
        const N = c.S.N.clone().applyAxisAngle(_YA, hs.ry);
        const vel = new V3(-N.x, 0, -N.z).multiplyScalar(rr(0.6, 2)).add(new V3(rr(-0.6, 0.6), -rr(0.5, 2.5), rr(-0.6, 0.6)));
        spawnDebris(c, vel, new V3(rr(-3, 3), rr(-1, 1), rr(-3, 3)), caved ? rr(0, 0.22) : Math.min(0.4, c.world.distanceTo(at) * 0.025) + rr(0, 0.08));
        big++;
      } else {
        const f = faces.get(`${Math.round(c.S.N.x)},${Math.round(c.S.N.z)}`), arm = Math.max(0.4, c.c[1] - f.hinge);
        // a rigid slab rotating about its base line: v = w x r = w * height along the face normal; spin about the face's A axis
        const vel = f.N.clone().multiplyScalar(f.sign * f.w * arm).add(new V3(rr(-0.4, 0.4), rr(0, 0.6), rr(-0.4, 0.4)));
        spawnDebris(c, vel, new V3(f.sign * f.w * rr(0.9, 1.1), rr(-0.3, 0.3), rr(-0.3, 0.3)), f.delay + rr(0, 0.04));
        big++;
      }
    }
    ix.needsUpdate = true;
    proxyFollow(hs);
    if (!hs.hitOnce) { hs.hitOnce = true; api.onHouseDamaged?.(hs, at); }   // b60: the first chunks out -> gingerfolk run (props.js)
    // the house's crash collider + dressing follow what's left
    const frac = hs.alive / hs.total;
    if ((frac < 0.35 || hs.collapsed) && !hs.dead) {
      hs.dead = true; hs.collider.r = 0;
      decorMeshes.forEach(({ im, list }) => { list.forEach((e, i) => { if (houses[e.h] === hs) im.setMatrixAt(i, ZERO); }); im.instanceMatrix.needsUpdate = true; });
    }
    // big and loud
    const H = api.hooks;
    if (caved) {
      snd('explosion', { vol: 0.9, rate: 0.55 }, at); snd('debris', { vol: 1, rate: 0.75 }, at);
      H.shake?.(1.5, at);
      const ctr = new V3(hs.x, hs.gy + 0.6, hs.z);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2, p = ctr.clone().add(new V3(Math.cos(a) * hs.W * 0.45, rr(0, 2.5), Math.sin(a) * hs.D * 0.45));
        H.puff?.(p, '#efe4d8', 8, 4, 2.4, 0.6); H.puff?.(p, '#ffffff', 5, 6, 1.6, 0.8);
      }
    } else if (big > 6) {
      snd('debris', { vol: Math.min(1, 0.5 + big * 0.04), rate: 0.85 }, at, 120);
      H.shake?.(Math.min(0.9, 0.25 + big * 0.03), at);
      H.puff?.(at, '#efe4d8', 10, 4, 1.8, 0.6);
    } else snd('crunch', { vol: Math.min(1, 0.55 + gone.size * 0.08) }, at, 55);
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

  // ---- debris: knocked-out chunks tumble, bounce, settle as rubble, then sink away (b86); crumbs share the mesh ------------
  const DN = TOWN.debrisMax + TOWN.crumbMax, deb = new Array(DN).fill(null);
  let debI = 0, crumbI = 0, puffT = 0;
  const _bm = new THREE.Matrix4();
  /** a chunk becomes a piece of debris; vel world m/s, spin = body-frame rad/s (x = the face's A axis), delay s before it moves */
  function spawnDebris(c, vel, spin, delay) {
    const S = c.S, hs = c.h;
    const q = new THREE.Quaternion().setFromRotationMatrix(_bm.makeBasis(S.A, S.B, S.N)).premultiply(new THREE.Quaternion().setFromAxisAngle(_YA, hs.ry));
    const s = new V3((c.bb[1] - c.bb[0]) * 0.85, (c.bb[3] - c.bb[2]) * 0.85, S.T);
    const i = debI++ % TOWN.debrisMax;
    const d = deb[i] = { pos: c.world.clone(), vel, q, s, k: 1, spin, delay, rest: false, restT: 0, life: 0, big: s.x * s.y > 0.8, bounces: 0 };
    debrisMesh.setColorAt(i, c.col); debrisMesh.instanceColor.needsUpdate = true;
    debrisMesh.setMatrixAt(i, _m.compose(d.pos, d.q, d.s)); debrisMesh.instanceMatrix.needsUpdate = true;
  }
  /** a spray of crumbs + icing bits at p: kicked back along `back` (the reverse of the bullet) + every way, short-lived */
  function crumbs(p, back, col, n, speed) {
    for (let k = 0; k < n; k++) {
      const i = TOWN.debrisMax + (crumbI++ % TOWN.crumbMax), white = Math.random() < 0.3, sz = rr(0.05, 0.15);
      const vel = new V3(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)).multiplyScalar(speed * 0.55); vel.y += rr(1, 3.5);
      if (back) vel.addScaledVector(back, speed * rr(0.3, 0.9));
      const q = new THREE.Quaternion().setFromEuler(_eu.set(rr(0, 6), rr(0, 6), rr(0, 6)));
      deb[i] = { pos: p.clone(), vel, q, s: new V3(sz, sz * rr(0.6, 1), sz * 0.6), k: 1, spin: new V3(rr(-20, 20), rr(-20, 20), rr(-20, 20)), delay: 0, crumb: true, life: 0, max: rr(0.6, 1.3), rest: false };
      debrisMesh.setColorAt(i, white ? icingC : col);
    }
    debrisMesh.instanceColor.needsUpdate = true;
  }
  const _m = new THREE.Matrix4(), _e = new THREE.Quaternion(), _eu = new THREE.Euler(), _sc = new V3();
  let freed = false;
  function free(i) { deb[i] = null; debrisMesh.setMatrixAt(i, ZERO); freed = true; }
  function update(dt) {
    if (!built) return;
    let moved = false;
    puffT -= dt;
    for (let i = 0; i < DN; i++) {
      const d = deb[i]; if (!d) continue;
      if (d.delay > 0) { d.delay -= dt; continue; }      // waiting in place (its pose was set at spawn)
      d.life += dt;
      if (d.crumb && d.life > d.max) { free(i); continue; }
      if (d.rest) {
        d.restT += dt; if (d.restT < TOWN.debrisLife) continue;
        d.k = 1 - (d.restT - TOWN.debrisLife) / 1.5; d.pos.y -= 0.2 * dt;   // sinks + shrinks away, slot freed
        if (d.k <= 0) { free(i); continue; }
      } else {
        d.vel.y -= TOWN.gravity * dt; d.pos.addScaledVector(d.vel, dt);
        _e.setFromEuler(_eu.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)); d.q.multiply(_e);
        const gy = groundH(d.pos.x, d.pos.z) + (d.crumb ? 0.04 : 0.15);
        if (d.pos.y < gy) {
          const vy = -d.vel.y;
          if (d.big && vy > 5 && !d.bounces) {           // a slab hitting the snow: thud + a puff of powder
            snd('debris', { vol: Math.min(1, 0.3 + vy * 0.05), rate: rr(0.8, 1.1) }, d.pos, 110);
            if (puffT <= 0) { puffT = 0.05; api.hooks.puff?.(d.pos, '#f4eee8', 4, 3, 1.2, 0.5); }
          }
          d.bounces = (d.bounces || 0) + 1;
          d.pos.y = gy; d.vel.y = vy * (d.crumb ? 0.35 : 0.3); d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.55);
          if (d.big && d.bounces === 1) { d.vel.x += rr(-1, 1); d.vel.z += rr(-1, 1); }   // a little scatter as it breaks on landing
          if ((Math.abs(d.vel.y) < 0.8 && d.vel.lengthSq() < 0.6) || d.life > 6) { if (d.crumb) { free(i); continue; } d.rest = true; d.vel.set(0, 0, 0); }
        }
        if (d.crumb && d.life > d.max - 0.25) d.k = Math.max(0, (d.max - d.life) / 0.25);
      }
      debrisMesh.setMatrixAt(i, _m.compose(d.pos, d.q, _sc.copy(d.s).multiplyScalar(d.k))); moved = true;
    }
    if (moved || freed) { debrisMesh.instanceMatrix.needsUpdate = true; freed = false; }
  }

  const api = {
    onHouseDamaged: null,
    hooks: {},                         // b86: { sfx(name, opts, p), shake(k, p), puff(p, col, n, speed, life, up) } -- main.js fills these
    house, finish, update, lodTick, raycast, solidAt, blast, hitBrick, bullet, houses, tintWindows,
    get stats() {
      const tris = mesh ? mesh.geometry.index.count / 3 : 0;
      return { bricks: chunks.length, chunks: chunks.length, alive: chunks.filter(c => c.alive).length, houses: houses.length, tris, trisPerHouse: houses.length ? Math.round(tris / houses.length) : 0, far: 0, atlas: AT.size, debris: deb.filter(Boolean).length };
    },
  };
  return api;
}
