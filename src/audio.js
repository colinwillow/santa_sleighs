// audio.js -- WebAudio sound for Santa Slays. No deps. Files + credits: audio/CREDITS.txt.
//
//   import { sfx } from './audio.js';      // or window.sfx?.play(...) without importing
//   sfx.play('gun_shot');                   // random variant gun_shot_1..4, rate jittered +-6 %
//   const wind = sfx.loop('wind_loop', { vol: 0.5 });   wind.setVolume(0.9); wind.setRate(1.2); wind.stop();
//
// - ONE AudioContext, created on the first pointerdown / touchend / keydown (iOS: resume + a silent buffer
//   inside that gesture). No "tap for sound" prompt. Before that, play() is a silent no-op (nothing queues up
//   to burst out on unlock) and loop() handles wait, then fade in once the context runs.
// - Files are fetched + decoded once (decoding uses an OfflineAudioContext, so no audio device is opened before
//   the gesture). One-shots preload at import; loops / music load on first use (or sfx.preload([...])).
// - A missing / undecodable file warns once and is skipped -- nothing here throws.
// - Master volume + mute + music volume persist in localStorage (try/catch).

const BASE = new URL('../audio/', import.meta.url);

// ---- MANIFEST: one line per sound. n = variants (name_1..name_n.mp3), else name.mp3.
// v = default gain (the mix), voices = max overlapping one-shots (oldest is stolen), loop / music = load lazily,
// music = routed to the music bus. Add a sound: drop the mp3 in audio/ and add one line here.
const MANIFEST = {
  gun_shot:          { n: 4, v: 0.55, voices: 6 },
  gun_spinup:        { v: 0.7, voices: 1 },
  gun_spindown:      { v: 0.7, voices: 1 },
  gun_spin_loop:     { v: 0.5, loop: 1 },           // optional bed while the barrels turn
  casing:            { n: 3, v: 0.35, voices: 4 },
  wind_loop:         { v: 0.6, loop: 1 },
  whoosh:            { n: 3, v: 0.7, voices: 2 },
  sleigh_bells_loop: { v: 0.45, loop: 1 },
  hoof:              { n: 3, v: 0.5, voices: 3 },
  crunch:            { n: 4, v: 0.8, voices: 4 },
  debris:            { n: 3, v: 0.6, voices: 4 },
  explosion:         { n: 2, v: 0.9, voices: 3 },
  snow_puff:         { n: 2, v: 0.5, voices: 4 },
  cookie_pickup:     { v: 0.7, voices: 3 },
  milk_gulp:         { n: 2, v: 0.8, voices: 1 },
  ui_tap:            { v: 0.6, voices: 2 },
  ui_back:           { v: 0.6, voices: 2 },
  ui_start:          { v: 0.8, voices: 1 },
  fire_crackle_loop: { v: 0.6, loop: 1 },
  music_menu:        { v: 1.0, loop: 1, music: 1 },
};
const CORE = ['gun_shot', 'casing', 'ui_tap', 'ui_back', 'ui_start', 'whoosh', 'crunch', 'cookie_pickup'];
const MAX_VOICES_ALL = 32;
const DEF_VOICES = 4;
const LS = { master: 'santa.sfx.master', muted: 'santa.sfx.muted', music: 'santa.sfx.music' };

// ---- state
let ctx = null, masterG = null, sfxG = null, musicG = null;
let master = num(lsGet(LS.master), 1), muted = lsGet(LS.muted) === '1', musicVol = num(lsGet(LS.music), 0.6);
const bufs = new Map();      // file -> AudioBuffer | null (failed)
const loading = new Map();   // file -> Promise<AudioBuffer|null>
const warned = new Set();
const voices = new Map();    // name -> [{ src, g, t0 }]
let voiceCount = 0;
const liveLoops = new Set();
const lastPick = new Map();
let decoder = null;

function num(s, d) { const x = parseFloat(s); return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d; }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
function warnOnce(key, ...msg) { if (warned.has(key)) return; warned.add(key); console.warn('[sfx]', ...msg); }
function clamp01(v) { v = +v; return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

function filesOf(name) {
  const m = MANIFEST[name];
  if (!m) return null;
  if (m.n > 1) return Array.from({ length: m.n }, (_, i) => `${name}_${i + 1}.mp3`);
  return [m.file || `${name}.mp3`];
}

// ---- loading (decode on an OfflineAudioContext so nothing touches the audio device before a gesture)
function getDecoder() {
  if (ctx) return ctx;
  if (!decoder) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    try { decoder = OAC ? new OAC(1, 1, 44100) : null; } catch (e) { decoder = null; }
  }
  return decoder;
}
function decode(ab) {
  const d = getDecoder();
  if (!d) return Promise.reject(new Error('no audio context'));
  return new Promise((res, rej) => {
    try {
      const p = d.decodeAudioData(ab, res, rej);      // old Safari: callbacks only
      if (p && p.then) p.then(res, rej);
    } catch (e) { rej(e); }
  });
}
function loadFile(file) {
  if (bufs.has(file)) return Promise.resolve(bufs.get(file));
  if (loading.has(file)) return loading.get(file);
  const p = fetch(new URL(file, BASE))
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(decode)
    .then((b) => { if (b) markLoop(b); bufs.set(file, b); return b; })
    .catch((e) => { bufs.set(file, null); warnOnce(file, 'could not load', file, '-', e && e.message); return null; })
    .finally(() => loading.delete(file));
  loading.set(file, p);
  return p;
}
function loadName(name) {
  const f = filesOf(name);
  if (!f) { warnOnce('?' + name, 'unknown sound', name); return Promise.resolve([]); }
  return Promise.all(f.map(loadFile));
}
// MP3 pads a little silence at the head / tail (encoder delay). The loop files are dense from the first sample
// to the last, so the loop points are simply the first / last non-silent sample -- a gapless loop.
function markLoop(b) {
  const ch = b.getChannelData(0), n = ch.length, lim = Math.min(n, 8192), eps = 1e-4;
  let a = 0, z = n - 1;
  while (a < lim && Math.abs(ch[a]) < eps) a++;
  while (z > n - lim && Math.abs(ch[z]) < eps) z--;
  if (a >= lim || z <= a) { a = 0; z = n - 1; }
  b._loopA = a / b.sampleRate; b._loopB = (z + 1) / b.sampleRate;
}

// ---- context + unlock
function applyMaster(ramp = 0.05) {
  if (!masterG) return;
  const t = ctx.currentTime, v = muted ? 0 : master;
  masterG.gain.cancelScheduledValues(t);
  masterG.gain.setValueAtTime(masterG.gain.value, t);
  masterG.gain.linearRampToValueAtTime(v, t + ramp);
}
function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { warnOnce('noctx', 'WebAudio not supported'); return null; }
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
  masterG = ctx.createGain(); masterG.gain.value = muted ? 0 : master; masterG.connect(ctx.destination);
  sfxG = ctx.createGain(); sfxG.connect(masterG);
  musicG = ctx.createGain(); musicG.gain.value = musicVol; musicG.connect(masterG);
  ctx.onstatechange = () => { if (ctx.state === 'running') liveLoops.forEach((h) => h._kick()); };
  liveLoops.forEach((h) => h._kick());
  return ctx;
}
let hidden = false;
function unlock() {
  if (hidden) return;
  const c = ensureCtx();
  if (!c || c.state === 'running') return;
  try {
    const r = c.resume();
    // iOS: a sound must START inside the gesture for the context to unlock
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start(0);
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* retry on the next gesture */ }
}
const GESTURES = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
if (typeof window !== 'undefined') {
  // stay subscribed: iOS can drop to 'interrupted' (a call, the app backgrounded) and needs another gesture
  for (const ev of GESTURES) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!ctx) return;
    try { if (hidden) ctx.suspend(); else ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
  });
}

// ---- one-shots
function pickVariant(name, list) {
  const ok = [];
  list.forEach((b, i) => { if (b) ok.push(i); });
  if (!ok.length) return null;
  let i = ok[(Math.random() * ok.length) | 0];
  if (ok.length > 1 && i === lastPick.get(name)) i = ok[(ok.indexOf(i) + 1) % ok.length];
  lastPick.set(name, i);
  return list[i];
}
function killVoice(v, name) {
  const arr = voices.get(name);
  const k = arr ? arr.indexOf(v) : -1;
  if (k < 0) return;
  arr.splice(k, 1); voiceCount--;
  try {
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0, t + 0.008);
    v.src.stop(t + 0.01);
  } catch (e) { /* already stopped */ }
}
function oldestVoice() {
  let best = null, bn = null;
  voices.forEach((arr, n) => { if (arr[0] && (!best || arr[0].t0 < best.t0)) { best = arr[0]; bn = n; } });
  return [best, bn];
}

function play(name, { vol = 1, rate = 1, jitter = 0.06, pan = 0 } = {}) {
  const m = MANIFEST[name];
  if (!m) { warnOnce('?' + name, 'unknown sound', name); return null; }
  const files = filesOf(name);
  const list = files.map((f) => bufs.get(f));
  if (list.some((b) => b === undefined)) loadName(name);      // first use: start loading, play next time
  if (!ctx || ctx.state !== 'running' || muted || hidden) return null;
  const buf = pickVariant(name, list);
  if (!buf) return null;
  try {
    const arr = voices.get(name) || (voices.set(name, []), voices.get(name));
    const cap = m.voices || DEF_VOICES;
    while (arr.length >= cap) killVoice(arr[0], name);
    if (voiceCount >= MAX_VOICES_ALL) { const [v, n] = oldestVoice(); if (v) killVoice(v, n); }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.05, rate * (1 + (Math.random() * 2 - 1) * jitter));
    const g = ctx.createGain();
    g.gain.value = Math.max(0, vol * (m.v ?? 1));
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); out = p;
    }
    src.connect(g);
    out.connect(m.music ? musicG : sfxG);
    const v = { src, g, t0: ctx.currentTime };
    arr.push(v); voiceCount++;
    src.onended = () => {
      const a = voices.get(name), k = a ? a.indexOf(v) : -1;
      if (k >= 0) { a.splice(k, 1); voiceCount--; }
      try { out.disconnect(); } catch (e) { /* ignore */ }
    };
    src.start();
    return { stop: () => killVoice(v, name) };
  } catch (e) {
    warnOnce('play' + name, 'play failed', name, e && e.message);
    return null;
  }
}

// ---- loops: a handle exists at once; the node starts once the buffer is decoded AND the context exists
function loop(name, { vol = 1, rate = 1 } = {}) {
  const m = MANIFEST[name];
  const st = { vol: clamp01(vol), rate: +rate || 1, stopped: false, src: null, g: null, buf: null };
  const h = {
    setVolume(v, ramp = 0.1) {
      st.vol = clamp01(v);
      if (st.g) ramp_(st.g.gain, st.vol * (m.v ?? 1), ramp);
      return h;
    },
    setRate(r, ramp = 0.1) {
      st.rate = Math.max(0.05, +r || 1);
      if (st.src) ramp_(st.src.playbackRate, st.rate, ramp);
      return h;
    },
    stop(fade = 0.3) {
      if (st.stopped) return;
      st.stopped = true;
      liveLoops.delete(h);
      if (!st.src) return;
      try {
        const t = ctx.currentTime;
        ramp_(st.g.gain, 0, fade);
        st.src.stop(t + Math.max(0.02, fade) + 0.05);
      } catch (e) { /* ignore */ }
    },
    get playing() { return !!st.src && !st.stopped; },
    _kick() {
      if (st.stopped || st.src || !st.buf || !ctx) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = st.buf;
        src.loop = true;
        src.loopStart = st.buf._loopA || 0;
        src.loopEnd = st.buf._loopB || st.buf.duration;
        src.playbackRate.value = st.rate;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(m.music ? musicG : sfxG);
        // ambience starts somewhere random in the loop (no two sessions sound alike); music starts at the top
        const a = src.loopStart, b = src.loopEnd;
        const off = m.music ? a : a + Math.random() * Math.max(0, b - a - 0.05);
        src.start(0, off);
        st.src = src; st.g = g;
        ramp_(g.gain, st.vol * (m.v ?? 1), 0.35);
      } catch (e) { warnOnce('loop' + name, 'loop failed', name, e && e.message); }
    },
  };
  if (!m) { warnOnce('?' + name, 'unknown sound', name); st.stopped = true; return h; }
  liveLoops.add(h);
  loadName(name).then((list) => {
    st.buf = list.find(Boolean) || null;
    if (!st.buf) { liveLoops.delete(h); return; }
    h._kick();
  });
  return h;
}
function ramp_(param, v, ramp) {
  if (!ctx) { param.value = v; return; }
  const t = ctx.currentTime;
  try {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    if (ramp > 0) param.linearRampToValueAtTime(v, t + ramp); else param.setValueAtTime(v, t);
  } catch (e) { param.value = v; }
}

// ---- public
const corePromise = Promise.all(CORE.map(loadName)).then(() => undefined, () => undefined);
// kick off the rest of the one-shots too (small files); loops + music wait for first use
Object.keys(MANIFEST).forEach((n) => { if (!MANIFEST[n].loop && !CORE.includes(n)) loadName(n); });

export const sfx = {
  ready: corePromise,
  play,
  loop,
  setMaster(v) { master = clamp01(v); lsSet(LS.master, master); applyMaster(); },
  get master() { return master; },
  mute(on) { muted = !!on; lsSet(LS.muted, muted ? '1' : '0'); applyMaster(); },
  get muted() { return muted; },
  setMusic(v) {
    musicVol = clamp01(v); lsSet(LS.music, musicVol);
    if (musicG) ramp_(musicG.gain, musicVol, 0.1);
  },
  get music() { return musicVol; },
  // extras
  preload(names) { return Promise.all((names || Object.keys(MANIFEST)).map(loadName)).then(() => undefined); },
  has(name) { return !!MANIFEST[name]; },
  get ctx() { return ctx; },
  get unlocked() { return !!ctx && ctx.state === 'running'; },
  manifest: MANIFEST,
  files: filesOf,
};
if (typeof window !== 'undefined') window.sfx = sfx;
