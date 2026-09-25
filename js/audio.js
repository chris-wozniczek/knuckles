// Trap engine: gliding 808s, punchy drums, hi-hat rolls, a dark tribal flute and a 140 BPM sequencer. Built on Tone.js.
import { chord, midiToFreq, scaleNotes } from './music.js';

let Tone = null;
export async function loadTone() {
  if (!Tone) Tone = await import('https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm');
  return Tone;
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const BPM = 140;
export const PROG = [0, 5, 3, 4]; // i – VI – iv – V
export const HAT_RATES = [
  { label: '1/8', div: 0.5 },
  { label: '1/16', div: 1 },
  { label: '1/16T', div: 1.5 },
  { label: '1/32', div: 2 },
  { label: '1/64', div: 4 },
];
// Kick + 808 hits (16th steps) for each bar of the 4-bar phrase.
export const KICKS = [[0, 10], [0, 3, 11], [0, 10, 13], [0, 6, 10, 14]];
// Two-bar flute hook as scale steps from the root (null = rest).
const MOTIF = [0, null, null, 2, null, 1, null, 0, -1, null, null, null, 0, null, -2, null,
  0, null, null, 3, null, 2, null, 1, 2, null, 1, null, 0, null, null, null];
// Beat presets: one sequencer, four grooves. Kicks are 16th steps per bar of the 4-bar phrase.
export const BEATS = {
  tribal: {
    name: 'Tribal Trap', desc: '140 BPM · flute hook, rolling hats', bpm: 140, root: 5, scale: 'Hijaz',
    prog: [0, 5, 3, 4], kicks: KICKS, snares: [8], ghosts: { 3: [15] }, ohats: { 2: [14] },
    hats: 'trap', swing: 0, lead: 'flute', motif: MOTIF, slides: [3], slideBy: 12, bassDur: '4n',
  },
  drill: {
    name: 'Brooklyn Drill', desc: '142 BPM · dark choir, sliding 808s, skippy hats', bpm: 142, root: 1, scale: 'Harmonic Minor',
    prog: [0, 5, 3, 4], kicks: [[0, 11], [0, 3, 10], [0, 11], [0, 3, 7, 10, 14]], snares: [8], ghosts: { 1: [15], 3: [13] }, ohats: { 1: [6], 3: [6] },
    hats: 'drill', swing: 0, lead: 'choir', pad: false,
    motif: [0, null, null, null, null, null, -1, null, 0, null, null, null, 2, null, null, null,
      1, null, null, null, null, null, 0, null, -1, null, null, null, -3, null, null, null],
    slides: [0, 1, 2, 3], slideBy: [12, -5, 7, -2], bassDur: '4n',
  },
  westcoast: {
    name: 'West Coast Keys', desc: '93 BPM · staccato piano stabs, G-funk bounce', bpm: 93, root: 9, scale: 'Natural Minor',
    prog: [0, 0, 5, 3], kicks: [[0, 7, 10], [0, 3, 10], [0, 7, 10], [0, 3, 10, 14]], snares: [4, 12], ghosts: { 1: [15], 3: [11] }, ohats: { 1: [14], 3: [14] },
    hats: 'eighths', swing: 0.12, lead: 'piano', pad: false,
    motif: [4, null, 4, null, 4, null, null, 4, null, 4, null, null, 4, null, 3, null,
      4, null, 4, null, 4, null, null, 4, null, 4, null, null, 5, null, 3, null],
    slides: [], slideBy: 0, bassDur: '8n',
  },
  night: {
    name: 'Late Night', desc: '128 BPM · sad guitar plucks, gangsta 808s', bpm: 128, root: 6, scale: 'Natural Minor',
    prog: [0, 5, 2, 6], kicks: [[0, 10], [0, 7, 11], [0, 10], [0, 3, 6, 10, 13]], snares: [8], ghosts: { 3: [15] }, ohats: { 0: [14], 2: [14] },
    hats: 'trap', swing: 0, lead: 'pluck',
    motif: [4, null, 2, null, 0, null, 2, null, 4, null, null, 5, 4, null, 2, null,
      3, null, 1, null, -1, null, 1, null, 3, null, null, 4, 3, null, 1, null],
    slides: [1, 3], slideBy: [0, 5, 0, -3], bassDur: '2n',
  },
};
export const BEAT_ORDER = ['tribal', 'drill', 'westcoast', 'night'];

// Finger-drumming routine the demo hands play in Pads mode (32 steps → pad indices).
export const DEMO_PADS = { 0: [0], 4: [7], 8: [2], 10: [0], 12: [7], 14: [6], 16: [0], 19: [0], 20: [7], 24: [2], 26: [0], 28: [7], 30: [3] };

// MPC-style bank A. Pad 1 is bottom-left, like the real thing.
export const PADS = [
  { name: 'Kick', snd: 'kick', group: 0 },
  { name: 'Snare', snd: 'snare', group: 0 },
  { name: 'Clap', snd: 'clap', group: 0 },
  { name: 'Rim', snd: 'rim', group: 0 },
  { name: 'Hat', snd: 'hat', group: 1 },
  { name: 'Open Hat', snd: 'ohat', group: 1 },
  { name: 'Snap', snd: 'snap', group: 1 },
  { name: 'Log Drum', snd: 'log', group: 1 },
  { name: '808', deg: 0, group: 2 },
  { name: '808', deg: 5, group: 2 },
  { name: '808', deg: 3, group: 2 },
  { name: '808', deg: 4, group: 2 },
  { name: 'Flute', snd: 'flute', group: 3 },
  { name: 'Horn', snd: 'horn', group: 3 },
  { name: 'Riser', snd: 'riser', group: 3 },
  { name: 'Crash', snd: 'crash', group: 3 },
];

/** Keep 808 roots in the chest-rattling but still audible band. */
export function bassMidi(m) {
  while (m > 45) m -= 12;
  while (m < 33) m += 12;
  return m;
}

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.root = 5;
    this.scale = 'Hijaz';
    this.loopOn = false;
    this.step = 0;
    this.hatRate = -1;
    this.layers = { kick: 1, snare: 1, hats: 1, bass: 1, melody: 1, pad: 1 };
    this.handBass = null;
    this.demoPads = false;
    this.dropped = false;
    this.sweepV = 1;
    this.leadActive = false;
    this.last808 = -10;
    this.motifIdx = 0;
    this._last = {};
    this.beat = BEATS.tribal;
  }

  /** Monosynth params need non-decreasing event times; live hits can land before already-scheduled beat events. */
  _at(key, t) {
    const v = Math.max(t, Tone.now(), (this._last[key] ?? 0) + 0.002);
    this._last[key] = v;
    return v;
  }

  async start() {
    const T = await loadTone();
    await T.start();
    if (this.ready) return;
    const ctx = T.getContext();
    ctx.lookAhead = 0.05;

    this.master = new T.Gain(0.9);
    this.sweep = new T.Filter({ type: 'lowpass', frequency: 18000, Q: 1.4, rolloff: -24 });
    this.comp = new T.Compressor({ threshold: -18, ratio: 4, attack: 0.004, release: 0.18 });
    this.limiter = new T.Limiter(-1);
    this.master.chain(this.sweep, this.comp, this.limiter, T.getDestination());
    this.recordDest = ctx.rawContext.createMediaStreamDestination();
    T.connect(this.limiter, this.recordDest);
    this.meter = new T.Meter({ normalRange: true, smoothing: 0.8 });
    this.fft = new T.Analyser('fft', 64);
    this.limiter.connect(this.meter);
    this.limiter.connect(this.fft);

    // FX sends
    this.revSmall = new T.Reverb({ decay: 1.3, preDelay: 0.01, wet: 1 });
    this.revLarge = new T.Reverb({ decay: 5.5, preDelay: 0.03, wet: 1 });
    await Promise.all([this.revSmall.ready, this.revLarge.ready]);
    this.revXfade = new T.CrossFade(0.35).connect(this.master);
    this.revSmall.connect(this.revXfade.a);
    this.revLarge.connect(this.revXfade.b);
    this.revSend = new T.Gain(0.35);
    this.revSend.fan(this.revSmall, this.revLarge);
    this.delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.34, wet: 1 });
    this.delayTone = new T.Filter({ type: 'lowpass', frequency: 3000 });
    this.delaySend = new T.Gain(0.2);
    this.delaySend.chain(this.delay, this.delayTone);
    this.delayTone.connect(this.master);
    this.delayTone.connect(this.revSend);
    const sends = (node, rev = 0, del = 0) => {
      node.connect(this.master);
      if (rev) { const g = new T.Gain(rev); node.connect(g); g.connect(this.revSend); }
      if (del) { const g = new T.Gain(del); node.connect(g); g.connect(this.delaySend); }
      return node;
    };

    // Drums
    this.drumBus = sends(new T.Gain(1), 0.12);
    const toDrums = (n) => n.connect(this.drumBus);
    this.kick = toDrums(new T.MembraneSynth({
      pitchDecay: 0.028, octaves: 6, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }, volume: -3,
    }));
    const snHP = toDrums(new T.Filter({ type: 'highpass', frequency: 1500 }));
    const snRev = sends(new T.Gain(0), 0.9);
    snHP.connect(snRev);
    this.snare = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 }, volume: -8 }).connect(snHP);
    this.snareBody = toDrums(new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 }, volume: -10 }));
    const clapBP = toDrums(new T.Filter({ type: 'bandpass', frequency: 1350, Q: 1.1 }));
    const clapRev = sends(new T.Gain(0), 1.2);
    clapBP.connect(clapRev);
    this.clap = new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.13, sustain: 0 }, volume: -5 }).connect(clapBP);
    const hatHP = toDrums(new T.Filter({ type: 'highpass', frequency: 7200 }));
    this.hatPan = new T.Panner(0.18).connect(hatHP);
    this.hat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.032, sustain: 0 }, volume: -15 }).connect(this.hatPan);
    this.ohat = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.3, sustain: 0 }, volume: -20 }).connect(this.hatPan);
    const rimBP = toDrums(new T.Filter({ type: 'bandpass', frequency: 1800, Q: 3 }));
    this.rim = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 }, volume: -12 }).connect(rimBP);
    const snapBP = toDrums(new T.Filter({ type: 'bandpass', frequency: 2800, Q: 1.6 }));
    const snapRev = sends(new T.Gain(0), 1.4);
    snapBP.connect(snapRev);
    this.snap = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, volume: -4 }).connect(snapBP);
    this.log = sends(new T.MembraneSynth({
      pitchDecay: 0.012, octaves: 1.6, envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.1 }, volume: -7,
    }), 0.5, 0.25);
    const crashHP = toDrums(new T.Filter({ type: 'highpass', frequency: 5200 }));
    this.crash = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0 }, volume: -21 }).connect(crashHP);
    this.riserF = sends(new T.Filter({ type: 'bandpass', frequency: 400, Q: 2.5 }), 0.8);
    this.riser = new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 1.5, decay: 0.08, sustain: 0 }, volume: -8 }).connect(this.riserF);

    // 808: sine with glide → drive → lowpass
    this.bassBus = sends(new T.Gain(1));
    this.b808F = new T.Filter({ type: 'lowpass', frequency: 1400, rolloff: -24 }).connect(this.bassBus);
    this.drive = new T.Distortion({ distortion: 0.4, oversample: '2x', wet: 0.7 }).connect(this.b808F);
    this.b808 = new T.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.004, decay: 1.6, sustain: 0.1, release: 0.35 },
      portamento: 0.07, volume: -3,
    }).connect(this.drive);

    // Flute: breathy triangle with vibrato, a mono lead for hand playing + poly for the hook
    this.fluteTone = sends(new T.Filter({ type: 'lowpass', frequency: 3200 }), 0.55, 0.3);
    this.fluteVib = new T.Vibrato({ frequency: 5.4, depth: 0.07 }).connect(this.fluteTone);
    this.flutePoly = new T.PolySynth(T.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.03, decay: 0.25, sustain: 0.35, release: 0.45 },
      volume: -11,
    }).connect(this.fluteVib);
    this.leadOut = sends(new T.Gain(0), 0.6, 0.35);
    this.leadF = new T.Filter({ type: 'lowpass', frequency: 2400, Q: 0.8 });
    this.leadVib = new T.Vibrato({ frequency: 5.6, depth: 0.08 });
    this.leadF.chain(this.leadVib, this.leadOut);
    this.lead = new T.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.07, decay: 0.2, sustain: 0.85, release: 0.7 },
      portamento: 0.05, volume: -7,
    }).connect(this.leadF);
    this.leadAir = new T.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.6, release: 0.7 },
      portamento: 0.05, volume: -19,
    }).connect(this.leadF);

    // Horn stab + dark choir pad
    this.hornF = sends(new T.Filter({ type: 'lowpass', frequency: 1500, Q: 1 }), 0.5, 0.2);
    this.horn = new T.PolySynth(T.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 0.012, decay: 0.35, sustain: 0.15, release: 0.4 },
      volume: -16,
    }).connect(this.hornF);
    this.padF = new T.Filter({ type: 'lowpass', frequency: 900, rolloff: -24 });
    this.chorus = new T.Chorus({ frequency: 0.4, delayTime: 4, depth: 0.7, wet: 0.6 }).start();
    this.padOut = sends(new T.Gain(1), 0.8);
    this.padF.chain(this.chorus, this.padOut);
    this.pad = new T.PolySynth(T.Synth, {
      maxPolyphony: 12,
      oscillator: { type: 'fattriangle', count: 3, spread: 24 },
      envelope: { attack: 0.7, decay: 1, sustain: 0.6, release: 2.4 },
      volume: -19,
    }).connect(this.padF);

    this.transport = T.getTransport();
    // Alternative leads for the other beats
    this.bell = sends(new T.PolySynth(T.FMSynth, {
      maxPolyphony: 8, harmonicity: 3.01, modulationIndex: 12,
      envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 1.2 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
      volume: -15,
    }), 0.7, 0.35);
    this.choirF = sends(new T.Filter({ type: 'lowpass', frequency: 1800, Q: 0.7 }), 0.9, 0.2);
    this.choir = new T.PolySynth(T.Synth, {
      maxPolyphony: 10, oscillator: { type: 'fatsawtooth', count: 4, spread: 30 },
      envelope: { attack: 0.18, decay: 0.6, sustain: 0.7, release: 1.4 },
      volume: -21,
    }).connect(this.choirF);
    const pianoF = sends(new T.Filter({ type: 'lowpass', frequency: 5200 }), 0.35, 0.08);
    this.piano = new T.PolySynth(T.FMSynth, {
      maxPolyphony: 16, harmonicity: 2, modulationIndex: 4.5, oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.45, sustain: 0.05, release: 0.25 },
      modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      volume: -12,
    }).connect(pianoF);
    const pluckCh = sends(new T.Chorus({ frequency: 1.2, delayTime: 3, depth: 0.5, wet: 0.5 }).start(), 0.7, 0.4);
    this.pluck = new T.PolySynth(T.FMSynth, {
      maxPolyphony: 10, harmonicity: 3, modulationIndex: 2.2, oscillator: { type: 'triangle' },
      envelope: { attack: 0.003, decay: 0.9, sustain: 0, release: 0.6 },
      modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      volume: -11,
    }).connect(new T.Filter({ type: 'lowpass', frequency: 3400 }).connect(pluckCh));

    this.transport.bpm.value = this.beat.bpm;
    this.transport.swingSubdivision = '16n';
    this.transport.swing = this.beat.swing;
    this.loop = new T.Loop((time) => this._tick(time), '16n');
    this.ready = true;
  }

  now() { return Tone.now(); }
  setKey(root, scale) { this.root = root; this.scale = scale; }

  chordAt(bar, base = 36) { return chord(this.root, this.scale, this.beat.prog[bar % 4], base); }

  setBeat(id) {
    const b = BEATS[id];
    if (!b) return;
    this.beat = b;
    this.root = b.root;
    this.scale = b.scale;
    if (!this.ready) return;
    this.transport.bpm.rampTo(b.bpm, 0.4);
    this.transport.swing = b.swing;
  }

  /** Background melody voice for the current beat. */
  melodyNote(midi, vel, time) {
    if (!this.ready) return;
    const f = midiToFreq(midi);
    switch (this.beat.lead) {
      case 'bell': this.bell.triggerAttackRelease(f, '8n', time, vel * 0.9); break;
      case 'choir': {
        const bar = Math.floor(this.step / 16) % 4;
        this.choir.triggerAttackRelease(f, '4n.', time, vel * 0.9);
        this.choir.triggerAttackRelease(midiToFreq(this.chordAt(bar, 48)[0]), '4n.', time, vel * 0.5);
        this.bell.triggerAttackRelease(midiToFreq(midi + 12), '16n', time, vel * 0.35);
        break;
      }
      case 'piano': {
        const bar = Math.floor(this.step / 16) % 4;
        this.piano.triggerAttackRelease(f, '16n', time, vel);
        this.piano.triggerAttackRelease(midiToFreq(midi - 12), '16n', time, vel * 0.7);
        this.chordAt(bar, 52).forEach((m) => this.piano.triggerAttackRelease(midiToFreq(m), '16n', time, vel * 0.5));
        break;
      }
      case 'pluck': this.pluck.triggerAttackRelease(f, '8n', time, vel * 0.9); break;
      default: this.fluteNote(midi, vel, time);
    }
  }
  barNow() { return Math.floor(this.step / 16) % 4; }

  /* ---------------- 808 ---------------- */
  hit808(midi, time, vel = 0.95, dur = '4n') {
    if (!this.ready) return;
    const t = this._at('808', Math.max(time ?? 0, Tone.now()));
    this.b808.triggerAttackRelease(midiToFreq(midi), dur, t, vel);
    this.last808 = t;
  }
  /** Hand-set 808 note: the sequencer uses it, and a ringing 808 glides to it. */
  setHandBass(midi) {
    if (!this.ready) return;
    const changed = midi !== this.handBass;
    this.handBass = midi;
    if (changed && midi != null && Tone.now() - this.last808 < 1.1) this.b808.setNote(midiToFreq(midi), this._at('808', Tone.now()));
  }
  setDrive(e) {
    if (!this.ready) return;
    const v = clamp(e);
    this.drive.distortion = 0.15 + v * 0.7;
    this.b808F.frequency.rampTo(500 + v * 2600, 0.1);
  }

  /* ---------------- Flute lead ---------------- */
  leadOn(midi) {
    if (!this.ready) return;
    const t = Tone.now();
    if (!this.leadActive) {
      this.lead.triggerAttack(midiToFreq(midi), t);
      this.leadAir.triggerAttack(midiToFreq(midi + 12), t);
      this.leadActive = true;
    } else {
      this.lead.setNote(midiToFreq(midi), t);
      this.leadAir.setNote(midiToFreq(midi + 12), t);
    }
  }
  leadOff() {
    if (!this.ready || !this.leadActive) return;
    const t = Tone.now();
    this.lead.triggerRelease(t);
    this.leadAir.triggerRelease(t);
    this.leadActive = false;
  }
  setLeadExpression(e, present = true) {
    if (!this.ready) return;
    const v = clamp(e);
    this.leadVib.depth.rampTo(0.02 + v * 0.16, 0.1);
    this.leadF.frequency.rampTo(900 + v * 3400, 0.08);
    this.leadOut.gain.rampTo(present ? 0.35 + 0.65 * v : 0.75, 0.1);
  }
  fluteNote(midi, vel = 0.8, time) {
    if (!this.ready) return;
    this.flutePoly.triggerAttackRelease(midiToFreq(midi), '8n', time ?? Tone.now(), vel);
  }
  motifMidi(off) {
    const notes = scaleNotes(this.root, this.scale, 48, 100);
    const home = notes.indexOf(60 + this.root + (this.root > 7 ? -12 : 0) + 12);
    return notes[clamp(home + off, 0, notes.length - 1)];
  }

  /* ---------------- Pads + one-shots ---------------- */
  playPad(i, vel = 0.9, time) {
    if (!this.ready) return;
    const p = PADS[i];
    const t = time ?? Tone.now();
    if (p.deg != null) {
      this.hit808(bassMidi(chord(this.root, this.scale, p.deg, 36)[0]), t, vel, '4n');
      return;
    }
    if (p.snd === 'flute') {
      const offs = [0, 2, 1, 0, -1, 3, 2, 4];
      this.fluteNote(this.motifMidi(offs[this.motifIdx++ % offs.length]), vel, t);
    } else if (p.snd === 'horn') this.hornStab(vel, t);
    else this.drum(p.snd, vel, t);
  }

  hornStab(vel = 0.8, time) {
    if (!this.ready) return;
    const t = time ?? Tone.now();
    this.chordAt(this.barNow(), 48).forEach((m, k) => this.horn.triggerAttackRelease(midiToFreq(m), '8n', t + k * 0.006, vel));
  }

  drum(name, vel = 0.9, time) {
    if (!this.ready) return;
    const t0 = Math.max(time ?? 0, Tone.now());
    const t = name === 'boom' ? t0 : this._at(name, t0);
    switch (name) {
      case 'kick': this.kick.triggerAttackRelease('F1', '8n', t, vel); break;
      case 'snare':
        this.snare.triggerAttackRelease('16n', t, vel);
        this.snareBody.triggerAttackRelease(195, '32n', t, vel);
        break;
      case 'clap':
        for (let i = 0; i < 3; i++) this.clap.triggerAttackRelease(0.015, t + i * 0.01, vel * 0.6);
        this.clap.triggerAttackRelease('16n', this._at('clap', t + 0.03), vel);
        break;
      case 'hat': this.hat.triggerAttackRelease('64n', t, vel); break;
      case 'ohat': this.ohat.triggerAttackRelease('8n', t, vel); break;
      case 'rim': this.rim.triggerAttackRelease(1750, '64n', t, vel); break;
      case 'snap': this.snap.triggerAttackRelease('32n', t, vel); break;
      case 'log': {
        const m = this.motifMidi([0, 2, -2, 4][this.motifIdx++ % 4]) - 12;
        this.log.triggerAttackRelease(midiToFreq(m), '8n', t, vel);
        break;
      }
      case 'crash': this.crash.triggerAttackRelease('2n', t, vel); break;
      case 'riser':
        this.riserF.frequency.cancelScheduledValues(t);
        this.riserF.frequency.setValueAtTime(300, t);
        this.riserF.frequency.exponentialRampToValueAtTime(9000, t + 1.6);
        this.riser.triggerAttackRelease(1.6, t, vel);
        break;
      case 'boom':
        this.kick.triggerAttackRelease('C1', '4n', this._at('kick', t), vel);
        this.crash.triggerAttackRelease('2n', this._at('crash', t), vel * 0.8);
        this.hit808(bassMidi(this.chordAt(this.barNow())[0]), t, vel, '2n');
        break;
    }
  }

  /* ---------------- Mixer / FX ---------------- */
  setLayers(l) { this.layers = { ...l }; }
  setHatRate(i) { this.hatRate = i; }
  setSpace(s) {
    if (!this.ready) return;
    const v = clamp(s);
    this.revXfade.fade.rampTo(v, 0.2);
    this.revSend.gain.rampTo(0.22 + v * 0.5, 0.2);
  }
  /** 0 = muffled, 1 = fully open. */
  setSweep(v) {
    this.sweepV = clamp(v);
    if (!this.ready || this.dropped) return;
    this.sweep.frequency.rampTo(160 * Math.pow(110, this.sweepV), 0.08);
  }
  setDrop(on, silent = false) {
    if (!this.ready || this.dropped === on) return;
    this.dropped = on;
    const t = Tone.now();
    if (on) {
      this.drumBus.gain.rampTo(0, 0.04, t);
      this.bassBus.gain.rampTo(0, 0.04, t);
      this.sweep.frequency.rampTo(420, 0.3, t);
      if (!silent) this.drum('riser', 0.8, t);
    } else {
      this.drumBus.gain.cancelScheduledValues(t);
      this.bassBus.gain.cancelScheduledValues(t);
      this.drumBus.gain.setValueAtTime(1, t);
      this.bassBus.gain.setValueAtTime(1, t);
      this.sweep.frequency.cancelScheduledValues(t);
      this.sweep.frequency.setValueAtTime(160 * Math.pow(110, this.sweepV), t);
      if (!silent) this.drum('boom', 1, t);
    }
  }

  /* ---------------- Sequencer ---------------- */
  startLoop() {
    if (!this.ready || this.loopOn) return;
    this.step = 0;
    this.loop.start(0);
    this.transport.start('+0.05');
    this.loopOn = true;
  }
  stopLoop() {
    if (!this.ready || !this.loopOn) return;
    this.loop.stop();
    this.transport.stop();
    this.pad.releaseAll();
    this.loopOn = false;
  }
  /** Current position in 16th steps (for visuals), or null when the beat isn't running. */
  stepPos() {
    if (!this.ready || !this.loopOn) return null;
    return this.transport.ticks / (this.transport.PPQ / 4);
  }

  _hats(time, s16, bar) {
    let div = 1;
    const style = this.beat.hats;
    const acc0 = s16 % 4 === 0 ? 0.8 : s16 % 2 === 0 ? 0.6 : 0.42;
    if (this.hatRate < 0 && style === 'eighths') {
      if (s16 % 2 === 0) this.drum('hat', s16 % 4 === 0 ? 0.75 : 0.5, time);
      else if (bar === 3 && s16 === 15) this.drum('hat', 0.35, time);
      return;
    }
    if (this.hatRate < 0 && style === 'drill') {
      if (bar === 3 && s16 >= 12) { for (let k = 0; k < 2; k++) this.drum('hat', k ? 0.45 : acc0, time + (k * 60) / this.transport.bpm.value / 8); return; }
      if ([0, 3, 6, 8, 11, 14].includes(s16)) this.drum('hat', s16 % 8 === 0 ? 0.8 : 0.55, time);
      return;
    }
    if (this.hatRate >= 0) div = HAT_RATES[this.hatRate].div;
    else if (bar === 1 && s16 >= 12) div = 1.5;
    else if (bar === 3 && s16 >= 12) div = 4;
    else if (bar === 3 && s16 >= 8) div = 2;
    const six = 60 / this.transport.bpm.value / 4;
    const acc = s16 % 4 === 0 ? 0.8 : s16 % 2 === 0 ? 0.6 : 0.42;
    if (div === 0.5) { if (s16 % 2 === 0) this.drum('hat', acc, time); return; }
    if (div === 1.5) {
      if (s16 % 2 === 0) for (let k = 0; k < 3; k++) this.drum('hat', k ? 0.5 : acc, time + (k * 2 * six) / 3);
      return;
    }
    for (let k = 0; k < div; k++) this.drum('hat', k ? 0.38 + (0.2 * k) / div : acc, time + (k * six) / div);
  }

  _tick(time) {
    const s16 = this.step % 16;
    const s32 = this.step % 32;
    const bar = Math.floor(this.step / 16) % 4;
    const L = this.layers;
    const ch = this.chordAt(bar);
    const B = this.beat;
    if (!this.dropped) {
      const kicks = B.kicks[bar];
      const kick = kicks.includes(s16);
      if (L.kick && kick) this.drum('kick', 0.95, time);
      if (L.bass && kick) {
        const slide = B.slides.includes(bar) && s16 === kicks[kicks.length - 1] && this.handBass == null;
        const m = this.handBass ?? bassMidi(ch[0]);
        this.hit808(m, time, 0.95, slide ? '8n' : B.bassDur);
        const by = Array.isArray(B.slideBy) ? B.slideBy[bar] : B.slideBy;
        if (slide && by) this.b808.setNote(midiToFreq(m + by), this._at('808', time + 0.09));
      }
      if (L.snare && B.snares.includes(s16)) { this.drum('clap', 0.85, time); this.drum('snare', 0.65, time); }
      if (L.snare && B.ghosts[bar]?.includes(s16)) this.drum('snare', 0.4, time);
      if (L.hats) this._hats(time, s16, bar);
      if (L.hats && B.ohats[bar]?.includes(s16)) this.drum('ohat', 0.55, time);
      if (this.demoPads) DEMO_PADS[s32]?.forEach((i) => this.playPad(i, 0.85, time));
    }
    if (L.melody && B.motif[s32] != null) this.melodyNote(this.motifMidi(B.motif[s32]), s32 % 8 === 0 ? 0.75 : 0.6, time);
    if (L.pad && B.pad !== false && s16 === 0) this.chordAt(bar, 48).forEach((m, k) => this.pad.triggerAttackRelease(midiToFreq(m), '1m', time + k * 0.01, 0.5));
    this.step++;
  }

  /* ---------------- Analysis ---------------- */
  level() { return this.ready ? this.meter.getValue() : 0; }
  bands() {
    if (!this.ready) return [0, 0, 0];
    const v = this.fft.getValue();
    const norm = (db) => clamp((db + 100) / 70);
    let lo = 0, mid = 0, hi = 0;
    for (let i = 0; i < 4; i++) lo += norm(v[i]);
    for (let i = 4; i < 16; i++) mid += norm(v[i]);
    for (let i = 16; i < 40; i++) hi += norm(v[i]);
    return [lo / 4, mid / 12, hi / 24];
  }
  setMuted(m) { if (this.ready) this.master.gain.rampTo(m ? 0 : 0.9, 0.15); }
}
