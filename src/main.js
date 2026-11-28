// Santa Sleighs -- boot, camera, the loop. Systems live in their own modules:
//   world.js (the snow diorama), sleigh.js (reindeer team + rope-tethered sleigh), rope.js, input.js.
import * as THREE from 'three';
import { buildWorld, groundH, softDot } from './world.js';
import { MENU_SPOT } from './terrain.js';
import { buildRig, FLY } from './sleigh.js';
import { input, pollInput, showReticle, setEquip, STICKS, LOOK as LOOKCTL } from './input.js';
import { makePost } from './post.js';
import { loadCrew } from './crew.js';
import { makeSnowmen } from './enemies.js';
import { makeOnFoot } from './onfoot.js';
import { fitSleighModel } from './sleighmodel.js';
import { makeStaticMerger } from './merge.js';
import { applyLook, addInk, LOOK, initialLook } from './look.js';
import { makeMenus } from './menu.js';
import { WEAPONS, ORDER, makeShots, loadGuns, heldGun, makeGrenades, makeAimArc, solveThrow, THROW } from './weapons.js';
import { CONTENT } from './gag.js';
import { loadModels, makeSanta, makeElf } from './characters.js';
import { makeDelivery, DROPCAM, bombGeo } from './delivery.js';
// sound is optional: if src/audio.js is missing or fails, the game stays silent instead of blank
const sfx = (n, o) => window.sfx?.play(n, o);
import('./audio.js').catch(() => {});

export const BUILD = 92;
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
rig.colliders = world.colliders;
rig.roadTop = (x, z) => world.roadTop ? world.roadTop(x, z) : -1e9;   // on foot he stands ON the road / sidewalk
// SANTA ON FOOT: hop out, walk the deck while it flies itself, jump / get thrown off, CALL it back (src/onfoot.js)
const foot = window.__foot = makeOnFoot(   // window.__foot: a debug handle (headless screenshots)
  { scene, rig, input, camera, sfx: (n, o) => sfx(n, o),
  onSplat: (p, v) => { shake = Math.max(shake, 0.5); shots?.puff?.(p, '#ffffff', 14, 5, 0.9); },
  // the superhero landing: shake by drop height, a boom, a ring of powder snow kicked up round his boots
  onSlam: (p, v, drop) => { const k = Math.min(1, drop / 25); shake = Math.max(shake, 0.5 + k * 1.2); sfx('explosion', { vol: 0.45 + k * 0.5, rate: 0.75 }); sfx('debris', { vol: 0.6, rate: 0.8 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; shots?.puff?.(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, 0.2, Math.sin(a) * 0.8)), '#ffffff', 3, 6 + k * 6, 1.2, 0.6); }
    shots?.puff?.(p, '#eef2ff', 18, 4 + k * 5, 1.6, 1.4); foot.crashZoom?.(0.25 + k * 0.3); },
  onDodge: (p, dir) => { p.y += 0.15; shots?.puff?.(p, '#ffffff', 10, 3.5, 0.7, 0.9); shots?.puff?.(p.addScaledVector(dir, 1.2), '#eef2ff', 8, 2.5, 0.9, 0.7); } });
rig.onCrash = (power, at) => {
  shake = Math.max(shake, 0.4 + power * 0.8); crashZoom = Math.max(crashZoom, 0.4 + power * 0.6);
  sfx('debris', { vol: 0.6 + power * 0.4, rate: 0.7 }); if (power > 0.5) sfx('explosion', { vol: 0.5 * power, rate: 1.3 });
  shots?.puff?.(at, '#ffffff', 12 + Math.round(power * 16), 6, 1.0);
  // the sleigh as a wrecking ball: a crash into a house knocks a hole in it the size of the hit
  if (world.town) world.town.blast(at, 2.2 + power * 2.6, 99, rig.SV.clone().multiplyScalar(0.6));
  world.props?.blast(at, 2.2 + power * 2.6, power > 0.35 ? 99 : 6, rig.SV.clone().multiplyScalar(0.6));   // b60: cars flip, trees fall
  foot.eject(power, at);
  // his sleigh takes the hit too: pieces near the impact fly off (a reindeer-first hit only shakes the front loose)
  if (rig.model) { const near = at.distanceTo(rig.S) < 6; rig.model.hit(near ? at : rig.sleigh.g.localToWorld(new THREE.Vector3(0, 1, 2.6)), near ? 1.5 + power * 2.5 : 1.2, near ? 2 + power * 6 : 1 + power * 2); }
};
// the look: LIT (shaded) or FLAT (self-lit textures + ink outlines) -- his switch (OPTIONS / DEBUG), remembered
const setLook = m => { applyLook(scene, m); try { localStorage.setItem('look', m); } catch (e) {} };

// ---- game state: 'menu' (start screen over the live scene), 'play', 'pause' ----------------------------------
const direct = MODE === 'kit' || params.has('cam') || params.get('play') === '1';
let STATE = direct ? 'play' : 'menu', slow = 1, dbgHud = false, camOverride = null;
const setState = s => { STATE = s; document.body.classList.toggle('play', s === 'play'); };
setState(STATE);
const hideBoot = () => document.getElementById('boot').classList.add('gone');
setTimeout(hideBoot, 12000);   // never hold the game hostage to a slow model load
Promise.all([loadCrew(rig, scene), buildMenuCrew(), fitSleighModel(rig, scene, groundH).then(m => {
  rig.model = m;
  m.onBoosterLost = () => { shake = Math.max(shake, 1.2); crashZoom = Math.max(crashZoom, 0.8); foot.eject(0.9, rig.S.clone()); };
}).catch(e => console.warn('sleigh model', e))]).then(([c]) => { rig.crew = c; MENU.crew?.santa.setWeapon(GUN.key); addInk(rig.sleigh.g); for (const d of rig.deer) addInk(d.g); setLook(initialLook('lit')); setTimeout(hideBoot, 300); }).catch(e => { hideBoot(); document.getElementById('build').textContent += ' crew: ' + e.message; });

// ---- THE START SCREEN SCENE: Santa + two elves in the plaza by the big tree, fire pit glow, snow, bloom --------------
const MENU = { spot: new THREE.Vector3(MENU_SPOT.x, 0, MENU_SPOT.z), crew: null, burstT: 3, firing: false, fireCd: 0 };
MENU.spot.y = groundH(MENU.spot.x, MENU.spot.z);
MENU.dir = new THREE.Vector3(MENU.spot.x, 0, MENU.spot.z).normalize();   // from the tree out toward the camera
async function buildMenuCrew() {
  if (MODE === 'kit') return;
  const M = await loadModels();
  const ry = Math.atan2(MENU.dir.x, MENU.dir.z), side = new THREE.Vector3(MENU.dir.z, 0, -MENU.dir.x);
  const santa = makeSanta(M.santa, { role: 'idle' });   // b44: rifle idle holds the gun properly
  santa.holder.position.copy(MENU.spot); santa.holder.rotation.y = ry;
  const a = makeElf(M.elf, { role: 'happy' }), b = makeElf(M.elf2 || M.elf, { role: 'wave' });
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
  elf: () => { try { return (localStorage.getItem('elf') || 'red').toUpperCase(); } catch (e) { return 'RED'; } },
  setElf: v => { try { localStorage.setItem('elf', v.toLowerCase()); } catch (e) {} location.reload(); },
  naughty: () => CONTENT.level.toUpperCase(), setNaughty: v => CONTENT.set(v.toLowerCase()),
  dbgHud: () => dbgHud ? 'ON' : 'OFF', setDbgHud: v => { dbgHud = v === 'ON'; if (!dbgHud) menus.hud(null); },
  cam: () => (camOverride || camMode || 'chase').toUpperCase(), setCam: v => { camOverride = v === 'CHASE' ? null : v.toLowerCase(); },
  slow: () => slow + 'x', setSlow: v => { slow = parseFloat(v); },
  resetSleigh: () => { rig.lead.set(0, 40, -120); rig.yaw = 0; rig.pitch = 0; rig.S.set(0, 40, -134); rig.SV.set(0, 0, FLY.speed); for (const d of rig.deer) { d.p.copy(rig.lead); d.v.set(0, 0, FLY.speed); } rig.model?.repair(); },
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
// INSTANCED (draw calls: 24 cookies x 6 meshes were 144 draws, now 2): each cookie keeps an invisible transform tree;
// the two InstancedMeshes copy its world matrices every frame
const NCOOK = 24, cookieDisc = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 20), cookieMat, NCOOK);
const cookieChips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), chipMat, NCOOK * 5);
cookieDisc.frustumCulled = cookieChips.frustumCulled = false; scene.add(cookieDisc, cookieChips);
for (let i = 0; i < NCOOK; i++) {
  const g = new THREE.Group();
  g.add(new THREE.Object3D());
  for (let k = 0; k < 5; k++) { const c = new THREE.Object3D(); c.position.set(Math.cos(k * 2.4) * 0.6, 0.16, Math.sin(k * 2.4) * 0.6); g.add(c); }
  g.rotation.x = Math.PI / 2;
  const a = (i / 24) * Math.PI * 2, r = 60 + (i % 3) * 45;
  g.position.set(Math.cos(a) * r, groundH(Math.cos(a) * r, Math.sin(a) * r) + 18 + (i % 4) * 9, Math.sin(a) * r);
  const holder = new THREE.Group(); holder.add(g); holder.position.copy(g.position); g.position.set(0, 0, 0);
  cookies.push({ o: holder, parts: g.children, alive: true, t: 0 });
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
  casV[i].copy(foot?.active ? foot.st.vel : rig.SV).addScaledVector(_right, 3 + Math.random() * 2); casV[i].y += 3 + Math.random() * 2; casL[i] = 1.2;
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

// ---- AIM: the crosshair sits on a rest point ahead (LOOK turns the camera, the rest point turns with it); the gun shoots at what's under it
const AIM = { rest: new THREE.Vector3(), target: new THREE.Vector3(), ray: new THREE.Raycaster() };
// SLEIGH AIM (b74 -> b76): a world yaw / pitch from the sleigh, never the team's heading. It rides the chase camera's orbit
// (CHASE_ORBIT: LOOK drags turn it): yaw = the sleigh's + the orbit's, pitch = pitch0 - orbit pitch / camK (the camera rising =
// aiming down), within pitchMin..pitchMax; the aim point is dist m out along it.
const SAIM = { yaw: 0, pitch: -0.2, pitch0: -0.2, pitchMin: -1.25, pitchMax: 0.55, dist: 45, camK: 0.55 };
const _ndc = new THREE.Vector2();
function updateAim(dt) {
  // rest: where the gun points with the stick centred -- ahead of the team, a little down
  if (foot.active) foot.aimRest(AIM.rest);
  else {   // the sleigh's aim: its OWN world yaw / pitch (SAIM) from the sleigh
    const cp = Math.cos(SAIM.pitch);
    AIM.rest.set(rig.S.x + Math.sin(SAIM.yaw) * cp * SAIM.dist, rig.S.y + 1.5 + Math.sin(SAIM.pitch) * SAIM.dist, rig.S.z + Math.cos(SAIM.yaw) * cp * SAIM.dist);
  }
  const rp = AIM.rest.clone().project(camera);
  const W = innerWidth, H = innerHeight;
  // b66: third-person shooter -- the crosshair sits on the aim point ahead (on foot ~ the middle of the screen; in the sleigh out
  // ahead of the team); LOOK turns the CAMERA, so the crosshair moves with it
  let px = (rp.x * 0.5 + 0.5) * W, py = (-rp.y * 0.5 + 0.5) * H;
  px = THREE.MathUtils.clamp(px, 20, W - 20); py = THREE.MathUtils.clamp(py, 20, H - 20);
  // what's under the reticle: march the camera ray down to the terrain, else a point far along it
  _ndc.set(px / W * 2 - 1, -(py / H) * 2 + 1); AIM.ray.setFromCamera(_ndc, camera);
  const o = AIM.ray.ray.origin, d = AIM.ray.ray.direction; let hit = false;
  // the first brick under the reticle wins (his note: bullets missed the wall he was aiming at -- they flew at the ground behind it)
  const th = world.town?.raycast(o, d, 400);
  for (let s = 2; s < (th ? th.dist : 400); s *= 1.08) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y < groundH(x, z)) { AIM.target.set(x, y, z); hit = true; break; } }
  if (!hit && th) { AIM.target.copy(th.point); hit = true; }
  if (!hit) AIM.target.copy(o).addScaledVector(d, 250);
  return { px, py };
}

// ---- WEAPONS: his four guns; switch with the WEAPON button / 1-4 / Q / gamepad Y; fly through a floating gun to grab it -------
const shots = makeShots(scene, groundH, {
  onBlast: (p, r) => { shake = Math.max(shake, 0.6 * Math.max(0, 1 - p.distanceTo(camera.position) / 120)); world.town?.blast(p, 3.6, 99); world.props?.blast(p, 3.6, 99); rig.model?.hit(p, 3.2, 8); snowmen.blast(p, 3.6, 99); },
  onHit: (p, kind) => { if (kind === 'snowball') { world.town?.blast(p, 1.0, 1); world.props?.blast(p, 1.0, 3); snowmen.blast(p, 1.0, 3); } },
  solid: p => !!world.town?.solidAt(p) || !!world.props?.solidAt(p),
});
// SNOWMAN MONSTERS in the village (src/enemies.js): shootable, face Santa, respawn; a kill makes the sidekick elf cheer
if (world.props) Object.assign(world.props.hooks, { puff: (...a) => shots.puff(...a), shake: k => { shake = Math.max(shake, k); } });   // b60
// b86 the town's crunches / cave-ins: louder + shakier the closer they are to the camera
const nearK = p => p ? Math.max(0, 1 - p.distanceTo(camera.position) / 110) : 1;
if (world.town) Object.assign(world.town.hooks, { puff: (...a) => shots.puff(...a),
  shake: (k, p) => { const s = k * nearK(p); shake = Math.max(shake, s); crashZoom = Math.max(crashZoom, s * 0.15); },
  sfx: (n, o = {}, p) => { const k = nearK(p); if (k > 0.02) sfx(n, { ...o, vol: (o.vol ?? 1) * (0.25 + 0.75 * k) }); } });
const snowmen = makeSnowmen({ scene, world, groundH, sfx: (n, o) => sfx(n, o), puff: (...a) => shots.puff(...a), onKill: () => rig.crew?.react?.('cheer'),
  onHitSanta: (dir, kind, from) => { if (!foot.knock(dir, kind)) return; const big = kind === 'big'; shake = Math.max(shake, big ? 1.4 : 0.7);
    sfx('debris', { vol: big ? 1 : 0.7, rate: big ? 0.6 : 0.9 }); sfx('snow_puff', { vol: 0.8, rate: 0.7 });
    shots.puff(foot.st.pos.clone().setY(foot.st.pos.y + 1.2), '#ffffff', big ? 20 : 10, big ? 7 : 4, 0.9); },
  onHitSleigh: p => { rig.model?.hit(p, 1.5, 3); shake = Math.max(shake, 0.9); crashZoom = Math.max(crashZoom, 0.25); } });   // b54: a snowball on the sleigh

let shake = 0, crashZoom = 0, weapon = (() => { try { const w = localStorage.getItem('weapon'); if (WEAPONS[w]) return w; } catch (e) {} return 'gatling'; })();
// b56 THE DELIVERY STREET (src/delivery.js): 3 good houses want a present down the chimney, 1 taken-over house wants an ornament bomb
const delivery = makeDelivery({ scene, world, rig, foot, snowmen, camera, sfx: (n, o) => sfx(n, o), puff: (...a) => shots.puff(...a),
  onScore: n => { cookieCount = Math.max(0, cookieCount + n); if (n > 0) milk = Math.min(100, milk + n * 3); },
  onShake: k => { shake = Math.max(shake, k); crashZoom = Math.max(crashZoom, k * 0.2); } });
// ---- b79 QUICK DRAW (input.js QUICKDRAW / SWAP, his b78 words): three categories -- PRIMARY (the gun, EQUIP.gun = which one),
// PRESENT, BOMB (in the sleigh the chimney bomb, on foot the grenade). EQUIP.cat = what's in his hands (null = unarmed, his own
// arms). Tap a category = equip it; tap the equipped one again = unarmed. SWAP = the next variant of the equipped category (guns
// only for now: Gatling -> Rifle -> Rockets -> Snowballs; unarmed it pulls the next gun out). The right stick does what the category
// says: gun = FIRE while touched; present / bomb = hold to aim (drop-cam + ring / throw arc), lift = drop / throw; unarmed = camera.
const EQUIP = { cat: 'gun', gun: weapon };
try {
  const v = JSON.parse(localStorage.getItem('equip') || 'null');
  if (v) { if (WEAPONS[v.gun]) EQUIP.gun = v.gun; if ([null, 'gun', 'present', 'bomb'].includes(v.cat)) EQUIP.cat = v.cat; }
  else { const g = JSON.parse(localStorage.getItem('gun') || 'null'); if (g && WEAPONS[g.key]) { EQUIP.gun = g.key; EQUIP.cat = g.out === false ? null : 'gun'; } }
} catch (e) {}
const GUN = { get key() { return EQUIP.gun; }, get out() { return EQUIP.cat === 'gun'; } };
const saveEquip = () => { try { localStorage.setItem('equip', JSON.stringify(EQUIP)); localStorage.setItem('weapon', EQUIP.gun); } catch (e) {} };
function cancelItem() { if (NADE.held) nadeEnd(false); if (delivery.hold?.kind) delivery.holdEnd?.(false); }
function equip(cat) {
  if (cat === 'present' && foot.active) { sfx('ui_back', { vol: 0.5, rate: 1.4 }); return; }   // presents go down chimneys: sleigh only
  cancelItem();
  if (EQUIP.cat === cat) { EQUIP.cat = null; sfx('ui_back', { vol: 0.55, rate: 1.25 }); }   // the quick draw: tap it again = put it away
  else { EQUIP.cat = cat; sfx(cat === 'gun' ? 'casing' : 'ui_tap', { vol: 0.7, rate: cat === 'gun' ? 0.8 : 1.1 }); }
  saveEquip();
}
function pickGun(key) {
  if (!WEAPONS[key]) return; const was = EQUIP.cat === 'gun' && EQUIP.gun === key;
  if (EQUIP.cat !== 'gun') cancelItem();
  EQUIP.gun = key; EQUIP.cat = 'gun'; weapon = key; saveEquip();
  if (!was) { sfx('casing', { vol: 0.7, rate: 0.8 }); sfx('ui_tap', { vol: 0.5, rate: 0.9 }); }
}
/** SWAP: step the variant of the equipped category (present / bomb have one kind each for now) */
function cycleVariant(step) {
  const cat = EQUIP.cat || 'gun';
  if (cat !== 'gun') { sfx('ui_back', { vol: 0.4, rate: 1.5 }); return; }
  const n = ORDER.length, i = ORDER.indexOf(EQUIP.gun); pickGun(ORDER[(((i + step) % n) + n) % n]);
}
/** the old entry point (the floating gun pickups): this gun, out */
function setWeapon(key, announce = true) { pickGun(key); if (announce) sfx('cookie_pickup', { rate: 0.75 }); }
// one writer for what each Santa holds: the crew Santa (sleigh) and the on-foot Santa follow EQUIP every frame (the BOMB category on
// foot = the ornament grenade in his right hand)
function syncHeld() {
  const cs = rig.crew?.debug?.santa; if (cs && cs.weapon !== GUN.key) cs.setWeapon(GUN.key);
  if (cs?.gun?.g) cs.gun.g.visible = GUN.out;
  cs?.setArmed?.(GUN.out);
  const fs = foot.santa; if (fs && fs.weapon !== GUN.key) fs.setWeapon(GUN.key);
  const nade = foot.active && (!!foot.throwing || EQUIP.cat === 'bomb');
  foot.setHeld?.(nade ? 'grenade' : GUN.out ? GUN.key : null, GUN.out && !foot.throwing);
}
// GRENADES (weapons.js THROW) + the throw / lob arc (snowballs and grenades)
const grenades = makeGrenades(scene, groundH, bombGeo(), { puff: (...a) => shots?.puff(...a), solid: p => !!world.town?.solidAt(p) || !!world.props?.solidAt(p),
  onBlast: (p, r) => { shake = Math.max(shake, 0.7 * Math.max(0, 1 - p.distanceTo(camera.position) / 80)); world.town?.blast(p, r, 99); world.props?.blast(p, r, 99); rig.model?.hit(p, r * 0.9, 8); snowmen.blast(p, r, 99); } });
const aimArc = makeAimArc(scene);
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
      p.cd = 3; if ((!GUN.out || GUN.key !== p.key) && !foot.active) setWeapon(p.key);
    }
  }
}

// the on-foot Santa wearing the crew's interface (setFiring / aim / update / muzzle / kick / eject / def / rate)
const footShooter = {
  setFiring: on => foot.setFiring(on), aim: p => foot.santa?.aimAt(p), update: (dt, t) => foot.santa?.update(dt, t),
  get muzzle() { return foot.santa?.muzzle; }, get eject() { return foot.santa?.eject; }, kick: () => foot.santa?.kick(),
  get def() { return foot.santa?.def; }, get rate() { return foot.santa?.rate ?? 0.08; },
};
let wasFiring = false, retFrame = 0;
// draw calls: a few seconds in, every static mesh is merged per material (src/merge.js); the rig + team are never touched
const merger = makeStaticMerger(scene, { exclude: () => [rig.sleigh.g, ...rig.deer.map(d => d.g), foot.santa?.holder] });
const RET3 = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.scale(128 / 46, 128 / 46); g.lineCap = 'round';
  // the same crosshair as input.js's #reticle SVG (b27): ink-outlined candy-cane ring, icing ticks, a red pip
  const ring = (col, w, dash = []) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); g.arc(23, 23, 14, 0, Math.PI * 2); g.stroke(); };
  const ticks = (col, w) => { g.setLineDash([]); g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (const [a, b, x, y] of [[23, 4, 23, 11], [23, 35, 23, 42], [4, 23, 11, 23], [35, 23, 42, 23]]) { g.moveTo(a, b); g.lineTo(x, y); } g.stroke(); };
  ring('#1d1420', 6.5); ring('#fcefd4', 3); g.lineCap = 'butt'; ring('#e8263a', 3, [5.5, 5.5]); g.lineCap = 'round';
  ticks('#1d1420', 6.5); ticks('#fcefd4', 3);
  g.beginPath(); g.arc(23, 23, 3.6, 0, Math.PI * 2); g.fillStyle = '#e8263a'; g.fill(); g.strokeStyle = '#1d1420'; g.lineWidth = 2; g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, transparent: false, alphaTest: 0.35 }));
  s.material.transparent = true; s.renderOrder = 10; s.visible = false; s.frustumCulled = false; scene.add(s); return s;
})();
// ---- b76 CONTROLS (input.js): the dial, the fire button's icon, LOOK -> the camera / a held drop, the GRENADE button ----------------
// RACK = the rifle's bolt after each shot: t s, the gun rolls `roll` rad and slides back `back` m and returns (+ a clack)
const RACK = { t: 0.28, roll: 0.55, back: 0.07 };
const DR = { rackT: 0, wasFire: false };
function heldSanta() { return foot.active ? foot.santa : rig.crew?.debug?.santa; }
// THE GRENADE (on foot, BOMB equipped): the right stick (or G, mouse left, RT) PRESSED = he pulls the pin + winds up (THROW clip held
// at cockAt); held past STICKS.tapMs the throw ARC + landing ring come up and the thumb aims it (it turns the camera; the crosshair
// is the aim); LIFT = throw at the crosshair. A quick tap = a quick throw straight at the crosshair.
const NADE = { held: false, src: null, t0: 0 };
function nadeStart(src) {
  if (NADE.held || STATE !== 'play' || !foot.active || foot.throwing) return;
  if (!foot.throwCock()) return;
  NADE.held = true; NADE.src = src; NADE.t0 = performance.now();
}
function nadeEnd(fire) {
  if (!NADE.held) return; NADE.held = false; NADE.src = null;
  if (fire) foot.throwGo(); else foot.throwCancel();
}
addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat) nadeStart('key'); });
addEventListener('keyup', e => { if (e.code === 'KeyG' && NADE.src === 'key') nadeEnd(true); });
// THE TRIGGER (input.trigger: the right-stick finger / mouse left / Space / RT) does what the equipped category says
const TRIG = { was: false };
function updateControls(dt) {
  if (NADE.held && (!foot.active || STATE !== 'play' || !foot.throwing)) { NADE.held = false; NADE.src = null; }
  if (STATE === 'play') {
    if (input.catTap) equip(input.catTap);
    if (input.swapStep) cycleVariant(input.swapStep);
    if (input.swapPick) { if (WEAPONS[input.swapPick]) pickGun(input.swapPick); }
    if (input.holster && EQUIP.cat) equip(EQUIP.cat);
  }
  input.catTap = null; input.swapStep = 0; input.swapPick = null; input.holster = false;
  const item = EQUIP.cat === 'bomb' ? (foot.active ? 'grenade' : 'bomb') : EQUIP.cat === 'present' && !foot.active ? 'present' : null;
  const trig = STATE === 'play' && input.trigger, tapNow = STATE === 'play' && input.trigTap;
  const pressed = (trig && !TRIG.was) || tapNow, released = (!trig && TRIG.was) || (tapNow && !trig);
  TRIG.was = trig;
  if (pressed && item) { if (item === 'grenade') nadeStart('trig'); else delivery.holdStart?.(item, 'trig'); }
  if (released) { if (NADE.src === 'trig') nadeEnd(true); if (delivery.hold?.kind && delivery.hold.src === 'trig') delivery.holdEnd?.(true); }
  // b81 (his: "you should ALWAYS be able to JUMP by TAPPING the right stick, even with a gun"): a quick right tap never arms the
  // trigger (input.js TAP) and is ALWAYS a jump on foot; riding (no jump in the seat) a tap with a present / bomb = a quick drop
  if (input.rTap) { input.rTap = false;
    if (STATE === 'play') { if (!foot.active && item && !delivery.hold?.kind) { delivery.holdStart?.(item, 'tap'); delivery.holdEnd?.(true); } else input.tap = true; } }
  setEquip({ cat: EQUIP.cat, gun: EQUIP.gun, guns: ORDER, presents: delivery.stack ?? 0, foot: foot.active });
  // a drop being held: the thumb slides its landing ring (drag px + the stick's deflection) -- not the camera
  if (delivery.hold?.kind) {
    delivery.aimDropPx?.(input.lookDX, input.lookDY); delivery.aimDrop?.(input.rx, input.ry, dt);
    input.lookDX = input.lookDY = 0; input.camX = input.camY = 0;
  }
  foot.setAiming?.(foot.active && (NADE.held || !!foot.throwing));
}

// one shot of gun W from `muzzle` at the crosshair's point (hitscan for the fast guns, a projectile for the rest)
function fireShot(W, muzzle, out) {
    const from = muzzle.getWorldPosition(new THREE.Vector3());
    _d.subVectors(AIM.target, from).normalize();   // straight at the reticle's point (the gun swings after it)
    _d.x += (Math.random() - 0.5) * W.spread; _d.y += (Math.random() - 0.5) * W.spread; _d.normalize();
    // hitscan the town for the fast guns: the tracer stops at the wall, the brick takes the hit now
    let hit = (W.shot === 'tracer' || W.shot === 'slug') ? world.town?.raycast(from, _d, 250) : null;
    // on foot he can shoot his own sleigh to bits
    const mh = out && (W.shot === 'tracer' || W.shot === 'slug') ? rig.model?.raycast(from, _d, 250) : null;
    if (mh && (!hit || mh.dist < hit.dist)) { rig.model.shoot(mh, W.shot === 'slug' ? 3 : 1); shots.puff(mh.point, '#ffd060', 3, 3, 0.4); hit = { dist: mh.dist, sleigh: true }; }
    const sh = (W.shot === 'tracer' || W.shot === 'slug') ? snowmen.raycast(from, _d, 250) : null;
    if (sh && (!hit || sh.dist < hit.dist)) { snowmen.shoot(sh, W.shot === 'slug' ? snowmen.SNOW.slug : 1, from); shots.puff(sh.point, '#ffffff', 4, 3, 0.5); hit = { dist: sh.dist, enemy: true }; }
    const ph = (W.shot === 'tracer' || W.shot === 'slug') ? world.props?.raycast(from, _d, 250) : null;   // b60: cars + trees
    if (ph && (!hit || ph.dist < hit.dist)) { world.props.shoot(ph, W.shot === 'slug' ? 3 : 1, _d); hit = { dist: ph.dist, prop: true }; }
    if (hit && !hit.sleigh && !hit.enemy && !hit.prop) {
      // his: bullets should hit harder -- a Gatling round now takes out the brick it hits + chips its neighbours; the rifle punches a big hole
      // b86 (his: "the bullets need to have velocity behind them"): a Gatling round damages the chunk + a splash round it and
      // throws what dies out along the bullet (town.js TOWN.bullet); the rifle punches a bigger hole, harder
      if (W.shot === 'slug') world.town.blast(hit.point, 1.9, 99, _d.clone().multiplyScalar(22));
      else world.town.bullet(hit.id, hit.point, _d);
      shots.puff(hit.point, '#c0743a', 3, 3, 0.5);
    }
    if (W.shot === 'tracer') {
      const tr = tracers[trI++ % TR];
      // no inherited sleigh speed: the tracer flies down the aim line (on foot it was adding the SLEIGH's velocity)
      tr.p.copy(from); tr.v.copy(_d).multiplyScalar(W.speed); tr.life = hit ? hit.dist / W.speed : 1.2;
    } else {
      if (W.shot === 'snowball') _d.y += SNOWLOB;      // lob it a little
      shots.fire(W, from, _d.normalize(), (out ? foot.st.vel : rig.SV).clone().multiplyScalar(0.6));
      if (W.shot === 'rocket') shots.puff(from, '#d8d6e0', 6, 3, 0.8);
    }
    flash.position.copy(from); flash.intensity = W.shot === 'snowball' ? 6 : 25;
}
// THE ARC: a grenade being held (from his hand, solved onto the crosshair's point) or the snowball cannon firing (its own lob from
// the muzzle) shows its dotted trajectory + the landing ring; the throw / shot takes the same numbers
const SNOWLOB = 0.12, _av = new THREE.Vector3(), _af = new THREE.Vector3();
function updateArc(dt, W, muzzle, out, fireHeld) {
  // a grenade that just left his hand
  const tp = out ? foot.takeThrow?.() : null;
  if (tp) { solveThrow(tp, AIM.target, THROW.speed, THROW.g, _av); _av.addScaledVector(foot.st.vel, 0.5); grenades.throw(tp, _av); }
  if (STATE !== 'play') { aimArc.hide(); return; }
  if (out && NADE.held && performance.now() - NADE.t0 >= STICKS.tapMs) {
    foot.handPos(_af); solveThrow(_af, AIM.target, THROW.speed, THROW.g, _av); _av.addScaledVector(foot.st.vel, 0.5);
    const r = grenades.predict(_af, _av, aimArc.pts); aimArc.show(r.n, r.hit ? r.land : null, '#ffd0d6', camera); return;
  }
  if (fireHeld && muzzle && W.shot === 'snowball') {
    muzzle.getWorldPosition(_af); _av.subVectors(AIM.target, _af).normalize(); _av.y += SNOWLOB; _av.normalize().multiplyScalar(W.speed).addScaledVector(out ? foot.st.vel : rig.SV, 0.6);
    // the cannon's ball flies under W.gravity with no drag: the grenade predictor with the ball's own gravity
    const g0 = THROW.g; THROW.g = W.gravity || 16; const r = grenades.predict(_af, _av, aimArc.pts); THROW.g = g0;
    aimArc.show(r.n, r.hit ? r.land : null, '#ffffff', camera); return;
  }
  aimArc.hide();
}

function updateGun(dt, t) {
  // b79: the gun out + the trigger (right-stick finger / left mouse / Space / RT) = shooting, every gun automatic at its own rate;
  // unarmed, an item or mid-throw = nothing
  const W0 = STATE === 'play' && GUN.out && !(foot.active && foot.throwing) ? WEAPONS[GUN.key] : null;
  const firing = !!W0 && input.fire;
  const scr = STATE === 'play' ? updateAim(dt) : null;
  // the crosshair: a gun out, or a grenade being held (never for the drops: their landing ring is the aim)
  const showRet = !!scr && (!!W0 || NADE.held || (foot.active && EQUIP.cat === 'bomb'));
  if (showRet) {
    // the crosshair is drawn after the world (over houses / trees) but BEFORE the player's own things (renderOrder 11):
    // Santa on foot, or the sleigh + crew + team when riding, so they cover it (his note: it was drawn on top of them)
    const onFoot = foot.active;
    document.body.classList.add('ret3d'); RET3.visible = true;
    if ((retFrame++ % 20) === 0) { const mark = o => { o.renderOrder = 11; }; foot.santa?.holder.traverse(mark); rig.sleigh.g.traverse(mark); for (const d of rig.deer) d.g.traverse(mark); }
    const d = onFoot ? camera.position.distanceTo(foot.st.pos) + 1.5 : camera.position.distanceTo(rig.S) + 3.5;
    RET3.position.copy(AIM.ray.ray.origin).addScaledVector(AIM.ray.ray.direction, d);
    const live = firing || input.lookDown || NADE.held;
    const s = 46 / innerHeight / 0.866 * (firing ? 0.9 + Math.random() * 0.15 : 1);
    RET3.scale.set(s, s, 1); RET3.material.rotation = firing ? (Math.random() - 0.5) * 0.35 : 0;
    RET3.material.opacity = live ? 1 : 0.6;
  } else { RET3.visible = false; document.body.classList.add('ret3d'); if (!scr) { AIM.target.copy(rig.lead).addScaledVector(rig.fwd, 30); AIM.target.y -= 8; } }
  // the Gatling's barrels: spin up on the press, down on the release
  if (firing !== wasFiring) { if (W0?.spin) sfx(firing ? 'gun_spinup' : 'gun_spindown', { vol: 0.5 }); wasFiring = firing; }
  rig.aimTarget = AIM.target;
  const out = foot.active;
  const crew = out ? footShooter : rig.crew;
  _p.copy(AIM.target);
  let muzzle, ready = true;
  if (out) { rig.crew?.setFiring(false); rig.crew?.update(dt, t); }
  if (crew && crew.muzzle) { crew.setFiring(firing); crew.aim(_p); crew.update(dt, t); muzzle = crew.muzzle; }
  else if (out) { muzzle = null; ready = false; }
  else {   // stand-in rail minigun until his models load
    spin += ((firing ? 28 : 0) - spin) * (1 - Math.exp(-(firing ? 4 : 1.5) * dt));
    rig.sleigh.barrels.rotation.z += spin * dt;
    rig.sleigh.mount.updateMatrixWorld(); rig.sleigh.gun.lookAt(_p);
    muzzle = rig.sleigh.muzzle; ready = spin > 18;
  }
  // after the clip + hold: the rifle's RACK after a shot
  const hs = heldSanta(), gun = hs?.gun;
  if (gun?.g) {
    DR.rackT = Math.max(0, DR.rackT - dt);
    const u = DR.rackT > 0 ? 1 - DR.rackT / RACK.t : 0, k = Math.sin(u * Math.PI);
    gun.g.rotation.z = RACK.roll * k; gun.g.position.z -= RACK.back * k;
  }
  fireCd -= dt;
  flash.intensity *= Math.exp(-30 * dt);
  const W = crew?.def || WEAPONS.gatling;
  if (firing && ready && fireCd <= 0 && STATE === 'play') {
    fireCd = crew ? crew.rate : 0.05;
    if (W.shot === 'slug') { DR.rackT = RACK.t; setTimeout(() => sfx('casing', { vol: 0.6, rate: 0.7 }), 160); }
    if (crew) { crew.kick(); if (W.shot === 'tracer' || W.shot === 'slug') casing(crew.eject); }
    sfx(W.snd, { vol: W.vol, rate: W.sndRate || 1 }); if (W.shot === 'tracer' && Math.random() < 0.3) sfx('casing', { vol: 0.25 });
    if (muzzle) fireShot(W, muzzle, out);
  }
  updateArc(dt, W, muzzle, out, firing);
  grenades.update(dt);
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
// EVERY camera change EASES (his): when the camera's owner changes (seat <-> on foot, menu -> play, a camera mode), the next
// ~1.2 s blend from where the camera actually was toward the new rig's pose instead of cutting
// yawRate / pitchRate rad/s at full gamepad stick (touch / mouse: input.js LOOK px rates, LOOK.sleighBack / sleighEase the ease back)
const CHASE_ORBIT = { yaw: 0, pitch: 0, idle: 9, wy: null, yawRate: 2.2, pitchRate: 1.2, pitchMin: -0.35, pitchMax: 0.7 };
const _dcP = new THREE.Vector3(), _dcL = new THREE.Vector3();
const CAMB = { key: null, t: 0, pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 60, dur: 1.2 };
function updateCamera(dt) {
  const key = STATE + '|' + (foot.active ? 'foot' : 'ride') + '|' + (camOverride || '');
  if (CAMB.key !== null && key !== CAMB.key) CAMB.t = CAMB.dur;
  CAMB.key = key;
  updateCamera0(dt);
  if (CAMB.t > 0 && camOverride !== 'free') {
    CAMB.t = Math.max(0, CAMB.t - dt);
    const k = 1 - Math.exp(-4.5 * dt * (1 + 3 * (1 - CAMB.t / CAMB.dur)));   // starts soft, firms up as it lands
    camera.position.copy(CAMB.pos.lerp(camera.position, k)); camera.quaternion.copy(CAMB.q.slerp(camera.quaternion, k));
  }
  CAMB.pos.copy(camera.position); CAMB.q.copy(camera.quaternion);
}
function updateCamera0(dt) {
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
  if (foot.active && STATE === 'play' && !camOverride) { foot.cameraUpdate(dt); if (shake > 0.001) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-6 * dt); } return; }
  if (camMode === 'free') return;   // test hook: something else drives the camera
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
  // CHASE ORBIT (b61 -> b76 LOOK): a finger dragged on the right half (or the fire thumb, or the mouse) orbits the chase camera round
  // the sleigh (drag right = the view turns right, drag down = look down); the gamepad stick at yawRate / pitchRate. While a finger
  // is down the orbit holds its WORLD yaw (co.wy), so steering the team never swings the shot; LOOKCTL.sleighBack s after the last
  // finger lifts it eases back behind the team. SAIM (the shot) rides it.
  const co = CHASE_ORBIT, play = STATE === 'play', cx = play ? input.camX || 0 : 0, cy = play ? input.camY || 0 : 0;
  const ldx = play ? input.lookDX || 0 : 0, ldy = play ? input.lookDY || 0 : 0, touching = play && (input.lookDown || input.fire);
  const dyaw = -Math.sign(cx) * Math.pow(Math.abs(cx), 1.5) * co.yawRate * dt - ldx * LOOKCTL.sleighYaw;
  if (touching) { if (co.wy === undefined || co.wy === null) co.wy = rig.yaw + co.yaw; co.wy += dyaw; const dy = co.wy - rig.yaw; co.yaw = Math.atan2(Math.sin(dy), Math.cos(dy)); }
  else { co.wy = null; co.yaw += dyaw; }
  co.pitch = THREE.MathUtils.clamp(co.pitch - Math.sign(cy) * Math.pow(Math.abs(cy), 1.5) * co.pitchRate * dt + ldy * LOOKCTL.sleighPitch, co.pitchMin, co.pitchMax);
  if (touching || Math.abs(cx) + Math.abs(cy) > 0.05) co.idle = 0; else co.idle += dt;
  if (co.idle > LOOKCTL.sleighBack) { const k = 1 - Math.exp(-LOOKCTL.sleighEase * dt); co.yaw = Math.atan2(Math.sin(co.yaw), Math.cos(co.yaw)) * (1 - k); co.pitch *= 1 - k; }
  SAIM.yaw = rig.yaw + co.yaw; SAIM.pitch = THREE.MathUtils.clamp(SAIM.pitch0 - co.pitch / SAIM.camK, SAIM.pitchMin, SAIM.pitchMax);
  const yawF = _d.set(Math.sin(rig.yaw + co.yaw), 0, Math.cos(rig.yaw + co.yaw));
  crashZoom *= Math.exp(-0.9 * dt);   // a crash pulls the camera back so the whole wreck is in frame
  const want = _p.copy(rig.S).addScaledVector(yawF, -14 * (1 + crashZoom) * Math.cos(co.pitch)).add(new THREE.Vector3(0, (7.5 - rig.pitch * 6 + 14 * Math.sin(co.pitch)) * (1 + crashZoom * 0.8), 0));
  const look = new THREE.Vector3().copy(rig.S).lerp(rig.lead, 0.4).addScaledVector(rig.fwd, 4); look.y += 1;
  // b67 DROP-CAM (src/delivery.js DROPCAM): holding a drop button blends the chase into a steep look-down at the landing marker
  const dc = delivery.dropCam, dk = STATE === 'play' && dc ? dc.k : 0;
  if (dk > 0.001) { dc.pose(_dcP, _dcL); want.lerp(_dcP, dk); look.lerp(_dcL, dk); }
  const gy = groundH(want.x, want.z) + 2; if (want.y < gy) want.y = gy;
  camPos.lerp(want, 1 - Math.exp(-(4 + (dc ? DROPCAM.camRate : 0) * dk) * dt));
  camLook.lerp(look, 1 - Math.exp(-(8 + 6 * dk) * dt));
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
  updateControls(real * slow); syncHeld();
  if (STATE === 'play') {
    input.boost = input.boost && milk > 0 && !foot.active;
    if (input.boost && !wasBoost) sfx('milk_gulp'); wasBoost = input.boost;
    milk = Math.max(0, Math.min(100, milk + (input.boost ? -14 : 3) * dt));
    turnCd -= dt; if (Math.abs(input.steer) > 0.75 && turnCd <= 0) { sfx('whoosh', { vol: 0.5 }); turnCd = 1.4; }
  }
  if (dt > 0) {
    AUTO.climb = THREE.MathUtils.clamp((55 - rig.lead.y) / 20, -1, 1);
    rig.update(dt, STATE === 'play' ? (foot.sleighInput() || input) : AUTO, t);
    if (STATE === 'play') foot.update(dt, t);
    updateGun(dt, t);
    rig.model?.update(dt, t, STATE === 'play' && input.boost);
    updatePickups(dt, t);
    if (STATE === 'menu' && MENU.crew) updateMenuCrew(dt, t);
  }
  for (const c of cookies) {
    c.o.rotation.y += dt * 1.5;
    if (!c.alive) { c.t += dt; c.o.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 8) { c.alive = true; c.t = 0; c.o.scale.setScalar(1); } continue; }
    if (c.o.position.distanceToSquared(rig.S) < 16 || c.o.position.distanceToSquared(rig.lead) < 16) {
      c.alive = false; cookieCount++; milk = Math.min(100, milk + 20); sfx('cookie_pickup'); rig.crew?.react?.('cheer');
    }
  }
  cookies.forEach((c, i) => { c.o.updateMatrixWorld(true); cookieDisc.setMatrixAt(i, c.parts[0].matrixWorld); for (let k = 0; k < 5; k++) cookieChips.setMatrixAt(i * 5 + k, c.parts[k + 1].matrixWorld); });
  cookieDisc.instanceMatrix.needsUpdate = true; cookieChips.instanceMatrix.needsUpdate = true;
  $cookies.textContent = cookieCount; $milk.textContent = Math.round(milk);
  if (dt > 0) { world.tick(t, dt); snowmen.update(dt, foot.active ? foot.st.pos : rig.S, camera, { vel: foot.active ? foot.st.vel : rig.SV, sleigh: rig.S }); delivery.update(dt, t); }
  if (dt > 0) world.props?.update(dt, foot.active ? foot.st.pos : rig.S, rig);   // b60: cars / trees / gingerfolk
  merger.tick(dt);
  updateCamera(dt);
  world.town?.lodTick(camera, real);   // b33: far houses swap to painted slabs (town.js TOWN.lod)
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
  // he fires up and OFF TO HIS LEFT (b55): the side-on gunner stance points the gun where he aims -- aimed at the camera, the gun hid both
  // arms (his screenshot); aimed to the side the camera sees him in profile with both hands on it
  santa.aimAt(santa.holder.localToWorld(_up.set(7, 5 + Math.sin(t) * 1.5, 3 + Math.sin(t * 0.7) * 2)));
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
window.__game = { rig, scene, snowmen, delivery, camera, FLY, renderer, post, menus, MENU, foot, world, merger, freeCam: () => { camOverride = 'free'; }, get state() { return STATE; } };
