// GINGERFOLK: the town's civilians -- gingerbread people. Cookie-cutter bodies (extruded, softly bevelled), icing piping at
// wrists / ankles / neck, gumdrop buttons, icing-dot eyes and a piped mouth with swappable expressions. No skeleton: every
// limb is a pivot group, animated in code (idle sway, run, flail, cover-up).
import * as THREE from 'three';

export const FOLK = { cookie: ['#b86a30', '#a85e28', '#c47a3c'], icing: '#fff6ea', buttons: ['#e8303a', '#3aa85a', '#ffd23a', '#ff7ab8'] };

const mats = {
  cookie: new THREE.MeshStandardMaterial({ vertexColors: false, color: '#b86a30', roughness: 0.85 }),
  icing: new THREE.MeshStandardMaterial({ color: FOLK.icing, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a1610', roughness: 0.4 }),
  blush: new THREE.MeshBasicMaterial({ color: '#ff7a9a', transparent: true, opacity: 0.85 }),
};
const T = 0.13;   // cookie thickness
const ext = (shape, depth = T, bevel = 0.035) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.computeVertexNormals(); return g;
};
const capsule = (w, h) => { const s = new THREE.Shape(), r = w / 2; s.absarc(0, -h + r, r, Math.PI, 0, false); s.absarc(0, -r, r, 0, Math.PI, false); return s; };
const disc = r => { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; };
const geo = {
  head: ext(disc(0.2)),
  torso: (() => { const s = new THREE.Shape(); s.moveTo(-0.17, 0.12); s.quadraticCurveTo(-0.2, -0.1, -0.16, -0.32); s.lineTo(0.16, -0.32); s.quadraticCurveTo(0.2, -0.1, 0.17, 0.12); s.quadraticCurveTo(0, 0.2, -0.17, 0.12); return ext(s); })(),
  arm: ext(capsule(0.13, 0.36)),
  leg: ext(capsule(0.15, 0.38)),
  dot: new THREE.SphereGeometry(1, 10, 8),
  pipe: new THREE.TorusGeometry(1, 0.11, 6, 18, Math.PI * 0.9),
};

/** a gingerbread person ~1.1 m tall (scale 1), facing +Z, feet at y = 0 */
export function makeGingerPerson({ scale = 1, tint = 0, buttons = FOLK.buttons } = {}) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const cookie = mats.cookie.clone(); cookie.color.set(FOLK.cookie[tint % FOLK.cookie.length]);
  const m = (gg, mt, x = 0, y = 0, z = 0, s = 1, parent = body) => { const o = new THREE.Mesh(gg, mt); o.position.set(x, y, z); o.scale.setScalar(s); o.castShadow = true; parent.add(o); return o; };
  body.position.y = 0.74;
  // UPPER hinges at the hips (bend over / lean back); the legs stay on BODY
  const upper = new THREE.Group(); upper.position.y = -0.3; body.add(upper);
  m(geo.torso, cookie, 0, 0.3, 0, 1, upper);
  const head = new THREE.Group(); head.position.y = 0.63; upper.add(head);
  m(geo.head, cookie, 0, 0, 0, 1, head);
  // limbs on pivots (shoulders / hips)
  const limb = (gg, x, y, rz, parent = body) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.z = rz; parent.add(p); m(gg, cookie, 0, 0, 0, 1, p); return p; };
  const armL = limb(geo.arm, 0.17, 0.36, 0.9, upper), armR = limb(geo.arm, -0.17, 0.36, -0.9, upper);
  const legL = limb(geo.leg, 0.09, -0.3, 0.12), legR = limb(geo.leg, -0.09, -0.3, -0.12);
  // icing: squiggle cuffs, neck line, buttons
  const fz = T / 2 + 0.012;
  for (const [p, y] of [[armL, -0.27], [armR, -0.27], [legL, -0.29], [legR, -0.29]]) for (const s of [-1, 1]) {
    const c = m(geo.pipe, mats.icing, 0, y + s * 0.025, fz, 0.06, p); c.rotation.z = s > 0 ? 0 : Math.PI; c.scale.set(0.065, 0.03, 0.03);
  }
  for (let k = 0; k < 3; k++) m(geo.dot, new THREE.MeshStandardMaterial({ color: buttons[(k + tint) % buttons.length], roughness: 0.35 }), 0, 0.35 - k * 0.12, fz + 0.01, 0.035, upper);
  // face: eyes (icing whites + dark pupils), mouth (piped arc), blush (hidden until embarrassed)
  const face = new THREE.Group(); face.position.z = fz; head.add(face);
  const eyes = [-0.07, 0.07].map(x => { const e = new THREE.Group(); e.position.set(x, 0.04, 0); face.add(e); m(geo.dot, mats.icing, 0, 0, 0, 0.04, e).scale.z = 0.016; const p = m(geo.dot, mats.dark, 0, 0, 0.012, 0.022, e); p.scale.z = 0.009; return { e, p }; });
  const smile = m(geo.pipe, mats.icing, 0, -0.03, 0.004, 1, face); smile.rotation.z = Math.PI * 1.05; smile.scale.set(0.08, 0.06, 0.03);
  const oh = m(geo.dot, mats.dark, 0, -0.07, 0.01, 0.04, face); oh.scale.set(0.035, 0.045, 0.01); oh.visible = false;
  const blush = [-0.12, 0.12].map(x => { const b = m(new THREE.CircleGeometry(0.04, 12), mats.blush, x, -0.03, 0.006, 1, face); b.visible = false; return b; });
  g.scale.setScalar(scale);

  let mode = 'idle', t0 = Math.random() * 10;
  const self = {
    group: g, body, upper, head, armL, armR, legL, legR,
    /** 'happy' | 'shock' | 'embarrassed' */
    face(expr) {
      smile.visible = expr === 'happy'; oh.visible = expr !== 'happy';
      for (const b of blush) b.visible = expr === 'embarrassed';
      for (const { e } of eyes) e.scale.setScalar(expr === 'shock' ? 1.45 : 1);
    },
    /** 'idle' | 'run' | 'flail' | 'cover' (arms held across the front) | 'still' */
    pose(m) { mode = m; },
    look(dx, dy) { for (const { p } of eyes) p.position.set(dx * 0.012, dy * 0.012, 0.012); },
    update(dt) { t0 += dt; poseFolk(self, mode, t0); },
  };
  self.face('happy');
  return self;
}


/** the shared limb animation (both the full person and the lite crowd person). Modes: idle | run | flail | cover | still,
 *  b60 + 'tumble' (thrown by a blast: limbs whirling) and 'down' (flat on his back, arms + legs spread) */
function poseFolk(P, mode, t) {
  const { body, armL, armR, legL, legR } = P;
  if (mode === 'idle') { body.rotation.z = Math.sin(t * 1.6) * 0.04; armL.rotation.z = 0.9 + Math.sin(t * 1.6) * 0.08; armR.rotation.z = -0.9 - Math.sin(t * 1.6) * 0.08; legL.rotation.x = legR.rotation.x = 0; body.position.y = 0.74; }
  else if (mode === 'run') {   // stiff little cookie legs, big bounce, arms pumping
    const s = Math.sin(t * 16);
    legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7; armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
    armL.rotation.z = 0.5; armR.rotation.z = -0.5; body.position.y = 0.74 + Math.abs(Math.cos(t * 16)) * 0.08; body.rotation.z = s * 0.06;
  } else if (mode === 'flail') { armL.rotation.z = 2.4 + Math.sin(t * 22) * 0.5; armR.rotation.z = -2.4 - Math.sin(t * 22 + 1) * 0.5; body.rotation.z = Math.sin(t * 11) * 0.08; }
  else if (mode === 'cover') { armL.rotation.z = 2.6; armR.rotation.z = -2.6; armL.rotation.x = armR.rotation.x = -0.9; }
  else if (mode === 'tumble') {
    armL.rotation.set(Math.sin(t * 25) * 0.6, 0, 2.0 + Math.sin(t * 19) * 0.7); armR.rotation.set(Math.cos(t * 23) * 0.6, 0, -2.0 - Math.sin(t * 21) * 0.7);
    legL.rotation.set(Math.sin(t * 20) * 0.8, 0, 0.4); legR.rotation.set(-Math.sin(t * 20) * 0.8, 0, -0.4); body.position.y = 0.74;
  } else if (mode === 'down') { armL.rotation.set(0, 0, 1.6); armR.rotation.set(0, 0, -1.6); legL.rotation.set(0, 0, 0.45); legR.rotation.set(0, 0, -0.45); body.rotation.z = 0; body.position.y = 0.74; }
}

// ---- LITE (b60, the crowd that runs out of shot houses): same cookie + proportions, but each part is ONE vertex-coloured
// mesh (icing cuffs, buttons, eyes baked in) -- 8 meshes a person instead of ~33, no shadow casting. Built on first use.
const _c = new THREE.Color();
function bake(list) {   // [[geo, colour, Matrix4]] -> one non-indexed geometry with vertex colours (no util rand: layout-safe)
  const P = [], N = [], C = [];
  for (const [g0, col, m] of list) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(m); _c.set(col);
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) C.push(_c.r, _c.g, _c.b);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere(); return g;
}
const M4 = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));
let liteMat = null, liteGeo = null;
function liteGeos() {
  if (liteGeo) return liteGeo;
  liteMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const W = '#ffffff', fz = T / 2 + 0.012;
  const cuffs = y => [-1, 1].map(s => [geo.pipe, FOLK.icing, M4(0, y + s * 0.025, fz, 0.065, 0.03, 0.03, s > 0 ? 0 : Math.PI)]);
  liteGeo = {
    // cookie parts in WHITE x the per-person cookie colour is applied by tinting the vertex colours at build (see makeGingerLite)
    torso: [[geo.torso, W, M4(0, 0.3, 0)]],
    head: [[geo.head, W, M4()],
      ...[-0.07, 0.07].flatMap(x => [[geo.dot, FOLK.icing, M4(x, 0.04, fz, 0.058, 0.058, 0.023)], [geo.dot, '#2a1610', M4(x, 0.04, fz + 0.017, 0.032, 0.032, 0.013)]])],
    arm: [[geo.arm, W, M4()], ...cuffs(-0.27)],
    leg: [[geo.leg, W, M4()], ...cuffs(-0.29)],
    smile: bake([[geo.pipe, FOLK.icing, M4(0, -0.03, fz + 0.004, 0.08, 0.06, 0.03, Math.PI * 1.05)]]),
    oh: bake([[geo.dot, '#2a1610', M4(0, -0.075, fz + 0.01, 0.04, 0.05, 0.012)]]),
  };
  return liteGeo;
}
/** a crowd gingerbread person (~1.1 m), same API as makeGingerPerson: group, face(expr), pose(mode), update(dt) */
export function makeGingerLite({ tint = 0, scale = 1 } = {}) {
  const L = liteGeos(), cookie = FOLK.cookie[tint % FOLK.cookie.length];
  const part = (list, extra = []) => bake([...list.map(([g, col, m]) => [g, col === '#ffffff' ? cookie : col, m]), ...extra]);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.position.y = 0.74;
  const mesh = (geo2, parent, x = 0, y = 0) => { const o = new THREE.Mesh(geo2, liteMat); o.position.set(x, y, 0); parent.add(o); return o; };
  const upper = new THREE.Group(); upper.position.y = -0.3; body.add(upper);
  const fz = T / 2 + 0.012;
  mesh(part(L.torso, [0, 1, 2].map(k => [geo.dot, FOLK.buttons[(k + tint) % FOLK.buttons.length], M4(0, 0.35 - k * 0.12, fz + 0.01, 0.035)])), upper);
  const head = new THREE.Group(); head.position.y = 0.63; upper.add(head);
  mesh(part(L.head), head);
  const smile = mesh(L.smile, head), oh = mesh(L.oh, head);
  const armGeo = part(L.arm), legGeo = part(L.leg);
  const limb = (gg, x, y, rz, parent) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.z = rz; parent.add(p); mesh(gg, p); return p; };
  const armL = limb(armGeo, 0.17, 0.36, 0.9, upper), armR = limb(armGeo, -0.17, 0.36, -0.9, upper);
  const legL = limb(legGeo, 0.09, -0.3, 0.12, body), legR = limb(legGeo, -0.09, -0.3, -0.12, body);
  g.scale.setScalar(scale);
  let mode = 'idle', t0 = Math.random() * 10;
  const self = {
    group: g, body, upper, head, armL, armR, legL, legR,
    face(expr) { smile.visible = expr === 'happy'; oh.visible = expr !== 'happy'; },
    pose(m) { mode = m; }, get mode() { return mode; },
    update(dt) { t0 += dt; poseFolk(self, mode, t0); },
  };
  self.face('shock');
  return self;
}

// ---- CRACK (b69, his: "when you shoot the gingerbread men they should crack into lots of gingerbread pieces and fall on the
// ground"): the shard kit props.js throws. Jagged cookie prisms (toasted faces, a paler CRUMB side), one with a stripe of icing,
// the FACE piece (his head disc with the icing eyes + the shocked mouth), a gumdrop button. Vertex-coloured, built once; every
// cracked person shares these (one instanced draw per kind).
let crackKit = null;
const _jr = (k, a) => { const x = Math.sin(k * 127.1 + a * 311.7) * 43758.5453; return x - Math.floor(x); };   // fixed noise (no util rand)
function shardGeo(seed, iced) {
  const s = new THREE.Shape(), n = 5 + (seed % 3), R = 0.1;
  for (let i = 0; i < n; i++) {   // a broken-cookie outline: uneven radii + a sharp notch or two
    const a = (i + _jr(seed, i) * 0.6) / n * Math.PI * 2, r = R * (0.55 + _jr(seed, i + 9) * 0.65) * (i % 3 === 1 ? 0.7 : 1);
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.15) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r * 1.15);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });   // non-indexed already g.translate(0, 0, -T / 2); g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal, C = [];
  const face = new THREE.Color(FOLK.cookie[0]), crumb = new THREE.Color('#dca468'), icing = new THREE.Color(FOLK.icing);
  for (let i = 0; i < p.count; i++) {
    const front = Math.abs(nr.getZ(i)) > 0.7;
    const c = front ? face : crumb;
    C.push(c.r, c.g, c.b);
  }
  if (iced) {   // a piped icing bead across the front
    const bead = new THREE.CapsuleGeometry(0.022, 0.11, 3, 6).rotateZ(Math.PI / 2).toNonIndexed(); bead.translate(0, 0.01, T / 2 + 0.01);
    const P2 = [...p.array, ...bead.attributes.position.array], N2 = [...nr.array, ...bead.attributes.normal.array];
    for (let i = 0; i < bead.attributes.position.count; i++) C.push(icing.r, icing.g, icing.b);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return out;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.deleteAttribute('uv');
  return g;
}
/** the shared crack kit: { mat, shards: [geo x3 plain, geo iced], face, button }; colours are baked (the instance colour is a
 *  toast jitter, or a gumdrop colour for the buttons) */
export function gingerCrackKit() {
  if (crackKit) return crackKit;
  const L = liteGeos(), fz = T / 2 + 0.012;
  const face = bake([...L.head.map(([g, col, m]) => [g, col === '#ffffff' ? FOLK.cookie[0] : col, m]), [geo.dot, '#2a1610', M4(0, -0.075, fz + 0.01, 0.04, 0.05, 0.012)]]);
  crackKit = {
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    shards: [shardGeo(1, false), shardGeo(2, false), shardGeo(3, false), shardGeo(4, true)],
    face,
    button: (() => { const g = new THREE.SphereGeometry(0.04, 8, 6); g.scale(1, 1, 0.6); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); return g; })(),
  };
  return crackKit;
}
