// Santa's rig: a team of 4 buff reindeer flown by the player, and the sleigh hanging off them on a
// rope tether (a slack distance constraint + gravity, so it swings out on turns and sags on climbs).
// Models are primitive stand-ins until the real GLBs land in models/ (see models/README.md).
import * as THREE from 'three';
import { groundH } from './world.js';
import { Rope } from './rope.js';

// ---- tuning (one place) --------------------------------------------------------------
export const FLY = {
  speed: 24, boostSpeed: 40, accel: 1.6,      // m/s, response (1/s)
  turnRate: 1.25, climbRate: 0.75,            // rad/s at full stick, max pitch (rad)
  maxBank: 0.7,
  minAlt: 2.5, ceiling: 170,
  ropeLen: 8.5,                                // harness -> sleigh
  sleighGrav: 4.5, sleighDrag: 0.014,          // m/s^2 effective (after magic lift), quadratic drag
  deerSpring: 28, deerDamp: 9,                 // how loosely each reindeer follows its slot
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const M = {
  red: mat('#d42a2a'), redDark: mat('#9c1720'), gold: mat('#e8b84a', { metalness: 0.7, roughness: 0.35 }),
  white: mat('#ffffff', { roughness: 0.95 }), skin: mat('#ffc9a8'), black: mat('#1b1b22', { roughness: 0.4 }),
  fur: mat('#8a5a3a'), furLight: mat('#d9b48f'), hoof: mat('#2a1d16'), antler: mat('#e6d3b0'),
  sack: mat('#3f7a4a'), gun: mat('#3c4150', { metalness: 0.8, roughness: 0.35 }), green: mat('#2f8f4a'),
  cigar: mat('#5a3420', { roughness: 0.9 }), ember: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a20').multiplyScalar(3), toneMapped: false }),
  nose: mat('#ff2a2a', { emissive: '#ff1010', emissiveIntensity: 2.5 }),
};
const mesh = (geo, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent?.add(o); return o; };
const S = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const C = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

// ---- models (all face +Z) ----------------------------------------------------------------
function buildSleigh() {
  const g = new THREE.Group();
  // body: a curly side profile extruded across, bevelled
  const sh = new THREE.Shape();
  sh.moveTo(-2.1, 0); sh.lineTo(1.6, 0);
  sh.bezierCurveTo(2.5, 0, 2.6, 0.9, 2.2, 1.6);     // front curls up
  sh.bezierCurveTo(1.9, 2.0, 1.5, 1.5, 1.7, 1.1);
  sh.lineTo(0.2, 0.95); sh.lineTo(-1.3, 1.0);
  sh.bezierCurveTo(-1.5, 1.45, -2.3, 1.5, -2.4, 1.25); // low seat back (so the chase cam sees Santa)
  sh.lineTo(-2.1, 0);
  const bodyG = new THREE.ExtrudeGeometry(sh, { depth: 2.0, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 16 });
  bodyG.translate(0, 0, -1.0); bodyG.rotateY(-Math.PI / 2);       // profile x -> world z
  const body = mesh(bodyG, M.red, 0, 0.55, 0, g);
  // gold trim stripe along the top edges
  for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), M.gold, side * 1.13, 1.45, 0.1, g);
  // runners: gold tubes with a curl at the front
  for (const side of [-1, 1]) {
    const pts = [[-2.4, 0.15], [-2.6, 0], [2.0, 0], [2.9, 0.35], [2.9, 1.0], [2.5, 1.1]].map(([z, y]) => new THREE.Vector3(side * 0.95, y, z));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.09, 6), M.gold, 0, 0, 0, g);
    for (const z of [-1.4, 0.2, 1.5]) mesh(C(0.05, 0.05, 0.6, 6), M.gold, side * 0.95, 0.3, z, g);
  }
  // present sack in the back
  const sack = mesh(S(0.9), M.sack, 0, 1.6, -1.3, g); sack.scale.set(1.1, 1, 0.9);
  mesh(C(0.25, 0.4, 0.4), M.sack, 0, 2.5, -1.35, g);
  for (const [x, z, c] of [[0.7, -0.6, '#ffd14a'], [-0.6, -0.5, '#4ab8ff']]) mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(c), x, 1.6, z, g);
  // the minigun, mounted on the right rail, swivel + spinning barrel cluster
  const mount = new THREE.Group(); mount.position.set(-0.85, 1.75, 0.5); g.add(mount);
  mesh(C(0.08, 0.12, 0.5, 8), M.gun, 0, -0.25, 0, mount);
  const gun = new THREE.Group(); mount.add(gun);
  mesh(new THREE.BoxGeometry(0.35, 0.35, 0.7), M.gun, 0, 0, -0.1, gun);
  const barrels = new THREE.Group(); barrels.position.z = 0.3; gun.add(barrels);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const b = mesh(C(0.045, 0.045, 1.4, 6), M.gun, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.7, barrels); b.rotation.x = Math.PI / 2; }
  mesh(C(0.17, 0.17, 0.1, 10), M.gold, 0, 0, 1.3, barrels).rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.position.z = 1.5; gun.add(muzzle);
  return { g, gun, barrels, muzzle, mount };
}

function buildSanta() {
  const g = new THREE.Group();
  const belly = mesh(S(0.75), M.red, 0, 0.75, 0, g); belly.scale.set(1.05, 1, 0.95);
  mesh(C(0.78, 0.8, 0.22, 16), M.black, 0, 0.62, 0, g);
  mesh(new THREE.BoxGeometry(0.3, 0.26, 0.1), M.gold, 0, 0.62, 0.78, g);
  const head = new THREE.Group(); head.position.y = 1.65; g.add(head);
  mesh(S(0.42), M.skin, 0, 0, 0, head);
  const beard = mesh(S(0.45), M.white, 0, -0.25, 0.16, head); beard.scale.set(1, 1.15, 0.8);
  mesh(S(0.1, 8, 6), M.skin, 0, 0.02, 0.42, head);                       // nose
  mesh(new THREE.BoxGeometry(0.62, 0.12, 0.06), M.black, 0, 0.13, 0.38, head); // shades
  // the fat cigar, out of the side of his mouth, with a glowing tip (smoke comes off `cigarTip`)
  const cigar = new THREE.Group(); cigar.position.set(0.14, -0.12, 0.42); cigar.rotation.set(0.25, 0.5, 0); head.add(cigar);
  mesh(C(0.055, 0.06, 0.5, 8), M.cigar, 0, 0, 0.22, cigar).rotation.x = Math.PI / 2;
  mesh(C(0.062, 0.062, 0.06, 8), M.gold, 0, 0, 0.12, cigar).rotation.x = Math.PI / 2;
  mesh(S(0.058, 8, 6), M.ember, 0, 0, 0.48, cigar);
  const cigarTip = new THREE.Object3D(); cigarTip.position.z = 0.52; cigar.add(cigarTip);
  mesh(new THREE.TorusGeometry(0.4, 0.11, 8, 18), M.white, 0, 0.22, 0, head).rotation.x = Math.PI / 2;
  const hat = mesh(new THREE.ConeGeometry(0.38, 0.8, 14), M.red, 0, 0.6, -0.08, head); hat.rotation.x = -0.5;
  mesh(S(0.13), M.white, 0, 0.92, -0.42, head);
  // arms forward holding the reins
  for (const side of [-1, 1]) {
    const arm = mesh(C(0.16, 0.2, 0.8), M.red, side * 0.7, 1.05, 0.4, g); arm.rotation.x = -1.1; arm.rotation.z = side * -0.2;
    mesh(S(0.17), M.white, side * 0.62, 0.95, 0.82, g);
  }
  return { g, head, cigarTip };
}

function buildDeer(redNose) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.35; g.add(body);
  const chest = mesh(S(0.75), M.fur, 0, 0.1, 0.45, body); chest.scale.set(1.15, 1.05, 1.1);   // beefy
  const hips = mesh(S(0.6), M.fur, 0, 0, -0.55, body); hips.scale.set(1, 0.95, 1.1);
  mesh(S(0.5), M.furLight, 0, -0.1, 0.75, body).scale.set(1, 0.9, 0.7);                        // chest fluff
  for (const side of [-1, 1]) mesh(S(0.4), M.fur, side * 0.62, 0.35, 0.55, body);              // shoulders
  const neck = new THREE.Group(); neck.position.set(0, 0.55, 0.95); body.add(neck);
  mesh(C(0.25, 0.38, 0.8), M.fur, 0, 0.25, 0.05, neck).rotation.x = 0.5;
  const head = new THREE.Group(); head.position.set(0, 0.7, 0.3); neck.add(head);
  mesh(S(0.34), M.fur, 0, 0, 0, head);
  const snout = mesh(S(0.22), M.furLight, 0, -0.08, 0.32, head); snout.scale.set(1, 0.85, 1.2);
  mesh(S(redNose ? 0.12 : 0.08), redNose ? M.nose : M.black, 0, -0.04, 0.58, head);
  for (const side of [-1, 1]) {
    mesh(S(0.05, 6, 4), M.black, side * 0.17, 0.1, 0.25, head);
    mesh(S(0.1, 8, 6), M.fur, side * 0.3, 0.2, -0.05, head).scale.set(0.6, 1.4, 0.5);
    const ant = new THREE.Group(); ant.position.set(side * 0.15, 0.3, -0.05); ant.rotation.z = side * -0.5; head.add(ant);
    mesh(C(0.04, 0.06, 0.7, 6), M.antler, 0, 0.35, 0, ant);
    mesh(C(0.03, 0.04, 0.35, 6), M.antler, 0, 0.45, 0.15, ant).rotation.x = 0.9;
    mesh(C(0.03, 0.04, 0.3, 6), M.antler, side * 0.1, 0.6, -0.05, ant).rotation.z = side * -0.8;
  }
  // harness with a bell
  mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 18), M.red, 0, 0.2, 0.55, body).rotation.x = 0.35;
  mesh(S(0.12, 8, 6), M.gold, 0, -0.35, 0.95, body);
  // legs (hip pivots, animated)
  const legs = [];
  for (const [x, z] of [[-0.42, 0.5], [0.42, 0.5], [-0.38, -0.6], [0.38, -0.6]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.15, z); body.add(hip);
    mesh(C(0.16, 0.12, 0.65, 8), M.fur, 0, -0.32, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.62; hip.add(knee);
    mesh(C(0.09, 0.07, 0.55, 6), M.fur, 0, -0.27, 0, knee);
    mesh(C(0.1, 0.11, 0.12, 6), M.hoof, 0, -0.56, 0, knee);
    legs.push({ hip, knee, front: z > 0 });
  }
  mesh(S(0.15, 8, 6), M.white, 0, 0.25, -1.15, body);  // tail
  return { g, body, neck, head, legs };
}

// ---- the rig ------------------------------------------------------------------------------
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export function buildRig(scene, colliders) {
  const sl = buildSleigh(); scene.add(sl.g);
  const santa = buildSanta(); santa.g.position.set(0, 0.95, 0.35); sl.g.add(santa.g);

  const rig = {
    sleigh: sl, santa,
    lead: new THREE.Vector3(0, 40, -120), yaw: 0, pitch: 0, bank: 0, speed: FLY.speed,
    leadQ: new THREE.Quaternion(),
    fwd: new THREE.Vector3(0, 0, 1),
    S: new THREE.Vector3(0, 40, -120 - 14), SV: new THREE.Vector3(0, 0, FLY.speed),
    harness: new THREE.Vector3(), sleighQ: new THREE.Quaternion(), sleighBank: 0, lastSV: new THREE.Vector3(),
    gallop: 0, bumped: 0,
  };

  // reindeer: two pairs, slots in the lead frame (x left/right, z back)
  const slots = [[-1.5, 0], [1.5, 0], [-1.5, -4.4], [1.5, -4.4]];
  rig.deer = slots.map(([x, z], i) => {
    const d = buildDeer(i === 0); d.g.scale.setScalar(1.3); scene.add(d.g);
    const p = rig.lead.clone().add(new THREE.Vector3(x, 0, z));
    return { ...d, slot: new THREE.Vector3(x, 0, z), p, v: new THREE.Vector3(0, 0, FLY.speed), phase: i * 0.37, hook: new THREE.Vector3() };
  });

  // visual ropes: each front deer -> the deer behind it, each rear deer -> the sleigh's front hook
  rig.hooks = [new THREE.Vector3(), new THREE.Vector3()];
  rig.ropes = [
    new Rope(scene, rig.deer[0].hook, rig.deer[2].hook, { segs: 8 }),
    new Rope(scene, rig.deer[1].hook, rig.deer[3].hook, { segs: 8 }),
    new Rope(scene, rig.deer[2].hook, rig.hooks[0], { segs: 12 }),
    new Rope(scene, rig.deer[3].hook, rig.hooks[1], { segs: 12 }),
  ];

  rig.update = (dt, input, t) => {
    // ---- lead (the player-flown team anchor) ----
    const boosting = input.boost;
    const targetSpeed = input.slow ? FLY.speed * 0.45 : boosting ? FLY.boostSpeed : FLY.speed;
    rig.speed += (targetSpeed - rig.speed) * (1 - Math.exp(-FLY.accel * dt));
    rig.yaw -= input.steer * FLY.turnRate * dt;                          // stick right = turn right
    const targetPitch = input.climb * FLY.climbRate;
    rig.pitch += (targetPitch - rig.pitch) * (1 - Math.exp(-3 * dt));
    rig.bank += (input.steer * FLY.maxBank - rig.bank) * (1 - Math.exp(-4 * dt));
    _f.set(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
    rig.fwd.copy(_f);
    rig.lead.addScaledVector(_f, rig.speed * dt);
    // keep the team off the ground and under the ceiling; the world is a big bowl, so curl back at the rim
    const gh = groundH(rig.lead.x, rig.lead.z) + FLY.minAlt + 1.5;
    if (rig.lead.y < gh) { rig.lead.y = gh; if (rig.pitch < 0.15) rig.pitch += (0.15 - rig.pitch) * (1 - Math.exp(-8 * dt)); }
    if (rig.lead.y > FLY.ceiling) { rig.lead.y = FLY.ceiling; rig.pitch = Math.min(rig.pitch, 0); }
    const rimD = Math.hypot(rig.lead.x, rig.lead.z);
    if (rimD > 480) { const want = Math.atan2(-rig.lead.x, -rig.lead.z); let dy = want - rig.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rig.yaw += dy * Math.min(1, (rimD - 480) / 60) * dt * 2; }

    // lead frame (with bank) for the deer
    _r.crossVectors(_f, UP).normalize();          // right
    _u.crossVectors(_r, _f).normalize();          // up
    _u.multiplyScalar(Math.cos(rig.bank)).addScaledVector(_r, Math.sin(rig.bank)).normalize();
    _r.crossVectors(_f, _u).normalize();
    const leftV = _r.clone().negate();
    _m.makeBasis(leftV, _u, _f); rig.leadQ.setFromRotationMatrix(_m);

    // ---- reindeer: springs toward their slots, galloping ----
    rig.gallop += dt * (6 + rig.speed * 0.18) * (boosting ? 1.3 : 1);
    for (const d of rig.deer) {
      const target = _v.copy(d.slot).applyQuaternion(rig.leadQ).add(rig.lead);
      target.y += Math.sin(rig.gallop + d.phase * 6) * 0.25;
      const ax = (target.x - d.p.x) * FLY.deerSpring - (d.v.x - rig.speed * _f.x) * FLY.deerDamp;
      const ay = (target.y - d.p.y) * FLY.deerSpring - (d.v.y - rig.speed * _f.y) * FLY.deerDamp;
      const az = (target.z - d.p.z) * FLY.deerSpring - (d.v.z - rig.speed * _f.z) * FLY.deerDamp;
      d.v.x += ax * dt; d.v.y += ay * dt; d.v.z += az * dt;
      d.p.addScaledVector(d.v, dt);
      d.g.position.copy(d.p);
      d.g.quaternion.slerp(rig.leadQ, 1 - Math.exp(-10 * dt));
      // gallop cycle: front legs and back legs in opposite phase, body rocks
      const ph = rig.gallop + d.phase * 6;
      for (const L of d.legs) {
        const s = Math.sin(ph + (L.front ? 0 : Math.PI));
        L.hip.rotation.x = s * 0.75 + (L.front ? 0.25 : -0.25);
        L.knee.rotation.x = (L.front ? -1 : 1) * (0.4 + 0.5 * Math.max(0, -s));
      }
      d.body.rotation.x = Math.sin(ph) * 0.1 - rig.pitch * 0.4;
      d.neck.rotation.x = Math.sin(ph + 0.6) * 0.12;
      d.hook.set(0, 1.8, -1.3).applyQuaternion(d.g.quaternion).add(d.p);
    }

    // ---- sleigh: a heavy point on a slack rope behind the rear pair ----
    rig.harness.addVectors(rig.deer[2].hook, rig.deer[3].hook).multiplyScalar(0.5);
    rig.lastSV.copy(rig.SV);
    const SV = rig.SV, Sp = rig.S;
    const sp = SV.length();
    SV.y -= FLY.sleighGrav * dt;
    SV.addScaledVector(SV, -FLY.sleighDrag * sp * dt);
    Sp.addScaledVector(SV, dt);
    _v.subVectors(Sp, rig.harness);
    const dist = _v.length();
    if (dist > FLY.ropeLen) {                      // rope taut: pull back onto the sphere, kill outward speed
      _v.divideScalar(dist);
      Sp.copy(rig.harness).addScaledVector(_v, FLY.ropeLen);
      const out = SV.dot(_v) - rig.deer[2].v.dot(_v);
      if (out > 0) SV.addScaledVector(_v, -out * 1.02);
    }
    // CRASHES (his: run into stuff, take out houses, fly off the sleigh): the lead or the sleigh hitting a house side below its
    // roof, or the sleigh slamming the ground, bounces the team off, kills speed, and reports the hit (rig.onCrash)
    rig.crashCd = Math.max(0, (rig.crashCd || 0) - dt);
    for (const c of colliders) {
      for (const [P, isLead] of [[rig.lead, true], [Sp, false]]) {
        const dx = P.x - c.x, dz = P.z - c.z, d2 = dx * dx + dz * dz;
        if (d2 > c.r * c.r || P.y > c.top - 1.0) continue;
        const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
        P.x = c.x + nx * (c.r + 0.3); P.z = c.z + nz * (c.r + 0.3);
        if (rig.crashCd > 0) continue;
        rig.crashCd = 0.6;
        const power = Math.min(1, (isLead ? rig.speed : Math.hypot(SV.x, SV.z)) / 30);
        if (isLead) {   // bounce the team's heading off the wall and lose most of the speed
          const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw), dot = fx * nx + fz * nz;
          rig.yaw = Math.atan2(fx - 2 * dot * nx, fz - 2 * dot * nz); rig.speed *= 0.3; rig.pitch = 0.25;
        } else { const vn = SV.x * nx + SV.z * nz; if (vn < 0) { SV.x -= 1.6 * vn * nx; SV.z -= 1.6 * vn * nz; } SV.y += 4; }
        rig.bumped = 1;
        rig.onCrash?.(power, P.clone(), c);
      }
    }
    // ground + rooftops: skid along them
    let floor = groundH(Sp.x, Sp.z) + 0.15;
    for (const c of colliders) if ((Sp.x - c.x) ** 2 + (Sp.z - c.z) ** 2 < c.r * c.r) floor = Math.max(floor, c.top);
    if (Sp.y < floor) {
      if (SV.y < -4) rig.bumped = Math.min(1, -SV.y / 15);
      if (SV.y < -9 && (rig.crashCd || 0) <= 0) { rig.crashCd = 0.6; rig.onCrash?.(Math.min(1, -SV.y / 20), Sp.clone(), null); }
      Sp.y = floor; if (SV.y < 0) SV.y *= -0.25;
      SV.x *= Math.exp(-1.5 * dt); SV.z *= Math.exp(-1.5 * dt);
    }

    // orientation: nose toward the harness, bank from sideways acceleration
    _f.subVectors(rig.harness, Sp).normalize();
    const flat = _v.set(SV.x, 0, SV.z); if (flat.lengthSq() > 1) _f.lerp(flat.normalize().setY(_f.y), 0.4).normalize();
    _r.crossVectors(_f, UP).normalize();
    const acc = _v.subVectors(SV, rig.lastSV).divideScalar(Math.max(dt, 1e-3));
    const lat = acc.dot(_r);
    rig.sleighBank += (Math.atan2(lat, 12) * 0.9 - rig.sleighBank) * (1 - Math.exp(-5 * dt));
    _u.crossVectors(_r, _f).normalize();
    _u.multiplyScalar(Math.cos(rig.sleighBank)).addScaledVector(_r, Math.sin(rig.sleighBank)).normalize();
    _r.crossVectors(_f, _u).normalize();
    _m.makeBasis(_r.negate(), _u, _f);
    rig.sleighQ.setFromRotationMatrix(_m);
    sl.g.position.copy(Sp);
    sl.g.quaternion.slerp(rig.sleighQ, 1 - Math.exp(-12 * dt));
    sl.g.updateMatrixWorld();
    rig.hooks[0].set(0.6, 1.4, 2.6).applyMatrix4(sl.g.matrixWorld);
    rig.hooks[1].set(-0.6, 1.4, 2.6).applyMatrix4(sl.g.matrixWorld);

    // santa wobbles on his seat (a little tipsy on milk)
    santa.g.rotation.z = -rig.sleighBank * 0.5 + Math.sin(t * 1.7) * 0.05;
    santa.head.rotation.z = Math.sin(t * 1.3 + 1) * 0.12;
    santa.head.rotation.x = Math.sin(t * 2.1) * 0.06 - rig.bumped * 0.4;
    rig.bumped *= Math.exp(-3 * dt);

    for (const r of rig.ropes) r.update(dt);
  };
  return rig;
}
