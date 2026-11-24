// PROPS (b60, his: "pretty much everything destructible"): the rest of the village you can break.
//   GINGERBREAD CARS -- cookie cars in the house style, pre-split into pieces (front + rear body halves, cabin, roof frosting,
//     doors, candy-stripe bumpers, gumdrop wheels, candy lights that glow). Bullets chip pieces off; a rocket / sleigh crash
//     flips the car (CPU rigid tumble, settles on a face) and scatters the pieces; a wreck stays and smokes.
//   TREES -- the instanced round + pine trees (ground.js flora, world.js forest). Hits knock the snow off (the snow instance
//     shrinks into the tree + a powder puff); enough damage (a rocket, the sleigh, ~15 Gatling hits) TOPPLES it about its base.
//   GINGERFOLK -- the first time a house loses chunks, 1-3 gingerbread people burst out of its door in a panic and run from
//     Santa, then hide or slip away behind a house (a recycled pool of 10, src/gingerfolk.js lite bodies). Blasts throw them.
// Cost: cars = 8 instanced draws (+1 headlight pools) for all of them; trees add 2 draws (the snow meshes); a running
// gingerperson is 8 small meshes, hidden when pooled. No util rand() here: the village layout stream stays where it was.
import * as THREE from 'three';
import { groundH } from './terrain.js';
import { BALL, bevBox, softDot } from './util.js';
import { makeGingerLite, gingerCrackKit, FOLK } from './gingerfolk.js';

export const PROPS = {
  car: { hp: 30, pieceHp: 3, launch: 20, reach: 2.8, smokeDt: 0.25, max: 12 },
  tree: { hp: 15, snowHit: 0.14, fall: 0.85, rest: 1.47, gridS: 16 },
  folk: { pool: 10, speed: [4.2, 5.8], runT: [4, 7], hideT: 2.4 },
  crack: { per: 96, life: 10, fade: 0.6, r: 0.3, crackR: 0.6 },   // b69: shard pool per kind, s on the ground, capsule r, blast reach past r
  gravity: 22,
};

const V3 = THREE.Vector3, UP = new V3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const _c = new THREE.Color();
const M = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
/** [[geo, colour, Matrix4]] -> one vertex-coloured geometry */
function bake(list) {
  const P = [], N = [], C = [];
  for (const [g0, col, m] of list) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()); if (m) g.applyMatrix4(m); _c.set(col);
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) C.push(_c.r, _c.g, _c.b);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere(); return g;
}

// ---- the cookie car's pieces (car frame: +Z forward, origin on the ground at its middle) -----------------------------------
const CC = { cookie: '#b86a30', toast: '#94512a', icing: '#fff6ea', choc: '#4a2a1a', glass: '#3a4c78', red: '#e3283a' };
function carGeos() {
  const half = front => {
    const s = front ? 1 : -1, L = [];
    L.push([bevBox(1.9, 0.62, 2.12, 0.2, 2), CC.cookie, M(0, 0.64, s * 1.04)]);
    for (const x of [-0.93, 0.93]) L.push([bevBox(0.08, 0.08, 2.0, 0.03, 1), CC.icing, M(x, 0.95, s * 1.04)]);   // piped rim
    L.push([bevBox(1.8, 0.08, 0.08, 0.03, 1), CC.icing, M(0, 0.95, s * 2.08)]);
    for (let k = 0; k < 5; k++) for (const x of [-0.96, 0.96]) L.push([BALL, CC.icing, M(x, 0.52, s * (0.2 + k * 0.42), 0.055)]);   // icing dots
    L.push([bevBox(1.7, 0.1, 1.9, 0.04, 1), CC.toast, M(0, 0.34, s * 1.04)]);   // toasted underside
    if (front) {
      L.push([bevBox(1.2, 0.26, 0.06, 0.02, 1), CC.choc, M(0, 0.66, 2.11)]);   // chocolate grille
      for (let k = 0; k < 3; k++) L.push([bevBox(0.7, 0.035, 0.035, 0.012, 1), CC.icing, M(0, 0.965, 1.3, 1, 1, 1, 0, k * Math.PI / 3, 0)]);   // hood snowflake
    } else for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; L.push([BALL, CC.icing, M(Math.cos(a) * 0.32, 0.965, -1.35 + Math.sin(a) * 0.32, 0.05, 0.02, 0.05)]); }   // trunk ring
    return bake(L);
  };
  const cabin = [[bevBox(1.6, 0.58, 2.0, 0.2, 2), CC.cookie, M(0, 1.24, -0.25)],
    [bevBox(1.36, 0.38, 0.05, 0.02, 1), CC.glass, M(0, 1.27, 0.76)], [bevBox(1.36, 0.36, 0.05, 0.02, 1), CC.glass, M(0, 1.27, -1.26)]];
  for (const x of [-0.81, 0.81]) for (const z of [0.25, -0.7]) cabin.push([bevBox(0.05, 0.34, 0.75, 0.02, 1), CC.glass, M(x, 1.27, z)]);
  for (const x of [-0.8, 0.8]) cabin.push([bevBox(0.07, 0.07, 1.9, 0.03, 1), CC.icing, M(x, 0.98, -0.25)]);
  const frost = [[bevBox(1.72, 0.13, 2.1, 0.06, 2), '#ffffff', M(0, 1.57, -0.25)]];
  for (const x of [-0.84, 0.84]) for (let k = 0; k < 6; k++) frost.push([BALL, '#ffffff', M(x, 1.5, -1.15 + k * 0.36, 0.07, 0.12, 0.07)]);   // drips
  for (const z of [0.8, -1.3]) for (let k = 0; k < 4; k++) frost.push([BALL, '#ffffff', M(-0.6 + k * 0.4, 1.5, z, 0.07, 0.12, 0.07)]);
  const door = [[bevBox(0.07, 0.48, 1.05, 0.03, 1), CC.cookie, M()],
    [bevBox(0.03, 0.05, 1.0, 0.02, 1), CC.icing, M(0.045, 0.22, 0)], [bevBox(0.03, 0.05, 1.0, 0.02, 1), CC.icing, M(0.045, -0.22, 0)],
    [bevBox(0.03, 0.44, 0.05, 0.02, 1), CC.icing, M(0.045, 0, 0.5)], [bevBox(0.03, 0.44, 0.05, 0.02, 1), CC.icing, M(0.045, 0, -0.5)],
    [BALL, CC.red, M(0.07, 0.08, -0.3, 0.05, 0.05, 0.08)]];
  const bumper = []; for (let k = 0; k < 8; k++) bumper.push([bevBox(0.25, 0.18, 0.18, 0.05, 1), k % 2 ? CC.icing : CC.red, M(-0.875 + k * 0.25, 0, 0)]);
  const wheel = [[new THREE.CylinderGeometry(0.36, 0.38, 0.26, 10).rotateZ(Math.PI / 2), '#cfcfcf', null],
    [new THREE.SphereGeometry(0.3, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), '#ffffff', M(0.13, 0, 0, 1, 1, 0.7)]];
  const light = [[BALL, '#ffffff', M(-0.62, 0, 0, 0.14)], [BALL, '#ffffff', M(0.62, 0, 0, 0.14)]];
  return { front: half(true), rear: half(false), cabin: bake(cabin), frost: bake(frost), door: bake(door), bumper: bake(bumper), wheel: bake(wheel), light: bake(light) };
}
// per car: [kind, local matrix, detachable, parent piece index]
const CAR_PARTS = [
  ['front', M(), false], ['rear', M(), false], ['cabin', M(), true], ['frost', M(), true, 2],
  ['door', M(0.97, 0.66, -0.15), true], ['door', M(-0.97, 0.66, -0.15, 1, 1, 1, 0, Math.PI, 0), true],
  ['bumper', M(0, 0.42, 2.14), true], ['bumper', M(0, 0.42, -2.14, 1, 1, 1, 0, Math.PI, 0), true],
  ['wheel', M(0.9, 0.36, 1.35), true], ['wheel', M(0.9, 0.36, -1.35), true],
  ['wheel', M(-0.9, 0.36, 1.35, 1, 1, 1, 0, Math.PI, 0), true], ['wheel', M(-0.9, 0.36, -1.35, 1, 1, 1, 0, Math.PI, 0), true],
  ['light', M(0, 0.72, 2.1), true, 0], ['light', M(0, 0.72, -2.1, 1, 1, 1, 0, Math.PI, 0), true, 1],
];
const KIND_N = {}; CAR_PARTS.forEach(([k]) => { KIND_N[k] = (KIND_N[k] || 0) + 1; });
const FROSTING = ['#ff9cc0', '#a8e8c8', '#fff0a0', '#fff6ea', '#b8d4ff', '#ffc890'];
const GUMDROP = ['#e8303a', '#3aa85a', '#ffd23a', '#ff7ab8', '#8a5ae0'];
const BOX_C = new V3(0, 0.95, -0.05), BOX_H = new V3(0.97, 0.7, 2.25);   // the car's hit box (car frame)

export function makeProps(scene, world) {
  const hooks = { puff: null, shake: null };
  const sfx = (n, o) => window.sfx?.play(n, o);
  const puff = (...a) => hooks.puff?.(...a);

  // ================================================== CARS =================================================================
  const CMAX = PROPS.car.max, cars = [];
  let carIM = null, glowIM = null, poolIM = null;
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  function carMeshes() {
    if (carIM) return;
    const G = carGeos(); carIM = {};
    for (const k of Object.keys(KIND_N)) {
      const im = new THREE.InstancedMesh(G[k], k === 'light' ? glowMat : carMat, CMAX * KIND_N[k]);
      im.count = 0; im.frustumCulled = false; im.castShadow = k !== 'light'; im.receiveShadow = true; im.userData.noMerge = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CMAX * KIND_N[k] * 3).fill(1), 3);
      scene.add(im); carIM[k] = im;
    }
    glowIM = carIM.light;
    poolIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(4, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffe8b0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), CMAX);
    poolIM.count = 0; poolIM.frustumCulled = false; poolIM.userData.noMerge = true; scene.add(poolIM);
  }
  /** a gingerbread car; village.js poses it with car.drive(x, y, z, ry) while it is intact (mode 'idle') */
  function addCar({ parked = false } = {}) {
    carMeshes();
    if (cars.length >= CMAX) return null;
    const id = cars.length, slot = {};
    const c = { id, parked, mode: 'idle', damaged: false, hp: PROPS.car.hp, pos: new V3(), q: new THREE.Quaternion(), vel: new V3(), spin: new V3(), smokeT: 0, restT: 0, pieces: [] };
    CAR_PARTS.forEach(([kind, local, det, parent], j) => {
      const n = slot[kind] = (slot[kind] || 0), ix = id * KIND_N[kind] + n; slot[kind]++;
      const im = carIM[kind];
      c.pieces.push({ kind, im, ix, local, lc: new V3().setFromMatrixPosition(local).add(kind === 'cabin' ? new V3(0, 1.24, -0.25) : kind === 'frost' ? new V3(0, 1.57, -0.25) : kind === 'front' ? new V3(0, 0.64, 1) : kind === 'rear' ? new V3(0, 0.64, -1) : new V3()),
        det, parent, hp: PROPS.car.pieceHp, loose: false, pos: new V3(), q: new THREE.Quaternion(), vel: new V3(), spin: new V3(), rest: false, r: kind === 'wheel' ? 0.36 : kind === 'cabin' ? 0.3 : 0.15 });
      im.count = Math.max(im.count, ix + 1);
      if (kind === 'frost') im.setColorAt(ix, _c.set(FROSTING[id % FROSTING.length]));
      else if (kind === 'wheel') im.setColorAt(ix, _c.set(GUMDROP[(id + n) % GUMDROP.length]));
      else if (kind === 'light') im.setColorAt(ix, n === 0 ? _c.setRGB(2.4, 2.1, 1.5).multiplyScalar(parked ? 0.45 : 1) : _c.setRGB(2.2, 0.25, 0.3).multiplyScalar(parked ? 0.45 : 1));
      else im.setColorAt(ix, _c.setScalar(0.92 + Math.random() * 0.12));   // a little more / less toasted per car
    });
    for (const im of Object.values(carIM)) im.instanceColor.needsUpdate = true;
    if (!parked) poolIM.count = Math.max(poolIM.count, id + 1);
    c.col = { x: 0, z: 0, r: 2.2, top: 2.4, prop: c };
    world.colliders.push(c.col);
    c.drive = (x, y, z, ry) => { if (c.mode !== 'idle') return false; c.pos.set(x, y, z); c.q.setFromAxisAngle(UP, ry); return true; };
    cars.push(c);
    return c;
  }
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new V3(), _v2 = new V3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _one = new V3(1, 1, 1);
  const carMatrix = (c, out) => out.compose(c.pos, c.q, _one);
  function detach(c, p, push0, from0) {
    if (p.loose || !p.det) return;
    const push = push0 ? push0.clone() : null, from = from0 ? from0.clone() : null;
    carMatrix(c, _m).multiply(p.local); _m.decompose(p.pos, p.q, _v);
    // the piece's middle (its local origin can sit at the car's floor)
    p.pos.add(_v2.copy(p.lc).sub(_v.setFromMatrixPosition(p.local)).applyQuaternion(p.q));
    p.off = new V3().setFromMatrixPosition(p.local).sub(p.lc);   // origin offset from the middle, piece frame (no rotation in the offsets)
    p.loose = true; p.rest = false; p.life = 0;
    p.vel.copy(c.vel);
    const out = p.pos.clone().sub(from || c.pos).setY(0); if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5); out.normalize();
    p.vel.addScaledVector(out, rnd(2.5, 5)); if (push) p.vel.add(push); p.vel.y += rnd(3, 6);
    p.spin.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rnd(5, 11));
    for (const o of c.pieces) if (o.parent !== undefined && c.pieces[o.parent] === p) detach(c, o, push, from);
  }
  function wreck(c, launch, from0, push) {
    const first = c.mode !== 'fly' && c.mode !== 'wreck', from = from0.clone();
    c.mode = 'fly'; c.hp = 0; c.damaged = true; c.restT = 0; c.col.top = 1.8;
    const away = c.pos.clone().sub(from).setY(0); const d = away.length(); if (d < 1e-3) away.set(1, 0, 0); else away.multiplyScalar(1 / d);
    if (launch > 0) {
      c.vel.copy(away).multiplyScalar(5 + 8 * launch); c.vel.y = 7 + 7 * launch; if (push) c.vel.addScaledVector(push, 0.25);
      // tumble mostly about the car's long + side axes (it rolls / flips, not spins like a top)
      c.spin.set(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize().multiplyScalar(4 + 5 * launch);
      for (const p of c.pieces) if (p.det && Math.random() < 0.65) detach(c, p, away.clone().multiplyScalar(4 * launch), from);
      puff(_v2.copy(c.pos).setY(c.pos.y + 1), '#ffb050', 14, 8, 0.5); puff(_v2, '#3a3440', 12, 5, 1.6);
      sfx('explosion', { vol: 0.8, rate: 1.1 }); sfx('debris', { vol: 0.7 });
    } else {   // shot to bits: it slumps with a hop and a cough of smoke
      c.vel.set(0, 3.5, 0); c.spin.set(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5));
      for (const p of c.pieces) if (p.det && Math.random() < 0.3) detach(c, p, null, from);
      puff(_v2.copy(c.pos).setY(c.pos.y + 1), '#ffb050', 8, 5, 0.4); puff(_v2, '#3a3440', 10, 4, 1.4);
      sfx('explosion', { vol: 0.45, rate: 1.4 });
    }
    if (first) for (const p of c.pieces) if (p.kind === 'light' && !p.loose) p.im.setColorAt(p.ix, _c.setRGB(0.12, 0.08, 0.06));
    glowIM.instanceColor.needsUpdate = true;
    poolIM.setMatrixAt(c.id, ZERO);
  }
  /** nearest car along a ray: { car, dist, point } */
  const _o = new V3(), _d = new V3();
  function rayCar(from, dir, maxD) {
    let best = null;
    for (const c of cars) {
      const lim = best ? best.dist : maxD;
      _qi.copy(c.q).invert();
      _o.copy(from).sub(c.pos).applyQuaternion(_qi).sub(BOX_C); _d.copy(dir).applyQuaternion(_qi);
      let t0 = 0, t1 = lim, ok = true;
      for (const a of ['x', 'y', 'z']) {
        if (Math.abs(_d[a]) < 1e-8) { if (Math.abs(_o[a]) > BOX_H[a]) { ok = false; break; } continue; }
        let ta = (-BOX_H[a] - _o[a]) / _d[a], tb = (BOX_H[a] - _o[a]) / _d[a]; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok) best = { car: c, dist: t0, point: from.clone().addScaledVector(dir, t0) };
    }
    return best;
  }
  function carInside(p) {
    for (const c of cars) {
      if ((p.x - c.pos.x) ** 2 + (p.z - c.pos.z) ** 2 > 7) continue;
      _o.copy(p).sub(c.pos).applyQuaternion(_qi.copy(c.q).invert()).sub(BOX_C);
      if (Math.abs(_o.x) < BOX_H.x && Math.abs(_o.y) < BOX_H.y && Math.abs(_o.z) < BOX_H.z) return true;
    }
    return false;
  }
  function chipCar(c, point, dmg, dir) {
    c.damaged = true; c.hp -= dmg;
    _o.copy(point).sub(c.pos).applyQuaternion(_qi.copy(c.q).invert());
    let best = null, bd = 1e9;
    for (const p of c.pieces) { if (p.loose) continue; const d = p.lc.distanceToSquared(_o) * (p.det ? 1 : 2.2); if (d < bd) { bd = d; best = p; } }
    puff(point, '#c0743a', 3, 3, 0.5);
    if (best && best.det) { best.hp -= dmg; if (best.hp <= 0) { detach(c, best, _v.copy(dir).multiplyScalar(3), point); sfx('crunch', { vol: 0.6 }); } }
    if (c.hp <= 0 && c.mode !== 'fly' && c.mode !== 'wreck') wreck(c, 0, point);
  }
  function carBlast(p, r, power, push) {
    for (const c of cars) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.y + 0.8 - p.y, c.pos.z - p.z), reach = r + PROPS.car.reach;
      if (d > reach) continue;
      if (power >= PROPS.car.launch) wreck(c, Math.min(1, Math.max(0.3, 1 - d / reach) * 1.3), p, push);
      else { const mid = c.pos.clone().setY(c.pos.y + 0.8); chipCar(c, mid.clone().lerp(p, 0.5), power, mid.sub(p).normalize()); }
    }
  }
  const corners = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(new V3(sx * BOX_H.x, sy * BOX_H.y, sz * BOX_H.z).add(BOX_C));
  const AXES = [new V3(0, -1, 0), new V3(0, 1, 0), new V3(1, 0, 0), new V3(-1, 0, 0)];
  const _qs = new THREE.Quaternion(), _qr = new THREE.Quaternion();
  function stepCar(c, dt, near) {
    if (c.mode === 'fly') {
      c.vel.y -= PROPS.gravity * dt; c.pos.addScaledVector(c.vel, dt);
      const w = c.spin.length(); if (w > 1e-4) { _qs.setFromAxisAngle(_v.copy(c.spin).multiplyScalar(1 / w), w * dt); c.q.premultiply(_qs).normalize(); }
      // ground contact: lift by the deepest box corner
      let pen = 0; for (const k of corners) { _v.copy(k).applyQuaternion(c.q).add(c.pos); pen = Math.max(pen, groundH(_v.x, _v.z) - _v.y); }
      if (pen > 0) {
        c.pos.y += pen;
        if (c.vel.y < -3) { c.spin.multiplyScalar(0.7); if (c.vel.y < -7) { sfx('debris', { vol: 0.5, rate: 0.7 }); puff(c.pos, '#ffffff', 10, 5, 0.9); } }
        if (c.vel.y < 0) c.vel.y *= -0.3;
        const k = Math.exp(-5 * dt); c.vel.x *= k; c.vel.z *= k; c.spin.multiplyScalar(Math.exp(-2.5 * dt));
        // slow enough: settle onto whichever face is nearest the ground (wheels, roof or a side)
        if (c.vel.lengthSq() < 4) {
          c.spin.multiplyScalar(Math.exp(-6 * dt));
          let ba = null, by = 1; for (const a of AXES) { const y = _v.copy(a).applyQuaternion(c.q).y; if (y < by) { by = y; ba = a; } }
          _qr.setFromUnitVectors(_v.copy(ba).applyQuaternion(c.q), _v2.set(0, -1, 0)).multiply(c.q);
          c.q.slerp(_qr, 1 - Math.exp(-5 * dt));
          c.restT += dt; if (c.restT > 1.4) { c.mode = 'wreck'; c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); }
        }
      }
    }
    if ((c.mode === 'wreck' || c.mode === 'fly') && near) {   // a smoking wreck
      c.smokeT -= dt;
      if (c.smokeT <= 0) { c.smokeT = PROPS.car.smokeDt * rnd(0.7, 1.4); puff(_v.copy(BOX_C).applyQuaternion(c.q).add(c.pos).setY(c.pos.y + 1.1), Math.random() < 0.15 ? '#ff9a40' : '#3a3440', 1, 1.2, 2.2, 2.5); }
    }
    c.col.x = c.pos.x; c.col.z = c.pos.z;
  }
  function stepPiece(p, dt) {
    p.life += dt;
    p.vel.y -= PROPS.gravity * dt; p.pos.addScaledVector(p.vel, dt);
    const w = p.spin.length(); if (w > 1e-4) { _qs.setFromAxisAngle(_v.copy(p.spin).multiplyScalar(1 / w), w * dt); p.q.premultiply(_qs).normalize(); }
    const gy = groundH(p.pos.x, p.pos.z) + p.r;
    if (p.pos.y < gy) {
      p.pos.y = gy; if (p.vel.y < 0) p.vel.y *= -0.3;
      const k = Math.exp(-6 * dt); p.vel.x *= k; p.vel.z *= k; p.spin.multiplyScalar(0.6);
      if ((p.vel.lengthSq() < 0.5 && Math.abs(p.vel.y) < 0.8) || p.life > 6) { p.rest = true; p.vel.set(0, 0, 0); p.spin.set(0, 0, 0); }
    }
  }
  function carsUpdate(dt, santa) {
    if (!carIM) return;
    for (const c of cars) {
      stepCar(c, dt, c.pos.distanceToSquared(santa) < 160 * 160);
      carMatrix(c, _m);
      for (const p of c.pieces) {
        if (!p.loose) { p.im.setMatrixAt(p.ix, _m2.multiplyMatrices(_m, p.local)); continue; }
        if (!p.rest) stepPiece(p, dt);
        p.im.setMatrixAt(p.ix, _m2.compose(_v.copy(p.off).applyQuaternion(p.q).add(p.pos), p.q, _one));
      }
      if (!c.parked && c.mode === 'idle') poolIM.setMatrixAt(c.id, _m2.multiplyMatrices(_m, M(0, 0.05, 5.5)));
    }
    for (const im of Object.values(carIM)) im.instanceMatrix.needsUpdate = true;
    poolIM.instanceMatrix.needsUpdate = true;
  }

  // ================================================== TREES ================================================================
  const trees = [], grid = new Map(), GS = PROPS.tree.gridS;
  const gkey = (x, z) => (Math.floor(x / GS) + 1000) * 4096 + Math.floor(z / GS) + 1000;
  const dirty = new Set();
  /** register one instanced tree: { x, y, z, R crown radius, h height, m its instance matrix, parts [[im, i]], snow [[im, i]] } */
  function addTree(o) {
    const t = { ...o, m0: o.m.clone(), hp: PROPS.tree.hp, snowK: 1, st: 0, t: 0, axis: new V3(), thud: false };
    trees.push(t);
    const k = gkey(t.x, t.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t);
  }
  function near(x, z, r, fn) {
    const n = Math.ceil(r / GS);
    const cx = Math.floor(x / GS), cz = Math.floor(z / GS);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const L = grid.get((cx + i + 1000) * 4096 + cz + j + 1000); if (L) for (const t of L) fn(t); }
  }
  const _tm = new THREE.Matrix4(), _ts = new THREE.Matrix4(), _tq = new THREE.Quaternion();
  function treeMatrix(t, ang, out) {   // rotate the instance about its base point
    if (ang === 0) return out.copy(t.m0);
    _tq.setFromAxisAngle(t.axis, ang);
    return out.makeTranslation(t.x, t.y, t.z).multiply(_tm.makeRotationFromQuaternion(_tq)).multiply(_ts.makeTranslation(-t.x, -t.y, -t.z)).multiply(t.m0);
  }
  function writeTree(t, ang) {
    treeMatrix(t, ang, _m);
    for (const [im, i] of t.parts) { im.setMatrixAt(i, _m); dirty.add(im); }
    const k = t.snowK > 0.02 ? 0.3 + 0.7 * t.snowK : 0;   // the snow sinks into the tiers / crowns as it is knocked off
    _m2.copy(_m).multiply(_ts.makeScale(k || 1e-4, k || 1e-4, k || 1e-4));
    for (const [im, i] of t.snow) { im.setMatrixAt(i, _m2); dirty.add(im); }
  }
  function dumpSnow(t, amt) {
    if (t.snowK <= 0) return;
    const was = t.snowK; t.snowK = Math.max(0, t.snowK - amt);
    const n = Math.round((was - t.snowK) * 30) + 2;
    puff(_v.set(t.x, t.y + t.h * 0.75, t.z), '#f4f6ff', n, 2.5 + t.R, 1.3, 0.6);
    if (t.st === 0) writeTree(t, 0);
  }
  function topple(t, dirx, dirz) {
    if (t.st !== 0) return;
    const L = Math.hypot(dirx, dirz) || 1; dirx /= L; dirz /= L;
    t.st = 1; t.t = 0; t.thud = false; t.snowK = Math.min(t.snowK, 0.35);
    t.axis.crossVectors(UP, _v.set(dirx, 0, dirz)).normalize();
    t.fall = new V3(dirx, 0, dirz);
    puff(_v.set(t.x, t.y + 0.6, t.z), '#7a5236', 10, 3, 0.8, 0.8);   // trunk splinters
    sfx('crunch', { vol: 0.8, rate: 0.7 });
  }
  function hurtTree(t, dmg, dirx, dirz) {
    if (t.st !== 0) return;
    t.hp -= dmg; dumpSnow(t, PROPS.tree.snowHit * Math.min(dmg, 6));
    if (t.hp <= 0) topple(t, dirx, dirz);
  }
  /** nearest standing tree along a ray (a vertical cylinder of half its crown radius) */
  function rayTree(from, dir, maxD) {
    let best = null;
    const a = dir.x * dir.x + dir.z * dir.z;
    for (const t of trees) {
      if (t.st !== 0) continue;
      const ox = from.x - t.x, oz = from.z - t.z, rh = t.R * 0.5;
      let tA, tB;
      if (a < 1e-8) { if (ox * ox + oz * oz > rh * rh) continue; tA = 0; tB = maxD; }
      else {
        const t0 = -(ox * dir.x + oz * dir.z) / a, d2 = ox * ox + oz * oz - a * t0 * t0;
        if (d2 > rh * rh) continue;
        const w = Math.sqrt((rh * rh - d2) / a); tA = t0 - w; tB = t0 + w;
      }
      const lo = t.y + 0.3, hi = t.y + t.h * 0.9;
      if (Math.abs(dir.y) < 1e-8) { if (from.y < lo || from.y > hi) continue; }
      else { let y1 = (lo - from.y) / dir.y, y2 = (hi - from.y) / dir.y; if (y1 > y2) [y1, y2] = [y2, y1]; tA = Math.max(tA, y1); tB = Math.min(tB, y2); }
      tA = Math.max(tA, 0);
      if (tA > tB || tA > (best ? best.dist : maxD)) continue;
      best = { tree: t, dist: tA, point: from.clone().addScaledVector(dir, tA) };
    }
    return best;
  }
  function treeBlast(p, r, power) {
    near(p.x, p.z, r + 4, t => {
      if (t.st !== 0 || p.y > t.y + t.h + r) return;
      const d = Math.hypot(t.x - p.x, t.z - p.z) - t.R * 0.4;
      if (d > r + 1.5) return;
      dumpSnow(t, d < r ? 1 : 0.5);
      hurtTree(t, power >= PROPS.car.launch ? 99 : power * 2, t.x - p.x, t.z - p.z);
    });
  }
  function treeSolid(p) {
    let hit = false;
    near(p.x, p.z, 4, t => { if (!hit && t.st === 0 && p.y > t.y && p.y < t.y + t.h * 0.85 && (p.x - t.x) ** 2 + (p.z - t.z) ** 2 < (t.R * 0.4) ** 2) hit = true; });
    return hit;
  }
  function treesUpdate(dt, rig) {
    // the sleigh ploughs through trees: they go over in front of it
    if (rig) for (const P of [rig.S, rig.lead]) {
      if (!P) continue;
      near(P.x, P.z, 4, t => {
        if (t.st !== 0 || P.y > t.y + t.h * 0.85 || P.y < t.y - 1) return;
        if ((P.x - t.x) ** 2 + (P.z - t.z) ** 2 > (t.R * 0.55 + 0.6) ** 2) return;
        const v = rig.SV || UP; dumpSnow(t, 1);
        topple(t, v.x || (t.x - P.x), v.z || (t.z - P.z));
        hooks.shake?.(0.5); if (rig.speed) rig.speed *= 0.85;
        puff(_v.copy(P), '#ffffff', 14, 6, 1.0);
      });
    }
    for (const t of trees) {
      if (t.st !== 1) continue;
      t.t += dt;
      const f = Math.min(1, t.t / PROPS.tree.fall), R = PROPS.tree.rest;
      let ang = R * f * f;   // accelerates over like a felled tree
      if (f >= 1) {
        if (!t.thud) {
          t.thud = true; sfx('debris', { vol: 0.7, rate: 0.6 }); hooks.shake?.(0.25);
          const tip = _v.set(t.x, t.y, t.z).addScaledVector(t.fall, t.h * 0.65); tip.y = groundH(tip.x, tip.z) + 0.5;
          puff(tip, '#ffffff', 20, 6, 1.3, 1.0); puff(_v2.set(t.x, t.y + 0.4, t.z), '#7a5236', 6, 2, 0.6);
          t.snowK = 0;
        }
        const b = t.t - PROPS.tree.fall; ang = R - Math.sin(Math.min(1, b / 0.35) * Math.PI) * 0.07 * Math.exp(-b * 3);   // one little bounce
        if (b > 0.35) t.st = 2;
      }
      writeTree(t, ang);
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
    dirty.clear();
  }

  // ================================================ GINGERFOLK =============================================================
  const folk = [];   // { p: person, st: 'out'|'run'|'hide'|'gone'|'fly'|'down', ... }
  let folkBuilt = false;
  function buildFolk() {
    if (folkBuilt) return; folkBuilt = true;
    for (let i = 0; i < PROPS.folk.pool; i++) {
      const p = makeGingerLite({ tint: i % 3, scale: 0.95 + Math.random() * 0.2 });
      p.group.visible = false; p.group.rotation.order = 'YXZ'; scene.add(p.group);
      folk.push({ tint: i % 3, p, st: 'gone', pos: new V3(), vel: new V3(), dir: new V3(), t: 0, delay: 0, age: 0, rx: 0, rz: 0, spin: new V3() });
    }
  }
  let santaPos = new V3();
  /** the first hit on a house: 1-3 of them burst out of its door */
  function folkOut(hs) {
    buildFolk();
    const door = new V3(0, 0, hs.D / 2 + 0.5).applyMatrix4(hs.H), fx = door.x - hs.x, fz = door.z - hs.z, fl = Math.hypot(fx, fz) || 1;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      let f = folk.find(o => o.st === 'gone');
      if (!f) { f = folk.reduce((a, b) => (b.age > a.age ? b : a)); }   // all busy: recycle the one out longest
      f.st = 'out'; f.t = 0; f.age = 0; f.delay = k * rnd(0.25, 0.45); f.house = hs;
      f.pos.copy(door).addScaledVector(_v.set(-fz / fl, 0, fx / fl), (k - (n - 1) / 2) * 0.5);
      f.dir.set(fx / fl, 0, fz / fl); f.speed = rnd(...PROPS.folk.speed); f.runT = rnd(...PROPS.folk.runT); f.rx = f.rz = 0;
      f.p.group.visible = false; f.p.group.scale.setScalar(f.p.group.userData.s0 ?? (f.p.group.userData.s0 = f.p.group.scale.x));
      f.p.face('shock'); f.p.pose('flail');
    }
  }
  const floorY = (x, z) => Math.max(groundH(x, z), world.roadTop ? world.roadTop(x, z) : -1e9);
  function folkBlast(p, r, power) {
    for (const f of folk) {
      if (f.st === 'gone' || f.delay > 0) continue;
      const d = f.pos.distanceTo(p); if (d > r + 3) continue;
      if (d < r + PROPS.crack.crackR) { crack(f, p, null, true); continue; }   // b69: caught in it = he cracks to bits
      const k = Math.min(1, power / 20) * (1 - d / (r + 3)) + 0.25;
      _v.copy(f.pos).sub(p).setY(0).normalize();
      f.vel.copy(_v).multiplyScalar(4 + 6 * k); f.vel.y = 4 + 6 * k;
      f.spin.set(rnd(-1, 1) * 9, rnd(-1, 1) * 4, rnd(-1, 1) * 9); f.st = 'fly'; f.t = 0;
      f.p.pose('tumble'); f.p.face('shock');
    }
  }
  function folkUpdate(dt) {
    if (!folkBuilt) return;
    const houses = world.town?.houses || [];
    for (const f of folk) {
      if (f.st === 'gone') continue;
      const g = f.p.group; f.age += dt;
      if (f.delay > 0) { f.delay -= dt; if (f.delay > 0) continue; }
      g.visible = true;
      f.t += dt;
      if (f.st === 'out' || f.st === 'run') {
        if (f.st === 'out' && f.t > 0.45) { f.st = 'run'; f.t = 0; f.p.pose('run'); }
        // away from Santa, through the yard, round the houses
        if (f.st === 'run') {
          _v.copy(f.pos).sub(santaPos).setY(0); const ds = _v.length();
          if (ds > 0.1) { _v.multiplyScalar(1 / ds); f.dir.lerp(_v, 1 - Math.exp(-(ds < 25 ? 2.5 : 0.6) * dt)); }
          f.dir.x += Math.sin(f.age * 2.3 + f.speed * 7) * 0.6 * dt;   // a wobbly, panicky line
        }
        for (const hs of houses) {
          if (hs === f.house && f.st === 'out') continue;
          const hx = f.pos.x - hs.x, hz = f.pos.z - hs.z, R = Math.max(hs.W, hs.D) * 0.62 + 0.4, d2 = hx * hx + hz * hz;
          if (d2 < R * R && d2 > 1e-4) { const d = Math.sqrt(d2); f.pos.x = hs.x + hx / d * R; f.pos.z = hs.z + hz / d * R; f.dir.x += -hz / d * dt * 3; f.dir.z += hx / d * dt * 3; }
        }
        f.dir.setY(0).normalize();
        f.pos.addScaledVector(f.dir, f.speed * (f.st === 'out' ? 1.3 : 1) * dt);
        f.pos.y = floorY(f.pos.x, f.pos.z);
        g.rotation.set(0, Math.atan2(f.dir.x, f.dir.z), 0);
        if (f.st === 'run' && f.t > f.runT) {
          f.st = 'hide'; f.t = 0; f.p.pose('cover');
          // face back toward Santa, peeking through their arms
          g.rotation.y = Math.atan2(santaPos.x - f.pos.x, santaPos.z - f.pos.z);
        }
      } else if (f.st === 'hide') {
        if (f.t > PROPS.folk.hideT) { const s = Math.max(0.001, 1 - (f.t - PROPS.folk.hideT) / 0.35) * g.userData.s0; g.scale.setScalar(s); if (s < 0.01) { f.st = 'gone'; g.visible = false; g.scale.setScalar(g.userData.s0); } }
      } else if (f.st === 'fly') {
        f.vel.y -= PROPS.gravity * dt; f.pos.addScaledVector(f.vel, dt);
        f.rx += f.spin.x * dt; f.rz += f.spin.z * dt; g.rotation.set(f.rx, g.rotation.y + f.spin.y * dt, f.rz);
        const gy = floorY(f.pos.x, f.pos.z);
        if (f.pos.y < gy && f.vel.y < 0) {
          f.pos.y = gy;
          if (f.vel.y < -5) { f.vel.y *= -0.35; f.vel.x *= 0.6; f.vel.z *= 0.6; f.spin.multiplyScalar(0.5); puff(f.pos, '#ffffff', 4, 2, 0.5); }
          else { f.st = 'down'; f.t = 0; f.p.pose('down'); f.vel.set(0, 0, 0); }
        }
      } else if (f.st === 'down') {
        // flat on his back (lies along his body: rotate about the hips); then up and running again
        const k = Math.min(1, f.t * 8);
        g.rotation.x += (-Math.PI / 2 - g.rotation.x) * k; g.rotation.z *= 1 - k;
        f.pos.y = floorY(f.pos.x, f.pos.z) + 0.12;
        if (f.t > 1.4) { f.st = 'run'; f.t = 0; f.runT = rnd(2.5, 4); g.rotation.set(0, g.rotation.y, 0); f.p.pose('run'); }
      }
      g.position.copy(f.pos);
      f.p.update(dt);
    }
  }

  // ============================================ b69 CRACKED GINGERFOLK =======================================================
  // shot (ray vs a small capsule) or caught in a blast: he's hidden and ~13 jagged cookie shards + his FACE piece + his gumdrop
  // buttons burst off his body parts (each starts where that part was, in its plane), tumble down and lie flat in the snow,
  // then shrink away after PROPS.crack.life s. Instanced: 6 draws for every crack in town.
  const CK = PROPS.crack, ZAX = new V3(0, 0, 1);
  let crackIM = null; const bits = [];
  function crackMeshes() {
    if (crackIM) return;
    const K = gingerCrackKit();
    const mk = (g, n, half, rad) => {
      const im = new THREE.InstancedMesh(g, K.mat, n); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.userData.noMerge = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); scene.add(im);
      return { im, n, next: 0, items: [], half, rad };
    };
    crackIM = { shards: K.shards.map(g => mk(g, CK.per, 0.065, 0.085)), face: mk(K.face, 16, 0.07, 0.19), button: mk(K.button, 48, 0.025, 0.035) };
  }
  function bit(slot, pos, q, sc, col, sz = sc) {   // sc = across, sz = thickness (a cookie keeps its thickness)
    const i = slot.next++ % slot.n; slot.im.count = Math.max(slot.im.count, i + 1);
    const b = slot.items[i] || (slot.items[i] = { slot, ix: i, pos: new V3(), q: new THREE.Quaternion(), vel: new V3(), spin: new V3(), s: 1, sz: 1, life: 0, restT: 0, rest: false, live: false });
    if (!b.live) bits.push(b);
    b.live = true; b.rest = false; b.life = 0; b.restT = 0; b.pos.copy(pos); b.q.copy(q); b.s = sc; b.sz = sz;
    slot.im.setColorAt(i, col); slot.im.instanceColor.needsUpdate = true;
    return b;
  }
  const _kq = new THREE.Quaternion(), _kz = new THREE.Quaternion(), _kc = new V3(), _kp = new V3(), _kcol = new THREE.Color();
  // where the shards come from: [part, local centre y, half width, half height, how many]
  // [part, local centre y, half width, half height, how many, shard size]
  const CRACK_PARTS = [['upper', 0.2, 0.12, 0.16, 5, 1.5], ['armL', -0.18, 0.02, 0.1, 2, 1.0], ['armR', -0.18, 0.02, 0.1, 2, 1.0], ['legL', -0.19, 0.02, 0.11, 2, 1.1], ['legR', -0.19, 0.02, 0.11, 2, 1.1]];
  function crack(f, at, dir, blast = false) {
    crackMeshes();
    const P = f.p, g = P.group; g.updateMatrixWorld(true);
    const s0 = g.userData.s0 ?? g.scale.x, toast = [1, 0.9, 1.08][f.tint % 3];
    P.body.getWorldPosition(_kc);   // the body middle: shards fly out from it
    const launch = (b, k = 1) => {
      _v.copy(b.pos).sub(_kc); if (_v.lengthSq() < 1e-4) _v.set(rnd(-1, 1), 0, rnd(-1, 1)); _v.normalize();
      b.vel.copy(_v).multiplyScalar(rnd(1.8, 3.6) * k);
      if (blast) b.vel.addScaledVector(_v2.copy(b.pos).sub(at).setY(0).normalize(), rnd(2, 4));
      else if (dir) b.vel.addScaledVector(dir, rnd(1.5, 3.5));
      b.vel.y += rnd(2.2, 4.5) * (blast ? 1.4 : 1);
      b.spin.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rnd(6, 14));
    };
    let n = 0;
    for (const [name, cy, hw, hh, cnt, sk] of CRACK_PARTS) {
      const part = P[name]; part.getWorldQuaternion(_kq);
      for (let k = 0; k < cnt; k++) {
        part.localToWorld(_kp.set(rnd(-hw, hw), cy + (cnt > 1 ? (k / (cnt - 1) - 0.5) * 2 * hh : 0) + rnd(-0.03, 0.03), 0));
        const slot = crackIM.shards[(n++ + f.tint) % 4];
        launch(bit(slot, _kp, _kz.setFromAxisAngle(ZAX, rnd(0, 6.28)).premultiply(_kq), s0 * sk * rnd(0.85, 1.2), _kcol.setScalar(toast * rnd(0.92, 1.06)), s0));
      }
    }
    // the face piece (his shocked face) + the three gumdrop buttons
    P.head.getWorldQuaternion(_kq); P.head.getWorldPosition(_kp);
    launch(bit(crackIM.face, _kp, _kq, s0, _kcol.setScalar(toast)), 0.8);
    P.upper.getWorldQuaternion(_kq);
    for (let k = 0; k < 3; k++) {
      P.upper.localToWorld(_kp.set(0, 0.35 - k * 0.12, 0.09));
      launch(bit(crackIM.button, _kp, _kq, s0, _kcol.set(FOLK.buttons[(k + f.tint) % FOLK.buttons.length])), 0.9);
    }
    f.st = 'gone'; g.visible = false; g.scale.setScalar(s0);
    puff(_kc, '#c0743a', 14, 3.5, 0.7); puff(_kc, '#e8c090', 10, 2.5, 0.9); puff(_kc, '#fff6ea', 4, 2, 0.5);
    sfx('crunch', { vol: 0.95, rate: 1.7 }); sfx('crunch', { vol: 0.5, rate: 2.2 });
  }
  const _bm = new THREE.Matrix4(), _bs = new V3(), _bz = new V3();
  function bitsUpdate(dt) {
    if (!crackIM) return;
    const dirty = new Set();
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i], sl = b.slot; b.life += dt;
      if (!b.rest) {
        b.vel.y -= PROPS.gravity * dt; b.pos.addScaledVector(b.vel, dt);
        const w = b.spin.length(); if (w > 1e-4) { _qs.setFromAxisAngle(_v.copy(b.spin).multiplyScalar(1 / w), w * dt); b.q.premultiply(_qs).normalize(); }
        _bz.copy(ZAX).applyQuaternion(b.q); const zy = Math.abs(_bz.y);
        const h = floorY(b.pos.x, b.pos.z) + (b.sz * sl.half * zy + b.s * sl.rad * Math.sqrt(Math.max(0, 1 - zy * zy)));
        if (b.pos.y < h) {
          b.pos.y = h; if (b.vel.y < 0) b.vel.y *= -0.3;
          const k = Math.exp(-7 * dt); b.vel.x *= k; b.vel.z *= k; b.spin.multiplyScalar(Math.exp(-5 * dt));
          if (b.vel.lengthSq() < 1.5) {   // lie flat, either face up
            b.spin.multiplyScalar(Math.exp(-8 * dt));
            _qr.setFromUnitVectors(_bz, _v.set(0, _bz.y >= 0 ? 1 : -1, 0)).multiply(b.q); b.q.slerp(_qr, 1 - Math.exp(-6 * dt));
            b.restT += dt; if (b.restT > 1.2) { b.rest = true; b.vel.set(0, 0, 0); b.spin.set(0, 0, 0); }
          }
        }
      }
      let k = 1;
      if (b.life > CK.life) { k = 1 - (b.life - CK.life) / CK.fade; if (k <= 0) { b.live = false; sl.im.setMatrixAt(b.ix, ZERO); dirty.add(sl.im); bits.splice(i, 1); continue; } }
      sl.im.setMatrixAt(b.ix, _bm.compose(b.pos, b.q, _bs.set(b.s * k, b.s * k, b.sz * k))); dirty.add(sl.im);
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }
  /** nearest visible gingerperson along a ray (a capsule along his body, so a tumbling / lying one is hit where he is) */
  const _fa = new V3(), _fb = new V3(), _fu = new V3(), _fw = new V3(), _f1 = new V3(), _f2 = new V3();
  function rayFolk(from, dir, maxD) {
    let best = null;
    for (const f of folk) {
      if (f.st === 'gone' || f.delay > 0 || !f.p.group.visible) continue;
      const g = f.p.group, s = g.scale.x; _fu.set(0, 1, 0).applyQuaternion(g.quaternion);
      _fa.copy(f.pos).addScaledVector(_fu, 0.25 * s); _fb.copy(f.pos).addScaledVector(_fu, 0.95 * s);
      const r = CK.r * s;
      if (from.distanceToSquared(_fa) > (maxD + 2) ** 2) continue;
      // closest approach of the ray to the segment
      _fu.subVectors(_fb, _fa); _fw.subVectors(from, _fa);
      const B = dir.dot(_fu), C = _fu.dot(_fu), D = dir.dot(_fw), E = _fu.dot(_fw), den = C - B * B;
      let t = den > 1e-6 ? (B * E - C * D) / den : 0; t = Math.min(Math.max(t, 0), maxD);
      const u = Math.min(Math.max((E + t * B) / C, 0), 1); t = Math.min(Math.max(B * u - D, 0), maxD);
      _f1.copy(from).addScaledVector(dir, t); _f2.copy(_fa).addScaledVector(_fu, u);
      const d = _f1.distanceTo(_f2); if (d > r) continue;
      const hitT = Math.max(0, t - Math.sqrt(r * r - d * d));
      if (!best || hitT < best.dist) best = { folk: f, dist: hitT, point: from.clone().addScaledVector(dir, hitT) };
    }
    return best;
  }

  // ================================================== API ==================================================================
  return {
    hooks, cars, trees, folk, addCar, addTree, folkOut, crack,
    /** nearest prop along a ray: { kind: 'car' | 'tree', dist, point, ... } */
    raycast(from, dir, maxD = 250) {
      const a = rayCar(from, dir, maxD), b = rayTree(from, dir, a ? a.dist : maxD), c = folkBuilt ? rayFolk(from, dir, b ? b.dist : a ? a.dist : maxD) : null;
      return c ? { kind: 'folk', ...c } : b ? { kind: 'tree', ...b } : a ? { kind: 'car', ...a } : null;
    },
    /** a bullet hit from raycast (dmg: Gatling 1, rifle 3) */
    shoot(hit, dmg, dir) {
      if (hit.kind === 'folk') crack(hit.folk, hit.point, dir);   // b69: one shot cracks him
      else if (hit.kind === 'car') chipCar(hit.car, hit.point, dmg, dir);
      else { hurtTree(hit.tree, dmg, dir.x, dir.z); puff(hit.point, '#ffffff', 3, 2.5, 0.6); }
    },
    /** a blast at p (power 99 = rocket / crash: flips cars, fells trees; small = snowballs chip) */
    blast(p, r, power = 99, push = null) { carBlast(p, r, power, push); treeBlast(p, r, power); folkBlast(p, r, power); },
    solidAt: p => carInside(p) || treeSolid(p),
    update(dt, santa, rig) {
      if (santa) santaPos.copy(santa);
      carsUpdate(dt, santaPos); treesUpdate(dt, rig); folkUpdate(dt); bitsUpdate(dt);
    },
    get stats() { return { cars: cars.length, wrecks: cars.filter(c => c.mode !== 'idle').length, trees: trees.length, fallen: trees.filter(t => t.st).length, folkOut: folk.filter(f => f.st !== 'gone').length }; },
  };
}
