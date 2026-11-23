// Input: a floating left thumb stick (touch), FIRE / BOOST buttons, keyboard fallback.
// Output each frame: input.steer (-1..1, + = right), input.climb (-1..1, + = up), input.boost, input.fire.

export const input = { steer: 0, climb: 0, boost: false, fire: false };

const stick = document.getElementById('stick');
const knob = document.getElementById('knob');
const R = 55;
let stickId = null, sx = 0, sy = 0, tx = 0, ty = 0;

// Lock page zoom (pinch, double tap, iOS gesture events).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'])
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

function bindButton(id, key) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); input[key] = true; el.classList.add('on'); };
  const off = e => { e.preventDefault(); input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindButton('fire', 'fire');
bindButton('boost', 'boost');

window.addEventListener('pointerdown', e => {
  if (e.target.classList?.contains('btn')) return;
  if (e.clientX > innerWidth * 0.5 || stickId !== null) return;
  stickId = e.pointerId; sx = e.clientX; sy = e.clientY; tx = ty = 0;
  stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.style.display = 'block';
  knob.style.transform = '';
  hideHint();
});
window.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId) return;
  let dx = e.clientX - sx, dy = e.clientY - sy;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  tx = dx / R; ty = -dy / R;
});
const endStick = e => {
  if (e.pointerId !== stickId) return;
  stickId = null; tx = ty = 0; stick.style.display = 'none';
};
window.addEventListener('pointerup', endStick);
window.addEventListener('pointercancel', endStick);

const keys = new Set();
window.addEventListener('keydown', e => { keys.add(e.code); hideHint(); if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('keyup', e => keys.delete(e.code));

let hinted = false;
function hideHint() { if (hinted) return; hinted = true; setTimeout(() => document.getElementById('hint').style.opacity = 0, 2500); }

export function pollInput() {
  let kx = 0, ky = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  // soft response curve so small thumb moves are gentle
  const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.4);
  input.steer = Math.max(-1, Math.min(1, curve(tx) + kx));
  input.climb = Math.max(-1, Math.min(1, curve(ty) + ky));
  input.boostKey = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.fireKey = keys.has('Space');
}
