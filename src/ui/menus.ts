// Титульный экран, пауза, вступительная заставка, карточки глав и концовок.
import { el, escapeHtml, sleep, Token } from '../engine/util';
import { audio } from '../engine/audio';
import { Meta, Saves } from '../engine/meta';
import { ENDINGS } from '../data/endings';
import { bgUrl, setAmbient } from '../engine/stage';
import { api } from './api';
import { openSaves, openSettings, openChronicle, openEndings, openJournal, openChapters, openGallery, hasChapterSaves, confirm, panelOpen } from './panels';
import { toggleFullscreen, fullscreenSupported } from './fullscreen';
import { playCinema } from './cinema';
import { INTRO, TRAILER, chapterVo } from '../data/cinema';
import { voKey, hasVo, voDuration } from '../engine/voice';
import { settings } from '../engine/settings';

const ui = () => document.getElementById('ui')!;

export function showTitle(onNew: () => void, onContinue: (slot: string) => void) {
  const root = el('div', 'title-screen');
  const latest = Saves.latest();
  root.innerHTML = `<div class="bgimg" style="background-image:url('${bgUrl('key_art')}')"></div><div class="shade"></div>
    <div class="logo"><h1>AFTERIMAGE<span class="r">AFTERIMAGE</span><span class="c">AFTERIMAGE</span></h1><div class="en">ИНТЕРАКТИВНЫЙ ДЕТЕКТИВ</div>
    <div class="tag">Порт-Ирис. Каждый житель носит «Свидетеля». Мёртвые не лгут.<br>Этой ночью последний взгляд жертвы покажет ваше лицо.</div></div>
    <nav></nav>
    <div class="warn">Игра содержит мигающий свет и глитч-эффекты — их можно ослабить в настройках.<br>Лучше всего — в наушниках.</div>
    <div class="foot"><span>~25 МИНУТ · 6 КОНЦОВОК</span><span>ОТКРЫТО КОНЦОВОК: ${Meta.data.endings.length}/${ENDINGS.length}</span></div>`;
  const nav = root.querySelector('nav')!;
  const item = (label: string, sub: string, fn: () => void, disabled = false) => {
    const b = el('button', 'menu-btn', `${escapeHtml(label)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`);
    if (disabled) b.setAttribute('disabled', '');
    b.addEventListener('click', () => { audio.sfx('confirm'); fn(); });
    b.addEventListener('mouseenter', () => audio.sfx('hover', 0.5));
    nav.appendChild(b);
  };
  if (latest) {
    const d = Saves.read(latest)!;
    item('Продолжить', `${d.chapterTitle} · ${d.clock}`, () => { root.remove(); onContinue(latest); });
  }
  item('Новая игра', '', async () => {
    if (latest && !(await confirm('Начать новое расследование? Сохранения останутся в слотах.', 'НАЧАТЬ', 'ОТМЕНА'))) return;
    root.remove();
    onNew();
  });
  item('Загрузить', '', () => openSaves('load'), !latest);
  item('Главы', '', () => openChapters((slot) => { root.remove(); onContinue(slot); }), !hasChapterSaves());
  item('Хроника решений', '', () => openChronicle());
  item('Концовки', `${Meta.data.endings.length}/${ENDINGS.length}`, () => openEndings());
  item('Галерея', '', () => openGallery());
  item('Трейлер', '', () => { void playTrailer(); });
  item('Настройки', '', () => openSettings());
  if (fullscreenSupported() && !/AfterimageApp/.test(navigator.userAgent)) item('Полный экран', '', async () => { const err = await toggleFullscreen(); if (err) api.g.toast('bad', 'Полный экран', err); });
  document.getElementById('stage')!.appendChild(root);
  setAmbient(bgUrl('key_art'));
  audio.music('title', 0.5, 2);
  audio.ambience('rain_in', 2);
  return root;
}

export function closeTitle() {
  document.querySelector('.title-screen')?.remove();
}

let pauseEl: HTMLElement | null = null;
export const pauseOpen = () => !!pauseEl;
export function togglePause() {
  if (pauseEl) { pauseEl.remove(); pauseEl = null; audio.sfx('back'); return; }
  if (panelOpen()) return;
  const g = api.g;
  const p = el('div', 'pause');
  p.innerHTML = `<div class="left"><h2>ПАУЗА</h2></div><div class="right"></div>`;
  const left = p.querySelector('.left')!;
  const item = (label: string, fn: () => void, dis = false) => {
    const b = el('button', 'menu-btn', escapeHtml(label));
    if (dis) b.setAttribute('disabled', '');
    b.addEventListener('click', () => { audio.sfx('click'); fn(); });
    left.appendChild(b);
  };
  const close = () => { p.remove(); pauseEl = null; };
  item('Продолжить', () => { close(); g.resume(); });
  item('Сохранить', () => openSaves('save'), !g.canSave());
  item('Загрузить', () => openSaves('load'));
  item('Быстрое сохранение', () => { close(); g.quickSave(); g.resume(); }, !g.canSave());
  item('Быстрая загрузка', async () => {
    if (await confirm('Загрузить быстрое сохранение? Несохранённый прогресс будет потерян.', 'ЗАГРУЗИТЬ', 'ОТМЕНА')) { close(); g.quickLoad(); }
  }, !Saves.read('quick'));
  item('Журнал', () => openJournal());
  item('Хроника', () => openChronicle((g.vars().__runChron as never) ?? undefined));
  item('Настройки', () => openSettings());
  item('В главное меню', async () => {
    if (await confirm('Выйти в главное меню? Несохранённый прогресс с последнего автосохранения будет потерян.', 'ВЫЙТИ', 'ОТМЕНА')) { close(); g.toTitle(); }
  });
  p.querySelector('.right')!.addEventListener('click', () => { close(); g.resume(); });
  document.getElementById('overlay')!.appendChild(p);
  pauseEl = p;
}
export function closePause() { pauseEl?.remove(); pauseEl = null; }

export async function chapterCard(text: string, token: Token) {
  const [num, title, sub] = text.split(' / ').map((s) => s.trim());
  const n = parseInt(num, 10);
  const c = el('div', 'chapter-card');
  c.innerHTML = `<div class="wrap"><div class="num">${n === 0 ? 'ПРОЛОГ' : 'ГЛАВА ' + ['', 'I', 'II', 'III', 'IV'][n]}</div><div class="ttl" data-t="${escapeHtml(title)}">${escapeHtml(title)}</div><div class="line"></div><div class="sub">${escapeHtml(sub ?? '')}</div></div>`;
  ui().appendChild(c);
  requestAnimationFrame(() => c.classList.add('on'));
  audio.sfx('chapter');
  // диктор читает номер и название главы; заставка держится, пока он не договорит
  const vo = voKey('narrator', chapterVo(n, title ?? ''));
  const voiced = settings.vo > 0 && hasVo(vo);
  if (voiced) setTimeout(() => { if (!token.cancelled && c.isConnected) void audio.playVo(vo); }, 350);
  // касание или любая клавиша — пропустить заставку главы
  let skip: () => void = () => undefined;
  const skipped = new Promise<void>((r) => (skip = r));
  const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') skip(); };
  const view = document.getElementById('viewport')!;
  setTimeout(() => { view.addEventListener('pointerdown', skip); window.addEventListener('keydown', onKey); }, 350);
  try {
    await Promise.race([sleep(voiced ? Math.max(3600, voDuration(vo) + 650) : 3600, token), skipped]);
    c.classList.remove('on');
    await Promise.race([sleep(1000, token), skipped.then(() => sleep(250, token))]);
  } finally {
    view.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', onKey);
    c.remove();
    if (voiced) audio.stopVo(0.3);
  }
}

export function endingCard(id: string, stats: string): Promise<void> {
  const e = ENDINGS.find((x) => x.id === id)!;
  return new Promise((resolve) => {
    const c = el('div', 'ending-card');
    c.innerHTML = `<div class="wrap"><div class="k">КОНЦОВКА ${String(e.n).padStart(2, '0')} / ${ENDINGS.length}${e.hidden ? ' · СКРЫТАЯ' : ''}</div><h2>${escapeHtml(e.title)}</h2><p>${escapeHtml(e.text)}</p>
      <div class="stats">${escapeHtml(stats)}</div><div class="cont"><button class="btn-line" data-a="chron">ХРОНИКА РЕШЕНИЙ</button>&nbsp;&nbsp;<button class="btn-line" data-a="menu">В ГЛАВНОЕ МЕНЮ</button></div></div>`;
    document.getElementById('overlay')!.appendChild(c);
    requestAnimationFrame(() => c.classList.add('on'));
    audio.sfx('boom');
    c.addEventListener('click', async (ev) => {
      const a = (ev.target as HTMLElement).closest('button')?.dataset.a;
      if (a === 'chron') openChronicle((api.g.vars().__runChron as never) ?? undefined);
      if (a === 'menu') { c.remove(); resolve(); }
    });
  });
}

/** Вступительная кат-сцена (перед прологом), озвученная */
export async function intro(token: Token) {
  await playCinema(INTRO, token);
}

/** Трейлер с титульного экрана; по окончании титульный экран снова звучит как обычно */
export async function playTrailer() {
  const title = document.querySelector('.title-screen') as HTMLElement | null;
  const token = new Token();
  title?.classList.add('behind');
  try {
    await playCinema(TRAILER, token);
  } finally {
    title?.classList.remove('behind');
    audio.music('title', 0.5, 2);
    audio.ambience('rain_in', 2);
  }
}

export function boot(): Promise<void> {
  return new Promise((resolve) => {
    const b = el('div', 'boot');
    b.innerHTML = `<div class="wrap"><h1>AFTERIMAGE</h1><p>Кинематографическая детективная новелла.<br>Наденьте наушники. Решения необратимы.</p><div class="press">НАЖМИТЕ, ЧТОБЫ НАЧАТЬ</div><p class="load" style="margin-top:30px;font-size:14px"></p></div>`;
    document.getElementById('stage')!.appendChild(b);
    const go = () => {
      window.removeEventListener('keydown', go);
      audio.init();
      b.remove();
      resolve();
    };
    b.addEventListener('click', go);
    window.addEventListener('keydown', go);
  });
}
