// CONTROLS (b76, his: "just having it SHOOT WHEN YOU'RE TOUCHING the stick is better... closer to what CALL OF DUTY MOBILE does").
// LEFT pad (floating, left half) FLIES the sleigh / walks him; a flick = DODGE. RIGHT HALF OF THE SCREEN = LOOK: a finger down
// anywhere there (not on a button) and dragged turns the camera (drag px -> yaw / pitch, LOOK); a quick TAP there = JUMP.
// FIRE BUTTON (FIREBTN) = the equipped weapon's icon: PRESS = fire now; while held a ring folds out round it and dragging the thumb
// AIMS exactly like LOOK while the gun keeps firing; lift = stop. WEAPON DIAL (DIAL) next to it: rotate it with a finger (circular
// drag) = next / previous weapon (snaps with a click); tap its centre = gun away / back out; tap a rim icon = that weapon.
// ITEMS (PRESENT / BOMB in the sleigh, GRENADE on foot) sit above the left pad (ITEMS: delivery.js + main.js own their logic).
// Output each frame: input.steer, input.climb (left, -1..1, + = right / up), input.lookDX / lookDY (px of LOOK drag since the last
// poll, right half + the fire thumb + a mouse drag), input.camX / camY (gamepad right stick / I J K L: rates, -1..1), input.rx / ry
// (the same raw stick), input.fire (held), input.dialStep (+-n steps, the game clears it), input.dialPick (a key), input.holster,
// input.tap (jump), input.boost, input.dodge, input.moveHold, input.lookDown (a LOOK finger or the fire thumb is on the glass).
// The game paints the widgets with setFire(key | null) and setDial(items, sel, out).

export const input = { steer: 0, climb: 0, camX: 0, camY: 0, rx: 0, ry: 0, lookDX: 0, lookDY: 0, lookDown: false, fire: false,
  dialStep: 0, dialPick: null, holster: false, boost: false, mouse: null, dodge: null, moveHold: false, tap: false };
export const STICKS = { R: 58, deadL: 0.06 };
// LOOK: rad per px of drag (yaw / pitch), on foot and in the sleigh's chase camera; a touch shorter than tapMs that moved less than
// tapPx = JUMP; sleighBack = s after every look finger lifts before the chase camera eases back behind the team (rate sleighEase)
export const LOOK = { footYaw: 0.0068, footPitch: 0.005, sleighYaw: 0.006, sleighPitch: 0.0042, tapMs: 220, tapPx: 14, sleighBack: 1.2, sleighEase: 2.5, mouseK: 0.8 };
// FIREBTN: centre x px from the right edge, y px from the bottom; size px; ring = the folded-out ring's radius px; lookK = drag gain vs
// LOOK; dotMax = how far the thumb dot follows (px); fold = s the ring takes to open
export const FIREBTN = { x: 110, y: 185, size: 86, ring: 92, lookK: 1, dotMax: 74, fold: 0.16 };
// DIAL: centre x / y px from the right / bottom edges, size px, iconR = rim radius of the icons, gain = dial turn per degree of finger
// turn (landX / landY = its centre in LANDSCAPE, left of the fire button: the top-right corner is the pause button), a tap (< tapMs, < tapDeg of turn) inside centreR px = holster, outside = pick the icon under it
export const DIAL = { x: 56, y: 306, landX: 246, landY: 112, size: 100, iconR: 36, gain: 1.5, tapMs: 260, tapDeg: 12, centreR: 17 };
// ITEMS: the item stickers above the left pad: slot i centre = (x + i * gap, y + i * stagger) px from the left / bottom edges; a hold
// past tapMs = the aim (drop-cam / throw arc); sliding slideOff px past the button = cancel
export const ITEMS = { x: 52, y: 238, gap: 76, stagger: 16, size: 62, tapMs: 200, slideOff: 30 };
// FLICK (left pad): the thumb travels past `at` x STICKS.R from where it landed within `ms` = a DODGE that way
export const FLICK = { at: 0.9, ms: 150 };
/** place a fixed element by its CENTRE: x / y px from the given edges (safe areas added) */
export function placeAt(el, x, y, size, fromLeft = false) {
  el.style.width = el.style.height = size + 'px';
  el.style[fromLeft ? 'left' : 'right'] = `calc(env(safe-area-inset-${fromLeft ? 'left' : 'right'}) + ${x - size / 2}px)`;
  el.style.bottom = `calc(env(safe-area-inset-bottom) + ${y - size / 2}px)`;
}

// Lock page zoom (pinch, double tap, iOS gesture events).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'])
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---- art (b27 sticker look: ink outline, solid offset shadow, never CSS filter on always-on HUD) ------------------------------
const INK = '#1d1420', CREAM = '#fcefd4', CANDY = '#e8263a', GOLD = '#f4b73a';
const svgUrl = (vb, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>${body}</svg>`)}")`;
const chev = (rot, col) => `<path transform='rotate(${rot} 68 68)' d='M60 27l8-8 8 8' fill='none' stroke='${INK}' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/><path transform='rotate(${rot} 68 68)' d='M60 27l8-8 8 8' fill='none' stroke='${col}' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/>`;
const PAD_L = svgUrl('0 0 136 136', `<circle cx='68' cy='68' r='64' fill='${CREAM}' fill-opacity='.16'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${GOLD}' stroke-width='9'/>
<path d='M17 46A55 55 0 0 1 46 15' fill='none' stroke='#fff4c8' stroke-width='3' stroke-linecap='round'/>
<circle cx='68' cy='68' r='58.2' fill='none' stroke='${INK}' stroke-width='2.6'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CREAM}' stroke-width='2' stroke-dasharray='5 7' stroke-opacity='.7'/>
${chev(0, CREAM)}${chev(90, CREAM)}${chev(180, CREAM)}${chev(270, CREAM)}`);
const KN_L = svgUrl('0 0 56 56', `<circle cx='28' cy='28' r='25.5' fill='${CREAM}' stroke='${INK}' stroke-width='3.5'/>
<circle cx='28' cy='28' r='19' fill='none' stroke='${GOLD}' stroke-width='4'/>
<path d='M28 15.5l3.4 7.6 8.2.8-6.2 5.5 1.8 8.1L28 33.3l-7.2 4.2 1.8-8.1-6.2-5.5 8.2-.8z' fill='${GOLD}' stroke='${INK}' stroke-width='2.4' stroke-linejoin='round'/>
<path d='M10 22a19 19 0 0 1 9-10' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/>`);
const KN_R = svgUrl('0 0 56 56', `<circle cx='28' cy='28' r='25.5' fill='#fff8ec' stroke='${INK}' stroke-width='3.5'/>
<g fill='${CANDY}'>${[0, 60, 120, 180, 240, 300].map(a => `<path transform='rotate(${a} 28 28)' d='M28 28C24 21 22 13 25 6.5c4.5-.6 8.5 0 12 1.8C32 12 29 19 28 28z'/>`).join('')}</g>
<circle cx='28' cy='28' r='19.5' fill='none' stroke='${INK}' stroke-width='1.6' stroke-opacity='.35'/>
<circle cx='28' cy='28' r='4' fill='#fff8ec' stroke='${INK}' stroke-width='1.8'/>
<path d='M10 22a19 19 0 0 1 9-10' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/>`);
const ICON = {
  gatling: `<path d='M6 10q4-6 9 0' fill='none' stroke='${INK}' stroke-width='3' stroke-linecap='round'/><rect x='13' y='11' width='14' height='7' rx='2' fill='#cfd3de' stroke='${INK}' stroke-width='2'/><path d='M15 13.4h11M15 15.8h11' stroke='${INK}' stroke-width='1.1'/><rect x='26' y='10' width='3.4' height='9' rx='1' fill='${GOLD}' stroke='${INK}' stroke-width='1.8'/><path d='M7 19l-2.2 7.5h4.6l2.2-7.5z' fill='#8a5230' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><rect x='2.5' y='9' width='13' height='11' rx='3' fill='${CANDY}' stroke='${INK}' stroke-width='2.2'/>`,
  rifle: `<path d='M2 16h6l3-3h17v3.4H12l-2.5 2.6v5.5H5.5L4 19H2z' fill='#8a5230' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><rect x='11' y='9.5' width='9' height='3.2' rx='1.4' fill='#cfd3de' stroke='${INK}' stroke-width='1.8'/><path d='M27 13v3.4' stroke='${GOLD}' stroke-width='2.4'/>`,
  rocket: `<path d='M4 18l4-4h14l5 2-5 2H8z' fill='#d8282e' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><path d='M8 14l-4-4v4M8 18l-4 4v-4' fill='${GOLD}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/><path d='M22 14l5 2-5 2z' fill='#f6efe2' stroke='${INK}' stroke-width='1.6' stroke-linejoin='round'/><path d='M1.5 16h2' stroke='#ffb050' stroke-width='3' stroke-linecap='round'/>`,
  snowball: `<circle cx='15' cy='16' r='9' fill='#f6f8ff' stroke='${INK}' stroke-width='2.4'/><path d='M10 13a5.5 5.5 0 0 1 4-3' fill='none' stroke='#fff' stroke-width='2.4' stroke-linecap='round'/><circle cx='18' cy='19' r='1.4' fill='#b8c8e8'/><circle cx='12.5' cy='19.5' r='1' fill='#b8c8e8'/>`,
  grenade: `<circle cx='14' cy='18' r='9' fill='${CANDY}' stroke='${INK}' stroke-width='2.4'/><ellipse cx='10.8' cy='14.8' rx='2.4' ry='1.7' fill='#ffd0d6' transform='rotate(-35 10.8 14.8)'/><rect x='10.5' y='6.8' width='7' height='4' rx='1.2' fill='${GOLD}' stroke='${INK}' stroke-width='1.9'/><path d='M14 6.8c0-3 2.5-4 5-3.2' fill='none' stroke='${INK}' stroke-width='2' stroke-linecap='round'/><circle cx='20.5' cy='3.4' r='2.2' fill='#ffe14a' stroke='${INK}' stroke-width='1.2'/>`,
  present: `<rect x='5' y='12' width='20' height='14' rx='2.4' fill='${CANDY}' stroke='${INK}' stroke-width='2.2'/><rect x='3.5' y='8.5' width='23' height='5' rx='2' fill='#ff4a5c' stroke='${INK}' stroke-width='2.2'/><path d='M15 8.5V26' stroke='${INK}' stroke-width='6'/><path d='M15 8.5V26' stroke='${GOLD}' stroke-width='2.8'/><path d='M15 8.5c-2-4-7-4.5-6.8-1.5.3 1.8 4.2 1.5 6.8 1.5zM15 8.5c2-4 7-4.5 6.8-1.5-.3 1.8-4.2 1.5-6.8 1.5z' fill='${GOLD}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/>`,
  bomb: `<circle cx='14' cy='18' r='9' fill='#5a3d96' stroke='${INK}' stroke-width='2.4'/><circle cx='14' cy='18' r='4.2' fill='#9dff4a' stroke='${INK}' stroke-width='1.6'/><rect x='10.5' y='6.8' width='7' height='4' rx='1.2' fill='${GOLD}' stroke='${INK}' stroke-width='1.9'/><path d='M14 6.8c0-3 2.5-4 5-3.2' fill='none' stroke='${INK}' stroke-width='2' stroke-linecap='round'/><circle cx='20.5' cy='3.4' r='2.2' fill='#ffe14a' stroke='${INK}' stroke-width='1.2'/>`,
};
ICON.fist = `<path d='M7 13.5c0-2 1.4-3 3-3h11c2.2 0 3.5 1.4 3.5 3.6v5.4c0 4-2.8 6.8-6.8 6.8h-4.4C9.4 26.3 7 23.6 7 20z' fill='#f0c8a0' stroke='${INK}' stroke-width='2.3' stroke-linejoin='round'/><path d='M11.5 10.5v6M15.5 10.5v6M19.5 10.5v6' stroke='${INK}' stroke-width='1.8' stroke-linecap='round'/><path d='M7 17.5c2.5-.4 4.4.6 5.4 2.6' fill='none' stroke='${INK}' stroke-width='2' stroke-linecap='round'/><path d='M8 26.5h12v3H8z' fill='${CANDY}' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/>`;
const icoSvg = (k, s = 30) => `<svg viewBox="0 0 30 30" width="${s}" height="${s}">${ICON[k] || ''}</svg>`;
// the fire ring that folds out: a candy-cane ring with four ink-outlined chevrons pointing out (the aim directions)
const RING_SVG = (() => {
  const R = FIREBTN.ring, S = R + 14, ch = rot => `<g transform='rotate(${rot})'><path d='M-9 ${-R - 3}l9-9 9 9' fill='none' stroke='${INK}' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/><path d='M-9 ${-R - 3}l9-9 9 9' fill='none' stroke='${CREAM}' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'/></g>`;
  return `<svg viewBox='${-S} ${-S} ${2 * S} ${2 * S}' width='${2 * S}' height='${2 * S}'><circle r='${R}' fill='${CANDY}' fill-opacity='.10'/>
<circle r='${R}' fill='none' stroke='${INK}' stroke-width='9'/><circle r='${R}' fill='none' stroke='${CREAM}' stroke-width='5'/>
<circle r='${R}' fill='none' stroke='${CANDY}' stroke-width='5' stroke-dasharray='11 11'/>${[0, 90, 180, 270].map(ch).join('')}</svg>`;
})();
const css = document.createElement('style');
css.textContent = `
.pad { position: fixed; width: 136px; height: 136px; margin: -68px 0 0 -68px; border-radius: 50%; pointer-events: none; z-index: 6;
  border: 3px solid ${INK}; background: ${PAD_L} center/100% 100% no-repeat; box-shadow: 3px 4px 0 ${INK}99; opacity: .4; transition: opacity .3s; }
.pad.act { opacity: 1; transition: opacity .06s; }
.pad .kn { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
  background: ${KN_L} center/100% 100% no-repeat; box-shadow: 2px 3px 0 ${INK}; }
#lookDot { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; pointer-events: none; z-index: 6;
  border: 2.5px solid ${INK}; background: ${CREAM}55; box-shadow: 2px 3px 0 ${INK}66; display: none; }
#lookDot.act { display: block; }
#fireBtn { z-index: 7; border-radius: 50% 47% 52% 49% / 48% 52% 47% 53%; transform: rotate(-4deg);
  background: radial-gradient(circle at 33% 27%, #ff8a96 0 13%, transparent 14%), ${CANDY}; box-shadow: inset 0 0 0 3.5px #ff7d8b, 3px 4px 0 ${INK}; }
#fireBtn .ico { position: relative; width: 54%; height: 54%; z-index: 2; }
#fireBtn .ico svg { width: 100%; height: 100%; display: block; }
#fireBtn .bg { position: absolute; inset: 16%; border-radius: 50%; background: ${CREAM}; border: 2.5px solid ${INK}; z-index: 1; }
#fireBtn.unarmed { background: #9b8f96; box-shadow: inset 0 0 0 3.5px #b9aeb4, 3px 4px 0 ${INK}; }
#fireBtn.unarmed .ico { opacity: .7; }
#fireBtn.held { transform: rotate(-4deg) translate(2px, 3px) scale(.95); box-shadow: inset 0 0 0 3.5px #fff, 1px 1px 0 ${INK}; }
#fireBtn .fring { position: absolute; left: 50%; top: 50%; width: 0; height: 0; z-index: 0; opacity: 0; transform: scale(.4) rotate(-70deg);
  transition: transform ${FIREBTN.fold}s cubic-bezier(.3, 1.5, .55, 1), opacity ${FIREBTN.fold * 0.6}s; }
#fireBtn .fring svg { position: absolute; transform: translate(-50%, -50%); left: 0; top: 0; }
#fireBtn.held .fring { opacity: 1; transform: scale(1) rotate(0deg); }
#fireBtn .fdot { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; z-index: 3; border-radius: 50%;
  background: ${KN_R} center/100% 100% no-repeat; box-shadow: 2px 3px 0 ${INK}; display: none; }
#fireBtn.held .fdot { display: block; }
#wdial { z-index: 7; border-radius: 50%; background: ${CREAM}; border: 3px solid ${INK}; box-shadow: inset 0 0 0 4px ${GOLD}, 3px 4px 0 ${INK}; }
#wdial .rot { position: absolute; inset: 0; transition: transform .12s ease-out; }
#wdial.drag .rot { transition: none; }
#wdial .wi { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; opacity: .55; }
#wdial .wi.on { opacity: 1; }
#wdial .wi svg { width: 100%; height: 100%; display: block; }
#wdial .notch { position: absolute; left: 50%; top: -11px; width: 0; height: 0; margin-left: -8px; border: 8px solid transparent; border-top: 11px solid ${INK}; z-index: 2; }
#wdial .notch::after { content: ''; position: absolute; left: -5px; top: -10px; border: 5px solid transparent; border-top: 7px solid ${GOLD}; }
#wdial .hub { position: absolute; left: 50%; top: 50%; width: ${DIAL.centreR * 2}px; height: ${DIAL.centreR * 2}px; margin: -${DIAL.centreR}px 0 0 -${DIAL.centreR}px;
  border-radius: 50%; background: ${CANDY}; border: 2.5px solid ${INK}; box-shadow: 1.5px 2px 0 ${INK}; display: grid; place-items: center; }
#wdial .hub svg { width: 70%; height: 70%; }
#wdial.away .hub { background: #9b8f96; }
#wdial.away .wi.on { opacity: .6; }
#reticle { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; pointer-events: none; z-index: 5; display: none; }
body.play:not(.ret3d) #reticle { display: block; }
body:not(.play) .pad, body:not(.play) #fireBtn, body:not(.play) #wdial, body:not(.play) #lookDot { display: none; }
`;
document.head.appendChild(css);
const padL = document.createElement('div'); padL.className = 'pad'; padL.id = 'padL'; padL.innerHTML = '<div class="kn"></div>'; document.body.appendChild(padL);
const lookDot = document.createElement('div'); lookDot.id = 'lookDot'; document.body.appendChild(lookDot);
const ret = document.createElement('div'); ret.id = 'reticle';
// the crosshair: an ink-outlined candy-cane ring + four icing ticks + a red pip (src/main.js RET3 paints the same on a canvas)
ret.innerHTML = `<svg viewBox="0 0 46 46" width="46" height="46"><g fill="none" stroke-linecap="round">
<circle cx="23" cy="23" r="14" stroke="${INK}" stroke-width="6.5"/><circle cx="23" cy="23" r="14" stroke="${CREAM}" stroke-width="3"/>
<circle cx="23" cy="23" r="14" stroke="${CANDY}" stroke-width="3" stroke-dasharray="5.5 5.5" stroke-linecap="butt"/>
<path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${INK}" stroke-width="6.5"/><path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${CREAM}" stroke-width="3"/></g>
<circle cx="23" cy="23" r="3.6" fill="${CANDY}" stroke="${INK}" stroke-width="2"/></svg>`;
document.body.appendChild(ret);
const hud = document.getElementById('hud') || document.body;
let lastDevice = 'touch';
const look = { x: 0, y: 0 };   // px accumulated since the last poll

// ---- FIRE BUTTON -------------------------------------------------------------------------------------------------------------------
const fireEl = document.createElement('div'); fireEl.className = 'btn'; fireEl.id = 'fireBtn';
fireEl.innerHTML = `<div class="fring">${RING_SVG}</div><div class="bg"></div><div class="ico"></div><div class="fdot"></div>`;
hud.appendChild(fireEl); placeAt(fireEl, FIREBTN.x, FIREBTN.y, FIREBTN.size);
const fireIco = fireEl.querySelector('.ico'), fireDot = fireEl.querySelector('.fdot');
const fire = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
let fireKey = '';
/** the fire button shows this weapon's icon (null = unarmed: a fist, greyed) */
export function setFire(key) {
  const k = key || 'fist'; if (k === fireKey) return; fireKey = k;
  fireIco.innerHTML = icoSvg(k); fireEl.classList.toggle('unarmed', !key);
}
fireEl.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); if (fire.id !== null) return;
  fire.id = e.pointerId; fire.x = fire.ox = e.clientX; fire.y = fire.oy = e.clientY; try { fireEl.setPointerCapture(fire.id); } catch (_) {}
  fireEl.classList.add('held'); fireDot.style.transform = ''; lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch'; hideHint();
});
fireEl.addEventListener('pointermove', e => {
  if (e.pointerId !== fire.id) return;
  look.x += (e.clientX - fire.x) * FIREBTN.lookK; look.y += (e.clientY - fire.y) * FIREBTN.lookK; fire.x = e.clientX; fire.y = e.clientY;
  let dx = e.clientX - fire.ox, dy = e.clientY - fire.oy; const d = Math.hypot(dx, dy), m = FIREBTN.dotMax;
  if (d > m) { dx *= m / d; dy *= m / d; }
  fireDot.style.transform = `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px)`;
});
const fireUp = e => { if (e.pointerId !== fire.id) return; fire.id = null; fireEl.classList.remove('held'); };
fireEl.addEventListener('pointerup', fireUp); fireEl.addEventListener('pointercancel', fireUp);

// ---- WEAPON DIAL ------------------------------------------------------------------------------------------------------------------
const dialEl = document.createElement('div'); dialEl.className = 'btn'; dialEl.id = 'wdial';
dialEl.innerHTML = `<div class="rot"></div><div class="notch"></div><div class="hub">${icoSvg('fist')}</div>`;
hud.appendChild(dialEl);
const placeDial = () => { const land = innerWidth > innerHeight; placeAt(dialEl, land ? DIAL.landX : DIAL.x, land ? DIAL.landY : DIAL.y, DIAL.size); };
placeDial(); addEventListener('resize', placeDial);
const dialRot = dialEl.querySelector('.rot'), dialHub = dialEl.querySelector('.hub');
const dial = { items: [], idx: 0, key: '', id: null, a: 0, acc: 0, turned: 0, t0: 0, sx: 0, sy: 0, icons: [] };
const dialStepDeg = () => 360 / Math.max(1, dial.items.length);
function paintDial() {
  const rot = dial.idx * dialStepDeg() + dial.acc * DIAL.gain;   // item i sits at -i * step (counter-clockwise), so turning clockwise = next
  dialRot.style.transform = `rotate(${rot.toFixed(1)}deg)`;
  dial.icons.forEach((el, i) => { const a = -i * dialStepDeg() * Math.PI / 180, r = DIAL.iconR;
    el.style.transform = `translate(${(Math.sin(a) * r).toFixed(1)}px,${(-Math.cos(a) * r).toFixed(1)}px) rotate(${(-rot).toFixed(1)}deg)`; el.classList.toggle('on', i === dial.idx); });
}
/** the dial shows these weapons with `sel` at the top; out = false greys it (the gun is put away) */
export function setDial(items, sel, out) {
  const key = items.join(',') + '|' + sel + '|' + out; if (key === dial.key) return;
  const rebuild = items.join(',') !== dial.items.join(',');
  dial.key = key; dial.items = items.slice();
  if (rebuild) { dialRot.innerHTML = items.map(k => `<div class="wi">${icoSvg(k)}</div>`).join(''); dial.icons = [...dialRot.children]; }
  const i = items.indexOf(sel); if (i >= 0) dial.idx = i;
  dialEl.classList.toggle('away', !out); dialHub.innerHTML = icoSvg(out ? 'fist' : sel); paintDial();
}
const dialAngle = e => { const r = dialEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
dialEl.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); if (dial.id !== null) return;
  dial.id = e.pointerId; dial.a = dialAngle(e); dial.acc = 0; dial.turned = 0; dial.t0 = performance.now(); dial.sx = e.clientX; dial.sy = e.clientY;
  try { dialEl.setPointerCapture(dial.id); } catch (_) {} dialEl.classList.add('drag'); lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch'; hideHint();
});
dialEl.addEventListener('pointermove', e => {
  if (e.pointerId !== dial.id) return;
  const a = dialAngle(e); let da = a - dial.a; da = ((da + 540) % 360) - 180; dial.a = a;   // screen y is down: + = clockwise
  dial.acc += da; dial.turned += Math.abs(da);
  const step = dialStepDeg(), n = dial.items.length;
  while (dial.acc * DIAL.gain > step / 2) { dial.acc -= step / DIAL.gain; dial.idx = (dial.idx + 1) % n; input.dialStep++; }
  while (dial.acc * DIAL.gain < -step / 2) { dial.acc += step / DIAL.gain; dial.idx = (dial.idx - 1 + n) % n; input.dialStep--; }
  paintDial();
});
const dialUp = e => {
  if (e.pointerId !== dial.id) return; dial.id = null; dialEl.classList.remove('drag');
  if (e.type === 'pointerup' && performance.now() - dial.t0 < DIAL.tapMs && dial.turned < DIAL.tapDeg) {
    const r = dialEl.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < DIAL.centreR + 4) input.holster = true;
    else {   // tap a rim icon = that weapon (screen angle from the top, clockwise, minus the dial's turn)
      const step = dialStepDeg(), rot = dial.idx * step, ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      const i = ((Math.round(-(ang - rot) / step) % dial.items.length) + dial.items.length) % dial.items.length;
      input.dialPick = dial.items[i];
    }
  }
  dial.acc = 0; paintDial();
};
dialEl.addEventListener('pointerup', dialUp); dialEl.addEventListener('pointercancel', dialUp);

// ---- the left pad + the right-half LOOK fingers ------------------------------------------------------------------------------------
const padL0 = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const looks = new Map();   // pointerId -> { x, y, sx, sy, t0, maxd }
const homeL = () => ({ x: 110, y: innerHeight - 120 });
function placeHome() { if (padL0.id === null) { const h = homeL(); padL.style.left = h.x + 'px'; padL.style.top = h.y + 'px'; padL.firstChild.style.transform = ''; } }
placeHome(); addEventListener('resize', placeHome);
const isUI = t => t.closest?.('.btn, .mn .b, #pauseBtn, a, .info, .col');
window.addEventListener('pointerdown', e => {
  if (isUI(e.target) || e.pointerType === 'mouse') return;
  lastDevice = 'touch'; hideHint();
  if (e.clientX < innerWidth * 0.5) {
    const P = padL0; if (P.id !== null) return;
    P.id = e.pointerId; P.ox = e.clientX; P.oy = e.clientY; P.x = P.y = 0; P.t0 = performance.now(); P.maxd = 0; P.sx = e.clientX; P.sy = e.clientY; P.flicked = false;
    padL.style.left = P.ox + 'px'; padL.style.top = P.oy + 'px'; padL.classList.add('act');
  } else {
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), maxd: 0 });
    lookDot.style.left = e.clientX + 'px'; lookDot.style.top = e.clientY + 'px'; lookDot.classList.add('act');
  }
});
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouseMove(e); return; }
  const L = looks.get(e.pointerId);
  if (L) {
    look.x += e.clientX - L.x; look.y += e.clientY - L.y; L.x = e.clientX; L.y = e.clientY;
    L.maxd = Math.max(L.maxd, Math.hypot(e.clientX - L.sx, e.clientY - L.sy));
    lookDot.style.left = e.clientX + 'px'; lookDot.style.top = e.clientY + 'px';
    return;
  }
  const P = padL0; if (e.pointerId !== P.id) return;
  let dx = e.clientX - P.ox, dy = e.clientY - P.oy; const d = Math.hypot(dx, dy), R = STICKS.R;
  if (d > R) { dx *= R / d; dy *= R / d; }
  padL.firstChild.style.transform = `translate(${dx}px,${dy}px)`;
  P.x = dx / R; P.y = -dy / R; P.maxd = Math.max(P.maxd || 0, Math.hypot(e.clientX - P.sx, e.clientY - P.sy) / R);
  // LEFT FLICK = DODGE: past FLICK.at of the radius from where the thumb landed, inside FLICK.ms (distance, not a speed estimate)
  if (!P.flicked && performance.now() - P.t0 < FLICK.ms && P.maxd >= FLICK.at) {
    const fx = e.clientX - P.sx, fy = e.clientY - P.sy, fd = Math.hypot(fx, fy) || 1;
    P.flicked = true; input.dodge = { x: fx / fd, y: -fy / fd };
  }
});
const end = e => {
  const L = looks.get(e.pointerId);
  if (L) {   // a quick tap on the right half = JUMP
    if (e.type === 'pointerup' && performance.now() - L.t0 < LOOK.tapMs && L.maxd < LOOK.tapPx) input.tap = true;
    looks.delete(e.pointerId); if (!looks.size) lookDot.classList.remove('act');
    return;
  }
  const P = padL0; if (e.pointerId !== P.id) return;
  P.id = null; P.x = P.y = 0; padL.classList.remove('act'); placeHome();
};
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);

// mouse: drag on the game canvas = LOOK (any button); the LEFT button also FIRES while held
const mouse = { down: false, fire: false, x: 0, y: 0 };
function mouseMove(e) {
  lastDevice = 'mouse';
  if (mouse.down) { look.x += (e.clientX - mouse.x) * LOOK.mouseK; look.y += (e.clientY - mouse.y) * LOOK.mouseK; }
  mouse.x = e.clientX; mouse.y = e.clientY;
}
window.addEventListener('mousedown', e => {
  if (isUI(e.target) || e.target.tagName !== 'CANVAS') return;
  mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; if (e.button === 0) mouse.fire = true; lastDevice = 'mouse';
});
window.addEventListener('mouseup', () => { mouse.down = false; mouse.fire = false; });

// boost button
const boostEl = document.getElementById('boost');
let boostBtn = false;
if (boostEl) {
  const on = e => { e.preventDefault(); e.stopPropagation(); boostBtn = true; boostEl.classList.add('on'); };
  const off = e => { e.preventDefault(); boostBtn = false; boostEl.classList.remove('on'); };
  boostEl.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) boostEl.addEventListener(ev, off);
}

// keyboard: WASD fly / walk, I J K L look, SPACE fire (held), H = gun away / out, 1-4 = a weapon, Q / ] next, [ previous, C dodge
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code); hideHint(); if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyH') input.holster = true;
  if (e.code === 'KeyQ' || e.code === 'BracketRight') input.dialStep++;
  if (e.code === 'BracketLeft') input.dialStep--;
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0 && dial.items[n]) input.dialPick = dial.items[n];
  if (e.code === 'KeyC') { let x = 0, y = 0; if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y++; if (keys.has('KeyS')) y--; input.dodge = { x, y }; }
});
window.addEventListener('keyup', e => keys.delete(e.code));

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 2500); }

// gamepad: left stick flies / walks, right stick = LOOK (rates), RT = fire, LB / RB = turn the dial, Y = gun away / out, A = boost,
// B = dodge (X / B also drop in the sleigh, X throws a grenade on foot: delivery.js / main.js read the pad themselves)
let gpLB = false, gpRB = false, gpB = false, gpY = false;
function gamepad() {
  const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v;
  const g = { lx: dz(gp.axes[0] || 0), ly: -dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: -dz(gp.axes[3] || 0),
    boost: !!gp.buttons[0]?.pressed, fire: !!gp.buttons[7]?.pressed || (gp.buttons[7]?.value || 0) > 0.3 };
  const lb = !!gp.buttons[4]?.pressed, rb = !!gp.buttons[5]?.pressed, b = !!gp.buttons[1]?.pressed, y = !!gp.buttons[3]?.pressed;
  if (rb && !gpRB) input.dialStep++; if (lb && !gpLB) input.dialStep--;
  if (y && !gpY) input.holster = true;
  if (b && !gpB) input.dodge = { x: g.lx, y: g.ly };
  gpLB = lb; gpRB = rb; gpB = b; gpY = y;
  if (g.lx || g.ly || g.rx || g.ry || g.boost || g.fire || lb || rb || b || y) lastDevice = 'pad';
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
  const L = padL0, now = performance.now();
  input.steer = Math.max(-1, Math.min(1, curve(L.x) + kx + (gp ? curve(gp.lx) : 0)));
  input.climb = Math.max(-1, Math.min(1, curve(L.y) + ky + (gp ? curve(gp.ly) : 0)));
  input.moveHold = L.id !== null && !L.flicked && now - (L.t0 || 0) < FLICK.ms;
  // the right stick (gamepad) / I J K L: camera RATES
  const ckx = (keys.has('KeyL') ? 1 : 0) - (keys.has('KeyJ') ? 1 : 0), cky = (keys.has('KeyI') ? 1 : 0) - (keys.has('KeyK') ? 1 : 0);
  const rx = Math.max(-1, Math.min(1, (gp ? gp.rx : 0) + ckx)), ry = Math.max(-1, Math.min(1, (gp ? gp.ry : 0) + cky));
  input.rx = input.camX = rx; input.ry = input.camY = ry;
  // LOOK drags (touch right half, the fire thumb, the mouse): px since the last poll
  input.lookDX = look.x; input.lookDY = look.y; look.x = look.y = 0;
  input.lookDown = looks.size > 0 || fire.id !== null || mouse.down;
  input.fire = fire.id !== null || mouse.fire || keys.has('Space') || !!gp?.fire;
  input.boost = boostBtn || keys.has('ShiftLeft') || keys.has('ShiftRight') || !!gp?.boost;
  input.mouse = lastDevice === 'mouse' ? { x: mouse.x, y: mouse.y } : null;
  input.device = lastDevice;
}

/** the game tells us where the reticle is drawn (px) */
export function showReticle(x, y, firing) {
  ret.style.left = x + 'px'; ret.style.top = y + 'px';
  ret.style.transform = firing ? `scale(${0.9 + Math.random() * 0.15}) rotate(${Math.random() * 20 - 10}deg)` : '';
}
