// THE JETPACK (b81, his: "let's just start him with one... press and hold on the LEFT stick, after a single jump or a double jump,
// to initiate the JETPACK if it's equipped... you can still shoot with the right. We'll have the jetpack on a SWITCH on one of the
// buttons above the left stick"). onfoot.js owns the physics (JET below: thrust against FOOT.gravity, climb cap, steering, fuel);
// this file owns the LOOK: the candy jetpack on his back (two red-and-white striped canisters with gold rings, nozzles, a green
// bow + a swinging gold bell; riding his Spine2 bone, shown while the switch is on), the exhaust (two additive flame cones that
// flicker past 1.0 so they bloom, puffy snow-smoke + gold sparkles in world space), the roar (wind + crackle loops pitched up) and
// the FUEL ARC round the left stick (shows while thrusting / refilling).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

// JET: thrust = m/s^2 up while held (gravity 22 -> net +8; brake = thrust x this while falling, so a jet catches a fall), maxUp = the
// climb speed cap (m/s), speed = horizontal target speed from the stick (m/s), steer = how fast he reaches it (1/s; normal air control
// is ~3 m/s^2), drag = horizontal damping while thrusting with the stick centred (1/s), fuel = s of thrust, refill = s from empty to
// full on the ground (after refillDelay s), lean = forward tilt while thrusting (rad), shake = camera shake (m), size = model scale
export const JET = { thrust: 30, brake: 1.8, maxUp: 8, speed: 9, steer: 2.4, drag: 0.8, fuel: 3.5, refill: 2, refillDelay: 0.25,
  lean: 0.28, shake: 0.05, size: 1, smokeRate: 34, sparkRate: 40 };

const INK = '#1d1420';
function stripeTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fff6ec'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e8263a';
  for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 128); g.lineTo(i * 32 + 16, 128); g.lineTo(i * 32 + 16 + 64, 0); g.lineTo(i * 32 + 64, 0); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1.4); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s))); return geo; };

/** the pack itself, in its own frame: +Y up, +Z = his front (the plate touches his back at z = 0), canisters behind (-Z) */
function buildPack() {
  const G = new THREE.Group(); G.name = 'jetpack';
  const CX = 0.15, CZ = -0.13, R = 0.1, LEN = 0.34;
  const stripes = [], gold = [], steel = [], choc = [], bow = [];
  for (const sx of [-1, 1]) {
    stripes.push(at(new THREE.CapsuleGeometry(R, LEN, 6, 18), sx * CX, 0, CZ));
    for (const y of [LEN / 2 - 0.02, -LEN / 2 + 0.03]) gold.push(at(new THREE.TorusGeometry(R + 0.006, 0.017, 8, 22), sx * CX, y, CZ, Math.PI / 2));
    gold.push(at(new THREE.SphereGeometry(0.03, 10, 8), sx * CX, LEN / 2 + R + 0.01, CZ));                         // a gold finial on each dome
    steel.push(at(new THREE.CylinderGeometry(0.052, 0.072, 0.1, 16, 1, true), sx * CX, -LEN / 2 - R - 0.02, CZ));    // the nozzle bell
    steel.push(at(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), sx * CX, -LEN / 2 - R + 0.03, CZ));
    gold.push(at(new THREE.TorusGeometry(0.072, 0.012, 6, 18), sx * CX, -LEN / 2 - R - 0.07, CZ, Math.PI / 2));     // the nozzle lip
  }
  // the back plate (a chocolate bar with rounded ends) + two crossbars holding the canisters
  choc.push(at(new THREE.CapsuleGeometry(0.1, 0.22, 6, 14), 0, 0, -0.03, 0, 0, 0).scale(1.25, 1, 0.38));
  for (const y of [0.11, -0.12]) choc.push(at(new THREE.CapsuleGeometry(0.028, 0.3, 4, 10), 0, y, CZ + 0.02, 0, 0, Math.PI / 2));
  // shoulder straps: two arcs running from the plate up and over toward his front
  for (const sx of [-1, 1]) choc.push(at(new THREE.TorusGeometry(0.13, 0.018, 6, 14, Math.PI * 0.75), sx * 0.11, 0.17, 0.08, 0, Math.PI / 2, -Math.PI * 0.1));
  // the green bow on top, between the canisters
  for (const sx of [-1, 1]) bow.push(at(new THREE.TorusGeometry(0.045, 0.016, 6, 14), sx * 0.05, 0.27, CZ + 0.02, 0, 0, sx * 0.5).scale(1, 0.7, 0.55));
  bow.push(at(new THREE.SphereGeometry(0.025, 10, 8), 0, 0.27, CZ + 0.03));
  for (const sx of [-1, 1]) bow.push(at(new THREE.CylinderGeometry(0.012, 0.018, 0.1, 6), sx * 0.03, 0.22, CZ + 0.03, 0, 0, sx * 0.4));
  const mats = {
    stripes: new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.3, metalness: 0.05 }),
    gold: new THREE.MeshStandardMaterial({ color: '#f4b73a', roughness: 0.28, metalness: 0.75, emissive: '#5a3500', emissiveIntensity: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: '#b9bfd0', roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }),
    choc: new THREE.MeshStandardMaterial({ color: '#7a4224', roughness: 0.55 }),
    bow: new THREE.MeshStandardMaterial({ color: '#2fa35b', roughness: 0.45 }),
  };
  const parts = { stripes, gold, steel, choc, bow };
  for (const k in parts) { const m = new THREE.Mesh(mergeGeometries(parts[k].map(g => g.index ? g.toNonIndexed() : g)), mats[k]); m.castShadow = true; G.add(m); }
  // the bell: hangs under the bow on its own pivot and swings
  const bell = new THREE.Group(); bell.position.set(0, 0.2, CZ + 0.05); G.add(bell);
  const bb = new THREE.Mesh(mergeGeometries([at(new THREE.SphereGeometry(0.038, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, -0.05, 0),
    at(new THREE.TorusGeometry(0.03, 0.006, 5, 12), 0, -0.073, 0, Math.PI / 2), at(new THREE.SphereGeometry(0.012, 6, 5), 0, -0.088, 0)].map(g => g.index ? g.toNonIndexed() : g)), mats.gold);
  bell.add(bb);
  // flames: an outer orange cone + an inner hot core per nozzle (apex down), additive, past 1.0 so the bloom catches them
  const flames = [], nozzles = [];
  const fmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.16), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const cmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.0, 0.85), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const cone = (r, h) => { const g = new THREE.ConeGeometry(r, h, 12, 1, true); g.rotateX(Math.PI); g.translate(0, -h / 2, 0); return g; };
  for (const sx of [-1, 1]) {
    const n = new THREE.Group(); n.position.set(sx * CX, -LEN / 2 - R - 0.07, CZ); G.add(n); nozzles.push(n);
    const o = new THREE.Mesh(cone(0.07, 0.5), fmat), c = new THREE.Mesh(cone(0.04, 0.28), cmat);
    o.renderOrder = c.renderOrder = 12; o.frustumCulled = c.frustumCulled = false;
    const f = new THREE.Group(); f.add(o, c); f.visible = false; n.add(f); flames.push(f);
  }
  return { G, bell, flames, nozzles };
}

/** the exhaust trail: one instanced mesh of puffs (snow-smoke) + one points cloud of sparkles, world space */
function makeTrail(scene) {
  const N = 90, puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), N);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); puffs.frustumCulled = false; puffs.count = 0; scene.add(puffs);
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.2 }));
  const M = 70, spos = new Float32Array(M * 3), sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: new THREE.Color(3, 2.2, 0.9), size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  const Sp = Array.from({ length: M }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  let pi = 0, si = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    puff(at, v, s, life) { const o = P[pi++ % N]; o.p.copy(at); o.v.copy(v); o.life = o.max = life; o.s = s; },
    spark(at, v) { const o = Sp[si++ % M]; o.p.copy(at); o.v.copy(v); o.life = 0.35 + Math.random() * 0.3; },
    update(dt) {
      let n = 0;
      for (const o of P) {
        if (o.life <= 0) continue; o.life -= dt; if (o.life <= 0) continue;
        o.v.multiplyScalar(Math.exp(-3 * dt)); o.v.y += 1.2 * dt; o.p.addScaledVector(o.v, dt);
        const u = 1 - o.life / o.max, s = o.s * (0.5 + u * 1.6) * (u > 0.7 ? (1 - u) / 0.3 : 1);
        m4.compose(o.p, q, sc.setScalar(Math.max(0.001, s))); puffs.setMatrixAt(n++, m4);
      }
      puffs.count = n; puffs.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < M; i++) {
        const o = Sp[i];
        if (o.life > 0) { o.life -= dt; o.v.y -= 6 * dt; o.p.addScaledVector(o.v, dt); spos.set([o.p.x, o.p.y, o.p.z], i * 3); }
        else spos.set([0, -1e4, 0], i * 3);
      }
      sgeo.attributes.position.needsUpdate = true;
    },
  };
}

/** the fuel arc: an SVG ring round the LEFT stick's pad (#padL, so it follows the floating stick) */
function makeMeter() {
  const pad = document.getElementById('padL'); if (!pad) return { set() {} };
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.style.cssText = 'position:absolute;left:-14%;top:-14%;width:128%;height:128%;pointer-events:none;overflow:visible;transition:opacity .25s;opacity:0';
  const C = 2 * Math.PI * 46;
  svg.innerHTML = `<circle cx="50" cy="50" r="46" fill="none" stroke="${INK}" stroke-width="8" stroke-opacity=".55"/>
<circle class="f" cx="50" cy="50" r="46" fill="none" stroke="#f4b73a" stroke-width="4.6" stroke-linecap="round" stroke-dasharray="${C} ${C}" transform="rotate(-90 50 50)"/>
<g transform="translate(50 -3)"><rect x="-13" y="-5.5" width="26" height="11" rx="5" fill="${INK}"/><text y="3.4" text-anchor="middle" font-size="8.5" font-weight="900" font-style="italic" fill="#fcefd4" font-family="ui-rounded,system-ui,sans-serif">JET</text></g>`;
  pad.appendChild(svg); const f = svg.querySelector('.f'); let last = '';
  return {
    set(show, k, hot) {
      const key = (show ? 1 : 0) + '|' + k.toFixed(2) + '|' + hot; if (key === last) return; last = key;
      svg.style.opacity = show ? 1 : 0;
      f.setAttribute('stroke-dasharray', `${(C * k).toFixed(1)} ${C}`);
      f.setAttribute('stroke', k < 0.25 ? '#e8263a' : hot ? '#ffd76a' : '#f4b73a');
    },
  };
}

/** makeJetpack({ scene }) -> { attach(santa), update(dt, o) }. o = { worn, thrust (0..1 eased), fuel01, onFoot, vel, t } */
export function makeJetpack({ scene }) {
  const pack = buildPack(), trail = makeTrail(scene), meter = makeMeter();
  pack.G.scale.setScalar(JET.size); pack.G.visible = false;
  const snd = { roar: null, crackle: null, on: false };
  const v = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion();
  let attached = false, smokeAcc = 0, sparkAcc = 0, bellA = 0, bellV = 0, lastVel = new THREE.Vector3();
  /** ride Santa's Spine2: placed in HIS frame (behind his back, measured from the skinned mesh at chest height), then re-expressed
   *  in the bone's frame so the pack follows the spine through every clip */
  function attach(santa) {
    const H = santa.holder, B = santa.B, bone = B.Spine2 || B.Spine1 || B.Spine; if (!bone) return;
    H.updateMatrixWorld(true);
    const sp = H.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    // his back at chest height: the farthest-back skinned vertex within a band round the bone, near his centre line
    let back = Infinity; const w = new THREE.Vector3();
    H.traverse(o => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 8000));
      for (let i = 0; i < pos.count; i += step) {
        w.fromBufferAttribute(pos, i); o.applyBoneTransform?.(i, w); w.applyMatrix4(o.matrixWorld); H.worldToLocal(w);
        if (Math.abs(w.y - sp.y) < 0.14 && Math.abs(w.x) < 0.18) back = Math.min(back, w.z);
      }
    });
    if (!isFinite(back) || back > sp.z) back = sp.z - 0.22;
    const local = new THREE.Matrix4().compose(new THREE.Vector3(0, sp.y - 0.04, back + 0.02), new THREE.Quaternion(), new THREE.Vector3(JET.size, JET.size, JET.size));
    const m = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(H.matrixWorld).multiply(local);
    m.decompose(pack.G.position, pack.G.quaternion, pack.G.scale);
    bone.add(pack.G); attached = true;
  }
  function sound(on, k) {
    const S = window.sfx; if (!S) return;
    if (on && !snd.roar) { snd.roar = S.loop('wind_loop', { vol: 0, rate: 1.9 }); snd.crackle = S.loop('fire_crackle_loop', { vol: 0, rate: 1.7 }); }
    if (on && !snd.on) { S.play('whoosh', { vol: 0.75, rate: 0.75 }); S.play('gun_spinup', { vol: 0.25, rate: 0.6 }); }
    if (!on && snd.on) S.play('gun_spindown', { vol: 0.2, rate: 0.7 });
    snd.on = on;
    snd.roar?.setVolume(on ? 0.55 + 0.35 * k : 0, on ? 0.08 : 0.25); snd.crackle?.setVolume(on ? 0.9 : 0, on ? 0.08 : 0.3);
    snd.roar?.setRate(1.7 + 0.4 * k, 0.1);
  }
  function update(dt, o) {
    pack.G.visible = attached && !!o.worn;
    const on = !!o.worn && o.thrust > 0.02;
    // flames: flicker in length + width; the core a little faster
    pack.flames.forEach((f, i) => {
      f.visible = on;
      if (!on) return;
      const fl = 0.75 + Math.random() * 0.45, k = o.thrust;
      f.children[0].scale.set(0.9 + Math.random() * 0.25, fl * k * (1 + 0.15 * Math.sin(o.t * 53 + i * 2)), 0.9 + Math.random() * 0.25);
      f.children[1].scale.set(1, (0.7 + Math.random() * 0.5) * k, 1);
    });
    // exhaust: puffs + sparkles out of each nozzle, pushed down the nozzle's axis, a share of his own velocity
    if (on && dt > 0) {
      smokeAcc += JET.smokeRate * dt * o.thrust; sparkAcc += JET.sparkRate * dt * o.thrust;
      for (const n of pack.nozzles) {
        n.getWorldPosition(v); n.getWorldQuaternion(q); d.set(0, -1, 0).applyQuaternion(q);
        let s = smokeAcc / 2; while (s-- >= 1) trail.puff(v.clone().addScaledVector(d, 0.35 + Math.random() * 0.2), d.clone().multiplyScalar(5 + Math.random() * 3).addScaledVector(o.vel, 0.25).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5)), 0.12 + Math.random() * 0.1, 0.6 + Math.random() * 0.5);
        let k = sparkAcc / 2; while (k-- >= 1) trail.spark(v.clone().addScaledVector(d, 0.2), d.clone().multiplyScalar(6 + Math.random() * 4).addScaledVector(o.vel, 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3)));
      }
      smokeAcc %= 2; sparkAcc %= 2;
    }
    trail.update(dt);
    // the bell: a damped spring kicked by his acceleration (and a little jitter while the jets run)
    if (dt > 0) {
      const ax = (o.vel.y - lastVel.y) / dt; lastVel.copy(o.vel);
      bellV += (-bellA * 60 - bellV * 5 + THREE.MathUtils.clamp(ax, -60, 60) * 0.05 + (on ? (Math.random() - 0.5) * 30 : 0)) * dt;
      bellA = THREE.MathUtils.clamp(bellA + bellV * dt, -0.8, 0.8); pack.bell.rotation.x = bellA; pack.bell.rotation.z = bellA * 0.4;
    }
    sound(on && o.onFoot, o.thrust);
    meter.set(!!o.worn && o.onFoot && (on || o.fuel01 < 0.999), o.fuel01, on);
  }
  return { attach, update, get group() { return pack.G; } };
}
