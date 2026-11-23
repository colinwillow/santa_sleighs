// HIS SLEIGH (models/sleighs/sleigh_01.glb, 133 Tripo parts, one texture) fitted onto the rig in place of the procedural
// stand-in. All parts are merged into ONE mesh (one draw); a part that dies has its triangles collapsed out of the index and
// flies off as its own debris mesh. Damage: crashes, rocket blasts, and his own bullets when he's on foot.
// BOOSTERS (the two rockets on the back) take more hits; losing one = a barrel roll that throws Santa out, the sleigh flies
// lopsided after, and that flame goes out. `repair()` puts everything back (DEBUG > RESET SLEIGH).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const SLEIGHM = {
  url: './models/sleighs/sleigh_01.glb',
  scale: 6,                  // model is ~1 unit long -> ~6 m (the stand-in was ~5.5 m)
  hp: { hull: Infinity, booster: 10, big: 5, part: 2 },
  debrisLife: 9, debrisMax: 60,
  rollT: 1.3,                // seconds for the barrel roll after a booster goes
  lopsided: 0.22,            // rad of permanent lean per lost booster
  flame: { idle: 0.55, boost: 1.7 },
};

export async function fitSleighModel(rig, scene, groundH) {
  const loader = new GLTFLoader(); const draco = new DRACOLoader(); draco.setDecoderPath('./vendor/draco/'); loader.setDRACOLoader(draco);
  const gltf = await new Promise((res, rej) => loader.load(SLEIGHM.url, res, undefined, rej));
  const root = gltf.scene; root.updateMatrixWorld(true);
  const S = SLEIGHM.scale, scaleM = new THREE.Matrix4().makeScale(S, S, S);
  let mat = null; const parts = [], geos = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    mat = mat || o.material;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(scaleM);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
    g.computeBoundingBox(); g.computeBoundingSphere();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), size = g.boundingBox.getSize(new THREE.Vector3());
    const name = o.name, mx = c.x / S, mz = c.z / S;
    const isHull = name === 'tripo_part_0';
    const isBooster = Math.abs(mx) > 0.2 && mz < -0.05;
    const boosterBody = isBooster && size.z / S > 0.3;
    const big = g.index.count / 3 > 200 || Math.max(size.x, size.y, size.z) / S > 0.25;
    const hp = isHull ? SLEIGHM.hp.hull : boosterBody ? SLEIGHM.hp.booster : big ? SLEIGHM.hp.big : SLEIGHM.hp.part;
    parts.push({ name, geo: g, c, r: g.boundingSphere.radius, hp, hp0: hp, alive: true, booster: isBooster ? (mx < 0 ? 'L' : 'R') : null, boosterBody, start: 0, count: g.index.count });
    geos.push(g);
  });
  const merged = mergeGeometries(geos, false);
  let off = 0; for (const p of parts) { p.start = off; off += p.count; }
  const index0 = merged.index.array.slice();
  const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'his-sleigh';
  const sl = rig.sleigh;
  for (const o of sl.standin || []) o.visible = false;   // the procedural stand-in body
  sl.g.add(mesh);

  // booster flames (additive cones out of each nozzle), bloom does the rest
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3a').multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2b0').multiplyScalar(4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = {};
  for (const side of ['L', 'R']) {
    const body = parts.find(p => p.boosterBody && p.booster === side); if (!body) continue;
    const bb = body.geo.boundingBox, f = new THREE.Group();
    f.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.min.z + 0.05);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 10, 1, true).translate(0, 0.8, 0).rotateX(-Math.PI / 2), flameMat);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8, 1, true).translate(0, 0.45, 0).rotateX(-Math.PI / 2), coreMat);
    f.add(cone, core); sl.g.add(f); flames[side] = f;
  }
  // (the cone's base sits on the nozzle; rotateX(-PI/2) turns its tip (+Y) to -Z: out of the back)

  const debris = [];
  const _w = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  const rc = new THREE.Raycaster();
  rig.lostBoosters = rig.lostBoosters || new Set();

  function detach(p, from, push = 6) {
    if (!p.alive) return; p.alive = false;
    const ix = merged.index.array; ix.fill(0, p.start, p.start + p.count); merged.index.needsUpdate = true;
    sl.g.updateMatrixWorld();
    const d = new THREE.Mesh(p.geo, mat); d.castShadow = true;
    // debris mesh: geometry recentred on its own centre so it tumbles round itself
    const g = p.geo.clone().translate(-p.c.x, -p.c.y, -p.c.z); d.geometry = g;
    sl.g.matrixWorld.decompose(_c, _q, _s);
    d.position.copy(p.c).applyMatrix4(sl.g.matrixWorld); d.quaternion.copy(_q);
    scene.add(d);
    const out = d.position.clone().sub(from || sl.g.position); out.y = Math.abs(out.y) + 0.5; out.normalize();
    const v = rig.SV.clone().multiplyScalar(0.7).addScaledVector(out, push * (0.6 + Math.random() * 0.8));
    const w = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    debris.push({ m: d, v, w, life: SLEIGHM.debrisLife });
    if (debris.length > SLEIGHM.debrisMax) { const o = debris.shift(); scene.remove(o.m); o.m.geometry.dispose(); }
    // a booster body gone: its whole rocket goes, the flame dies, and the sleigh barrel-rolls
    if (p.boosterBody && !rig.lostBoosters.has(p.booster)) {
      rig.lostBoosters.add(p.booster);
      for (const q of parts) if (q.alive && q.booster === p.booster) detach(q, from, push);
      if (flames[p.booster]) flames[p.booster].visible = false;
      rig.rollT = SLEIGHM.rollT; rig.rollDir = p.booster === 'L' ? 1 : -1;
      rig.lopsided = (rig.lopsided || 0) + (p.booster === 'L' ? -1 : 1) * SLEIGHM.lopsided;
      window.sfx?.play('explosion', { vol: 0.9 });
      api.onBoosterLost?.(p.booster);
    }
  }

  /** damage every part within `radius` of a world point; `power` hit points each (falls off with distance) */
  function hit(point, radius, power = 1) {
    sl.g.updateMatrixWorld();
    let n = 0;
    for (const p of parts) {
      if (!p.alive || p.hp === Infinity) continue;
      _w.copy(p.c).applyMatrix4(sl.g.matrixWorld);
      const d = _w.distanceTo(point) - p.r;
      if (d > radius) continue;
      p.hp -= power * (1 - Math.max(0, d) / Math.max(radius, 1e-3) * 0.6);
      if (p.hp <= 0) { detach(p, point, 4 + power); n++; }
    }
    if (n) window.sfx?.play(n > 3 ? 'debris' : 'crunch', { vol: Math.min(1, 0.4 + n * 0.1), rate: 1.3 });
    return n;
  }
  /** a ray (bullet) against the sleigh: { point, dist, part } or null */
  function raycast(o, d, far = 250) {
    rc.set(o, d); rc.far = far;
    const h = rc.intersectObject(mesh, false)[0]; if (!h) return null;
    const tri = h.faceIndex * 3; let part = null;
    for (const p of parts) if (tri >= p.start && tri < p.start + p.count) { part = p; break; }
    return { point: h.point, dist: h.distance, part };
  }
  /** one bullet on one part */
  function shoot(h, dmg = 1) {
    if (!h?.part || !h.part.alive || h.part.hp === Infinity) return;
    h.part.hp -= dmg; if (h.part.hp <= 0) { detach(h.part, h.point, 5); window.sfx?.play('crunch', { vol: 0.6, rate: 1.4 }); }
  }
  function repair() {
    merged.index.array.set(index0); merged.index.needsUpdate = true;
    for (const p of parts) { p.alive = true; p.hp = p.hp0; }
    for (const o of debris) scene.remove(o.m); debris.length = 0;
    rig.lostBoosters.clear(); rig.lopsided = 0; rig.rollT = 0;
    for (const k in flames) flames[k].visible = true;
  }
  function update(dt, t, boost) {
    for (const k in flames) {
      const f = flames[k]; if (!f.visible) continue;
      const want = boost ? SLEIGHM.flame.boost : SLEIGHM.flame.idle;
      f.userData.k = (f.userData.k ?? want) + (want - (f.userData.k ?? want)) * (1 - Math.exp(-8 * dt));
      const fl = f.userData.k * (0.85 + Math.sin(t * 40 + (k === 'L' ? 0 : 2)) * 0.08 + Math.random() * 0.1);
      f.scale.set(0.8 + fl * 0.25, 0.8 + fl * 0.25, fl);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const o = debris[i]; o.life -= dt;
      o.v.y -= 22 * dt;
      o.m.position.addScaledVector(o.v, dt);
      _q.setFromAxisAngle(_c.copy(o.w).normalize(), o.w.length() * dt); o.m.quaternion.premultiply(_q);
      const gy = groundH(o.m.position.x, o.m.position.z) + 0.15;
      if (o.m.position.y < gy) { o.m.position.y = gy; o.v.y = Math.abs(o.v.y) * 0.3; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.6); }
      if (o.life < 1) o.m.scale.setScalar(Math.max(0.001, o.life));
      if (o.life <= 0) { scene.remove(o.m); o.m.geometry.dispose(); debris.splice(i, 1); }
    }
  }
  const api = { mesh, parts, hit, raycast, shoot, repair, update, onBoosterLost: null,
    stats: () => ({ parts: parts.length, alive: parts.filter(p => p.alive).length, tris: merged.index.count / 3 }) };
  return api;
}
