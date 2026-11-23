// THE DESTRUCTIBLE TOWN (his slice, Nov 23: "all the houses in the map ... completely destructible ... shoot them, crash into
// them"). Every house is chunky bevelled COOKIE BRICKS in running bond, and EVERY brick in the town is one instance of ONE
// InstancedMesh (+ one for icing caps with drips), so the whole town is a couple of draw calls and knocking a brick out is a
// matrix write. Bricks have ids (multiplayer-ready: a hit = "these ids are gone"). Unsupported bricks fall; a house that loses
// its wall tops drops its roof; falling bricks tumble as debris and settle as rubble. Windows glow; the door is red; candy
// canes + gumdrops dress the porch. The sleigh's crash colliders shrink away as a house is levelled.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { groundH } from './terrain.js';
import { rand, rr, softDot } from './util.js';

export const TOWN = {
  brick: new THREE.Vector3(1.2, 0.5, 0.55),   // long, high, deep (m)
  courses: 9, wallBricksX: 6, wallBricksZ: 4,
  hp: { wall: 2, roof: 2, gable: 2 },
  debrisMax: 420, gravity: 20,
  cookie: ['#d98f4e', '#cf8446', '#e39a58'], roof: ['#8a4c2a', '#9a5631', '#7c4325'], icing: '#fff8f0',
};

/** a chamfered box: 24 points -> convex hull = 6 faces + 12 bevel strips + 8 corner tris (44 tris), smooth-shaded so it reads soft */
function chamferBox(w, h, d, c) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(new THREE.Vector3(sx * (w / 2 - c), sy * h / 2, sz * (d / 2 - c)));
    pts.push(new THREE.Vector3(sx * w / 2, sy * (h / 2 - c), sz * (d / 2 - c)));
    pts.push(new THREE.Vector3(sx * (w / 2 - c), sy * (h / 2 - c), sz * d / 2));
  }
  let g = new ConvexGeometry(pts);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  return g;
}
/** an icing cap: a soft slab with two drips hanging off the front edge */
function icingGeo(w, d) {
  const parts = [chamferBox(w * 1.04, 0.14, d * 1.12, 0.06)];
  for (const [x, len] of [[-w * 0.22, 0.32], [w * 0.18, 0.22]]) {
    const drip = new THREE.CapsuleGeometry(0.06, len, 3, 6); drip.translate(x, -len / 2 - 0.02, d * 0.56); parts.push(drip);
  }
  const P = [], N = [];
  for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return out;
}

export function makeTown(scene) {
  const B = TOWN.brick;
  const bricks = [];       // { h: house, local: Matrix4, world: Matrix4, half: Vector3, kind, row, alive, hp, ice: index|-1, col: Color }
  const houses = [];
  let built = false, mesh, ice, debrisMesh;
  const ices = [];         // { b: brick index, world: Matrix4 }
  const decor = [];        // non-destructible dressing per house (hidden when the house is mostly gone)

  // ---- build one house (called by the village layout) ----------------------------------------------------------------
  function house(x, z, ry, o = {}) {
    const nx = o.nx ?? TOWN.wallBricksX + (rand() < 0.4 ? 1 : 0), nz = o.nz ?? TOWN.wallBricksZ, rows = o.courses ?? TOWN.courses - (rand() < 0.3 ? 2 : 0);
    const W = nx * B.x, D = nz * B.x, gy = groundH(x, z);
    const H = new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    const hs = { x, z, ry, W, D, gy, H, inv: H.clone().invert(), ids: [], roof: [], top: [], alive: 0, total: 0, col: null, dead: false, decor: [] };
    const q0 = new THREE.Quaternion(), q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const add = (lx, ly, lz, q, kind, row, iced, size = B) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), q, new THREE.Vector3(size.x / B.x, size.y / B.y, size.z / B.z));
      const pal = kind === 'roof' ? TOWN.roof : TOWN.cookie, c = new THREE.Color(pal[(rand() * pal.length) | 0]).multiplyScalar(rr(0.92, 1.06));
      const id = bricks.length;
      const world = H.clone().multiply(m), inv = world.clone().invert();
      bricks.push({ h: hs, local: m, world, inv, inv3: new THREE.Matrix3().setFromMatrix4(inv), kind, row, alive: true, hp: TOWN.hp[kind] || 2, ice: -1, col: c });
      if (iced) { bricks[id].ice = ices.length; ices.push({ b: id, world: H.clone().multiply(m).multiply(new THREE.Matrix4().makeTranslation(0, B.y * 0.55, 0)) }); }
      hs.ids.push(id); if (kind === 'roof') hs.roof.push(id); if (kind === 'wall' && row === rows - 1) hs.top.push(id);
    };
    // walls: running bond; a door in the front, windows front + sides
    const door = Math.floor(nx / 2);
    for (let row = 0; row < rows; row++) {
      const y = row * B.y + B.y / 2, off = row % 2 ? 0.5 : 0;
      for (const [side, n, len] of [[0, nx, W], [1, nx, W], [2, nz, D], [3, nz, D]]) {
        for (let k = -1; k <= n; k++) {
          const a = (k + off) * B.x - len / 2 + B.x / 2;
          if (a - B.x / 2 < -len / 2 - 0.01 || a + B.x / 2 > len / 2 + 0.01) continue;
          const cu = (a + len / 2) / B.x;   // brick index along the side
          if (side === 0 && row < 4 && Math.abs(cu - door - 0.5) < 0.7) continue;                                   // door
          if (row >= 4 && row <= 5 && ((side < 2 && Math.abs(Math.abs(cu - n / 2) - n * 0.28) < 0.5) || (side >= 2 && Math.abs(cu - n / 2) < 0.6))) continue;   // windows
          let lx, lz, q = q0;
          if (side === 0) { lx = a; lz = D / 2 - B.z / 2; } else if (side === 1) { lx = a; lz = -D / 2 + B.z / 2; }
          else { lx = (side === 2 ? 1 : -1) * (W / 2 - B.z / 2); lz = a; q = q90; }
          add(lx, y, lz, q, 'wall', row, row === rows - 1);
        }
      }
    }
    // gables on the front + back (z faces): courses narrowing to the peak
    const top = rows * B.y, gRows = Math.round(W / 2 / B.y * 0.7);
    for (let gr = 0; gr < gRows; gr++) {
      const y = top + gr * B.y + B.y / 2, halfW = (W / 2) * (1 - (gr + 1) / (gRows + 1)), n = Math.max(1, Math.floor(halfW * 2 / B.x));
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) * B.x - n * B.x / 2;
        for (const s of [1, -1]) add(a, y, s * (D / 2 - B.z / 2), q0, 'gable', rows + gr, false);
      }
    }
    // roof: two slopes of chocolate shingles (thinner bricks, tilted), ridge + eave rows iced
    const peak = top + gRows * B.y + 0.25, run = W / 2 + 0.55, rise = peak - top + 0.3, slope = Math.hypot(run, rise), pitch = Math.atan2(rise, run);
    const nRows = Math.ceil(slope / 0.48), nCols = Math.ceil((D + 1.0) / B.x) + 1, SH = new THREE.Vector3(B.x, 0.22, 0.62);
    for (const sgn of [1, -1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sgn * pitch).multiply(q90);   // each slope's shingles face up-and-out
      for (let r2 = 0; r2 < nRows; r2++) {
        const t = (r2 + 0.5) / nRows, lx = sgn * run * (1 - t), ly = top - 0.3 + rise * t + 0.15, off = r2 % 2 ? 0.5 : 0;
        for (let c = 0; c < nCols; c++) {
          const lz = (c + off) * B.x - nCols * B.x / 2 + B.x / 2;
          if (Math.abs(lz) > (D + 1.0) / 2) continue;
          add(lx, ly, lz, q, 'roof', 100 + r2, r2 === nRows - 1 || r2 === 0, SH);
        }
      }
    }
    hs.total = hs.alive = hs.ids.length;
    // dressing: door, glowing windows, candy canes, gumdrops, a chimney smoke point
    const D2 = D / 2;
    hs.decor.push({ kind: 'door', m: H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3((door + 0.5) * B.x - W / 2 + B.x / 2 - B.x / 2, 1.0, D2 - 0.2), q0, new THREE.Vector3(1.05, 2.0, 0.12))) });
    for (const s of [-1, 1]) {
      hs.decor.push({ kind: 'win', m: H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(s * W * 0.28, 5 * B.y, D2 - 0.12), q0, new THREE.Vector3(1.05, 0.9, 1))) });
      hs.decor.push({ kind: 'win', m: H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(s * (W / 2 - 0.12), 5 * B.y, 0), q90, new THREE.Vector3(1.05, 0.9, 1))) });
      hs.decor.push({ kind: 'cane', m: H.clone().multiply(new THREE.Matrix4().makeTranslation(s * 1.1 + 0.3, 0, D2 + 0.6)) });
      hs.decor.push({ kind: 'gum', m: H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(s * 2.2, 0.25, D2 + 0.9), q0, new THREE.Vector3(1, 1, 1).multiplyScalar(rr(0.8, 1.2)))), col: rand() < 0.5 ? '#e8303a' : '#3aa85a' });
    }
    hs.smoke = new THREE.Vector3(W * 0.25, peak + 0.6, -D * 0.2).applyMatrix4(H);
    hs.collider = { x, z, r: Math.max(W, D) * 0.62, top: gy + peak + 0.4, town: hs };
    houses.push(hs);
    return { x, z, r: Math.max(W, D) * 0.72 + 3, front: new THREE.Vector3(0, 0, D2).applyMatrix4(H), w: W, d: D, collider: hs.collider, smoke: hs.smoke };
  }

  // ---- after the layout: build the instanced meshes ------------------------------------------------------------------
  const brickGeo = chamferBox(B.x * 0.97, B.y * 0.96, B.z, 0.09);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, color: '#ffffff' });
  const iceMat = new THREE.MeshStandardMaterial({ color: TOWN.icing, roughness: 0.32, emissive: '#2a1a14', emissiveIntensity: 0.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(2.2), toneMapped: false });
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const decorMeshes = [];
  function finish() {
    mesh = new THREE.InstancedMesh(brickGeo, mat, bricks.length);
    bricks.forEach((b, i) => { mesh.setMatrixAt(i, b.world); mesh.setColorAt(i, b.col); });
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    ice = new THREE.InstancedMesh(icingGeo(B.x * 0.97, B.z), iceMat, Math.max(1, ices.length));
    ices.forEach((c, i) => ice.setMatrixAt(i, c.world));
    ice.castShadow = true; ice.frustumCulled = false; scene.add(ice);
    debrisMesh = new THREE.InstancedMesh(brickGeo, mat, TOWN.debrisMax); debrisMesh.count = 0; debrisMesh.castShadow = true; debrisMesh.frustumCulled = false;
    debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOWN.debrisMax * 3), 3); scene.add(debrisMesh);
    // dressing: one instanced mesh per kind
    const kinds = {
      door: [new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b82a26', roughness: 0.5 })],
      win: [new THREE.PlaneGeometry(1, 1), glowMat],
      cane: [(() => { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(t < 0.75 ? new THREE.Vector3(0, t / 0.75 * 1.3, 0) : new THREE.Vector3(0.18 - Math.cos((t - 0.75) / 0.25 * Math.PI) * 0.18, 1.3 + Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.18, 0)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.07, 6); })(),
        new THREE.MeshStandardMaterial({ map: caneTex(), roughness: 0.4 })],
      gum: [(() => { const g = new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 1.3, 1); return g; })(), new THREE.MeshStandardMaterial({ roughness: 0.35 })],
    };
    for (const [k, [g, m]] of Object.entries(kinds)) {
      const list = []; houses.forEach((h, hi) => h.decor.forEach(d => { if (d.kind === k) list.push({ h: hi, d }); }));
      const im = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
      list.forEach((e, i) => { im.setMatrixAt(i, e.d.m); if (e.d.col) im.setColorAt(i, new THREE.Color(e.d.col)); });
      im.castShadow = k !== 'win'; im.frustumCulled = false; scene.add(im); decorMeshes.push({ im, list });
    }
    built = true;
  }
  function caneTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fff6ec' : '#e3283a'; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---- hits ----------------------------------------------------------------------------------------------------------------
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
  /** nearest live brick along a world ray: { id, dist, point } or null */
  function raycast(from, dir, maxD = 250) {
    let best = null;
    for (const hs of houses) {
      // cheap reject: the house's bounding circle vs the ray (2D) + height
      const ox = from.x - hs.x, oz = from.z - hs.z, R = Math.max(hs.W, hs.D) * 0.8 + 1;
      const t0 = -(ox * dir.x + oz * dir.z) / Math.max(1e-6, dir.x * dir.x + dir.z * dir.z);
      const cx = ox + dir.x * t0, cz = oz + dir.z * t0;
      if (cx * cx + cz * cz > R * R && ox * ox + oz * oz > R * R) continue;
      for (const id of hs.ids) {
        const b = bricks[id]; if (!b.alive) continue;
        // the ray in the brick's own frame (linear map: t stays the world distance along `dir`)
        _o.copy(from).applyMatrix4(b.inv); _d.copy(dir).applyMatrix3(b.inv3);
        let tmin = 0, tmax = best ? best.dist : maxD, ok = true;
        for (let ax = 0; ax < 3 && ok; ax++) {
          const oa = _o.getComponent(ax), da = _d.getComponent(ax), h = B.getComponent(ax) * 0.5;
          if (Math.abs(da) < 1e-8) { if (Math.abs(oa) > h) ok = false; }
          else { let t1 = (-h - oa) / da, t2 = (h - oa) / da; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) ok = false; }
        }
        if (ok && (!best || tmin < best.dist)) best = { id, dist: tmin, point: from.clone().addScaledVector(dir, tmin), house: hs };
      }
    }
    return best;
  }
  /** is a world point inside a live brick? (rockets / snowballs) */
  function solidAt(p) {
    for (const hs of houses) {
      if ((p.x - hs.x) ** 2 + (p.z - hs.z) ** 2 > (Math.max(hs.W, hs.D) + 2) ** 2) continue;
      for (const id of hs.ids) {
        const b = bricks[id]; if (!b.alive) continue;
        _p.copy(p).applyMatrix4(b.inv);
        if (Math.abs(_p.x) < B.x * 0.55 && Math.abs(_p.y) < B.y * 0.6 && Math.abs(_p.z) < B.z * 0.6) return true;
      }
    }
    return false;
  }
  /** knock out bricks within radius of a world point (power = damage per brick); returns how many fell */
  function blast(p, radius, power = 99, push = null) {
    let n = 0;
    for (const hs of houses) {
      if ((p.x - hs.x) ** 2 + (p.z - hs.z) ** 2 > (Math.max(hs.W, hs.D) + radius + 1) ** 2) continue;
      const kill = [];
      for (const id of hs.ids) {
        const b = bricks[id]; if (!b.alive) continue;
        _p.setFromMatrixPosition(b.world);
        if (_p.distanceToSquared(p) < radius * radius) { b.hp -= power; if (b.hp <= 0) kill.push(id); }
      }
      if (kill.length) n += remove(hs, kill, p, push);
    }
    return n;
  }
  /** damage one brick (bullets) */
  function hitBrick(id, dmg, from) {
    const b = bricks[id]; if (!b || !b.alive) return 0;
    b.hp -= dmg;
    // a bruise: darken it a little each hit
    b.col.multiplyScalar(0.86); mesh.setColorAt(id, b.col); mesh.instanceColor.needsUpdate = true;
    if (b.hp > 0) return 0;
    return remove(b.h, [id], _p.setFromMatrixPosition(b.world).clone(), from);
  }

  function remove(hs, ids, at, push) {
    const gone = new Set(ids);
    // support: anything (wall / gable) with nothing alive beneath it falls too
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of hs.ids) {
        const b = bricks[id];
        if (!b.alive || gone.has(id) || b.kind === 'roof' || b.row === 0) continue;
        const bp = new THREE.Vector3().setFromMatrixPosition(b.local);
        let held = false;
        for (const jd of hs.ids) {
          const c = bricks[jd];
          if (!c.alive || gone.has(jd) || c.kind === 'roof' || c.row !== b.row - 1) continue;
          const cp = new THREE.Vector3().setFromMatrixPosition(c.local);
          if (Math.abs(cp.y - (bp.y - B.y)) < 0.05 && Math.hypot(cp.x - bp.x, cp.z - bp.z) < B.x * 0.8) { held = true; break; }
        }
        // a one-brick-wide column with no neighbours in its course is too thin to stand (above the bottom two courses)
        if (held && b.row >= 2 && b.kind === 'wall') {
          let side = false;
          for (const jd of hs.ids) {
            if (jd === id) continue; const c = bricks[jd];
            if (!c.alive || gone.has(jd) || c.row !== b.row) continue;
            const cp = new THREE.Vector3().setFromMatrixPosition(c.local);
            if (Math.hypot(cp.x - bp.x, cp.z - bp.z) < B.x * 1.15) { side = true; break; }
          }
          if (!side) held = false;
        }
        if (!held) { gone.add(id); changed = true; }
      }
      // the roof drops when the wall tops under it are mostly gone
      const topAlive = hs.top.filter(i => bricks[i].alive && !gone.has(i)).length;
      if (hs.top.length && topAlive < hs.top.length * 0.4) for (const r of hs.roof) if (bricks[r].alive && !gone.has(r)) { gone.add(r); changed = true; }
    }
    // a house that's mostly gone caves in: everything above the bottom two courses comes down -> a low ruin
    if ((hs.alive - gone.size) / hs.total < 0.35) for (const id of hs.ids) { const b = bricks[id]; if (b.alive && (b.row >= 2 || b.kind === 'roof')) gone.add(id); }
    for (const id of gone) {
      const b = bricks[id]; b.alive = false; hs.alive--;
      mesh.setMatrixAt(id, ZERO);
      if (b.ice >= 0) ice.setMatrixAt(b.ice, ZERO);
      spawnDebris(b, at, push, ids.includes(id));
    }
    mesh.instanceMatrix.needsUpdate = true; ice.instanceMatrix.needsUpdate = true;
    // the house's crash collider + dressing follow what's left
    const frac = hs.alive / hs.total;
    if (frac < 0.35 && !hs.dead) {
      hs.dead = true; hs.collider.r = 0;
      decorMeshes.forEach(({ im, list }) => { list.forEach((e, i) => { if (houses[e.h] === hs) im.setMatrixAt(i, ZERO); }); im.instanceMatrix.needsUpdate = true; });
    } else hs.collider.top = hs.gy + Math.max(1, frac) * (hs.collider.top - hs.gy);
    window.sfx?.play(gone.size > 6 ? 'debris' : 'crunch', { vol: Math.min(1, 0.4 + gone.size * 0.05) });
    return gone.size;
  }

  // ---- debris: knocked-out bricks tumble, bounce, settle as rubble (oldest recycled) -----------------------------------
  const deb = [];   // { pos, vel, q, spin, rest }
  let debI = 0;
  function spawnDebris(b, at, push, direct) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    b.world.decompose(pos, q, s);
    const away = pos.clone().sub(at); const L = away.length() || 1; away.multiplyScalar(1 / L);
    const vel = direct ? away.multiplyScalar(4 + Math.random() * 3) : new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
    if (push) vel.addScaledVector(push, direct ? 0.35 : 0.1);
    vel.y += direct ? 2 + Math.random() * 3 : 0;
    const i = debI++ % TOWN.debrisMax;
    deb[i] = { pos, vel, q, s, spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8), rest: false, life: 0 };
    debrisMesh.setColorAt(i, b.col); debrisMesh.instanceColor.needsUpdate = true;
    debrisMesh.count = Math.min(TOWN.debrisMax, Math.max(debrisMesh.count, i + 1));
  }
  const _m = new THREE.Matrix4(), _e = new THREE.Quaternion();
  function update(dt) {
    if (!built) return;
    let moved = false;
    for (let i = 0; i < deb.length; i++) {
      const d = deb[i]; if (!d || d.rest) continue;
      moved = true; d.life += dt;
      d.vel.y -= TOWN.gravity * dt; d.pos.addScaledVector(d.vel, dt);
      _e.setFromEuler(new THREE.Euler(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)); d.q.multiply(_e);
      const gy = groundH(d.pos.x, d.pos.z) + B.y * 0.35;
      if (d.pos.y < gy) {
        d.pos.y = gy; d.vel.y *= -0.3; d.vel.x *= 0.55; d.vel.z *= 0.55; d.spin.multiplyScalar(0.5);
        if (Math.abs(d.vel.y) < 0.8 && d.vel.lengthSq() < 0.6 || d.life > 5) { d.rest = true; d.vel.set(0, 0, 0); }
      }
      debrisMesh.setMatrixAt(i, _m.compose(d.pos, d.q, d.s));
    }
    if (moved) debrisMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    house, finish, update, raycast, solidAt, blast, hitBrick, houses,
    get stats() { return { bricks: bricks.length, alive: bricks.filter(b => b.alive).length, houses: houses.length }; },
  };
}
