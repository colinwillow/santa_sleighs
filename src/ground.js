// Ground dressing: the painterly snow shader (mottling + sparkle), grass / dirt patches showing through the
// snow, dry grass tufts, and the instanced flora (frosted round trees, snowy pines, bushes, snow mounds).
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { rand, rr, T, Batch, CYL6, LOBLOB, shadowProxy } from './util.js';
import { foliageTex, paintUV } from './paint.js';

/** turn a MeshStandardMaterial into painterly snow: soft world-space colour mottling + tiny glints */
export function snowShader(mat, { glint = 1 } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGlint = { value: glint };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform float uGlint;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.1)*.27 + vn(p*4.3)*.15 + vn(p*8.7)*.08; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float m1 = fbm(vWP.xz * 0.08), m2 = fbm(vWP.xz * 0.6 + 7.0);
        diffuseColor.rgb *= 0.9 + 0.14 * m1 + 0.06 * m2;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.03, 0.96, 1.06), smoothstep(0.4, 0.7, m1));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 cell = floor(vWP * 9.0);
        float g = hsh(cell.xz + cell.y * 3.1 + floor(cameraPosition.xz * 0.7));
        totalEmissiveRadiance += vec3(0.9, 0.95, 1.2) * step(0.994, g) * uGlint * 2.5;`);
  };
  return mat;
}

let patchTex = null, tuftTex = null;
function blobTexture() {
  if (patchTex) return patchTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 16; i++) {   // overlapping soft blobs -> an irregular patch with a soft edge
    const px = 64 + rr(-26, 26), py = 64 + rr(-26, 26), r = rr(14, 30);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, '#ffffffcc'); g.addColorStop(0.6, '#ffffff66'); g.addColorStop(1, '#fff0');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  patchTex = new THREE.CanvasTexture(c); patchTex.colorSpace = THREE.SRGBColorSpace;
  return patchTex;
}
function bladeTexture() {
  if (tuftTex) return tuftTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const bx = 8 + rand() * 48, lean = rr(-10, 10), h = rr(28, 60);
    x.strokeStyle = `hsl(${rr(40, 70)}, 30%, ${rr(55, 80)}%)`; x.lineWidth = rr(1.5, 3);
    x.beginPath(); x.moveTo(bx, 64); x.quadraticCurveTo(bx + lean * 0.3, 64 - h * 0.6, bx + lean, 64 - h); x.stroke();
  }
  tuftTex = new THREE.CanvasTexture(c); tuftTex.colorSpace = THREE.SRGBColorSpace;
  return tuftTex;
}

/** flora + patches, placed with add*() then finish() */
export function makeFlora(scene) {
  // b30 tris cut: crowns are 48-tri smooth spheres (were 80-tri BLOBs), trunks open 6-sided, pine tiers 7-sided with the
  // snow caps + tip open-bottomed (their undersides sit inside the tier below) -- frost 520 -> 300, pine 184 -> 103, bush 160 -> 96
  const frost = new Batch();
  frost.add(CYL6, '#4a3428', T(0, 1.2, 0, 0.25, 2.4, 0.25));
  for (const [bx, by, bz, s] of [[0, 3.2, 0, 1.6], [0.9, 2.7, 0.3, 1.1], [-0.8, 2.8, -0.4, 1.15], [0.2, 4.3, -0.2, 1.15], [-0.3, 2.5, 0.9, 1.0], [0.4, 2.6, -1.0, 1.0]])
    frost.add(LOBLOB, by > 3 ? '#eef2ff' : '#c4d0ee', T(bx, by, bz, s, s * 0.9, s), 0.1);
  const pine = new Batch();
  pine.add(CYL6, '#4a3428', T(0, 0.6, 0, 0.25, 1.2, 0.25));
  for (let k = 0; k < 4; k++) {
    const r = 2.2 - k * 0.45, yb = 1.2 + k * 1.35;
    pine.add(new THREE.ConeGeometry(r, 2.2, 7), '#1f4a3c', T(0, yb + 1.1, 0));
    pine.add(new THREE.ConeGeometry(r * 0.78, 0.9, 7, 1, true), '#eef2ff', T(0, yb + 1.75, 0), 0.03);
  }
  pine.add(new THREE.ConeGeometry(0.4, 0.7, 7, 1, true), '#eef2ff', T(0, 7.2, 0));
  const bush = new Batch();
  bush.add(LOBLOB, '#8396bd', T(0, 0.45, 0, 0.9, 0.7, 0.9)); bush.add(LOBLOB, '#f3f5ff', T(0, 0.85, 0, 0.8, 0.4, 0.8), 0.03);
  // snow mounds sit half in the ground: a dome a little past the equator (so slopes don't show its rim), 40 tris (was 80)
  const MOUND = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.62);

  // hand-painted: one shared neutral brush map multiplies the vertex colours (needles, caps, bark, frosted crowns)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: foliageTex() });
  mat.color.setScalar(1.12);   // the map averages ~0.89: keep the colours where they were
  const snowMat = snowShader(new THREE.MeshStandardMaterial({ color: '#f3f5ff', roughness: 0.95 }), { glint: 0.6 });
  // b30: nothing here casts for real; trees + bushes cast through shadow-only stand-ins (SH below)
  const inst = (geo, m, n) => { const im = new THREE.InstancedMesh(geo, m, n); im.castShadow = false; im.receiveShadow = true; im.count = 0; scene.add(im); return im; };
  const I = {
    frost: inst(paintUV(frost.geometry(), 2.0, 1.2), mat, 260), pine: inst(paintUV(pine.geometry(), 2.2, 1.5), mat, 260), bush: inst(paintUV(bush.geometry(), 1.4, 0.8), mat, 400),
    mound: inst(MOUND, snowMat, 1400),
    patch: inst(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: blobTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), 500, false),
    tuft: inst(crossQuads(), new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), 3000, false),
  };
  I.patch.renderOrder = 1;
  const SH = {   // round tree = a 20-tri icosahedron over the crowns, pine = an open 8-tri cone, bush = a squashed icosahedron
    frost: shadowProxy(scene, new THREE.IcosahedronGeometry(1.9, 0).scale(1, 1.05, 1).translate(0, 3.25, 0), 260),
    pine: shadowProxy(scene, new THREE.ConeGeometry(2.2, 6.6, 8, 1, true).translate(0, 4.5, 0), 260),
    bush: shadowProxy(scene, new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.85, 1).translate(0, 0.55, 0), 400),
  };
  const c = new THREE.Color();
  const put = (im, m, col) => { if (im.count >= im.instanceMatrix.count) return false; im.setMatrixAt(im.count, m); if (col) im.setColorAt(im.count, col); im.count++; return true; };
  return {
    tree(kind, x, z, s = rr(0.8, 1.35)) {
      const m = T(x, groundH(x, z), z, s, s * rr(0.9, 1.2), s, 0, rand() * 6, 0);
      if (!put(I[kind], m, c.setScalar(rr(0.9, 1.05)))) return false;
      put(SH[kind], m); return true;
    },
    mound(x, z, sx, sy, sz, y) { return put(I.mound, T(x, (y ?? groundH(x, z)) + 0.05, z, sx, sy, sz, 0, rand() * 6, 0)); },
    /** kind 'grass' | 'dirt' */
    patch(x, z, r, kind = 'grass', tufts = 6) {
      const col = kind === 'grass' ? c.set(pickCol(['#6f7a52', '#7c845a', '#66704e'])) : c.set(pickCol(['#7a5a46', '#6b4d3c', '#85654e']));
      put(I.patch, T(x, groundH(x, z) + 0.05, z, r, 1, r * rr(0.7, 1.2), 0, rand() * 6, 0), col);
      if (kind === 'grass') for (let k = 0; k < tufts; k++) {
        const a = rand() * 6.28, d = Math.sqrt(rand()) * r * 0.7, tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d, s = rr(0.5, 1.0);
        put(I.tuft, T(tx, groundH(tx, tz), tz, s, s * rr(0.7, 1.2), s, 0, rand() * 6, 0), c.set('#ffffff').multiplyScalar(rr(0.75, 1)));
      }
    },
  };
}
const pickCol = a => a[Math.floor(rand() * a.length)];
function crossQuads() {
  const a = new THREE.PlaneGeometry(0.8, 0.6).translate(0, 0.3, 0), b = a.clone().rotateY(Math.PI / 2);
  const g = new Batch(); g.add(a, '#fff', null, 0); g.add(b, '#fff', null, 0);
  const geo = g.geometry(); geo.deleteAttribute('color');
  // uvs for the blade texture
  const uv = []; for (const p of [a, b]) uv.push(...p.toNonIndexed().attributes.uv.array);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
