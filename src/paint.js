// Hand-painted textures made at load in a <canvas>: soft overlapping brush dabs, a few hues, no photo noise.
// NEUTRAL maps (values round 0.9, warm light strokes + cool lavender shadow strokes) that MULTIPLY a piece's own colour
// (vertex colours / material colour), so one shared map paints pines, snow caps, bark and frosted crowns alike and no
// draw is added. Real `map`s, so the FLAT look (look.js copies `map`) keeps the strokes too.
import * as THREE from 'three';

// own tiny PRNG so painting never shifts the world's placement draws (util.js rand)
let s = 9071;
const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + r() * (b - a);

/** one soft elongated dab at (x,y), drawn at every wrap offset so the tile is seamless */
function dab(x, c, px, py, len, wid, ang, col, a, S) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    const X = px + ox, Y = py + oy;
    if (X < -len || X > S + len || Y < -len || Y > S + len) continue;
    x.save(); x.translate(X, Y); x.rotate(ang); x.scale(len, wid);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.55, `rgba(${col},${a * 0.6})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
  }
}

function canvasTex(S, paint, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); paint(x, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

let foliage = null;
/** trees: diagonal needle-ish strokes leaning down-out (like painted foliage), warm lights, lavender-blue shadows */
export function foliageTex() {
  return foliage || (foliage = canvasTex(256, (x, S) => {
    x.fillStyle = 'rgb(226,226,230)'; x.fillRect(0, 0, S, S);
    // big soft value masses first (gentle colour variation), then the stroke layers on top
    for (let i = 0; i < 26; i++) dab(x, 0, rr(0, S), rr(0, S), rr(30, 60), rr(18, 34), rr(0, 3.14), r() < 0.5 ? '255,246,226' : '170,176,214', rr(0.18, 0.3), S);
    for (let i = 0; i < 240; i++) {
      const side = r() < 0.5 ? -1 : 1, ang = Math.PI / 2 + side * rr(0.5, 0.95);   // strokes fall down and outward
      const light = r() < 0.5;
      dab(x, 0, rr(0, S), rr(0, S), rr(9, 20), rr(2.2, 4.5), ang, light ? '255,250,232' : '150,158,206', rr(0.22, 0.42), S);
    }
    // a few bright accent flicks, kept soft
    for (let i = 0; i < 40; i++) dab(x, 0, rr(0, S), rr(0, S), rr(5, 10), rr(1.5, 2.5), Math.PI / 2 + rr(-1, 1), '255,255,246', rr(0.3, 0.5), S);
  }));
}

/** snow ground: cream with long wind-swept lavender-blue drifts, warm highlights and a faint sparkle */
export function snowTex(repeat) {
  return canvasTex(512, (x, S) => {
    x.fillStyle = 'rgb(246,244,242)'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 30; i++) dab(x, 0, rr(0, S), rr(0, S), rr(70, 140), rr(30, 60), rr(-0.3, 0.3), r() < 0.55 ? '196,198,236' : '255,247,232', rr(0.16, 0.28), S);
    for (let i = 0; i < 220; i++) dab(x, 0, rr(0, S), rr(0, S), rr(18, 48), rr(3, 8), rr(-0.35, 0.35), r() < 0.6 ? '184,186,228' : '255,251,240', rr(0.12, 0.26), S);
    for (let i = 0; i < 90; i++) { const px = rr(0, S), py = rr(0, S); x.fillStyle = `rgba(255,255,255,${rr(0.5, 0.9)})`; x.beginPath(); x.arc(px, py, rr(0.6, 1.3), 0, 6.283); x.fill(); }
  }, repeat);
}

/** cylindrical object-space UVs for a NON-indexed geometry (world-ish metres / tile), seam-fixed per triangle
 *  (RepeatWrapping makes u > 1 fine); tops / bottoms that face up use a planar xz projection instead */
export function paintUV(geo, tile = 2.4, R = 1.4) {
  if (geo.index) geo = geo.toNonIndexed();
  const P = geo.attributes.position, Nn = geo.attributes.normal, n = P.count, uv = new Float32Array(n * 2), turn = (Math.PI * 2 * R) / tile;
  for (let t = 0; t < n; t += 3) {
    let ny = 0; for (let k = 0; k < 3; k++) ny += Math.abs(Nn.getY(t + k)) / 3;
    const flat = ny > 0.85;
    for (let k = 0; k < 3; k++) {
      const i = t + k, x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (flat) { uv[i * 2] = x / tile; uv[i * 2 + 1] = z / tile; }
      else { uv[i * 2] = (Math.atan2(z, x) / (Math.PI * 2)) * turn; uv[i * 2 + 1] = y / tile; }
    }
    if (!flat) {
      const a = uv[t * 2], b = uv[t * 2 + 2], c = uv[t * 2 + 4], mx = Math.max(a, b, c);
      for (let k = 0; k < 3; k++) if (mx - uv[(t + k) * 2] > turn / 2) uv[(t + k) * 2] += turn;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
