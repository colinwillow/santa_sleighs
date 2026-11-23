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
  m(geo.torso, cookie);
  const head = new THREE.Group(); head.position.y = 0.33; body.add(head);
  m(geo.head, cookie, 0, 0, 0, 1, head);
  // limbs on pivots (shoulders / hips)
  const limb = (gg, x, y, rz) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.z = rz; body.add(p); m(gg, cookie, 0, 0, 0, 1, p); return p; };
  const armL = limb(geo.arm, 0.17, 0.06, 0.9), armR = limb(geo.arm, -0.17, 0.06, -0.9);
  const legL = limb(geo.leg, 0.09, -0.3, 0.12), legR = limb(geo.leg, -0.09, -0.3, -0.12);
  // icing: squiggle cuffs, neck line, buttons
  const fz = T / 2 + 0.012;
  for (const [p, y] of [[armL, -0.27], [armR, -0.27], [legL, -0.29], [legR, -0.29]]) for (const s of [-1, 1]) {
    const c = m(geo.pipe, mats.icing, 0, y + s * 0.025, fz, 0.06, p); c.rotation.z = s > 0 ? 0 : Math.PI; c.scale.set(0.065, 0.03, 0.03);
  }
  for (let k = 0; k < 3; k++) m(geo.dot, new THREE.MeshStandardMaterial({ color: buttons[(k + tint) % buttons.length], roughness: 0.35 }), 0, 0.05 - k * 0.12, fz + 0.01, 0.035);
  // face: eyes (icing whites + dark pupils), mouth (piped arc), blush (hidden until embarrassed)
  const face = new THREE.Group(); face.position.z = fz; head.add(face);
  const eyes = [-0.07, 0.07].map(x => { const e = new THREE.Group(); e.position.set(x, 0.04, 0); face.add(e); m(geo.dot, mats.icing, 0, 0, 0, 0.04, e).scale.z = 0.016; const p = m(geo.dot, mats.dark, 0, 0, 0.012, 0.022, e); p.scale.z = 0.009; return { e, p }; });
  const smile = m(geo.pipe, mats.icing, 0, -0.03, 0.004, 1, face); smile.rotation.z = Math.PI * 1.05; smile.scale.set(0.08, 0.06, 0.03);
  const oh = m(geo.dot, mats.dark, 0, -0.07, 0.01, 0.04, face); oh.scale.set(0.035, 0.045, 0.01); oh.visible = false;
  const blush = [-0.12, 0.12].map(x => { const b = m(new THREE.CircleGeometry(0.04, 12), mats.blush, x, -0.03, 0.006, 1, face); b.visible = false; return b; });
  g.scale.setScalar(scale);

  let mode = 'idle', t0 = Math.random() * 10;
  const self = {
    group: g, body, head, armL, armR, legL, legR,
    /** 'happy' | 'shock' | 'embarrassed' */
    face(expr) {
      smile.visible = expr === 'happy'; oh.visible = expr !== 'happy';
      for (const b of blush) b.visible = expr === 'embarrassed';
      for (const { e } of eyes) e.scale.setScalar(expr === 'shock' ? 1.45 : 1);
    },
    /** 'idle' | 'run' | 'flail' | 'cover' (arms held across the front) | 'still' */
    pose(m) { mode = m; },
    look(dx, dy) { for (const { p } of eyes) p.position.set(dx * 0.012, dy * 0.012, 0.012); },
    update(dt) {
      t0 += dt; const t = t0;
      if (mode === 'idle') { body.rotation.z = Math.sin(t * 1.6) * 0.04; armL.rotation.z = 0.9 + Math.sin(t * 1.6) * 0.08; armR.rotation.z = -0.9 - Math.sin(t * 1.6) * 0.08; legL.rotation.x = legR.rotation.x = 0; body.position.y = 0.74; }
      else if (mode === 'run') {   // stiff little cookie legs, big bounce, arms pumping
        const s = Math.sin(t * 16);
        legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7; armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
        armL.rotation.z = 0.5; armR.rotation.z = -0.5; body.position.y = 0.74 + Math.abs(Math.cos(t * 16)) * 0.08; body.rotation.z = s * 0.06;
      } else if (mode === 'flail') { armL.rotation.z = 2.4 + Math.sin(t * 22) * 0.5; armR.rotation.z = -2.4 - Math.sin(t * 22 + 1) * 0.5; body.rotation.z = Math.sin(t * 11) * 0.08; }
      else if (mode === 'cover') { armL.rotation.z = 2.6; armR.rotation.z = -2.6; armL.rotation.x = armR.rotation.x = -0.9; }
    },
  };
  self.face('happy');
  return self;
}
