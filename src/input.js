// CONTROLS (b79, his b78 playtest: "joysticks back in the same spot, the new SIZE... three buttons above the right stick... if you
// have a gun equipped and press ANYWHERE on the right stick it just SHOOTS"). Sizes + layout from his Korajin HUD
// (images/reference/controls_korajin_size_ref.png, 393 pt portrait): two equal sticks in the bottom corners, the quick-draw buttons
// are ARC SEGMENTS on top of the right ring, a round utility button (SWAP) bottom-centre between the sticks.
// LEFT STICK (floats in the left half) flies the sleigh / walks him; a flick = DODGE. RIGHT STICK (floats in the right half below
// STICKS.zoneTop): with the GUN out, a finger on it = FIRE (every gun automatic) while its deflection turns the camera (rate) + a little
// direct drag (b81: only once ARMED -- held TAP.ms or moved TAP.px; a quick TAP = JUMP with any item, it never fires); UNARMED =
// camera only, a quick tap = JUMP; LEFT tap = JUMP too, a left HOLD that began in the air = the JETPACK (input.lHold, JETB switch); PRESENT / BOMB = the drop / throw aim while held, lift = drop / throw (a
// quick tap = a quick one). A finger on the right half ABOVE the stick zone = LOOK drag (tap = jump).
// QUICK DRAW (the arc): PRIMARY (the current gun) / PRESENT / BOMB -- tap = equip, tap the equipped one again = unarmed (input.catTap;
// main.js owns the state). SWAP (bottom centre): tap = next variant of the equipped category (input.swapStep), hold = a fan of the
// variants, slide onto one + let go = pick it (input.swapPick).
// THE STUCK-FIRE RULE (b79): firing is a LEVEL read every frame from live tracked pointers only (input.trigger = the right-stick finger
// / left mouse / Space / RT). Every tracked pointer is released by window pointerup / pointercancel / lostpointercapture, by touchend
// reconciliation (a touch list that no longer has a finger near it), by a watchdog (STICKS.watchMs after a touchend), and by blur /
// visibilitychange / pagehide / leaving play. Nothing listens on a single element for its own release any more.
// Output each frame (pollInput): steer, climb (left, -1..1), camX / camY + rx / ry (right stick deflection + gamepad + I J K L, rates
// -1..1), lookDX / lookDY (px of drag since the last poll), lookDown, trigger (held), trigTap (a press + release between two polls),
// fire (= trigger || trigTap), rTap / catTap / swapStep / swapPick / holster / tap / dodge (events: the game clears them), boost, moveHold.
// The game paints the buttons with setEquip({ cat, gun, guns, presents, foot }).

export const input = { steer: 0, climb: 0, camX: 0, camY: 0, rx: 0, ry: 0, lookDX: 0, lookDY: 0, lookDown: false,
  trigger: false, trigTap: false, fire: false, rTap: false, catTap: null, swapStep: 0, swapPick: null, holster: false,
  boost: false, mouse: null, dodge: null, moveHold: false, tap: false, device: 'touch' };
// STICKS (pt on a 393-wide phone, scaled by the short screen side / 393, clamped kMin..kMax; the same pt in landscape): ring = the
// outer radius, knob = the knob radius, R = how far the knob travels, x = centre in from the left / right edge, y = centre up from the
// bottom (safe areas added). zoneTop = the right stick floats only below this share of the screen height (above it = LOOK drag).
// deadR / rateK: right-stick deflection -> camera rate; dragK = share of the thumb's movement that turns the camera directly.
// tapMs / tapPx = a quick tap (jump / quick drop). watchMs = a tracked finger missing from the touch list this long after a touchend
// is released (the stuck-fire watchdog).
// yP = y in PORTRAIT (b81, his: "the sticks could come down a little -- they're a little high and occlude Santa"; landscape keeps y)
export const STICKS = { ring: 75, knob: 28, R: 62, x: 95, y: 150, yP: 100, kMin: 0.8, kMax: 1.25, zoneTop: 0.42, deadL: 0.06,
  deadR: 0.12, rateK: 1, dragK: 0.45, tapMs: 220, tapPx: 14, watchMs: 500 };
// LOOK: rad per px of drag (yaw / pitch), on foot and in the sleigh's chase camera (onfoot.js / main.js); sleighBack = s after every
// look finger lifts before the chase camera eases back behind the team (rate sleighEase); mouseK = mouse drag gain
export const LOOK = { footYaw: 0.0068, footPitch: 0.005, sleighYaw: 0.006, sleighPitch: 0.0042, tapMs: 220, tapPx: 14, sleighBack: 1.2, sleighEase: 2.5, mouseK: 0.8 };
// QUICKDRAW: the three arc segments on top of the right ring (pt): r0..r1 = inner / outer radius from the right stick's centre,
// seg = each segment's span (deg), at = their centre angles (deg from straight up, clockwise): PRIMARY, PRESENT, BOMB; iconR / labR
// = where the icon / label sit; icon = icon size
export const QUICKDRAW = { r0: 80, r1: 117, seg: 32, at: [-34, 0, 34], iconR: 104, labR: 86, icon: 24, cats: ['gun', 'present', 'bomb'] };
// SWAP: the round button bottom-centre (r pt, y pt up from the bottom); a hold past holdMs opens the FAN: items (item pt) on an arc
// fanR pt round it, spread fanSpan deg about straight up; let go within pickR pt of one = pick it
export const SWAP = { r: 23, y: 84, yP: 40, holdMs: 260, fanR: 82, fanSpan: 120, item: 46, pickR: 40 };
// BOOST (sleigh only): above the left stick, centre x pt in from the left, y pt up from the bottom, r pt
export const BOOSTB = { x: 58, y: 268, yP: 218, r: 29 };
// JETB (b81): the JETPACK switch above the left stick (on = lit, remembered; starts ON): centre x pt in from the left, y / yP pt up
export const JETB = { x: 150, y: 262, yP: 212, r: 25 };
// TAP (b81, his: "you should ALWAYS be able to JUMP by TAPPING the right stick, even with a gun... a PRESS AND HOLD shoots"; "tap
// EITHER stick to jump"): a stick touch lifted within ms with under px pt of travel = a TAP (= jump). The RIGHT stick only becomes the
// trigger (fire / the drop or throw aim) once it is ARMED: held ms, or moved px (so pushing to aim fires at once). The LEFT stick held
// past ms (a touch that began in the air) = the JETPACK (input.lHold).
export const TAP = { ms: 160, px: 12 };
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
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${GOLD}' stroke-width='7'/>
<path d='M17 46A55 55 0 0 1 46 15' fill='none' stroke='#fff4c8' stroke-width='3' stroke-linecap='round'/>
<circle cx='68' cy='68' r='59.2' fill='none' stroke='${INK}' stroke-width='2.2'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CREAM}' stroke-width='1.6' stroke-dasharray='5 7' stroke-opacity='.7'/>
${chev(0, CREAM)}${chev(90, CREAM)}${chev(180, CREAM)}${chev(270, CREAM)}`);
const PAD_R = svgUrl('0 0 136 136', `<circle cx='68' cy='68' r='64' fill='${CANDY}' fill-opacity='.12'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${CREAM}' stroke-width='7'/>
<circle cx='68' cy='68' r='63.5' fill='none' stroke='${CANDY}' stroke-width='7' stroke-dasharray='12.47 12.47' transform='rotate(-8 68 68)'/>
<circle cx='68' cy='68' r='59.2' fill='none' stroke='${INK}' stroke-width='2.2'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CREAM}' stroke-width='2' stroke-opacity='.8'/>
<circle cx='68' cy='68' r='44' fill='none' stroke='${CANDY}' stroke-width='2' stroke-dasharray='6 8'/>
<path d='M68 16v12M68 108v12M16 68h12M108 68h12' stroke='${INK}' stroke-width='6' stroke-linecap='round'/>
<path d='M68 16v12M68 108v12M16 68h12M108 68h12' stroke='${CREAM}' stroke-width='2.8' stroke-linecap='round'/>`);
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
  more: `<circle cx='15' cy='15' r='10' fill='${CREAM}' stroke='${INK}' stroke-width='2' stroke-dasharray='3 3'/><path d='M11.5 12a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.1-1.5 2.3' fill='none' stroke='${INK}' stroke-width='2.2' stroke-linecap='round'/><circle cx='15' cy='21' r='1.3' fill='${INK}'/>`,
  cycle: `<path d='M7 12a8.5 8.5 0 0 1 15-3' fill='none' stroke='${INK}' stroke-width='5' stroke-linecap='round'/><path d='M23 18a8.5 8.5 0 0 1-15 3' fill='none' stroke='${INK}' stroke-width='5' stroke-linecap='round'/><path d='M7 12a8.5 8.5 0 0 1 15-3' fill='none' stroke='${CREAM}' stroke-width='2.2' stroke-linecap='round'/><path d='M23 18a8.5 8.5 0 0 1-15 3' fill='none' stroke='${CREAM}' stroke-width='2.2' stroke-linecap='round'/><path d='M24 4.5v6h-6z' fill='${CREAM}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/><path d='M6 25.5v-6h6z' fill='${CREAM}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/>`,
};
// the JETPACK switch icon: two candy-striped canisters with gold rings, a bow, flames under the nozzles
const JETICON = `<svg viewBox="0 0 40 40" class="ji"><defs><pattern id="jstr" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#fff8ec"/><rect width="3" height="6" fill="${CANDY}"/></pattern></defs>
<g class="fl"><path d="M11 30q2 7 0 9q-2-2 0-9zM29 30q2 7 0 9q-2-2 0-9z" fill="#ffb02e" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 31q1 4 0 5.5M29 31q1 4 0 5.5" stroke="#fff6a0" stroke-width="1.6" stroke-linecap="round"/></g>
<rect x="15" y="10" width="10" height="16" rx="2.5" fill="#8a5230" stroke="${INK}" stroke-width="2"/>
<rect x="5.5" y="7" width="11" height="22" rx="5.5" fill="url(#jstr)" stroke="${INK}" stroke-width="2.2"/><rect x="23.5" y="7" width="11" height="22" rx="5.5" fill="url(#jstr)" stroke="${INK}" stroke-width="2.2"/>
<path d="M6 12h10M24 12h10M6 25h10M24 25h10" stroke="${GOLD}" stroke-width="2.6"/><path d="M8 29l1 2.5h4l1-2.5zM26 29l1 2.5h4l1-2.5z" fill="#cfd3de" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M20 8c-3-4-7-4-6.5-1.2.4 1.6 4 1.3 6.5 1.2zM20 8c3-4 7-4 6.5-1.2-.4 1.6-4 1.3-6.5 1.2z" fill="#3dbb6a" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="20" cy="9" r="2.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/></svg>`;
const icoSvg = (k, s = 30) => `<svg viewBox="0 0 30 30" width="${s}" height="${s}">${ICON[k] || ''}</svg>`;
const LABEL = { gatling: 'GATLING', rifle: 'RIFLE', rocket: 'ROCKETS', snowball: 'SNOWBALLS', present: 'PRESENT', bomb: 'BOMB', grenade: 'GRENADE' };

const css = document.createElement('style');
css.textContent = `
.pad { position: fixed; border-radius: 50%; pointer-events: none; z-index: 6; border: 2.5px solid ${INK}; box-sizing: border-box;
  background: ${PAD_L} center/100% 100% no-repeat; box-shadow: 3px 4px 0 ${INK}88; opacity: .5; transition: opacity .3s; }
.pad.act { opacity: 1; transition: opacity .06s; }
.pad .kn { position: absolute; left: 50%; top: 50%; border-radius: 50%; background: ${KN_L} center/100% 100% no-repeat; box-shadow: 2px 3px 0 ${INK}; }
#padR { background-image: ${PAD_R}; } #padR .kn { background-image: ${KN_R}; display: grid; place-items: center; }
#padR .kn .ico { width: 62%; height: 62%; border-radius: 50%; background: ${CREAM}; border: 2px solid ${INK}; display: none; place-items: center; }
#padR .kn .ico svg { width: 82%; height: 82%; display: block; }
#padR.eq .kn .ico { display: grid; }
#padR.hot { opacity: 1; box-shadow: 0 0 0 4px ${CANDY}, 3px 4px 0 4px ${INK}; }
.padlab { position: fixed; z-index: 6; pointer-events: none; transform: translate(-50%, 0); white-space: nowrap;
  font: italic 900 11px/1 ui-rounded, "SF Pro Rounded", system-ui, sans-serif; letter-spacing: .12em; color: ${CREAM};
  text-shadow: 1.5px 1.5px 0 ${INK}, -1px -1px 0 ${INK}, 1px -1px 0 ${INK}, -1px 1px 0 ${INK}; opacity: .85; }
#qdArc { position: fixed; z-index: 7; pointer-events: none; overflow: visible; }
#qdArc .hit { pointer-events: all; cursor: pointer; }
#qdArc .seg .face { fill: ${CREAM}; }
#qdArc .seg.sel .face { fill: ${GOLD}; }
#qdArc .seg .lab { font: italic 900 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; letter-spacing: .08em; fill: ${INK}; text-anchor: middle; }
#qdArc .seg.off { opacity: .45; }
#qdArc .seg.sel .glint { stroke: #fff6c8; }
#qdArc .seg.press { transform: translate(var(--px), var(--py)); }
#qdArc .badge circle { fill: ${CANDY}; stroke: ${INK}; stroke-width: 2.2; } #qdArc .badge text { fill: ${CREAM}; font: italic 900 10px ui-rounded, system-ui, sans-serif; text-anchor: middle; }
#swapBtn { z-index: 7; border-radius: 50%; background: radial-gradient(circle at 34% 28%, #fff6dc 0 13%, transparent 14%), ${GOLD};
  box-shadow: inset 0 0 0 3px #ffe39a, 3px 4px 0 ${INK}; }
#swapBtn .cur { position: absolute; inset: 12%; border-radius: 50%; background: ${CREAM}; border: 2px solid ${INK}; display: grid; place-items: center; }
#swapBtn .cur svg { width: 80%; height: 80%; display: block; }
#swapBtn .cy { position: absolute; right: -7px; top: -7px; width: 22px; height: 22px; border-radius: 50%; background: ${CANDY}; border: 2px solid ${INK}; display: grid; place-items: center; }
#swapBtn .cy svg { width: 18px; height: 18px; display: block; }
#swapBtn .soon { position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%) rotate(-4deg); font: italic 900 8px/1 ui-rounded, system-ui, sans-serif;
  color: ${CREAM}; background: ${INK}; border-radius: 6px; padding: 2px 4px; letter-spacing: .08em; display: none; text-shadow: none; }
#swapBtn.soon { background: #b9aeb4; box-shadow: inset 0 0 0 3px #d6cdd2, 3px 4px 0 ${INK}; } #swapBtn.soon .soon { display: block; } #swapBtn.soon .cy { display: none; }
#swapBtn.on { transform: translate(2px, 3px) scale(.94); box-shadow: 1px 1px 0 ${INK}; }
#swapFan { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 8; pointer-events: none; display: none; }
#swapFan.open { display: block; }
#swapFan .fi { position: absolute; border-radius: 50%; background: ${CREAM}; border: 3px solid ${INK}; box-shadow: 3px 4px 0 ${INK}; display: grid; place-items: center;
  transform: scale(.4); opacity: 0; transition: transform .14s cubic-bezier(.3,1.6,.5,1), opacity .1s; }
#swapFan.open .fi { transform: scale(1); opacity: 1; }
#swapFan .fi svg { width: 72%; height: 72%; display: block; }
#swapFan .fi.cur { background: ${GOLD}; }
#swapFan .fi.hi { transform: scale(1.18); background: #fff6c8; box-shadow: 0 0 0 4px ${CANDY}, 3px 4px 0 4px ${INK}; }
#swapFan .fi.ghost { opacity: .5; }
#swapFan .fl { position: absolute; transform: translate(-50%, 0); font: italic 900 9px/1 ui-rounded, system-ui, sans-serif; color: ${CREAM}; white-space: nowrap;
  text-shadow: 1px 1px 0 ${INK}, -1px -1px 0 ${INK}, 1px -1px 0 ${INK}, -1px 1px 0 ${INK}; }
#jetBtn { z-index: 7; border-radius: 47% 53% 50% 50% / 52% 48% 52% 48%; transform: rotate(4deg); background: #6d6470; box-shadow: inset 0 0 0 3px #8d8490, 3px 4px 0 ${INK}; }
#jetBtn .ji { position: absolute; left: 13%; top: 6%; width: 74%; height: 74%; display: block; opacity: .55; }
#jetBtn .ji .fl { display: none; }
#jetBtn .jl { position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%) rotate(-3deg); font: italic 900 9px/1 ui-rounded, system-ui, sans-serif;
  color: ${CREAM}; background: ${INK}; border-radius: 6px; padding: 2px 5px; letter-spacing: .08em; text-shadow: none; }
#jetBtn.lit { background: radial-gradient(circle at 34% 28%, #fff6dc 0 13%, transparent 14%), ${GOLD}; box-shadow: inset 0 0 0 3px #ffe39a, 0 0 0 3px ${CANDY}, 3px 4px 0 3px ${INK}; }
#jetBtn.lit .ji { opacity: 1; } #jetBtn.lit .ji .fl { display: inline; } #jetBtn.lit .jl { background: ${CANDY}; }
#reticle { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; pointer-events: none; z-index: 5; display: none; }
body.play:not(.ret3d) #reticle { display: block; }
body:not(.play) .pad, body:not(.play) .padlab, body:not(.play) #qdArc, body:not(.play) #swapBtn, body:not(.play) #swapFan, body:not(.play) #jetBtn { display: none; }
`;
document.head.appendChild(css);
const hud = document.getElementById('hud') || document.body;
const mkPad = id => { const p = document.createElement('div'); p.className = 'pad'; p.id = id; p.innerHTML = '<div class="kn"></div>'; document.body.appendChild(p); return p; };
const padL = mkPad('padL'), padR = mkPad('padR');
padR.firstChild.innerHTML = '<div class="ico"></div>';
const padRIco = padR.querySelector('.ico');
const mkLab = t => { const l = document.createElement('div'); l.className = 'padlab'; l.textContent = t; document.body.appendChild(l); return l; };
const labL = mkLab('FLY'), labR = mkLab('LOOK · TAP = JUMP');
const ret = document.createElement('div'); ret.id = 'reticle';
// the crosshair: an ink-outlined candy-cane ring + four icing ticks + a red pip (src/main.js RET3 paints the same on a canvas)
ret.innerHTML = `<svg viewBox="0 0 46 46" width="46" height="46"><g fill="none" stroke-linecap="round">
<circle cx="23" cy="23" r="14" stroke="${INK}" stroke-width="6.5"/><circle cx="23" cy="23" r="14" stroke="${CREAM}" stroke-width="3"/>
<circle cx="23" cy="23" r="14" stroke="${CANDY}" stroke-width="3" stroke-dasharray="5.5 5.5" stroke-linecap="butt"/>
<path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${INK}" stroke-width="6.5"/><path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${CREAM}" stroke-width="3"/></g>
<circle cx="23" cy="23" r="3.6" fill="${CANDY}" stroke="${INK}" stroke-width="2"/></svg>`;
document.body.appendChild(ret);
let lastDevice = 'touch';
const look = { x: 0, y: 0 };   // px of look drag accumulated since the last poll

// ---- LAYOUT: Korajin's proportions, scaled by the short side ------------------------------------------------------------------
const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(insetProbe);
const LAY = { k: 1, L: { x: 0, y: 0 }, R: { x: 0, y: 0 }, swap: { x: 0, y: 0 }, ins: { l: 0, r: 0, b: 0 } };
const qdSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); qdSvg.id = 'qdArc'; hud.appendChild(qdSvg);
const swapEl = document.createElement('div'); swapEl.className = 'btn'; swapEl.id = 'swapBtn';
swapEl.innerHTML = `<div class="cur"></div><div class="cy">${icoSvg('cycle')}</div><div class="soon">SOON</div>`; hud.appendChild(swapEl);
const swapCur = swapEl.querySelector('.cur');
const fanEl = document.createElement('div'); fanEl.id = 'swapFan'; hud.appendChild(fanEl);
const boostEl = document.getElementById('boost');
// the JETPACK switch (b81): a sticker toggle above the left stick; input.jetOn (remembered, starts ON)
const jetEl = document.createElement('div'); jetEl.className = 'btn'; jetEl.id = 'jetBtn';
jetEl.innerHTML = `${JETICON}<span class="jl">JET</span>`; hud.appendChild(jetEl);
try { input.jetOn = localStorage.getItem('jetpack') !== '0'; } catch (e) { input.jetOn = true; }
const paintJet = () => jetEl.classList.toggle('lit', !!input.jetOn); paintJet();
jetEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); input.jetOn = !input.jetOn; paintJet(); hideHint();
  try { localStorage.setItem('jetpack', input.jetOn ? '1' : '0'); } catch (er) {}
  window.sfx?.play(input.jetOn ? 'whoosh' : 'ui_back', { vol: 0.5, rate: input.jetOn ? 1.6 : 1.2 }); });
function layout() {
  const W = innerWidth, H = innerHeight, cs = getComputedStyle(insetProbe);
  LAY.ins = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  const k = LAY.k = Math.min(STICKS.kMax, Math.max(STICKS.kMin, Math.min(W, H) / 393));
  const por = H > W, Y = t => por && t.yP != null ? t.yP : t.y;
  LAY.L = { x: LAY.ins.l + STICKS.x * k, y: H - LAY.ins.b - Y(STICKS) * k };
  LAY.R = { x: W - LAY.ins.r - STICKS.x * k, y: H - LAY.ins.b - Y(STICKS) * k };
  const D = 2 * STICKS.ring * k, kn = 2 * STICKS.knob * k;
  for (const p of [padL, padR]) { p.style.width = p.style.height = D + 'px'; p.style.margin = `${-D / 2}px 0 0 ${-D / 2}px`;
    const n = p.firstChild; n.style.width = n.style.height = kn + 'px'; n.style.margin = `${-kn / 2}px 0 0 ${-kn / 2}px`; }
  labL.style.left = LAY.L.x + 'px'; labL.style.top = (LAY.L.y + STICKS.ring * k + 6) + 'px';
  labR.style.left = LAY.R.x + 'px'; labR.style.top = (LAY.R.y + STICKS.ring * k + 6) + 'px';
  placeHome(); buildArc();
  // SWAP: bottom centre between the sticks
  const sr = SWAP.r * k; LAY.swap = { x: W / 2, y: H - LAY.ins.b - Y(SWAP) * k };
  swapEl.style.width = swapEl.style.height = 2 * sr + 'px'; swapEl.style.left = (LAY.swap.x - sr) + 'px'; swapEl.style.top = (LAY.swap.y - sr) + 'px';
  swapEl.style.right = swapEl.style.bottom = 'auto';
  if (boostEl) { const br = BOOSTB.r * k; Object.assign(boostEl.style, { width: 2 * br + 'px', height: 2 * br + 'px', left: (LAY.ins.l + BOOSTB.x * k - br) + 'px',
    top: (H - LAY.ins.b - Y(BOOSTB) * k - br) + 'px', right: 'auto', bottom: 'auto' }); }
  { const jr = JETB.r * k; Object.assign(jetEl.style, { width: 2 * jr + 'px', height: 2 * jr + 'px', left: (LAY.ins.l + JETB.x * k - jr) + 'px',
    top: (H - LAY.ins.b - Y(JETB) * k - jr) + 'px' }); }
}

// ---- QUICK DRAW: three arc segments on top of the right ring -------------------------------------------------------------------
const QD = { segs: {}, state: null };
function buildArc() {
  const k = LAY.k, r0 = QUICKDRAW.r0 * k, r1 = QUICKDRAW.r1 * k, C = r1 + 10, h = C + 10;
  qdSvg.setAttribute('width', 2 * C); qdSvg.setAttribute('height', h); qdSvg.setAttribute('viewBox', `0 0 ${2 * C} ${h}`);
  qdSvg.style.left = (LAY.R.x - C) + 'px'; qdSvg.style.top = (LAY.R.y - C) + 'px';
  const P = (a, r) => { const t = a * Math.PI / 180; return `${(C + r * Math.sin(t)).toFixed(1)} ${(C - r * Math.cos(t)).toFixed(1)}`; };
  const sector = (a0, a1, ra, rb) => `M${P(a0, rb)}A${rb} ${rb} 0 0 1 ${P(a1, rb)}L${P(a1, ra)}A${ra} ${ra} 0 0 0 ${P(a0, ra)}Z`;
  const arcLine = (a0, a1, r) => `M${P(a0, r)}A${r} ${r} 0 0 1 ${P(a1, r)}`;
  const XY = (a, r) => { const t = a * Math.PI / 180; return [C + r * Math.sin(t), C - r * Math.cos(t)]; };
  qdSvg.innerHTML = QUICKDRAW.cats.map((cat, i) => {
    const a = QUICKDRAW.at[i], a0 = a - QUICKDRAW.seg / 2, a1 = a + QUICKDRAW.seg / 2, d = sector(a0, a1, r0, r1);
    const [ix, iy] = XY(a, QUICKDRAW.iconR * k), [lx, ly] = XY(a, QUICKDRAW.labR * k), [bx, by] = XY(a1 - 5, r1 - 2), s = QUICKDRAW.icon * k;
    return `<g class="seg" data-cat="${cat}" style="--px:${(1.5).toFixed(1)}px;--py:2px">
<path d="${d}" fill="${INK}" transform="translate(2.5 3.5)"/><path class="face" d="${d}"/>
<path class="glint" d="${arcLine(a0 + 4, a1 - 4, r1 - 4)}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
<g class="ic" transform="translate(${(ix - s / 2).toFixed(1)} ${(iy - s / 2).toFixed(1)}) scale(${(s / 30).toFixed(3)})"></g>
<text class="lab" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" transform="rotate(${a} ${lx.toFixed(1)} ${(ly).toFixed(1)})"></text>
${cat === 'present' ? `<g class="badge"><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="9"/><text x="${bx.toFixed(1)}" y="${(by + 3.5).toFixed(1)}">6</text></g>` : ''}
<path class="hit" d="${d}" fill="transparent"/></g>`;
  }).join('');
  QD.segs = {};
  for (const g of qdSvg.querySelectorAll('.seg')) QD.segs[g.dataset.cat] = { g, ic: g.querySelector('.ic'), lab: g.querySelector('.lab'), n: g.querySelector('.badge text'), key: '' };
  for (const g of qdSvg.querySelectorAll('.hit')) g.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const seg = e.target.closest('.seg'); input.catTap = seg.dataset.cat; lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch'; hideHint();
    seg.classList.add('press'); setTimeout(() => seg.classList.remove('press'), 110);
  });
  QD.paintKey = ''; if (QD.state) setEquip(QD.state, true);
}
const variantsOf = (s, cat) => cat === 'gun' ? s.guns : cat === 'present' ? ['present'] : [s.foot ? 'grenade' : 'bomb'];
/** paint the quick-draw arc, the swap button and the right knob: s = { cat: 'gun' | 'present' | 'bomb' | null, gun, guns, presents, foot } */
export function setEquip(s, force = false) {
  QD.state = s;
  const key = [s.cat, s.gun, s.presents, s.foot].join('|'); if (!force && key === QD.paintKey) return; QD.paintKey = key;
  const icon = { gun: s.gun, present: 'present', bomb: s.foot ? 'grenade' : 'bomb' };
  for (const cat of QUICKDRAW.cats) {
    const S = QD.segs[cat]; if (!S) continue;
    if (S.key !== icon[cat]) { S.key = icon[cat]; S.ic.innerHTML = ICON[icon[cat]] || ''; S.lab.textContent = LABEL[icon[cat]] || ''; }
    S.g.classList.toggle('sel', s.cat === cat);
    S.g.classList.toggle('off', cat === 'present' && (s.foot || s.presents <= 0));
    if (S.n) S.n.textContent = s.presents;
  }
  // SWAP: the variant of the equipped category (the gun when unarmed); one kind only = SOON
  const cat = s.cat || 'gun', vs = variantsOf(s, cat), cur = cat === 'gun' ? s.gun : vs[0];
  swapCur.innerHTML = icoSvg(cur); swapEl.classList.toggle('soon', vs.length < 2);
  padR.classList.toggle('eq', !!s.cat && !(s.cat === 'present' && s.foot)); padRIco.innerHTML = s.cat ? icoSvg(icon[s.cat]) : '';
  labL.textContent = s.foot ? 'MOVE · TAP = JUMP' : 'FLY';
  labR.textContent = s.cat === 'gun' ? (s.foot ? 'TAP JUMP · HOLD FIRE' : 'HOLD = FIRE') : s.cat === 'bomb' ? (s.foot ? 'AIM · LIFT = THROW' : 'AIM · LIFT = DROP')
    : s.cat === 'present' && !s.foot ? 'AIM · LIFT = DROP' : 'LOOK · TAP = JUMP';
}

// ---- SWAP button + its fan ----------------------------------------------------------------------------------------------------------
const SW = { id: null, t0: 0, open: false, timer: 0, items: [], hi: -1, x: 0, y: 0 };
function openFan() {
  const s = QD.state; if (!s || SW.id === null) return;
  const cat = s.cat || 'gun', vs = variantsOf(s, cat).slice(), cur = cat === 'gun' ? s.gun : vs[0];
  const ghosts = vs.length < 2 ? 2 : 0; for (let i = 0; i < ghosts; i++) vs.push('more');
  const k = LAY.k, n = vs.length, R = SWAP.fanR * k, sz = SWAP.item * k, span = SWAP.fanSpan;
  SW.items = vs.map((v, i) => { const a = (n === 1 ? 0 : -span / 2 + span * i / (n - 1)) * Math.PI / 180;
    return { v, x: LAY.swap.x + Math.sin(a) * R, y: LAY.swap.y - Math.cos(a) * R }; });
  fanEl.innerHTML = SW.items.map(it => `<div class="fi${it.v === cur ? ' cur' : ''}${it.v === 'more' ? ' ghost' : ''}" style="left:${(it.x - sz / 2).toFixed(0)}px;top:${(it.y - sz / 2).toFixed(0)}px;width:${sz.toFixed(0)}px;height:${sz.toFixed(0)}px">${icoSvg(it.v)}</div>`
    + `<div class="fl" style="left:${it.x.toFixed(0)}px;top:${(it.y + sz / 2 + 5).toFixed(0)}px">${it.v === 'more' ? 'SOON' : LABEL[it.v] || ''}</div>`).join('');
  void fanEl.offsetWidth; fanEl.classList.add('open'); SW.open = true; SW.hi = -1; fanHover(SW.x, SW.y);
  window.sfx?.play('ui_tap', { vol: 0.4, rate: 1.3 });
}
function fanHover(x, y) {
  if (!SW.open) return;
  let best = -1, bd = SWAP.pickR * LAY.k;
  SW.items.forEach((it, i) => { const d = Math.hypot(x - it.x, y - it.y); if (d < bd && it.v !== 'more') { bd = d; best = i; } });
  if (best !== SW.hi) { SW.hi = best; [...fanEl.querySelectorAll('.fi')].forEach((el, i) => el.classList.toggle('hi', i === best)); }
}
function closeFan() { SW.open = false; fanEl.classList.remove('open'); fanEl.innerHTML = ''; SW.items = []; SW.hi = -1; }
swapEl.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); if (SW.id !== null) return;
  SW.id = e.pointerId; SW.type = e.pointerType; SW.t0 = performance.now(); SW.x = e.clientX; SW.y = e.clientY; SW.seen = SW.t0; swapEl.classList.add('on');
  clearTimeout(SW.timer); SW.timer = setTimeout(openFan, SWAP.holdMs); lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch'; hideHint();
});
function swapEnd(clean) {
  clearTimeout(SW.timer); swapEl.classList.remove('on');
  if (clean) {
    if (SW.open) { if (SW.hi >= 0) input.swapPick = SW.items[SW.hi].v; }
    else input.swapStep++;
  }
  SW.id = null; closeFan();
}

// ---- the sticks + LOOK fingers: every tracked pointer lives here, released in ONE place ---------------------------------------------
const T = { L: null, R: null };   // { id, ox, oy, x, y, sx, sy, lx, ly, t0, maxd, flicked, seen }
const looks = new Map();          // pointerId -> { x, y, sx, sy, t0, maxd, seen }
let rPulse = false, boostId = null;
const playing = () => document.body.classList.contains('play');
function placeHome() {
  if (!T.L) { padL.style.left = LAY.L.x + 'px'; padL.style.top = LAY.L.y + 'px'; padL.firstChild.style.transform = ''; padL.classList.remove('act'); }
  if (!T.R) { padR.style.left = LAY.R.x + 'px'; padR.style.top = LAY.R.y + 'px'; padR.firstChild.style.transform = ''; padR.classList.remove('act', 'hot'); }
}
layout(); addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120));
const isUI = t => t.closest?.('.btn, .mn .b, #pauseBtn, a, .info, .col, #qdArc .hit');
window.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { mouseDown(e); return; }
  if (isUI(e.target) || !playing()) return;
  lastDevice = 'touch'; hideHint();
  const now = performance.now(), x = e.clientX, y = e.clientY;
  const P = { id: e.pointerId, ox: x, oy: y, x: 0, y: 0, sx: x, sy: y, lx: x, ly: y, t0: now, maxd: 0, maxpx: 0, flicked: false, armed: false, seen: now };
  if (x < innerWidth * 0.5) {
    if (T.L) return;
    T.L = P; padL.style.left = x + 'px'; padL.style.top = y + 'px'; padL.classList.add('act');
  } else if (!T.R && y > innerHeight * STICKS.zoneTop) {
    T.R = P; padR.style.left = x + 'px'; padR.style.top = y + 'px'; padR.classList.add('act');
  } else looks.set(e.pointerId, { x, y, sx: x, sy: y, t0: now, maxd: 0, seen: now });
});
window.addEventListener('pointermove', e => {
  if (SW.id === e.pointerId) { SW.x = e.clientX; SW.y = e.clientY; SW.seen = performance.now(); fanHover(e.clientX, e.clientY); return; }
  if (e.pointerType === 'mouse') { mouseMove(e); return; }
  const now = performance.now();
  const L = looks.get(e.pointerId);
  if (L) { look.x += e.clientX - L.x; look.y += e.clientY - L.y; L.x = e.clientX; L.y = e.clientY; L.seen = now;
    L.maxd = Math.max(L.maxd, Math.hypot(e.clientX - L.sx, e.clientY - L.sy)); return; }
  for (const side of ['L', 'R']) {
    const P = T[side]; if (!P || P.id !== e.pointerId) continue;
    P.seen = now; const R = STICKS.R * LAY.k;
    let dx = e.clientX - P.ox, dy = e.clientY - P.oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    (side === 'L' ? padL : padR).firstChild.style.transform = `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px)`;
    P.x = dx / R; P.y = -dy / R;
    if (side === 'R') { look.x += (e.clientX - P.lx) * STICKS.dragK; look.y += (e.clientY - P.ly) * STICKS.dragK; }
    P.lx = e.clientX; P.ly = e.clientY;
    P.maxd = Math.max(P.maxd, Math.hypot(e.clientX - P.sx, e.clientY - P.sy) / (side === 'L' ? R : 1));
    P.maxpx = Math.max(P.maxpx, Math.hypot(e.clientX - P.sx, e.clientY - P.sy));
    // LEFT FLICK = DODGE: past FLICK.at of the radius from where the thumb landed, inside FLICK.ms (distance, not a speed estimate)
    if (side === 'L' && !P.flicked && now - P.t0 < FLICK.ms && P.maxd >= FLICK.at) {
      const fx = e.clientX - P.sx, fy = e.clientY - P.sy, fd = Math.hypot(fx, fy) || 1;
      P.flicked = true; input.dodge = { x: fx / fd, y: -fy / fd };
    }
  }
});
/** release one pointer (clean = a real pointerup: taps count; anything else is a cancel) */
function release(id, clean) {
  if (SW.id === id) swapEnd(clean);
  if (boostId === id) setBoost(false);
  const L = looks.get(id);
  if (L) { if (clean && performance.now() - L.t0 < LOOK.tapMs && L.maxd < LOOK.tapPx) input.tap = true; looks.delete(id); }
  const isTap = P => clean && !P.flicked && performance.now() - P.t0 < TAP.ms && P.maxpx < TAP.px * LAY.k;
  if (T.L && T.L.id === id) { const P = T.L; T.L = null; placeHome(); if (isTap(P)) input.tap = true; }   // b81: a LEFT tap = jump too
  if (T.R && T.R.id === id) {
    const P = T.R; T.R = null; placeHome();
    if (!P.armed && isTap(P)) input.rTap = true;   // b81: never armed = a tap = JUMP (it never fired)
  }
}
function releaseAllTouch() {
  for (const id of [...looks.keys()]) release(id, false);
  if (T.L) release(T.L.id, false); if (T.R) release(T.R.id, false);
  if (SW.id !== null && SW.type !== 'mouse') release(SW.id, false);
  if (boostId !== null) setBoost(false);
}
const endEv = e => {
  if (e.pointerType === 'mouse') { if (SW.id === e.pointerId) release(e.pointerId, e.type === 'pointerup'); if (e.type !== 'lostpointercapture') mouseUp(); return; }
  release(e.pointerId, e.type === 'pointerup');
};
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(ev, endEv, true);

// TOUCH-LIST RECONCILIATION + WATCHDOG: the touch events carry the true list of fingers on the glass. A tracked pointer with no finger
// near it after a touchend (once its pointerup had its chance) is released -- whatever happened to its pointerup.
const TW = { live: [], lastEnd: -1e9, seen: false };
const tracked = () => {
  const a = []; if (T.L) a.push(T.L); if (T.R) a.push(T.R);
  for (const [id, L] of looks) a.push({ id, lx: L.x, ly: L.y });
  if (SW.id !== null && SW.type !== 'mouse') a.push({ id: SW.id, lx: SW.x, ly: SW.y });
  return a.map(p => ({ id: p.id, x: p.lx ?? p.ox, y: p.ly ?? p.oy }));
};
function reconcile() {
  const tr = tracked(); if (tr.length <= TW.live.length) return;
  // greedy nearest pairs: each live finger claims the tracked pointer nearest it; the unclaimed ones are gone
  const pairs = []; tr.forEach((p, i) => TW.live.forEach((f, j) => pairs.push([Math.hypot(p.x - f.x, p.y - f.y), i, j])));
  pairs.sort((a, b) => a[0] - b[0]);
  const usedP = new Set(), usedF = new Set();
  for (const [, i, j] of pairs) { if (usedP.has(i) || usedF.has(j)) continue; usedP.add(i); usedF.add(j); }
  tr.forEach((p, i) => { if (!usedP.has(i)) release(p.id, false); });
}
const touchList = e => { TW.seen = true; TW.live = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY })); };
for (const ev of ['touchstart', 'touchmove']) window.addEventListener(ev, touchList, { passive: true, capture: true });
for (const ev of ['touchend', 'touchcancel']) window.addEventListener(ev, e => { touchList(e); TW.lastEnd = performance.now();
  if (!e.touches.length) setTimeout(() => { if (!TW.live.length) releaseAllTouch(); }, 80); }, { passive: true, capture: true });
// leaving the page / the app / the game drops every finger, key and button
function releaseEverything() { releaseAllTouch(); keys.clear(); mouseUp(); }
addEventListener('blur', releaseEverything); addEventListener('pagehide', releaseEverything);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseEverything(); });

// ---- mouse (pointer events only: touch-made compat mouse events can't fire): left button = the trigger, any button drag = look ----
const mouse = { down: false, left: false, x: 0, y: 0 };
function mouseDown(e) {
  lastDevice = 'mouse';
  if (isUI(e.target) || e.target.tagName !== 'CANVAS' || !playing()) return;
  mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; if (e.button === 0) { mouse.left = true; rPulse = true; }
}
function mouseMove(e) {
  lastDevice = 'mouse';
  if (mouse.down && e.buttons === 0) mouseUp();   // the button came up outside the window
  if (mouse.down) { look.x += (e.clientX - mouse.x) * LOOK.mouseK; look.y += (e.clientY - mouse.y) * LOOK.mouseK; }
  mouse.x = e.clientX; mouse.y = e.clientY;
}
function mouseUp() { mouse.down = false; mouse.left = false; }

// boost button (its finger tracked by id, released with the rest)
let boostBtn = false;
function setBoost(on, id = null) { boostBtn = on; boostId = on ? id : null; boostEl?.classList.toggle('on', on); }
if (boostEl) boostEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setBoost(true, e.pointerId); });

// keyboard: WASD fly / walk, I J K L look, SPACE = the trigger (fire / hold a drop), 1 / 2 / 3 = PRIMARY / PRESENT / BOMB,
// Q or ] = next variant, [ = previous, H = unarmed, C dodge
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code); hideHint(); if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space') rPulse = true;
  if (e.code === 'KeyH') input.holster = true;
  if (e.code === 'KeyQ' || e.code === 'BracketRight') input.swapStep++;
  if (e.code === 'BracketLeft') input.swapStep--;
  const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (n >= 0) input.catTap = QUICKDRAW.cats[n];
  if (e.code === 'KeyC') { let x = 0, y = 0; if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y++; if (keys.has('KeyS')) y--; input.dodge = { x, y }; }
});
window.addEventListener('keyup', e => keys.delete(e.code));

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 2500); }

// gamepad: left stick flies / walks, right stick = camera (rates), RT = the trigger, LB / RB = previous / next variant,
// Y = PRIMARY, X = PRESENT, B = BOMB, A = boost, LT / L3 = dodge
const gpPrev = [];
function gamepad() {
  const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v, btn = i => !!gp.buttons[i]?.pressed, edge = i => { const b = btn(i), was = gpPrev[i]; gpPrev[i] = b; return b && !was; };
  const g = { lx: dz(gp.axes[0] || 0), ly: -dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: -dz(gp.axes[3] || 0),
    boost: btn(0), fire: btn(7) || (gp.buttons[7]?.value || 0) > 0.3 };
  if (edge(5)) input.swapStep++; if (edge(4)) input.swapStep--;
  if (edge(3)) input.catTap = 'gun'; if (edge(2)) input.catTap = 'present'; if (edge(1)) input.catTap = 'bomb';
  if (edge(6) | edge(10)) input.dodge = { x: g.lx, y: g.ly };
  if (g.lx || g.ly || g.rx || g.ry || g.boost || g.fire || gp.buttons.some(b => b?.pressed)) lastDevice = 'pad';
  return g;
}

let lastPlay = false;
export function pollInput() {
  const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.4);
  const gp = gamepad(), now = performance.now();
  // the watchdog: a finger missing from the touch list STICKS.watchMs after a touchend is gone
  if (TW.seen && now - TW.lastEnd > STICKS.watchMs) reconcile();
  const play = playing(); if (!play && lastPlay) { releaseAllTouch(); mouseUp(); } lastPlay = play;
  let kx = 0, ky = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  const L = T.L, R = T.R;
  input.steer = Math.max(-1, Math.min(1, curve(L ? L.x : 0) + kx + (gp ? curve(gp.lx) : 0)));
  input.climb = Math.max(-1, Math.min(1, curve(L ? L.y : 0) + ky + (gp ? curve(gp.ly) : 0)));
  input.moveHold = !!L && !L.flicked && now - L.t0 < FLICK.ms;
  // b81 LEFT HOLD (the jetpack): a left touch held past TAP.ms; t0 = when it landed (onfoot only thrusts on a touch that began in the
  // air); V (keyboard) / gamepad A count as a hold that began just now
  input.lHold = L && !L.flicked && now - L.t0 >= TAP.ms ? L.t0 : (keys.has('KeyV') || gp?.boost) ? (input.lHold || now) : 0;
  // b81 the RIGHT stick ARMS (becomes the trigger) once held TAP.ms or moved TAP.px; before that it is a would-be tap
  if (R && !R.armed && (now - R.t0 >= TAP.ms || R.maxpx >= TAP.px * LAY.k)) R.armed = true;
  // camera RATES: the right stick's deflection (dead zone deadR, rescaled), the gamepad's right stick, I J K L
  const dzR = v => { const a = Math.abs(v); return a < STICKS.deadR ? 0 : Math.sign(v) * (a - STICKS.deadR) / (1 - STICKS.deadR) * STICKS.rateK; };
  const ckx = (keys.has('KeyL') ? 1 : 0) - (keys.has('KeyJ') ? 1 : 0), cky = (keys.has('KeyI') ? 1 : 0) - (keys.has('KeyK') ? 1 : 0);
  const rx = Math.max(-1, Math.min(1, (gp ? gp.rx : 0) + ckx + (R ? dzR(R.x) : 0))), ry = Math.max(-1, Math.min(1, (gp ? gp.ry : 0) + cky + (R ? dzR(R.y) : 0)));
  input.rx = input.camX = rx; input.ry = input.camY = ry;
  input.lookDX = look.x; input.lookDY = look.y; look.x = look.y = 0;
  input.lookDown = looks.size > 0 || !!R || mouse.down;
  const Rarm = !!R && R.armed;
  // THE TRIGGER: a level from live pointers only; trigTap = a press that came and went between two polls (a very quick tap)
  input.trigger = Rarm || mouse.left || keys.has('Space') || !!gp?.fire;
  input.trigTap = rPulse && !input.trigger; rPulse = false;
  input.fire = input.trigger || input.trigTap;
  padR.classList.toggle('hot', Rarm && QD.state?.cat === 'gun');
  input.boost = boostBtn || keys.has('ShiftLeft') || keys.has('ShiftRight') || !!gp?.boost;
  input.mouse = lastDevice === 'mouse' ? { x: mouse.x, y: mouse.y } : null;
  input.device = lastDevice;
}

/** the game tells us where the reticle is drawn (px) */
export function showReticle(x, y, firing) {
  ret.style.left = x + 'px'; ret.style.top = y + 'px';
  ret.style.transform = firing ? `scale(${0.9 + Math.random() * 0.15}) rotate(${Math.random() * 20 - 10}deg)` : '';
}
// test hook: what the trigger reads right now (a headless check that lifting always stops the fire)
window.__inputDbg = () => ({ trigger: input.trigger, fire: input.fire, rStick: !!T.R, armed: !!T.R?.armed, looks: looks.size, left: !!T.L, lHold: input.lHold });
