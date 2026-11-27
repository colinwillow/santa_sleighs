// ?scene=sandbox -- THE WHITE SANDBOX: the characters and the gun on a white floor, flat illustration look by default.
// Tap a character's button to step through its clips; hold FIRE to shoot; drag to orbit; the LOOK chip flips flat/lit.
import * as THREE from 'three';
import { makePost } from './post.js';
import { softDot } from './util.js';
import { loadModels, makeSanta, makeElf, buildGun } from './characters.js';
import { applyLook, addInk, lookChip, initialLook } from './look.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f7f3ec');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
const post = makePost(renderer, scene, camera);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.resize(); });

// floor + light (the light only matters in LIT)
const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }));
floor.receiveShadow = true; scene.add(floor);
scene.add(new THREE.HemisphereLight('#ffffff', '#d8d0c8', 1.4));
const sun = new THREE.DirectionalLight('#fff4e0', 1.6); sun.position.set(4, 9, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);
const blob = (x, z, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), color: '#8a7a70', transparent: true, opacity: 0.35, depthWrite: false })); m.position.set(x, 0.01, z); m.userData.ink = false; scene.add(m); return m; };

// UI
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 10px);display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 10px;z-index:5';
document.body.appendChild(ui);
const btn = (label, bg) => { const b = document.createElement('div'); b.textContent = label; b.style.cssText = `font:800 13px/1 ui-rounded,system-ui,sans-serif;color:#fff;background:${bg};border-radius:14px;padding:11px 13px;user-select:none;-webkit-user-select:none;box-shadow:0 2px 0 #0003`; ui.appendChild(b); return b; };
const status = document.createElement('div');
status.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 6px);left:calc(env(safe-area-inset-left) + 8px);font:600 12px/1 ui-monospace,monospace;color:#3a8;z-index:5';
status.textContent = 'sandbox: loading models...'; document.body.appendChild(status);

const setLook = lookChip(m => applyLook(scene, m));

// orbit
const ORB = { a: 0.35, h: 1.6, r: 8.5, drag: null };
renderer.domElement.addEventListener('pointerdown', e => { ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (!ORB.drag) return; ORB.a -= (e.clientX - ORB.drag.x) * 0.006; ORB.h = Math.max(0.3, Math.min(8, ORB.h + (e.clientY - ORB.drag.y) * 0.02)); ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { ORB.drag = null; });

const M = await loadModels();
status.textContent = 'sandbox';
const santa = makeSanta(M.santa); santa.holder.position.set(0, 0, 0); scene.add(santa.holder); blob(0, 0, 0.9);
const elfA = makeElf(M.elf, { role: 'idle' }); elfA.holder.position.set(-2.3, 0, 0.6); elfA.holder.rotation.y = 0.3; scene.add(elfA.holder); blob(-2.3, 0.6, 0.6);
const elfB = makeElf(M.elf2 || M.elf, { role: 'samba' }); elfB.holder.position.set(2.3, 0, 0.6); elfB.holder.rotation.y = -0.3; scene.add(elfB.holder); blob(2.3, 0.6, 0.6);
// the gun on its own, turning on a plinth behind them
const show = buildGun(); show.g.scale.setScalar(1.3); const showPivot = new THREE.Group(); showPivot.position.set(0, 1.4, -3.2); showPivot.add(show.g); scene.add(showPivot);
show.g.position.z = -1.2;
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.9, 24), new THREE.MeshStandardMaterial({ color: '#efe8de' })); plinth.position.set(0, 0.45, -3.2); scene.add(plinth);
scene.traverse(o => { if (o.isMesh && o !== floor) o.castShadow = true; });
for (const c of [santa.holder, elfA.holder, elfB.holder, showPivot, plinth]) addInk(c);
setLook(initialLook('flat'));

// clip stepping
const stepper = (who, name, bg) => {
  const roles = who.anim.roles.filter(r => r !== 'fire');
  let i = Math.max(0, roles.indexOf(who.anim.role));
  const b = btn(`${name}: ${roles[i]}`, bg);
  b.addEventListener('pointerdown', e => { e.stopPropagation(); i = (i + 1) % roles.length; b.textContent = `${name}: ${roles[i]}`; if (who.setIdle) who.setIdle(roles[i]); else who.anim.play(roles[i]); });
};
stepper(elfA, 'ELF 1', '#2f8f4a'); stepper(santa, 'SANTA', '#c42a2a'); stepper(elfB, 'ELF 2', '#2f8f4a');
const fire = btn('HOLD: FIRE', '#e07a1a');
let firing = false, cd = 0;
fire.addEventListener('pointerdown', e => { e.stopPropagation(); firing = true; });
addEventListener('pointerup', () => { firing = false; });
addEventListener('keydown', e => { if (e.code === 'Space') firing = true; });
addEventListener('keyup', e => { if (e.code === 'Space') firing = false; });

let last = performance.now(), t = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  santa.setFiring(firing);
  cd -= dt; if (firing && cd <= 0) { cd = santa.rate; santa.kick(); }
  santa.update(dt, t); elfA.update(dt, t); elfB.update(dt, t);
  showPivot.rotation.y += dt * 0.5; show.updBelt(t);
  if (!ORB.drag) ORB.a += dt * 0.04;
  camera.position.set(Math.sin(ORB.a) * ORB.r, ORB.h + 0.6, Math.cos(ORB.a) * ORB.r);
  camera.lookAt(0, 1.05, 0);
  post.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__sandbox = { santa, elfA, elfB, scene, camera, renderer, ORB };
