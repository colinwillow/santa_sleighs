// Shared helpers: deterministic random, matrix shorthand, a vertex-coloured geometry batcher, cached shapes.
import * as THREE from 'three';

let seed = 1337;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const rr = (a, b) => a + rand() * (b - a);
export const pick = a => a[Math.floor(rand() * a.length)];

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
/** T(x,y,z, sx,sy,sz, rx,ry,rz) -> a new Matrix4 */
export function T(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Batch: many small pieces -> ONE mesh (position, normal, colour). Keeps draw calls tiny on the phone.
const _c = new THREE.Color();
export class Batch {
  constructor() { this.parts = []; this.count = 0; }
  add(geo, color, m4, jitter = 0.06) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m4) g.applyMatrix4(m4);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    _c.set(color); const k = 1 + (rand() - 0.5) * jitter;
    for (let i = 0; i < n; i++) { c[i * 3] = _c.r * k; c[i * 3 + 1] = _c.g * k; c[i * 3 + 2] = _c.b * k; }
    this.parts.push({ p: g.attributes.position.array, n: g.attributes.normal.array, c });
    this.count += n;
    g.dispose();
  }
  geometry() {
    const P = new Float32Array(this.count * 3), N = new Float32Array(this.count * 3), C = new Float32Array(this.count * 3);
    let o = 0;
    for (const q of this.parts) { P.set(q.p, o); N.set(q.n, o); C.set(q.c, o); o += q.p.length; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    return g;
  }
  mesh(material) { const m = new THREE.Mesh(this.geometry(), material); m.castShadow = m.receiveShadow = true; return m; }
}

// ---- cached shapes ----------------------------------------------------------------------
const cache = new Map();
const memo = (k, f) => cache.get(k) || (cache.set(k, f()), cache.get(k));
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const BLOB = new THREE.IcosahedronGeometry(1, 1);      // 80 tris, soft snow lumps
export const BALL = new THREE.IcosahedronGeometry(1, 0);      // 20 tris, bulbs
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
export const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);   // open, 12 tris: canes, stripes, posts

/** a box with bevelled edges, centred (w,h,d), bevel r */
export function bevBox(w, h, d, r = 0.08, segs = 2) {
  return memo(`bb${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)},${r},${segs}`, () => {
    r = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
    const s = new THREE.Shape();
    const x = w / 2 - r, y = h / 2 - r;
    s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: segs, curveSegments: 4 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** a gable prism: triangle (span wide, rise high) in XY extruded along Z by depth, bevelled; base at y=0 */
export function gable(span, rise, depth, r = 0.12, segs = 2) {
  return memo(`gb${span.toFixed(2)},${rise.toFixed(2)},${depth.toFixed(2)},${r},${segs}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rise); s.lineTo(-span / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, depth - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: segs, curveSegments: 4 });
    g.translate(0, 0, -(depth - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  });
}

let dotTex = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#ffffffaa'); gr.addColorStop(1, '#fff0');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}
