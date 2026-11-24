// ?scene=gunpose -- THE GUN POSE SANDBOX (his call, Nov 24: "sandbox is fine"). Santa on white holding each gun; sliders set his
// FIXED upper-body hold per weapon (HOLD poses in characters.js); SAVE writes localStorage 'holdpose.v1' and the GAME uses it on
// this phone at once; COPY puts the JSON on the clipboard to send to Claude so it becomes the default for everyone.
// Camera buttons show the angles the game really uses (START screen, CHASE behind the sleigh, ON FOOT) + front / side / top;
// SKELETON draws his bones on top: his LEFT = blue, his RIGHT = red, spine = yellow.
import * as THREE from 'three';
import { loadModels, makeSanta, CREW, HOLD_DEFAULT, holdPose, santaChoice } from './characters.js';
import { WEAPONS, ORDER } from './weapons.js';

CREW.hold = 'pose';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4f1ec');
scene.add(new THREE.HemisphereLight('#ffffff', '#c8c0b8', 2.2));
const sun = new THREE.DirectionalLight('#fff', 2.2); sun.position.set(3, 6, 4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); scene.add(floor);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---- UI -------------------------------------------------------------------------------------------------------------
const css = document.createElement('style'); css.textContent = `
.gp { position: fixed; z-index: 6; font: 700 12px/1.2 ui-rounded, system-ui, sans-serif; color: #2a1d16; }
.gp .b { display: inline-block; padding: 8px 10px; margin: 3px; border-radius: 12px; background: #fff6e6; border: 2px solid #2a1d16; box-shadow: 0 3px 0 #2a1d16; user-select: none; -webkit-user-select: none; }
.gp .b.on { background: #ffd25a; }
.gp .b.red { background: #e0343c; color: #fff; } .gp .b.green { background: #3fae62; color: #fff; }
#gpTop { top: calc(env(safe-area-inset-top) + 6px); left: 96px; right: 6px; }
#gpPanel { left: 0; right: 0; bottom: 0; max-height: 42vh; overflow-y: auto; background: #fff9f0ee; border-top: 2px solid #2a1d16; padding: 6px 10px calc(env(safe-area-inset-bottom) + 8px); }
#gpPanel .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
#gpPanel .row label { width: 92px; flex: none; } #gpPanel .row input { flex: 1; } #gpPanel .row span { width: 46px; text-align: right; font-family: ui-monospace, monospace; }
#gpOut { width: 100%; height: 60px; font: 11px ui-monospace, monospace; }
@media (orientation: landscape) and (max-height: 600px) { #gpPanel { left: auto; width: 46vw; top: 0; max-height: none; border-top: 0; border-left: 2px solid #2a1d16; } }`;
document.head.appendChild(css);
const top = document.createElement('div'); top.className = 'gp'; top.id = 'gpTop'; document.body.appendChild(top);
const panel = document.createElement('div'); panel.className = 'gp'; panel.id = 'gpPanel'; document.body.appendChild(panel);
const B = (parent, label, fn, cls = '') => { const b = document.createElement('div'); b.className = 'b ' + cls; b.textContent = label; b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); parent.appendChild(b); return b; };
const group = (parent, items, cur, fn) => { const bs = items.map(([k, label]) => B(parent, label, b => { bs.forEach(x => x.classList.remove('on')); b.classList.add('on'); fn(k); })); bs[items.findIndex(i => i[0] === cur)]?.classList.add('on'); return bs; };

const SLIDERS = [
  ['gx', 'gun ← → (left +)', -0.6, 0.6, 0.01], ['gy', 'gun height', -0.8, 0.3, 0.01], ['gz', 'gun forward', -0.2, 0.8, 0.01],
  ['yaw', 'gun turn °', -60, 60, 1], ['pitch', 'gun tilt °', -45, 45, 1], ['roll', 'gun roll °', -90, 90, 1], ['scale', 'gun size', 0.4, 1.4, 0.01],
  ['twist', 'body side-on °', -30, 90, 1], ['head', 'head turns back', 0, 1, 0.05],
  ['lSlide', 'L hand along gun', 0, 1.2, 0.01], ['lUp', 'L hand top/bottom', -0.25, 0.25, 0.01],
  ['lOut', 'L elbow out', -0.5, 1.5, 0.05], ['lUp2', 'L elbow up', -1.2, 1.2, 0.05],
  ['rOut', 'R elbow out', -0.5, 1.5, 0.05], ['rUp', 'R elbow up', -1.2, 1.2, 0.05],
];

// ---- state ----------------------------------------------------------------------------------------------------------
const key = santaChoice();
let santa = null, weapon = 'gatling', role = 'idle', view = 'start', skel = false, aimMode = 'ahead';
const inputs = {};
function fill() { const P = santa?.pose; if (!P) return; for (const [k] of SLIDERS) { inputs[k].i.value = P[k]; inputs[k].v.textContent = (+P[k]).toFixed(2).replace(/\.00$/, ''); } }
function buildPanel() {
  panel.replaceChildren();
  const r1 = document.createElement('div'); panel.appendChild(r1);
  group(r1, ORDER.map(w => [w, WEAPONS[w].name]), weapon, async w => { weapon = w; await santa.setWeapon(w); santa.pose = holdPose(key, w); fill(); });
  const r2 = document.createElement('div'); panel.appendChild(r2);
  group(r2, [['idle', 'IDLE'], ['walk', 'WALK'], ['run', 'RUN'], ['fire', 'FIRE']], role, r => { role = r; if (r === 'fire') santa.setFiring(true); else { santa.setFiring(false); santa.setIdle(r); } });
  for (const [k, label, lo, hi, st] of SLIDERS) {
    const row = document.createElement('div'); row.className = 'row';
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.type = 'range'; i.min = lo; i.max = hi; i.step = st;
    const v = document.createElement('span');
    i.addEventListener('input', () => { santa.pose[k] = +i.value; v.textContent = (+i.value).toFixed(2).replace(/\.00$/, ''); });
    row.append(l, i, v); panel.appendChild(row); inputs[k] = { i, v };
  }
  const r3 = document.createElement('div'); panel.appendChild(r3);
  const out = document.createElement('textarea'); out.id = 'gpOut'; out.readOnly = true;
  B(r3, 'SAVE (game uses it)', () => {
    let all = {}; try { all = JSON.parse(localStorage.getItem('holdpose.v1') || '{}'); } catch (e) {}
    (all[key] ||= {})[weapon] = { ...santa.pose }; try { localStorage.setItem('holdpose.v1', JSON.stringify(all)); } catch (e) {}
    out.value = JSON.stringify(all); flash('saved ' + key + ' / ' + weapon);
  }, 'green');
  B(r3, 'COPY ALL', () => { let all = localStorage.getItem('holdpose.v1') || '{}'; out.value = all; navigator.clipboard?.writeText(all).then(() => flash('copied -- paste it to Claude'), () => flash('select the text below + copy')); });
  B(r3, 'RESET GUN', () => { santa.pose = { ...HOLD_DEFAULT }; fill(); }, 'red');
  panel.appendChild(out);
}
const toast = document.createElement('div'); toast.className = 'gp'; toast.style.cssText = 'top:40%;left:0;right:0;text-align:center;font-size:16px;pointer-events:none;opacity:0;transition:opacity .4s';
document.body.appendChild(toast); const flash = m => { toast.textContent = m; toast.style.opacity = 1; setTimeout(() => toast.style.opacity = 0, 1200); };

group(top, [['start', 'START SCREEN'], ['chase', 'CHASE'], ['foot', 'ON FOOT'], ['front', 'FRONT'], ['side', 'SIDE'], ['top', 'TOP']], view, v => { view = v; orbit = null; });
group(top, [['ahead', 'AIM AHEAD'], ['menu', 'AIM UP-LEFT']], aimMode, m => aimMode = m);
B(top, 'SKELETON', b => { skel = !skel; b.classList.toggle('on', skel); });
group(top, [['tough', 'TOUGH'], ['nocoat', 'NO COAT']], key, k => { if (k !== key) { try { localStorage.setItem('santa', k); } catch (e) {} location.reload(); } });

// ---- views + orbit ----------------------------------------------------------------------------------------------------
const VIEWS = {   // camera position + look target in his frame (+Z = his forward, +X = his left)
  start: [[0.4, 1.6, 4.6], [0, 1.15, 0]], chase: [[0, 3.2, -6.5], [0, 1.6, 3]], foot: [[1.0, 2.4, -4.2], [0, 1.4, 2]],
  front: [[0, 1.2, 4.2], [0, 1.1, 0]], side: [[4.2, 1.2, 0], [0, 1.1, 0]], top: [[0, 5.5, 0.01], [0, 1, 0]],
};
let orbit = null, drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; if (!orbit) { const p = camera.position.clone(); orbit = { a: Math.atan2(p.x, p.z), h: p.y, r: Math.hypot(p.x, p.z) }; } });
addEventListener('pointermove', e => { if (!drag || !orbit) return; orbit.a -= (e.clientX - drag.x) * 0.008; orbit.h = THREE.MathUtils.clamp(orbit.h + (e.clientY - drag.y) * 0.01, 0.2, 6); drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => drag = null);

// ---- skeleton overlay -------------------------------------------------------------------------------------------------
const skelGeo = new THREE.BufferGeometry(), skelMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
const skelLines = new THREE.LineSegments(skelGeo, skelMat); skelLines.renderOrder = 9; skelLines.frustumCulled = false; scene.add(skelLines);
function drawSkel() {
  skelLines.visible = skel; if (!skel || !santa) return;
  const pos = [], col = [], a = new THREE.Vector3(), b = new THREE.Vector3();
  santa.holder.traverse(o => {
    if (!o.isBone || !o.parent?.isBone || /weapon|gun_tip|hat_|jiggle|Thumb|Index|Middle|Ring|Pinky/.test(o.name)) return;
    o.getWorldPosition(a); o.parent.getWorldPosition(b); pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const c = /Left/.test(o.name) ? [0.12, 0.42, 1] : /Right/.test(o.name) ? [1, 0.16, 0.16] : [0.95, 0.75, 0];
    col.push(...c, ...c);
  });
  skelGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); skelGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

// ---- go ---------------------------------------------------------------------------------------------------------------
loadModels().then(async M => {
  santa = makeSanta(M.santa, { role: 'idle', stance: 'foot' });
  scene.add(santa.holder);
  await santa.setWeapon(weapon); santa.pose = holdPose(key, weapon);
  buildPanel(); fill();
});
const clock = new THREE.Clock(), aim = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (santa) {
    santa.holder.updateMatrixWorld(true);
    aim.set(...(aimMode === 'menu' ? [7, 5, 3] : [0, 1.0, 14])); santa.holder.localToWorld(aim);
    santa.aimAt(aim); santa.update(dt, t);
    if (role === 'fire' && Math.random() < dt * 14) santa.kick();
  }
  // fit: pull the camera back on a narrow (portrait) screen, and centre him in the space the panel leaves
  const [cp, ct] = VIEWS[view], fit = Math.max(1, 0.95 / camera.aspect), port = innerHeight > innerWidth;
  const T = new THREE.Vector3(...ct), C = new THREE.Vector3(...cp);
  if (orbit) C.set(Math.sin(orbit.a) * orbit.r, orbit.h, Math.cos(orbit.a) * orbit.r);
  camera.position.copy(T).add(C.sub(T).multiplyScalar(orbit ? 1 : fit)); camera.lookAt(T);
  const ph = panel.getBoundingClientRect(), th = top.getBoundingClientRect();
  if (port) camera.setViewOffset(innerWidth, innerHeight, 0, -(ph.height - th.bottom) / 2 + 0, innerWidth, innerHeight);
  else camera.setViewOffset(innerWidth, innerHeight, -(innerWidth - ph.left) / 2 * 0 + ph.width / 2, 0, innerWidth, innerHeight);
  drawSkel();
  renderer.render(scene, camera);
});
