// LOOK: the illustration mode. FLAT = every lit material becomes self-illuminated (its texture / colour shown as-is, no
// light, no shade), plus ink outlines on characters + props (inverted hulls that follow skinning). LIT = the original
// materials. A taste switch: `?look=flat|lit`, the FLAT/LIT chip, remembered on the phone.
import * as THREE from 'three';

export const LOOK = { mode: 'lit', ink: '#3a2420', inkWidth: 0.014 };

const flatCache = new WeakMap();
function flatOf(m) {
  if (!m || m.isMeshBasicMaterial || m.isShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial) return m;
  if (flatCache.has(m)) return flatCache.get(m);
  const f = new THREE.MeshBasicMaterial({
    map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, vertexColors: m.vertexColors,
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite,
    alphaMap: m.alphaMap || null, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, blending: m.blending,
  });
  // keep anything that glows glowing
  if (m.emissive && (m.emissiveIntensity || 0) > 0 && m.emissive.getHex() !== 0) f.color.copy(m.emissive).multiplyScalar(Math.max(1, m.emissiveIntensity));
  f.name = (m.name || '') + ':flat';
  flatCache.set(m, f);
  return f;
}

/** swap every mesh in `root` between lit and flat */
export function applyLook(root, mode) {
  LOOK.mode = mode;
  root.traverse(o => {
    if (!o.isMesh || o.userData.ink) return;
    if (!o.userData.litMat) o.userData.litMat = o.material;
    const lit = o.userData.litMat;
    o.material = mode === 'flat' ? (Array.isArray(lit) ? lit.map(flatOf) : flatOf(lit)) : lit;
  });
  root.traverse(o => { if (o.userData.ink) o.visible = mode === 'flat'; });
}

const inkMats = new Map();
function inkMat(width) {
  const k = width.toFixed(5);
  if (inkMats.has(k)) return inkMats.get(k);
  const m = new THREE.MeshBasicMaterial({ color: LOOK.ink, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uInk = { value: width };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uInk;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  transformed += normalize(objectNormal) * uInk;\n#else\n  transformed += normalize(normal) * uInk;\n#endif');
  };
  // objectNormal must exist even without normals in the basic shader's path
  m.customProgramCacheKey = () => 'ink' + k;
  inkMats.set(k, m);
  return m;
}

/** add ink outlines (inverted hull) to every mesh under `root`; width in world metres */
export function addInk(root, width = LOOK.inkWidth) {
  const list = [];
  root.traverse(o => { if (o.isMesh && !o.userData.ink && !o.isInstancedMesh && o.geometry.attributes.normal) list.push(o); });
  const ws = new THREE.Vector3();
  for (const o of list) {
    o.updateWorldMatrix(true, false); o.getWorldScale(ws);
    const w = width / Math.max(1e-6, ws.x);
    let hull;
    if (o.isSkinnedMesh) { hull = new THREE.SkinnedMesh(o.geometry, inkMat(w)); hull.bind(o.skeleton, o.bindMatrix); hull.bindMode = o.bindMode; }
    else hull = new THREE.Mesh(o.geometry, inkMat(w));
    hull.userData.ink = true; hull.frustumCulled = false; hull.castShadow = false; hull.visible = LOOK.mode === 'flat';
    hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale);
    o.parent.add(hull);
    // follow the source if it moves on its own
    hull.onBeforeRender = () => { hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale); };
  }
}

/** the chip that flips the look; remembers the choice */
export function lookChip(onChange) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 28px);left:calc(env(safe-area-inset-left) + 8px);z-index:5;' +
    'font:700 12px/1 ui-rounded,system-ui,sans-serif;color:#fff;background:#0006;border:2px solid #fff8;border-radius:12px;padding:6px 10px;pointer-events:auto';
  const set = m => { el.textContent = m === 'flat' ? 'LOOK: FLAT' : 'LOOK: LIT'; try { localStorage.setItem('look', m); } catch (e) {} onChange(m); };
  el.addEventListener('pointerdown', e => { e.stopPropagation(); set(LOOK.mode === 'flat' ? 'lit' : 'flat'); });
  document.body.appendChild(el);
  return set;
}
export function initialLook(fallback) {
  const q = new URLSearchParams(location.search).get('look');
  if (q === 'flat' || q === 'lit') return q;
  try { const s = localStorage.getItem('look'); if (s === 'flat' || s === 'lit') return s; } catch (e) {}
  return fallback;
}
