// Процедурный звук. Все звуки и музыка синтезируются в реальном времени через
// Web Audio API — никаких внешних аудиофайлов.
import { settings, onSettings } from './settings';

type Ctx = AudioContext;
interface Voice {
  out: GainNode;
  stop: (t: number) => void;
}
interface Track {
  id: string;
  bpm: number;
  steps: number; // шагов на такт (16)
  bars: number; // длина цикла в тактах
  start?: (a: AudioEngine, out: GainNode) => Voice[];
  step: (a: AudioEngine, out: GainNode, t: number, step: number, bar: number, intensity: number) => void;
}

const A4 = 440;
export const midi = (n: number) => A4 * Math.pow(2, (n - 69) / 12);
const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function n(s: string): number {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(s)!;
  return midi(NOTE[m[1]] + (Number(m[2]) + 1) * 12);
}
const chord = (...names: string[]) => names.map(n);

export class AudioEngine {
  ctx: Ctx | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  ambBus!: GainNode;
  sfxBus!: GainNode;
  voiceBus!: GainNode;
  reverb!: ConvolverNode;
  reverbIn!: GainNode;
  bigReverb!: ConvolverNode;
  bigReverbIn!: GainNode;
  noise!: AudioBuffer;
  pink!: AudioBuffer;
  brown!: AudioBuffer;
  private amb: { id: string; gain: GainNode; voices: Voice[]; timers: number[] } | null = null;
  private track: { t: Track; gain: GainNode; voices: Voice[]; step: number; next: number; bar: number } | null = null;
  private trackId = 'off';
  private ambId = 'off';
  intensity = 0.5;
  private sched = 0;
  private duckGain!: GainNode;
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.duckGain);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.noise = this.makeNoise('white', 4);
    this.pink = this.makeNoise('pink', 6);
    this.brown = this.makeNoise('brown', 6);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(this.reverb).connect(this.master);
    this.bigReverb = ctx.createConvolver();
    this.bigReverb.buffer = this.makeImpulse(6.5, 3.2);
    this.bigReverbIn = ctx.createGain();
    this.bigReverbIn.connect(this.bigReverb).connect(this.master);
    onSettings(() => this.applyVolumes());
    this.sched = window.setInterval(() => this.tick(), 50);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    // восстановить запрошенные до инициализации дорожки
    const a = this.ambId, m = this.trackId;
    this.ambId = 'off';
    this.trackId = 'off';
    if (a !== 'off') this.ambience(a, 0.5);
    if (m !== 'off') this.music(m, this.intensity, 0.5);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : settings.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.05);
    this.ambBus.gain.setTargetAtTime(settings.ambience * 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx * 0.8, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(settings.voice * 0.5, t, 0.05);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------- buffers ----------
  makeNoise(kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }
  makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------- primitives ----------
  src(buf: AudioBuffer, loop = true, rate = 1): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.playbackRate.value = rate;
    if (loop) s.loopStart = Math.random() * (buf.duration - 1);
    return s;
  }
  filt(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  gain(v = 1): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }
  osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }
  lfo(target: AudioParam, rate: number, depth: number, type: OscillatorType = 'sine'): OscillatorNode {
    const o = this.osc(type, rate);
    const g = this.gain(depth);
    o.connect(g).connect(target);
    o.start();
    if (this.collect) this.collect.push({ out: g, stop: (t) => { try { o.stop(t + 0.1); } catch { /* */ } } });
    return o;
  }
  private collect: Voice[] | null = null;
  send(node: AudioNode, amount: number, big = false) {
    const g = this.gain(amount);
    node.connect(g).connect(big ? this.bigReverbIn : this.reverbIn);
  }
  /** Огибающая ADSR на параметре */
  env(p: AudioParam, t: number, a: number, peak: number, d: number, s: number, hold: number, r: number) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(s, t + a, d / 3);
    p.setValueAtTime(s, t + a + Math.max(hold, d));
    p.setTargetAtTime(0.0001, t + a + Math.max(hold, d), r / 4);
  }

  // ---------- instruments (scheduled) ----------
  pad(out: AudioNode, freqs: number[], t: number, dur: number, o: { cutoff?: number; vol?: number; attack?: number; release?: number; verb?: number; type?: OscillatorType; detune?: number } = {}) {
    const ctx = this.ctx!;
    const vol = (o.vol ?? 0.06) / Math.sqrt(freqs.length);
    const f = this.filt('lowpass', o.cutoff ?? 900, 0.9);
    const g = this.gain(0);
    f.connect(g).connect(out);
    this.send(g, o.verb ?? 0.5);
    const atk = o.attack ?? 1.8, rel = o.release ?? 2.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + Math.max(atk, dur));
    g.gain.linearRampToValueAtTime(0, t + Math.max(atk, dur) + rel);
    f.frequency.setValueAtTime((o.cutoff ?? 900) * 0.6, t);
    f.frequency.linearRampToValueAtTime(o.cutoff ?? 900, t + atk);
    const end = t + Math.max(atk, dur) + rel + 0.1;
    for (const fr of freqs) {
      for (const d of [-(o.detune ?? 7), o.detune ?? 7]) {
        const os = ctx.createOscillator();
        os.type = o.type ?? 'sawtooth';
        os.frequency.value = fr;
        os.detune.value = d + (Math.random() - 0.5) * 4;
        os.connect(f);
        os.start(t);
        os.stop(end);
      }
    }
  }
  bell(out: AudioNode, freq: number, t: number, o: { vol?: number; decay?: number; ratio?: number; index?: number; verb?: number; big?: boolean } = {}) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * (o.ratio ?? 3.5);
    const mg = this.gain(0);
    const idx = (o.index ?? 2.2) * freq;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.02), t + (o.decay ?? 2.5) * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = this.gain(0);
    const vol = o.vol ?? 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.decay ?? 2.5));
    car.connect(g).connect(out);
    this.send(g, o.verb ?? 0.6, o.big);
    car.start(t);
    mod.start(t);
    car.stop(t + (o.decay ?? 2.5) + 0.1);
    mod.stop(t + (o.decay ?? 2.5) + 0.1);
  }
  pluck(out: AudioNode, freq: number, t: number, o: { vol?: number; decay?: number; cutoff?: number; type?: OscillatorType; verb?: number } = {}) {
    const os = this.osc(o.type ?? 'triangle', freq);
    const f = this.filt('lowpass', o.cutoff ?? 2400, 0.5);
    const g = this.gain(0);
    const dec = o.decay ?? 1.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    f.frequency.setValueAtTime(o.cutoff ?? 2400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + dec);
    os.connect(f).connect(g).connect(out);
    this.send(g, o.verb ?? 0.35);
    os.start(t);
    os.stop(t + dec + 0.05);
  }
  bass(out: AudioNode, freq: number, t: number, dur: number, o: { vol?: number; cutoff?: number; type?: OscillatorType; env?: number } = {}) {
    const os = this.osc(o.type ?? 'sawtooth', freq);
    const sub = this.osc('sine', freq / 2);
    const f = this.filt('lowpass', o.cutoff ?? 320, 4);
    const g = this.gain(0);
    const v = o.vol ?? 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.setTargetAtTime(v * 0.6, t + 0.01, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    f.frequency.setValueAtTime((o.cutoff ?? 320) * (o.env ?? 3), t);
    f.frequency.setTargetAtTime(o.cutoff ?? 320, t, 0.06);
    const sg = this.gain(0.6);
    sub.connect(sg).connect(g);
    os.connect(f).connect(g).connect(out);
    os.start(t); sub.start(t);
    os.stop(t + dur + 0.3); sub.stop(t + dur + 0.3);
  }
  kick(out: AudioNode, t: number, vol = 0.35, f0 = 120, f1 = 38, dec = 0.45) {
    const os = this.osc('sine', f0);
    os.frequency.setValueAtTime(f0, t);
    os.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    const g = this.gain(0);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    os.connect(g).connect(out);
    os.start(t);
    os.stop(t + dec + 0.05);
  }
  noiseHit(out: AudioNode, t: number, o: { vol?: number; dur?: number; type?: BiquadFilterType; freq?: number; q?: number; buf?: AudioBuffer; verb?: number; big?: boolean; attack?: number } = {}) {
    const s = this.src(o.buf ?? this.noise, false);
    const f = this.filt(o.type ?? 'highpass', o.freq ?? 7000, o.q ?? 0.7);
    const g = this.gain(0);
    const d = o.dur ?? 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.05, t + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(out);
    if (o.verb) this.send(g, o.verb, o.big);
    const off = Math.random() * (s.buffer!.duration - d - 0.1);
    s.start(t, Math.max(0, off), d + 0.05);
  }
  choir(out: AudioNode, freqs: number[], t: number, dur: number, vol = 0.05, vowel: 'a' | 'o' | 'u' = 'a') {
    const formants = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530] }[vowel];
    const mix = this.gain(0);
    mix.gain.setValueAtTime(0, t);
    mix.gain.linearRampToValueAtTime(vol, t + 2.2);
    mix.gain.setValueAtTime(vol, t + dur);
    mix.gain.linearRampToValueAtTime(0, t + dur + 3);
    mix.connect(out);
    this.send(mix, 0.9, true);
    const bp = formants.map((ff, i) => {
      const b = this.filt('bandpass', ff, 7);
      const bg = this.gain([1, 0.55, 0.2][i]);
      b.connect(bg).connect(mix);
      return b;
    });
    for (const fr of freqs) {
      for (const det of [-9, 0, 9]) {
        const os = this.osc('sawtooth', fr);
        os.detune.value = det;
        const vib = this.osc('sine', 4.6 + Math.random());
        const vg = this.gain(fr * 0.004);
        vib.connect(vg).connect(os.frequency);
        for (const b of bp) os.connect(b);
        os.start(t); vib.start(t);
        os.stop(t + dur + 3.2); vib.stop(t + dur + 3.2);
      }
    }
  }

  // ---------- ambience ----------
  ambience(id: string, fade = 2) {
    if (id === this.ambId) return;
    this.ambId = id;
    if (!this.ctx) return;
    const t = this.now;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, fade / 3);
      old.timers.forEach((x) => clearInterval(x));
      setTimeout(() => old.voices.forEach((v) => v.stop(this.now)), fade * 1000 + 600);
      this.amb = null;
    }
    if (id === 'off' || id === 'silence') return;
    const gain = this.gain(0);
    gain.connect(this.ambBus);
    gain.gain.setTargetAtTime(1, t, fade / 3);
    const voices: Voice[] = [];
    const timers: number[] = [];
    const A = AMBIENCES[id];
    this.collect = voices;
    if (A) A(this, gain, voices, timers);
    this.collect = null;
    this.amb = { id, gain, voices, timers };
  }

  loopNoise(out: AudioNode, buf: AudioBuffer, chain: AudioNode[], vol: number): Voice {
    const s = this.src(buf, true, 0.9 + Math.random() * 0.2);
    const g = this.gain(vol);
    let node: AudioNode = s;
    for (const c of chain) {
      node.connect(c);
      node = c;
    }
    node.connect(g).connect(out);
    s.start();
    return { out: g, stop: (t) => { try { s.stop(t + 0.1); } catch { /* */ } } };
  }
  loopOsc(out: AudioNode, type: OscillatorType, freq: number, vol: number, chain: AudioNode[] = []): Voice & { osc: OscillatorNode } {
    const o = this.osc(type, freq);
    const g = this.gain(vol);
    let node: AudioNode = o;
    for (const c of chain) {
      node.connect(c);
      node = c;
    }
    node.connect(g).connect(out);
    o.start();
    return { osc: o, out: g, stop: (t) => { try { o.stop(t + 0.1); } catch { /* */ } } };
  }

  // ---------- music ----------
  music(id: string, intensity?: number, fade = 3) {
    if (intensity !== undefined) this.setIntensity(intensity);
    if (id === this.trackId) return;
    this.trackId = id;
    if (!this.ctx) return;
    const t = this.now;
    if (this.track) {
      const old = this.track;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, fade / 3);
      setTimeout(() => { old.voices.forEach((v) => v.stop(this.now)); old.gain.disconnect(); }, fade * 1000 + 3000);
      this.track = null;
    }
    const tr = TRACKS[id];
    if (!tr) return;
    const gain = this.gain(0);
    gain.connect(this.musicBus);
    gain.gain.setTargetAtTime(1, t, Math.max(0.05, fade / 4));
    const voices: Voice[] = [];
    this.collect = voices;
    if (tr.start) voices.push(...tr.start(this, gain));
    this.collect = null;
    this.track = { t: tr, gain, voices, step: 0, next: t + 0.1, bar: 0 };
  }
  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }
  get currentMusic() { return this.trackId; }
  get currentAmb() { return this.ambId; }

  duck(amount: number, dur: number) {
    if (!this.ctx) return;
    const t = this.now;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(amount, t, 0.1);
    this.duckGain.gain.setTargetAtTime(1, t + dur, 0.8);
  }

  private tick() {
    if (!this.ctx || !this.track) return;
    const tr = this.track;
    const spb = 60 / tr.t.bpm / (tr.t.steps / 4);
    // планируем на 0.8 с вперёд: короткие подвисания интерфейса не дают рывков музыки
    while (tr.next < this.now + 0.8) {
      if (tr.next < this.now - 0.05) tr.next = this.now + 0.08; // опоздали (пауза вкладки) — догоняем без пачки нот
      tr.t.step(this, tr.gain, tr.next, tr.step, tr.bar, this.intensity);
      tr.step++;
      if (tr.step >= tr.t.steps) {
        tr.step = 0;
        tr.bar = (tr.bar + 1) % tr.t.bars;
      }
      tr.next += spb;
    }
  }

  // ---------- sfx ----------
  sfx(id: string, vol = 1) {
    if (!this.ctx) return;
    const f = SFX[id];
    if (!f) return;
    const out = this.gain(vol);
    out.connect(this.sfxBus);
    f(this, out, this.now + 0.01);
    setTimeout(() => out.disconnect(), 9000);
  }

  private lastBlip = 0;
  blip(pitch: number, kind: 'soft' | 'sys' | 'orpheus' = 'soft') {
    if (!this.ctx || settings.voice <= 0) return;
    const t = this.now;
    if (t - this.lastBlip < 0.045) return;
    this.lastBlip = t;
    const f = pitch * (0.94 + Math.random() * 0.12);
    if (kind === 'sys') {
      const o = this.osc('square', f * 2);
      const g = this.gain(0);
      const lp = this.filt('lowpass', 2500);
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(lp).connect(g).connect(this.voiceBus);
      o.start(t); o.stop(t + 0.04);
      return;
    }
    const o = this.osc(kind === 'orpheus' ? 'sine' : 'triangle', f);
    const bp = this.filt('bandpass', f * 2.2, 1.4);
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind === 'orpheus' ? 0.05 : 0.07, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(bp).connect(g).connect(this.voiceBus);
    if (kind === 'orpheus') this.send(g, 0.4);
    o.start(t); o.stop(t + 0.09);
  }
}

// ======================================================================
// AMBIENCES
// ======================================================================
type AmbFn = (a: AudioEngine, out: GainNode, v: Voice[], timers: number[]) => void;

function rain(a: AudioEngine, out: GainNode, v: Voice[], muffle: number, vol: number) {
  // шелест дождя — два слоя шума
  v.push(a.loopNoise(out, a.pink, [a.filt('highpass', 300), a.filt('lowpass', muffle)], vol));
  v.push(a.loopNoise(out, a.noise, [a.filt('bandpass', Math.min(muffle, 5200), 0.4)], vol * 0.18));
}
function droplets(a: AudioEngine, out: GainNode, timers: number[], rate: number, freq: number, vol: number) {
  timers.push(window.setInterval(() => {
    if (!a.ctx) return;
    const t = a.now;
    const k = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      if (Math.random() > rate) continue;
      a.noiseHit(out, t + Math.random() * 0.2, { type: 'bandpass', freq: freq * (0.7 + Math.random() * 0.8), q: 3, vol: vol * (0.4 + Math.random()), dur: 0.02 + Math.random() * 0.03 });
    }
  }, 220));
}
function rumble(a: AudioEngine, out: GainNode, v: Voice[], vol: number) {
  const g = a.gain(1);
  const voice = a.loopNoise(out, a.brown, [a.filt('lowpass', 140), g], vol);
  a.lfo(g.gain, 0.05, 0.4);
  v.push(voice);
}
function hum(a: AudioEngine, out: GainNode, v: Voice[], f: number, vol: number) {
  v.push(a.loopOsc(out, 'sine', f, vol));
  v.push(a.loopOsc(out, 'sine', f * 2, vol * 0.35));
  v.push(a.loopOsc(out, 'sawtooth', f * 2, vol * 0.05, [a.filt('lowpass', 400)]));
}
function buzz(a: AudioEngine, out: GainNode, v: Voice[], timers: number[], vol: number) {
  const g = a.gain(vol);
  const o = a.loopOsc(g, 'sawtooth', 120, 1, [a.filt('bandpass', 2400, 2)]);
  g.connect(out);
  v.push(o);
  timers.push(window.setInterval(() => {
    if (!a.ctx) return;
    const t = a.now;
    if (Math.random() < 0.12) {
      g.gain.setValueAtTime(0, t);
      g.gain.setValueAtTime(vol * 1.6, t + 0.05 + Math.random() * 0.1);
      g.gain.setValueAtTime(vol, t + 0.3);
    }
  }, 700));
}
function sirens(a: AudioEngine, out: GainNode, timers: number[], chance: number) {
  timers.push(window.setInterval(() => {
    if (!a.ctx || Math.random() > chance) return;
    const t = a.now;
    const o = a.osc('triangle', 700);
    const g = a.gain(0);
    const lp = a.filt('lowpass', 1400);
    for (let i = 0; i < 6; i++) {
      o.frequency.linearRampToValueAtTime(i % 2 ? 680 : 980, t + 0.6 + i * 0.9);
    }
    o.frequency.linearRampToValueAtTime(600, t + 6.5);
    g.gain.linearRampToValueAtTime(0.012, t + 2);
    g.gain.linearRampToValueAtTime(0, t + 6.5);
    o.connect(lp).connect(g).connect(out);
    a.send(g, 0.8, true);
    o.start(t);
    o.stop(t + 7);
  }, 9000));
}
function drips(a: AudioEngine, out: GainNode, timers: number[], every: number, vol: number) {
  timers.push(window.setInterval(() => {
    if (!a.ctx || Math.random() > 0.6) return;
    const t = a.now;
    const f = 900 + Math.random() * 1400;
    const o = a.osc('sine', f);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.08);
    const g = a.gain(0);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    a.send(g, 1.2, true);
    o.start(t);
    o.stop(t + 0.15);
  }, every));
}
function thunder(a: AudioEngine, out: GainNode, timers: number[], chance: number) {
  timers.push(window.setInterval(() => {
    if (!a.ctx || Math.random() > chance) return;
    const t = a.now;
    a.noiseHit(out, t, { buf: a.brown, type: 'lowpass', freq: 180, vol: 0.5, dur: 5, attack: 0.6, verb: 0.5, big: true });
  }, 14000));
}

const AMBIENCES: Record<string, AmbFn> = {
  rain_out(a, out, v, t) {
    rain(a, out, v, 7000, 0.22);
    droplets(a, out, t, 0.9, 3200, 0.03);
    rumble(a, out, v, 0.25);
    sirens(a, out, t, 0.3);
    thunder(a, out, t, 0.15);
  },
  rain_in(a, out, v, t) {
    rain(a, out, v, 900, 0.18);
    droplets(a, out, t, 0.5, 1400, 0.02);
    hum(a, out, v, 50, 0.012);
    rumble(a, out, v, 0.12);
    thunder(a, out, t, 0.12);
  },
  apartment(a, out, v, t) {
    rain(a, out, v, 1100, 0.16);
    droplets(a, out, t, 0.7, 1800, 0.025);
    hum(a, out, v, 50, 0.014);
    // холодильник/вентиляция
    v.push(a.loopNoise(out, a.pink, [a.filt('lowpass', 220)], 0.05));
    sirens(a, out, t, 0.15);
    thunder(a, out, t, 0.1);
  },
  highrise(a, out, v, t) {
    // ветер в разбитом окне
    const g = a.gain(1);
    const bp = a.filt('bandpass', 500, 1.2);
    v.push(a.loopNoise(out, a.pink, [bp, g], 0.22));
    a.lfo(bp.frequency, 0.08, 260);
    a.lfo(g.gain, 0.13, 0.5);
    rain(a, out, v, 4200, 0.17);
    droplets(a, out, t, 0.9, 2600, 0.03);
    hum(a, out, v, 50, 0.008);
    sirens(a, out, t, 0.2);
  },
  street(a, out, v, t) {
    rain(a, out, v, 6000, 0.2);
    droplets(a, out, t, 0.9, 3000, 0.03);
    rumble(a, out, v, 0.3);
    buzz(a, out, v, t, 0.012);
    sirens(a, out, t, 0.35);
    // далёкий гул толпы/рынка
    const g = a.gain(1);
    v.push(a.loopNoise(out, a.pink, [a.filt('bandpass', 380, 0.8), g], 0.05));
    a.lfo(g.gain, 0.3, 0.4);
  },
  canal(a, out, v, t) {
    AMBIENCES.street(a, out, v, t);
    // вода в канале
    v.push(a.loopNoise(out, a.brown, [a.filt('bandpass', 260, 0.6)], 0.12));
    drips(a, out, t, 900, 0.015);
  },
  den(a, out, v, t) {
    // вентиляторы серверов, гул, щелчки
    const g = a.gain(1);
    v.push(a.loopNoise(out, a.pink, [a.filt('bandpass', 900, 0.7), g], 0.09));
    a.lfo(g.gain, 0.21, 0.15);
    hum(a, out, v, 60, 0.016);
    v.push(a.loopOsc(out, 'sine', 3800, 0.0016));
    // бульканье аквариумов
    t.push(window.setInterval(() => {
      if (!a.ctx || Math.random() > 0.5) return;
      const tt = a.now;
      for (let i = 0; i < 3; i++) {
        const f = 300 + Math.random() * 500;
        const o = a.osc('sine', f);
        o.frequency.exponentialRampToValueAtTime(f * 2.2, tt + i * 0.09 + 0.06);
        const gg = a.gain(0);
        gg.gain.setValueAtTime(0.012, tt + i * 0.09);
        gg.gain.exponentialRampToValueAtTime(0.0001, tt + i * 0.09 + 0.07);
        o.connect(gg).connect(out);
        o.start(tt + i * 0.09);
        o.stop(tt + i * 0.09 + 0.1);
      }
    }, 1300));
    rain(a, out, v, 500, 0.06);
  },
  office(a, out, v, t) {
    v.push(a.loopNoise(out, a.pink, [a.filt('lowpass', 500)], 0.08));
    hum(a, out, v, 50, 0.006);
    rain(a, out, v, 700, 0.05);
    v.push(a.loopOsc(out, 'sine', 6200, 0.0008));
    thunder(a, out, t, 0.06);
  },
  columbarium(a, out, v, t) {
    rain(a, out, v, 3500, 0.12);
    droplets(a, out, t, 0.8, 4200, 0.022);
    v.push(a.loopOsc(out, 'sine', 55, 0.03));
    v.push(a.loopOsc(out, 'sine', 82.4, 0.012));
    drips(a, out, t, 1600, 0.02);
    v.push(a.loopNoise(out, a.brown, [a.filt('lowpass', 90)], 0.15));
  },
  hall(a, out, v, t) {
    hum(a, out, v, 41, 0.03);
    const g = a.gain(1);
    v.push(a.loopOsc(out, 'sine', 164, 0.012, [g]));
    a.lfo(g.gain, 0.4, 0.8);
    v.push(a.loopNoise(out, a.pink, [a.filt('bandpass', 1200, 0.6)], 0.04));
    rain(a, out, v, 1800, 0.08);
    droplets(a, out, t, 0.4, 2400, 0.015);
  },
  memory(a, out, v, t) {
    v.push(a.loopNoise(out, a.brown, [a.filt('lowpass', 300)], 0.3));
    const g = a.gain(1);
    v.push(a.loopOsc(out, 'sine', 73.4, 0.03, [g]));
    a.lfo(g.gain, 0.17, 0.7);
    v.push(a.loopOsc(out, 'sine', 77.8, 0.02));
    t.push(window.setInterval(() => {
      if (!a.ctx) return;
      const tt = a.now;
      a.kick(out, tt, 0.16, 70, 30, 0.3);
      a.kick(out, tt + 0.28, 0.1, 70, 30, 0.3);
    }, 1150));
  },
  stairwell(a, out, v, t) {
    buzz(a, out, v, t, 0.02);
    hum(a, out, v, 50, 0.01);
    drips(a, out, t, 1200, 0.03);
    rain(a, out, v, 600, 0.07);
  },
  cell(a, out, v, t) {
    hum(a, out, v, 50, 0.01);
    drips(a, out, t, 2200, 0.02);
    v.push(a.loopNoise(out, a.pink, [a.filt('lowpass', 300)], 0.04));
  },
  dawn(a, out, v, t) {
    v.push(a.loopNoise(out, a.pink, [a.filt('highpass', 400), a.filt('lowpass', 2500)], 0.04));
    drips(a, out, t, 1400, 0.015);
    rumble(a, out, v, 0.1);
  },
  taxi(a, out, v, t) {
    rain(a, out, v, 1200, 0.14);
    v.push(a.loopNoise(out, a.brown, [a.filt('lowpass', 160)], 0.4));
    droplets(a, out, t, 0.9, 1600, 0.03);
    hum(a, out, v, 70, 0.008);
  },
};

// ======================================================================
// MUSIC
// ======================================================================
const D_MINOR = ['D', 'E', 'F', 'G', 'A', 'Bb', 'C'];
function scaleNote(scale: string[], deg: number, oct: number) {
  const i = ((deg % scale.length) + scale.length) % scale.length;
  const o = oct + Math.floor(deg / scale.length);
  return n(scale[i] + o);
}

const TRACKS: Record<string, Track> = {
  // Тема «Послеобраза»: колокольчики над медленными аккордами
  title: {
    id: 'title', bpm: 64, steps: 16, bars: 8,
    step(a, out, t, s, bar, I) {
      const prog = [chord('D3', 'A3', 'C4', 'F4'), chord('Bb2', 'F3', 'A3', 'D4'), chord('G2', 'D3', 'F3', 'Bb3'), chord('A2', 'E3', 'G3', 'C#4')];
      const ch = prog[Math.floor(bar / 2) % 4];
      if (s === 0 && bar % 2 === 0) a.pad(out, ch, t, 6.5, { cutoff: 1100, vol: 0.07, attack: 2.5, release: 3.5, verb: 0.7 });
      if (s === 0 && bar % 2 === 0) a.bass(out, ch[0] / 2, t, 7, { vol: 0.05, cutoff: 200, type: 'triangle', env: 1 });
      const mel: (string | null)[] = ['D5', null, null, null, 'A4', null, null, null, 'F5', null, null, 'E5', null, null, null, null];
      const mel2: (string | null)[] = ['D5', null, null, null, 'C5', null, 'A4', null, 'Bb4', null, null, null, null, null, null, null];
      const m = (bar % 4 < 2 ? mel : mel2)[s];
      if (m && bar % 2 === 0) a.bell(out, n(m), t, { vol: 0.045, decay: 3.5, verb: 0.9, big: true });
      if (I > 0.4 && s % 4 === 2 && Math.random() < 0.3) a.bell(out, scaleNote(D_MINOR, Math.floor(Math.random() * 7), 6), t, { vol: 0.012, decay: 2, ratio: 7, verb: 1, big: true });
    },
  },
  // Бессонница — пустая квартира, мягкие аккорды
  insomnia: {
    id: 'insomnia', bpm: 58, steps: 16, bars: 8,
    step(a, out, t, s, bar, I) {
      const prog = [chord('D3', 'F3', 'A3', 'E4'), chord('Bb2', 'D3', 'F3', 'A3'), chord('G2', 'Bb2', 'D3', 'A3'), chord('A2', 'D3', 'E3', 'G3')];
      const ch = prog[Math.floor(bar / 2) % 4];
      if (s === 0 && bar % 2 === 0) a.pad(out, ch, t, 7, { cutoff: 700 + I * 600, vol: 0.06, attack: 3, release: 4, verb: 0.8 });
      if (s % 8 === 4 && Math.random() < 0.45) a.bell(out, scaleNote(D_MINOR, [0, 2, 4, 6, 7, 9][Math.floor(Math.random() * 6)], 5), t, { vol: 0.03, decay: 4, verb: 1, big: true });
      if (I > 0.5 && s === 8 && bar % 2 === 1) a.pluck(out, ch[0], t, { vol: 0.04, decay: 2.5, cutoff: 900 });
    },
  },
  // Расследование — пульсирующий бас, мягкий ритм
  investigation: {
    id: 'investigation', bpm: 86, steps: 16, bars: 4,
    step(a, out, t, s, bar, I) {
      const roots = ['D2', 'D2', 'Bb1', 'C2'];
      const r = n(roots[bar]);
      if (s % 2 === 0) a.bass(out, r, t, 0.18, { vol: 0.05 + I * 0.03, cutoff: 260 + I * 300 });
      if (s === 0) a.pad(out, bar < 2 ? chord('D3', 'F3', 'A3', 'C4') : bar === 2 ? chord('Bb2', 'D3', 'F3', 'A3') : chord('C3', 'E3', 'G3', 'Bb3'), t, 2.6, { cutoff: 800, vol: 0.04, attack: 0.8, release: 1.5 });
      if (I > 0.3 && (s === 4 || s === 12)) a.noiseHit(out, t, { vol: 0.03, dur: 0.06, freq: 8000 });
      if (I > 0.55 && s % 2 === 1) a.noiseHit(out, t, { vol: 0.012, dur: 0.03, freq: 9000 });
      if (I > 0.45) {
        const arp = [0, 2, 4, 7, 4, 2, 9, 7];
        if (s % 2 === 0) a.pluck(out, scaleNote(D_MINOR, arp[(s / 2) % 8] + (bar === 2 ? -2 : 0), 4), t, { vol: 0.025, decay: 0.6, cutoff: 1800 });
      }
      if (s === 0 && bar === 0) a.kick(out, t, 0.12, 90, 40, 0.4);
    },
  },
  // Напряжение — дрон, сердцебиение, тиканье
  tension: {
    id: 'tension', bpm: 66, steps: 16, bars: 4,
    start(a, out) {
      const v: Voice[] = [];
      const lp = a.filt('lowpass', 500, 2);
      const g = a.gain(1);
      v.push(a.loopOsc(out, 'sawtooth', n('A1'), 0.03, [lp, g]));
      v.push(a.loopOsc(out, 'sawtooth', n('Bb1') * 1.003, 0.02, [lp]));
      a.lfo(lp.frequency, 0.07, 300);
      a.lfo(g.gain, 0.11, 0.3);
      return v;
    },
    step(a, out, t, s, bar, I) {
      if (s === 0 || s === 3) a.kick(out, t, s === 0 ? 0.22 : 0.14, 80, 35, 0.35);
      if (I > 0.3 && s % 4 === 2) a.noiseHit(out, t, { vol: 0.02, dur: 0.02, freq: 6000, type: 'bandpass', q: 8 });
      if (s === 0 && bar % 2 === 0) a.pad(out, chord('E4', 'F4', 'B4'), t, 4, { cutoff: 1200 + I * 2000, vol: 0.015 + I * 0.03, attack: 3, release: 2, type: 'sawtooth', detune: 14 });
      if (I > 0.7 && s % 2 === 0) a.bass(out, n('A1'), t, 0.1, { vol: 0.04, cutoff: 200 });
    },
  },
  // Послеобраз — искажённая память
  memory: {
    id: 'memory', bpm: 50, steps: 16, bars: 4,
    start(a, out) {
      const v: Voice[] = [];
      const g = a.gain(1);
      v.push(a.loopOsc(out, 'triangle', n('D3'), 0.025, [a.filt('lowpass', 600), g]));
      const g2 = a.gain(1);
      const o2 = a.loopOsc(out, 'triangle', n('A3') * 0.99, 0.018, [a.filt('lowpass', 800), g2]);
      a.lfo(o2.osc.detune, 0.2, 30);
      a.lfo(g.gain, 0.09, 0.6);
      v.push(o2);
      return v;
    },
    step(a, out, t, s, bar, I) {
      if (s % 4 === 0 && Math.random() < 0.6) {
        const f = scaleNote(D_MINOR, Math.floor(Math.random() * 10), 5);
        // «обратный» колокол — медленная атака
        const o = a.osc('sine', f);
        const g = a.gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03, t + 1.4);
        g.gain.linearRampToValueAtTime(0, t + 1.5);
        o.detune.value = (Math.random() - 0.5) * 60;
        o.connect(g).connect(out);
        a.send(g, 1.2, true);
        o.start(t);
        o.stop(t + 1.6);
      }
      if (I > 0.5 && s === 8) a.noiseHit(out, t, { vol: 0.04, dur: 1.5, type: 'bandpass', freq: 1200 + Math.random() * 2000, q: 12, attack: 1.2, verb: 1, big: true });
    },
  },
  // Скорбь — хор и редкая мелодия (колумбарий)
  grief: {
    id: 'grief', bpm: 56, steps: 16, bars: 8,
    step(a, out, t, s, bar, I) {
      const prog = [chord('D3', 'A3', 'F4'), chord('Bb2', 'F3', 'D4'), chord('F2', 'C3', 'A3'), chord('C3', 'G3', 'E4')];
      const ch = prog[Math.floor(bar / 2) % 4];
      if (s === 0 && bar % 2 === 0) a.choir(out, ch, t, 6, 0.04, bar % 4 === 0 ? 'a' : 'o');
      const mel = [['A4', 0], ['F4', 6], ['G4', 8], ['E4', 12]] as const;
      const mel2 = [['D5', 0], ['C5', 4], ['A4', 8], ['Bb4', 12]] as const;
      const M = bar % 4 < 2 ? mel : mel2;
      if (bar % 2 === 0) for (const [note, st] of M) if (st === s) a.pluck(out, n(note), t, { vol: 0.05 + I * 0.02, decay: 3, cutoff: 1600, verb: 0.9 });
      if (I > 0.5 && s === 0 && bar % 2 === 1) a.bell(out, ch[2] * 2, t, { vol: 0.02, decay: 4, verb: 1, big: true });
    },
  },
  // Конфронтация — остинато
  confront: {
    id: 'confront', bpm: 98, steps: 16, bars: 4,
    step(a, out, t, s, bar, I) {
      const roots = ['D2', 'D2', 'F2', 'E2'];
      const pat = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];
      if (pat[s]) a.bass(out, n(roots[bar]) * (s === 14 ? 2 : 1), t, 0.12, { vol: 0.055 + I * 0.03, cutoff: 300 + I * 500 });
      if (s === 0 || s === 8 || (I > 0.6 && s === 11)) a.kick(out, t, 0.3, 110, 40, 0.4);
      if (s === 4 || s === 12) a.noiseHit(out, t, { vol: 0.05, dur: 0.12, freq: 2500, type: 'bandpass', q: 1, verb: 0.3 });
      if (I > 0.4 && s % 2 === 1) a.noiseHit(out, t, { vol: 0.015, dur: 0.03, freq: 9000 });
      if (s === 0 && bar % 2 === 0) a.pad(out, bar === 0 ? chord('D3', 'F3', 'A3') : chord('F3', 'A3', 'C4'), t, 4.5, { cutoff: 1400, vol: 0.035 + I * 0.02, attack: 0.5, release: 1 });
      if (I > 0.7 && s % 4 === 0) a.pluck(out, scaleNote(D_MINOR, [7, 9, 11, 9][s / 4], 4), t, { vol: 0.03, decay: 0.5, type: 'square', cutoff: 1500 });
    },
  },
  // Эпилог — фортепиано и пустота
  ending: {
    id: 'ending', bpm: 60, steps: 16, bars: 8,
    step(a, out, t, s, bar, I) {
      const prog = [chord('D3', 'A3', 'E4'), chord('Bb2', 'F3', 'C4'), chord('F2', 'C3', 'G3'), chord('A2', 'E3', 'C#4')];
      const ch = prog[Math.floor(bar / 2) % 4];
      if (s === 0 && bar % 2 === 0) a.pad(out, ch, t, 7, { cutoff: 900, vol: 0.05, attack: 3, release: 4, verb: 0.8, type: 'triangle' });
      const mel = ['D5', 'E5', 'F5', 'A4', 'E5', 'D5', 'C5', 'A4'];
      if (s === 0 || (s === 8 && Math.random() < 0.6)) a.pluck(out, n(mel[(bar * 2 + (s ? 1 : 0)) % 8]), t, { vol: 0.055, decay: 3.5, cutoff: 1800, verb: 0.9 });
      if (I > 0.5 && s === 12 && Math.random() < 0.5) a.bell(out, ch[1] * 4, t, { vol: 0.015, decay: 4, verb: 1, big: true });
    },
  },
  // Светлый, неоднозначный финал (лидийский лад)
  open: {
    id: 'open', bpm: 62, steps: 16, bars: 8,
    step(a, out, t, s, bar) {
      const prog = [chord('F3', 'A3', 'C4', 'E4'), chord('G3', 'B3', 'D4', 'E4'), chord('E3', 'G3', 'B3', 'D4'), chord('A2', 'E3', 'G3', 'B3')];
      const ch = prog[Math.floor(bar / 2) % 4];
      if (s === 0 && bar % 2 === 0) a.pad(out, ch, t, 7, { cutoff: 1500, vol: 0.05, attack: 3, release: 4, verb: 0.9 });
      if (s % 4 === 0 && Math.random() < 0.4) a.bell(out, ch[Math.floor(Math.random() * 4)] * 4, t, { vol: 0.02, decay: 3, ratio: 2, verb: 1, big: true });
    },
  },
  // Колыбельная Сони (простая мелодия в памяти)
  sonya: {
    id: 'sonya', bpm: 72, steps: 16, bars: 4,
    step(a, out, t, s, bar) {
      const mel: Record<number, string>[] = [
        { 0: 'A4', 4: 'D5', 8: 'C5', 12: 'A4' },
        { 0: 'Bb4', 6: 'A4', 8: 'G4', 12: 'F4' },
        { 0: 'G4', 4: 'A4', 8: 'Bb4', 12: 'D5' },
        { 0: 'C#5', 8: 'A4' },
      ];
      const m = mel[bar][s];
      if (m) a.bell(out, n(m), t, { vol: 0.03, decay: 2.8, ratio: 2, index: 1, verb: 0.9, big: true });
      if (s === 0) a.pad(out, [chord('D3', 'F3', 'A3'), chord('Bb2', 'D3', 'F3'), chord('G2', 'Bb2', 'D3'), chord('A2', 'C#3', 'E3')][bar], t, 2.8, { cutoff: 700, vol: 0.035, attack: 1, release: 2, type: 'triangle' });
    },
  },
};

// ======================================================================
// SFX
// ======================================================================
type SfxFn = (a: AudioEngine, out: GainNode, t: number) => void;
const SFX: Record<string, SfxFn> = {
  hover(a, out, t) {
    a.noiseHit(out, t, { vol: 0.02, dur: 0.02, freq: 5000, type: 'bandpass', q: 4 });
  },
  click(a, out, t) {
    const o = a.osc('square', 1800);
    const g = a.gain(0);
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(a.filt('lowpass', 3000)).connect(g).connect(out);
    o.start(t); o.stop(t + 0.05);
  },
  confirm(a, out, t) {
    a.bell(out, n('A5'), t, { vol: 0.03, decay: 0.5, ratio: 2, index: 0.5, verb: 0.2 });
    a.bell(out, n('E6'), t + 0.06, { vol: 0.025, decay: 0.6, ratio: 2, index: 0.5, verb: 0.2 });
  },
  back(a, out, t) {
    a.bell(out, n('E5'), t, { vol: 0.03, decay: 0.4, ratio: 2, index: 0.4, verb: 0.2 });
  },
  choice(a, out, t) {
    a.kick(out, t, 0.25, 90, 35, 0.6);
    a.noiseHit(out, t, { vol: 0.06, dur: 0.5, type: 'bandpass', freq: 900, q: 0.8, verb: 0.5, attack: 0.05 });
    a.bell(out, n('D4'), t, { vol: 0.03, decay: 2, ratio: 1.5, verb: 0.8, big: true });
  },
  evidence(a, out, t) {
    [n('D5'), n('A5'), n('F6'), n('A6')].forEach((f, i) => a.bell(out, f, t + i * 0.07, { vol: 0.035, decay: 1.8, ratio: 3, index: 1.4, verb: 0.8 }));
    a.noiseHit(out, t, { vol: 0.03, dur: 1, type: 'highpass', freq: 9000, attack: 0.3, verb: 0.6 });
  },
  deduction(a, out, t) {
    a.kick(out, t, 0.3, 70, 30, 0.8);
    [n('D4'), n('A4'), n('D5'), n('F5'), n('A5')].forEach((f, i) => a.pluck(out, f, t + i * 0.05, { vol: 0.04, decay: 1.5, verb: 0.7 }));
    a.pad(out, chord('D4', 'A4', 'E5'), t, 0.8, { cutoff: 2500, vol: 0.04, attack: 0.05, release: 2 });
  },
  wrong(a, out, t) {
    const o = a.osc('sawtooth', 110);
    const g = a.gain(0);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.frequency.linearRampToValueAtTime(80, t + 0.3);
    o.connect(a.filt('lowpass', 600)).connect(g).connect(out);
    o.start(t); o.stop(t + 0.4);
  },
  tick(a, out, t) {
    a.noiseHit(out, t, { vol: 0.05, dur: 0.015, freq: 4000, type: 'bandpass', q: 10 });
  },
  timeout(a, out, t) {
    a.kick(out, t, 0.35, 60, 25, 1);
    a.noiseHit(out, t, { vol: 0.08, dur: 1.2, buf: a.brown, type: 'lowpass', freq: 300, verb: 0.6 });
  },
  glitch(a, out, t) {
    for (let i = 0; i < 7; i++) {
      const tt = t + i * 0.035 + Math.random() * 0.02;
      if (Math.random() < 0.5) a.noiseHit(out, tt, { vol: 0.08, dur: 0.03, type: 'bandpass', freq: 500 + Math.random() * 5000, q: 2 });
      else {
        const o = a.osc('square', 200 + Math.random() * 2000);
        const g = a.gain(0);
        g.gain.setValueAtTime(0.03, tt);
        g.gain.setValueAtTime(0, tt + 0.03);
        o.connect(g).connect(out);
        o.start(tt); o.stop(tt + 0.04);
      }
    }
  },
  static(a, out, t) {
    a.noiseHit(out, t, { vol: 0.07, dur: 0.9, type: 'bandpass', freq: 2200, q: 0.6, attack: 0.05 });
    for (let i = 0; i < 12; i++) a.noiseHit(out, t + Math.random() * 0.8, { vol: 0.06, dur: 0.01, freq: 3000 });
  },
  glass(a, out, t) {
    a.noiseHit(out, t, { vol: 0.35, dur: 0.6, type: 'highpass', freq: 2500, verb: 0.6, big: true });
    a.kick(out, t, 0.3, 140, 50, 0.3);
    for (let i = 0; i < 26; i++) {
      const tt = t + 0.02 + Math.pow(Math.random(), 2) * 1.4;
      const f = 2500 + Math.random() * 6000;
      const o = a.osc('sine', f);
      const g = a.gain(0);
      g.gain.setValueAtTime(0.02 + Math.random() * 0.03, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05 + Math.random() * 0.25);
      o.connect(g).connect(out);
      a.send(g, 0.5);
      o.start(tt); o.stop(tt + 0.35);
    }
  },
  heartbeat(a, out, t) {
    a.kick(out, t, 0.35, 70, 30, 0.3);
    a.kick(out, t + 0.26, 0.22, 70, 30, 0.3);
  },
  rig_on(a, out, t) {
    const o = a.osc('sawtooth', 80);
    o.frequency.exponentialRampToValueAtTime(1600, t + 1.4);
    const g = a.gain(0);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + 1.5);
    const f = a.filt('lowpass', 2000, 6);
    f.frequency.exponentialRampToValueAtTime(6000, t + 1.4);
    o.connect(f).connect(g).connect(out);
    a.send(g, 0.8, true);
    o.start(t); o.stop(t + 1.6);
    [0, 0.25, 0.5].forEach((d) => a.bell(out, n('A6'), t + 1.5 + d, { vol: 0.02, decay: 0.2, ratio: 1, index: 0.1, verb: 0.3 }));
    a.noiseHit(out, t + 1.45, { vol: 0.2, dur: 2.5, buf: a.brown, type: 'lowpass', freq: 400, verb: 1, big: true });
  },
  rig_off(a, out, t) {
    const o = a.osc('sine', 1400);
    o.frequency.exponentialRampToValueAtTime(60, t + 1.2);
    const g = a.gain(0.05);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    o.connect(g).connect(out);
    a.send(g, 0.7, true);
    o.start(t); o.stop(t + 1.3);
  },
  phone(a, out, t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.9;
      [n('E5'), n('B5')].forEach((f, j) => {
        const o = a.osc('sine', f);
        const g = a.gain(0);
        g.gain.setValueAtTime(0, tt + j * 0.18);
        g.gain.linearRampToValueAtTime(0.04, tt + j * 0.18 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + j * 0.18 + 0.3);
        o.connect(g).connect(out);
        a.send(g, 0.3);
        o.start(tt + j * 0.18); o.stop(tt + j * 0.18 + 0.35);
      });
    }
  },
  door(a, out, t) {
    a.noiseHit(out, t, { vol: 0.12, dur: 0.5, buf: a.brown, type: 'lowpass', freq: 500, attack: 0.05, verb: 0.3 });
    a.kick(out, t + 0.45, 0.25, 90, 50, 0.25);
  },
  door_slide(a, out, t) {
    a.noiseHit(out, t, { vol: 0.08, dur: 0.8, type: 'bandpass', freq: 900, q: 1, attack: 0.3 });
    a.bell(out, n('C6'), t + 0.7, { vol: 0.015, decay: 0.4, ratio: 1, index: 0.2 });
  },
  buzz(a, out, t) {
    const o = a.osc('square', 220);
    const g = a.gain(0);
    g.gain.setValueAtTime(0.03, t);
    g.gain.setValueAtTime(0.03, t + 0.6);
    g.gain.linearRampToValueAtTime(0, t + 0.65);
    o.connect(a.filt('bandpass', 900, 2)).connect(g).connect(out);
    o.start(t); o.stop(t + 0.7);
  },
  elevator(a, out, t) {
    a.bell(out, n('G5'), t, { vol: 0.04, decay: 1.5, ratio: 2, index: 0.3, verb: 0.5 });
    a.bell(out, n('E5'), t + 0.35, { vol: 0.04, decay: 1.8, ratio: 2, index: 0.3, verb: 0.5 });
  },
  typing(a, out, t) {
    for (let i = 0; i < 14; i++) a.noiseHit(out, t + i * (0.06 + Math.random() * 0.06), { vol: 0.04, dur: 0.02, freq: 2500 + Math.random() * 2000, type: 'bandpass', q: 3 });
  },
  paper(a, out, t) {
    for (let i = 0; i < 5; i++) a.noiseHit(out, t + i * 0.06 + Math.random() * 0.05, { vol: 0.05, dur: 0.12, freq: 3500, type: 'bandpass', q: 0.8, attack: 0.03 });
  },
  camera(a, out, t) {
    a.bell(out, n('B6'), t, { vol: 0.02, decay: 0.15, ratio: 1, index: 0.1 });
    a.noiseHit(out, t + 0.1, { vol: 0.03, dur: 0.5, type: 'bandpass', freq: 1800, q: 4, attack: 0.1 });
  },
  stinger(a, out, t) {
    a.kick(out, t, 0.5, 60, 22, 2.2);
    a.noiseHit(out, t, { vol: 0.2, dur: 3, buf: a.brown, type: 'lowpass', freq: 220, verb: 1, big: true, attack: 0.01 });
    a.pad(out, chord('D3', 'Eb3', 'A3', 'Bb3'), t, 1.5, { cutoff: 2200, vol: 0.07, attack: 0.02, release: 3, verb: 1, detune: 18 });
  },
  boom(a, out, t) {
    a.kick(out, t, 0.6, 50, 20, 3);
    a.noiseHit(out, t, { vol: 0.25, dur: 4, buf: a.brown, type: 'lowpass', freq: 140, verb: 1, big: true });
  },
  whoosh(a, out, t) {
    const s = a.src(a.noise, false);
    const f = a.filt('bandpass', 300, 1.5);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.6);
    const g = a.gain(0);
    g.gain.linearRampToValueAtTime(0.08, t + 0.4);
    g.gain.linearRampToValueAtTime(0, t + 0.8);
    s.connect(f).connect(g).connect(out);
    s.start(t, 0, 1);
  },
  chapter(a, out, t) {
    a.kick(out, t, 0.4, 55, 25, 2.5);
    a.bell(out, n('D4'), t, { vol: 0.05, decay: 5, ratio: 1.41, index: 1.5, verb: 1, big: true });
    a.bell(out, n('A4'), t + 0.8, { vol: 0.03, decay: 5, ratio: 1.41, index: 1, verb: 1, big: true });
  },
  drip(a, out, t) {
    const o = a.osc('sine', 1600);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
    const g = a.gain(0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    a.send(g, 1, true);
    o.start(t); o.stop(t + 0.15);
  },
  purr(a, out, t) {
    const s = a.src(a.brown, false);
    const g = a.gain(0);
    const am = a.osc('sine', 24);
    const amg = a.gain(0.06);
    am.connect(amg).connect(g.gain);
    g.gain.setValueAtTime(0.0, t);
    s.connect(a.filt('lowpass', 300)).connect(g).connect(out);
    s.start(t, 0, 2.2);
    am.start(t); am.stop(t + 2.2);
  },
  gunshot(a, out, t) {
    a.noiseHit(out, t, { vol: 0.7, dur: 0.25, type: 'lowpass', freq: 3000, verb: 1, big: true });
    a.kick(out, t, 0.8, 160, 30, 0.6);
    a.noiseHit(out, t + 0.05, { vol: 0.25, dur: 3, buf: a.brown, type: 'lowpass', freq: 400, verb: 1, big: true });
  },
  thunder(a, out, t) {
    a.noiseHit(out, t, { vol: 0.5, dur: 5, buf: a.brown, type: 'lowpass', freq: 200, attack: 0.3, verb: 0.6, big: true });
  },
  scan(a, out, t) {
    for (let i = 0; i < 8; i++) a.bell(out, n('C6') * (1 + i * 0.12), t + i * 0.05, { vol: 0.012, decay: 0.15, ratio: 1, index: 0.1 });
  },
  breath(a, out, t) {
    a.noiseHit(out, t, { vol: 0.05, dur: 1.4, type: 'bandpass', freq: 700, q: 0.6, attack: 0.6 });
  },
  fall(a, out, t) {
    const s = a.src(a.noise, false);
    const f = a.filt('bandpass', 400, 0.8);
    f.frequency.linearRampToValueAtTime(2400, t + 2.5);
    const g = a.gain(0);
    g.gain.linearRampToValueAtTime(0.2, t + 2.2);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    s.connect(f).connect(g).connect(out);
    s.start(t, 0, 2.7);
  },
  silence_hit(a, out, t) {
    a.noiseHit(out, t, { vol: 0.3, dur: 0.08, buf: a.brown, type: 'lowpass', freq: 200 });
  },
};

export const audio = new AudioEngine();
