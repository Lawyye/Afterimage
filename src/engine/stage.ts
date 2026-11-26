// Сцена: фон, портреты персонажей, камера и визуальные эффекты.
import { el, sleep, Token, haptic, LOWFX } from './util';
import { Weather, Noise, Glitch } from './fx';
import { settings, onSettings } from './settings';
import manifest from '../../assets/portraits/manifest.json';
import bodiesJson from '../../assets/bodies/bodies.json';
import { BG_FX, BgFx } from '../data/bgfx';
import { asset } from './assets';

export type Side = 'left' | 'right' | 'center';
type Box = [number, number, number, number]; // left, top, width, height в процентах кадра
type ExprMap = Record<string, { talk?: Box; blink?: Box }>;
/** Манифест v2: exprs — основная поза (как раньше), poses — дополнительные позы со своими эмоциями и накладками,
 * full — персонаж нарисован в полный рост (другая раскладка). Старый манифест читается без изменений. */
interface PortraitEntry { exprs: ExprMap; full?: boolean; poses?: Record<string, { exprs: ExprMap }> }
type Manifest = Record<string, PortraitEntry>;
const MAN = manifest as unknown as Manifest;
/** Тела персонажей (tools/art/bodies.py): размер кадра, рост относительно других, рамка головы в процентах кадра */
interface BodyDef { w: number; h: number; hf: number; bust: Box; poses?: string[] }
const BODIES = bodiesJson as unknown as Record<string, BodyDef>;
export const hasBody = (id: string) => !!BODIES[id];
export const bodyUrl = (id: string, pose = '') => asset(`assets/bodies/${id}${pose ? '@' + pose : ''}.webp`);
/** Жесты-позы по эмоции: в гневе и холоде скрещивают руки (если такая поза нарисована) */
const BODY_POSE: Record<string, Record<string, string>> = {
  voron: { cold: 'crossed', angry: 'crossed', cornered: 'crossed' },
  eva: { angry: 'crossed' },
};
const bodyPoseFor = (id: string, expr: string) => {
  const pose = BODY_POSE[id]?.[expr];
  return pose && BODIES[id]?.poses?.includes(pose) ? pose : '';
};
/** Раскладка «персонаж стоит в сцене»: ноги за нижним краем, голова ~20 % высоты экрана, фон вокруг виден */
const BODY_SCALE = 0.8;      // точек сцены на точку кадра тела (для роста 1.0)
const BODY_GROUND = 1300;    // где ступни (ниже края экрана 1080)
const SLOT_X: Record<Side, number> = { left: 440, center: 960, right: 1480 };
/** Добавить или заменить описание персонажа во время работы (тесты, моды) */
export function definePortrait(id: string, entry: PortraitEntry) { MAN[id] = entry; }
const exprsOf = (id: string, pose = ''): ExprMap => (pose && MAN[id]?.poses?.[pose]?.exprs) || MAN[id]?.exprs || {};
export const hasPose = (id: string, pose: string) => !pose || !!MAN[id]?.poses?.[pose];
export const isFullBody = (id: string) => !!MAN[id]?.full;

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
const GLITCH_EYES: Record<string, [number, number][]> = { eva: [[41.7, 40.6], [68.3, 42.8]] }; // проценты кадра

export function resolveExpr(id: string, expr: string, pose = ''): string {
  if (expr === 'glitch' && GLITCH_EYES[id]) expr = 'shock';
  if (!MAN[id]) return expr;
  const m = exprsOf(id, pose);
  if (m[expr]) return expr;
  for (const a of ALIAS[expr] ?? []) if (m[a]) return a;
  for (const a of ALIAS.neutral) if (m[a]) return a;
  return Object.keys(m)[0];
}
export const hasPortrait = (id: string) => !!MAN[id];
export const portraitExprs = (id: string) => Object.keys(MAN[id]?.exprs ?? {});
export const portraitUrl = (id: string, expr: string, v = '', pose = '') =>
  asset(`assets/portraits/${id}${pose ? '@' + pose : ''}_${resolveExpr(id, expr, pose)}${v ? '_' + v : ''}.webp`);
export const bgUrl = (id: string) => asset(`assets/bg/${id}.webp`);
/** Размытая подсветка текущего фона в боковых полях вытянутых экранов (20:9 и т. п.) */
let ambientUrl: string | null = null;
export function setAmbient(url: string | null) {
  if (url === ambientUrl) return;
  ambientUrl = url;
  const a = document.getElementById('ambient') as HTMLCanvasElement | null;
  if (!a || !document.getElementById('viewport')?.classList.contains('fill')) return;
  a.classList.remove('on');
  if (!url) return;
  // фон уменьшается до 48×27 точек и растягивается: мягкое «размытие» без дорогого фильтра
  const img = new Image();
  img.onload = () => {
    if (ambientUrl !== url) return;
    const c = a.getContext('2d');
    if (!c) return;
    c.drawImage(img, 0, 0, a.width, a.height);
    c.fillStyle = 'rgba(0,0,0,.62)';
    c.fillRect(0, 0, a.width, a.height);
    a.classList.add('on');
  };
  img.src = url;
}
/** Промис, который выполняется, когда картинка загружена и декодирована (или не загрузилась). */
export function whenDecoded(img: HTMLImageElement): Promise<void> {
  const src = img.src;
  const done = () => undefined;
  if (typeof img.decode === 'function') {
    return img.decode().then(done, () => (img.src !== src || img.complete ? undefined : new Promise<void>((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); })));
  }
  if (img.complete) return Promise.resolve();
  return new Promise((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); });
}
export function allAssetUrls(): string[] {
  const urls: string[] = [];
  for (const [id, m] of Object.entries(MAN)) {
    for (const pose of ['', ...Object.keys(m.poses ?? {})]) {
      const pre = `assets/portraits/${id}${pose ? '@' + pose : ''}`;
      for (const [e, f] of Object.entries(exprsOf(id, pose))) {
        urls.push(asset(`${pre}_${e}.webp`));
        if (!pose && BODIES[id]) urls.push(asset(`${pre}_${e}_head.webp`));
        if (f.talk) urls.push(asset(`${pre}_${e}_talk.webp`));
        if (f.blink) urls.push(asset(`${pre}_${e}_blink.webp`));
      }
    }
  }
  for (const [id, b] of Object.entries(BODIES)) for (const pose of ['', ...(b.poses ?? [])]) urls.push(bodyUrl(id, pose));
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
  flapTimer: number; // свой таймер речи у каждого портрета
  pose: string; // '' — основная поза
  bodies?: HTMLImageElement[]; // два слоя тела для смены позы растворением
  bodyPose?: string;
}

export interface StageSnapshot {
  bg: string | null;
  portraits: { id: string; expr: string; side: Side; pose?: string }[];
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
  noise = new Noise(document.getElementById('noise')!);
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
  /** Вызывается, когда игрок увидел фон или эмоцию персонажа (для галереи) */
  onSeen: ((key: string) => void) | null = null;

  readonly lowfx = LOWFX;
  constructor() {
    this.stage.classList.toggle('lowfx', this.lowfx);
    onSettings((s) => this.stage.style.setProperty('--box-a', String(s.boxAlpha)));
    this.fit();
    // браузер может прокрутить контейнер при фокусе на кнопке/ползунке — возвращаем на место
    for (const id of ['viewport', 'stage', 'ui', 'overlay']) {
      const el = document.getElementById(id)!;
      el.addEventListener('scroll', () => { el.scrollLeft = 0; el.scrollTop = 0; });
    }
    const refit = () => requestAnimationFrame(() => this.fit());
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    document.addEventListener('fullscreenchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
  }
  fit() {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const s = Math.min(vw / 1920, vh / 1080);
    this.stage.style.setProperty('--s', String(s));
    // на маленьких экранах интерфейс увеличивается отдельно от сцены
    const mz = Math.max(1, Math.min(1.9, 0.62 / s));
    this.stage.style.setProperty('--mz', String(mz));
    this.stage.classList.toggle('compact', mz > 1.05);
    // поля по бокам/сверху есть, только если пропорции экрана заметно отличаются от 16:9
    const vp = document.getElementById('viewport');
    const fill = Math.abs(vw / vh - 16 / 9) > 0.04;
    if (vp && vp.classList.contains('fill') !== fill) {
      vp.classList.toggle('fill', fill);
      const u = ambientUrl; ambientUrl = null; setAmbient(u);
    }
  }
  get uiZoom() {
    return parseFloat(this.stage.style.getPropertyValue('--mz') || '1') || 1;
  }

  // ----------------------------------------------------------- background
  setBg(id: string | null, fade = 1.0) {
    if (id === this.bgId && this.currentBg) return;
    this.bgId = id;
    // гаснут все прежние фоны, а не только предыдущий: при быстрой смене A→B→C промежуточные не застревают
    const fadeOthers = (keep: HTMLElement | null) => {
      for (const o of [...this.bgLayer.children] as HTMLElement[]) {
        if (o === keep || o.dataset.leaving) continue;
        o.dataset.leaving = '1';
        o.style.setProperty('--dur', `${fade}s`);
        o.classList.remove('on');
        setTimeout(() => o.remove(), fade * 1000 + 80);
      }
    };
    this.hotspotLayer.innerHTML = '';
    if (!id) {
      fadeOthers(null);
      this.currentBg = null;
      setAmbient(null);
      return;
    }
    this.onSeen?.('bg:' + id);
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
    // проявляем фон только после декодирования — иначе картинка «выскакивает» посреди перехода
    whenDecoded(img).then(() => requestAnimationFrame(() => {
      // фон успели сменить ещё раз — этот уже не нужен: убираем, не проявляя
      if (this.currentBg !== bg) { if (!bg.dataset.leaving) bg.remove(); return; }
      fadeOthers(bg);
      bg.classList.add('on');
      setAmbient(img.src);
    }));
  }
  /** Слой фона, внутри которого рисуются интерактивные зоны (движется вместе с фоном) */
  get bgDrift(): HTMLElement | null {
    return this.currentBg?.querySelector('.drift-wrap') ?? null;
  }
  private makeFx(f: BgFx): HTMLElement {
    const d = el('div', `fx fx-${f.type}` + (f.w * f.h > 250000 && f.type !== 'dim' ? ' fx-big' : ''));
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
  private lastSide = new Map<string, Side>();
  /** Сторона для персонажа без явного указания: где стоял раньше → привычная → свободная (не выталкивать соседа) */
  private autoSide(id: string): Side {
    const taken = (s: Side) => [...this.portraits.values()].some((p) => p.side === s && p.id !== id);
    const pref = this.lastSide.get(id) ?? (id === 'eva' ? 'right' : 'left');
    if (!taken(pref)) return pref;
    const other: Side = pref === 'left' ? 'right' : 'left';
    return taken(other) ? pref : other;
  }
  /** Забыть сторону персонажа (после мгновенной вспышки по центру) */
  forgetSide(id: string) { this.lastSide.delete(id); }
  show(id: string, expr = 'neutral', side?: Side) {
    if (!hasPortrait(id)) return;
    const existing = this.portraits.get(id);
    const s: Side = side ?? existing?.side ?? this.autoSide(id);
    this.lastSide.set(id, s);
    // на одной стороне — один портрет
    for (const p of this.portraits.values()) if (p.side === s && p.id !== id) this.hide(p.id);
    let p = this.portraits.get(id);
    if (p) {
      if (p.side !== s) {
        p.root.classList.remove(`side-${p.side}`);
        p.root.classList.add(`side-${s}`);
        p.side = s;
        if (BODIES[id]) this.placeBody(p.root, BODIES[id], s);
      }
      this.setExpr(id, expr);
      return;
    }
    const body = BODIES[id];
    const root = el('div', `pt side-${s}` + (isFullBody(id) ? ' pt-full' : '') + (body ? ' pt-body' : ''));
    root.dataset.id = id;
    const inner = el('div', 'pt-inner');
    // персонаж с телом: тело — нижний слой, голова (все эмоции, рот, глаза) — отдельный слой поверх
    let head: HTMLElement = inner;
    if (body) {
      this.placeBody(root, body, s);
      for (let i = 0; i < 2; i++) {
        const bimg = el('img', 'pt-bodyimg') as HTMLImageElement;
        bimg.alt = '';
        bimg.decoding = 'async';
        if (i === 0) bimg.src = bodyUrl(id, bodyPoseFor(id, resolveExpr(id, expr)));
        else bimg.style.opacity = '0';
        inner.appendChild(bimg);
      }
      head = el('div', 'pt-head');
      const [bl, bt, bw, bh] = body.bust;
      Object.assign(head.style, { left: `${bl}%`, top: `${bt}%`, width: `${bw}%`, height: `${bh}%` });
      inner.appendChild(head);
    }
    const mk = (cls: string) => {
      const i = el('img', cls) as HTMLImageElement;
      i.alt = '';
      i.decoding = 'async';
      head.appendChild(i);
      return i;
    };
    const a = mk('pt-img pt-a'), b = mk('pt-img pt-b'), talk = mk('pt-img pt-talk'), blink = mk('pt-img pt-blink');
    for (const [ex, ey] of GLITCH_EYES[id] ?? []) {
      const g = el('i', 'pt-eye');
      g.style.left = `${ex}%`;
      g.style.top = `${ey}%`;
      head.appendChild(g);
    }
    root.classList.toggle('glitch-eyes', expr === 'glitch');
    root.appendChild(inner);
    this.charLayer.appendChild(root);
    const e = resolveExpr(id, expr);
    this.onSeen?.(`pt:${id}:${e}`);
    a.src = portraitUrl(id, e, body ? 'head' : '');
    b.style.opacity = '0';
    p = { id, expr: e, side: s, root, a, b, talk, blink, front: a, hasTalk: false, hasBlink: false, blinkTimer: 0, flapTimer: 0, pose: '' };
    if (body) { p.bodies = [...inner.querySelectorAll<HTMLImageElement>('.pt-bodyimg')]; p.bodyPose = bodyPoseFor(id, e); }
    this.portraits.set(id, p);
    this.updateVariants(p);
    const shown = p;
    whenDecoded(a).then(() => requestAnimationFrame(() => {
      if (this.portraits.get(id) === shown) root.classList.add('on');
    }));
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
    clearInterval(p.flapTimer);
    if (this.speaking === id) this.speaking = null;
    // уходящий гаснет сразу и полностью: «затемнение» и «фокус» не должны его удерживать
    p.root.classList.remove('on', 'dim', 'speaking', 'focus');
    p.root.classList.add('off');
    setTimeout(() => p.root.remove(), 500);
    this.applySpeaking();
  }
  isShown(id: string) {
    return this.portraits.has(id);
  }
  setExpr(id: string, expr: string) {
    const p = this.portraits.get(id);
    if (!p) return;
    p.root.classList.toggle('glitch-eyes', expr === 'glitch');
    const e = resolveExpr(id, expr, p.pose);
    if (e === p.expr) return;
    this.swapBase(p, e, p.pose);
    this.setBodyPose(p, bodyPoseFor(id, e));
    this.nod(p);
  }
  /** Смена позы тела растворением; голова остаётся на месте (позы совмещены по шее) */
  private setBodyPose(p: Portrait, pose: string) {
    if (!p.bodies || pose === p.bodyPose) return;
    p.bodyPose = pose;
    const [b0, b1] = p.bodies;
    const front = b0.style.opacity === '0' ? b1 : b0;
    const back = front === b0 ? b1 : b0;
    back.src = bodyUrl(p.id, pose);
    whenDecoded(back).then(() => {
      if (p.bodyPose !== pose || this.portraits.get(p.id) !== p) return;
      back.style.opacity = '1';
      front.style.opacity = '0';
    });
  }
  /** Сменить позу (ростовые персонажи). Если такой позы нет в манифесте — ничего не делаем (остаётся бюст). */
  setPose(id: string, pose: string, quiet = false) {
    const p = this.portraits.get(id);
    if (!p || pose === p.pose) return;
    if (!hasPose(id, pose)) return;
    this.swapBase(p, resolveExpr(id, p.expr, pose), pose);
    // жест-акцент: короткое «движение» всей фигуры (только transform — без перерисовки)
    if (!quiet && !this.lowfx) p.root.animate?.([{ scale: '1' }, { scale: '1.015' }, { scale: '1' }], { duration: 250, easing: 'ease-out' });
  }
  /** Размер и место персонажа с телом: свой рост, ступни на общей «земле», центр — в слоте стороны */
  private placeBody(root: HTMLElement, b: BodyDef, side: Side) {
    const k = BODY_SCALE * b.hf;
    const w = b.w * k, h = b.h * k;
    Object.assign(root.style, { width: `${w}px`, height: `${h}px`, top: `${BODY_GROUND - h}px`, left: `${SLOT_X[side] - w / 2}px`, right: 'auto', bottom: 'auto' });
  }
  /** Жест при смене эмоции (только сдвиги и наклоны слоя — считает видеокарта, картинка не перерисовывается):
   * гнев — подаётся к собеседнику, испуг — отшатывается, грусть — никнет, смех — подпрыгивает, иначе — кивок */
  private nod(p: Portrait) {
    const el2 = (p.root.querySelector('.pt-inner') as HTMLElement) ?? p.root;
    const dir = p.side === 'left' ? 1 : p.side === 'right' ? -1 : 0;
    const e = p.expr;
    let frames: Keyframe[];
    let duration = 420;
    if (/angry|cold|determined|cornered|suspicious/.test(e)) {
      frames = [{ transform: 'none' }, { transform: `translateX(${dir * 10}px) rotate(${dir * 1.2}deg)` }, { transform: 'none' }]; duration = 650;
    } else if (/shock|surprised|fear|scared/.test(e)) {
      frames = [{ transform: 'none' }, { transform: `translate(${-dir * 12}px, -10px)` }, { transform: 'none' }]; duration = 520;
    } else if (/sad|cry|hurt|plead/.test(e)) {
      frames = [{ transform: 'none' }, { transform: `translateY(8px) rotate(${-dir * 0.6}deg)` }, { transform: 'none' }]; duration = 900;
    } else if (/laugh/.test(e)) {
      frames = [{ transform: 'none' }, { transform: 'translateY(-8px)' }, { transform: 'none' }, { transform: 'translateY(-5px)' }, { transform: 'none' }]; duration = 620;
    } else {
      frames = [{ transform: 'none' }, { transform: 'translateY(5px)' }, { transform: 'none' }]; duration = 300;
    }
    if (!BODIES[p.id]) { p.root.animate?.([{ translate: '0 0' }, { translate: '0 5px' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' }); return; }
    el2.animate?.(frames, { duration, easing: 'cubic-bezier(.3,.6,.3,1)', composite: 'add' });
  }
  /** Перекрёстное растворение основы (эмоция/поза) после декодирования новой картинки;
   * устаревшая смена пропускается; накладки рта/глаз меняются вместе с лицом, а не раньше */
  private swapBase(p: Portrait, e: string, pose: string) {
    const id = p.id;
    p.expr = e;
    p.pose = pose;
    if (!pose) this.onSeen?.(`pt:${id}:${e}`);
    const back = p.front === p.a ? p.b : p.a;
    back.src = portraitUrl(id, e, hasBody(id) ? 'head' : '', pose);
    p.hasTalk = p.hasBlink = false;
    p.talk.style.opacity = '0';
    p.blink.style.opacity = '0';
    whenDecoded(back).then(() => {
      if (p.expr !== e || p.pose !== pose || this.portraits.get(id) !== p) return;
      back.style.opacity = '1';
      if (p.front !== back) {
        p.front.style.opacity = '0';
        p.front = back;
      }
      setTimeout(() => { if (p.expr === e && p.pose === pose && this.portraits.get(id) === p) this.updateVariants(p); }, 200);
    });
  }
  private updateVariants(p: Portrait) {
    const f = exprsOf(p.id, p.pose)[p.expr] ?? {};
    p.hasTalk = !!f.talk;
    p.hasBlink = !!f.blink;
    p.talk.style.opacity = '0';
    p.blink.style.opacity = '0';
    const place = (img: HTMLImageElement, b: Box) => {
      img.style.left = `${b[0]}%`;
      img.style.top = `${b[1]}%`;
      img.style.width = `${b[2]}%`;
      img.style.height = `${b[3]}%`;
    };
    if (f.talk) { p.talk.src = portraitUrl(p.id, p.expr, 'talk', p.pose); place(p.talk, f.talk); }
    if (f.blink) { p.blink.src = portraitUrl(p.id, p.expr, 'blink', p.pose); place(p.blink, f.blink); }
  }
  private scheduleBlink(p: Portrait) {
    clearTimeout(p.blinkTimer);
    p.blinkTimer = window.setTimeout(() => {
      if (!this.portraits.has(p.id)) return;
      if (p.hasBlink) {
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
    for (const q of this.portraits.values()) { clearInterval(q.flapTimer); q.talk.style.opacity = '0'; q.root.classList.remove('talking'); }
    if (on && p) p.root.classList.add('talking');
    if (!on || !p || !p.hasTalk) return;
    // рот не «щёлкает» открыт/закрыт, а ходит между тремя положениями с разной амплитудой
    const LEVELS = [0, 0.55, 1, 0.55, 0, 0.8, 0.35, 1, 0.6, 0];
    let i = 0;
    p.flapTimer = window.setInterval(() => {
      if (!this.portraits.has(p.id)) { clearInterval(p.flapTimer); return; }
      i = (i + 1 + (Math.random() < 0.25 ? 1 : 0)) % LEVELS.length;
      p.talk.style.opacity = String(LEVELS[i]);
    }, 70 + Math.random() * 30);
  }

  // ----------------------------------------------------------- camera / fx
  shake(strength = 1) {
    haptic(Math.round(40 + 50 * strength));
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
    document.getElementById('ambient')?.classList.toggle('mem', on);
    this.noise.boost = on ? 0.06 : 0;
    this.noise.apply();
  }
  setTint(t: string | null) {
    this.tint = t;
    this.world.dataset.tint = t ?? '';
  }
  /** Спрятать интерфейс, чтобы рассмотреть сцену */
  setUiHidden(on: boolean) {
    this.stage.classList.toggle('ui-hidden', on);
  }
  get uiHidden() {
    return this.stage.classList.contains('ui-hidden');
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
    document.getElementById('ambient')?.classList.toggle('dark', to === 'black');
    await sleep(sec * 1000, token);
  }
  snapshot(): StageSnapshot {
    return {
      bg: this.bgId,
      portraits: [...this.portraits.values()].map((p) => ({ id: p.id, expr: p.expr, side: p.side, ...(p.pose ? { pose: p.pose } : {}) })),
      memory: this.memory,
      bars: this.bars.classList.contains('on'),
      rain: this.weather.mode,
      tint: this.tint,
    };
  }
  restore(s: StageSnapshot) {
    // оставляем тех, кто уже на сцене на своём месте — без мигания при «Назад» и загрузке
    const want = new Map(s.portraits.map((p) => [p.id, p]));
    for (const [id, p] of [...this.portraits]) if (want.get(id)?.side !== p.side) this.hide(id);
    this.setBg(s.bg, 0.4);
    for (const p of s.portraits) { this.show(p.id, p.expr, p.side); this.setPose(p.id, p.pose ?? '', true); }
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
