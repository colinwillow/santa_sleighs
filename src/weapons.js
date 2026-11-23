// WEAPONS: his four guns (models/weapons/guns_rigged.glb, split + socketed by tools/blender/gun_rig.py) and what each fires.
// A held gun has the same shape as the old procedural one: { g, grips: {right, left}, muzzle, eject, flash, updBelt(t) }, so
// Santa's IK + aim code is unchanged. Projectiles (tracers / rockets / snowballs) live in `makeShots`.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { softDot } from './util.js';

// key -> how it holds, fires and hits. `len` = held length in metres (Rambo-size). Add a gun = a row + a node in the GLB.
export const WEAPONS = {
  gatling:  { name: 'GATLING',  node: 'gatling',         len: 1.75, rate: 0.06, shot: 'tracer',   speed: 150, spread: 0.035, kick: 0.06, spin: true, snd: 'gun_shot', vol: 0.6 },
  rifle:    { name: 'RIFLE',    node: 'rifle',           len: 1.8,  rate: 0.42, shot: 'slug',     speed: 300, spread: 0.002, kick: 0.22, snd: 'gun_shot', vol: 1.0, sndRate: 0.55 },
  rocket:   { name: 'ROCKETS',  node: 'rocket_launcher', len: 1.85, rate: 0.95, shot: 'rocket',   speed: 48,  spread: 0.01,  kick: 0.3,  snd: 'whoosh', vol: 0.9, blast: 7 },
  snowball: { name: 'SNOWBALLS', node: 'snowball_cannon', len: 1.6, rate: 0.3,  shot: 'snowball', speed: 58,  spread: 0.03,  kick: 0.14, snd: 'snow_puff', vol: 0.9, sndRate: 0.6, gravity: 16 },
};
export const ORDER = ['gatling', 'rifle', 'rocket', 'snowball'];

const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/draco/'); loader.setDRACOLoader(draco);
let gunsP = null;
export const loadGuns = () => gunsP || (gunsP = new Promise((res, rej) => loader.load('./models/weapons/guns_rigged.glb', g => res(g.scene), undefined, rej)));

const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

/** a held copy of gun `key` from the loaded GLB scene; origin = the main-hand grip, +Z = forward */
export function heldGun(scene, key) {
  const W = WEAPONS[key];
  const src = scene.getObjectByName(W.node);
  const body = src.clone(true);
  body.position.set(0, 0, 0); body.quaternion.identity(); body.scale.setScalar(1);
  const g = new THREE.Group(); g.add(body);
  // sockets are named grip_r / grip_r.001 ... -- match by prefix inside this gun
  const sock = p => { let f = null; body.traverse(o => { if (!f && o.name.startsWith(p) && !o.isMesh) f = o; }); return f || body; };
  const muzzle = sock('muzzle'), eject = sock('eject');
  // scale so the gun is W.len long (bounding box along +Z)
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body);
  g.scale.setScalar(W.len / Math.max(0.01, box.max.z - box.min.z));
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const barrels = body.getObjectByName('barrels');
  // muzzle flash: a star of additive cards at the muzzle (rockets / snowballs get a softer, smaller one)
  const flash = new THREE.Group(); muzzle.add(flash);
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.16), flashMat); m.rotation.set(Math.PI / 2, k * Math.PI / 3, 0); m.position.z = 0.06; flash.add(m); }
  flash.scale.setScalar(W.shot === 'snowball' ? 0.4 : W.shot === 'rocket' ? 0.8 : 1); flash.visible = false;
  let spin = 0;
  return {
    key, def: W, g, muzzle, eject, flash,
    grips: { right: sock('grip_r'), left: sock('grip_l') },
    firing: false,
    updBelt(t, dt = 1 / 60) {
      if (!barrels) return;
      spin += ((this.firing ? 30 : 0) - spin) * (1 - Math.exp(-(this.firing ? 5 : 1.5) * dt));
      barrels.rotation.z += spin * dt;    // the cluster's axis runs along the gun (+Z)
    },
  };
}

// ---- projectiles ----------------------------------------------------------------------------------------------------
/** makeShots(scene, groundH, { onBlast(p, r), onHit(p, kind) }) -> { fire(def, from, dir, inherit), update(dt) } */
export function makeShots(scene, groundH, hooks = {}) {
  const N = 40, list = [];
  const rocketGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.9, 10).rotateX(Math.PI / 2);
  const rocketMat = new THREE.MeshStandardMaterial({ color: '#d8282e', roughness: 0.5 });
  const noseMat = new THREE.MeshStandardMaterial({ color: '#f6efe2', roughness: 0.5 });
  const snowGeo = new THREE.IcosahedronGeometry(0.32, 1), snowMat = new THREE.MeshStandardMaterial({ color: '#f6f8ff', roughness: 0.9 });
  const slugMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe8ff').multiplyScalar(4), toneMapped: false });
  const slugGeo = new THREE.BoxGeometry(0.1, 0.1, 4.5);
  // smoke + sparks: one points cloud
  const P = 260, pp = new Float32Array(P * 3).fill(-999), pv = Array.from({ length: P }, () => new THREE.Vector3()), pl = new Float32Array(P), pc = new Float32Array(P * 3);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.4, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.8 }));
  pts.frustumCulled = false; scene.add(pts);
  let pi = 0;
  const puff = (p, color, n, speed, life, up = 1) => {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = pi++ % P; pp.set([p.x, p.y, p.z], i * 3); pc.set([c.r, c.g, c.b], i * 3);
      pv[i].set(Math.random() - 0.5, Math.random() * up, Math.random() - 0.5).multiplyScalar(speed); pl[i] = life * (0.6 + Math.random() * 0.6);
    }
  };
  const boom = new THREE.PointLight('#ffb050', 0, 30, 1.6); scene.add(boom);
  const _d = new THREE.Vector3();
  return {
    puff,
    fire(def, from, dir, inherit) {
      if (list.length >= N) { const old = list.shift(); scene.remove(old.mesh); }
      let mesh;
      if (def.shot === 'rocket') { mesh = new THREE.Group(); mesh.add(new THREE.Mesh(rocketGeo, rocketMat)); const n = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 10).rotateX(Math.PI / 2), noseMat); n.position.z = 0.6; mesh.add(n); }
      else if (def.shot === 'snowball') mesh = new THREE.Mesh(snowGeo, snowMat);
      else mesh = new THREE.Mesh(slugGeo, slugMat);
      mesh.position.copy(from); scene.add(mesh);
      const v = dir.clone().multiplyScalar(def.speed).add(inherit || _d.set(0, 0, 0));
      list.push({ def, mesh, v, life: def.shot === 'rocket' ? 4 : 2.5, trailT: 0 });
    },
    update(dt) {
      boom.intensity *= Math.exp(-8 * dt);
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i], m = s.mesh;
        s.life -= dt;
        if (s.def.gravity) s.v.y -= s.def.gravity * dt;
        if (s.def.shot === 'rocket') { s.v.addScaledVector(_d.copy(s.v).normalize(), 40 * dt); s.trailT -= dt; if (s.trailT <= 0) { s.trailT = 0.02; puff(m.position, '#d8d6e0', 1, 1.2, 1.2, 0.6); puff(m.position, '#ffb050', 1, 2, 0.15, 0.3); } }
        m.position.addScaledVector(s.v, dt);
        m.lookAt(_d.copy(m.position).add(s.v));
        if (s.def.shot === 'snowball') m.rotation.x += dt * 8;
        const gy = groundH(m.position.x, m.position.z);
        if (m.position.y < gy || s.life <= 0) {
          const hit = m.position.y < gy + 0.5;
          if (hit) {
            m.position.y = Math.max(m.position.y, gy);
            if (s.def.shot === 'rocket') {
              puff(m.position, '#ffb050', 18, 10, 0.5); puff(m.position, '#3a3440', 14, 6, 1.8); puff(m.position, '#ffffff', 16, 9, 1.2);
              boom.position.copy(m.position); boom.position.y += 2; boom.intensity = 120;
              window.sfx?.play('explosion', { vol: 1 }); hooks.onBlast?.(m.position.clone(), s.def.blast);
            } else if (s.def.shot === 'snowball') { puff(m.position, '#ffffff', 16, 6, 1.0); window.sfx?.play('snow_puff', { vol: 0.8, rate: 0.7 }); }
            else puff(m.position, '#ffffff', 4, 4, 0.6);
            hooks.onHit?.(m.position.clone(), s.def.shot);
          }
          scene.remove(m); list.splice(i, 1);
        }
      }
      for (let i = 0; i < P; i++) {
        if (pl[i] <= 0) continue;
        pl[i] -= dt; pv[i].multiplyScalar(Math.exp(-2 * dt)); pv[i].y += 1.5 * dt;
        pp[i * 3] += pv[i].x * dt; pp[i * 3 + 1] += pv[i].y * dt; pp[i * 3 + 2] += pv[i].z * dt;
        if (pl[i] <= 0) pp[i * 3 + 1] = -999;
      }
      pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    },
  };
}
