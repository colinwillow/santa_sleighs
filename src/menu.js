// MENUS: the start screen (logo over the live 3D scene), PAUSE, SANDBOXES, OPTIONS and the DEBUG panel.
// Plain DOM over the canvas. main.js owns the game state and hands in handlers (G); this file only draws + routes.
const CSS = `
.mn { position: fixed; inset: 0; z-index: 8; display: none; flex-direction: column; align-items: center; justify-content: space-between;
  padding: calc(env(safe-area-inset-top) + 18px) 16px calc(env(safe-area-inset-bottom) + 22px); pointer-events: none;
  font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif; color: #fff; }
.mn.on { display: flex; }
.mn .logo { width: min(86vw, 560px); max-height: 40vh; object-fit: contain; filter: none; animation: mnBob 4s ease-in-out infinite; }
@keyframes mnBob { 0%,100% { transform: translateY(0) rotate(-1deg) } 50% { transform: translateY(6px) rotate(1deg) } }
.mn .col { display: flex; flex-direction: column; gap: 10px; align-items: stretch; width: min(78vw, 340px); pointer-events: auto; }
.mn .b { font-weight: 900; font-size: 17px; letter-spacing: .06em; text-align: center; padding: 13px 16px; border-radius: 18px;
  background: linear-gradient(#e0343c, #a8141e); border: 3px solid #fff4e6; box-shadow: 0 4px 0 #6a0d14, 0 6px 14px #0006;
  user-select: none; -webkit-user-select: none; cursor: pointer; }
.mn .b.big { font-size: 24px; padding: 16px; background: linear-gradient(#ffd25a, #e89a14); color: #5a2a08; box-shadow: 0 4px 0 #8a5208, 0 6px 16px #0007; }
.mn .b.green { background: linear-gradient(#3fae62, #1f7a3e); box-shadow: 0 4px 0 #0f4a24, 0 6px 14px #0006; }
.mn .b.dim { background: linear-gradient(#5a5f7a, #3a3e56); box-shadow: 0 4px 0 #22253a, 0 6px 14px #0006; }
.mn .b:active { transform: translateY(3px); box-shadow: 0 1px 0 #6a0d14; }
.mn .row { display: flex; gap: 8px; } .mn .row .b { flex: 1; font-size: 14px; padding: 11px 8px; }
.mn .title { font-weight: 900; font-size: 22px; letter-spacing: .08em; text-shadow: 0 2px 0 #0008; margin-bottom: 4px; text-align: center; }
.mn .info { font: 600 12px/1.5 ui-monospace, monospace; background: #0008; border-radius: 12px; padding: 8px 10px; white-space: pre; }
.mn .ver { font: 600 11px ui-monospace, monospace; opacity: .7; text-align: center; }
.mn.dark { background: #0a0d1ccc; justify-content: safe center; overflow-y: auto; pointer-events: auto; }
@media (orientation: landscape) and (max-height: 600px) {
  .mn.dark .col { display: grid; grid-template-columns: 1fr 1fr; width: min(94vw, 680px); gap: 8px; }
  .mn.dark .col .title, .mn.dark .col .info { grid-column: 1 / -1; }
  .mn.dark .b { padding: 10px 12px; font-size: 15px; }
}
@media (orientation: landscape) and (max-height: 600px) {
  .mn:not(.dark) { flex-direction: row; align-items: flex-start; }
  .mn:not(.dark) .logo { width: min(40vw, 440px); max-height: 46vh; }
  .mn:not(.dark) .col { align-self: flex-end; width: min(34vw, 320px); }
}
#pauseBtn { position: fixed; z-index: 7; top: calc(env(safe-area-inset-top) + 34px); right: calc(env(safe-area-inset-right) + 10px);
  width: 44px; height: 44px; border-radius: 50%; background: #0007; border: 2px solid #fff9; color: #fff; display: none;
  place-items: center; font: 900 16px/1 system-ui; pointer-events: auto; user-select: none; -webkit-user-select: none; }
body.play #pauseBtn { display: grid; }
body:not(.play) #stick, body:not(.play) #boost, body:not(.play) #fire, body:not(.play) #stats, body:not(.play) #hint { display: none !important; }
#dbgHud { position: fixed; z-index: 7; left: calc(env(safe-area-inset-left) + 8px); top: calc(env(safe-area-inset-top) + 24px);
  font: 600 11px/1.35 ui-monospace, monospace; color: #9ff; background: #0007; border-radius: 8px; padding: 4px 7px; display: none; white-space: pre; pointer-events: none; }
`;

export function makeMenus(G) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const button = (label, cls, fn) => { const b = el('div', 'b ' + (cls || ''), label); b.addEventListener('click', e => { e.stopPropagation(); G.sfx?.('ui_tap'); fn(b); }); return b; };

  // ---- the start screen -------------------------------------------------------------------------
  const start = el('div', 'mn'); document.body.appendChild(start);
  const logo = el('img', 'logo'); logo.src = 'images/logo.webp'; logo.alt = 'Santa Slays';
  const startCol = el('div', 'col');
  start.append(logo, startCol);

  // ---- pause ------------------------------------------------------------------------------------
  const pause = el('div', 'mn dark'); document.body.appendChild(pause);
  const pauseCol = el('div', 'col'); pause.append(pauseCol);

  const pauseBtn = el('div', null, '❚❚'); pauseBtn.id = 'pauseBtn'; document.body.appendChild(pauseBtn);
  pauseBtn.addEventListener('pointerdown', e => { e.stopPropagation(); G.sfx?.('ui_tap'); G.pause(); });
  addEventListener('keydown', e => { if (e.code === 'Escape' || e.code === 'KeyP') { if (G.state() === 'play') G.pause(); else if (G.state() === 'pause') G.resume(); } });

  const dbg = el('div'); dbg.id = 'dbgHud'; document.body.appendChild(dbg);

  // pages: each fills a column
  const fill = (col, nodes) => { col.replaceChildren(...nodes); };
  const sandboxes = (col, back) => fill(col, [
    el('div', 'title', 'SANDBOXES'),
    button('CHARACTERS', 'green', () => G.go('?scene=sandbox')),
    button('GINGERBREAD DESTRUCTION', 'green', () => G.go('?scene=destruct')),
    button('NEIGHBORHOOD KIT', 'green', () => G.go('?scene=kit')),
    button('VILLAGE VIEW', 'green', () => G.go('?cam=diorama&play=1')),
    button('CREW CLOSE-UP', 'green', () => G.go('?cam=crew&play=1')),
    button('◀ BACK', 'dim', back),
  ]);
  const toggle = (label, get, set, values) => button(`${label}: ${get()}`, '', b => {
    const i = (values.indexOf(get()) + 1) % values.length; set(values[i]); b.textContent = `${label}: ${get()}`;
  });
  const options = (col, back) => fill(col, [
    el('div', 'title', 'OPTIONS'),
    toggle('LOOK', G.look, G.setLook, ['LIT', 'FLAT']),
    toggle('BLOOM', G.bloom, G.setBloom, ['ON', 'OFF']),
    toggle('SOUND', G.volume, G.setVolume, ['100%', '60%', '30%', 'OFF']),
    toggle('MUSIC', G.music, G.setMusic, ['ON', 'OFF']),
    button('◀ BACK', 'dim', back),
  ]);
  const debug = (col, back) => {
    const info = el('div', 'info', G.stats());
    const tick = setInterval(() => { if (!col.isConnected || !info.isConnected) return clearInterval(tick); info.textContent = G.stats(); }, 500);
    fill(col, [
      el('div', 'title', 'DEBUG'), info,
      toggle('HUD STATS', G.dbgHud, G.setDbgHud, ['OFF', 'ON']),
      toggle('CAMERA', G.cam, G.setCam, ['CHASE', 'CREW', 'DIORAMA']),
      toggle('SPEED', G.slow, G.setSlow, ['1x', '0.5x', '0.25x']),
      toggle('LOOK', G.look, G.setLook, ['LIT', 'FLAT']),
      toggle('BLOOM', G.bloom, G.setBloom, ['ON', 'OFF']),
      button('RESET SLEIGH', 'dim', () => G.resetSleigh()),
      button('◀ BACK', 'dim', back),
    ]);
  };

  const startMain = () => fill(startCol, [
    button('PLAY', 'big', () => { G.sfx?.('ui_start'); G.play(); }),
    button('SANDBOXES', 'green', () => sandboxes(startCol, startMain)),
    button('OPTIONS', '', () => options(startCol, startMain)),
    el('div', 'ver', `build ${G.build}`),
  ]);
  const pauseMain = () => fill(pauseCol, [
    el('div', 'title', 'PAUSED'),
    button('RESUME', 'big', () => G.resume()),
    button('OPTIONS', '', () => options(pauseCol, pauseMain)),
    button('DEBUG', 'dim', () => debug(pauseCol, pauseMain)),
    button('SANDBOXES', 'green', () => sandboxes(pauseCol, pauseMain)),
    button('MAIN MENU', '', () => G.mainMenu()),
  ]);

  return {
    showStart() { startMain(); start.classList.add('on'); pause.classList.remove('on'); },
    showPause() { pauseMain(); pause.classList.add('on'); start.classList.remove('on'); },
    hide() { start.classList.remove('on'); pause.classList.remove('on'); },
    hud(text) { dbg.style.display = text ? 'block' : 'none'; if (text) dbg.textContent = text; },
  };
}
