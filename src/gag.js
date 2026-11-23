// GAGS: hidden moments players stumble on. CAUGHT IN THE ACT -- inside a gingerbread house, two gingerbread folk under a
// quilt, the quilt heaving in rhythm (thump... thump...), little hearts floating up. Blow the wall open and they FREEZE,
// turn and stare (shock), a "!" pops, they blush, then leap out of bed -- one clutching a pillow -- and run for it.
// Nothing is shown: it's all quilt, rhythm and reaction.
// CONTENT.naughty gates every naughty gag in the game: the iOS build sets it false (and `?tame=1` does too).
import * as THREE from 'three';
import { makeGingerPerson } from './gingerfolk.js';

export const CONTENT = { naughty: new URLSearchParams(location.search).get('tame') !== '1' };

let heartTex = null;
function heartTexture() {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 54);
  x.bezierCurveTo(6, 36, 4, 14, 20, 12); x.bezierCurveTo(28, 11, 32, 18, 32, 22);
  x.bezierCurveTo(32, 18, 36, 11, 44, 12); x.bezierCurveTo(60, 14, 58, 36, 32, 54); x.fill();
  heartTex = new THREE.CanvasTexture(c); heartTex.colorSpace = THREE.SRGBColorSpace; return heartTex;
}
function bangSprite() {   // the "!" icing speech pop
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff6ea'; x.strokeStyle = '#3a2420'; x.lineWidth = 8;
  x.beginPath(); x.arc(64, 58, 44, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#e8303a'; x.font = '900 72px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.setScalar(0.55); s.renderOrder = 10; return s;
}

const M = {
  frame: new THREE.MeshStandardMaterial({ color: '#8a5228', roughness: 0.8 }),
  icing: new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: '#e8303a', roughness: 0.5 }),
  pillow: new THREE.MeshStandardMaterial({ color: '#fff0f4', roughness: 0.9 }),
};
function quiltMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const cols = ['#e8303a', '#3aa85a', '#ffd23a', '#ff7ab8', '#fff6ea', '#4ab8ff'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = cols[(i * 3 + j * 2) % cols.length]; x.fillRect(i * 32, j * 32, 32, 32); }
  x.strokeStyle = '#fff6ea'; x.lineWidth = 3; x.setLineDash([6, 5]);
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke(); x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

/**
 * caughtInTheAct(scene, {x, y, z, ry}) -- a bed + two gingerfolk; the bed's head is at local -Z, its foot at +Z.
 * Call update(dt, camera) every frame and trigger() when the player can see in (the host decides: a wall blown open +
 * a clear line of sight). Returns null when CONTENT.naughty is off.
 */
export function caughtInTheAct(scene, { x = 0, y = 0, z = 0, ry = 0, scale = 1 } = {}) {
  if (!CONTENT.naughty) return null;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(scale); scene.add(g);
  const mesh = (geo, mat, px, py, pz, parent = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // the bed: cookie frame, candy-cane posts with icing knobs, two pillows, a patchwork quilt
  const W = 1.5, L = 2.0;
  mesh(new THREE.BoxGeometry(W, 0.3, L), M.frame, 0, 0.3, 0);
  mesh(new THREE.BoxGeometry(W + 0.1, 0.9, 0.12), M.frame, 0, 0.65, -L / 2);           // headboard
  mesh(new THREE.BoxGeometry(W + 0.1, 0.5, 0.12), M.frame, 0, 0.45, L / 2);            // footboard
  for (const [px, pz, h] of [[-W / 2, -L / 2, 1.2], [W / 2, -L / 2, 1.2], [-W / 2, L / 2, 0.8], [W / 2, L / 2, 0.8]]) {
    for (let k = 0; k < 6; k++) mesh(new THREE.CylinderGeometry(0.06, 0.06, h / 6, 8), k % 2 ? M.red : M.icing, px, (k + 0.5) * h / 6, pz);
    mesh(new THREE.SphereGeometry(0.09, 10, 8), M.icing, px, h + 0.05, pz);
  }
  const pillows = [-0.33, 0.33].map(px => { const p = mesh(new THREE.SphereGeometry(0.3, 14, 10), M.pillow, px, 0.5, -L / 2 + 0.32); p.scale.set(1, 0.35, 0.6); return p; });
  const quilt = mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), quiltMaterial(), 0, 0.42, 0.32);
  quilt.scale.set(W * 0.62, 0.38, L * 0.34);

  // the couple, lying side by side under the quilt, heads on the pillows (bodies hidden under it)
  const folk = [makeGingerPerson({ tint: 0 }), makeGingerPerson({ tint: 2, buttons: ['#ff7ab8', '#fff6ea', '#ff7ab8'] })];
  folk.forEach((f, i) => {
    f.group.position.set(i ? 0.26 : -0.26, 0.5, 0.42); f.group.rotation.set(-Math.PI / 2, 0, i ? -0.12 : 0.12);
    f.head.rotation.x = 0.75;   // chin up off the pillow: the faces peek out over the quilt
    f.pose('still'); f.face('happy'); g.add(f.group);
  });
  // hearts
  const HN = 10, hp = new Float32Array(HN * 3), hl = new Float32Array(HN).map(() => Math.random());
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const hearts = new THREE.Points(hg, new THREE.PointsMaterial({ map: heartTexture(), color: new THREE.Color('#ff5a8a').multiplyScalar(1.6), size: 0.22, transparent: true, depthWrite: false, toneMapped: false }));
  hearts.frustumCulled = false; g.add(hearts);
  const bang = bangSprite(); bang.visible = false; g.add(bang);

  let state = 'busy', st = 0, beatT = 0, t = 0;
  const camLocal = new THREE.Vector3(), tmp = new THREE.Vector3();
  const self = {
    group: g, get state() { return state; },
    /** the world point the host should check line-of-sight to */
    focus: () => g.localToWorld(tmp.set(0, 0.8, -0.2)),
    trigger() {
      if (state !== 'busy') return;
      state = 'caught'; st = 0;
      window.sfx?.play('ui_back', { vol: 0.8, rate: 0.7 });
      folk.forEach(f => f.face('shock'));
    },
    update(dt, camera) {
      t += dt; st += dt;
      if (camera) { camLocal.copy(camera.position); g.worldToLocal(camLocal); }
      if (state === 'busy') {
        // the rhythm: a heave on the quilt + the two heads, a thump each beat
        const ph = t * 5.2, s = Math.max(0, Math.sin(ph));
        quilt.scale.y = 0.38 + s * 0.09; quilt.position.z = 0.32 + s * 0.04;
        folk.forEach((f, i) => { f.group.position.y = 0.5 + s * 0.05 * (i ? 1 : 0.6); f.head.rotation.z = Math.sin(ph + i) * 0.1; });
        beatT -= dt; if (beatT <= 0 && s > 0.97) { beatT = 0.5; window.sfx?.play('hoof', { vol: 0.25, rate: 0.55 }); }
        for (let i = 0; i < HN; i++) {
          hl[i] += dt * 0.35; if (hl[i] > 1) hl[i] -= 1;
          const L_ = hl[i];
          hp[i * 3] = Math.sin(i * 2.3 + L_ * 6) * 0.35; hp[i * 3 + 1] = 0.9 + L_ * 1.4; hp[i * 3 + 2] = -0.5 + Math.cos(i * 1.7) * 0.2;
        }
        hg.attributes.position.needsUpdate = true;
      } else if (state === 'caught') {
        // freeze, both heads swing round to stare at the camera; "!" pops; then they blush
        hearts.visible = false;
        quilt.scale.y = 0.4;
        folk.forEach((f, i) => {
          const dx = camLocal.x - f.group.position.x;
          f.head.rotation.z = THREE.MathUtils.lerp(f.head.rotation.z, THREE.MathUtils.clamp(-dx * 0.35, -0.8, 0.8), 1 - Math.exp(-10 * dt));
          f.look(Math.sign(dx), 0);
        });
        bang.visible = st > 0.25; bang.position.set(0, 1.55 + Math.max(0, 0.4 - st) * 0.6, -0.4); bang.scale.setScalar(0.55 * Math.min(1, (st - 0.25) * 6));
        if (st > 1.3) folk.forEach(f => f.face('embarrassed'));
        if (st > 2.0) { state = 'flee'; st = 0; bang.visible = false; window.sfx?.play('whoosh', { vol: 0.7 });
          // one of them grabs a pillow and holds it in front
          const p = pillows[0]; folk[0].body.attach(p); p.position.set(0, -0.05, 0.25); p.rotation.set(Math.PI / 2, 0, 0); }
      } else if (state === 'flee') {
        // spring up out of bed, then run off away from the camera (opposite side), flailing / covering up
        const away = new THREE.Vector3(-camLocal.x, 0, -camLocal.z).normalize();
        folk.forEach((f, i) => {
          const up = Math.min(1, st * 4);
          f.group.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, up); f.group.rotation.z = THREE.MathUtils.lerp(f.group.rotation.z, 0, up);
          f.head.rotation.x = THREE.MathUtils.lerp(0.75, 0, up);
          if (up >= 1) {
            f.pose(i ? 'flail' : 'run');
            const side = new THREE.Vector3(away.z, 0, -away.x).multiplyScalar(i ? 0.6 : -0.6);
            f.group.position.addScaledVector(away, dt * 3.4).addScaledVector(side, dt * 0.6);
            f.group.position.y = Math.max(0, f.group.position.y - dt * 4);
            f.group.rotation.y = Math.atan2(away.x, away.z);
          }
          f.update(dt);
        });
        if (st > 3.5) { state = 'gone'; folk.forEach(f => { f.group.visible = false; }); }
      }
    },
    reset() { /* rebuilt by the host */ },
  };
  return self;
}
