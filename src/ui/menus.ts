// Титульный экран, пауза, вступительная заставка, карточки глав и концовок.
import { el, escapeHtml, sleep, Token } from '../engine/util';
import { audio } from '../engine/audio';
import { Meta, Saves } from '../engine/meta';
import { ENDINGS } from '../data/endings';
import { bgUrl, setAmbient } from '../engine/stage';
import { api } from './api';
import { openSaves, openSettings, openChronicle, openEndings, openJournal, openChapters, openGallery, hasChapterSaves, confirm, panelOpen } from './panels';
import { toggleFullscreen, fullscreenSupported } from './fullscreen';

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
  try {
    await sleep(3600, token);
    c.classList.remove('on');
    await sleep(1000, token);
  } finally {
    c.remove();
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

/** Вступительная заставка */
export async function intro(token: Token) {
  const root = el('div', 'intro');
  const skip = el('button', 'skip', 'ПРОПУСТИТЬ  ⏎');
  root.appendChild(skip);
  document.getElementById('overlay')!.appendChild(root);
  let skipped = false;
  const doSkip = () => { skipped = true; };
  skip.addEventListener('click', doSkip);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doSkip(); } };
  window.addEventListener('keydown', onKey, true);
  audio.music('title', 0.3, 2);
  audio.ambience('rain_out', 3);
  const scenes: [string, string, number][] = [
    ['key_art', 'Порт-Ирис. Город, в котором никогда не прекращается дождь.', 5200],
    ['courtyard', 'Каждый житель старше шестнадцати носит за ухом <b>«Свидетеля»</b>. Имплант помнит последние шесть часов — всё, что ты видел, слышал, чувствовал.', 6800],
    ['hall', 'После смерти запись замирает. Её называют <b>послеобразом</b>. Чтецы Отдела посмертных показаний проживают последние минуты мёртвых — и называют убийцу.', 7400],
    ['mnema', 'Шесть лет город верит в одно правило. Шесть лет оно не ошибалось.', 5600],
  ];
  const wait = async (ms: number) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms && !skipped && !token.cancelled) await sleep(80);
  };
  try {
    for (const [bg, text, ms] of scenes) {
      if (skipped || token.cancelled) break;
      const s = el('div', 'scene');
      s.innerHTML = `<div class="bg on" style="inset:0"><div class="drift-wrap"><img class="base" src="${bgUrl(bg)}" alt=""></div></div><div class="txt">${text}</div>`;
      root.appendChild(s);
      await sleep(50);
      s.classList.add('on');
      await wait(ms);
      s.classList.remove('on');
      setTimeout(() => s.remove(), 1700);
    }
    if (!skipped && !token.cancelled) {
      await wait(1200);
      const big = el('div', 'scene');
      big.innerHTML = `<div class="big">МЁРТВЫЕ НЕ ЛГУТ</div>`;
      root.appendChild(big);
      await sleep(50);
      big.classList.add('on');
      audio.sfx('stinger');
      await wait(3200);
      audio.sfx('glitch');
      document.getElementById('stage')!.classList.add('rgb-split');
      await wait(260);
      document.getElementById('stage')!.classList.remove('rgb-split');
      big.classList.remove('on');
      await wait(1500);
    }
  } finally {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
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
