// TWIN STICKS (his, Nov 23): LEFT stick FLIES the sleigh, RIGHT stick AIMS + SHOOTS (push it = the reticle moves that way and
// the gun fires; let go = it stops). Both pads FLOAT: each half of the screen is a zone and the pad appears under the thumb
// (Korajin's STICK.dyn); they rest faintly in their corners. BOOST is its own button. A gamepad drives the same values;
// on a desktop the mouse IS the reticle and the left button fires.
// Output each frame: input.steer, input.climb (left, -1..1, + = right / up), input.aimX, input.aimY (right, -1..1, + = right / up),
// input.fire, input.boost, input.mouse (reticle in px when the mouse is aiming, else null).

export const input = { steer: 0, climb: 0, aimX: 0, aimY: 0, fire: false, boost: false, mouse: null };
export const STICKS = { R: 58, fireAt: 0.35, tapR: 0.35, tapMs: 180, deadL: 0.06 };   // right pad: inside tapR = the middle (jump tap, no fire)

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
const mkPad = id => { const p = document.createElement('div'); p.className = 'pad'; p.id = id; p.innerHTML = '<div class="kn"></div>'; document.body.appendChild(p); return p; };
const padEl = { L: mkPad('padL'), R: mkPad('padR') };
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
function placeHome() {
  for (const s of ['L', 'R']) if (pads[s].id === null) { const h = home(s); padEl[s].style.left = h.x + 'px'; padEl[s].style.top = h.y + 'px'; padEl[s].firstChild.style.transform = ''; }
}
placeHome(); addEventListener('resize', placeHome);

const isUI = t => t.closest?.('.btn, .mn .b, #pauseBtn, a, .info, .col');
window.addEventListener('pointerdown', e => {
  if (isUI(e.target) || e.pointerType === 'mouse') return;
  const side = e.clientX < innerWidth * 0.5 ? 'L' : 'R', P = pads[side];
  if (P.id !== null) return;
  P.id = e.pointerId; P.ox = e.clientX; P.oy = e.clientY; P.x = P.y = 0; P.t0 = performance.now(); P.maxd = 0; P.sx = e.clientX; P.sy = e.clientY;
  // RIGHT pad (his): a touch ON the resting stick but off its middle shoots straight away, that way; the middle is the
  // jump tap. So a touch inside the resting pad keeps the pad where it is and reads the offset at once.
  if (side === 'R') {
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
  if (e.pointerType === 'mouse') { input.mouse = { x: e.clientX, y: e.clientY }; lastDevice = 'mouse'; return; }
  for (const s of ['L', 'R']) {
    const P = pads[s]; if (e.pointerId !== P.id) continue;
    let dx = e.clientX - P.ox, dy = e.clientY - P.oy; const d = Math.hypot(dx, dy), R = STICKS.R;
    if (d > R) { dx *= R / d; dy *= R / d; }
    padEl[s].firstChild.style.transform = `translate(${dx}px,${dy}px)`;
    P.x = dx / R; P.y = -dy / R; P.maxd = Math.max(P.maxd || 0, Math.hypot(e.clientX - P.sx, e.clientY - P.sy) / R);   // travel from where the thumb LANDED
  }
});
const end = e => {
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
window.addEventListener('keydown', e => { keys.add(e.code); hideHint(); if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('keyup', e => keys.delete(e.code));

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 2500); }

// gamepad: left stick flies, right stick aims + fires past the threshold, RT / A boosts, RB fires straight ahead
function gamepad() {
  const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v;
  const g = { lx: dz(gp.axes[0] || 0), ly: -dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: -dz(gp.axes[3] || 0),
    boost: !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed), fire: !!gp.buttons[5]?.pressed };
  if (g.lx || g.ly || g.rx || g.ry || g.boost || g.fire) lastDevice = 'pad';
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
  const L = pads.L, R = pads.R;
  input.steer = Math.max(-1, Math.min(1, curve(L.x) + kx + (gp ? curve(gp.lx) : 0)));
  input.climb = Math.max(-1, Math.min(1, curve(L.y) + ky + (gp ? curve(gp.ly) : 0)));
  // aim: touch right pad > gamepad right stick > nothing (the mouse is handled as a screen point by the game)
  let ax = R.x, ay = R.y;
  if (R.id === null && gp) { ax = gp.rx; ay = gp.ry; }
  input.aimX = ax; input.aimY = ay;
  const push = Math.hypot(ax, ay);
  // his: the whole right stick shoots -- off-centre at once, the middle once it's held past a tap (a quick tap = jump)
  const heldR = R.id !== null && performance.now() - (R.t0 || 0) > STICKS.tapMs;
  input.fire = (R.id !== null && push > STICKS.fireAt) || heldR || mouseDown || keys.has('Space') || !!gp?.fire;
  padEl.R.classList.toggle('firing', R.id !== null && (push > STICKS.fireAt || heldR));
  input.boost = boostBtn || keys.has('ShiftLeft') || keys.has('ShiftRight') || !!gp?.boost;
  if (lastDevice !== 'mouse') input.mouse = null;
  input.device = lastDevice;
}

/** the game tells us where the reticle is drawn (px) */
export function showReticle(x, y, firing) {
  ret.style.left = x + 'px'; ret.style.top = y + 'px';
  ret.style.transform = firing ? `scale(${0.9 + Math.random() * 0.15}) rotate(${Math.random() * 20 - 10}deg)` : '';
}
