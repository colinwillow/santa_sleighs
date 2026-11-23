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
import { rand, rr, softDot, shadowProxy } from './util.js';

export const TOWN = {
  brick: new THREE.Vector3(1.2, 0.5, 0.55),   // long, high, deep (m)
  courses: 9, wallBricksX: 6, wallBricksZ: 4,
  hp: { wall: 2, roof: 2, gable: 2 },
  span: 2,                 // a brick can hang off its course this many bricks from the nearest one held from below
  debrisMax: 420, gravity: 20,
  // FAR LOD (b33): past `far` m from the camera a house swaps its bricks for a few painted SLABS (walls with the door / window
  // holes, 2 gables, 2 roof planes, icing strips; budget ~300-800 tris a house, all far houses ONE draw); back under `near`
  // m it is real bricks again. Checked every `every` s. A house that has been hit is near forever (its slabs would hide the holes).
  lod: { near: 55, far: 65, every: 0.25, budget: [300, 800], bevel: 0.07 },
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
/** a slab bevelled along its TOP edges only (the underside sits on the brick): 20 tris, smooth-shaded */
function topChamferSlab(w, h, d, c) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(new THREE.Vector3(sx * w / 2, -h / 2, sz * d / 2), new THREE.Vector3(sx * w / 2, h / 2 - c, sz * d / 2),
      new THREE.Vector3(sx * (w / 2 - c), h / 2, sz * (d / 2 - c)));
  }
  let g = new ConvexGeometry(pts);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4); g.computeVertexNormals();
  return g;
}
/** an icing cap: a soft slab with two drips hanging off the front edge (b30: 50 tris, was 212 -- slab 20 + two 15-tri drips) */
function icingGeo(w, d) {
  const parts = [topChamferSlab(w * 1.04, 0.14, d * 1.12, 0.06)];
  for (const [x, len] of [[-w * 0.22, 0.32], [w * 0.18, 0.22]]) {
    const stem = new THREE.CylinderGeometry(0.06, 0.055, len, 5, 1, true); stem.translate(x, -len / 2 - 0.02, d * 0.56); parts.push(stem);
    const tip = new THREE.ConeGeometry(0.055, 0.08, 5, 1, true); tip.rotateX(Math.PI); tip.translate(x, -len - 0.06, d * 0.56); parts.push(tip);
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
  let built = false, mesh, ice, debrisMesh, wallProxy, roofProxy;
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
    hs.lp = { rows, nx, nz, door, top, gRows, run, rise, pitch, slope, nRows };   // the far slabs are built from these
    hs.wallH = top; hs.roofBase = top - 0.15; hs.roofW = run * 2; hs.roofH = rise + 0.1; hs.roofD = D + 1.0;   // shadow proxy sizes
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
    // b30: the bricks / icing / dressing no longer cast -- the shadow pass draws one box + one roof prism per house instead
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    ice = new THREE.InstancedMesh(icingGeo(B.x * 0.97, B.z), iceMat, Math.max(1, ices.length));
    ices.forEach((c, i) => ice.setMatrixAt(i, c.world));
    ice.castShadow = false; ice.receiveShadow = true; ice.frustumCulled = false; scene.add(ice);
    debrisMesh = new THREE.InstancedMesh(brickGeo, mat, TOWN.debrisMax); debrisMesh.count = 0; debrisMesh.castShadow = true; debrisMesh.frustumCulled = false;
    debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOWN.debrisMax * 3), 3); scene.add(debrisMesh);
    // dressing: one instanced mesh per kind
    const kinds = {
      door: [new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b82a26', roughness: 0.5 })],
      win: [new THREE.PlaneGeometry(1, 1), glowMat],
      cane: [(() => { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(t < 0.75 ? new THREE.Vector3(0, t / 0.75 * 1.3, 0) : new THREE.Vector3(0.18 - Math.cos((t - 0.75) / 0.25 * Math.PI) * 0.18, 1.3 + Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.18, 0)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.07, 5); })(), /* b30: 240 -> 120 tris */
        new THREE.MeshStandardMaterial({ map: caneTex(), roughness: 0.4 })],
      gum: [(() => { const g = new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); /* b30: 150 -> 56 tris */ g.scale(1, 1.3, 1); return g; })(), new THREE.MeshStandardMaterial({ roughness: 0.35 })],
    };
    for (const [k, [g, m]] of Object.entries(kinds)) {
      const list = []; houses.forEach((h, hi) => h.decor.forEach(d => { if (d.kind === k) list.push({ h: hi, d }); }));
      const im = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
      list.forEach((e, i) => { im.setMatrixAt(i, e.d.m); if (e.d.col) im.setColorAt(i, new THREE.Color(e.d.col)); });
      im.castShadow = false; im.receiveShadow = k !== 'win'; im.frustumCulled = false; scene.add(im); decorMeshes.push({ im, list });
    }
    // SHADOW PROXIES: walls = a unit box (base at y 0) scaled W x wall height x D; roof = a unit prism over the gables
    wallProxy = shadowProxy(scene, new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), houses.length, houses.length);
    const tri = new THREE.Shape(); tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 1); tri.lineTo(-0.5, 0);
    roofProxy = shadowProxy(scene, new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), houses.length, houses.length);
    houses.forEach((hs, i) => {
      hs.pi = i; hs.walls = hs.ids.filter(id => bricks[id].kind === 'wall'); hs.wallTotal = hs.walls.length;
      roofProxy.setMatrixAt(i, hs.H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, hs.roofBase, 0), new THREE.Quaternion(), new THREE.Vector3(hs.roofW, hs.roofH, hs.roofD))));
      proxyFollow(hs);
    });
    buildFar();
    built = true;
  }
  function caneTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fff6ec' : '#e3283a'; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---- FAR LOD: painted slabs, one merged mesh; a house is hidden in it by zeroing its index range (as sleighmodel.js) -------
  /** a slab w x h x d centred on its frame origin, outer face +z with its rim chamfered (20 tris, flat-shaded); UVs from the frame
   *  ((x + u0) / us, (y + v0) / vs) so the brick courses line up across neighbouring slabs */
  function slab(w, h, d, c, M, u0, v0, us, vs, col, out) {
    c = Math.min(c, w / 3, h / 3, d / 2);
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      pts.push(new THREE.Vector3(sx * w / 2, sy * h / 2, -d / 2), new THREE.Vector3(sx * w / 2, sy * h / 2, d / 2 - c),
        new THREE.Vector3(sx * (w / 2 - c), sy * (h / 2 - c), d / 2));
    }
    emit(new ConvexGeometry(pts), M, u0, v0, us, vs, col, out);
  }
  /** any convex point set (gables) or a plain box (icing: uvFixed = a spot mid-brick, no grooves) through the same path */
  function emit(g, M, u0, v0, us, vs, col, out, uvFixed = null) {
    g = g.index ? g.toNonIndexed() : g;
    const P = g.attributes.position, nm = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3) {
      // the face normal in the frame decides the projection
      const a = new THREE.Vector3().fromBufferAttribute(P, i), b = new THREE.Vector3().fromBufferAttribute(P, i + 1), c2 = new THREE.Vector3().fromBufferAttribute(P, i + 2);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c2, a)).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      for (const p of [a, b, c2]) {
        let u, w;
        if (az >= ax && az >= ay) { u = p.x; w = p.y; } else if (ax >= ay) { u = p.z; w = p.y; } else { u = p.x; w = p.z; }
        if (uvFixed) out.uv.push(uvFixed[0], uvFixed[1]); else out.uv.push((u + u0) / us, (w + v0) / vs);
        v.copy(p).applyMatrix4(M); out.pos.push(v.x, v.y, v.z);
        out.col.push(col.r, col.g, col.b);
      }
      v.copy(n).applyMatrix3(nm).normalize();
      for (let k = 0; k < 3; k++) out.nrm.push(v.x, v.y, v.z);
    }
  }
  /** the wall run (length len, height top) minus its holes -> rectangles: bands between hole edges, merged when they match */
  function panels(len, top, holes) {
    const ys = [...new Set([0, top, ...holes.flatMap(h => [h.y0, h.y1])])].filter(y => y >= 0 && y <= top).sort((a, b) => a - b);
    const out = [];
    let prev = null;
    for (let i = 0; i < ys.length - 1; i++) {
      const y0 = ys[i], y1 = ys[i + 1], mid = (y0 + y1) / 2;
      let segs = [[0, len]];
      for (const h of holes) if (mid > h.y0 && mid < h.y1) segs = segs.flatMap(([a, b]) => h.x1 <= a || h.x0 >= b ? [[a, b]] : [[a, h.x0], [h.x1, b]].filter(([p, q]) => q - p > 0.05));
      const key = segs.map(s => s.join()).join('|');
      if (prev && prev.key === key) { prev.rects.forEach(r => r.y1 = y1); continue; }
      prev = { key, rects: segs.map(([a, b]) => ({ x0: a, x1: b, y0, y1 })) }; out.push(...prev.rects);
    }
    return out;
  }
  function brickTex() {
    // 4 bricks x 4 courses, hand-painted: warm mortar grooves, soft dabs on each face, a lit top edge + shaded underside
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    x.fillStyle = '#8f8278'; x.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let k = -1; k < 4; k++) {
      const bx = (k + (row % 2 ? 0.5 : 0)) * 64, by = 256 - (row + 1) * 64, g = 222 + r() * 30 | 0;
      x.fillStyle = `rgb(${g},${g - 4},${g - 10})`; x.beginPath(); x.roundRect(bx + 3, by + 5, 58, 55, 9); x.fill();
      x.fillStyle = 'rgba(255,250,240,0.45)'; x.fillRect(bx + 8, by + 7, 48, 5);                       // the lit top edge
      x.fillStyle = 'rgba(90,60,50,0.22)'; x.fillRect(bx + 6, by + 52, 52, 6);                         // shaded underside
      for (let d = 0; d < 5; d++) { const v = 200 + r() * 55 | 0; x.fillStyle = `rgba(${v},${v - 8},${v - 18},0.25)`; x.beginPath(); x.ellipse(bx + 10 + r() * 44, by + 14 + r() * 34, 6 + r() * 9, 3 + r() * 5, r() * 3, 0, 7); x.fill(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  let far = null, farIndex0 = null;
  const _avg = (ids, f) => { const c = new THREE.Color(0, 0, 0); let n = 0; for (const id of ids) if (f(bricks[id])) { c.add(bricks[id].col); n++; } return n ? c.multiplyScalar(1 / n) : c.set(TOWN.cookie[0]); };
  function buildFar() {
    const out = { pos: [], nrm: [], uv: [], col: [] }, bev = TOWN.lod.bevel, iceC = new THREE.Color(TOWN.icing);
    const BU = B.x * 4, BV = B.y * 4;   // one texture tile = 4 bricks x 4 courses
    for (const hs of houses) {
      const L = hs.lp, start = out.pos.length / 3, W = hs.W, D = hs.D, top = L.top;
      const wallC = _avg(hs.ids, b => b.kind !== 'roof'), roofC = _avg(hs.roof, () => true);
      const frame = (x, y, z, ry, M2 = null) => { const m = hs.H.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1))); return M2 ? m.multiply(M2) : m; };
      // walls: front (+z, the door), back (-z), sides (+x / -x, shortened by the wall depth so the corners don't z-fight)
      const win = (cx, w = B.x) => ({ x0: cx - w / 2, x1: cx + w / 2, y0: 4 * B.y, y1: 6 * B.y });
      const walls = [
        { len: W, x: 0, z: D / 2 - B.z / 2, ry: 0, holes: [{ x0: (L.door + 0.5) * B.x - B.x / 2, x1: (L.door + 0.5) * B.x + B.x / 2, y0: 0, y1: 4 * B.y }, win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] },
        { len: W, x: 0, z: -D / 2 + B.z / 2, ry: Math.PI, holes: [win(W / 2 - W * 0.28), win(W / 2 + W * 0.28)] },
        { len: D - 2 * B.z, x: W / 2 - B.z / 2, z: 0, ry: Math.PI / 2, holes: [win((D - 2 * B.z) / 2)] },
        { len: D - 2 * B.z, x: -W / 2 + B.z / 2, z: 0, ry: -Math.PI / 2, holes: [win((D - 2 * B.z) / 2)] },
      ];
      for (const w of walls) {
        for (const r of panels(w.len, top, w.holes)) {
          const cx = (r.x0 + r.x1) / 2 - w.len / 2, cy = (r.y0 + r.y1) / 2;
          // frame x runs along the wall: rotate the along-wall offset into the house
          const M = frame(w.x + Math.cos(w.ry) * cx, cy, w.z - Math.sin(w.ry) * cx, w.ry);
          slab(r.x1 - r.x0, r.y1 - r.y0, B.z, bev, M, r.x0 + (r.x1 - r.x0) / 2, cy, BU, BV, wallC, out);
        }
        // the iced top course: one strip along the wall
        emit(new THREE.BoxGeometry(w.len + 0.1, 0.14, B.z * 1.12), frame(w.x, top + 0.05, w.z, w.ry), 0, 0, 1, 1, iceC, out, [0.12, 0.12]);
      }
      // gables: a trapezoid prism on the front + back (courses narrow to the peak)
      if (L.gRows > 0) {
        const hw = gr => Math.max(1, Math.floor((W / 2) * (1 - (gr + 1) / (L.gRows + 1)) * 2 / B.x)) * B.x / 2;
        const b0 = hw(0), b1 = hw(L.gRows - 1), gh = L.gRows * B.y, pts = [];
        for (const sz of [-1, 1]) for (const [px, py] of [[-b0, 0], [b0, 0], [b1, gh], [-b1, gh]]) pts.push(new THREE.Vector3(px, py, sz * B.z / 2));
        for (const s of [1, -1]) emit(new ConvexGeometry(pts), frame(0, top, s * (D / 2 - B.z / 2), s > 0 ? 0 : Math.PI), b0 + 0, 0, BU, BV, wallC, out);
      }
      // roof: two shingle planes (frame x along the ridge, y up the slope, z out of the roof), eave + ridge icing strips
      const RW = D + 1.0, CV = 0.48 * 4;
      for (const sgn of [1, -1]) {
        const up = new THREE.Vector3(-sgn * L.run, L.rise, 0).normalize(), nrm = new THREE.Vector3(sgn * L.rise, L.run, 0).normalize(), ax = new THREE.Vector3(0, 0, -sgn);
        const basis = new THREE.Matrix4().makeBasis(ax, up, nrm);
        const at = t => new THREE.Vector3(sgn * L.run * (1 - t), top - 0.3 + L.rise * t + 0.15, 0);
        const c0 = at(0.5), len = L.slope + 0.2;
        const M = hs.H.clone().multiply(new THREE.Matrix4().makeTranslation(c0.x, c0.y, c0.z)).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0));
        slab(RW, len, 0.3, bev, M, RW / 2, len / 2, BU, CV, roofC, out);
        for (const t of [0.5 / L.nRows, 1 - 0.5 / L.nRows]) {
          const p = at(t).addScaledVector(nrm, 0.2);
          emit(new THREE.BoxGeometry(RW + 0.1, 0.62, 0.14), hs.H.clone().multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)).multiply(basis), 0, 0, 1, 1, iceC, out, [0.12, 0.12]);
        }
      }
      hs.farStart = start; hs.farCount = out.pos.length / 3 - start; hs.far = false; hs.damaged = false;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    const n = out.pos.length / 3, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i;
    farIndex0 = ix.slice(); ix.fill(0);   // every house starts NEAR (its far range collapsed)
    g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere();
    far = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: brickTex(), vertexColors: true, roughness: 0.8 }));
    far.name = 'townFar'; far.castShadow = false; far.receiveShadow = true; far.userData.noMerge = true;   // the merger must not swallow the index trick
    scene.add(far);
  }
  /** swap one house between bricks (near) and slabs (far); gameplay data (brick records, colliders) never changes */
  function setFar(hs, on) {
    if (hs.far === on || !far) return;
    if (on && hs.damaged) return;
    hs.far = on;
    for (const id of hs.ids) {
      const b = bricks[id]; if (!b.alive) continue;
      mesh.setMatrixAt(id, on ? ZERO : b.world);
      if (b.ice >= 0) ice.setMatrixAt(b.ice, on ? ZERO : ices[b.ice].world);
    }
    mesh.instanceMatrix.needsUpdate = true; ice.instanceMatrix.needsUpdate = true;
    const ix = far.geometry.index;
    if (on) ix.array.set(farIndex0.subarray(hs.farStart, hs.farStart + hs.farCount), hs.farStart); else ix.array.fill(0, hs.farStart, hs.farStart + hs.farCount);
    ix.needsUpdate = true;
  }
  /** a hit: the house shows its real bricks now and for good */
  function hurt(hs) { hs.damaged = true; setFar(hs, false); }
  let lodT = 0;
  const _cp = new THREE.Vector3();
  /** call every frame with the camera; re-picks near / far a few times a second (hysteresis TOWN.lod.near / far) */
  function lodTick(camera, dt = 0.016) {
    if (!built || !far) return;
    lodT -= dt; if (lodT > 0) return; lodT = TOWN.lod.every;
    _cp.setFromMatrixPosition(camera.matrixWorld);
    const n2 = TOWN.lod.near ** 2, f2 = TOWN.lod.far ** 2;
    for (const hs of houses) {
      if (hs.damaged) continue;
      const d2 = (_cp.x - hs.x) ** 2 + (_cp.y - hs.gy - hs.wallH / 2) ** 2 + (_cp.z - hs.z) ** 2;
      if (hs.far && d2 < n2) setFar(hs, false); else if (!hs.far && d2 > f2) setFar(hs, true);
    }
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
    hurt(b.h);
    b.hp -= dmg;
    // a bruise: darken it a little each hit
    b.col.multiplyScalar(0.86); mesh.setColorAt(id, b.col); mesh.instanceColor.needsUpdate = true;
    if (b.hp > 0) return 0;
    return remove(b.h, [id], _p.setFromMatrixPosition(b.world).clone(), from);
  }

  function remove(hs, ids, at, push) {
    hurt(hs);   // bricks first, then the holes
    const gone = new Set(ids);
    // SUPPORT (his note: one shot dropped a whole wall -- he wants to shoot out bricks one by one until it gives):
    // a brick stands if it connects to the ground through living bricks -- straight down through any brick it overlaps,
    // or sideways along its course for up to TOWN.span bricks (bricks bridge a hole the way a real bonded wall does)
    if (!hs.nb) {
      hs.nb = new Map();
      const pos = new Map(); for (const id of hs.ids) pos.set(id, new THREE.Vector3().setFromMatrixPosition(bricks[id].local));
      for (const id of hs.ids) {
        const b = bricks[id]; if (b.kind === 'roof') continue;
        const bp = pos.get(id), up = [], side = [];
        for (const jd of hs.ids) {
          if (jd === id) continue; const c = bricks[jd]; if (c.kind === 'roof') continue;
          const cp = pos.get(jd), dh = Math.hypot(cp.x - bp.x, cp.z - bp.z), dy = cp.y - bp.y;
          if (dy > B.y * 0.5 && dy < B.y * 1.5 && dh < B.x * 1.02) up.push(jd);
          else if (Math.abs(dy) < B.y * 0.5 && dh < B.x * 1.12) side.push(jd);
        }
        hs.nb.set(id, { up, side, ground: b.row === 0 });
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      const live = id => bricks[id].alive && !gone.has(id);
      const best = new Map(), q = [];   // best = fewest sideways steps since the last brick under it
      for (const [id, n] of hs.nb) if (n.ground && live(id)) { best.set(id, 0); q.push(id); }
      while (q.length) {
        const id = q.shift(), n = hs.nb.get(id), k = best.get(id);
        for (const u of n.up) if (live(u) && !(best.get(u) <= 0)) { best.set(u, 0); q.push(u); }
        if (k < TOWN.span) for (const u of n.side) if (live(u) && !(best.get(u) <= k + 1)) { best.set(u, k + 1); q.push(u); }
      }
      for (const [id] of hs.nb) if (live(id) && !best.has(id)) { gone.add(id); changed = true; }
      // the roof drops when the wall tops under it are mostly gone
      const topAlive = hs.top.filter(i => bricks[i].alive && !gone.has(i)).length;
      if (hs.top.length && topAlive < hs.top.length * 0.4) for (const r of hs.roof) if (bricks[r].alive && !gone.has(r)) { gone.add(r); changed = true; }
    }
    for (const id of gone) {
      const b = bricks[id]; b.alive = false; hs.alive--;
      mesh.setMatrixAt(id, ZERO);
      if (b.ice >= 0) ice.setMatrixAt(b.ice, ZERO);
      spawnDebris(b, at, push, ids.includes(id));
    }
    mesh.instanceMatrix.needsUpdate = true; ice.instanceMatrix.needsUpdate = true;
    proxyFollow(hs);
    // the house's crash collider + dressing follow what's left
    const frac = hs.alive / hs.total;
    if (frac < 0.35 && !hs.dead) {
      hs.dead = true; hs.collider.r = 0;
      decorMeshes.forEach(({ im, list }) => { list.forEach((e, i) => { if (houses[e.h] === hs) im.setMatrixAt(i, ZERO); }); im.instanceMatrix.needsUpdate = true; });
    } else hs.collider.top = hs.gy + Math.max(1, frac) * (hs.collider.top - hs.gy);
    window.sfx?.play(gone.size > 6 ? 'debris' : 'crunch', { vol: Math.min(1, 0.4 + gone.size * 0.05) });
    return gone.size;
  }

  /** the house's shadow stand-ins follow what is left: the wall box's height = the share of wall bricks still up, the roof
   *  prism goes when most of the roof has dropped */
  const _pm = new THREE.Matrix4(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3(), _pq = new THREE.Quaternion();
  function proxyFollow(hs) {
    if (!wallProxy || hs.pi === undefined) return;
    let w = 0; for (const id of hs.walls) if (bricks[id].alive) w++;
    const f = hs.wallTotal ? w / hs.wallTotal : 0;
    wallProxy.setMatrixAt(hs.pi, f > 0.02 ? _pm.multiplyMatrices(hs.H, new THREE.Matrix4().compose(_pp.set(0, 0, 0), _pq, _ps.set(hs.W, hs.wallH * f, hs.D))) : ZERO);
    let r = 0; for (const id of hs.roof) if (bricks[id].alive) r++;
    if (r < hs.roof.length * 0.5) roofProxy.setMatrixAt(hs.pi, ZERO);
    wallProxy.instanceMatrix.needsUpdate = roofProxy.instanceMatrix.needsUpdate = true;
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
    house, finish, update, lodTick, raycast, solidAt, blast, hitBrick, houses,
    get stats() { return { bricks: bricks.length, alive: bricks.filter(b => b.alive).length, houses: houses.length,
      far: houses.filter(h => h.far).length, farTris: far ? far.geometry.index.count / 3 : 0 }; },
  };
}
