// THE DELIVERY STREET (b56, his slice: "Sure, build a slice why not" -- DESIGN.md "THE GOAL: DELIVER THE PRESENTS" + "Paperboy angle").
// One street of 4 houses along the road loop: 3 GOOD (a glowing present floats over the chimney, warm windows, a wreath) and 1
// TAKEN-OVER (the TELLS: sickly green windows, green chimney smoke, a skull bauble over the chimney, a broken wreath, 2 snowmen
// hiding inside). From the sleigh, two drops: a PRESENT (from the stack on the sack) or an ORNAMENT BOMB; each leaves the sleigh
// with its velocity + gravity (a skill shot -- lead it). Within DELIVER.chimR of a chimney, coming down past its top = DOWN THE
// CHIMNEY; anything else lands on the roof / yard / road.
//   present -> good chimney: delivered (golden burst, windows flash, cheer, cookies)        bomb -> taken-over: roof blows off, snowmen out STUNNED
//   present -> taken-over: STOLEN (snatched, the snowmen burst out the door ANGRY)          bomb -> good: RUINED (roof off, windows dark, broken present)
//   a missed present sits in the snow (DELIVER.restLife s); a missed bomb goes off where it lands.
// All 3 delivered + the taken-over house cleared = fireworks over the street; ~8 s after every house is settled the next street
// is picked from 4 OTHER intact houses (wrecked ones stay wrecked). Cost: every icon / item / chimney kind is ONE instanced draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { groundH, VILLAGE_R } from './terrain.js';
import { softDot, bevBox } from './util.js';
import { ITEMS, placeAt } from './input.js';

export const DELIVER = {
  houses: 4, chimR: 2.2,          // m: horizontal radius round the chimney top that counts as DOWN THE CHIMNEY
  cd: 0.6, g: 16, drag: 0.12,     // s between drops; item gravity (m/s2); a little air drag on the drop (1/s)
  stack: 6, restLife: 10,         // presents on the sack; s a missed present sits in the snow
  resetAfter: 8,                  // s after the street is settled before the next one
  iconUp: 2.6,                    // m: icon height over the chimney top
  iconScale: 1.6,                 // icons are modelled ~1 m; drawn at this (they must read from the sleigh at 30-40 m)
  seed: [0, -45],                 // the first street starts at the house nearest this point (just up the road from the start)
  reach: 46,                      // m: next house of a street must be within this of the last one
  wreck: 0.75,                    // a waiting house under this share of its chunks is LOST (can't take a present any more)
  score: { deliver: 5, clear: 8, stolen: -3, ruined: -8 },
  bombR: 2.6,                     // m: a missed bomb's blast
};

// DROP-CAM (b67, his: "press and hold on it and the camera will tilt so you can see downwards... TAP to quick drop, or PRESS AND
// HOLD to get the camera to tilt and then let go = release"). PRESENT / BOMB buttons, keys Z / X, pad X / B: released before tapMs
// = drop now; held past tapMs = the chase camera eases (ease s, smoothstep) to up m over the sleigh, back m behind, looking down at
// lookK of the way from the sleigh to the LANDING MARKER (side m off to his right so the team doesn't hide it) (a soft ring where it would land if let go now: the drop's own ballistics
// + drag at step s, up to maxT s, onto the ground / road / a live roof chunk; it snaps gold over a chimney that would take it);
// the sleigh keeps flying. Let go = drop + the camera eases back. Slide the finger off the button (slideOff px past its edge) =
// cancel, nothing drops. camRate = how fast the camera chases the drop-cam pose (1/s, added to the chase's 4).
export const DROPCAM = { tapMs: 200, ease: 0.35, up: 18, back: 5, side: 5, lookK: 0.85, step: 1 / 120, maxT: 5, slideOff: 30, ring: 2.6, ringView: 0.12, camRate: 6,
  aimRate: 24, aimSide: 16, aimFwd: 12, aimCurve: 1.4, aimPx: 0.075 };
// b74 AIM THE DROP WITH THE RIGHT THUMB (his: "when you press and hold the drop and the aimer comes out, you're supposed to be able
// to AIM AROUND WITH YOUR RIGHT THUMB, then let go to drop"): while a drop is held (a PRESENT / BOMB button, or the draw gesture
// with the present / bomb equipped on the weapon ring), the right stick pushes the release velocity sideways / forward in the
// sleigh's frame -- aimRate m/s per s at full stick (curved by aimCurve), held within +-aimSide (his right +) and +-aimFwd (ahead +)
// m/s -- so the landing ring slides where the thumb pushes and STAYS when the thumb centres. The drop flies with it.
// b76 (CoD controls): the PRESENT / BOMB stickers sit ABOVE THE LEFT PAD (input.js ITEMS); held, a second finger dragged on the
// right half (input.js LOOK) slides the ring: aimPx m/s of release velocity per px (right = his right, up = ahead), same clamps.
// The gamepad's right stick still pushes it at aimRate.

const V3 = THREE.Vector3;
// ---- geometry: parts merged into one vertex-coloured mesh (baked top-front light so a MeshBasic glow still reads 3D) ---------
function part(geo, col, mul = 1, shade = true) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal, c = new THREE.Color(col), a = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const k = shade ? 0.6 + 0.4 * Math.min(1, Math.max(0, n.getY(i) * 0.65 + n.getZ(i) * 0.45 + 0.3)) : 1;
    a[i * 3] = c.r * k * mul; a[i * 3 + 1] = c.g * k * mul; a[i * 3 + 2] = c.b * k * mul;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s)));
/** a wrapped present, ~0.9 m: red box, gold ribbon both ways, a bow */
function presentGeo(hdr) {
  const box = hdr ? ['#ff3448', 1.12] : ['#d42438', 1], rib = hdr ? ['#ffd25a', 1.7] : ['#f4c040', 1];
  const P = [part(bevBox(0.9, 0.72, 0.9, 0.06, 1), ...box), part(new THREE.BoxGeometry(0.93, 0.74, 0.17), ...rib), part(new THREE.BoxGeometry(0.17, 0.74, 0.93), ...rib)];
  for (const s of [-1, 1]) P.push(part(at(new THREE.TorusGeometry(0.15, 0.05, 6, 12), s * 0.13, 0.47, 0, 0, s * 0.35, s * 0.55), ...rib));
  P.push(part(at(new THREE.SphereGeometry(0.075, 8, 6), 0, 0.42, 0), ...rib));
  return mergeGeometries(P, false);
}
/** the taken-over house's sign: a dark red glass bauble, glowing green eye holes, a jagged grin and a crack down its brow */
function skullGeo() {
  const R = 0.5, glow = ['#9dff4a', 2.2, false];
  const P = [part(new THREE.SphereGeometry(R, 16, 12), '#5e0c18', 1), part(at(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 10), 0, R + 0.03, 0), '#2e2a30'),
    part(at(new THREE.TorusGeometry(0.09, 0.03, 6, 10), 0, R + 0.17, 0), '#2e2a30')];
  for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.12, 10, 6); e.scale(1, 1.15, 0.45); P.push(part(at(e, s * 0.18, 0.06, R * 0.9), ...glow)); }
  const onS = (x, y, lift = 0.012) => new V3(x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y)) + lift);
  const seg = (a, b, w) => { const d = new V3().subVectors(b, a), g = new THREE.BoxGeometry(d.length() + w, w, w);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return part(g, ...glow); };
  const line = (pts, w) => { for (let i = 0; i < pts.length - 1; i++) P.push(seg(onS(...pts[i]), onS(...pts[i + 1]), w)); };
  line([[0.03, 0.47], [-0.06, 0.37], [0.05, 0.28], [-0.02, 0.2]], 0.04);                               // the crack down the brow
  line([[-0.24, -0.15], [-0.16, -0.24], [-0.08, -0.15], [0, -0.25], [0.08, -0.15], [0.16, -0.24], [0.24, -0.15]], 0.04);   // the grin
  return mergeGeometries(P, false);
}
function starGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.22 : 0.55; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }); g.translate(0, 0, -0.06);
  return part(g, '#ffd25a', 3);
}
export function bombGeo() {
  const P = [part(new THREE.SphereGeometry(0.36, 14, 10), '#e8263a'), part(at(new THREE.CylinderGeometry(0.11, 0.13, 0.13, 10), 0, 0.37, 0), '#f4c040'),
    part(at(new THREE.SphereGeometry(0.08, 8, 6), -0.13, 0.13, 0.3), '#ffd6dc', 1, false)];   // a glass highlight
  const pts = [new V3(0, 0.42, 0), new V3(0.04, 0.52, 0), new V3(0.12, 0.58, 0.02), new V3(0.18, 0.56, 0.03)];
  P.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.02, 5), '#3a2a20'));
  return mergeGeometries(P, false);
}
export const FUSE_TIP = new V3(0.18, 0.56, 0.03);

export function makeDelivery({ scene, world, rig, foot, snowmen, camera: cam = null, sfx = () => {}, puff = () => {}, onScore = () => {}, onShake = () => {} }) {
  const town = world.town;
  if (!town) return { update() {}, drop() { return false; }, street: [], dropCam: null };
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _e = new THREE.Euler();
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.15 });
  const inst = (geo, mat, n, parent = scene) => { const m = new THREE.InstancedMesh(geo, mat, n); for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO);
    m.setColorAt(0, new THREE.Color(1, 1, 1)); for (let i = 1; i < n; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
    m.frustumCulled = false; m.userData.noMerge = true; parent.add(m); return m; };
  const N = DELIVER.houses;
  // icons over the chimneys (slot i = street house i)
  const iconPresent = inst(presentGeo(true), glowMat, N), iconSkull = inst(skullGeo(), glowMat, N), iconStar = inst(starGeo(), glowMat, N);
  // a soft halo behind each icon (gold = wants a present, green = taken over)
  const haloG = new THREE.BufferGeometry(), haloP = new Float32Array(N * 3).fill(-999), haloC = new Float32Array(N * 3);
  haloG.setAttribute('position', new THREE.BufferAttribute(haloP, 3)); haloG.setAttribute('color', new THREE.BufferAttribute(haloC, 3));
  const halo = new THREE.Points(haloG, new THREE.PointsMaterial({ size: 6, map: softDot(), vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.frustumCulled = false; scene.add(halo);
  // wreaths on the doors: full + bowed (good), broken + dead (taken over)
  const wreathGeo = mergeGeometries([part(new THREE.TorusGeometry(0.34, 0.11, 6, 16), '#2f7a3a'), part(at(new THREE.SphereGeometry(0.1, 8, 6), 0, -0.34, 0.08), '#e8263a'),
    ...[0.6, 1.7, 2.9, 4.1, 5.2].map(a => part(at(new THREE.SphereGeometry(0.05, 6, 4), Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.1), '#ff4050', 1, false))], false);
  const brokenGeo = mergeGeometries([part(at(new THREE.TorusGeometry(0.34, 0.09, 5, 12, 4.4), 0, 0, 0, 0, 0, -0.9), '#3a3326'),
    part(at(new THREE.TorusGeometry(0.34, 0.08, 5, 4, 0.9), 0.05, -0.22, 0.04, 0.3, 0, 3.9), '#2c2a22')], false);
  const wreathGood = inst(wreathGeo, litMat, N), wreathBad = inst(brokenGeo, litMat, N);
  // a chimney on EVERY house (the target), hidden once the roof under it is gone
  const H = town.houses, NH = H.length;
  const chimStack = inst(part(bevBox(1, 1, 1, 0.08, 1), '#ffffff', 1, false), litMat, NH), chimCap = inst(part(bevBox(1.25, 0.2, 1.25, 0.07, 1), '#fff8f0'), litMat, NH);
  { const g = new THREE.Color('#b8673a'); for (let i = 0; i < NH; i++) chimStack.setColorAt(i, g.setHSL(0.06, 0.5, 0.42 + (i % 3) * 0.03)); }
  // dropped items
  const NI = 10, NB = 6;
  const itemPresent = inst(presentGeo(false), litMat, NI), itemBomb = inst(bombGeo(), glassMat, NB);
  // the stack on the sack (sleigh local): presents disappear as you drop them
  const STACK = [[-0.62, 2.28, -2.05, 0.2], [-0.15, 2.28, -2.25, -0.3], [0.55, 2.28, -2.1, 0.5], [-0.42, 2.72, -2.15, 0.9], [0.22, 2.72, -2.2, -0.6], [-0.1, 3.14, -2.18, 0.3]];
  const stackMesh = inst(presentGeo(false), litMat, DELIVER.stack, rig.sleigh.g);
  // sparks (trails, golden bursts, fireworks, the fuse): one additive points cloud
  const NS = 420, sP = new Float32Array(NS * 3).fill(-999), sC = new Float32Array(NS * 3), sV = Array.from({ length: NS }, () => new V3()), sL = new Float32Array(NS), sL0 = new Float32Array(NS).fill(1), sB = new Float32Array(NS * 3), sG = new Float32Array(NS);
  const sparkG = new THREE.BufferGeometry(); sparkG.setAttribute('position', new THREE.BufferAttribute(sP, 3)); sparkG.setAttribute('color', new THREE.BufferAttribute(sC, 3));
  const sparks = new THREE.Points(sparkG, new THREE.PointsMaterial({ size: 0.55, map: softDot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  let sI = 0; const _c = new THREE.Color();
  function spark(p, col, n, speed, life, { up = 0, grav = 6, size = 1, dir = null } = {}) {
    _c.set(col).multiplyScalar(size);
    for (let k = 0; k < n; k++) {
      const i = sI++ % NS; sP[i * 3] = p.x; sP[i * 3 + 1] = p.y; sP[i * 3 + 2] = p.z;
      sV[i].set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); if (sV[i].lengthSq() > 1) sV[i].normalize();
      sV[i].multiplyScalar(speed); sV[i].y += up; if (dir) sV[i].add(dir);
      sL[i] = sL0[i] = life * (0.6 + Math.random() * 0.6); sB[i * 3] = _c.r; sB[i * 3 + 1] = _c.g; sB[i * 3 + 2] = _c.b; sG[i] = grav;
    }
  }
  // green chimney smoke for the taken-over house (its grey plume is parked underground meanwhile)
  const GS = 16, gsP = new Float32Array(GS * 3).fill(-999), gsL = new Float32Array(GS).map(() => Math.random());
  const gsG = new THREE.BufferGeometry(); gsG.setAttribute('position', new THREE.BufferAttribute(gsP, 3));
  const greenSmoke = new THREE.Points(gsG, new THREE.PointsMaterial({ color: '#6dff4e', size: 2.8, map: softDot(), transparent: true, opacity: 0.5, depthWrite: false }));
  greenSmoke.frustumCulled = false; scene.add(greenSmoke);

  // ---- per-house geometry facts (house local: +z = the door side, roof slopes down to +-x) ----
  const roofY = (hs, x) => hs.roofBase + (hs.roofH - 0.1) * (1 - Math.abs(x) / (hs.roofW / 2));
  const facts = new Map();
  for (const hs of H) {
    const peak = hs.smoke.y - hs.gy - 0.6, cx = hs.W * 0.25, cz = -hs.D * 0.2, top = peak + 0.4, base = roofY(hs, cx + 0.55) - 0.2;
    facts.set(hs, { cx, cz, top, base, chim: new V3(cx, top, cz).applyMatrix4(hs.H), under: new V3(cx, roofY(hs, cx), cz).applyMatrix4(hs.H),
      smokeY: hs.smoke.y, front: new V3(Math.sin(hs.ry), 0, Math.cos(hs.ry)), door: new V3(0, 1.0, hs.D / 2).applyMatrix4(hs.H),
      wreath: new V3(0, 2.38, hs.D / 2 + 0.06).applyMatrix4(hs.H), chimOn: true });
  }
  function setChimney(i, on) {
    const hs = H[i], f = facts.get(hs); f.chimOn = on;
    if (!on) { chimStack.setMatrixAt(i, ZERO); chimCap.setMatrixAt(i, ZERO); }
    else {
      _q.setFromAxisAngle(new V3(0, 1, 0), hs.ry);
      chimStack.setMatrixAt(i, _m.compose(new V3(f.cx, (f.base + f.top) / 2, f.cz).applyMatrix4(hs.H), _q, _s.set(0.95, f.top - f.base, 0.95)));
      chimCap.setMatrixAt(i, _m.compose(new V3(f.cx, f.top, f.cz).applyMatrix4(hs.H), _q, _s.set(1, 1, 1)));
    }
    chimStack.instanceMatrix.needsUpdate = chimCap.instanceMatrix.needsUpdate = true;
  }
  H.forEach((hs, i) => setChimney(i, true));
  const roofIntact = hs => !hs.dead && town.solidAt(facts.get(hs).under);

  // ---- the street ----
  const used = new Set();
  let street = [], first = true, resetT = -1, celebT = -1, fireT = 0, cd = 0, stack = DELIVER.stack, flickT = 0, checkT = 0, hudKey = '';
  function pickStreet() {
    const ok = hs => !hs.dead && hs.alive / hs.total > 0.92 && !used.has(hs) && Math.hypot(hs.x, hs.z) < VILLAGE_R && roofIntact(hs);
    let cands = H.filter(ok);
    if (cands.length < N) { used.clear(); cands = H.filter(ok); }
    if (!cands.length) return [];
    const sp = first ? new V3(DELIVER.seed[0], 0, DELIVER.seed[1]) : rig.S.clone().addScaledVector(rig.fwd, 60);
    const d2 = (hs, p) => (hs.x - p.x) ** 2 + (hs.z - p.z) ** 2;
    const out = [cands.reduce((a, b) => d2(a, sp) < d2(b, sp) ? a : b)];
    while (out.length < N) {
      const last = out[out.length - 1], rest = cands.filter(h => !out.includes(h)); if (!rest.length) break;
      const near = rest.filter(h => d2(h, last) < DELIVER.reach ** 2);
      const pool = near.length ? near : rest, ref = near.length ? last : out[0];
      out.push(pool.reduce((a, b) => d2(a, ref) < d2(b, ref) ? a : b));
    }
    first = false;
    const bad = 1 + Math.floor(Math.random() * (out.length - 1));   // never the first one he reaches
    return out.map((hs, i) => ({ hs, f: facts.get(hs), slot: i, bad: i === bad, state: 'wait', flash: 0, starT: -1, brokenT: -1, smokeHidden: false }));
  }
  function setTells(h, on) {
    const hs = h.hs;
    if (on) { if (!h.smokeHidden) { hs.smoke.y = -999; h.smokeHidden = true; } }
    else { if (h.smokeHidden) { hs.smoke.y = h.f.smokeY; h.smokeHidden = false; } town.tintWindows(hs, null); }
    wreathBad.setMatrixAt(h.slot, on ? _m.compose(h.f.wreath, _q.setFromAxisAngle(new V3(0, 1, 0), hs.ry), _s.set(1, 1, 1)) : ZERO); wreathBad.instanceMatrix.needsUpdate = true;
  }
  function begin() {
    street = pickStreet(); resetT = -1; celebT = -1; stack = DELIVER.stack;
    for (const h of street) {
      used.add(h.hs);
      if (h.bad) setTells(h, true);
      else { wreathGood.setMatrixAt(h.slot, _m.compose(h.f.wreath, _q.setFromAxisAngle(new V3(0, 1, 0), h.hs.ry), _s.set(1, 1, 1))); }
    }
    wreathGood.instanceMatrix.needsUpdate = true;
  }
  function end() {
    for (const h of street) { if (h.bad && h.state === 'wait') setTells(h, false); else if (h.smokeHidden) setTells(h, false); if (h.state === 'done') town.tintWindows(h.hs, null); }
    for (let i = 0; i < N; i++) { iconPresent.setMatrixAt(i, ZERO); iconSkull.setMatrixAt(i, ZERO); iconStar.setMatrixAt(i, ZERO); wreathGood.setMatrixAt(i, ZERO); wreathBad.setMatrixAt(i, ZERO); }
    wreathGood.instanceMatrix.needsUpdate = wreathBad.instanceMatrix.needsUpdate = true;
  }

  // ---- big moments ----
  function blowRoof(h) {
    const hs = h.hs;
    for (const z of [-hs.D * 0.3, 0, hs.D * 0.3]) for (const x of [-hs.W * 0.22, hs.W * 0.22]) {
      const p = new V3(x, roofY(hs, x), z).applyMatrix4(hs.H);
      town.blast(p, 3.5, 99, new V3((p.x - hs.x) * 1.6, 15, (p.z - hs.z) * 1.6));
    }
    const c = new V3(hs.x, hs.gy + hs.roofBase + 1.5, hs.z);
    puff(c, '#ffb050', 22, 11, 0.55); puff(c, '#3a3440', 16, 7, 1.8); spark(c, '#ffb050', 50, 12, 0.9, { up: 6, grav: 12, size: 2.5 });
    sfx('explosion', { vol: 1, rate: 0.8 }); sfx('explosion', { vol: 0.7, rate: 0.6 }); sfx('debris', { vol: 1, rate: 0.7 });
    onShake(1.2); setChimney(H.indexOf(hs), false);
  }
  function burstOut(h, stunned) {
    const hs = h.hs, f = h.f, side = new V3(f.front.z, 0, -f.front.x);
    for (const s of [-1, 1]) {
      let pos, vel;
      if (stunned) { pos = new V3(hs.x, hs.gy + hs.wallH + 0.5, hs.z).addScaledVector(side, s * hs.W * 0.2); vel = f.front.clone().multiplyScalar(5.5).addScaledVector(side, s * 3.5).setY(11); }
      else { pos = f.door.clone().addScaledVector(f.front, 0.6).addScaledVector(side, s * 0.6); pos.y = hs.gy + 0.3; vel = f.front.clone().multiplyScalar(8).addScaledVector(side, s * 2.5).setY(6.5); }
      snowmen?.spawn?.(pos, Math.atan2(f.front.x, f.front.z) + s * 0.4, { stunned, vel });
    }
  }
  function star(h) { h.starT = 0; }
  function resolveChimney(it, h) {
    const hs = h.hs, top = h.f.chim;
    if (h.state !== 'wait') { puff(top, '#ffffff', 6, 2, 0.6); return; }   // already settled: it just drops in
    if (it.kind === 'present' && !h.bad) {          // DELIVERED
      h.state = 'done'; h.flash = 1; star(h);
      spark(top, '#ffd25a', 60, 4, 1.3, { up: 9, grav: 7, size: 2.6 }); spark(top, '#fff2c0', 24, 2, 0.8, { up: 5, grav: 3, size: 3 });
      puff(top, '#ffd060', 10, 3, 0.9);
      sfx('cookie_pickup', { vol: 1, rate: 1.0 }); sfx('ui_start', { vol: 0.8, rate: 1.15 }); setTimeout(() => sfx('cookie_pickup', { vol: 0.7, rate: 1.5 }), 160);
      rig.crew?.react?.('cheer'); onScore(DELIVER.score.deliver);
    } else if (it.kind === 'bomb' && h.bad) {       // CLEARED: the roof blows off, its snowmen come out dazed
      h.state = 'cleared'; star(h);
      blowRoof(h); setTells(h, false);
      puff(top, '#6dff4e', 22, 6, 1.6); puff(top, '#b8ffb0', 16, 8, 1.4); puff(top, '#ffffff', 22, 9, 1.8);
      burstOut(h, true); rig.crew?.react?.('cheer'); onScore(DELIVER.score.clear);
    } else if (it.kind === 'present' && h.bad) {    // STOLEN: snatched down, the snowmen burst out the door ANGRY
      h.state = 'stolen'; setTells(h, false);
      snatch.push({ p: top.clone(), t: 0 });
      puff(top, '#6dff4e', 16, 3, 1.4); sfx('ui_back', { vol: 1, rate: 0.5 }); setTimeout(() => sfx('cookie_pickup', { vol: 0.8, rate: 0.42 }), 220);
      setTimeout(() => { town.blast(h.f.door, 1.9, 99, h.f.front.clone().multiplyScalar(9)); sfx('debris', { vol: 1, rate: 0.8 }); onShake(0.6); burstOut(h, false); }, 650);
      onScore(DELIVER.score.stolen);
    } else {                                        // RUINED: a bomb down a good chimney
      h.state = 'ruined'; h.brokenT = 0;
      blowRoof(h); town.tintWindows(hs, new THREE.Color(0.03, 0.03, 0.05));
      setTimeout(() => sfx('ui_back', { vol: 1, rate: 0.55 }), 300);
      onScore(DELIVER.score.ruined);
    }
  }

  // ---- items ----
  const items = [], snatch = [];
  function explode(p, r) {
    town.blast(p, r, 99, new V3(0, 8, 0)); snowmen?.blast?.(p, r + 0.6, 99);
    puff(p, '#ffb050', 16, 9, 0.5); puff(p, '#3a3440', 12, 5, 1.6); puff(p, '#ffffff', 12, 8, 1.1); spark(p, '#ff9a3a', 36, 10, 0.8, { up: 4, grav: 12, size: 2.4 });
    sfx('explosion', { vol: 0.9 }); onShake(0.8);
  }
  function drop(kind, off = { x: 0, z: 0 }) {
    if (cd > 0 || foot.active || !document.body.classList.contains('play')) return false;
    if (kind === 'present' && stack <= 0) { sfx('ui_back', { vol: 0.5, rate: 1.4 }); return false; }
    if (items.filter(i => i.kind === kind).length >= (kind === 'present' ? NI : NB)) items.splice(items.findIndex(i => i.kind === kind), 1);
    cd = DELIVER.cd;
    rig.sleigh.g.updateMatrixWorld();
    let from;
    if (kind === 'present') { stack--; const s = STACK[stack]; from = rig.sleigh.g.localToWorld(new V3(s[0], s[1], s[2])); }
    else from = rig.sleigh.g.localToWorld(new V3(0.6, 2.4, -2.3));
    const v = addOff(rig.SV.clone(), off); v.y -= 1.2;
    items.push({ kind, p: from, v, rot: new V3(Math.random() * 6, Math.random() * 6, 0), spin: new V3(Math.random() * 8 - 4, Math.random() * 6 - 3, Math.random() * 8 - 4), state: 'fly', life: 14, trailT: 0 });
    sfx('whoosh', { vol: 0.6, rate: kind === 'bomb' ? 1.0 : 1.4 }); if (kind === 'bomb') sfx('casing', { vol: 0.5, rate: 0.6 });
    return true;
  }
  // ---- DROP-CAM: hold a drop button -> look down + the landing marker; release = drop ------------------------------------
  const hold = { kind: null, t: 0, src: null, btn: null, lin: 0, k: 0, land: new V3(), hit: false, chim: false, off: { x: 0, z: 0 } };
  /** the drop's extra release velocity (his right x, ahead z, sleigh frame) added to `v` */
  const addOff = (v, off = hold.off) => { const f = Math.sin(rig.yaw), c = Math.cos(rig.yaw); v.x += -c * off.x + f * off.z; v.z += f * off.x + c * off.z; return v; };
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const ringAt = (r, w, col) => { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.lineWidth = w; x.strokeStyle = col; x.stroke(); };
    ringAt(104, 22, 'rgba(29,20,32,0.85)'); ringAt(104, 11, '#ffffff');                       // ink-edged ring (reads on white snow)
    x.setLineDash([16, 14]); ringAt(64, 9, 'rgba(29,20,32,0.7)'); ringAt(64, 4, 'rgba(255,255,255,0.9)'); x.setLineDash([]);
    x.beginPath(); x.arc(128, 128, 15, 0, Math.PI * 2); x.fillStyle = 'rgba(29,20,32,0.85)'; x.fill();
    x.beginPath(); x.arc(128, 128, 9, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  ring.renderOrder = 20; ring.frustumCulled = false; ring.visible = false; ring.userData.noMerge = true; scene.add(ring);
  const _pv = new V3(), _pp = new V3(), _pq = new V3();
  /** where a drop of `kind` released now would land (same launch + integration as drop() / updateItems) -> hold.land, .chim */
  function predict(kind) {
    rig.sleigh.g.updateMatrixWorld();
    if (kind === 'present') { const s = STACK[Math.max(0, stack - 1)]; rig.sleigh.g.localToWorld(_pp.set(s[0], s[1], s[2])); }
    else rig.sleigh.g.localToWorld(_pp.set(0.6, 2.4, -2.3));
    _pv.copy(rig.SV); addOff(_pv); _pv.y -= 1.2;
    const h = DROPCAM.step, k = Math.exp(-DELIVER.drag * h);
    hold.chim = false; hold.hit = false;
    for (let t = 0; t < DROPCAM.maxT; t += h) {
      const py = _pp.y;
      _pv.y -= DELIVER.g * h; _pv.x *= k; _pv.z *= k; _pq.copy(_pp); _pp.addScaledVector(_pv, h);
      for (const hh of street) {
        const c = hh.f.chim;
        if (hh.state === 'wait' && hh.f.chimOn && py > c.y && _pp.y <= c.y && (_pp.x - c.x) ** 2 + (_pp.z - c.z) ** 2 < DELIVER.chimR ** 2) { hold.land.set(c.x, c.y + 0.15, c.z); hold.chim = true; hold.hit = true; return; }
      }
      const gy = Math.max(groundH(_pp.x, _pp.z), world.roadTop ? world.roadTop(_pp.x, _pp.z) : -1e9);
      if (_pp.y < gy + 0.3) { hold.land.set(_pp.x, gy + 0.08, _pp.z); hold.hit = true; return; }
      if (town.solidAt(_pp)) { hold.land.copy(_pq); hold.hit = true; return; }
    }
    hold.land.copy(_pp);
  }
  const holdBtn = kind => kind === 'present' ? bP : bB;
  function holdStart(kind, src) {
    if (hold.kind || foot.active || !document.body.classList.contains('play')) return;
    hold.kind = kind; hold.src = src; hold.t = 0; hold.off.x = hold.off.z = 0; holdBtn(kind)?.classList.add('on');
  }
  function holdEnd(fire) {
    if (!hold.kind) return;
    const k = hold.kind; hold.kind = null; holdBtn(k)?.classList.remove('on');
    if (fire) drop(k, { ...hold.off });
    hold.off.x = hold.off.z = 0;
  }
  /** b76: a LOOK drag (px) slides the landing ring (screen right = his right, screen up = ahead) */
  function aimDropPx(dx, dy) {
    if (!hold.kind) return;
    hold.off.x = THREE.MathUtils.clamp(hold.off.x + dx * DROPCAM.aimPx, -DROPCAM.aimSide, DROPCAM.aimSide);
    hold.off.z = THREE.MathUtils.clamp(hold.off.z - dy * DROPCAM.aimPx, -DROPCAM.aimFwd, DROPCAM.aimFwd);
  }
  /** the right stick while a drop is held: push the landing point (x = his right, y = ahead; -1..1) */
  function aimDrop(x, y, dt) {
    if (!hold.kind) return;
    const c = v => Math.sign(v) * Math.pow(Math.abs(v), DROPCAM.aimCurve), r = DROPCAM.aimRate * dt;
    hold.off.x = THREE.MathUtils.clamp(hold.off.x + c(x) * r, -DROPCAM.aimSide, DROPCAM.aimSide);
    hold.off.z = THREE.MathUtils.clamp(hold.off.z + c(y) * r, -DROPCAM.aimFwd, DROPCAM.aimFwd);
  }
  function updateHold(dt) {
    if (hold.kind && (foot.active || !document.body.classList.contains('play'))) holdEnd(false);
    if (hold.kind) hold.t += dt;
    const aiming = !!hold.kind && hold.t * 1000 >= DROPCAM.tapMs;
    hold.lin = THREE.MathUtils.clamp(hold.lin + (aiming ? 1 : -1) * dt / DROPCAM.ease, 0, 1);
    hold.k = hold.lin * hold.lin * (3 - 2 * hold.lin);
    if (aiming) predict(hold.kind);
    ring.visible = aiming && hold.hit;
    if (ring.visible) {
      // sized on screen: at least `ring` m, else ringView x its distance from the camera (it stays ~4 deg wide from 70 m up)
      const pulse = 1 + Math.sin(performance.now() / 1000 * 7) * 0.08, dist = cam ? cam.position.distanceTo(hold.land) : 40;
      const sc = Math.max(DROPCAM.ring, dist * DROPCAM.ringView) * (hold.chim ? 1.3 : 1) * pulse * (0.6 + 0.4 * hold.k);
      ring.position.copy(hold.land); ring.scale.setScalar(sc); ring.rotation.y += 0.02;
      ring.material.color.set(hold.chim ? (hold.kind === 'present' ? '#ffe24a' : '#9dff4a') : hold.kind === 'present' ? '#ffffff' : '#ff6a4a');
    }
    document.body.classList.toggle('dropaim', aiming);
  }
  /** the drop-cam pose (main.js blends the chase camera into it by dropCam.k) */
  const dropCam = {
    get k() { return hold.k; }, get aiming() { return !!hold.kind && hold.t * 1000 >= DROPCAM.tapMs; }, get land() { return hold.hit ? hold.land : null; },
    pose(pos, look) {
      const f = _pq.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw));
      pos.copy(rig.S).addScaledVector(f, -DROPCAM.back); pos.x -= f.z * DROPCAM.side; pos.z += f.x * DROPCAM.side; pos.y += DROPCAM.up;   // right = (-fz, fx)
      if (hold.hit || hold.kind) look.copy(rig.S).lerp(hold.land, DROPCAM.lookK); else look.copy(rig.S).addScaledVector(f, 20).setY(rig.S.y - 30);
      return pos;
    },
  };

  function updateItems(dt) {
    const steps = 4, h_ = dt / steps;
    for (let n = items.length - 1; n >= 0; n--) {
      const it = items[n];
      it.life -= dt;
      if (it.state === 'rest') { if (it.life <= 0) items.splice(n, 1); continue; }
      let gone = false;
      for (let s = 0; s < steps && !gone; s++) {
        const py = it.p.y;
        it.v.y -= DELIVER.g * h_; const k = Math.exp(-DELIVER.drag * h_); it.v.x *= k; it.v.z *= k;
        it.p.addScaledVector(it.v, h_);
        for (const h of street) {
          const c = h.f.chim;
          if (py > c.y && it.p.y <= c.y && (it.p.x - c.x) ** 2 + (it.p.z - c.z) ** 2 < DELIVER.chimR ** 2 && h.f.chimOn) { resolveChimney(it, h); gone = true; break; }
        }
        if (gone) { items.splice(n, 1); break; }
        const gy = Math.max(groundH(it.p.x, it.p.z), world.roadTop ? world.roadTop(it.p.x, it.p.z) : -1e9);
        const solid = town.solidAt(it.p);
        if (it.p.y < gy + 0.3 || solid || it.life <= 0) {
          if (it.kind === 'bomb') { explode(it.p.clone(), DELIVER.bombR); items.splice(n, 1); gone = true; }
          else { if (!solid) it.p.y = gy + 0.36; it.state = 'rest'; it.life = DELIVER.restLife; it.rot.set(0, it.rot.y, 0); puff(it.p, '#ffffff', 8, 3, 0.7); sfx('snow_puff', { vol: 0.6, rate: 1.2 }); }
          break;
        }
      }
      if (gone || it.state !== 'fly') continue;
      it.rot.addScaledVector(it.spin, dt);
      it.trailT -= dt;
      if (it.trailT <= 0) {
        it.trailT = 0.03;
        if (it.kind === 'present') spark(it.p, '#ffd25a', 1, 0.4, 0.5, { grav: 0, size: 1.8 });
        else { _p.copy(FUSE_TIP).applyEuler(_e.set(it.rot.x, it.rot.y, it.rot.z)).add(it.p); spark(_p, '#ffb040', 2, 1.5, 0.35, { up: 1, grav: 2, size: 3 }); }
      }
    }
    // draw
    let ip = 0, ib = 0;
    for (const it of items) {
      const sc = it.state === 'rest' ? Math.min(1, it.life) * 0.7 : 0.7;
      _m.compose(it.p, _q.setFromEuler(_e.set(it.rot.x, it.rot.y, it.rot.z)), _s.setScalar(it.kind === 'present' ? sc : 1));
      if (it.kind === 'present') itemPresent.setMatrixAt(ip++, _m); else itemBomb.setMatrixAt(ib++, _m);
    }
    for (const sn of snatch) {   // a stolen present pops back up out of the chimney ... then gets yanked down inside
      sn.t += dt; const u = sn.t / 0.7, y = u < 0.55 ? Math.sin(u / 0.55 * Math.PI / 2) * 1.1 : 1.1 - ((u - 0.55) / 0.45) ** 2 * 2.4;
      _m.compose(_p.copy(sn.p).setY(sn.p.y + y), _q.setFromEuler(_e.set(Math.sin(sn.t * 30) * 0.3, sn.t * 4, 0)), _s.setScalar(0.7));
      if (ip < NI) itemPresent.setMatrixAt(ip++, _m);
    }
    for (let i = snatch.length - 1; i >= 0; i--) if (snatch[i].t > 0.7) snatch.splice(i, 1);
    for (let i = ip; i < NI; i++) itemPresent.setMatrixAt(i, ZERO);
    for (let i = ib; i < NB; i++) itemBomb.setMatrixAt(i, ZERO);
    itemPresent.instanceMatrix.needsUpdate = itemBomb.instanceMatrix.needsUpdate = true;
  }

  // ---- HUD: the counter pill + the two drop buttons -------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
  #deliv { position: fixed; z-index: 6; left: 50%; top: calc(env(safe-area-inset-top) + 50px); transform: translateX(-50%) rotate(-1.5deg);
    display: flex; align-items: center; gap: 5px; font: italic 900 14px/1 ui-rounded, "SF Pro Rounded", system-ui, sans-serif; color: var(--ink);
    background: var(--cream); border: 2.5px solid var(--ink); border-radius: 13px 16px 12px 15px / 15px 12px 16px 13px; padding: 3px 9px 3px 7px; box-shadow: 2px 3px 0 var(--ink); }
  #deliv svg { width: 20px; height: 20px; display: block; } #deliv .sk { margin-left: 6px; } #deliv .ok { color: #2a9a50; } #deliv .no { color: var(--candy); }
  #deliv.win { background: var(--gold); }
  .dropb { width: 62px; height: 62px; z-index: 7; } .dropb svg { width: 36px; height: 36px; display: block; }
  #dropPresent { transform: rotate(4deg);
    border-radius: 52% 48% 47% 53% / 47% 53% 47% 53%; background: radial-gradient(circle at 34% 28%, #fff6dc 0 14%, transparent 15%), var(--gold); box-shadow: inset 0 0 0 3px #ffe39a, 3px 4px 0 var(--ink); }
  #dropBomb { transform: rotate(-4deg);
    border-radius: 48% 52% 53% 47% / 53% 47% 53% 47%; background: radial-gradient(circle at 34% 28%, #9d8ad8 0 14%, transparent 15%), #5a3d96; box-shadow: inset 0 0 0 3px #8a74c8, 3px 4px 0 var(--ink); }
  #dropPresent.on { transform: rotate(4deg) translate(2px, 3px) scale(.94); box-shadow: 1px 1px 0 var(--ink); }
  #dropBomb.on { transform: rotate(-4deg) translate(2px, 3px) scale(.94); box-shadow: 1px 1px 0 var(--ink); }
  .dropb .n { position: absolute; right: -6px; top: -6px; min-width: 20px; height: 20px; border-radius: 50%; background: var(--candy); color: var(--cream);
    border: 2.5px solid var(--ink); font: italic 900 12px/20px ui-rounded, system-ui, sans-serif; text-align: center; text-shadow: none; }
  .dropb.empty { opacity: .45; }
  body:not(.play) #deliv, body:not(.play) .dropb, body.onfoot .dropb { display: none !important; }`;
  document.head.appendChild(css);
  const GIFT = `<svg viewBox="0 0 30 30"><rect x="4" y="11" width="22" height="16" rx="2.5" fill="#e8263a" stroke="#1d1420" stroke-width="2.4"/><rect x="2.5" y="7.5" width="25" height="5.5" rx="2" fill="#ff4a5c" stroke="#1d1420" stroke-width="2.4"/><path d="M15 7.5V27" stroke="#1d1420" stroke-width="6.5"/><path d="M15 7.5V27" stroke="#f4c040" stroke-width="3"/><path d="M15 7.5c-2-4.5-8-5-7.5-1.6.3 2 4.6 1.6 7.5 1.6zM15 7.5c2-4.5 8-5 7.5-1.6-.3 2-4.6 1.6-7.5 1.6z" fill="#f4c040" stroke="#1d1420" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const BOMB = `<svg viewBox="0 0 30 30"><circle cx="14" cy="18" r="9.5" fill="#e8263a" stroke="#1d1420" stroke-width="2.4"/><ellipse cx="10.6" cy="14.6" rx="2.6" ry="1.8" fill="#ffd0d6" transform="rotate(-35 10.6 14.6)"/><rect x="10.5" y="6.5" width="7" height="4.2" rx="1.2" fill="#f4c040" stroke="#1d1420" stroke-width="2"/><path d="M14 6.5c0-3 2.5-4 5-3.2" fill="none" stroke="#1d1420" stroke-width="2.2" stroke-linecap="round"/><path d="M21.6 1.2l.9 2.2 2.3.2-1.8 1.4.7 2.3-2.1-1.3-2 1.3.6-2.3-1.8-1.4 2.3-.2z" fill="#ffe14a" stroke="#1d1420" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  const SKULL = `<svg viewBox="0 0 30 30"><rect x="12" y="2" width="6" height="4" rx="1" fill="#2e2a30" stroke="#1d1420" stroke-width="1.8"/><circle cx="15" cy="17" r="11" fill="#6a1020" stroke="#1d1420" stroke-width="2.4"/><ellipse cx="11" cy="15.5" rx="2.6" ry="3" fill="#9dff4a"/><ellipse cx="19" cy="15.5" rx="2.6" ry="3" fill="#9dff4a"/><path d="M9.5 21.5l2 1.8 1.8-1.8 1.7 1.8 1.8-1.8 1.7 1.8 2-1.8" fill="none" stroke="#9dff4a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const hud = document.getElementById('hud');
  const pill = document.createElement('div'); pill.id = 'deliv'; hud.appendChild(pill);
  const mkBtn = (id, svg, kind) => {
    const b = document.createElement('div'); b.className = 'btn dropb'; b.id = id; b.innerHTML = svg + (kind === 'present' ? '<span class="n">6</span>' : ''); hud.appendChild(b);
    // DROP-CAM: down = hold starts; up = drop (tap or hold); sliding off the button = cancel
    let pid = null;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (hold.kind) return; pid = e.pointerId; try { b.setPointerCapture(pid); } catch (_) {} holdStart(kind, 'ptr'); });
    b.addEventListener('pointermove', e => {
      if (e.pointerId !== pid || hold.kind !== kind || hold.src !== 'ptr') return;
      const r = b.getBoundingClientRect(), m = ITEMS.slideOff;
      if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) { pid = null; holdEnd(false); }
    });
    const up = fire => e => { if (e.pointerId !== pid) return; pid = null; if (hold.kind === kind && hold.src === 'ptr') holdEnd(fire); };
    b.addEventListener('pointerup', up(true)); b.addEventListener('pointercancel', up(false));
    return b;
  };
  const bP = mkBtn('dropPresent', GIFT, 'present'), bB = mkBtn('dropBomb', BOMB, 'bomb'), bPn = bP.querySelector('.n');
  [bP, bB].forEach((b, i) => placeAt(b, ITEMS.x + i * ITEMS.gap, ITEMS.y + i * ITEMS.stagger, ITEMS.size, true));   // b76: above the LEFT pad
  const KEYS = { KeyZ: 'present', KeyX: 'bomb' };
  addEventListener('keydown', e => { if (e.repeat || !KEYS[e.code]) return; holdStart(KEYS[e.code], 'key'); });
  addEventListener('keyup', e => { if (KEYS[e.code] && hold.kind === KEYS[e.code] && hold.src === 'key') holdEnd(true); });
  let gpX = false, gpB = false;
  function pollPad() {
    const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return;
    const x = !!gp.buttons[2]?.pressed, b = !!gp.buttons[1]?.pressed;
    if (x && !gpX) holdStart('present', 'pad'); if (b && !gpB) holdStart('bomb', 'pad');
    if (!x && gpX && hold.kind === 'present' && hold.src === 'pad') holdEnd(true); if (!b && gpB && hold.kind === 'bomb' && hold.src === 'pad') holdEnd(true);
    gpX = x; gpB = b;
  }
  function updateHud() {
    const good = street.filter(h => !h.bad), bad = street.find(h => h.bad);
    const n = good.filter(h => h.state === 'done').length, bs = bad ? bad.state : 'wait';
    const key = n + '|' + good.length + '|' + bs + '|' + stack + '|' + (celebT >= 0);
    if (key === hudKey) return; hudKey = key;
    pill.innerHTML = `${GIFT}<span>${n}/${good.length}</span><span class="sk">${SKULL}</span><span class="${bs === 'cleared' ? 'ok' : bs === 'wait' ? '' : 'no'}">${bs === 'cleared' ? '✓' : bs === 'wait' ? '·' : '✗'}</span>`;
    pill.classList.toggle('win', celebT >= 0);
    bPn.textContent = stack; bP.classList.toggle('empty', stack <= 0);
  }

  // ---- the loop ----
  const _t = new THREE.Color();
  function update(dt, t) {
    if (first) begin();
    cd -= dt;
    pollPad();
    document.body.classList.toggle('onfoot', !!foot.active);
    updateHold(dt);
    // wrecked chimneys go (twice a second); a waiting house wrecked by gunfire / a crash can't take a present any more
    checkT -= dt;
    if (checkT <= 0) {
      checkT = 0.5;
      H.forEach((hs, i) => { const f = facts.get(hs); if (f.chimOn && !roofIntact(hs)) setChimney(i, false); });
      for (const h of street) if (h.state === 'wait' && (!h.f.chimOn || h.hs.alive / h.hs.total < DELIVER.wreck)) { h.state = 'lost'; if (h.bad) { setTells(h, false); burstOut(h, false); } }
    }
    // the taken-over house: windows flicker a sickly green, its plume rises green
    flickT -= dt;
    const bad = street.find(h => h.bad && h.state === 'wait');
    if (bad && flickT <= 0) { flickT = 0.09 + Math.random() * 0.1; const k = 0.75 + Math.random() * 0.45; town.tintWindows(bad.hs, _t.setRGB(0.2 * k, 1.35 * k, 0.4 * k)); }
    for (let i = 0; i < GS; i++) {
      if (!bad) { gsP[i * 3 + 1] = -999; continue; }
      gsL[i] += dt * 0.2; if (gsL[i] > 1) gsL[i] -= 1;
      const L = gsL[i], c = bad.f.chim;
      gsP[i * 3] = c.x + Math.sin(L * 6 + i) * 0.6 * L + L * 5; gsP[i * 3 + 1] = c.y + 0.3 + L * 12; gsP[i * 3 + 2] = c.z + Math.cos(L * 5 + i) * 0.6 * L;
    }
    gsG.attributes.position.needsUpdate = true;
    // icons
    for (const h of street) {
      const i = h.slot, c = h.f.chim, y = c.y + DELIVER.iconUp + Math.sin(t * 2 + i * 1.7) * 0.22;
      _q.setFromAxisAngle(new V3(0, 1, 0), t * 1.1 + i);
      const want = h.state === 'wait';
      iconPresent.setMatrixAt(i, ZERO); iconSkull.setMatrixAt(i, ZERO); iconStar.setMatrixAt(i, ZERO);
      if (want && !h.bad) iconPresent.setMatrixAt(i, _m.compose(_p.set(c.x, y, c.z), _q, _s.setScalar(DELIVER.iconScale)));
      if (want && h.bad) iconSkull.setMatrixAt(i, _m.compose(_p.set(c.x, y, c.z), _q.setFromAxisAngle(new V3(0, 1, 0), Math.sin(t * 1.3 + i) * 0.6 + Math.atan2(h.f.front.x, h.f.front.z)), _s.setScalar(DELIVER.iconScale * 1.1)));
      if (h.state === 'ruined') {   // a broken present: dark, squashed, tipped, slowly sinking onto the wreck
        h.brokenT += dt;
        iconPresent.setMatrixAt(i, _m.compose(_p.set(c.x, y - Math.min(1, h.brokenT * 0.5) * 0.8, c.z), _q.setFromEuler(_e.set(0.5, t * 0.3, 0.35)), _s.set(1, 0.6, 1).multiplyScalar(DELIVER.iconScale)));
        iconPresent.setColorAt(i, _t.setRGB(0.12, 0.1, 0.12));
      } else iconPresent.setColorAt(i, _t.setRGB(1, 1, 1));
      if (h.starT >= 0 && h.starT < 2.2) {
        h.starT += dt; const u = h.starT / 2.2;
        iconStar.setMatrixAt(i, _m.compose(_p.set(c.x, y + u * 2.5, c.z), _q.setFromAxisAngle(new V3(0, 1, 0), t * 5), _s.setScalar(Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u * u) * 1.3 * DELIVER.iconScale + 0.001)));
      }
      const hal = want ? (h.bad ? [0.2, 0.9, 0.25] : [0.85, 0.55, 0.22]) : null;
      haloP[i * 3] = c.x; haloP[i * 3 + 1] = hal ? y : -999; haloP[i * 3 + 2] = c.z;
      if (hal) haloC.set(hal, i * 3);
      // a delivered house: its windows flash bright and settle back
      if (h.flash > 0) { h.flash = Math.max(0, h.flash - dt * 0.7); const k = 1 + h.flash * 2.2 * (0.85 + 0.15 * Math.sin(t * 30)); town.tintWindows(h.hs, _t.setRGB(k, k * 0.95, k * 0.8)); }
    }
    for (let i = street.length; i < N; i++) { iconPresent.setMatrixAt(i, ZERO); iconSkull.setMatrixAt(i, ZERO); iconStar.setMatrixAt(i, ZERO); haloP[i * 3 + 1] = -999; }
    iconPresent.instanceMatrix.needsUpdate = iconSkull.instanceMatrix.needsUpdate = iconStar.instanceMatrix.needsUpdate = true; iconPresent.instanceColor.needsUpdate = true;
    haloG.attributes.position.needsUpdate = haloG.attributes.color.needsUpdate = true;
    // the stack on the sack
    for (let i = 0; i < DELIVER.stack; i++) { const s = STACK[i]; stackMesh.setMatrixAt(i, i < stack ? _m.compose(_p.set(s[0], s[1], s[2]), _q.setFromAxisAngle(new V3(0, 1, 0), s[3]), _s.setScalar(0.42)) : ZERO); }
    stackMesh.instanceMatrix.needsUpdate = true;
    updateItems(dt);
    // the street settles: fireworks if perfect, then the next street
    if (resetT < 0 && street.length && street.every(h => h.state !== 'wait')) {
      resetT = DELIVER.resetAfter; stack = DELIVER.stack;
      if (street.every(h => h.bad ? h.state === 'cleared' : h.state === 'done')) { celebT = 3.5; fireT = 0; rig.crew?.react?.('cheer'); sfx('ui_start', { vol: 1, rate: 1.3 }); }
    }
    if (celebT >= 0) {
      celebT -= dt; fireT -= dt;
      if (fireT <= 0 && celebT > 0) {
        fireT = 0.3 + Math.random() * 0.25;
        const h = street[Math.floor(Math.random() * street.length)], p = h.f.chim.clone(); p.y += 12 + Math.random() * 12; p.x += (Math.random() - 0.5) * 14; p.z += (Math.random() - 0.5) * 14;
        const cols = ['#ff4a5c', '#ffd25a', '#6dff8e', '#7ab8ff', '#ff8ae0'], col = cols[Math.floor(Math.random() * cols.length)];
        spark(p, col, 46, 9, 1.5, { grav: 4, size: 3 }); spark(p, '#ffffff', 10, 3, 0.6, { grav: 2, size: 3 });
        sfx('explosion', { vol: 0.35, rate: 1.7 + Math.random() * 0.4 }); if (Math.random() < 0.5) sfx('casing', { vol: 0.4, rate: 0.8 });
      }
      if (celebT < 0) celebT = -1;
    }
    if (resetT >= 0) { resetT -= dt; if (resetT < 0) { end(); begin(); } }
    // sparks
    for (let i = 0; i < NS; i++) {
      if (sL[i] <= 0) continue;
      sL[i] -= dt; sV[i].y -= sG[i] * dt; sV[i].multiplyScalar(Math.exp(-1.6 * dt));
      sP[i * 3] += sV[i].x * dt; sP[i * 3 + 1] += sV[i].y * dt; sP[i * 3 + 2] += sV[i].z * dt;
      const k = Math.max(0, sL[i] / sL0[i]); sC[i * 3] = sB[i * 3] * k; sC[i * 3 + 1] = sB[i * 3 + 1] * k; sC[i * 3 + 2] = sB[i * 3 + 2] * k;
      if (sL[i] <= 0) sP[i * 3 + 1] = -999;
    }
    sparkG.attributes.position.needsUpdate = sparkG.attributes.color.needsUpdate = true;
    updateHud();
  }
  return { update, drop, dropCam, hold, predict, aimDrop, aimDropPx, get street() { return street; }, get items() { return items; }, get stack() { return stack; }, facts, DELIVER, begin, end };
}
