// ?scene=destruct -- THE GINGERBREAD DEMOLITION TEST: three breakable gingerbread houses (built from the kit) on snow.
// ?kit=1 (or the KIT button) = the module kit laid out on its own, like his sheet.
// Hold anywhere (or Space) = machine-gun toward the finger / screen centre; drag = orbit; BLAST = a big explosion where you
// last aimed; RESET rebuilds. The chip top-right shows the frame's tris + draw calls (+ near/far houses).
// LOD: every house is placed as its cheap FAR version (placeHouse); the breakable one is built when the camera comes close or a
// shot reaches it. A ring of far-only houses stands out at ~80 m. THE HERO HOUSE (centre back) has a cosy lit room inside with
// the caught-in-the-act gag: shoot the wall open between you and the bed and they freeze. NAUGHTY chip = CONTENT level.
import * as THREE from 'three';
import { makePost } from './post.js';
import { applyLook, addInk, lookChip, initialLook, LOOK } from './look.js';
import { buildBreakableHouse, buildKit, buildFarHouse, placeHouse, DESTRUCT, GB } from './destruct.js';
import { caughtInTheAct, CONTENT } from './gag.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f8f1e8');          // a warm white backdrop, like his ref
scene.fog = new THREE.Fog('#f8f1e8', 70, 190);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
const post = makePost(renderer, scene, camera);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.resize(); });

// snowy floor + GOLDEN-HOUR light (his ref): a warm low key from the front-left, a peach fill from the right, a warm rim behind
const floor = new THREE.Mesh(new THREE.CircleGeometry(170, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f6f7fc', roughness: 1, emissive: '#fff6ee', emissiveIntensity: 0.22 }));
floor.receiveShadow = true; scene.add(floor);
scene.add(new THREE.HemisphereLight('#fff0dc', '#b89078', 0.75));
const sun = new THREE.DirectionalLight('#ffcf9c', 2.1); sun.position.set(-9, 13, 17); sun.castShadow = true;
const fill = new THREE.DirectionalLight('#ffd6b0', 0.45); fill.position.set(16, 6, 5); scene.add(fill);
const rim = new THREE.DirectionalLight('#ffe2b8', 0.7); rim.position.set(-5, 9, -16); scene.add(rim);
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 }); scene.add(sun);
const flashLight = new THREE.PointLight('#ffb060', 0, 26, 2); scene.add(flashLight);

// houses: three variations assembled from the kit, placed on the module grid (GB.mod)
const g = GB.mod;
const LAYOUT = [
  { x: -4 * g, z: 1 * g, ry: 0.42, seed: 11, nx: 2, nz: 2, floors: 1, dormer: false, chimney: 1, awning: '#2f9a4a', front: ['swirl', 'door'] },
  { x: 0, z: -1 * g, ry: 0, seed: 23, nx: 2, nz: 2, floors: 1, dormer: true, chimney: -1, awning: '#e3283a', interior: true, hero: true },
  { x: 4 * g, z: 1 * g, ry: -0.42, seed: 37, nx: 3, nz: 2, floors: 2, dormer: true, chimney: 1, awning: '#ff7ab8', door: '#2f8a4a',
    front: ['lattice', 'door', 'flake'], left: ['window', 'plain'], right: ['plain', 'window'] },
];
// the far ring: houses that stay far (a village on the horizon) -- the LOD's whole point
const RING = Array.from({ length: 7 }, (_, k) => { const a = k / 7 * Math.PI * 2 + 0.3, r = 78 + (k % 3) * 9;
  return { x: Math.sin(a) * r, z: Math.cos(a) * r, ry: -a + Math.PI + (k % 2 ? 0.4 : -0.3), seed: 100 + k * 7, nx: 2 + (k % 3 === 2), nz: 2, floors: 1 + (k % 4 === 1),
    dormer: k % 2 === 0, chimney: k % 3 ? 1 : -1, awning: GB.candy[k % 4] }; });
let kitMode = new URLSearchParams(location.search).get('kit') === '1';
let hero = null, gag = null, heroHit = false, gagT = 0;
const roomLight = new THREE.PointLight('#ffad62', 0, 6.5, 1.6); scene.add(roomLight);
const losRay = new THREE.Raycaster();
function dropGag() { if (gag) { gag.group.removeFromParent(); gag = null; } roomLight.intensity = 0; }
/** the hero's room: the bed against the back wall, left of the door; a warm lamp glow inside */
function makeGag(H) {
  dropGag(); heroHit = false;
  const lp = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(H.group.matrixWorld);
  // the bed: head against the back wall, foot toward the front-left panel (a hole there looks them in the face)
  const sc = 0.9, Dt = H.info.Dt, bz = -Dt / 2 + GB.wallT + 0.14 + sc;
  const at = lp(-1.05, GB.base + 0.05, bz);
  gag = caughtInTheAct(scene, { x: at.x, y: at.y, z: at.z, ry: H.group.rotation.y, scale: sc });
  roomLight.position.copy(lp(0.2, GB.base + 1.9, -0.3)); roomLight.intensity = 7;
  if (gag) applyLook(gag.group, LOOK.mode);
}
DESTRUCT.onNear = (H, e) => { addInk(H.group, 0.03); applyLook(H.group, LOOK.mode); if (e.o.hero) makeGag(H); };
DESTRUCT.onFar = (H, e) => { if (e.o.hero) dropGag(); };
function buildAll() {
  DESTRUCT.clear(); dropGag(); hero = null;
  if (kitMode) { const H = buildKit(scene, { x: 0, z: -1 }); addInk(H.group, 0.03); }
  else {
    for (const o of LAYOUT) { const e = placeHouse(scene, o); if (o.hero) hero = e; }
    for (const o of RING) placeHouse(scene, o);
  }
  if (!inked) { addInk(DESTRUCT.debris.mesh, 0.025); inked = true; }
  applyLook(scene, LOOK.mode);
}
/** after a hit on the hero house: can the camera see the bed now? (no solid / glass left between) -> they're caught */
function checkGag(dt) {
  if (!gag || gag.state !== 'busy' || !heroHit || !hero?.near) return;
  gagT -= dt; if (gagT > 0) return; gagT = 0.12;
  const f = gag.focus(), from = camera.position.clone(), dir = f.clone().sub(from), d = dir.length(); dir.multiplyScalar(1 / d);
  losRay.set(from, dir); losRay.far = d;
  const hits = losRay.intersectObjects([hero.near.solid, hero.near.glow], false);
  if (!hits.length || hits[0].distance > d - 0.3) gag.trigger();
}
const noteHit = p => { if (hero && p.distanceTo(hero.center) < hero.radius) heroHit = true; };
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
const kitB = btn('KIT', 'radial-gradient(circle at 40% 35%, #ffd36b, #c98a12)', 56);
const chip = document.createElement('div');
chip.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:calc(env(safe-area-inset-right) + 10px);z-index:5;font:700 12px/1.35 ui-monospace,monospace;color:#3a2a20;background:#ffffffcc;border-radius:10px;padding:6px 9px;text-align:right;pointer-events:none';
document.body.appendChild(chip);
// NAUGHTY: the CONTENT level for the hidden gags (off | cheeky | censored | spicy); rebuilds the street
const naughty = document.createElement('div');
naughty.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 108px);left:calc(env(safe-area-inset-left) + 8px);z-index:5;' +
  'font:700 12px/1 ui-rounded,system-ui,sans-serif;color:#fff;background:#b8304acc;border:2px solid #fff8;border-radius:12px;padding:6px 10px;user-select:none;-webkit-user-select:none';
const showNaughty = () => { naughty.textContent = 'NAUGHTY: ' + CONTENT.level.toUpperCase(); };
naughty.addEventListener('pointerdown', e => { e.stopPropagation(); const L = CONTENT.LEVELS; CONTENT.set(L[(L.indexOf(CONTENT.level) + 1) % L.length]); showNaughty(); buildAll(); });
showNaughty(); document.body.appendChild(naughty);
const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left) + 12px);bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:5;font:700 13px/1.35 ui-rounded,system-ui,sans-serif;color:#5a3a2a;opacity:.75;pointer-events:none;max-width:52vw';
hint.textContent = 'hold: shoot · drag: orbit · space: shoot centre';
document.body.appendChild(hint);

// input: hold = fire at the finger; once it drags, it orbits instead
const ORB_HOUSES = { a: 0.15, h: 10, r: 31, tx: 0, ty: 2.8, tz: 0 }, ORB_KIT = { a: 0, h: 21, r: 20, tx: 0, ty: 0, tz: -0.6 };
const ORB = { ...(kitMode ? ORB_KIT : ORB_HOUSES) };
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
kitB.addEventListener('pointerdown', e => { e.stopPropagation(); kitMode = !kitMode; Object.assign(ORB, kitMode ? ORB_KIT : ORB_HOUSES); buildAll(); });

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
  if (t.tg.house) { DESTRUCT.hitAt(t.tg.point, 0.32, 1, { dir: t.dir }); noteHit(t.tg.point); }
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
  DESTRUCT.hitAt(p, 3.2, 30, {}); noteHit(p);
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
  DESTRUCT.update(dt, camera);
  checkGag(dt); gag?.update(dt, camera);
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
    chip.innerHTML = `${(renderer.info.render.triangles / 1000).toFixed(1)}k tris · ${renderer.info.render.calls} draws<br>pieces ${st.alive}/${st.total} · debris ${st.debris} (${st.moving} moving)` +
      `<br>houses near ${st.houses} · far ${st.far}${gag ? ' · gag ' + gag.state : ''}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// test hooks: an instant (tracer-less) shot, and stepping the sim without frames
const instantShot = (sx, sy) => { const tg = target(sx, sy, 0.012); if (!tg.house) return null; const dir = tg.point.clone().sub(camera.position).normalize(); noteHit(tg.point); return DESTRUCT.hitAt(tg.point, 0.32, 1, { dir }); };
const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) DESTRUCT.update(dt); };
window.__destruct = { get hero() { return hero; }, get gag() { return gag; }, checkGag, noteHit, buildFarHouse, placeHouse, CONTENT, roomLight, post, solo: (i = 1, extra = {}) => { DESTRUCT.clear(); dropGag(); const H = buildBreakableHouse(scene, { ...LAYOUT[i], x: 0, z: 0, ry: 0, ...extra }); addInk(H.group, 0.03); applyLook(scene, LOOK.mode); return H.tris; }, buildKit, setKit: v => { kitMode = v; Object.assign(ORB, v ? ORB_KIT : ORB_HOUSES); buildAll(); }, instantShot, step, DESTRUCT, scene, camera, renderer, ORB, shoot, blast, buildAll, aim, setFiring: v => { firing = v; } };
