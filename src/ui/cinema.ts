// Проигрыватель кат-сцен: кадры с движением камеры, дождь, вспышки, озвученный текст и титры.
// Пропуск: кнопка «Пропустить», Enter или Esc. Касание экрана только показывает кнопку, чтобы не пропустить случайно.
import { el, sleep, Token } from '../engine/util';
import { audio } from '../engine/audio';
import { settings } from '../engine/settings';
import { Weather } from '../engine/fx';
import { bgUrl, setAmbient, getAmbient } from '../engine/stage';
import { voKey, hasVo, voDuration } from '../engine/voice';
import type { Shot } from '../data/cinema';

const reduceMotion = () => !settings.glitch;

/** сколько звучит фраза; без озвучки — время чтения */
function phraseMs(role: string, text: string): number {
  const k = voKey(role, text);
  if (settings.vo > 0 && hasVo(k)) return voDuration(k);
  return 900 + text.length * 55;
}

function preload(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  const decoded = img.decode ? img.decode().catch(() => undefined) : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
  return Promise.race([decoded, sleep(1500)]) as Promise<void>;
}

export interface CinemaOptions {
  /** вызывать при каждом кадре (для записи трейлера) */
  onShot?: (i: number) => void;
}

export async function playCinema(shots: Shot[], token: Token, opts: CinemaOptions = {}): Promise<'done' | 'skipped'> {
  const root = el('div', 'cine');
  root.innerHTML = `<div class="cine-layers"></div><canvas class="cine-rain"></canvas><div class="cine-vig"></div>
    <div class="cine-bar t"></div><div class="cine-bar b"></div><div class="cine-flash"></div>
    <div class="cine-card"><div class="k"></div><div class="c"></div></div><div class="cine-sub"></div>
    <button class="cine-skip" type="button">ПРОПУСТИТЬ ▸▸</button>`;
  const layers = root.querySelector('.cine-layers') as HTMLElement;
  const sub = root.querySelector('.cine-sub') as HTMLElement;
  const card = root.querySelector('.cine-card') as HTMLElement;
  const flash = root.querySelector('.cine-flash') as HTMLElement;
  const skipBtn = root.querySelector('.cine-skip') as HTMLButtonElement;
  const weather = new Weather(root.querySelector('.cine-rain') as HTMLCanvasElement);
  document.getElementById('overlay')!.appendChild(root);
  requestAnimationFrame(() => root.classList.add('on'));

  let skipped = false;
  let wakeSkip: () => void = () => undefined;
  const skipP = new Promise<void>((r) => (wakeSkip = r));
  const doSkip = () => { if (skipped) return; skipped = true; audio.stopVo(); wakeSkip(); };
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); doSkip(); });
  let hideT = 0;
  const showSkip = () => { root.classList.add('show-skip'); clearTimeout(hideT); hideT = window.setTimeout(() => root.classList.remove('show-skip'), 3200); };
  root.addEventListener('pointerdown', showSkip);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doSkip(); }
  };
  window.addEventListener('keydown', onKey, true);
  token.onCancel(doSkip);
  const gone = () => skipped || token.cancelled;
  const wait = (ms: number) => (ms > 0 ? Promise.race([sleep(ms), skipP]) : Promise.resolve());

  let prev: HTMLElement | null = null;
  const ambientBefore = getAmbient();
  try {
    for (let i = 0; i < shots.length && !gone(); i++) {
      const s = shots[i];
      opts.onShot?.(i);
      const fade = s.fade ?? 1200;
      const voMs = (s.vo ?? []).reduce((a, v) => a + phraseMs(v.role, v.text) + 250, 0);
      const total = Math.max(s.dur ?? 0, fade * 0.6 + voMs + (s.tail ?? 600));
      // кадр: фон с движением камеры на всё время кадра и следующего перехода
      const layer = el('div', 'cine-shot');
      if (s.bg !== 'black') {
        const src = bgUrl(s.bg);
        await preload(src);
        const img = el('img') as HTMLImageElement;
        img.src = src;
        img.alt = '';
        layer.appendChild(img);
        const [x0, y0, k0, x1, y1, k1] = s.cam ?? [0, 0, 1.06, 0, 0, 1.1];
        const calm = reduceMotion();
        img.animate([
          { transform: `translate(${calm ? 0 : x0}%, ${calm ? 0 : y0}%) scale(${calm ? 1.06 : k0})` },
          { transform: `translate(${calm ? 0 : x1}%, ${calm ? 0 : y1}%) scale(${calm ? 1.08 : k1})` },
        ], { duration: total + 1600, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
        if (s.fx === 'flicker') layer.classList.add('flicker');
      }
      // поля по бокам вытянутого экрана подхватывают текущий кадр
      setAmbient(s.bg === 'black' ? null : bgUrl(s.bg));
      layer.style.transitionDuration = fade + 'ms';
      layers.appendChild(layer);
      requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('on')));
      if (prev) { const p = prev; setTimeout(() => p.remove(), fade + 200); p.classList.remove('on'); }
      prev = layer;
      // звук и погода
      if (s.music) audio.music(s.music[0], s.music[1], 2);
      if (s.rain) {
        weather.set(s.rain);
        audio.ambience(s.rain === 'off' ? 'off' : s.rain === 'memory' ? 'memory' : 'rain_out', 2);
      }
      for (const fx of s.sfx ?? []) audio.sfx(fx);
      if (s.fx === 'glitch' && settings.glitch) {
        root.classList.add('glitch');
        setTimeout(() => root.classList.remove('glitch'), 320);
      }
      if ((s.fx === 'flash' || s.fx === 'lightning') && settings.glitch) {
        flash.classList.remove('go');
        void flash.offsetWidth;
        flash.classList.add('go');
        if (s.fx === 'lightning') weather.flashLightning();
      }
      // надписи
      card.classList.toggle('on', !!(s.card || s.kicker));
      card.classList.toggle('logo', s.card === 'AFTERIMAGE');
      (card.querySelector('.k') as HTMLElement).textContent = s.kicker ?? '';
      (card.querySelector('.c') as HTMLElement).textContent = s.card ?? '';
      const t0 = performance.now();
      await wait(Math.min(fade * 0.6, 900));
      if (s.sub && !gone()) { sub.innerHTML = s.sub; sub.classList.add('on'); }
      for (const v of s.vo ?? []) {
        if (gone()) break;
        // фраза, которая уже написана крупно на экране, субтитром не дублируется
        const same = !!s.card && v.text.replace(/[.!?…]+$/, '').toLowerCase() === s.card.toLowerCase();
        sub.textContent = same ? '' : v.text;
        sub.classList.toggle('on', !same);
        const k = voKey(v.role, v.text);
        if (settings.vo > 0 && hasVo(k)) await Promise.race([audio.playVo(k), skipP]);
        else await wait(phraseMs(v.role, v.text));
        await wait(250);
      }
      await wait(total - (performance.now() - t0));
      if (!s.sub || i + 1 >= shots.length || shots[i + 1].sub !== s.sub) sub.classList.remove('on');
    }
    if (!gone()) await wait(400);
  } finally {
    window.removeEventListener('keydown', onKey, true);
    clearTimeout(hideT);
    audio.stopVo();
    weather.set('off');
    setAmbient(ambientBefore);
    root.classList.remove('on');
    await sleep(skipped ? 250 : 700);
    root.remove();
  }
  return skipped ? 'skipped' : 'done';
}
