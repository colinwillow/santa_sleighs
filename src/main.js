// Santa Sleighs -- boot, camera, the loop. Systems live in their own modules:
//   world.js (the snow diorama), sleigh.js (reindeer team + rope-tethered sleigh), rope.js, input.js.
import * as THREE from 'three';
import { buildWorld, groundH, softDot } from './world.js';
import { buildRig, FLY } from './sleigh.js';
import { input, pollInput } from './input.js';

export const BUILD = 1;
document.getElementById('bnum').textContent = BUILD;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 3000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const world = buildWorld(scene);
const rig = buildRig(scene, world.colliders);

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
const tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), new THREE.MeshBasicMaterial({ color: '#ffe48a' }), TR);
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

function updateGun(dt) {
  const firing = input.fire || input.fireKey;
  spin += ((firing ? 28 : 0) - spin) * (1 - Math.exp(-(firing ? 4 : 1.5) * dt));
  rig.sleigh.barrels.rotation.z += spin * dt;
  // aim the gun ahead of the team, a little down toward the ground
  const gun = rig.sleigh.gun;
  rig.sleigh.mount.updateMatrixWorld();
  _p.copy(rig.lead).addScaledVector(rig.fwd, 30); _p.y -= 8;
  gun.lookAt(_p);
  fireCd -= dt;
  flash.intensity *= Math.exp(-30 * dt);
  if (firing && spin > 18 && fireCd <= 0) {
    fireCd = 0.05;
    const tr = tracers[trI++ % TR];
    rig.sleigh.muzzle.getWorldPosition(tr.p);
    rig.sleigh.muzzle.getWorldQuaternion(_q);
    _d.copy(Z).applyQuaternion(_q);
    _d.x += (Math.random() - 0.5) * 0.03; _d.y += (Math.random() - 0.5) * 0.03; _d.normalize();
    tr.v.copy(_d).multiplyScalar(140).add(rig.SV); tr.life = 1.2;
    flash.position.copy(tr.p); flash.intensity = 25;
  }
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

// ---- chase camera ---------------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 50, -160), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const yawF = _d.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw));
  const want = _p.copy(rig.S).addScaledVector(yawF, -13).add(new THREE.Vector3(0, 5.5 - rig.pitch * 6, 0));
  const gy = groundH(want.x, want.z) + 2; if (want.y < gy) want.y = gy;
  camPos.lerp(want, 1 - Math.exp(-4 * dt));
  const look = new THREE.Vector3().addVectors(rig.S, rig.lead).multiplyScalar(0.5).addScaledVector(rig.fwd, 6);
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
  updateGun(dt);
  for (const c of cookies) {
    c.o.rotation.y += dt * 1.5;
    if (!c.alive) { c.t += dt; c.o.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 8) { c.alive = true; c.t = 0; c.o.scale.setScalar(1); } continue; }
    if (c.o.position.distanceToSquared(rig.S) < 16 || c.o.position.distanceToSquared(rig.lead) < 16) {
      c.alive = false; cookieCount++; milk = Math.min(100, milk + 20);
    }
  }
  $cookies.textContent = cookieCount; $milk.textContent = Math.round(milk);
  world.update(t, dt);
  updateCamera(dt);
  world.snowUpdate(camera.position, t, dt);
  // keep the shadow camera centred on the sleigh
  world.moonLight.target.position.copy(rig.S);
  world.moonLight.position.copy(rig.S).add(new THREE.Vector3(-120, 200, -140));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = { rig, scene, camera, FLY };
