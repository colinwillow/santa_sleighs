// The cozy snow diorama: dusk sky, rolling snow hills, a little village with glowing windows and
// chimney smoke, a big lit Christmas tree in the square, a frozen pond, pine forest, mountain ring, snowfall.
import * as THREE from 'three';

import { WORLD, VILLAGE_R, POND, groundH } from './terrain.js';
import { rand, rr, softDot, shadowProxy } from './util.js';
import { buildVillage } from './village.js';
import { makeProps } from './props.js';
import { buildKitShow } from './kitshow.js';
import { snowShader } from './ground.js';
import { foliageTex, snowTex, paintUV } from './paint.js';
import { fires, smoke } from './fx.js';
export { groundH, softDot, WORLD };

export function buildWorld(scene, camera, { mode = 'village' } = {}) {
  const upd = [];
  const world = { update: upd, chimneys: [], colliders: [], fireList: [], avoid: [] };
  world.props = makeProps(scene, world);   // b60: destructible cars / trees / gingerfolk (src/props.js)

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
  scene.fog = new THREE.FogExp2('#8a84b8', 0.0026);   // the haze: lavender, thick enough to soften the far village

  // moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false }));
  moon.position.set(-500, 420, -900);
  scene.add(moon);

  // ---- lights -----------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#9aa6ff', '#a07a92', 0.95));
  const moonLight = new THREE.DirectionalLight('#c9d6ff', 1.25);
  moonLight.position.set(-120, 200, -140);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  const sc = moonLight.shadow.camera; sc.left = sc.bottom = -110; sc.right = sc.top = 110; sc.far = 500;
  moonLight.shadow.bias = -0.0005; moonLight.shadow.normalBias = 0.4;
  scene.add(moonLight, moonLight.target);
  world.moonLight = moonLight;

  // ---- terrain ----------------------------------------------------------------------
  // b30: 120 segments (was 180: 64.8k -> 28.8k tris). The mesh is sampled from groundH, so the vertices sit exactly on it;
  // between them the mean gap to groundH went 2 cm -> 4 cm (worst spots at the pond rim / bowl edge). The village bowl is flat.
  const seg = 120;
  const tg = new THREE.PlaneGeometry(WORLD * 1.6, WORLD * 1.6, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, col = [];
  const cA = new THREE.Color('#e9eeff'), cB = new THREE.Color('#b4c0ec'), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundH(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2) * Math.cos(z * 0.11);
    tmp.copy(cA).lerp(cB, n * 0.55);
    col.push(tmp.r, tmp.g, tmp.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.computeVertexNormals();
  // hand-painted snow: a seamless brush map (~18 m a tile) under the shader's soft mottling + glints
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: snowTex(WORLD * 1.6 / 18) });
  groundMat.color.setScalar(1.06);
  const ground = new THREE.Mesh(tg, snowShader(groundMat));
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
    pine: new THREE.MeshStandardMaterial({ color: '#2f5d4a', roughness: 0.9, flatShading: true, map: foliageTex() }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a3b2a', roughness: 1, map: foliageTex() }),
    rock: new THREE.MeshStandardMaterial({ color: '#6c7192', roughness: 1, flatShading: true }),
  };

  // painted trees: the brush map averages ~0.89, so lift the colours back; tree snow gets its own painted copy
  M.pine.color.multiplyScalar(1.12); M.trunk.color.multiplyScalar(1.12);
  M.treeSnow = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.1), roughness: 0.9, map: foliageTex() });

  if (mode === 'kit') buildKitShow(scene, world); else buildVillage(scene, world);

  // ---- big Christmas tree in the square (the focal point) ----------------------------
  {
    const g = new THREE.Group();
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const r = 7 - i * 1.05, y = 2 + i * 3.1;
      const cone = new THREE.Mesh(paintUV(new THREE.ConeGeometry(r, 5, 9), 2.6, r * 0.6), M.pine);
      cone.position.y = y + 2.5; cone.castShadow = true; g.add(cone);
      const snowRim = new THREE.Mesh(paintUV(new THREE.ConeGeometry(r * 0.55, 1.3, 9), 2.6, r * 0.4), M.treeSnow);
      snowRim.position.y = y + 4.4; g.add(snowRim);
    }
    const trunk = new THREE.Mesh(paintUV(new THREE.CylinderGeometry(0.9, 1.1, 3, 8), 1.6, 1), M.trunk); trunk.position.y = 1.5; g.add(trunk);
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

  // ---- pine forest (instanced, snow-tipped) -------------------------------------------
  {
    const N = 900;
    const geos = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry(2.4 - i * 0.6, 3.2, 7); g.translate(0, 2 + i * 1.9, 0); geos.push(g);
    }
    const coneMesh = new THREE.InstancedMesh(paintUV(mergeGeos(geos), 2.2, 1.6), M.pine, N);
    // b30: the snow tip + trunk are open-ended (their ends sit inside the cone / under the ground): 14 -> 7 and 24 -> 12 tris
    const capMesh = new THREE.InstancedMesh(paintUV(new THREE.ConeGeometry(0.8, 1.1, 7, 1, true).translate(0, 7.05, 0), 2.2, 0.8), M.treeSnow, N);
    const trunkMesh = new THREE.InstancedMesh(paintUV(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6, 1, true).translate(0, 0.7, 0), 1.2, 0.5), M.trunk, N);
    // shadows come from an open 8-tri cone per tree (was the 42-tri tiers + 24-tri trunk)
    const shadowMesh = shadowProxy(scene, new THREE.ConeGeometry(2.4, 7.2, 8, 1, true).translate(0, 4.0, 0), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let n = 0;
    for (let tries = 0; n < N && tries < N * 6; tries++) {
      const x = rr(-WORLD * 0.75, WORLD * 0.75), z = rr(-WORLD * 0.75, WORLD * 0.75);
      const d = Math.hypot(x, z);
      if (d < VILLAGE_R + 14) continue;
      if (world.avoid.some(f => f(x, z))) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 8) continue;
      // clumps: density from a cheap noise
      if (Math.sin(x * 0.03) * Math.cos(z * 0.027) + Math.sin((x + z) * 0.011) < rr(-0.6, 0.9)) continue;
      const sc = rr(0.7, 1.7);
      p.set(x, groundH(x, z) - 0.2, z); q.setFromEuler(e.set(rr(-0.05, 0.05), rr(0, 6.28), rr(-0.05, 0.05))); s.set(sc, sc * rr(0.9, 1.25), sc);
      m4.compose(p, q, s);
      coneMesh.setMatrixAt(n, m4); capMesh.setMatrixAt(n, m4); trunkMesh.setMatrixAt(n, m4); shadowMesh.setMatrixAt(n, m4);
      world.props.addTree({ x, y: p.y, z, R: 2.4 * sc, h: 7.6 * s.y, m: m4.clone(), parts: [[coneMesh, n], [trunkMesh, n], [shadowMesh, n]], snow: [[capMesh, n]] });   // b60: destructible
      n++;
    }
    for (const im of [coneMesh, capMesh, trunkMesh]) { im.count = n; im.castShadow = false; im.receiveShadow = true; scene.add(im); }
    shadowMesh.count = n;
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

  // ---- chimney + fire-pit smoke, fires ----------------------------------------------------
  upd.push(smoke(scene, world.chimneys));
  upd.push(fires(scene, world.fireList, camera));

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

  world.tick = (t, dt) => { for (const f of upd) f(t, dt); };
  return world;
}

const wrap = (v, c, B) => (v - c > B ? v - 2 * B : v - c < -B ? v + 2 * B : v);

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
