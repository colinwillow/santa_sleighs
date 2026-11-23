// ?scene=destruct -- THE GINGERBREAD DEMOLITION TEST: three breakable gingerbread houses on snow.
// Hold anywhere (or Space) = machine-gun toward the finger / screen centre; drag = orbit; BLAST = a big explosion where you
// last aimed; RESET rebuilds. The chip top-right shows the frame's tris + draw calls.
import * as THREE from 'three';
import { makePost } from './post.js';
import { applyLook, addInk, lookChip, initialLook, LOOK } from './look.js';
import { buildBreakableHouse, DESTRUCT } from './destruct.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef0f8');
scene.fog = new THREE.Fog('#eef0f8', 45, 110);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
const post = makePost(renderer, scene, camera);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.resize(); });

// snowy floor + light
const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fbfcff', roughness: 1 }));
floor.receiveShadow = true; scene.add(floor);
scene.add(new THREE.HemisphereLight('#ffffff', '#cfc6d8', 1.35));
const sun = new THREE.DirectionalLight('#fff1dc', 1.9); sun.position.set(14, 22, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 }); scene.add(sun);
const flashLight = new THREE.PointLight('#ffb060', 0, 26, 2); scene.add(flashLight);

// houses
const LAYOUT = [
  { x: -10.5, z: 1.5, ry: 0.4, seed: 11, w: 6.2, d: 5.8, floors: 1 },
  { x: 0, z: -4.5, ry: 0, seed: 23, w: 9.2, d: 8, floors: 2 },
  { x: 10.5, z: 1, ry: -0.45, seed: 37, w: 7.4, d: 6.6, floors: 2 },
];
function buildAll() {
  DESTRUCT.clear();
  for (const o of LAYOUT) { const H = buildBreakableHouse(scene, o); addInk(H.group, 0.03); }
  if (!inked) { addInk(DESTRUCT.debris.mesh, 0.025); inked = true; }
  applyLook(scene, LOOK.mode);
}
let inked = false;
const setLook = lookChip(m => applyLook(scene, m));
buildAll();
setLook(initialLook('lit'));

// UI
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;right:calc(env(safe-area-inset-right) + 12px);bottom:calc(env(safe-area-inset-bottom) + 14px);display:flex;flex-direction:column;gap:10px;align-items:flex-end;z-index:5';
document.body.appendChild(ui);
const btn = (label, bg, size) => {
  const b = document.createElement('div'); b.textContent = label;
  b.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;display:grid;place-items:center;font:800 14px/1 ui-rounded,system-ui,sans-serif;color:#fff;letter-spacing:.04em;background:${bg};border:3px solid #fff9;box-shadow:0 3px 0 #0003;user-select:none;-webkit-user-select:none;touch-action:none`;
  ui.appendChild(b); return b;
};
const blastB = btn('BLAST', 'radial-gradient(circle at 40% 35%, #ff8a4b, #c2281c)', 88);
const resetB = btn('RESET', 'radial-gradient(circle at 40% 35%, #7fe6a5, #18804a)', 64);
const chip = document.createElement('div');
chip.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:calc(env(safe-area-inset-right) + 10px);z-index:5;font:700 12px/1.35 ui-monospace,monospace;color:#3a2a20;background:#ffffffcc;border-radius:10px;padding:6px 9px;text-align:right;pointer-events:none';
document.body.appendChild(chip);
const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left) + 12px);bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:5;font:700 13px/1.35 ui-rounded,system-ui,sans-serif;color:#5a3a2a;opacity:.75;pointer-events:none;max-width:52vw';
hint.textContent = 'hold: shoot · drag: orbit · space: shoot centre';
document.body.appendChild(hint);

// input: hold = fire at the finger; once it drags, it orbits instead
const ORB = { a: 0.15, h: 10, r: 31, tx: 0, ty: 3.2, tz: -1.5 };
const aim = { x: innerWidth / 2, y: innerHeight / 2 };
let ptr = null, firing = false, spaceFire = false, lastAim = null;
renderer.domElement.addEventListener('pointerdown', e => {
  if (ptr) return;
  ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, drag: false };
  aim.x = e.clientX; aim.y = e.clientY; firing = true;
});
addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (!ptr.drag && Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) > 14) { ptr.drag = true; firing = false; }
  if (ptr.drag) {
    ORB.a -= (e.clientX - ptr.x) * 0.006; ORB.h = Math.max(1.5, Math.min(26, ORB.h + (e.clientY - ptr.y) * 0.04));
  } else { aim.x = e.clientX; aim.y = e.clientY; }
  ptr.x = e.clientX; ptr.y = e.clientY;
});
const up = e => { if (ptr && e.pointerId === ptr.id) { ptr = null; firing = false; } };
addEventListener('pointerup', up); addEventListener('pointercancel', up);
addEventListener('keydown', e => { if (e.code === 'Space') { spaceFire = true; e.preventDefault(); } });
addEventListener('keyup', e => { if (e.code === 'Space') spaceFire = false; });
blastB.addEventListener('pointerdown', e => { e.stopPropagation(); blast(); });
resetB.addEventListener('pointerdown', e => { e.stopPropagation(); buildAll(); });

// shooting
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function target(sx, sy, spread = 0) {
  ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
  ndc.x += (Math.random() - 0.5) * spread; ndc.y += (Math.random() - 0.5) * spread;
  ray.setFromCamera(ndc, camera);
  const h = DESTRUCT.raycast(ray);
  if (h) return { point: h.point.clone(), house: true };
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(groundPlane, p) && p.distanceTo(camera.position) < 150) return { point: p, house: false };
  return { point: ray.ray.at(120, new THREE.Vector3()), house: false, sky: true };
}
const tracerGeo = new THREE.CapsuleGeometry(0.06, 1, 2, 6);
const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.6, 1.1), toneMapped: false });
const tracers = [];
for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(tracerGeo, tracerMat); m.visible = false; m.userData.ink = false; m.userData.t = null; scene.add(m); tracers.push(m); }
let tracerI = 0;
const Y = new THREE.Vector3(0, 1, 0), muzzleOff = new THREE.Vector3(1.4, -1.3, -2);
function shoot(sx, sy) {
  const tg = target(sx, sy, 0.012);
  const from = muzzleOff.clone().applyMatrix4(camera.matrixWorld);
  const dir = tg.point.clone().sub(from); const dist = dir.length(); dir.multiplyScalar(1 / dist);
  const m = tracers[tracerI]; tracerI = (tracerI + 1) % tracers.length;
  m.userData.t = { from, dir, dist, s: 0, tg }; m.visible = true;
  m.quaternion.setFromUnitVectors(Y, dir); m.scale.set(1, 2.6, 1);
  window.sfx?.play('gun_shot');
  if (tg.house) lastAim = tg.point.clone();
}
function landTracer(t) {
  if (t.tg.house) DESTRUCT.hitAt(t.tg.point, 0.32, 1, { dir: t.dir });
  else if (!t.tg.sky) DESTRUCT.burst(t.tg.point, { kind: 'snow', n: 6, speed: 3 });
}

// blast: big radius, a flash, a camera kick
const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.8, 0.7), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), flashMat); flash.visible = false; flash.userData.ink = false; scene.add(flash);
let flashT = -1, shake = 0;
function blast(at) {
  let p = at || lastAim;
  if (!p) { const tg = target(innerWidth / 2, innerHeight / 2); p = tg.point; }
  flash.position.copy(p); flash.visible = true; flashT = 0;
  flashLight.position.copy(p).y += 0.5;
  DESTRUCT.hitAt(p, 3.2, 30, {});
  window.sfx?.play('explosion');
  shake = 0.6;
  lastAim = null;
}

let last = performance.now(), cd = 0, infoT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // fire at ~12/s
  cd -= dt;
  const want = firing || spaceFire;
  while (want && cd <= 0) { cd += 1 / 12; if (spaceFire && !firing) shoot(innerWidth / 2, innerHeight / 2); else shoot(aim.x, aim.y); }
  if (!want) cd = Math.max(cd, 0);
  for (const m of tracers) {
    const t = m.userData.t; if (!t) continue;
    t.s += 170 * dt;
    if (t.s >= t.dist) { landTracer(t); m.userData.t = null; m.visible = false; continue; }
    m.position.copy(t.from).addScaledVector(t.dir, Math.max(0, t.s - 1.3));
  }
  if (flashT >= 0) {
    flashT += dt; const k = flashT / 0.4;
    flash.scale.setScalar(0.6 + 4 * Math.sqrt(Math.min(1, k))); flashMat.opacity = Math.max(0, 1 - k) ** 2;
    flashLight.intensity = Math.max(0, 1 - k * 1.3) * 400;
    if (k >= 1) { flash.visible = false; flashT = -1; flashLight.intensity = 0; }
  }
  DESTRUCT.update(dt);
  shake = Math.max(0, shake - dt * 2.2);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  camera.position.set(ORB.tx + Math.sin(ORB.a) * ORB.r + sx, ORB.h + sy, ORB.tz + Math.cos(ORB.a) * ORB.r);
  camera.lookAt(ORB.tx, ORB.ty, ORB.tz);
  camera.updateMatrixWorld();
  renderer.info.reset();
  post.render();
  infoT -= dt;
  if (infoT <= 0) {
    infoT = 0.5; const st = DESTRUCT.stats();
    chip.innerHTML = `${(renderer.info.render.triangles / 1000).toFixed(1)}k tris · ${renderer.info.render.calls} draws<br>pieces ${st.alive}/${st.total} · debris ${st.debris} (${st.moving} moving)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// test hooks: an instant (tracer-less) shot, and stepping the sim without frames
const instantShot = (sx, sy) => { const tg = target(sx, sy, 0.012); if (!tg.house) return null; const dir = tg.point.clone().sub(camera.position).normalize(); return DESTRUCT.hitAt(tg.point, 0.32, 1, { dir }); };
const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) DESTRUCT.update(dt); };
window.__destruct = { instantShot, step, DESTRUCT, scene, camera, renderer, ORB, shoot, blast, buildAll, aim, setFiring: v => { firing = v; } };
