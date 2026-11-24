// TWIN STICKS (his, Nov 23): LEFT stick FLIES the sleigh, RIGHT stick AIMS + SHOOTS (push it = the reticle moves that way and
// the gun fires; let go = it stops). Both pads FLOAT: each half of the screen is a zone and the pad appears under the thumb
// (Korajin's STICK.dyn); they rest faintly in their corners. BOOST is its own button. A gamepad drives the same values;
// on a desktop the mouse IS the reticle and the left button fires.
// GUN LOCK (b61, his: "a button above the right stick that looks like a gun -- drag it into the centre, it LOCKS, the gun
// starts shooting and now you can aim; if you don't drag it in, the right joystick just controls the CAMERA"): the right pad is
// the CAMERA until the gun sticker is dragged onto it (snaps + padlock), then it is the FIRE pad. LEFT-PAD FLICK = DODGE.
// Output each frame: input.steer, input.climb (left, -1..1, + = right / up), input.aimX, input.aimY (right pad when LOCKED),
// input.camX, input.camY (right pad when UNLOCKED: + = turn right / look up), input.locked, input.fire, input.boost,
// input.mouse (reticle in px when the mouse is aiming, else null), input.dodge ({x, y} pad direction once per flick, the game
// clears it), input.moveHold (the first FLICK.ms of a left touch: a flick must not also start a walk).

export const input = { steer: 0, climb: 0, aimX: 0, aimY: 0, camX: 0, camY: 0, locked: false, fire: false, boost: false, mouse: null, dodge: null, moveHold: false };
export const STICKS = { R: 58, fireAt: 0.35, tapR: 0.35, tapMs: 180, deadL: 0.06 };   // right pad: inside tapR = the middle (jump tap, no fire)
// GUNLOCK: snapAt = the gun locks the moment it arrives this close to the pad centre (fraction of the pad's 68 px radius);
// dropAt = let go this close and it still snaps; outR = locked, the thumb dragged this far (x STICKS.R) from the pad's centre
// pulls the gun back out (unlocks); park = where the gun sticker rests (px from the right / bottom edges, its centre)
export const GUNLOCK = { snapAt: 0.25, dropAt: 0.6, outR: 2.3, park: { right: 196, bottom: 204 }, size: 60 };
// FLICK (left pad): the thumb travels past `at` x STICKS.R from where it landed within `ms` = a DODGE that way
export const FLICK = { at: 0.9, ms: 150 };

// Lock page zoom (pinch, double tap, iOS gesture events).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'])
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// ---- pads ---------------------------------------------------------------------------------------------------
// LOOK (b27, his: "take the game logo and the flat drawn style"): the pads are stickers -- an ink outline, a solid offset
// shadow (never CSS filter / drop-shadow on always-on HUD: iOS re-rasterises it every frame), LEFT = a gold + icing ring
// with fly chevrons and a gold-star knob, RIGHT = a candy-cane-ringed target with a peppermint knob. The art is SVG data
// URIs (drawn once), so nothing here repaints while a thumb moves.
const INK = '#1d1420', CREAM = '#fcefd4', CANDY = '#e8263a', GOLD = '#f4b73a';
const svgUrl = (vb, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>${body}</svg>`)}")`;
const chev = (rot, col) => `<path transform='rotate(${rot} 68 68)' d='M60 27l8-8 8 8' fill='none' stroke='${INK}' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><path transform='rotate(${rot} 68 68)' d='M60 27l8-8 8 8' fill='none' stroke='${col}' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/>`;
const PAD_L = svgUrl('0 0 136 136', `<circle cx='68' cy='68' r='64' fill='${CREAM}' fill-opacity='.16'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${GOLD}' stroke-width='9'/>
<path d='M17 46A55 55 0 0 1 46 15' fill='none' stroke='#fff4c8' stroke-width='3' stroke-linecap='round'/>
<circle cx='68' cy='68' r='58.2' fill='none' stroke='${INK}' stroke-width='2.6'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CREAM}' stroke-width='2' stroke-dasharray='5 7' stroke-opacity='.7'/>
${chev(0, CREAM)}${chev(90, CREAM)}${chev(180, CREAM)}${chev(270, CREAM)}`);
const PAD_R = svgUrl('0 0 136 136', `<circle cx='68' cy='68' r='64' fill='${CANDY}' fill-opacity='.12'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${CREAM}' stroke-width='9'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${CANDY}' stroke-width='9' stroke-dasharray='12.47 12.47' transform='rotate(-8 68 68)'/>
<circle cx='68' cy='68' r='58.2' fill='none' stroke='${INK}' stroke-width='2.6'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CREAM}' stroke-width='2.4' stroke-opacity='.8'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CANDY}' stroke-width='2.4' stroke-dasharray='6 8'/>
<path d='M68 16v12M68 108v12M16 68h12M108 68h12' stroke='${INK}' stroke-width='6.5' stroke-linecap='round'/>
<path d='M68 16v12M68 108v12M16 68h12M108 68h12' stroke='${CREAM}' stroke-width='3' stroke-linecap='round'/>`);
const KN_L = svgUrl('0 0 56 56', `<circle cx='28' cy='28' r='25.5' fill='${CREAM}' stroke='${INK}' stroke-width='3.5'/>
<circle cx='28' cy='28' r='19' fill='none' stroke='${GOLD}' stroke-width='4'/>
<path d='M28 15.5l3.4 7.6 8.2.8-6.2 5.5 1.8 8.1L28 33.3l-7.2 4.2 1.8-8.1-6.2-5.5 8.2-.8z' fill='${GOLD}' stroke='${INK}' stroke-width='2.4' stroke-linejoin='round'/>
<path d='M10 22a19 19 0 0 1 9-10' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/>`);
const KN_R = svgUrl('0 0 56 56', `<circle cx='28' cy='28' r='25.5' fill='#fff8ec' stroke='${INK}' stroke-width='3.5'/>
<g fill='${CANDY}'>${[0, 60, 120, 180, 240, 300].map(a => `<path transform='rotate(${a} 28 28)' d='M28 28C24 21 22 13 25 6.5c4.5-.6 8.5 0 12 1.8C32 12 29 19 28 28z'/>`).join('')}</g>
<circle cx='28' cy='28' r='19.5' fill='none' stroke='${INK}' stroke-width='1.6' stroke-opacity='.35'/>
<circle cx='28' cy='28' r='4' fill='#fff8ec' stroke='${INK}' stroke-width='1.8'/>
<path d='M10 22a19 19 0 0 1 9-10' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/>`);
const css = document.createElement('style');
css.textContent = `
.pad { position: fixed; width: 136px; height: 136px; margin: -68px 0 0 -68px; border-radius: 50%; pointer-events: none; z-index: 6;
  border: 3px solid ${INK}; background: ${PAD_L} center/100% 100% no-repeat; box-shadow: 3px 4px 0 ${INK}99; opacity: .4; transition: opacity .3s; }
.pad.act { opacity: 1; transition: opacity .06s; }
.pad .kn { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
  background: ${KN_L} center/100% 100% no-repeat; box-shadow: 2px 3px 0 ${INK}; }
#padR { background-image: ${PAD_R}; } #padR .kn { background-image: ${KN_R}; }
#padR.firing { box-shadow: 0 0 0 4px #ff3d7f, 3px 4px 0 4px ${INK}; }
#reticle { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; pointer-events: none; z-index: 5; display: none; }
body.play:not(.ret3d) #reticle { display: block; }
body:not(.play) .pad { display: none; }
`;
document.head.appendChild(css);
// the GUN sticker (b61): a stubby candy-red Gatling on a gold badge, ink outline + solid offset shadow (b27 style, no filters);
// LOCKED it rides in the right knob and a padlock badge sits on the pad's rim (tap it = unlock)
const GUN_SVG = `<svg viewBox='0 0 40 40'><path d='M10 12q4-6 9 0' fill='none' stroke='${INK}' stroke-width='3.4' stroke-linecap='round'/>
<rect x='17' y='13.5' width='18' height='8' rx='2' fill='#cfd3de' stroke='${INK}' stroke-width='2.2'/><path d='M19 16.2h14M19 18.8h14' stroke='${INK}' stroke-width='1.3'/>
<rect x='33.5' y='12.2' width='4' height='10.6' rx='1.2' fill='${GOLD}' stroke='${INK}' stroke-width='2'/>
<path d='M10 22l-2.6 9.5h5.4l2.6-9.5z' fill='#8a5230' stroke='${INK}' stroke-width='2.2' stroke-linejoin='round'/>
<rect x='5' y='11' width='15' height='12.5' rx='3.4' fill='${CANDY}' stroke='${INK}' stroke-width='2.4'/>
<path d='M8 14.3h9' stroke='#ff98a2' stroke-width='1.8' stroke-linecap='round'/><circle cx='12.5' cy='19' r='1.8' fill='${GOLD}' stroke='${INK}' stroke-width='1.2'/></svg>`;
const LOCK_SVG = `<svg viewBox='0 0 24 24'><path d='M7.5 11V8.2a4.5 4.5 0 0 1 9 0V11' fill='none' stroke='${INK}' stroke-width='4.4' stroke-linecap='round'/>
<path d='M7.5 11V8.2a4.5 4.5 0 0 1 9 0V11' fill='none' stroke='#d9dbe4' stroke-width='1.8' stroke-linecap='round'/>
<rect x='4.5' y='10.3' width='15' height='11' rx='2.6' fill='${GOLD}' stroke='${INK}' stroke-width='2.2'/>
<circle cx='12' cy='14.6' r='1.7' fill='${INK}'/><path d='M12 15.4v3' stroke='${INK}' stroke-width='1.8' stroke-linecap='round'/></svg>`;
const gunUrl = `url("data:image/svg+xml,${encodeURIComponent(GUN_SVG.replace('<svg ', "<svg xmlns='http://www.w3.org/2000/svg' "))}")`;
const css2 = document.createElement('style');
css2.textContent = `
#gunBtn { position: fixed; z-index: 8; width: ${GUNLOCK.size}px; height: ${GUNLOCK.size}px; margin: -${GUNLOCK.size / 2}px 0 0 -${GUNLOCK.size / 2}px;
  border-radius: 52% 48% 50% 50% / 47% 53% 47% 53%; border: 3px solid ${INK}; box-shadow: 3px 4px 0 ${INK};
  background: ${gunUrl} center/82% no-repeat, radial-gradient(circle at 34% 28%, #fff6dc 0 13%, transparent 14%), ${GOLD};
  transform: rotate(-6deg); pointer-events: auto; touch-action: none; transition: left .28s cubic-bezier(.3,1.5,.5,1), top .28s cubic-bezier(.3,1.5,.5,1), transform .2s; }
#gunBtn.drag { transition: none; transform: rotate(-14deg) scale(1.12); box-shadow: 5px 7px 0 ${INK}; }
#gunBtn.gone { display: none; }
#padR.locked .kn { background: ${gunUrl} center/78% no-repeat, radial-gradient(circle, #fff6dc 0 60%, ${GOLD} 61%); }
#padR .lockb { position: absolute; right: -8px; top: -8px; width: 32px; height: 32px; border-radius: 50%; display: none; pointer-events: auto;
  background: ${CREAM} center/72% no-repeat url("data:image/svg+xml,${encodeURIComponent(LOCK_SVG.replace('<svg ', "<svg xmlns='http://www.w3.org/2000/svg' "))}");
  border: 2.5px solid ${INK}; box-shadow: 2px 3px 0 ${INK}; }
#padR.locked .lockb { display: block; }
#padR.locked { opacity: .62; } #padR.locked.act { opacity: 1; }
#padR.pop .lockb { animation: lockpop .35s cubic-bezier(.3,1.8,.5,1); }
@keyframes lockpop { 0% { transform: scale(.2) rotate(-40deg); } 100% { transform: scale(1) rotate(0); } }
body:not(.play) #gunBtn { display: none; }
`;
document.head.appendChild(css2);
const mkPad = id => { const p = document.createElement('div'); p.className = 'pad'; p.id = id; p.innerHTML = '<div class="kn"></div>'; document.body.appendChild(p); return p; };
const padEl = { L: mkPad('padL'), R: mkPad('padR') };
const lockB = document.createElement('div'); lockB.className = 'lockb'; padEl.R.appendChild(lockB);
const gunEl = document.createElement('div'); gunEl.id = 'gunBtn'; gunEl.className = 'gunbtn'; document.body.appendChild(gunEl);
const ret = document.createElement('div'); ret.id = 'reticle';
// the crosshair: an ink-outlined candy-cane ring + four icing ticks + a red pip (src/main.js RET3 paints the same on a canvas)
ret.innerHTML = `<svg viewBox="0 0 46 46" width="46" height="46"><g fill="none" stroke-linecap="round">
<circle cx="23" cy="23" r="14" stroke="${INK}" stroke-width="6.5"/><circle cx="23" cy="23" r="14" stroke="${CREAM}" stroke-width="3"/>
<circle cx="23" cy="23" r="14" stroke="${CANDY}" stroke-width="3" stroke-dasharray="5.5 5.5" stroke-linecap="butt"/>
<path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${INK}" stroke-width="6.5"/><path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${CREAM}" stroke-width="3"/></g>
<circle cx="23" cy="23" r="3.6" fill="${CANDY}" stroke="${INK}" stroke-width="2"/></svg>`;
document.body.appendChild(ret);

const pads = { L: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, R: { id: null, ox: 0, oy: 0, x: 0, y: 0 } };
const home = side => ({ x: side === 'L' ? 110 : innerWidth - 110, y: innerHeight - 120 });
const park = () => ({ x: innerWidth - GUNLOCK.park.right, y: innerHeight - GUNLOCK.park.bottom });
function placeHome() {
  for (const s of ['L', 'R']) if (pads[s].id === null) { const h = home(s); padEl[s].style.left = h.x + 'px'; padEl[s].style.top = h.y + 'px'; padEl[s].firstChild.style.transform = ''; }
  if (!gunDrag) { const g = gun.locked ? home('R') : park(); gunEl.style.left = g.x + 'px'; gunEl.style.top = g.y + 'px'; }
}

// ---- GUN LOCK -------------------------------------------------------------------------------------------------
const gun = { locked: false };
let gunDrag = null;   // { id } while a finger carries the gun sticker
try { gun.locked = localStorage.getItem('gunLock') === '1'; } catch (e) {}
const snd = (n, o) => window.sfx?.play(n, o);
function setLocked(on, quiet) {
  gun.locked = on; input.locked = on;
  try { localStorage.setItem('gunLock', on ? '1' : '0'); } catch (e) {}
  padEl.R.classList.toggle('locked', on); gunEl.classList.toggle('gone', on && !gunDrag);
  if (!quiet) {
    if (on) { snd('casing', { vol: 0.9, rate: 1.7 }); snd('ui_tap', { vol: 0.7, rate: 0.7 }); padEl.R.classList.remove('pop'); void padEl.R.offsetWidth; padEl.R.classList.add('pop'); }
    else snd('ui_back', { vol: 0.6, rate: 1.2 });
  }
}
setLocked(gun.locked, true);
/** lock while a finger is still down: that same finger now holds the FIRE pad (it starts shooting at once -- his words) */
function lockWith(e) {
  gunDrag = null; gunEl.classList.remove('drag'); setLocked(true);
  const P = pads.R, h = home('R');
  if (P.id === null) {
    P.id = e.pointerId; P.ox = h.x; P.oy = h.y; P.t0 = performance.now() - STICKS.tapMs - 1; P.maxd = 1; P.sx = e.clientX; P.sy = e.clientY;
    const dx = e.clientX - h.x, dy = e.clientY - h.y; P.x = dx / STICKS.R; P.y = -dy / STICKS.R;
    padEl.R.style.left = h.x + 'px'; padEl.R.style.top = h.y + 'px'; padEl.R.classList.add('act');
  }
  placeHome();
}
function gunMove(e) {
  gunEl.style.left = e.clientX + 'px'; gunEl.style.top = e.clientY + 'px';
  const h = home('R');
  if (Math.hypot(e.clientX - h.x, e.clientY - h.y) < GUNLOCK.snapAt * 68) lockWith(e);
}
gunEl.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); if (gun.locked || gunDrag) return;
  gunDrag = { id: e.pointerId }; gunEl.classList.add('drag'); snd('ui_tap', { vol: 0.4, rate: 1.4 }); lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  gunMove(e);
});
lockB.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (gun.locked) { setLocked(false); placeHome(); } });
placeHome(); addEventListener('resize', placeHome);

const isUI = t => t.closest?.('.btn, .mn .b, #pauseBtn, a, .info, .col, .gunbtn, .lockb');
window.addEventListener('pointerdown', e => {
  if (isUI(e.target) || e.pointerType === 'mouse') return;
  const side = e.clientX < innerWidth * 0.5 ? 'L' : 'R', P = pads[side];
  if (P.id !== null) return;
  P.id = e.pointerId; P.ox = e.clientX; P.oy = e.clientY; P.x = P.y = 0; P.t0 = performance.now(); P.maxd = 0; P.sx = e.clientX; P.sy = e.clientY; P.flicked = false;
  // RIGHT pad (his): a touch ON the resting stick but off its middle shoots straight away, that way; the middle is the
  // jump tap. So a touch inside the resting pad keeps the pad where it is and reads the offset at once.
  if (side === 'R' && gun.locked) {
    const h = home('R'), dx = e.clientX - h.x, dy = e.clientY - h.y, R = STICKS.R;
    if (Math.hypot(dx, dy) < R * 1.25) {
      P.ox = h.x; P.oy = h.y; const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      P.x = dx * k / R; P.y = -dy * k / R;
      padEl.R.firstChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    }
  }
  padEl[side].style.left = P.ox + 'px'; padEl[side].style.top = P.oy + 'px'; padEl[side].classList.add('act');
  lastDevice = 'touch'; hideHint();
});
window.addEventListener('pointermove', e => {
  if (gunDrag && e.pointerId === gunDrag.id) { gunMove(e); return; }
  if (e.pointerType === 'mouse') { input.mouse = { x: e.clientX, y: e.clientY }; lastDevice = 'mouse'; return; }
  for (const s of ['L', 'R']) {
    const P = pads[s]; if (e.pointerId !== P.id) continue;
    let dx = e.clientX - P.ox, dy = e.clientY - P.oy; const d = Math.hypot(dx, dy), R = STICKS.R;
    if (d > R) { dx *= R / d; dy *= R / d; }
    padEl[s].firstChild.style.transform = `translate(${dx}px,${dy}px)`;
    P.x = dx / R; P.y = -dy / R; P.maxd = Math.max(P.maxd || 0, Math.hypot(e.clientX - P.sx, e.clientY - P.sy) / R);   // travel from where the thumb LANDED
    // LEFT FLICK = DODGE: past FLICK.at of the radius from where the thumb landed, inside FLICK.ms (distance, not a speed estimate)
    if (s === 'L' && !P.flicked && performance.now() - P.t0 < FLICK.ms && P.maxd >= FLICK.at) {
      const fx = e.clientX - P.sx, fy = e.clientY - P.sy, fd = Math.hypot(fx, fy) || 1;
      P.flicked = true; input.dodge = { x: fx / fd, y: -fy / fd };
    }
    // LOCKED: dragging the thumb well outside the pad pulls the gun back OUT (it follows the finger; let go = it flies home)
    if (s === 'R' && gun.locked && d > GUNLOCK.outR * R) {
      P.id = null; P.x = P.y = 0; padEl.R.classList.remove('act', 'firing');
      setLocked(false); gunDrag = { id: e.pointerId }; gunEl.classList.remove('gone'); gunEl.classList.add('drag'); placeHome(); gunMove(e);
    }
  }
});
const end = e => {
  if (gunDrag && e.pointerId === gunDrag.id) {   // let go of the gun: close enough = it snaps in, else it flies back to its spot
    const h = home('R');
    if (Math.hypot(e.clientX - h.x, e.clientY - h.y) < GUNLOCK.dropAt * 68) { gunDrag = null; gunEl.classList.remove('drag'); setLocked(true); }
    else { gunDrag = null; gunEl.classList.remove('drag'); }
    placeHome(); return;
  }
  for (const s of ['L', 'R']) {
    const P = pads[s]; if (e.pointerId !== P.id) continue;
    // a quick tap ANYWHERE on the RIGHT pad = JUMP (his: any quick tap, not just the middle; holding = shooting)
    if (s === 'R' && performance.now() - P.t0 < STICKS.tapMs && (P.maxd || 0) < STICKS.tapR) input.tap = true;
    P.id = null; P.x = P.y = 0; padEl[s].classList.remove('act', 'firing'); placeHome();
  }
};
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);

// mouse: the reticle follows it, left button fires (only on the game canvas, not on menus)
let mouseDown = false, lastDevice = 'touch';
window.addEventListener('mousedown', e => { if (e.button === 0 && !isUI(e.target) && e.target.tagName === 'CANVAS') mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });

// boost button
const boostEl = document.getElementById('boost');
let boostBtn = false;
if (boostEl) {
  const on = e => { e.preventDefault(); e.stopPropagation(); boostBtn = true; boostEl.classList.add('on'); };
  const off = e => { e.preventDefault(); boostBtn = false; boostEl.classList.remove('on'); };
  boostEl.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) boostEl.addEventListener(ev, off);
}

const keys = new Set();
window.addEventListener('keydown', e => { keys.add(e.code); hideHint(); if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyC' && !e.repeat) { let x = 0, y = 0; if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y++; if (keys.has('KeyS')) y--; input.dodge = { x, y }; }   // C = dodge
  if (e.code === 'KeyG' && !e.repeat) { setLocked(!gun.locked); placeHome(); } });   // G = gun lock
window.addEventListener('keyup', e => keys.delete(e.code));

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 2500); }

// gamepad: left stick flies / walks, right stick = CAMERA (unlocked) or AIM + fire past the threshold (locked); RB toggles the
// GUN LOCK, LT fires, RT / A boosts, B dodges (the left stick's way)
let gpRB = false, gpB = false;
function gamepad() {
  const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v;
  const g = { lx: dz(gp.axes[0] || 0), ly: -dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: -dz(gp.axes[3] || 0),
    boost: !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed), fire: !!gp.buttons[6]?.pressed };
  const rb = !!gp.buttons[5]?.pressed, b = !!gp.buttons[1]?.pressed;
  if (rb && !gpRB) { setLocked(!gun.locked); placeHome(); }
  if (b && !gpB) input.dodge = { x: g.lx, y: g.ly };
  gpRB = rb; gpB = b;
  if (g.lx || g.ly || g.rx || g.ry || g.boost || g.fire || rb || b) lastDevice = 'pad';
  return g;
}

export function pollInput() {
  const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.4);
  const gp = gamepad();
  let kx = 0, ky = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  const L = pads.L, R = pads.R, now = performance.now();
  input.steer = Math.max(-1, Math.min(1, curve(L.x) + kx + (gp ? curve(gp.lx) : 0)));
  input.climb = Math.max(-1, Math.min(1, curve(L.y) + ky + (gp ? curve(gp.ly) : 0)));
  input.moveHold = L.id !== null && !L.flicked && now - (L.t0 || 0) < FLICK.ms;
  // right stick: touch pad > gamepad right stick. LOCKED = aim + fire, UNLOCKED = the camera (the mouse aims as a screen point)
  let rx = R.x, ry = R.y;
  if (R.id === null && gp) { rx = gp.rx; ry = gp.ry; }
  const locked = gun.locked; input.locked = locked;
  input.aimX = locked ? rx : 0; input.aimY = locked ? ry : 0;
  // camera keys for a keyboard: J / L turn, I / K tilt
  const ckx = (keys.has('KeyL') ? 1 : 0) - (keys.has('KeyJ') ? 1 : 0), cky = (keys.has('KeyI') ? 1 : 0) - (keys.has('KeyK') ? 1 : 0);
  input.camX = Math.max(-1, Math.min(1, (locked ? 0 : rx) + ckx)); input.camY = Math.max(-1, Math.min(1, (locked ? 0 : ry) + cky));
  const push = Math.hypot(rx, ry);
  // his: the whole right stick shoots -- off-centre at once, the middle once it's held past a tap (a quick tap = jump)
  const heldR = locked && R.id !== null && now - (R.t0 || 0) > STICKS.tapMs;
  const padFire = locked && ((R.id !== null && push > STICKS.fireAt) || heldR || (R.id === null && gp && push > STICKS.fireAt));
  input.fire = padFire || mouseDown || keys.has('Space') || !!gp?.fire;
  padEl.R.classList.toggle('firing', locked && R.id !== null && (push > STICKS.fireAt || heldR));
  input.boost = boostBtn || keys.has('ShiftLeft') || keys.has('ShiftRight') || !!gp?.boost;
  if (lastDevice !== 'mouse') input.mouse = null;
  input.device = lastDevice;
}

/** the game tells us where the reticle is drawn (px) */
export function showReticle(x, y, firing) {
  ret.style.left = x + 'px'; ret.style.top = y + 'px';
  ret.style.transform = firing ? `scale(${0.9 + Math.random() * 0.15}) rotate(${Math.random() * 20 - 10}deg)` : '';
}
