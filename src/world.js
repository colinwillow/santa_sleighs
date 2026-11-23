// The cozy snow diorama: dusk sky, rolling snow hills, a little village with glowing windows and
// chimney smoke, a big lit Christmas tree in the square, a frozen pond, pine forest, mountain ring, snowfall.
import * as THREE from 'three';

// ---- deterministic random ------------------------------------------------------------
let seed = 1337;
export const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + rand() * (b - a);

// ---- terrain height ------------------------------------------------------------------
export const WORLD = 700;            // metres across
const VILLAGE_R = 70;                // flattened village circle
const POND = { x: -95, z: 60, r: 26 };
export function groundH(x, z) {
  let h = 6 * Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.010 - 0.4)
        + 3 * Math.sin(x * 0.031 - z * 0.022)
        + 1.2 * Math.sin(x * 0.08 + z * 0.06);
  const d = Math.hypot(x, z);
  h += Math.max(0, d - 220) * 0.18;  // rises toward the rim
  const village = THREE.MathUtils.smoothstep(d, VILLAGE_R, VILLAGE_R + 40);
  h = h * village;
  const pd = Math.hypot(x - POND.x, z - POND.z);
  const pond = 1 - THREE.MathUtils.smoothstep(pd, POND.r, POND.r + 18);
  h = THREE.MathUtils.lerp(h, -1.2, pond);
  return h;
}

export function buildWorld(scene) {
  const world = { update: () => {}, chimneys: [], colliders: [] };
  const upd = [];

  // ---- sky --------------------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#0d1433') }, mid: { value: new THREE.Color('#3b4a85') },
                low: { value: new THREE.Color('#f0a88a') } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top, mid, low; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y = vP.y;
        vec3 c = mix(low, mid, smoothstep(-0.02, 0.22, y)); c = mix(c, top, smoothstep(0.2, 0.75, y));
        vec3 q = floor(vP*380.); float s = step(0.9975, h(q)) * smoothstep(0.15, 0.5, y);
        c += s * vec3(0.9,0.95,1.0);
        gl_FragColor = vec4(c, 1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog('#7a7fb0', 160, 900);

  // moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false }));
  moon.position.set(-500, 420, -900);
  scene.add(moon);

  // ---- lights -----------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#8ea2ff', '#6f6a9a', 0.85));
  const moonLight = new THREE.DirectionalLight('#c9d6ff', 1.25);
  moonLight.position.set(-120, 200, -140);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  const sc = moonLight.shadow.camera; sc.left = sc.bottom = -110; sc.right = sc.top = 110; sc.far = 500;
  moonLight.shadow.bias = -0.0005; moonLight.shadow.normalBias = 0.4;
  scene.add(moonLight, moonLight.target);
  world.moonLight = moonLight;

  // ---- terrain ----------------------------------------------------------------------
  const seg = 180;
  const tg = new THREE.PlaneGeometry(WORLD * 1.6, WORLD * 1.6, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, col = [];
  const cA = new THREE.Color('#e9eeff'), cB = new THREE.Color('#b4c0ec'), cPath = new THREE.Color('#d8c9c0'), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundH(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2) * Math.cos(z * 0.11);
    tmp.copy(cA).lerp(cB, n * 0.55);
    // trodden paths: a ring road + four spokes through the village
    const d = Math.hypot(x, z), a = Math.atan2(z, x);
    const ring = Math.abs(d - 42) < 3.2 ? 1 : 0;
    const spoke = d < 120 && Math.abs(Math.sin(a * 2)) * d < 2.6 ? 1 : 0;
    if (ring || spoke) tmp.lerp(cPath, 0.55);
    col.push(tmp.r, tmp.g, tmp.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.computeVertexNormals();
  const ground = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // frozen pond
  const ice = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 6, 48),
    new THREE.MeshStandardMaterial({ color: '#9fd2ff', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  ice.rotation.x = -Math.PI / 2; ice.position.set(POND.x, -0.9, POND.z); ice.receiveShadow = true;
  scene.add(ice);

  // ---- shared materials -------------------------------------------------------------
  const M = {
    snow: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    wallA: new THREE.MeshStandardMaterial({ color: '#c96a4a', roughness: 0.85 }),
    wallB: new THREE.MeshStandardMaterial({ color: '#e7c89a', roughness: 0.85 }),
    wallC: new THREE.MeshStandardMaterial({ color: '#7f9bb8', roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: '#6b4430', roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ color: '#8c4a3c', roughness: 0.9 }),
    window: new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 2.2 }),
    pine: new THREE.MeshStandardMaterial({ color: '#2f5d4a', roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a3b2a', roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ color: '#6c7192', roughness: 1, flatShading: true }),
  };

  // ---- houses -----------------------------------------------------------------------
  const roofShape = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0); return s; };
  function house(x, z, rot, scale) {
    const g = new THREE.Group();
    const w = rr(6, 9), d = rr(6, 8), h = rr(4, 6.5);
    const wallMat = [M.wallA, M.wallB, M.wallC][Math.floor(rand() * 3)];
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2; g.add(body);
    // snow-capped roof: an extruded gable with a bevel, and a fatter white cap on top
    const rh = w * 0.5;
    const roofG = new THREE.ExtrudeGeometry(roofShape(w + 1.2, rh), { depth: d + 1.2, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 });
    roofG.translate(0, 0, -(d + 1.2) / 2);
    const roof = new THREE.Mesh(roofG, M.wood); roof.position.y = h; g.add(roof);
    const capG = new THREE.ExtrudeGeometry(roofShape(w + 1.6, rh + 0.35), { depth: d + 1.5, bevelEnabled: true, bevelSize: 0.45, bevelThickness: 0.4, bevelSegments: 3 });
    capG.translate(0, 0, -(d + 1.5) / 2);
    const cap = new THREE.Mesh(capG, M.snow); cap.position.y = h + 0.25; cap.scale.set(1, 1, 1); g.add(cap);
    // chimney
    const cx = w * 0.22, cz = rr(-d * 0.25, d * 0.25);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), M.brick);
    ch.position.set(cx, h + rh * 0.55 + 1.2, cz); g.add(ch);
    const chCap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.35, 10), M.snow);
    chCap.position.set(cx, h + rh * 0.55 + 2.9, cz); g.add(chCap);
    // glowing windows + door
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), M.window);
      win.position.set(side * (w / 2 + 0.02), h * 0.55, (k - 0.5) * d * 0.45);
      win.rotation.y = side * Math.PI / 2; g.add(win);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), M.wood);
    door.position.set(0, 1.2, d / 2 + 0.02); g.add(door);
    const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), M.window);
    doorWin.position.set(w * 0.3, h * 0.55, d / 2 + 0.02); g.add(doorWin);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.material !== M.window; o.receiveShadow = true; } });
    g.position.set(x, groundH(x, z), z); g.rotation.y = rot; g.scale.setScalar(scale);
    scene.add(g);
    g.updateMatrixWorld();
    const top = new THREE.Vector3(cx, h + rh * 0.55 + 3.1, cz).applyMatrix4(g.matrixWorld);
    world.chimneys.push(top);
    world.colliders.push({ x, z, r: Math.max(w, d) * 0.6 * scale, top: g.position.y + (h + rh + 1) * scale });
  }
  const houseCount = 14;
  for (let i = 0; i < houseCount; i++) {
    const a = (i / houseCount) * Math.PI * 2 + rr(-0.12, 0.12);
    const r = i % 2 ? rr(26, 32) : rr(52, 62);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    house(x, z, -a + Math.PI / 2 + Math.PI, rr(0.9, 1.15));
  }
  // a few farmhouses out in the hills
  for (let i = 0; i < 8; i++) {
    const a = rr(0, Math.PI * 2), r = rr(130, 210);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 20) continue;
    house(x, z, rr(0, Math.PI * 2), rr(0.9, 1.2));
  }

  // ---- big Christmas tree in the square (the focal point) ----------------------------
  {
    const g = new THREE.Group();
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const r = 7 - i * 1.05, y = 2 + i * 3.1;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 5, 9), M.pine);
      cone.position.y = y + 2.5; cone.castShadow = true; g.add(cone);
      const snowRim = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 1.3, 9), M.snow);
      snowRim.position.y = y + 4.4; g.add(snowRim);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 8), M.trunk); trunk.position.y = 1.5; g.add(trunk);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 3 }));
    star.position.y = 2 + tiers * 3.1 + 2.6; g.add(star);
    // light bulbs on a spiral
    const bulbCols = ['#ff4b4b', '#ffd34a', '#4bc3ff', '#7dff7a', '#ff8bf0'];
    const N = 110, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial(), N);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const t = i / N, y = 2.5 + t * tiers * 3.1, r = (7.2 - t * tiers * 1.05) * (0.92 - ((y - 2) % 3.1) / 3.1 * 0.35);
      const a = t * Math.PI * 2 * 7;
      m4.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r); bulbs.setMatrixAt(i, m4);
      bulbs.setColorAt(i, c.set(bulbCols[i % bulbCols.length]).multiplyScalar(1.6));
    }
    g.add(bulbs);
    const glow = new THREE.PointLight('#ffc070', 60, 45, 1.6); glow.position.y = 9; g.add(glow);
    scene.add(g);
    world.colliders.push({ x: 0, z: 0, r: 7.5, top: 26 });
    upd.push(t => { star.rotation.y = t * 0.8; star.scale.setScalar(1 + Math.sin(t * 3) * 0.08); });
  }

  // ---- lamp posts round the ring road ------------------------------------------------
  const lampN = 16;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 4, 6), new THREE.MeshStandardMaterial({ color: '#2b2b38' }), lampN);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffbb55', emissiveIntensity: 3 }), lampN);
  for (let i = 0; i < lampN; i++) {
    const a = (i / lampN) * Math.PI * 2 + 0.2, x = Math.cos(a) * 46, z = Math.sin(a) * 46, y = groundH(x, z);
    posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y + 2, z));
    lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y + 4.2, z));
  }
  scene.add(posts, lamps);

  // ---- pine forest (instanced, snow-tipped) -------------------------------------------
  {
    const N = 900;
    const geos = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry(2.4 - i * 0.6, 3.2, 7); g.translate(0, 2 + i * 1.9, 0); geos.push(g);
    }
    const coneMesh = new THREE.InstancedMesh(mergeGeos(geos), M.pine, N);
    const capMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 1.1, 7).translate(0, 7.05, 0), M.snow, N);
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6).translate(0, 0.7, 0), M.trunk, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let n = 0;
    for (let tries = 0; n < N && tries < N * 6; tries++) {
      const x = rr(-WORLD * 0.75, WORLD * 0.75), z = rr(-WORLD * 0.75, WORLD * 0.75);
      const d = Math.hypot(x, z);
      if (d < VILLAGE_R + 8) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 8) continue;
      // clumps: density from a cheap noise
      if (Math.sin(x * 0.03) * Math.cos(z * 0.027) + Math.sin((x + z) * 0.011) < rr(-0.6, 0.9)) continue;
      const sc = rr(0.7, 1.7);
      p.set(x, groundH(x, z) - 0.2, z); q.setFromEuler(e.set(rr(-0.05, 0.05), rr(0, 6.28), rr(-0.05, 0.05))); s.set(sc, sc * rr(0.9, 1.25), sc);
      m4.compose(p, q, s);
      coneMesh.setMatrixAt(n, m4); capMesh.setMatrixAt(n, m4); trunkMesh.setMatrixAt(n, m4); n++;
    }
    for (const im of [coneMesh, capMesh, trunkMesh]) { im.count = n; im.castShadow = im !== capMesh; im.receiveShadow = true; scene.add(im); }
  }

  // ---- mountain ring (backdrop silhouettes) -------------------------------------------
  {
    const N = 34;
    const mtn = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7, 1), M.rock, N);
    const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.46, 0.44, 7, 1).translate(0, 0.285, 0), M.snow, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rr(-0.05, 0.05), r = rr(560, 700);
      const hgt = rr(120, 260), wid = rr(110, 190);
      p.set(Math.cos(a) * r, hgt / 2 - 10, Math.sin(a) * r); q.setFromEuler(e.set(0, rr(0, 6), 0)); s.set(wid, hgt, wid);
      m4.compose(p, q, s); mtn.setMatrixAt(i, m4); cap.setMatrixAt(i, m4);
    }
    scene.add(mtn, cap);
  }

  // ---- chimney smoke (one Points cloud) ------------------------------------------------
  {
    const per = 14, N = world.chimneys.length * per;
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(N * 3), life = new Float32Array(N);
    for (let i = 0; i < N; i++) life[i] = rand();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const smoke = new THREE.Points(g, new THREE.PointsMaterial({ color: '#c8c8d8', size: 2.6, map: softDot(), transparent: true, opacity: 0.45, depthWrite: false }));
    smoke.frustumCulled = false; scene.add(smoke);
    upd.push((t, dt) => {
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.18; if (life[i] > 1) life[i] -= 1;
        const c = world.chimneys[(i / per) | 0], L = life[i];
        P[i * 3] = c.x + Math.sin(L * 6 + i) * 0.6 * L + L * 5;
        P[i * 3 + 1] = c.y + L * 12;
        P[i * 3 + 2] = c.z + Math.cos(L * 5 + i) * 0.6 * L;
      }
      g.attributes.position.needsUpdate = true;
    });
  }

  // ---- snowfall around the camera -------------------------------------------------------
  {
    const N = 2500, B = 90;
    const g = new THREE.BufferGeometry(), P = new Float32Array(N * 3), off = new Float32Array(N);
    for (let i = 0; i < N; i++) { P[i * 3] = rr(-B, B); P[i * 3 + 1] = rr(-B, B); P[i * 3 + 2] = rr(-B, B); off[i] = rr(0, 6.28); }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const snow = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, map: softDot(), transparent: true, depthWrite: false }));
    snow.frustumCulled = false; scene.add(snow);
    world.snowUpdate = (cam, t, dt) => {
      for (let i = 0; i < N; i++) {
        let x = P[i * 3] + Math.sin(t * 0.7 + off[i]) * dt * 0.8, y = P[i * 3 + 1] - dt * 2.2, z = P[i * 3 + 2];
        // wrap inside a box that follows the camera
        x = wrap(x, cam.x, B); y = wrap(y, cam.y, B); z = wrap(z, cam.z, B);
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  world.update = (t, dt) => { for (const f of upd) f(t, dt); };
  return world;
}

const wrap = (v, c, B) => (v - c > B ? v - 2 * B : v - c < -B ? v + 2 * B : v);

let dotTex = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#ffffffaa'); gr.addColorStop(1, '#fff0');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

export function mergeGeos(geos) {
  // tiny non-indexed merge (avoids pulling BufferGeometryUtils for the trees)
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
