// Santa Sleighs -- boot, camera, the loop. Systems live in their own modules:
//   world.js (the snow diorama), sleigh.js (reindeer team + rope-tethered sleigh), rope.js, input.js.
import * as THREE from 'three';
import { buildWorld, groundH, softDot } from './world.js';
import { buildRig, FLY } from './sleigh.js';
import { input, pollInput } from './input.js';
import { makePost } from './post.js';
import { loadCrew } from './crew.js';

export const BUILD = 5;
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
loadCrew(rig, scene).then(c => { rig.crew = c; }).catch(e => { document.getElementById('build').textContent += ' crew: ' + e.message; });

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

function updateGun(dt, t) {
  const firing = input.fire || input.fireKey;
  const crew = rig.crew;
  // aim ahead of the team, a little down toward the ground
  _p.copy(rig.lead).addScaledVector(rig.fwd, 30); _p.y -= 8;
  let muzzle, ready = true;
  if (crew) { crew.aim(_p); crew.update(dt, t); muzzle = crew.muzzle; }
  else {   // stand-in rail minigun until his models load
    spin += ((firing ? 28 : 0) - spin) * (1 - Math.exp(-(firing ? 4 : 1.5) * dt));
    rig.sleigh.barrels.rotation.z += spin * dt;
    rig.sleigh.mount.updateMatrixWorld(); rig.sleigh.gun.lookAt(_p);
    muzzle = rig.sleigh.muzzle; ready = spin > 18;
  }
  fireCd -= dt;
  flash.intensity *= Math.exp(-30 * dt);
  if (firing && ready && fireCd <= 0) {
    fireCd = crew ? crew.rate : 0.05;
    if (crew) { crew.kick(); casing(crew.eject); }
    const tr = tracers[trI++ % TR];
    muzzle.getWorldPosition(tr.p);
    muzzle.getWorldQuaternion(_q);
    _d.copy(Z).applyQuaternion(_q);
    _d.x += (Math.random() - 0.5) * 0.03; _d.y += (Math.random() - 0.5) * 0.03; _d.normalize();
    tr.v.copy(_d).multiplyScalar(140).add(rig.SV); tr.life = 1.2;
    flash.position.copy(tr.p); flash.intensity = 25;
  }
  updateCasings(dt);
  for (let i = 0; i < TR; i++) {
    const tr = tracers[i];
    if (tr.life > 0) {
      tr.life -= dt; tr.p.addScaledVector(tr.v, dt);
      if (tr.p.y < groundH(tr.p.x, tr.p.z)) { puff(tr.p); tr.life = 0; }
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
const camMode = MODE === 'kit' ? 'orbit' : params.get('cam');
// kit showroom: a slow orbit round the lot; drag anywhere to turn it / tilt it
const ORB = { a: 0.6, h: 22, r: 58, drag: null };
addEventListener('pointerdown', e => { if (camMode === 'orbit') ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (!ORB.drag) return; ORB.a -= (e.clientX - ORB.drag.x) * 0.006; ORB.h = Math.max(3, Math.min(70, ORB.h + (e.clientY - ORB.drag.y) * 0.1)); ORB.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => ORB.drag = null);
function updateCamera(dt) {
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
  const fov = 62 + (rig.speed - FLY.speed) * 0.55;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---- loop -----------------------------------------------------------------------------------
let last = performance.now(), t = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  pollInput();
  input.boost = (document.getElementById('boost').classList.contains('on') || input.boostKey) && milk > 0;
  milk = Math.max(0, Math.min(100, milk + (input.boost ? -14 : 3) * dt));
  rig.update(dt, input, t);
  updateGun(dt, t);
  for (const c of cookies) {
    c.o.rotation.y += dt * 1.5;
    if (!c.alive) { c.t += dt; c.o.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 8) { c.alive = true; c.t = 0; c.o.scale.setScalar(1); } continue; }
    if (c.o.position.distanceToSquared(rig.S) < 16 || c.o.position.distanceToSquared(rig.lead) < 16) {
      c.alive = false; cookieCount++; milk = Math.min(100, milk + 20);
    }
  }
  $cookies.textContent = cookieCount; $milk.textContent = Math.round(milk);
  world.tick(t, dt);
  updateCamera(dt);
  world.snowUpdate(camera.position, t, dt);
  // keep the shadow camera centred on the sleigh
  const sc = camMode === 'diorama' ? DIORAMA.look : camMode === 'orbit' ? new THREE.Vector3() : rig.S;
  world.moonLight.target.position.copy(sc);
  world.moonLight.position.copy(sc).add(new THREE.Vector3(-120, 200, -140));
  updateCigar(dt);
  post.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = { rig, scene, camera, FLY, renderer, post };
