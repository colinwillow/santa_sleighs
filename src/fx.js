// Shared effects: soft glow sprites, warm light pools, fires (flames + embers + flicker), smoke plumes.
// Each factory adds to the scene and returns an update(t, dt) or a handle.
import * as THREE from 'three';
import { softDot, rand, T } from './util.js';
import { groundH } from './terrain.js';

/** additive glow sprites: P = Vector3[], C = colour strings */
export function glowPoints(scene, P, C, size, opacity) {
  const g = new THREE.BufferGeometry(), pa = new Float32Array(P.length * 3), ca = new Float32Array(P.length * 3), c = new THREE.Color();
  P.forEach((p, i) => { pa.set([p.x, p.y, p.z], i * 3); c.set(C[i]); ca.set([c.r, c.g, c.b], i * 3); });
  g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: softDot(), vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts); return pts;
}

/** warm light pools on the ground: [{p, r, c, lift}] -> one instanced additive decal */
export function lightPools(scene, pools, opacity = 0.5) {
  if (!pools.length) return null;
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }), pools.length);
  const c = new THREE.Color();
  pools.forEach((q, i) => { m.setMatrixAt(i, T(q.p.x, (q.y ?? groundH(q.p.x, q.p.z)) + 0.04, q.p.z, q.r, 1, q.r)); m.setColorAt(i, c.set(q.c)); });
  m.renderOrder = 2; scene.add(m); return m;
}

let flameTex = null;
function flameTexture() {
  if (flameTex) return flameTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 40, 2, 32, 34, 30);
  g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#ffffffcc'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.beginPath(); x.ellipse(32, 36, 20, 28, 0, 0, Math.PI * 2); x.fill();
  flameTex = new THREE.CanvasTexture(cv); flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

/** fires: [{p: Vector3, s: scale}] -> flames + embers (additive, fading to black), and 2 shared point lights that
 *  follow the fires nearest the camera so only two lights ever cost anything. */
export function fires(scene, list, camera) {
  if (!list.length) return () => {};
  const PER = 22, EMB = 10, N = list.length * PER, E = list.length * EMB;
  const mk = (n, size, tex) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    p.frustumCulled = false; scene.add(p); return p;
  };
  const flames = mk(N, 1.1, flameTexture()), embers = mk(E, 0.18, softDot());
  const fl = new Float32Array(N).map(() => rand()), el = new Float32Array(E).map(() => rand());
  const seeds = new Float32Array(N + E).map(() => rand());
  const lights = [new THREE.PointLight('#ff9a40', 0, 16, 1.8), new THREE.PointLight('#ff9a40', 0, 16, 1.8)];
  for (const l of lights) scene.add(l);
  const hot = new THREE.Color('#ffe6a0'), mid = new THREE.Color('#ff7a1a'), cold = new THREE.Color('#300800'), c = new THREE.Color();
  return (t, dt) => {
    const FP = flames.geometry.attributes.position.array, FC = flames.geometry.attributes.color.array;
    for (let i = 0; i < N; i++) {
      const f = list[(i / PER) | 0], s = f.s || 1;
      fl[i] += dt * (1.4 + seeds[i]); if (fl[i] > 1) fl[i] -= 1;
      const L = fl[i], a = seeds[i] * 6.28;
      const r = (1 - L) * 0.35 * s;
      FP[i * 3] = f.p.x + Math.cos(a + t * 2) * r + Math.sin(t * 7 + i) * 0.04;
      FP[i * 3 + 1] = f.p.y + L * 1.4 * s;
      FP[i * 3 + 2] = f.p.z + Math.sin(a + t * 2) * r;
      c.copy(hot).lerp(mid, Math.min(1, L * 1.6)).lerp(cold, Math.max(0, L * 1.4 - 0.4)).multiplyScalar(1.6 * (1 - L * 0.7));
      FC[i * 3] = c.r; FC[i * 3 + 1] = c.g; FC[i * 3 + 2] = c.b;
    }
    const EP = embers.geometry.attributes.position.array, EC = embers.geometry.attributes.color.array;
    for (let i = 0; i < E; i++) {
      const f = list[(i / EMB) | 0], s = f.s || 1, sd = seeds[N + i];
      el[i] += dt * (0.35 + sd * 0.3); if (el[i] > 1) el[i] -= 1;
      const L = el[i];
      EP[i * 3] = f.p.x + Math.sin(L * 9 + sd * 20) * 0.5 * L * s;
      EP[i * 3 + 1] = f.p.y + 0.4 + L * 4.5 * s;
      EP[i * 3 + 2] = f.p.z + Math.cos(L * 7 + sd * 20) * 0.5 * L * s;
      const k = (1 - L) * 2.2 * (0.6 + 0.4 * Math.sin(t * 20 + i));
      EC[i * 3] = k; EC[i * 3 + 1] = k * 0.45; EC[i * 3 + 2] = k * 0.1;
    }
    flames.geometry.attributes.position.needsUpdate = flames.geometry.attributes.color.needsUpdate = true;
    embers.geometry.attributes.position.needsUpdate = embers.geometry.attributes.color.needsUpdate = true;
    // the two nearest fires get real light
    const cp = camera.position;
    const near = list.map(f => [f, f.p.distanceToSquared(cp)]).sort((a, b) => a[1] - b[1]);
    lights.forEach((l, k) => {
      const f = near[k]?.[0];
      if (!f) { l.intensity = 0; return; }
      l.position.set(f.p.x, f.p.y + 1.2, f.p.z);
      l.intensity = 14 * (f.s || 1) * (0.85 + 0.15 * Math.sin(t * 13 + k) * Math.sin(t * 7.3));
    });
  };
}

/** smoke plumes from sources [{p: Vector3, s}] -- grey puffs that rise, drift with the wind, spread */
export function smoke(scene, sources, { per = 14, size = 2.6, color = '#c8c8d8', opacity = 0.45, rise = 12, drift = 5, rate = 0.18 } = {}) {
  const N = Math.max(1, sources.length * per);
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(N * 3), life = new Float32Array(N).map(() => rand());
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  return (t, dt) => {
    for (let i = 0; i < N; i++) {
      const c = sources[(i / per) | 0]; if (!c) continue;
      life[i] += dt * rate; if (life[i] > 1) life[i] -= 1;
      const L = life[i], p = c.p || c;
      P[i * 3] = p.x + Math.sin(L * 6 + i) * 0.6 * L + L * drift;
      P[i * 3 + 1] = p.y + L * rise;
      P[i * 3 + 2] = p.z + Math.cos(L * 5 + i) * 0.6 * L;
    }
    g.attributes.position.needsUpdate = true;
  };
}
