// Santa Sleighs -- boot, camera, the loop. Systems live in their own modules:
//   world.js (the snow diorama), sleigh.js (reindeer team + rope-tethered sleigh), rope.js, input.js.
import * as THREE from 'three';
import { buildWorld, groundH, softDot } from './world.js';
import { MENU_SPOT } from './terrain.js';
import { buildRig, FLY } from './sleigh.js';
import { input, pollInput, showReticle } from './input.js';
import { makePost } from './post.js';
import { loadCrew } from './crew.js';
import { applyLook, addInk, LOOK, initialLook } from './look.js';
import { makeMenus } from './menu.js';
import { WEAPONS, ORDER, makeShots, loadGuns, heldGun } from './weapons.js';
import { CONTENT } from './gag.js';
import { loadModels, makeSanta, makeElf } from './characters.js';
// sound is optional: if src/audio.js is missing or fails, the game stays silent instead of blank
const sfx = (n, o) => window.sfx?.play(n, o);
import('./audio.js').catch(() => {});

export const BUILD = 19;
document.getElementById('bnum').textContent = BUILD;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 3000);
const params = new URLSearchParams(location.search);
const MODE = params.get('scene') === 'kit' ? 'kit' : 'village';
const post = makePost(renderer, scene, camera);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  post.resize();
});

const world = buildWorld(scene, camera, { mode: MODE });
const rig = buildRig(scene, world.colliders);
// the look: LIT (shaded) or FLAT (self-lit textures + ink outlines) -- his switch (OPTIONS / DEBUG), remembered
const setLook = m => { applyLook(scene, m); try { localStorage.setItem('look', m); } catch (e) {} };

// ---- game state: 'menu' (start screen over the live scene), 'play', 'pause' ----------------------------------
const direct = MODE === 'kit' || params.has('cam') || params.get('play') === '1';
let STATE = direct ? 'play' : 'menu', slow = 1, dbgHud = false, camOverride = null;
const setState = s => { STATE = s; document.body.classList.toggle('play', s === 'play'); };
setState(STATE);
const hideBoot = () => document.getElementById('boot').classList.add('gone');
setTimeout(hideBoot, 12000);   // never hold the game hostage to a slow model load
Promise.all([loadCrew(rig, scene), buildMenuCrew()]).then(([c]) => { rig.crew = c; setWeapon(weapon, false); addInk(rig.sleigh.g); for (const d of rig.deer) addInk(d.g); setLook(initialLook('lit')); setTimeout(hideBoot, 300); }).catch(e => { hideBoot(); document.getElementById('build').textContent += ' crew: ' + e.message; });

// ---- THE START SCREEN SCENE: Santa + two elves in the plaza by the big tree, fire pit glow, snow, bloom --------------
const MENU = { spot: new THREE.Vector3(MENU_SPOT.x, 0, MENU_SPOT.z), crew: null, burstT: 3, firing: false, fireCd: 0 };
MENU.spot.y = groundH(MENU.spot.x, MENU.spot.z);
MENU.dir = new THREE.Vector3(MENU.spot.x, 0, MENU.spot.z).normalize();   // from the tree out toward the camera
async function buildMenuCrew() {
  if (MODE === 'kit') return;
  const M = await loadModels();
  const ry = Math.atan2(MENU.dir.x, MENU.dir.z), side = new THREE.Vector3(MENU.dir.z, 0, -MENU.dir.x);
  const santa = makeSanta(M.santa, { role: 'tipsy' });
  santa.holder.position.copy(MENU.spot); santa.holder.rotation.y = ry;
  const a = makeElf(M.elf, { role: 'happy' }), b = makeElf(M.elf, { role: 'wave' });
  a.holder.position.copy(MENU.spot).addScaledVector(side, 1.6).addScaledVector(MENU.dir, -0.4); a.holder.rotation.y = ry - 0.35;
  b.holder.position.copy(MENU.spot).addScaledVector(side, -1.6).addScaledVector(MENU.dir, -0.4); b.holder.rotation.y = ry + 0.35;
  const g = new THREE.Group(); g.add(santa.holder, a.holder, b.holder); scene.add(g);
  for (const h of [santa.holder, a.holder, b.holder]) { h.updateMatrixWorld(true); addInk(h); }
  MENU.crew = { santa, a, b, g };
  g.visible = STATE === 'menu';
}
const menus = makeMenus({
  build: BUILD, sfx: n => sfx(n),
  state: () => STATE,
  play() { setState('play'); menus.hide(); if (MENU.crew) MENU.crew.g.visible = false; camPos.copy(camera.position); camLook.copy(MENU.spot); },
  pause() { if (STATE !== 'play') return; setState('pause'); menus.showPause(); },
  resume() { setState('play'); menus.hide(); },
  mainMenu() { setState('menu'); menus.showStart(); if (MENU.crew) MENU.crew.g.visible = true; },
  go: url => { location.href = url; },
  look: () => LOOK.mode === 'flat' ? 'FLAT' : 'LIT', setLook: v => setLook(v === 'FLAT' ? 'flat' : 'lit'),
  bloom: () => post.enabled ? 'ON' : 'OFF', setBloom: v => { post.enabled = v === 'ON'; },
  volume: () => { const m = window.sfx; if (!m) return 'OFF'; if (m.muted) return 'OFF'; return Math.round(m.master * 100) + '%'; },
  setVolume: v => { const m = window.sfx; if (!m) return; if (v === 'OFF') m.mute(true); else { m.mute(false); m.setMaster(parseInt(v) / 100); } },
  music: () => (localStorage.getItem('music') ?? '1') === '1' ? 'ON' : 'OFF',
  setMusic: v => { try { localStorage.setItem('music', v === 'ON' ? '1' : '0'); } catch (e) {} window.sfx?.setMusic(v === 'ON' ? 0.8 : 0); },
  santa: () => (localStorage.getItem('santa') || 'tough').toUpperCase(),
  setSanta: v => { try { localStorage.setItem('santa', v.toLowerCase()); } catch (e) {} location.reload(); },
  naughty: () => CONTENT.level.toUpperCase(), setNaughty: v => CONTENT.set(v.toLowerCase()),
  dbgHud: () => dbgHud ? 'ON' : 'OFF', setDbgHud: v => { dbgHud = v === 'ON'; if (!dbgHud) menus.hud(null); },
  cam: () => (camOverride || camMode || 'chase').toUpperCase(), setCam: v => { camOverride = v === 'CHASE' ? null : v.toLowerCase(); },
  slow: () => slow + 'x', setSlow: v => { slow = parseFloat(v); },
  resetSleigh: () => { rig.lead.set(0, 40, -120); rig.yaw = 0; rig.pitch = 0; rig.S.set(0, 40, -134); rig.SV.set(0, 0, FLY.speed); for (const d of rig.deer) { d.p.copy(rig.lead); d.v.set(0, 0, FLY.speed); } },
  stats: () => statsText(),
});
if (STATE === 'menu') menus.showStart();
const PERF = { fps: 0, frames: 0, t0: performance.now(), tris: 0, calls: 0 };
function statsText() {
  return `build ${BUILD}  ${PERF.fps.toFixed(0)} fps\ntris ${(PERF.tris / 1000).toFixed(0)}k  draws ${PERF.calls}\nsleigh ${rig.S.toArray().map(v => v.toFixed(0)).join(',')}  ${rig.speed.toFixed(0)} m/s\nlook ${LOOK.mode}  bloom ${post.enabled ? 'on' : 'off'}`;
}

// ---- cookies to fly through (refill milk) -- placeholder pickups ------------------------
const cookieMat = new THREE.MeshStandardMaterial({ color: '#c98a4a', emissive: '#7a4010', emissiveIntensity: 0.6, roughness: 0.8 });
const chipMat = new THREE.MeshStandardMaterial({ color: '#3a2014' });
const cookies = [];
for (let i = 0; i < 24; i++) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 20), cookieMat));
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), chipMat); c.position.set(Math.cos(k * 2.4) * 0.6, 0.16, Math.sin(k * 2.4) * 0.6); g.add(c); }
  g.rotation.x = Math.PI / 2;
  const a = (i / 24) * Math.PI * 2, r = 60 + (i % 3) * 45;
  g.position.set(Math.cos(a) * r, groundH(Math.cos(a) * r, Math.sin(a) * r) + 18 + (i % 4) * 9, Math.sin(a) * r);
  const holder = new THREE.Group(); holder.add(g); holder.position.copy(g.position); g.position.set(0, 0, 0);
  scene.add(holder); cookies.push({ o: holder, alive: true, t: 0 });
}
let cookieCount = 0, milk = 100;
const $cookies = document.getElementById('cookies'), $milk = document.getElementById('milk');

// ---- minigun tracers -----------------------------------------------------------------------
const TR = 80;
const tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe48a').multiplyScalar(3), toneMapped: false }), TR);
tracerMesh.frustumCulled = false; scene.add(tracerMesh);
const tracers = Array.from({ length: TR }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
let trI = 0, fireCd = 0, spin = 0;
const flash = new THREE.PointLight('#ffcc66', 0, 14, 2); scene.add(flash);
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _s1 = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// snow puffs where tracers hit
const PUFF = 200, puffP = new Float32Array(PUFF * 3), puffV = [], puffL = new Float32Array(PUFF);
for (let i = 0; i < PUFF; i++) { puffV.push(new THREE.Vector3()); puffP[i * 3 + 1] = -999; }
const puffG = new THREE.BufferGeometry(); puffG.setAttribute('position', new THREE.BufferAttribute(puffP, 3));
const puffs = new THREE.Points(puffG, new THREE.PointsMaterial({ color: '#ffffff', size: 0.9, map: softDot(), transparent: true, depthWrite: false }));
puffs.frustumCulled = false; scene.add(puffs);
let puffI = 0;
function puff(at) {
  for (let k = 0; k < 6; k++) {
    const i = puffI++ % PUFF;
    puffP[i * 3] = at.x; puffP[i * 3 + 1] = at.y; puffP[i * 3 + 2] = at.z;
    puffV[i].set(Math.random() - 0.5, Math.random() * 1.5 + 0.5, Math.random() - 0.5).multiplyScalar(5); puffL[i] = 0.8;
  }
}

// brass casings flying out of the gun
const CAS = 60, casP = new Float32Array(CAS * 3).fill(-999), casV = Array.from({ length: CAS }, () => new THREE.Vector3()), casL = new Float32Array(CAS);
const casG = new THREE.BufferGeometry(); casG.setAttribute('position', new THREE.BufferAttribute(casP, 3));
const casPts = new THREE.Points(casG, new THREE.PointsMaterial({ color: '#ffc94a', size: 0.12 }));
casPts.frustumCulled = false; scene.add(casPts);
let casI = 0;
const _right = new THREE.Vector3();
function casing(from) {
  const i = casI++ % CAS;
  from.getWorldPosition(_p); casP[i * 3] = _p.x; casP[i * 3 + 1] = _p.y; casP[i * 3 + 2] = _p.z;
  _right.set(-1, 0, 0).applyQuaternion(rig.sleigh.g.quaternion);
  casV[i].copy(rig.SV).addScaledVector(_right, 3 + Math.random() * 2); casV[i].y += 3 + Math.random() * 2; casL[i] = 1.2;
}
function updateCasings(dt) {
  for (let i = 0; i < CAS; i++) {
    if (casL[i] <= 0) continue;
    casL[i] -= dt; casV[i].y -= 18 * dt;
    casP[i * 3] += casV[i].x * dt; casP[i * 3 + 1] += casV[i].y * dt; casP[i * 3 + 2] += casV[i].z * dt;
    if (casL[i] <= 0) casP[i * 3 + 1] = -999;
  }
  casG.attributes.position.needsUpdate = true;
}

// ---- AIM: the right stick moves a reticle round a rest point ahead of the sleigh; the gun shoots at what's under it --------
const AIM = { rest: new THREE.Vector3(), reach: 0.42, sx: 0, sy: 0, target: new THREE.Vector3(), ray: new THREE.Raycaster() };
const _ndc = new THREE.Vector2();
function updateAim(dt) {
  // rest: where the gun points with the stick centred -- ahead of the team, a little down
  AIM.rest.copy(rig.lead).addScaledVector(rig.fwd, 30); AIM.rest.y -= 8;
  const rp = AIM.rest.clone().project(camera);
  let px, py;
  const W = innerWidth, H = innerHeight, reach = AIM.reach * Math.min(W, H);
  if (input.mouse) { px = input.mouse.x; py = input.mouse.y; }
  else {
    // ease the reticle toward rest + stick (a little lag so it feels weighty, not twitchy)
    const wx = input.aimX * reach, wy = -input.aimY * reach, k = 1 - Math.exp(-14 * dt);
    AIM.sx += (wx - AIM.sx) * k; AIM.sy += (wy - AIM.sy) * k;
    px = (rp.x * 0.5 + 0.5) * W + AIM.sx; py = (-rp.y * 0.5 + 0.5) * H + AIM.sy;
  }
  px = THREE.MathUtils.clamp(px, 20, W - 20); py = THREE.MathUtils.clamp(py, 20, H - 20);
  // what's under the reticle: march the camera ray down to the terrain, else a point far along it
  _ndc.set(px / W * 2 - 1, -(py / H) * 2 + 1); AIM.ray.setFromCamera(_ndc, camera);
  const o = AIM.ray.ray.origin, d = AIM.ray.ray.direction; let hit = false;
  for (let s = 2; s < 400; s *= 1.08) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y < groundH(x, z)) { AIM.target.set(x, y, z); hit = true; break; } }
  if (!hit) AIM.target.copy(o).addScaledVector(d, 250);
  return { px, py };
}

// ---- WEAPONS: his four guns; switch with the WEAPON button / 1-4 / Q / gamepad Y; fly through a floating gun to grab it -------
const shots = makeShots(scene, groundH, {
  onBlast: (p, r) => { shake = Math.max(shake, 0.6 * Math.max(0, 1 - p.distanceTo(camera.position) / 120)); },
});
let shake = 0, weapon = (() => { try { const w = localStorage.getItem('weapon'); if (WEAPONS[w]) return w; } catch (e) {} return 'gatling'; })();
const wBtn = document.createElement('div'); wBtn.className = 'btn'; wBtn.id = 'weaponBtn';
wBtn.style.cssText = 'width:auto;height:auto;border-radius:16px;padding:9px 12px;z-index:7;font-size:12px;right:calc(env(safe-area-inset-right) + 12px);bottom:calc(env(safe-area-inset-bottom) + 316px);background:linear-gradient(#5a5f7a,#3a3e56)';
document.getElementById('hud').appendChild(wBtn);
function setWeapon(key, announce = true) {
  weapon = key; try { localStorage.setItem('weapon', key); } catch (e) {}
  wBtn.textContent = '⟳ ' + WEAPONS[key].name;
  rig.crew?.setWeapon(key); MENU.crew?.santa.setWeapon(key);
  if (announce) sfx('cookie_pickup', { rate: 0.75 });
}
const nextWeapon = d => setWeapon(ORDER[(ORDER.indexOf(weapon) + d + ORDER.length) % ORDER.length]);
wBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); nextWeapon(1); });
addEventListener('keydown', e => { const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0) setWeapon(ORDER[n]); if (e.code === 'KeyQ') nextWeapon(1); });
let gpY = false;
function pollWeaponPad() { const gp = navigator.getGamepads?.().find(g => g && g.connected); const y = !!gp?.buttons[3]?.pressed; if (y && !gpY) nextWeapon(1); gpY = y; }
wBtn.textContent = '⟳ ' + WEAPONS[weapon].name;
// pickups: each gun floats over the village on a glowing ring
const pickups = [];
loadGuns().then(gs => {
  ORDER.forEach((key, i) => {
    const a = i / ORDER.length * Math.PI * 2 + 0.7, r = 75, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.Group(); g.position.set(x, groundH(x, z) + 26 + i * 4, z);
    const held = heldGun(gs, key); held.g.scale.multiplyScalar(1.4); held.g.position.z = -1; g.add(held.g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd25a').multiplyScalar(2.5), toneMapped: false }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    scene.add(g); pickups.push({ key, g, held, cd: 0 });
  });
}).catch(() => {});
function updatePickups(dt, t) {
  for (const p of pickups) {
    p.g.rotation.y += dt * 1.2; p.g.position.y += Math.sin(t * 2 + p.g.position.x) * dt * 0.6;
    p.cd -= dt;
    if (p.cd <= 0 && STATE === 'play' && (p.g.position.distanceToSquared(rig.S) < 25 || p.g.position.distanceToSquared(rig.lead) < 25)) {
      p.cd = 3; if (weapon !== p.key) setWeapon(p.key);
    }
  }
}

let wasFiring = false;
function updateGun(dt, t) {
  const firing = STATE === 'play' && input.fire;
  const scr = STATE === 'play' ? updateAim(dt) : null;
  if (scr) showReticle(scr.px, scr.py, firing);
  else { AIM.target.copy(rig.lead).addScaledVector(rig.fwd, 30); AIM.target.y -= 8; }
  if (firing !== wasFiring) { sfx(firing ? 'gun_spinup' : 'gun_spindown', { vol: 0.5 }); wasFiring = firing; }
  const crew = rig.crew;
  // aim ahead of the team, a little down toward the ground
  _p.copy(AIM.target);
  let muzzle, ready = true;
  if (crew) { crew.setFiring(firing); crew.aim(_p); crew.update(dt, t); muzzle = crew.muzzle; }
  else {   // stand-in rail minigun until his models load
    spin += ((firing ? 28 : 0) - spin) * (1 - Math.exp(-(firing ? 4 : 1.5) * dt));
    rig.sleigh.barrels.rotation.z += spin * dt;
    rig.sleigh.mount.updateMatrixWorld(); rig.sleigh.gun.lookAt(_p);
    muzzle = rig.sleigh.muzzle; ready = spin > 18;
  }
  fireCd -= dt;
  flash.intensity *= Math.exp(-30 * dt);
  const W = crew?.def || WEAPONS.gatling;
  if (firing && ready && fireCd <= 0) {
    fireCd = crew ? crew.rate : 0.05;
    if (crew) { crew.kick(); if (W.shot === 'tracer' || W.shot === 'slug') casing(crew.eject); }
    sfx(W.snd, { vol: W.vol, rate: W.sndRate || 1 }); if (W.shot === 'tracer' && Math.random() < 0.3) sfx('casing', { vol: 0.25 });
    const from = muzzle.getWorldPosition(new THREE.Vector3());
    _d.subVectors(AIM.target, from).normalize();   // straight at the reticle's point (the gun swings after it)
    _d.x += (Math.random() - 0.5) * W.spread; _d.y += (Math.random() - 0.5) * W.spread; _d.normalize();
    if (W.shot === 'tracer') {
      const tr = tracers[trI++ % TR];
      tr.p.copy(from); tr.v.copy(_d).multiplyScalar(W.speed).add(rig.SV); tr.life = 1.2;
    } else {
      if (W.shot === 'snowball') _d.y += 0.12;      // lob it a little
      shots.fire(W, from, _d.normalize(), rig.SV.clone().multiplyScalar(0.6));
      if (W.shot === 'rocket') shots.puff(from, '#d8d6e0', 6, 3, 0.8);
    }
    flash.position.copy(from); flash.intensity = W.shot === 'snowball' ? 6 : 25;
  }
  shots.update(dt);
  updateCasings(dt);
  for (let i = 0; i < TR; i++) {
    const tr = tracers[i];
    if (tr.life > 0) {
      tr.life -= dt; tr.p.addScaledVector(tr.v, dt);
      if (tr.p.y < groundH(tr.p.x, tr.p.z)) { puff(tr.p); tr.life = 0; if (Math.random() < 0.25) sfx('snow_puff', { vol: 0.35 }); }
      _q.setFromUnitVectors(Z, _d.copy(tr.v).normalize());
      _m4.compose(tr.p, _q, tr.life > 0 ? _s1 : _zero);
    } else _m4.compose(tr.p, _q.identity(), _zero);
    tracerMesh.setMatrixAt(i, _m4);
  }
  tracerMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < PUFF; i++) {
    if (puffL[i] <= 0) continue;
    puffL[i] -= dt; puffV[i].y -= 6 * dt;
    puffP[i * 3] += puffV[i].x * dt; puffP[i * 3 + 1] += puffV[i].y * dt; puffP[i * 3 + 2] += puffV[i].z * dt;
    if (puffL[i] <= 0) puffP[i * 3 + 1] = -999;
  }
  puffG.attributes.position.needsUpdate = true;
}

// ---- Santa's cigar smoke: puffs left behind in world space as he flies ------------------------------
const CIG = 70, cigP = new Float32Array(CIG * 3).fill(-999), cigV = Array.from({ length: CIG }, () => new THREE.Vector3()), cigL = new Float32Array(CIG);
const cigG = new THREE.BufferGeometry(); cigG.setAttribute('position', new THREE.BufferAttribute(cigP, 3));
const cigPts = new THREE.Points(cigG, new THREE.PointsMaterial({ color: '#d8d6e0', size: 0.7, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false }));
cigPts.frustumCulled = false; scene.add(cigPts);
let cigI = 0, cigT = 0;
const _tip = new THREE.Vector3();
function updateCigar(dt) {
  cigT -= dt;
  if (cigT <= 0) {
    cigT = 0.06;
    (rig.crew?.cigarTip || rig.santa.cigarTip).getWorldPosition(_tip);
    const i = cigI++ % CIG;
    cigP[i * 3] = _tip.x; cigP[i * 3 + 1] = _tip.y; cigP[i * 3 + 2] = _tip.z;
    cigV[i].copy(rig.SV).multiplyScalar(0.15).add(new THREE.Vector3(Math.random() - 0.5, 1.2, Math.random() - 0.5)); cigL[i] = 2.2;
  }
  for (let i = 0; i < CIG; i++) {
    if (cigL[i] <= 0) continue;
    cigL[i] -= dt; cigV[i].multiplyScalar(Math.exp(-1.5 * dt));
    cigP[i * 3] += cigV[i].x * dt; cigP[i * 3 + 1] += cigV[i].y * dt; cigP[i * 3 + 2] += cigV[i].z * dt;
    if (cigL[i] <= 0) cigP[i * 3 + 1] = -999;
  }
  cigG.attributes.position.needsUpdate = true;
}

// ---- chase camera ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 46, -150), camLook = new THREE.Vector3();
// ?cam=diorama : a fixed high three-quarter view of the village (the reference framing)
const DIORAMA = { pos: new THREE.Vector3(-58, 62, 92), look: new THREE.Vector3(8, 0, 8), fov: 40 };
const CAM0 = MODE === 'kit' ? 'orbit' : params.get('cam');
const camMode = CAM0;
// kit showroom: a slow orbit round the lot; drag anywhere to turn it / tilt it
const ORB = { a: 0.6, h: 22, r: 58, drag: null };
addEventListener('pointerdown', e => { if (camMode === 'orbit') ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (!ORB.drag) return; ORB.a -= (e.clientX - ORB.drag.x) * 0.006; ORB.h = Math.max(3, Math.min(70, ORB.h + (e.clientY - ORB.drag.y) * 0.1)); ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => ORB.drag = null);
function updateCamera(dt) {
  if (STATE === 'menu') {   // the start screen: low over the crew, tree + village behind
    // fit the three of them (~4 m wide) in the frame at any aspect; a slow drift side to side
    const tt = performance.now() / 1000, asp = camera.aspect, port = asp < 1;
    const dist = Math.max(7.5, 2.4 / (Math.tan(THREE.MathUtils.degToRad(25)) * asp));
    const side = new THREE.Vector3(MENU.dir.z, 0, -MENU.dir.x);
    camera.position.copy(MENU.spot).addScaledVector(MENU.dir, dist).addScaledVector(side, Math.sin(tt * 0.12) * 1.6 + (port ? 0 : 2.2));
    camera.position.y = MENU.spot.y + 1.5 + Math.sin(tt * 0.09) * 0.2;
    // portrait: the crew in the middle band (logo above, buttons below); landscape: crew left of centre, buttons right
    camera.lookAt(MENU.spot.x + side.x * (port ? 0 : 2.2), MENU.spot.y + (port ? 1.3 : 1.6), MENU.spot.z + side.z * (port ? 0 : 2.2));
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    return;
  }
  const camMode = camOverride || CAM0;
  if (camMode === 'crew') {   // ?cam=crew : a close look at the crew from the front-left of the sleigh
    const g = rig.sleigh.g; g.updateMatrixWorld();
    camera.position.copy(g.localToWorld(new THREE.Vector3(6.5, 5.2, 3.0)));
    camera.lookAt(g.localToWorld(new THREE.Vector3(0, 1.6, 0)));
    if (camera.fov !== 45) { camera.fov = 45; camera.updateProjectionMatrix(); }
    return;
  }
  if (camMode === 'orbit') {
    if (!ORB.drag) ORB.a += dt * 0.07;
    camera.position.set(Math.cos(ORB.a) * ORB.r, ORB.h, Math.sin(ORB.a) * ORB.r);
    camera.lookAt(0, 4, 0);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    return;
  }
  if (camMode === 'diorama') { camera.position.copy(DIORAMA.pos); camera.lookAt(DIORAMA.look); if (camera.fov !== DIORAMA.fov) { camera.fov = DIORAMA.fov; camera.updateProjectionMatrix(); } return; }
  const yawF = _d.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw));
  const want = _p.copy(rig.S).addScaledVector(yawF, -14).add(new THREE.Vector3(0, 7.5 - rig.pitch * 6, 0));
  const gy = groundH(want.x, want.z) + 2; if (want.y < gy) want.y = gy;
  camPos.lerp(want, 1 - Math.exp(-4 * dt));
  const look = new THREE.Vector3().copy(rig.S).lerp(rig.lead, 0.4).addScaledVector(rig.fwd, 4); look.y += 1;
  camLook.lerp(look, 1 - Math.exp(-8 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (shake > 0.001) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-6 * dt); }
  const fov = 62 + (rig.speed - FLY.speed) * 0.55;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---- loop -----------------------------------------------------------------------------------
let last = performance.now(), t = 0;
const AUTO = { steer: 0.3, climb: 0, boost: false, fire: false };   // the sleigh circles the sky behind the start screen
let wasBoost = false, turnCd = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = STATE === 'pause' ? 0 : real * slow; t += dt;
  pollInput();
  if (STATE === 'play') {
    input.boost = input.boost && milk > 0;
    if (input.boost && !wasBoost) sfx('milk_gulp'); wasBoost = input.boost;
    milk = Math.max(0, Math.min(100, milk + (input.boost ? -14 : 3) * dt));
    turnCd -= dt; if (Math.abs(input.steer) > 0.75 && turnCd <= 0) { sfx('whoosh', { vol: 0.5 }); turnCd = 1.4; }
  }
  if (dt > 0) {
    AUTO.climb = THREE.MathUtils.clamp((55 - rig.lead.y) / 20, -1, 1);
    rig.update(dt, STATE === 'play' ? input : AUTO, t);
    updateGun(dt, t);
    updatePickups(dt, t); pollWeaponPad();
    if (STATE === 'menu' && MENU.crew) updateMenuCrew(dt, t);
  }
  for (const c of cookies) {
    c.o.rotation.y += dt * 1.5;
    if (!c.alive) { c.t += dt; c.o.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 8) { c.alive = true; c.t = 0; c.o.scale.setScalar(1); } continue; }
    if (c.o.position.distanceToSquared(rig.S) < 16 || c.o.position.distanceToSquared(rig.lead) < 16) {
      c.alive = false; cookieCount++; milk = Math.min(100, milk + 20); sfx('cookie_pickup');
    }
  }
  $cookies.textContent = cookieCount; $milk.textContent = Math.round(milk);
  if (dt > 0) world.tick(t, dt);
  updateCamera(dt);
  world.snowUpdate(camera.position, t, dt);
  // keep the shadow camera centred on the sleigh
  const cm = camOverride || CAM0, sc = STATE === 'menu' ? MENU.spot : cm === 'diorama' ? DIORAMA.look : cm === 'orbit' ? new THREE.Vector3() : rig.S;
  world.moonLight.target.position.copy(sc);
  world.moonLight.position.copy(sc).add(new THREE.Vector3(-120, 200, -140));
  updateCigar(dt);
  updateSound(real);
  renderer.info.reset();
  post.render();
  PERF.frames++; PERF.tris = renderer.info.render.triangles; PERF.calls = renderer.info.render.calls;
  if (now - PERF.t0 > 500) { PERF.fps = PERF.frames * 1000 / (now - PERF.t0); PERF.frames = 0; PERF.t0 = now; if (dbgHud && STATE === 'play') menus.hud(statsText()); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderer.info.autoReset = false;   // the composer renders several passes a frame; count them all

// ---- the start-screen crew: idle clips, Santa fires a happy burst into the sky now and then --------------------------
const _up = new THREE.Vector3();
function updateMenuCrew(dt, t) {
  const { santa, a, b } = MENU.crew;
  MENU.burstT -= dt;
  if (MENU.burstT <= 0) { MENU.firing = !MENU.firing; MENU.burstT = MENU.firing ? 1.1 : 5 + Math.random() * 3; }
  santa.setFiring(MENU.firing);
  santa.aimAt(_up.copy(MENU.spot).addScaledVector(MENU.dir, 6).add(new THREE.Vector3(Math.sin(t) * 3, 9, 0)));
  MENU.fireCd -= dt;
  if (MENU.firing && MENU.fireCd <= 0) {
    MENU.fireCd = santa.rate; santa.kick(); sfx('gun_shot', { vol: 0.45 });
    const tr = tracers[trI++ % TR];
    santa.muzzle.getWorldPosition(tr.p); santa.muzzle.getWorldQuaternion(_q);
    tr.v.copy(Z).applyQuaternion(_q).multiplyScalar(120); tr.life = 1.2;
    flash.position.copy(tr.p); flash.intensity = 25;
  }
  santa.update(dt, t); a.update(dt, t); b.update(dt, t);
}

// ---- sound: loops follow the state + the flight (all optional: window.sfx may not exist) --------------------------
const SND = { loops: null, acc: 0 };
function updateSound(dt) {
  const S = window.sfx; if (!S) return;
  if (!SND.loops) {
    SND.loops = { wind: S.loop('wind_loop', { vol: 0 }), bells: S.loop('sleigh_bells_loop', { vol: 0 }), fire: S.loop('fire_crackle_loop', { vol: 0 }), music: S.loop('music_menu', { vol: 0 }) };
    S.setMusic((localStorage.getItem('music') ?? '1') === '1' ? 0.8 : 0);
  }
  SND.acc += dt; if (SND.acc < 0.1) return; SND.acc = 0;
  const L = SND.loops, play = STATE === 'play', sp = rig.speed / FLY.boostSpeed;
  L.wind.setVolume(play ? 0.2 + sp * 0.35 : 0.12, 0.3); L.wind.setRate(0.85 + sp * 0.35, 0.3);
  L.bells.setVolume(play ? 0.3 : 0, 0.4);
  L.music.setVolume(STATE === 'menu' ? 0.7 : STATE === 'pause' ? 0.35 : 0, 0.8);
  let near = 1e9; for (const f of world.fireList) near = Math.min(near, f.p.distanceTo(camera.position));
  L.fire.setVolume(Math.max(0, 1 - near / 28) * 0.8, 0.3);
}
window.__game = { rig, scene, camera, FLY, renderer, post, menus, MENU, get state() { return STATE; } };
