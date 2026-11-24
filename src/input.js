// TWIN STICKS (his, Nov 23): LEFT stick FLIES the sleigh / walks him, RIGHT stick = the CAMERA + THE DRAW. Both pads FLOAT: each
// half of the screen is a zone and the pad appears under the thumb (Korajin's STICK.dyn); they rest faintly in their corners.
// BOOST is its own button. A gamepad drives the same values; on a desktop the mouse is the reticle.
// b74 THE DRAW (his: "port Korajin's bow draw to all the guns"): with something EQUIPPED (the WEAPON RING round the right stick),
// thumb down in the middle of the right stick -> push UP to the top (`padUp`: past DRAW.upAt of the radius, within DRAW.arc of
// straight up, held DRAW.armT s) = COCKED (rack / spin-up / pin pulled) -> bring it back DOWN to the centre (inside DRAW.downAt)
// = DRAWN: now the stick is a full 3D AIM (yaw + pitch RATES, the game turns the aim + camera with it) -> LIFT the thumb = RELEASE
// (single shot / throw / drop; the Gatling fires the whole time it is DRAWN and stops on the lift). Released while only COCKED =
// a quick shot straight down the current aim. Not drawing, the right stick is the CAMERA; a quick tap = JUMP. Unarmed: camera only.
// A string through the knob follows the thumb while it draws (the bow string), gold when cocked, red when drawn.
// WEAPON RING (replaces b61's drag-to-lock gun sticker): the items as arc-segment buttons round the right stick's home; tap one =
// equip it (input.ringPick = its key, the game decides: equip / put away when it is already out). `setRing(items, sel)` lays it out.
// Output each frame: input.steer, input.climb (left, -1..1, + = right / up), input.camX, input.camY (right pad, not drawing),
// input.aimX, input.aimY (right pad while COCKED / DRAWN), input.draw ('idle' | 'cock' | 'drawn'), input.drawEv (events since the
// game last cleared it: 'cock' | 'drawn' | 'release' | 'cancel'), input.rx, input.ry (the raw right stick), input.rDown,
// input.boost, input.mouse, input.dodge, input.moveHold, input.tap. The game sets input.armed (something is equipped) and
// input.drawLock (a drop button is held: the right stick aims the drop, no draw).

export const input = { steer: 0, climb: 0, aimX: 0, aimY: 0, camX: 0, camY: 0, rx: 0, ry: 0, rDown: false, boost: false, mouse: null, dodge: null, moveHold: false,
  draw: 'idle', drawEv: [], armed: false, drawLock: false, ringPick: null, fire: false };
export const STICKS = { R: 58, tapR: 0.35, tapMs: 180, deadL: 0.06 };   // right pad: a quick tap under tapR of travel = jump
// DRAW (Korajin's padUp, his numbers' shape): upAt = the thumb past this x STICKS.R, pointing within `arc` rad of straight up, held
// armT s = COCKED; downAt = back inside this x STICKS.R of where it landed = DRAWN. yawRate / pitchRate = rad/s of aim at full
// stick (curved by `curve`: fine near the middle). sleigh*: the sleigh's aim (pitch0 rest a little down, pitchMin..pitchMax, the
// aim point dist m out along it); footPitch* = the on-foot camera pitch the aim drives (onfoot.js CAMERA range).
export const DRAW = { upAt: 0.78, downAt: 0.32, armT: 0.04, arc: 0.6, yawRate: 1.5, pitchRate: 0.95, curve: 1.6,
  sleighPitch0: -0.2, sleighPitchMin: -1.25, sleighPitchMax: 0.55, sleighDist: 45, sleighCamK: 0.55 };
// RING: arc segments round the right pad's home (x px from the right edge, y px from the bottom = the pad's resting centre):
// r0..r1 px radius, from a0 to a1 degrees (0 = right, 90 = up, screen-math), gap deg between segments, shadow = the baked offset
export const RING = { x: 110, y: 120, r0: 78, r1: 126, a0: 86, a1: 214, gap: 2.4, shadow: [3, 4] };
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
#padR .str { position: absolute; left: -3px; top: -3px; width: 136px; height: 136px; display: none; overflow: visible; }
#padR.cock .str, #padR.drawn .str { display: block; }
#padR.cock { box-shadow: 0 0 0 4px ${GOLD}, 3px 4px 0 4px ${INK}; }
#padR.drawn { box-shadow: 0 0 0 5px ${CANDY}, 3px 4px 0 5px ${INK}; }
#wring { position: fixed; z-index: 6; pointer-events: none; overflow: visible; }
#wring .wseg { pointer-events: auto; cursor: pointer; }
#wring .wseg.on .fill { fill: ${GOLD}; } #wring .wseg .fill { fill: ${CREAM}; fill-opacity: .9; }
#wring .wseg.press { transform: translate(2px, 3px); }
body:not(.play) #wring { display: none; }
#reticle { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; pointer-events: none; z-index: 5; display: none; }
body.play:not(.ret3d) #reticle { display: block; }
body:not(.play) .pad { display: none; }
`;
document.head.appendChild(css);
const mkPad = id => { const p = document.createElement('div'); p.className = 'pad'; p.id = id; p.innerHTML = '<div class="kn"></div>'; document.body.appendChild(p); return p; };
const padEl = { L: mkPad('padL'), R: mkPad('padR') };
// the bow STRING on the right pad: rim to rim through the knob (a quadratic whose curve passes through the thumb)
padEl.R.insertAdjacentHTML('beforeend', `<svg class="str" viewBox="0 0 136 136"><path d="" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="" fill="none" stroke="${GOLD}" stroke-width="3.4" stroke-linecap="round"/></svg>`);
const strP = padEl.R.querySelectorAll('.str path');
function drawString(dx, dy) {
  const ax = 68 - 60, bx = 68 + 60, ay = 68 + 12, kx = 68 + dx, ky = 68 + dy;
  const cx = 2 * kx - (ax + bx) / 2, cy = 2 * ky - ay;   // control so the curve's midpoint IS the knob
  const d = `M${ax} ${ay}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx} ${ay}`;
  strP[0].setAttribute('d', d); strP[1].setAttribute('d', d);
  strP[1].setAttribute('stroke', draw.st === 'drawn' ? CANDY : GOLD);
}
const ret = document.createElement('div'); ret.id = 'reticle';
// the crosshair: an ink-outlined candy-cane ring + four icing ticks + a red pip (src/main.js RET3 paints the same on a canvas)
ret.innerHTML = `<svg viewBox="0 0 46 46" width="46" height="46"><g fill="none" stroke-linecap="round">
<circle cx="23" cy="23" r="14" stroke="${INK}" stroke-width="6.5"/><circle cx="23" cy="23" r="14" stroke="${CREAM}" stroke-width="3"/>
<circle cx="23" cy="23" r="14" stroke="${CANDY}" stroke-width="3" stroke-dasharray="5.5 5.5" stroke-linecap="butt"/>
<path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${INK}" stroke-width="6.5"/><path d="M23 4v7M23 35v7M4 23h7M35 23h7" stroke="${CREAM}" stroke-width="3"/></g>
<circle cx="23" cy="23" r="3.6" fill="${CANDY}" stroke="${INK}" stroke-width="2"/></svg>`;
document.body.appendChild(ret);

// ---- WEAPON RING ----------------------------------------------------------------------------------------------------
// icons (30 x 30, ink-outlined, flat colours: the b27 sticker style)
const ICON = {
  gatling: `<path d='M6 10q4-6 9 0' fill='none' stroke='${INK}' stroke-width='3' stroke-linecap='round'/><rect x='13' y='11' width='14' height='7' rx='2' fill='#cfd3de' stroke='${INK}' stroke-width='2'/><path d='M15 13.4h11M15 15.8h11' stroke='${INK}' stroke-width='1.1'/><rect x='26' y='10' width='3.4' height='9' rx='1' fill='${GOLD}' stroke='${INK}' stroke-width='1.8'/><path d='M7 19l-2.2 7.5h4.6l2.2-7.5z' fill='#8a5230' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><rect x='2.5' y='9' width='13' height='11' rx='3' fill='${CANDY}' stroke='${INK}' stroke-width='2.2'/>`,
  rifle: `<path d='M2 16h6l3-3h17v3.4H12l-2.5 2.6v5.5H5.5L4 19H2z' fill='#8a5230' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><rect x='11' y='9.5' width='9' height='3.2' rx='1.4' fill='#cfd3de' stroke='${INK}' stroke-width='1.8'/><path d='M27 13v3.4' stroke='${GOLD}' stroke-width='2.4'/>`,
  rocket: `<path d='M4 18l4-4h14l5 2-5 2H8z' fill='#d8282e' stroke='${INK}' stroke-width='2' stroke-linejoin='round'/><path d='M8 14l-4-4v4M8 18l-4 4v-4' fill='${GOLD}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/><path d='M22 14l5 2-5 2z' fill='#f6efe2' stroke='${INK}' stroke-width='1.6' stroke-linejoin='round'/><path d='M1.5 16h2' stroke='#ffb050' stroke-width='3' stroke-linecap='round'/>`,
  snowball: `<circle cx='15' cy='16' r='9' fill='#f6f8ff' stroke='${INK}' stroke-width='2.4'/><path d='M10 13a5.5 5.5 0 0 1 4-3' fill='none' stroke='#fff' stroke-width='2.4' stroke-linecap='round'/><circle cx='18' cy='19' r='1.4' fill='#b8c8e8'/><circle cx='12.5' cy='19.5' r='1' fill='#b8c8e8'/>`,
  grenade: `<circle cx='14' cy='18' r='9' fill='${CANDY}' stroke='${INK}' stroke-width='2.4'/><ellipse cx='10.8' cy='14.8' rx='2.4' ry='1.7' fill='#ffd0d6' transform='rotate(-35 10.8 14.8)'/><rect x='10.5' y='6.8' width='7' height='4' rx='1.2' fill='${GOLD}' stroke='${INK}' stroke-width='1.9'/><path d='M14 6.8c0-3 2.5-4 5-3.2' fill='none' stroke='${INK}' stroke-width='2' stroke-linecap='round'/><circle cx='20.5' cy='3.4' r='2.2' fill='#ffe14a' stroke='${INK}' stroke-width='1.2'/>`,
  present: `<rect x='5' y='12' width='20' height='14' rx='2.4' fill='${CANDY}' stroke='${INK}' stroke-width='2.2'/><rect x='3.5' y='8.5' width='23' height='5' rx='2' fill='#ff4a5c' stroke='${INK}' stroke-width='2.2'/><path d='M15 8.5V26' stroke='${INK}' stroke-width='6'/><path d='M15 8.5V26' stroke='${GOLD}' stroke-width='2.8'/><path d='M15 8.5c-2-4-7-4.5-6.8-1.5.3 1.8 4.2 1.5 6.8 1.5zM15 8.5c2-4 7-4.5 6.8-1.5-.3 1.8-4.2 1.5-6.8 1.5z' fill='${GOLD}' stroke='${INK}' stroke-width='1.8' stroke-linejoin='round'/>`,
  bomb: `<circle cx='14' cy='18' r='9' fill='#5a3d96' stroke='${INK}' stroke-width='2.4'/><circle cx='14' cy='18' r='4.2' fill='#9dff4a' stroke='${INK}' stroke-width='1.6'/><rect x='10.5' y='6.8' width='7' height='4' rx='1.2' fill='${GOLD}' stroke='${INK}' stroke-width='1.9'/><path d='M14 6.8c0-3 2.5-4 5-3.2' fill='none' stroke='${INK}' stroke-width='2' stroke-linecap='round'/><circle cx='20.5' cy='3.4' r='2.2' fill='#ffe14a' stroke='${INK}' stroke-width='1.2'/>`,
};
const LABEL = { gatling: 'GATLING', rifle: 'RIFLE', rocket: 'ROCKET', snowball: 'SNOW', grenade: 'BOMB', present: 'GIFT', bomb: 'BOMB' };
const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ringEl.id = 'wring'; document.body.appendChild(ringEl);
let ringKey = '';
/** lay the ring out: items = keys in order (first sits at the top), sel = the equipped key or null */
export function setRing(items, sel) {
  const key = items.join(',') + '|' + sel; if (key === ringKey) return; ringKey = key;
  const R = RING, S = R.r1 + 12, n = items.length, span = (R.a1 - R.a0) / Math.max(1, n), D = Math.PI / 180;
  ringEl.setAttribute('viewBox', `${-S} ${-S} ${2 * S} ${2 * S}`); ringEl.setAttribute('width', 2 * S); ringEl.setAttribute('height', 2 * S);
  ringEl.style.left = `calc(100% - ${R.x + S}px)`; ringEl.style.top = `calc(100% - ${R.y + S}px)`;
  const pt = (r, a) => `${(Math.cos(a * D) * r).toFixed(1)} ${(-Math.sin(a * D) * r).toFixed(1)}`;
  ringEl.innerHTML = items.map((k, i) => {
    const a = R.a0 + i * span + R.gap / 2, b = R.a0 + (i + 1) * span - R.gap / 2, m = (a + b) / 2, rm = (R.r0 + R.r1) / 2;
    const d = `M${pt(R.r1, a)}A${R.r1} ${R.r1} 0 0 0 ${pt(R.r1, b)}L${pt(R.r0, b)}A${R.r0} ${R.r0} 0 0 1 ${pt(R.r0, a)}Z`;
    const cx = Math.cos(m * D) * rm, cy = -Math.sin(m * D) * rm, lx = Math.cos(m * D) * (R.r1 + 9), ly = -Math.sin(m * D) * (R.r1 + 9);
    return `<g class="wseg${k === sel ? ' on' : ''}" data-k="${k}"><path d="${d}" transform="translate(${R.shadow[0]} ${R.shadow[1]})" fill="${INK}"/>
<path class="fill" d="${d}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<g transform="translate(${(cx - 13).toFixed(1)} ${(cy - 15).toFixed(1)}) scale(.88)">${ICON[k] || ''}</g>
<text class="lab" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="900" font-style="italic" font-family="ui-rounded, system-ui, sans-serif" fill="${CREAM}" stroke="${INK}" stroke-width="2.6" paint-order="stroke" transform="rotate(${(90 - m).toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})">${k === sel ? LABEL[k] || '' : ''}</text></g>`;
  }).join('');
}
ringEl.addEventListener('pointerdown', e => {
  const g = e.target.closest?.('.wseg'); if (!g) return;
  e.preventDefault(); e.stopPropagation(); input.ringPick = g.dataset.k; lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  g.classList.add('press'); setTimeout(() => g.classList.remove('press'), 120);
});

const pads = { L: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, R: { id: null, ox: 0, oy: 0, x: 0, y: 0 } };
const home = side => ({ x: side === 'L' ? 110 : innerWidth - RING.x, y: innerHeight - RING.y });
function placeHome() {
  for (const s of ['L', 'R']) if (pads[s].id === null) { const h = home(s); padEl[s].style.left = h.x + 'px'; padEl[s].style.top = h.y + 'px'; padEl[s].firstChild.style.transform = ''; }
}
placeHome(); addEventListener('resize', placeHome);

// ---- THE DRAW (state machine; touch, gamepad LT, Space, mouse button all drive it) ---------------------------------------
const draw = { st: 'idle', upT: 0, src: null };
const snd = (n, o) => window.sfx?.play(n, o);
function setDraw(st, ev) {
  draw.st = st; input.draw = st; if (ev) input.drawEv.push(ev);
  padEl.R.classList.toggle('cock', st === 'cock'); padEl.R.classList.toggle('drawn', st === 'drawn');
  if (st === 'idle') { draw.upT = 0; draw.src = null; }
}
/** Korajin's padUp: the thumb pushed UP past `upAt`, within `arc` of vertical */
const padUp = P => P.y > 0 && Math.abs(Math.atan2(P.x, P.y)) < DRAW.arc && Math.hypot(P.x, P.y) > DRAW.upAt;
/** a non-touch source (key / gamepad / mouse) starts a draw: cocked and drawn at once (the stick or mouse aims) */
function drawNow(src) { if (draw.st !== 'idle' || !input.armed || input.drawLock) return; draw.src = src; setDraw('cock', 'cock'); setDraw('drawn', 'drawn'); }
function drawLift(src) { if (draw.st === 'idle' || draw.src !== src) return; setDraw('idle', 'release'); }

const isUI = t => t.closest?.('.btn, .mn .b, #pauseBtn, a, .info, .col, .wseg');
window.addEventListener('pointerdown', e => {
  if (isUI(e.target) || e.pointerType === 'mouse') return;
  const side = e.clientX < innerWidth * 0.5 ? 'L' : 'R', P = pads[side];
  if (P.id !== null) return;
  P.id = e.pointerId; P.ox = e.clientX; P.oy = e.clientY; P.x = P.y = 0; P.t0 = performance.now(); P.maxd = 0; P.sx = e.clientX; P.sy = e.clientY; P.flicked = false;
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
    // LEFT FLICK = DODGE: past FLICK.at of the radius from where the thumb landed, inside FLICK.ms (distance, not a speed estimate)
    if (s === 'L' && !P.flicked && performance.now() - P.t0 < FLICK.ms && P.maxd >= FLICK.at) {
      const fx = e.clientX - P.sx, fy = e.clientY - P.sy, fd = Math.hypot(fx, fy) || 1;
      P.flicked = true; input.dodge = { x: fx / fd, y: -fy / fd };
    }
    if (s === 'R' && draw.st !== 'idle' && draw.src === 'touch') drawString(dx, dy);
  }
});
const end = e => {
  for (const s of ['L', 'R']) {
    const P = pads[s]; if (e.pointerId !== P.id) continue;
    if (s === 'R' && draw.src === 'touch' && draw.st !== 'idle') setDraw('idle', e.type === 'pointercancel' ? 'cancel' : 'release');   // LIFT = release
    // a quick tap ANYWHERE on the RIGHT pad = JUMP (not drawing)
    else if (s === 'R' && performance.now() - P.t0 < STICKS.tapMs && (P.maxd || 0) < STICKS.tapR) input.tap = true;
    P.id = null; P.x = P.y = 0; padEl[s].classList.remove('act', 'firing'); placeHome();
  }
};
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);

// mouse: the reticle follows it; the left button on the game canvas = a draw (down = cocked + drawn, up = release)
let lastDevice = 'touch';
window.addEventListener('mousedown', e => { if (e.button === 0 && !isUI(e.target) && e.target.tagName === 'CANVAS') drawNow('mouse'); });
window.addEventListener('mouseup', () => drawLift('mouse'));

// boost button
const boostEl = document.getElementById('boost');
let boostBtn = false;
if (boostEl) {
  const on = e => { e.preventDefault(); e.stopPropagation(); boostBtn = true; boostEl.classList.add('on'); };
  const off = e => { e.preventDefault(); boostBtn = false; boostEl.classList.remove('on'); };
  boostEl.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) boostEl.addEventListener(ev, off);
}

const keys = new Set();
window.addEventListener('keydown', e => { keys.add(e.code); hideHint(); if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) drawNow('key'); }
  if (e.code === 'KeyC' && !e.repeat) { let x = 0, y = 0; if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y++; if (keys.has('KeyS')) y--; input.dodge = { x, y }; } });   // C = dodge
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') drawLift('key'); });

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 2500); }

// gamepad: left stick flies / walks, right stick = CAMERA (or the AIM while drawn); LT held = a draw (release = fire); RB = next
// ring item (input.ringNext); RT / A boosts, B dodges (the left stick's way)
let gpRB = false, gpB = false, gpLT = false;
function gamepad() {
  const gp = navigator.getGamepads?.().find(g => g && g.connected); if (!gp) return null;
  const dz = v => Math.abs(v) < 0.15 ? 0 : v;
  const g = { lx: dz(gp.axes[0] || 0), ly: -dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: -dz(gp.axes[3] || 0),
    boost: !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed) };
  const rb = !!gp.buttons[5]?.pressed, b = !!gp.buttons[1]?.pressed, lt = !!gp.buttons[6]?.pressed;
  if (rb && !gpRB) input.ringNext = true;
  if (b && !gpB) input.dodge = { x: g.lx, y: g.ly };
  if (lt && !gpLT) drawNow('pad'); if (!lt && gpLT) drawLift('pad');
  gpRB = rb; gpB = b; gpLT = lt;
  if (g.lx || g.ly || g.rx || g.ry || g.boost || lt || rb || b) lastDevice = 'pad';
  return g;
}

let lastPoll = performance.now();
export function pollInput() {
  const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.4);
  const gp = gamepad();
  let kx = 0, ky = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  const L = pads.L, R = pads.R, now = performance.now(), dt = Math.min(0.1, (now - lastPoll) / 1000); lastPoll = now;
  input.steer = Math.max(-1, Math.min(1, curve(L.x) + kx + (gp ? curve(gp.lx) : 0)));
  input.climb = Math.max(-1, Math.min(1, curve(L.y) + ky + (gp ? curve(gp.ly) : 0)));
  input.moveHold = L.id !== null && !L.flicked && now - (L.t0 || 0) < FLICK.ms;
  // the right stick: touch pad > gamepad right stick; I J K L on a keyboard
  let rx = R.x, ry = R.y;
  if (R.id === null && gp) { rx = gp.rx; ry = gp.ry; }
  const ckx = (keys.has('KeyL') ? 1 : 0) - (keys.has('KeyJ') ? 1 : 0), cky = (keys.has('KeyI') ? 1 : 0) - (keys.has('KeyK') ? 1 : 0);
  rx = Math.max(-1, Math.min(1, rx + ckx)); ry = Math.max(-1, Math.min(1, ry + cky));
  input.rx = rx; input.ry = ry; input.rDown = R.id !== null;
  // THE DRAW on the touch pad: up = cock, back to the middle = drawn
  if (!input.armed || input.drawLock) { if (draw.st !== 'idle') setDraw('idle', 'cancel'); }
  else if (R.id !== null) {
    if (draw.st === 'idle') {
      draw.upT = padUp(R) ? draw.upT + dt : 0;
      if (draw.upT >= DRAW.armT) { draw.src = 'touch'; setDraw('cock', 'cock'); drawString(R.x * STICKS.R, -R.y * STICKS.R); }
    } else if (draw.st === 'cock' && draw.src === 'touch' && Math.hypot(R.x, R.y) < DRAW.downAt) { setDraw('drawn', 'drawn'); drawString(R.x * STICKS.R, -R.y * STICKS.R); }
  }
  const drawing = draw.st !== 'idle';
  input.camX = drawing ? 0 : rx; input.camY = drawing ? 0 : ry;
  // aim: only once DRAWN (cocked, the thumb is on its way back down -- that travel must not swing the aim)
  input.aimX = draw.st === 'drawn' ? rx : 0; input.aimY = draw.st === 'drawn' ? ry : 0;
  input.boost = boostBtn || keys.has('ShiftLeft') || keys.has('ShiftRight') || !!gp?.boost;
  if (lastDevice !== 'mouse') input.mouse = null;
  input.device = lastDevice;
}

/** the game tells us where the reticle is drawn (px) */
export function showReticle(x, y, firing) {
  ret.style.left = x + 'px'; ret.style.top = y + 'px';
  ret.style.transform = firing ? `scale(${0.9 + Math.random() * 0.15}) rotate(${Math.random() * 20 - 10}deg)` : '';
}
