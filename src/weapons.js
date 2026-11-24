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
  // his note: every gun read dull + dark -- the Tripo materials come in fully metallic with no reflections to show, so they go
  // near-black. Cut the metalness, lift the albedo a touch, keep a little sheen.
  body.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
    const fix = m => { m = m.clone(); if (m.metalness !== undefined) { m.metalness = Math.min(m.metalness, 0.15); m.roughness = Math.min(Math.max(m.roughness ?? 0.5, 0.35), 0.6); } if (m.color) m.color.multiplyScalar(1.25);
      // b41 (his: "the gun textures are still dark" at dusk): a soft self-glow from the gun's own texture so it reads in any light
      if (m.emissive) { m.emissive.setRGB(1, 1, 1); m.emissiveMap = m.map || null; m.emissiveIntensity = m.map ? 0.35 : 0; if (!m.map) m.emissive.copy(m.color).multiplyScalar(0.25), m.emissiveIntensity = 1; }
      return m; };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
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
        const prevP = m.position.clone();
        m.position.addScaledVector(s.v, dt);
        m.lookAt(_d.copy(m.position).add(s.v));
        if (s.def.shot === 'snowball') m.rotation.x += dt * 8;
        const gy = groundH(m.position.x, m.position.z);
        const inSolid = !!hooks.solid && (hooks.solid(m.position) || hooks.solid(prevP.lerp(m.position, 0.5)));   // bricks (sub-stepped)
        if (m.position.y < gy || s.life <= 0 || inSolid) {
          const hit = inSolid || m.position.y < gy + 0.5;
          if (hit) {
            if (!inSolid) m.position.y = Math.max(m.position.y, gy);
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

// ---- b74 GRENADES ON FOOT: the ORNAMENT BOMB (delivery.js bombGeo, his red glass bauble with a fuse) -----------------------------
// THROW: speed = m/s of a throw solved onto the crosshair's point (the LOW arc; out of reach = the 45 deg max-range throw); g = its
// gravity; fuse = s from the throw to the bang (it bounces + rolls meanwhile: bounce = share of vertical speed kept, roll = share of
// horizontal speed kept per bounce); blast = m (town / props / snowmen / gingerfolk / his sleigh, like a rocket); size = m across in
// his hand and in flight. The THROW CLIP (his library's Grenade_Throw_2, 2.8 s, measured: the hand's peak speed -- the release --
// is at 2.05 s): COCK plays it from `from` s and HOLDS it at `cockAt` (the wind-up, arm back) while he aims; RELEASE runs it on at
// animSpeed x, the bomb leaves his hand at `releaseAt`, he is back in his stance by `endAt`. arcStep / arcMaxT / arcDots = the
// dotted THROW ARC (simulated with the same physics up to the first touch) + the landing ring.
export const THROW = { speed: 21, g: 18, fuse: 1.35, bounce: 0.32, roll: 0.55, blast: 4.4, size: 0.42, minLoft: 0.12,
  clip: 'Grenade_Throw_2', from: 1.3, cockAt: 1.9, releaseAt: 2.05, endAt: 2.55, animSpeed: 2.4, cockSpeed: 1.6,
  arcStep: 1 / 60, arcMaxT: 4, arcDots: 34, dot: 0.34, ring: 1.6, ringView: 0.06 };

/** the launch velocity that lands a throw from `from` on `to` at THROW.speed (the low arc), or the max-range 45 deg throw toward it */
export function solveThrow(from, to, speed = THROW.speed, g = THROW.g, out = new THREE.Vector3()) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(0.01, Math.hypot(dx, dz)), dy = to.y - from.y, v2 = speed * speed;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  let a = disc >= 0 ? Math.atan2(v2 - Math.sqrt(disc), g * d) : Math.PI / 4;
  a = Math.max(a, THROW.minLoft);
  return out.set(dx / d * Math.cos(a) * speed, Math.sin(a) * speed, dz / d * Math.cos(a) * speed);
}

/** makeGrenades(scene, groundH, geo, { onBlast(p, r), solid(p), puff(p, col, n, speed, life, up) }) -> { throw(from, v), predict(from, v, pts) , update(dt) } */
export function makeGrenades(scene, groundH, geo, hooks = {}) {
  const N = 6, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.15 });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.userData.noMerge = true; scene.add(mesh);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, ZERO);
  const list = [], k = THROW.size / 0.72;   // the bauble is modelled 0.72 m across
  const floorAt = (x, z) => groundH(x, z);
  /** one physics step (shared by the flight and the arc preview); returns 'ground' | 'solid' | null */
  function step(p, v, h) {
    v.y -= THROW.g * h; _t.copy(p); p.addScaledVector(v, h);
    if (hooks.solid?.(p)) { p.copy(_t); return 'solid'; }
    if (p.y < floorAt(p.x, p.z) + THROW.size * 0.5) return 'ground';
    return null;
  }
  return {
    /** the throw arc from `from` with launch `v`: fills pts (Vector3s) and returns { land, n, hit } */
    predict(from, v, pts) {
      const p = _p.copy(from), vv = _s.copy(v); let n = 0, t = 0, hit = null;
      const every = Math.max(1, Math.round(THROW.arcMaxT / THROW.arcStep / pts.length / 2));
      for (let i = 0; t < THROW.arcMaxT; i++, t += THROW.arcStep) {
        hit = step(p, vv, THROW.arcStep);
        if (i % every === 0 && n < pts.length) pts[n++].copy(p);
        if (hit) break;
      }
      if (hit === 'ground') p.y = floorAt(p.x, p.z) + 0.08;
      return { land: p, n, hit: !!hit };
    },
    throw(from, v) {
      if (list.length >= N) list.shift();
      list.push({ p: from.clone(), v: v.clone(), rot: new THREE.Vector3(), spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 6 - 3, Math.random() * 10 - 5), fuse: THROW.fuse, spark: 0, rest: false });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]; b.fuse -= dt;
        if (!b.rest) for (let s = 0; s < 3; s++) {
          const r = step(b.p, b.v, dt / 3);
          if (r === 'ground') {
            b.p.y = floorAt(b.p.x, b.p.z) + THROW.size * 0.5;
            if (Math.abs(b.v.y) > 2.5) { b.v.y = -b.v.y * THROW.bounce; b.v.x *= THROW.roll; b.v.z *= THROW.roll; b.spin.multiplyScalar(0.6); window.sfx?.play('casing', { vol: 0.5, rate: 0.45 }); }
            else { b.v.set(b.v.x * THROW.roll, 0, b.v.z * THROW.roll); if (Math.hypot(b.v.x, b.v.z) < 0.4) b.rest = true; }
          } else if (r === 'solid') { b.v.multiplyScalar(-0.25); b.v.y = Math.abs(b.v.y); window.sfx?.play('casing', { vol: 0.5, rate: 0.5 }); }
        }
        else { b.p.y = floorAt(b.p.x, b.p.z) + THROW.size * 0.5; }
        if (!b.rest) b.rot.addScaledVector(b.spin, dt);
        // the fuse fizzes: sparks off the top, faster as it runs out
        b.spark -= dt;
        if (b.spark <= 0) { b.spark = b.fuse < 0.5 ? 0.03 : 0.07; hooks.puff?.(_t.set(0, 0.56 * k, 0).applyEuler(_e.set(b.rot.x, b.rot.y, b.rot.z)).add(b.p), '#ffb040', 2, 2, 0.3, 1.5); if (b.fuse < 0.6 && Math.random() < 0.4) window.sfx?.play('casing', { vol: 0.25, rate: 2.2 }); }
        if (b.fuse <= 0) {
          hooks.puff?.(b.p, '#ffb050', 18, 10, 0.5); hooks.puff?.(b.p, '#3a3440', 14, 6, 1.8); hooks.puff?.(b.p, '#ffffff', 16, 9, 1.2); hooks.puff?.(b.p, '#ff4050', 10, 8, 0.7);
          window.sfx?.play('explosion', { vol: 1 }); hooks.onBlast?.(b.p.clone(), THROW.blast);
          list.splice(i, 1);
        }
      }
      for (let i = 0; i < N; i++) {
        const b = list[i];
        if (!b) { mesh.setMatrixAt(i, ZERO); continue; }
        const pulse = b.fuse < 0.5 ? 1 + Math.sin(b.fuse * 60) * 0.08 : 1;
        mesh.setMatrixAt(i, _m.compose(b.p, _q.setFromEuler(_e.set(b.rot.x, b.rot.y, b.rot.z)), _s.setScalar(k * pulse)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** THE AIM ARC: a dotted ink-edged trajectory (one Points draw) + a landing ring (one quad), drawn over the world */
export function makeAimArc(scene, n = THROW.arcDots) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fillStyle = 'rgba(29,20,32,0.9)'; x.fill();
  x.beginPath(); x.arc(32, 32, 17, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
  const dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  const pos = new Float32Array(n * 3).fill(-9999), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dots = new THREE.Points(g, new THREE.PointsMaterial({ size: THROW.dot, map: dotTex, transparent: true, alphaTest: 0.3, depthTest: false, depthWrite: false, toneMapped: false }));
  dots.renderOrder = 19; dots.frustumCulled = false; dots.visible = false; dots.userData.noMerge = true; scene.add(dots);
  const rc = document.createElement('canvas'); rc.width = rc.height = 128; const r = rc.getContext('2d');
  const ringAt = (rad, w, col) => { r.beginPath(); r.arc(64, 64, rad, 0, Math.PI * 2); r.lineWidth = w; r.strokeStyle = col; r.stroke(); };
  ringAt(52, 12, 'rgba(29,20,32,0.85)'); ringAt(52, 6, '#ffffff'); r.setLineDash([8, 7]); ringAt(30, 5, 'rgba(29,20,32,0.7)'); ringAt(30, 2.4, '#ffffff');
  const ringTex = new THREE.CanvasTexture(rc); ringTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  ring.renderOrder = 20; ring.frustumCulled = false; ring.visible = false; ring.userData.noMerge = true; scene.add(ring);
  const pts = Array.from({ length: n }, () => new THREE.Vector3());
  return {
    pts,
    /** show `count` of pts as the arc, the ring at `land` (null = no ring), coloured `col`; `cam` sizes the ring on screen */
    show(count, land, col = '#ffffff', cam = null) {
      for (let i = 0; i < n; i++) { const p = i < count ? pts[i] : null; pos[i * 3] = p ? p.x : -9999; pos[i * 3 + 1] = p ? p.y : -9999; pos[i * 3 + 2] = p ? p.z : -9999; }
      g.attributes.position.needsUpdate = true; dots.visible = count > 0; dots.material.color.set(col);
      ring.visible = !!land;
      if (land) { const d = cam ? cam.position.distanceTo(land) : 20, s = Math.max(THROW.ring, d * THROW.ringView) * (1 + Math.sin(performance.now() / 140) * 0.06);
        ring.position.copy(land); ring.scale.setScalar(s); ring.rotation.y += 0.02; ring.material.color.set(col); }
    },
    hide() { dots.visible = false; ring.visible = false; },
  };
}
