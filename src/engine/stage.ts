// Сцена: фон, портреты персонажей, камера и визуальные эффекты.
import { el, sleep, Token } from './util';
import { Weather, Noise, Glitch } from './fx';
import { settings } from './settings';
import manifest from '../../assets/portraits/manifest.json';
import { BG_FX, BgFx } from '../data/bgfx';

export type Side = 'left' | 'right' | 'center';
type Manifest = Record<string, { exprs: Record<string, { talk?: boolean; blink?: boolean }> }>;
const MAN = manifest as Manifest;

const ALIAS: Record<string, string[]> = {
  warm: ['smile', 'neutral'], soft: ['smile', 'neutral'], tired: ['neutral'], calm: ['neutral'], blank: ['neutral'],
  cold: ['cold', 'angry', 'neutral'], determined: ['determined', 'angry', 'cold', 'neutral'], stern: ['neutral', 'cold'],
  worry: ['worry', 'fear', 'sad'], hurt: ['sad', 'cry'], cry: ['cry', 'sad'], surprised: ['surprised', 'shock', 'fear'],
  shock: ['shock', 'surprised', 'fear'], scared: ['fear'], fear: ['fear', 'shock'], nervous: ['neutral'], grim: ['cold', 'neutral'],
  plead: ['plead', 'fear', 'sad'], polite: ['neutral'], amused: ['smirk', 'smile'], irritated: ['angry'], laugh: ['laugh', 'smile'],
  confused: ['confused', 'surprised', 'neutral'], suspicious: ['suspicious', 'cold', 'angry'], smirk: ['smirk', 'smile'],
  angry: ['angry'], sad: ['sad'], smile: ['smile', 'warm'], cornered: ['cornered', 'fear'], calculating: ['calculating', 'smirk'],
  neutral: ['neutral', 'warm', 'smile'], glitch: ['glitch', 'neutral'],
};

// Положение глаз для эффекта «пустого белого взгляда» (координаты портрета 600×806)
const GLITCH_EYES: Record<string, [number, number][]> = { eva: [[250, 327], [410, 345]] };

export function resolveExpr(id: string, expr: string): string {
  if (expr === 'glitch' && GLITCH_EYES[id]) expr = 'shock';
  const m = MAN[id];
  if (!m) return expr;
  if (m.exprs[expr]) return expr;
  for (const a of ALIAS[expr] ?? []) if (m.exprs[a]) return a;
  for (const a of ALIAS.neutral) if (m.exprs[a]) return a;
  return Object.keys(m.exprs)[0];
}
export const hasPortrait = (id: string) => !!MAN[id];
export const portraitUrl = (id: string, expr: string, v = '') => `assets/portraits/${id}_${resolveExpr(id, expr)}${v ? '_' + v : ''}.webp`;
export const bgUrl = (id: string) => `assets/bg/${id}.webp`;
export function allAssetUrls(): string[] {
  const urls: string[] = [];
  for (const [id, m] of Object.entries(MAN)) {
    for (const [e, f] of Object.entries(m.exprs)) {
      urls.push(`assets/portraits/${id}_${e}.webp`);
      if (f.talk) urls.push(`assets/portraits/${id}_${e}_talk.webp`);
      if (f.blink) urls.push(`assets/portraits/${id}_${e}_blink.webp`);
    }
  }
  return urls;
}

interface Portrait {
  id: string;
  expr: string;
  side: Side;
  root: HTMLElement;
  a: HTMLImageElement;
  b: HTMLImageElement;
  talk: HTMLImageElement;
  blink: HTMLImageElement;
  front: HTMLImageElement;
  hasTalk: boolean;
  hasBlink: boolean;
  blinkTimer: number;
}

export interface StageSnapshot {
  bg: string | null;
  portraits: { id: string; expr: string; side: Side }[];
  memory: boolean;
  bars: boolean;
  rain: Weather['mode'];
  tint: string | null;
}

export class Stage {
  stage = document.getElementById('stage')!;
  world = document.getElementById('world')!;
  bgLayer = document.getElementById('bg-layer')!;
  charLayer = document.getElementById('char-layer')!;
  hotspotLayer = document.getElementById('hotspot-layer')!;
  weather = new Weather(document.getElementById('weather') as HTMLCanvasElement);
  noise = new Noise(document.getElementById('noise') as HTMLCanvasElement);
  glitch = new Glitch(document.getElementById('glitch') as HTMLCanvasElement, this.world, this.stage);
  private flashEl = document.getElementById('flash')!;
  private fadeEl = document.getElementById('fade')!;
  private bars = document.getElementById('letterbox')!;
  private portraits = new Map<string, Portrait>();
  private currentBg: HTMLElement | null = null;
  bgId: string | null = null;
  private memory = false;
  private tint: string | null = null;
  private speaking: string | null = null;
  private flapTimer = 0;
  private flap = false;

  constructor() {
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }
  fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    this.stage.style.setProperty('--s', String(s));
  }

  // ----------------------------------------------------------- background
  setBg(id: string | null, fade = 1.0) {
    if (id === this.bgId && this.currentBg) return;
    this.bgId = id;
    const old = this.currentBg;
    if (old) {
      old.style.setProperty('--dur', `${fade}s`);
      old.classList.remove('on');
      setTimeout(() => old.remove(), fade * 1000 + 80);
    }
    this.hotspotLayer.innerHTML = '';
    if (!id) {
      this.currentBg = null;
      return;
    }
    const bg = el('div', 'bg');
    bg.style.setProperty('--dur', `${fade}s`);
    const drift = el('div', 'drift-wrap');
    const img = el('img', 'base') as HTMLImageElement;
    img.src = bgUrl(id);
    img.alt = '';
    img.decoding = 'async';
    drift.appendChild(img);
    for (const f of BG_FX[id] ?? []) drift.appendChild(this.makeFx(f));
    bg.appendChild(drift);
    this.bgLayer.appendChild(bg);
    this.currentBg = bg;
    void bg.offsetWidth;
    requestAnimationFrame(() => bg.classList.add('on'));
  }
  /** Слой фона, внутри которого рисуются интерактивные зоны (движется вместе с фоном) */
  get bgDrift(): HTMLElement | null {
    return this.currentBg?.querySelector('.drift-wrap') ?? null;
  }
  private makeFx(f: BgFx): HTMLElement {
    const d = el('div', `fx fx-${f.type}`);
    d.style.left = `${f.x}px`;
    d.style.top = `${f.y}px`;
    d.style.width = `${f.w}px`;
    d.style.height = `${f.h}px`;
    if (f.color) d.style.setProperty('--c', f.color);
    if (f.color2) d.style.setProperty('--c2', f.color2);
    if (f.speed) d.style.setProperty('--sp', `${f.speed}s`);
    if (f.delay) d.style.animationDelay = `${f.delay}s`;
    if (f.opacity !== undefined) d.style.setProperty('--op', String(f.opacity));
    return d;
  }

  // ----------------------------------------------------------- portraits
  show(id: string, expr = 'neutral', side?: Side) {
    if (!hasPortrait(id)) return;
    const s: Side = side ?? (id === 'eva' ? 'right' : 'left');
    // на одной стороне — один портрет
    for (const p of this.portraits.values()) if (p.side === s && p.id !== id) this.hide(p.id);
    let p = this.portraits.get(id);
    if (p) {
      if (p.side !== s) {
        p.root.classList.remove(`side-${p.side}`);
        p.root.classList.add(`side-${s}`);
        p.side = s;
      }
      this.setExpr(id, expr);
      return;
    }
    const root = el('div', `pt side-${s}`);
    root.dataset.id = id;
    const inner = el('div', 'pt-inner');
    const mk = (cls: string) => {
      const i = el('img', cls) as HTMLImageElement;
      i.alt = '';
      i.decoding = 'async';
      inner.appendChild(i);
      return i;
    };
    const a = mk('pt-img pt-a'), b = mk('pt-img pt-b'), talk = mk('pt-img pt-talk'), blink = mk('pt-img pt-blink');
    for (const [ex, ey] of GLITCH_EYES[id] ?? []) {
      const g = el('i', 'pt-eye');
      g.style.left = `${ex}px`;
      g.style.top = `${ey}px`;
      inner.appendChild(g);
    }
    root.classList.toggle('glitch-eyes', expr === 'glitch');
    root.appendChild(inner);
    this.charLayer.appendChild(root);
    const e = resolveExpr(id, expr);
    a.src = portraitUrl(id, e);
    b.style.opacity = '0';
    p = { id, expr: e, side: s, root, a, b, talk, blink, front: a, hasTalk: false, hasBlink: false, blinkTimer: 0 };
    this.portraits.set(id, p);
    this.updateVariants(p);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('on')));
    this.scheduleBlink(p);
    this.applySpeaking();
  }
  hide(id: string) {
    if (id === 'all') {
      for (const k of [...this.portraits.keys()]) this.hide(k);
      return;
    }
    const p = this.portraits.get(id);
    if (!p) return;
    this.portraits.delete(id);
    clearTimeout(p.blinkTimer);
    p.root.classList.remove('on');
    p.root.classList.add('off');
    setTimeout(() => p.root.remove(), 700);
  }
  isShown(id: string) {
    return this.portraits.has(id);
  }
  setExpr(id: string, expr: string) {
    const p = this.portraits.get(id);
    if (!p) return;
    p.root.classList.toggle('glitch-eyes', expr === 'glitch');
    const e = resolveExpr(id, expr);
    if (e === p.expr) return;
    p.expr = e;
    const back = p.front === p.a ? p.b : p.a;
    back.src = portraitUrl(id, e);
    const swap = () => {
      back.onload = null;
      back.style.opacity = '1';
      if (p.front !== back) {
        p.front.style.opacity = '0';
        p.front = back;
      }
    };
    if (back.complete && back.naturalWidth) swap();
    else back.onload = swap;
    this.updateVariants(p);
  }
  private updateVariants(p: Portrait) {
    const f = MAN[p.id]?.exprs[p.expr] ?? {};
    p.hasTalk = !!f.talk;
    p.hasBlink = !!f.blink;
    p.talk.style.opacity = '0';
    p.blink.style.opacity = '0';
    if (p.hasTalk) p.talk.src = portraitUrl(p.id, p.expr, 'talk');
    if (p.hasBlink) p.blink.src = portraitUrl(p.id, p.expr, 'blink');
  }
  private scheduleBlink(p: Portrait) {
    clearTimeout(p.blinkTimer);
    p.blinkTimer = window.setTimeout(() => {
      if (!this.portraits.has(p.id)) return;
      if (p.hasBlink && !this.flap) {
        p.blink.style.opacity = '1';
        setTimeout(() => (p.blink.style.opacity = '0'), 110 + Math.random() * 50);
        if (Math.random() < 0.18) setTimeout(() => { p.blink.style.opacity = '1'; setTimeout(() => (p.blink.style.opacity = '0'), 100); }, 260);
      }
      this.scheduleBlink(p);
    }, 2600 + Math.random() * 3800);
  }
  setSpeaker(id: string | null) {
    this.speaking = id;
    this.applySpeaking();
  }
  private applySpeaking() {
    for (const p of this.portraits.values()) {
      const dim = this.speaking !== null && this.speaking !== p.id && this.portraits.size > 1;
      p.root.classList.toggle('dim', dim || (this.speaking === null && this.portraits.size > 1));
      p.root.classList.toggle('speaking', this.speaking === p.id);
    }
  }
  /** Анимация рта во время печати текста */
  mouth(on: boolean) {
    const p = this.speaking ? this.portraits.get(this.speaking) : undefined;
    clearInterval(this.flapTimer);
    this.flap = false;
    for (const q of this.portraits.values()) q.talk.style.opacity = '0';
    if (!on || !p || !p.hasTalk) return;
    this.flapTimer = window.setInterval(() => {
      this.flap = !this.flap;
      p.talk.style.opacity = this.flap ? '1' : '0';
    }, 95 + Math.random() * 40);
  }

  // ----------------------------------------------------------- camera / fx
  shake(strength = 1) {
    if (!settings.shake) return;
    this.stage.style.setProperty('--shk', String(strength));
    this.stage.classList.remove('shake');
    void this.stage.offsetWidth;
    this.stage.classList.add('shake');
  }
  push(on: boolean) {
    this.world.classList.toggle('push', on);
  }
  focus(id: string | null) {
    for (const p of this.portraits.values()) p.root.classList.toggle('focus', p.id === id);
  }
  setMemory(on: boolean) {
    this.memory = on;
    this.world.classList.toggle('memory', on);
    this.noise.boost = on ? 0.03 : 0;
    this.noise.apply();
  }
  setTint(t: string | null) {
    this.tint = t;
    this.world.dataset.tint = t ?? '';
  }
  setBars(on: boolean) {
    this.bars.classList.toggle('on', on);
  }
  setRain(mode: Weather['mode']) {
    this.weather.set(mode);
  }
  flash(color = '#fff', ms = 600) {
    if (!settings.glitch) color = 'rgba(255,255,255,0.25)';
    const f = this.flashEl;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = '0.9';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease`;
    f.style.opacity = '0';
  }
  async fade(to: 'black' | 'clear', sec: number, token?: Token) {
    this.fadeEl.style.setProperty('--fd', `${sec}s`);
    this.fadeEl.classList.toggle('on', to === 'black');
    await sleep(sec * 1000, token);
  }
  snapshot(): StageSnapshot {
    return {
      bg: this.bgId,
      portraits: [...this.portraits.values()].map((p) => ({ id: p.id, expr: p.expr, side: p.side })),
      memory: this.memory,
      bars: this.bars.classList.contains('on'),
      rain: this.weather.mode,
      tint: this.tint,
    };
  }
  restore(s: StageSnapshot) {
    this.hide('all');
    this.setBg(s.bg, 0.4);
    for (const p of s.portraits) this.show(p.id, p.expr, p.side);
    this.setMemory(s.memory);
    this.setBars(s.bars);
    this.setRain(s.rain);
    this.setTint(s.tint);
    this.setSpeaker(null);
  }
  reset() {
    this.hide('all');
    this.setBg(null, 0.3);
    this.setMemory(false);
    this.setBars(false);
    this.setRain('off');
    this.setTint(null);
    this.push(false);
    this.focus(null);
  }
}
