import { CameraTracker, Gestures, synthHand } from './hands.js';
import { AudioEngine, PADS, HAT_RATES, DEMO_PADS, BEATS, BEAT_ORDER, bassMidi } from './audio.js';
import { store } from './store.js';
import { Visuals, PALETTES } from './visuals.js';
import { Recorder } from './recorder.js';
import { NOTE_NAMES, SCALES, scaleNotes, chord, pcName } from './music.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (u) => u * u * (3 - 2 * u);

const SEP = '<span class="sep">·</span>';
const MODES = {
  pads: { label: 'Pads', word: 'MPC', hint: `Put the ring between your thumb and index on a pad, then <b>pinch</b> to hit (either hand)${SEP}bottom row = kick, snare, clap, rim` },
  bass: { label: '808', word: '808', hint: `<b>Right hand</b> height = 808 note${SEP}<b>Pinch</b> = extra hit${SEP}<b>Left hand</b> open = drive${SEP}<b>Fist</b> = kick` },
  rolls: { label: 'Hat Rolls', word: 'ROLLS', hint: `<b>Right hand</b> up = faster hi-hat rolls${SEP}<b>Left hand</b> height = filter${SEP}<b>Hold a fist</b>, open it to <b>drop</b>` },
  flute: { label: 'Flute', word: 'FLUTE', hint: `<b>Right hand</b> up/down = melody${SEP}<b>Pinch</b> = accent${SEP}<b>Left hand</b> open = vibrato${SEP}<b>Fist</b> = boom` },
};
const MODE_ORDER = ['pads', 'bass', 'rolls', 'flute'];
const LAYERS = {
  pads: { kick: 0, snare: 0, hats: 1, bass: 0, melody: 1, pad: 1 },
  bass: { kick: 1, snare: 1, hats: 1, bass: 1, melody: 1, pad: 0 },
  rolls: { kick: 1, snare: 1, hats: 1, bass: 1, melody: 1, pad: 1 },
  flute: { kick: 1, snare: 1, hats: 1, bass: 1, melody: 0, pad: 1 },
};

const state = {
  beat: 'tribal',
  mode: 'pads',
  root: 5,
  scale: 'Hijaz',
  source: 'attract', // attract | demo | camera
  muted: false,
  noteIdx: -1,
  rateIdx: -1,
  sweep: 1,
  drive: 0.4,
  space: 0.35,
  dropped: false,
  guides: {},
  guide: null,
  padLabels: [],
  lastStep: -1,
  lastHandsSeen: 0,
};

const stage = $('#stage');
const video = $('#cam');
const visuals = new Visuals(stage, video);
const gestures = new Gestures();
const audio = new AudioEngine();
const tracker = new CameraTracker(video);
const recorder = new Recorder(stage);

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
const toastEl = $('#toast');
let toastTimer;
function toast(msg, ms = 4200) {
  toastEl.innerHTML = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function setCssPalette(mode) {
  const [a, b, c] = PALETTES[mode];
  const r = document.documentElement.style;
  r.setProperty('--a', a);
  r.setProperty('--b', b);
  r.setProperty('--c', c);
}

function moveIndicator() {
  const btn = document.querySelector(`#modes button[data-mode="${state.mode}"]`);
  const ind = $('#modeInd');
  ind.style.width = btn.offsetWidth + 'px';
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
}

function setMode(mode, fromUser = false) {
  if (!MODES[mode]) return;
  const prev = state.mode;
  state.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  moveIndicator();
  visuals.setPalette(mode);
  setCssPalette(mode);
  if (prev !== mode || fromUser) {
    audio.leadOff();
    audio.setHandBass(null);
    audio.setHatRate(-1);
    releaseDrop(true);
    state.noteIdx = -1;
    state.rateIdx = -1;
    state.guide = mode === 'bass' ? state.guides.bass : mode === 'flute' ? state.guides.flute : null;
    if (state.guide) state.guide.active = null;
    if (mode !== 'rolls') audio.setSweep(1);
  }
  audio.setLayers(LAYERS[mode]);
  audio.demoPads = mode === 'pads' && state.source === 'demo';
  if (state.source !== 'attract') audio.startLoop();
  if (fromUser && state.source === 'attract') state.attractLocked = true;
  if (fromUser && state.source !== 'attract') visuals.shout(MODES[mode].label.toUpperCase(), 0, 0.8);
  showHint();
}

let hintTimer;
function showHint(text) {
  const el = $('#hint');
  if (state.source === 'attract') { el.classList.remove('show'); return; }
  el.innerHTML = text || MODES[state.mode].hint;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 9000);
}

function updateKeyLabel() {
  $('#keyLabel').textContent = `${NOTE_NAMES[state.root]} · ${state.scale}`;
}

function buildKeyPicker() {
  const keys = $('#keys');
  NOTE_NAMES.forEach((n, i) => {
    const b = document.createElement('button');
    b.textContent = n;
    b.setAttribute('aria-pressed', String(i === state.root));
    b.onclick = () => {
      state.root = i;
      keys.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      applyKey();
    };
    keys.appendChild(b);
  });
  const scales = $('#scales');
  Object.keys(SCALES).forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s;
    b.setAttribute('aria-pressed', String(s === state.scale));
    b.onclick = () => {
      state.scale = s;
      scales.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === s)));
      applyKey();
    };
    scales.appendChild(b);
  });
}

function applyKey() {
  audio.setKey(state.root, state.scale);
  updateKeyLabel();
  state.noteIdx = -1;
  rebuildGuides();
  if (audio.ready && state.source !== 'attract') audio.playPad(8, 0.8);
}

function setBeat(id, fromUser = false) {
  const b = BEATS[id];
  if (!b) return;
  state.beat = id;
  audio.setBeat(id);
  state.root = b.root;
  state.scale = b.scale;
  $('#beatLabel').textContent = b.name;
  document.querySelectorAll('#beats button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.beat === id)));
  $('#keys').querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === state.root)));
  $('#scales').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === state.scale)));
  audio.setKey(state.root, state.scale);
  updateKeyLabel();
  state.noteIdx = -1;
  rebuildGuides();
  if (fromUser && state.source !== 'attract') visuals.shout(b.name.toUpperCase(), 0, 0.8);
  if (fromUser) showHint(`<b>${b.name}</b>${SEP}${b.desc}${SEP}press <b>B</b> for the next beat`);
}
function beatOrder() { return audio.userLoop ? [...BEAT_ORDER, 'user'] : BEAT_ORDER; }
function buildBeatPicker() {
  const list = $('#beats');
  list.innerHTML = '';
  beatOrder().forEach((id) => {
    const b = BEATS[id];
    const btn = document.createElement('button');
    btn.dataset.beat = id;
    btn.innerHTML = `<span class="bn">${b.name}</span><span class="bd">${b.desc}</span>`;
    btn.setAttribute('aria-pressed', String(id === state.beat));
    btn.onclick = () => { setBeat(id, true); toggleBeatPop(false); if (state.source === 'attract') startDemo(); };
    list.appendChild(btn);
  });
}
const beatBtn = $('#beatBtn');
const beatPop = $('#beatPop');
function toggleBeatPop(open = beatPop.hidden) {
  beatPop.hidden = !open;
  beatBtn.setAttribute('aria-expanded', String(open));
  if (open) { toggleKeyPop(false); toggleKitPop(false); }
}
beatBtn.onclick = (e) => { e.stopPropagation(); toggleBeatPop(); };
document.addEventListener('pointerdown', (e) => {
  if (!beatPop.hidden && !beatPop.contains(e.target) && !beatBtn.contains(e.target)) toggleBeatPop(false);
});

const keyBtn = $('#keyBtn');
const keyPop = $('#keyPop');
function toggleKeyPop(open = keyPop.hidden) {
  keyPop.hidden = !open;
  keyBtn.setAttribute('aria-expanded', String(open));
  if (open && beatPop) { toggleBeatPop(false); toggleKitPop(false); }
}
keyBtn.onclick = (e) => { e.stopPropagation(); toggleKeyPop(); };
document.addEventListener('pointerdown', (e) => {
  if (!keyPop.hidden && !keyPop.contains(e.target) && !keyBtn.contains(e.target)) toggleKeyPop(false);
});

function openModal(el) {
  el.hidden = false;
  el.classList.remove('closing');
}
function closeModal(el) {
  if (el.hidden) return;
  el.classList.add('closing');
  setTimeout(() => { el.hidden = true; el.classList.remove('closing'); }, 280);
}
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) closeModal(m);
  });
});
$('#helpBtn').onclick = () => openModal($('#help'));

const GLYPHS = {
  g1: '<svg viewBox="0 0 56 56"><path class="acc" d="M46 10v36M42 14l4-4 4 4M42 42l4 4 4-4" opacity=".7"/><g class="hand"><path d="M18 44V28M22 44V20a2 2 0 014 0v14M26 34V17a2 2 0 014 0v17M30 34V19a2 2 0 014 0v17M34 36V24a2 2 0 014 0v12c0 6-4 10-10 10h-4c-4 0-6-2-8-5l-5-8a2 2 0 013-3l4 4"/></g></svg>',
  g2: '<svg viewBox="0 0 56 56"><g class="hand"><path d="M16 46c-2-6-2-12 2-16l6-5M24 25c2-4 6-8 10-9M34 16c2 0 3 2 1 4l-6 6M22 30c4-2 8-2 12 0M18 42h14c4 0 7-3 7-7v-5"/></g><g class="spark"><path class="acc" d="M34 8v-4M40 10l3-3M42 16h4M28 10l-3-3"/></g></svg>',
  g3: '<svg viewBox="0 0 56 56"><g class="hand"><path d="M16 42c0 4 4 8 10 8h4c6 0 10-4 10-10v-8"/><g class="fing"><path d="M20 40V16a2 2 0 014 0v18M24 34V12a2 2 0 014 0v22M28 34V14a2 2 0 014 0v20M32 34V20a2 2 0 014 0v12"/></g><path d="M16 42l-4-8a2 2 0 013-3l5 5"/></g></svg>',
  g4: '<svg viewBox="0 0 56 56"><circle class="acc ripple" cx="28" cy="32" r="18"/><g class="hand"><rect x="16" y="22" width="24" height="18" rx="8"/><path d="M22 22v6M28 22v6M34 22v6M16 32c4 0 8-2 10-4"/></g></svg>',
  g5: '<svg viewBox="0 0 56 56"><path class="acc" d="M20 28h16" stroke-dasharray="2 4"/><g class="hand l"><path d="M14 38V22a2 2 0 014 0v8M10 32V26a2 2 0 014 0M18 30v-10a2 2 0 014 0v14c0 4-3 6-6 6h-2c-3 0-4-2-4-4v-4"/></g><g class="hand r"><path d="M42 38V22a2 2 0 00-4 0v8M46 32V26a2 2 0 00-4 0M38 30v-10a2 2 0 00-4 0v14c0 4 3 6 6 6h2c3 0 4-2 4-4v-4"/></g></svg>',
};
for (const [k, svg] of Object.entries(GLYPHS)) document.querySelector('.' + k).innerHTML = svg;

/* ------------------------------------------------------------------ */
/* Music mapping                                                       */
/* ------------------------------------------------------------------ */
const GUIDE_TOP = 0.22, GUIDE_BOT = 0.78;
function ladder(notes) {
  const n = notes.length;
  return {
    notes: notes.map((m, i) => ({
      midi: m,
      label: pcName(m) + (Math.floor(m / 12) - 1),
      root: (m - state.root) % 12 === 0,
      y: GUIDE_BOT - (i / (n - 1)) * (GUIDE_BOT - GUIDE_TOP),
    })),
    active: null,
  };
}
function rebuildGuides() {
  const bLo = 33 + ((state.root - 9 + 12) % 12);
  const fLo = 62 + ((state.root - 2 + 12) % 12);
  state.guides = {
    bass: { ...ladder(scaleNotes(state.root, state.scale, bLo, bLo + 14)), title: '808 NOTE · right hand up/down' },
    flute: { ...ladder(scaleNotes(state.root, state.scale, fLo, fLo + 19)), title: 'FLUTE · right hand up/down' },
  };
  state.guide = state.mode === 'bass' ? state.guides.bass : state.mode === 'flute' ? state.guides.flute : null;
  state.padLabels = PADS.map((p, i) => ({
    name: customNames[i] ?? p.name,
    bank: 'A' + String(i + 1).padStart(2, '0'),
    note: p.deg != null && customNames[i] == null ? pcName(bassMidi(chord(state.root, state.scale, p.deg, 36)[0])) : null,
    group: p.group,
  }));
}

function noteAtY(guide, y, prevIdx) {
  const n = guide.notes.length;
  const f = ((GUIDE_BOT - y) / (GUIDE_BOT - GUIDE_TOP)) * (n - 1);
  let idx = Math.round(clamp(f, 0, n - 1));
  if (prevIdx >= 0 && Math.abs(f - prevIdx) < 0.62) idx = prevIdx;
  return idx;
}

const RATE_Y0 = 0.74, RATE_DY = 0.12;
const rateY = (i) => RATE_Y0 - i * RATE_DY;
function rateAtY(y, prev) {
  const f = (RATE_Y0 - y) / RATE_DY;
  let idx = Math.round(clamp(f, 0, HAT_RATES.length - 1));
  if (prev >= 0 && Math.abs(f - prev) < 0.62) idx = prev;
  return idx;
}

/* Pads: a 4×4 MPC grid, pad 1 bottom-left */
function padGrid() {
  const W = visuals.W, H = visuals.H;
  const narrow = W < 760;
  const attract = state.source === 'attract';
  const top = 104, bottom = 132;
  let size = Math.min(H - top - bottom - 16, W * (narrow ? 0.92 : attract ? 0.46 : 0.6), attract ? 560 : 720);
  let cx = W / 2, cy = top + (H - top - bottom) / 2;
  if (attract && !narrow) { size *= 0.84; cx = W * 0.7; }
  if (attract && narrow) { size = Math.min(size, H * 0.34); cy = 96 + size / 2; }
  const gap = size * 0.04;
  return { x0: cx - size / 2, y0: cy - size / 2, size, gap, cell: (size - gap * 3) / 4 };
}
function padRect(i, g) {
  const col = i % 4, row = 3 - Math.floor(i / 4);
  return { x: g.x0 + col * (g.cell + g.gap), y: g.y0 + row * (g.cell + g.gap), w: g.cell, h: g.cell };
}
function padAt(nx, ny, g = padGrid()) {
  const px = nx * visuals.W, py = ny * visuals.H, m = g.gap / 2;
  for (let i = 0; i < 16; i++) {
    const r = padRect(i, g);
    if (px >= r.x - m && px <= r.x + r.w + m && py >= r.y - m && py <= r.y + r.h + m) return i;
  }
  return -1;
}
/* Pads are played by pinching: the point between thumb and index tips is the aim cursor, and a pinch
   hits the pad under it. Nothing else (moving, fists, stray knuckles) can trigger a pad. */
const padTouchState = { left: { t: 0 }, right: { t: 0 } };
function aimPoint(h) {
  const P = h.pts;
  return { x: (P[4].x + P[8].x) / 2, y: (P[4].y + P[8].y) / 2 };
}
function padCenter(i, g) {
  const r = padRect(i, g);
  return { x: (r.x + r.w / 2) / visuals.W, y: (r.y + r.h / 2) / visuals.H };
}

function flashPad(i, vel = 0.9) {
  const g = padGrid();
  const c = padCenter(i, g);
  visuals.flashKey('pad' + i, 0.6 + vel * 0.4);
  const colorIdx = [0, 0, 2, 1][PADS[i].group];
  visuals.burst(c.x, c.y, 10 + vel * 14, colorIdx, 0.6 + vel * 0.5);
  if (PADS[i].group === 0 && i < 2) visuals.kick(0.5 * vel);
}
function hitPad(i, vel) {
  audio.playPad(i, vel);
  flashPad(i, vel);
  const c = padCenter(i, padGrid());
  visuals.ring(c.x, c.y, [0, 0, 2, 1][PADS[i].group], 0.5 + vel * 0.6);
}

/* Drop */
function startDrop(d) {
  if (state.dropped) return;
  state.dropped = true;
  audio.setDrop(true);
  visuals.ring(d.x, d.y, 1, 1.6);
}
function releaseDrop(silent = false) {
  if (!state.dropped) return;
  state.dropped = false;
  audio.setDrop(false, silent);
  if (!silent) {
    visuals.shout('DROP', 0, 1.3);
    visuals.kick(1.2);
    const hs = gestures.hands;
    for (const side of ['left', 'right']) if (hs[side].present) visuals.burst(hs[side].palm.x, hs[side].palm.y, 40, side === 'right' ? 0 : 2, 1.6);
  }
}

/* ------------------------------------------------------------------ */
/* Gesture events                                                      */
/* ------------------------------------------------------------------ */
gestures.on((type, side, d) => {
  const mode = state.mode;
  const colorIdx = side === 'right' ? 0 : 2;
  const cam = state.source === 'camera';
  if (mode === 'pads') {
    if (!cam || type !== 'pinch') return;
    const ps = padTouchState[side];
    if (performance.now() - ps.t < 90) return;
    const i = padAt(d.x, d.y);
    if (i >= 0) { hitPad(i, 0.9); ps.t = performance.now(); }
    return;
  }
  if (type === 'fist') {
    if (mode === 'rolls') { startDrop(d); return; }
    audio.drum(mode === 'flute' ? 'boom' : 'kick', 1);
    visuals.kick(0.9);
    visuals.ring(d.x, d.y, colorIdx, 2);
    visuals.burst(d.x, d.y, 30, colorIdx, 1.3);
    return;
  }
  if (type === 'fistEnd') {
    if (mode === 'rolls') releaseDrop();
    return;
  }
  if (type !== 'pinch') return;
  if (mode === 'bass') {
    if (side === 'right') {
      const g = state.guides.bass;
      const m = state.noteIdx >= 0 ? g.notes[state.noteIdx].midi : g.notes[0].midi;
      audio.hit808(m);
      audio.drum('kick', 0.7);
      visuals.flashKey('808');
      visuals.kick(0.6);
    } else audio.hornStab(0.8);
  } else if (mode === 'rolls') {
    audio.hornStab(0.85);
  } else if (mode === 'flute') {
    const g = state.guides.flute;
    const idx = side === 'right' && state.noteIdx >= 0 ? state.noteIdx : noteAtY(g, gestures.hands[side].palm.y, -1);
    audio.fluteNote(g.notes[Math.min(g.notes.length - 1, idx)].midi + 12, 0.9);
  }
  visuals.burst(d.x, d.y, 20, colorIdx);
  visuals.ring(d.x, d.y, colorIdx, 0.8);
});

/* ------------------------------------------------------------------ */
/* Continuous control per frame                                        */
/* ------------------------------------------------------------------ */
function continuous(dt) {
  const { left: L, right: R } = gestures.hands;
  const d = gestures.distance;
  const spaceTarget = d == null ? 0.35 : clamp((d - 0.15) / 0.55);
  state.space = lerp(state.space, spaceTarget, 1 - Math.exp(-dt * 4));
  audio.setSpace(state.space);
  const mode = state.mode;

  if (mode === 'bass' || mode === 'flute') {
    const g = state.guide;
    if (R.present) {
      const idx = noteAtY(g, R.palm.y, state.noteIdx);
      const m = g.notes[idx].midi;
      if (idx !== state.noteIdx) {
        state.noteIdx = idx;
        g.active = m;
        visuals.burst(R.pts[8].x, R.pts[8].y, 5, 0, 0.5);
      }
      if (mode === 'bass') audio.setHandBass(m);
      else audio.leadOn(m);
    } else if (state.noteIdx !== -1) {
      state.noteIdx = -1;
      g.active = null;
      if (mode === 'bass') audio.setHandBass(null);
      else audio.leadOff();
    }
    if (mode === 'bass') {
      state.drive = lerp(state.drive, L.present ? L.open : 0.4, 1 - Math.exp(-dt * 8));
      audio.setDrive(state.drive);
    } else audio.setLeadExpression(L.present ? L.open : 0.6, L.present);
  } else if (mode === 'rolls') {
    const idx = R.present ? rateAtY(R.palm.y, state.rateIdx) : -1;
    if (idx !== state.rateIdx) {
      state.rateIdx = idx;
      audio.setHatRate(idx);
      if (idx >= 0) visuals.flashKey('rate' + idx);
    }
    state.sweep = lerp(state.sweep, L.present ? clamp((0.82 - L.palm.y) / 0.5) : 1, 1 - Math.exp(-dt * 6));
    audio.setSweep(state.sweep);
  }
}

/* ------------------------------------------------------------------ */
/* Clock + sequencer-synced visuals                                    */
/* ------------------------------------------------------------------ */
function clockPos(now) {
  return audio.stepPos() ?? ((now / 1000) * audio.beat.bpm * 4) / 60;
}
function onStep(step) {
  const s16 = step % 16, bar = Math.floor(step / 16) % 4, s32 = step % 32;
  const layers = LAYERS[state.mode];
  if (state.dropped) return;
  if (layers.kick && audio.beat.kicks[bar].includes(s16)) {
    visuals.kick(0.6);
    visuals.flashKey('808');
  }
  if (layers.snare && audio.beat.snares.includes(s16)) visuals.snare();
  if (state.mode === 'pads' && state.source !== 'camera') DEMO_PADS[s32]?.forEach((i) => flashPad(i, 0.85));
}

/* ------------------------------------------------------------------ */
/* Sources: attract / demo / camera                                    */
/* ------------------------------------------------------------------ */
function padsDemo(sp, aspect) {
  const g = padGrid();
  const hits = { left: [], right: [] };
  for (const [s, pads] of Object.entries(DEMO_PADS)) for (const i of pads) hits[i % 4 < 2 ? 'left' : 'right'].push({ s: +s, i });
  const size = Math.min(0.15, (g.size / visuals.H) * 0.3);
  const out = {};
  const pos = sp % 32;
  for (const side of ['left', 'right']) {
    const list = hits[side].sort((a, b) => a.s - b.s);
    let k = list.findIndex((h) => h.s > pos);
    if (k < 0) k = 0;
    const next = list[k], prev = list[(k - 1 + list.length) % list.length];
    let span = next.s - prev.s;
    if (span <= 0) span += 32;
    let u = (pos - prev.s) / span;
    if (u < 0) u += 32 / span;
    u = clamp(u);
    const a = padCenter(prev.i, g), b = padCenter(next.i, g);
    const m = ease(clamp(u / 0.6));
    const lift = Math.sin(Math.PI * clamp(u / 0.9)) * 0.06 + (u > 0.9 ? 0 : 0);
    const mir = side === 'left' ? -1 : 1;
    out[side] = {
      x: lerp(a.x, b.x, m) + (0.09 * mir * size) / aspect,
      y: lerp(a.y, b.y, m) + 2.0 * size - lift,
      size, rot: 0, open: 0.92, pinch: 0,
    };
  }
  return out;
}

function demoPose(mode, t, sp) {
  const L = { x: 0.3, y: 0.62, size: 0.17, rot: 0.15, open: 1, pinch: 0 };
  const R = { x: 0.7, y: 0.5, size: 0.17, rot: -0.15, open: 1, pinch: 0 };
  const PALM = 0.72 * R.size;
  const bar = Math.floor(sp / 16);
  const frac = (sp % 16) / 16;
  if (mode === 'bass') {
    const g = state.guides.bass;
    const idxFor = (b) => Math.min(g.notes.length - 1, Math.round((audio.beat.prog[b % 4] / 7) * (g.notes.length - 1) * 0.9));
    const cur = g.notes[idxFor(bar)].y, nxt = g.notes[idxFor(bar + 1)].y;
    R.y = lerp(cur, nxt, ease(clamp((frac - 0.86) / 0.14))) + PALM + 0.01 * Math.sin(t * 3);
    R.x = 0.68 + 0.03 * Math.sin(t * 0.8);
    L.open = 0.5 + 0.5 * Math.sin(t * 0.7);
    L.y = 0.6 + 0.05 * Math.sin(t * 0.9);
  } else if (mode === 'rolls') {
    const ph = bar % 4;
    const idx = ph === 3 && frac >= 0.5 ? 4 : [1, 2, 1, 3][ph];
    R.y = rateY(idx) + PALM + 0.012 * Math.sin(t * 5);
    R.x = 0.7 + 0.04 * Math.sin(t * 0.6);
    L.y = 0.42 + 0.2 * Math.sin(t * 0.45);
    if (bar % 8 === 7 && frac >= 0.5) L.open = 0;
  } else if (mode === 'flute') {
    R.y = 0.5 + 0.26 * Math.sin(t * 0.9) * Math.cos(t * 0.37);
    R.x = 0.7 + 0.06 * Math.sin(t * 0.7);
    const u = (sp % 8) / 8;
    R.pinch = u < 0.2 ? Math.sin((u / 0.2) * Math.PI) : 0;
    L.open = 0.55 + 0.45 * Math.sin(t * 0.6);
    L.y = 0.58 + 0.08 * Math.sin(t * 0.5);
  }
  return { left: L, right: R };
}

function demoTargets(t, sp) {
  const aspect = visuals.W / visuals.H;
  if (state.mode === 'pads') {
    const p = padsDemo(sp, aspect);
    return { left: synthHand(p.left, 'left', aspect), right: synthHand(p.right, 'right', aspect) };
  }
  const pose = demoPose(state.mode, t, sp);
  const narrow = visuals.W < 760;
  const attract = state.source === 'attract';
  const fit = (p) => {
    const q = { ...p };
    if (attract && !narrow) q.x = 0.7 + (p.x - 0.5) * 0.52;
    else if (narrow) {
      q.x = 0.5 + (p.x - 0.5) * 1.1;
      q.y = attract ? 0.12 + p.y * 0.42 : p.y;
      q.size = (p.size ?? 0.17) * 0.75;
    }
    q.size = (q.size ?? 0.17) * Math.min(1.25, Math.max(0.8, 1.35 / aspect + 0.3));
    return q;
  };
  return { left: synthHand(fit(pose.left), 'left', aspect), right: synthHand(fit(pose.right), 'right', aspect) };
}

function cameraTargets() {
  const [sx, sy] = visuals.coverScale();
  const map = (pts) => pts && pts.map((p) => ({ x: (p.x - 0.5) / sx + 0.5, y: (p.y - 0.5) / sy + 0.5, z: p.z }));
  return { left: map(tracker.latest.left), right: map(tracker.latest.right) };
}

function setStatus(kind, text) {
  const el = $('#status');
  el.className = 'status ' + kind;
  $('#statusText').textContent = text;
}

async function ensureAudio() {
  try {
    await audio.start();
    await restoreSounds();
    audio.setKey(state.root, state.scale);
    audio.setMuted(state.muted);
    return true;
  } catch (e) {
    console.error(e);
    toast('Audio could not start in this browser. Visuals still work.');
    return false;
  }
}

let firstVisit = false;
try { firstVisit = !localStorage.getItem('knuckles.seenHelp'); } catch { firstVisit = true; }
function maybeShowHelp() {
  if (!firstVisit) return;
  firstVisit = false;
  try { localStorage.setItem('knuckles.seenHelp', '1'); } catch {}
  openModal($('#help'));
}

function leaveAttract(source) {
  state.source = source;
  document.body.dataset.source = source;
  document.body.classList.remove('attract');
  gestures.hands.left.reset();
  gestures.hands.right.reset();
  setMode(state.mode, true);
}

async function startDemo() {
  const ok = await ensureAudio();
  leaveAttract('demo');
  setStatus('demo', 'Demo · simulated hands');
  if (ok) applyKey();
  maybeShowHelp();
  showHint(`Demo mode: simulated hands are playing${SEP}hit <b>Start camera</b> up top (or press <b>C</b>) to play with your hands`);
}

const startBtn = $('#startBtn');
const camBtn = $('#camBtn');
function startUi(text, loading) {
  for (const b of [startBtn, camBtn]) {
    b.classList.toggle('loading', loading);
    b.querySelector('span').textContent = text;
  }
}
async function startCamera() {
  if (state.source === 'camera') return;
  state.attractLocked = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('This browser can’t open a camera here. Try desktop Chrome over https — playing the demo instead.');
    startDemo();
    return;
  }
  startUi('Waking up the camera…', true);
  const audioOk = ensureAudio();
  try {
    await tracker.startCamera();
  } catch (e) {
    console.warn(e);
    startUi('Start camera', false);
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    toast(denied
      ? 'Camera access was blocked. Allow it from the address bar to play with your hands — here’s the demo meanwhile.'
      : 'No camera found. Playing the demo with simulated hands instead.', 6500);
    await audioOk;
    startDemo();
    return;
  }
  try {
    startUi('Loading hand model…', true);
    if (!tracker.landmarker) await tracker.load();
  } catch (e) {
    console.error(e);
    tracker.stop();
    startUi('Start camera', false);
    toast('The hand-tracking model couldn’t load (offline?). Playing the demo instead.', 6500);
    await audioOk;
    startDemo();
    return;
  }
  await audioOk;
  startUi('Start camera', false);
  leaveAttract('camera');
  setStatus('live', 'Live · looking for hands');
  state.lastHandsSeen = performance.now();
  applyKey();
  maybeShowHelp();
}

startBtn.onclick = startCamera;
camBtn.onclick = startCamera;
$('#demoBtn').onclick = startDemo;
document.querySelectorAll('#modes button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode, true); });

const muteBtn = $('#muteBtn');
muteBtn.onclick = () => {
  state.muted = !state.muted;
  muteBtn.classList.toggle('muted', state.muted);
  muteBtn.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
  audio.setMuted(state.muted);
};

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */
const REC_SECONDS = 15;
const recBtn = $('#recBtn');
const recProg = $('#recProg');
const recLabel = $('#recLabel');
let lastClipUrl = null;

async function countdown() {
  const el = $('#countdown');
  for (const n of ['3', '2', '1']) {
    el.textContent = n;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    audio.drum('rim', 0.8);
    await new Promise((r) => setTimeout(r, 750));
  }
  el.classList.remove('tick');
}

recBtn.onclick = async () => {
  if (recorder.active) { recorder.stop(); return; }
  if (state.recBusy) return;
  if (!recorder.supported) { toast('Recording isn’t supported in this browser. Try desktop Chrome.'); return; }
  state.recBusy = true;
  await ensureAudio();
  if (state.source === 'attract') { leaveAttract('demo'); setStatus('demo', 'Demo · simulated hands'); applyKey(); }
  await countdown();
  state.recBusy = false;
  document.body.classList.add('recording');
  recBtn.classList.add('on');
  recBtn.setAttribute('aria-label', 'Stop recording');
  recorder.start(audio.recordDest.stream, REC_SECONDS, (frac, s) => {
    recProg.style.strokeDashoffset = String(119.4 * (1 - frac));
    recLabel.textContent = `0:${String(Math.min(REC_SECONDS, Math.floor(s))).padStart(2, '0')}`;
  }, (blob, ext) => {
    document.body.classList.remove('recording');
    recBtn.classList.remove('on');
    recBtn.setAttribute('aria-label', 'Record a 15 second clip');
    recProg.style.strokeDashoffset = '119.4';
    recLabel.textContent = 'Record';
    if (lastClipUrl) URL.revokeObjectURL(lastClipUrl);
    lastClipUrl = URL.createObjectURL(blob);
    const v = $('#clipVideo');
    v.src = lastClipUrl;
    v.play().catch(() => {});
    const name = `knuckles-${state.mode}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
    const dl = $('#downloadBtn');
    dl.href = lastClipUrl;
    dl.download = name;
    dl.textContent = `Download .${ext}`;
    $('#clipMeta').textContent = `${(blob.size / 1e6).toFixed(1)} MB · made on your device`;
    const text = 'I just made a trap beat with my bare hands in the browser 🔥 #knuckles #hackyard';
    $('#shareX').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://chris-wozniczek.github.io/knuckles/')}`;
    openModal($('#clip'));
  });
};

/* ------------------------------------------------------------------ */
/* Your own sounds: samples per pad + a background loop (local only)   */
/* ------------------------------------------------------------------ */
const customNames = {};
const kitBtn = $('#kitBtn');
const kitPop = $('#kitPop');
const kitFile = $('#kitFile');
let kitTarget = null;
const shortName = (n) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 12) || 'Sample';
function toggleKitPop(open = kitPop.hidden) {
  kitPop.hidden = !open;
  kitBtn.setAttribute('aria-expanded', String(open));
  if (open) { toggleBeatPop(false); toggleKeyPop(false); renderKit(); }
}
kitBtn.onclick = (e) => { e.stopPropagation(); toggleKitPop(); };
document.addEventListener('pointerdown', (e) => {
  if (!kitPop.hidden && !kitPop.contains(e.target) && !kitBtn.contains(e.target)) toggleKitPop(false);
});
function renderKit() {
  const grid = $('#kitGrid');
  grid.innerHTML = '';
  for (let row = 3; row >= 0; row--) {
    for (let col = 0; col < 4; col++) {
      const i = row * 4 + col;
      const b = document.createElement('button');
      const custom = customNames[i] != null;
      b.className = custom ? 'custom' : '';
      b.title = custom ? `${customNames[i]} (click to replace)` : `Load a sound onto pad ${i + 1}`;
      b.innerHTML = `<span class="kn">A${String(i + 1).padStart(2, '0')}</span><span class="kl"></span>`;
      b.querySelector('.kl').textContent = custom ? customNames[i] : PADS[i].name;
      b.onclick = () => pickFile(i);
      grid.appendChild(b);
    }
  }
  const loopName = audio.userLoop ? loopLabel : null;
  $('#loopName').textContent = loopName ? `${loopName} · ${BEATS.user.bpm} BPM` : 'None loaded';
  $('#loopClear').hidden = !loopName;
  $('#kitReset').hidden = !Object.keys(customNames).length;
}
let loopLabel = null;
function pickFile(target) {
  kitTarget = target;
  kitFile.value = '';
  kitFile.click();
}
$('#loopLoad').onclick = () => pickFile('loop');
kitFile.onchange = () => { if (kitFile.files[0]) loadSound(kitTarget, kitFile.files[0]); };

async function applySound(target, name, bytes, fromUser) {
  let buf;
  try { buf = await audio.decode(bytes); } catch {
    if (fromUser) toast('Couldn’t read that file. Try WAV, MP3, OGG or M4A.');
    return false;
  }
  if (target === 'loop') {
    loopLabel = shortName(name);
    audio.setUserLoop(buf);
    BEATS.user.desc = `${loopLabel} · ${BEATS.user.bpm} BPM`;
    buildBeatPicker();
    if (fromUser) setBeat('user', true);
  } else {
    audio.setPadSample(target, buf);
    customNames[target] = shortName(name);
    rebuildGuides();
    if (fromUser && state.source !== 'attract') flashPad(target, 0.9);
    if (fromUser) audio.playPad(target, 0.9);
  }
  renderKit();
  return true;
}
async function loadSound(target, file) {
  if (!file) return;
  if (file.size > 25e6) { toast('That file is over 25 MB. Try a shorter clip.'); return; }
  if (!(await ensureAudio())) return;
  const bytes = await file.arrayBuffer();
  if (await applySound(target, file.name, bytes, true)) store.put(target === 'loop' ? 'loop' : `pad${target}`, { name: file.name, bytes });
}
let restored = false;
async function restoreSounds() {
  if (restored) return;
  restored = true;
  const all = await store.all();
  for (const [k, v] of Object.entries(all)) {
    if (!v?.bytes) continue;
    if (k === 'loop') await applySound('loop', v.name, v.bytes, false);
    else if (/^pad\d+$/.test(k)) await applySound(+k.slice(3), v.name, v.bytes, false);
  }
}
$('#loopClear').onclick = () => {
  audio.setUserLoop(null);
  loopLabel = null;
  store.del('loop');
  if (state.beat === 'user') setBeat('tribal', true);
  buildBeatPicker();
  renderKit();
};
$('#kitReset').onclick = () => {
  for (const k of Object.keys(customNames)) { audio.setPadSample(+k, null); store.del(`pad${k}`); delete customNames[k]; }
  rebuildGuides();
  renderKit();
};
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i.test(f.name));
  if (!file) { toast('Drop an audio file (WAV, MP3, OGG, M4A).'); return; }
  const i = state.mode === 'pads' ? padAt(e.clientX / visuals.W, e.clientY / visuals.H) : -1;
  loadSound(i >= 0 ? i : 'loop', file);
});

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'Escape') { document.querySelectorAll('.modal').forEach(closeModal); toggleKeyPop(false); toggleBeatPop(false); toggleKitPop(false); }
  else if (e.key === '?' || e.key === 'h') openModal($('#help'));
  else if (e.key >= '1' && e.key <= '4') setMode(MODE_ORDER[+e.key - 1], true);
  else if (e.key === 'm') muteBtn.click();
  else if (e.key === 'b') { const order = beatOrder(); setBeat(order[(order.indexOf(state.beat) + 1) % order.length], true); }
  else if (e.key === 'r') recBtn.click();
  else if (e.key === 'c') startCamera();
});

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */
let last = performance.now();
let attractModeT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  try {
    tick(now);
  } catch (e) {
    console.error(e);
  }
}

let trackErrors = 0;
function tick(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const t = now / 1000;
  const sp = clockPos(now);
  const step = Math.floor(sp);
  if (step !== state.lastStep) {
    if (state.lastStep >= 0 && step > state.lastStep && step - state.lastStep < 4) for (let s = state.lastStep + 1; s <= step; s++) onStep(s);
    state.lastStep = step;
  }

  if (state.source === 'camera') {
    let fresh = false;
    try {
      fresh = tracker.detect();
      trackErrors = 0;
    } catch (e) {
      if (++trackErrors === 1) console.warn('Hand tracking frame failed', e);
      if (trackErrors === 30) tracker.fallbackToCpu();
    }
    if (fresh) gestures.setTargets(cameraTargets(), now);
  } else {
    gestures.setTargets(demoTargets(t, sp), now);
    if (state.source === 'attract' && !state.attractLocked && now - attractModeT > 7000) {
      attractModeT = now;
      setMode(MODE_ORDER[(MODE_ORDER.indexOf(state.mode) + 1) % MODE_ORDER.length]);
    }
  }
  const aspect = visuals.W / visuals.H;
  gestures.update(dt, aspect, now);
  continuous(dt);

  if (state.source === 'camera') {
    const n = (gestures.hands.left.present ? 1 : 0) + (gestures.hands.right.present ? 1 : 0);
    if (n) state.lastHandsSeen = now;
    const fps = Math.round(tracker.fps);
    setStatusThrottled(n ? 'live' : 'warn', n ? `Live · ${n} hand${n > 1 ? 's' : ''} · ${fps} fps` : `Live · no hands yet · ${fps} fps`);
    if (!n && now - state.lastHandsSeen > 3500 && !state.noHandsHinted) {
      state.noHandsHinted = true;
      showHint(`Raise <b>both hands</b> into view${SEP}good light helps`);
    }
    if (n) state.noHandsHinted = false;
  }

  const grid = state.mode === 'pads' ? padGrid() : null;
  const hover = [], cursors = [];
  if (grid && state.source === 'camera') {
    for (const side of ['left', 'right']) {
      const h = gestures.hands[side];
      if (!h.present || !h.pts) continue;
      const c = aimPoint(h);
      hover.push(padAt(c.x, c.y, grid));
      cursors.push({ x: c.x, y: c.y, close: clamp((0.9 - h.pinchRatio) / 0.6), pinched: h.pinched, presence: h.presence });
    }
  }

  visuals.render({
    gestures,
    mode: state.mode,
    word: MODES[state.mode].word,
    attract: state.source === 'attract',
    videoOn: state.source === 'camera',
    level: audio.level(),
    bands: audio.bands(),
    guide: state.guide,
    grid,
    padRect,
    padLabels: state.padLabels,
    hover,
    cursors,
    rates: HAT_RATES,
    rateIdx: state.rateIdx,
    rateY,
    sweep: state.sweep,
    drive: state.drive,
    dropped: state.dropped,
    clock: { pos: sp, bpm: audio.beat.bpm, kicks: LAYERS[state.mode].kick ? audio.beat.kicks : null },
    space: state.space,
    recording: recorder.active,
    modeLabel: MODES[state.mode].label,
    keyLabel: `${NOTE_NAMES[state.root]} ${state.scale}`,
    safeTop: 90,
    safeBottom: 110,
  }, dt, t);
}

let statusCache = '';
let statusT = 0;
function setStatusThrottled(kind, text) {
  const now = performance.now();
  if (text === statusCache || now - statusT < 400) return;
  statusCache = text;
  statusT = now;
  setStatus(kind, text);
}

window.addEventListener('resize', () => { visuals.resize(); moveIndicator(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.leadOff(); });

buildKeyPicker();
buildBeatPicker();
updateKeyLabel();
rebuildGuides();
setMode('pads');
document.fonts?.ready.then(moveIndicator);
if (firstVisit) setTimeout(() => $('#helpBtn').classList.add('pulse'), 1200);
requestAnimationFrame(frame);
