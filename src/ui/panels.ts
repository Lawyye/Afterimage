// Панели: журнал расследования, лог реплик, хроника, концовки, настройки, сохранения.
import { el, escapeHtml } from '../engine/util';
import { audio } from '../engine/audio';
import { settings, saveSettings, resetSettings } from '../engine/settings';
import { EVIDENCE, EV_BY_ID } from '../data/evidence';
import { CHARACTERS } from '../data/characters';
import { CHRONICLE } from '../data/chronicle';
import { ENDINGS } from '../data/endings';
import { DEDUCTIONS } from '../data/board';
import { Meta, Saves, SLOTS, CHAPTER_SLOTS } from '../engine/meta';
import { GALLERY_BG, GALLERY_CHARS } from '../data/gallery';
import { GLOSSARY } from '../data/glossary';
import { icon } from './icons';
import { api, overlayRoot } from './api';
import { openDoc } from './docs';
import { portraitUrl, bgUrl, portraitExprs, isFullBody } from '../engine/stage';
import { plainText } from '../engine/dialogue';
import { lineVo } from '../engine/voice';
import { toggleFullscreen, isFullscreen, fullscreenSupported } from './fullscreen';

let current: { close: () => void } | null = null;
export const panelOpen = () => !!current;
export function closePanel() { current?.close(); }

function panel(title: string, tabs: [string, string][], onTab: (t: string, body: HTMLElement) => void, initial?: string): Promise<void> {
  current?.close();
  return new Promise((resolve) => {
    const root = overlayRoot();
    const bg = el('div', 'panel-bg');
    const p = el('div', 'panel');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', title);
    const prevFocus = document.activeElement as HTMLElement | null;
    const header = el('header');
    header.innerHTML = `<h2>${escapeHtml(title)}</h2>`;
    const tabsEl = el('div', 'tabs');
    const body = el('div', 'body');
    for (const [id, label] of tabs) {
      const b = el('button', '', escapeHtml(label));
      b.dataset.t = id;
      b.addEventListener('click', () => select(id));
      tabsEl.appendChild(b);
    }
    if (tabs.length > 1) header.appendChild(tabsEl);
    const closeBtn = el('button', 'close', 'ЗАКРЫТЬ <kbd>ESC</kbd>');
    header.appendChild(closeBtn);
    p.append(header, body);
    root.append(bg, p);
    const select = (id: string) => {
      tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
      body.innerHTML = '';
      body.scrollTop = 0;
      onTab(id, body);
      audio.sfx('click', 0.6);
    };
    select(initial ?? tabs[0][0]);
    const close = () => {
      if (current !== handle) return;
      current = null;
      window.removeEventListener('keydown', onKey, true);
      bg.remove(); p.remove();
      prevFocus?.focus?.({ preventScroll: true });
      audio.sfx('back');
      resolve();
    };
    const handle = { close };
    current = handle;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      // Tab не уходит из окна: фокус ходит по его кнопкам по кругу
      if (e.key === 'Tab') {
        const f = [...p.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
        e.preventDefault();
        f[n].focus({ preventScroll: true });
      }
    };
    setTimeout(() => (p.querySelector<HTMLElement>('.tabs button.on') ?? closeBtn).focus({ preventScroll: true }), 30);
    window.addEventListener('keydown', onKey, true);
    closeBtn.addEventListener('click', close);
    bg.addEventListener('click', close);
  });
}

// ------------------------------------------------------------ journal
type Vars = Record<string, unknown>;
// seen — когда игрок впервые встречает персонажа; до этого в досье только «?»
const PEOPLE: { id: string; bio: string; seen: (v: Vars) => boolean; rel?: (v: Vars) => string }[] = [
  { id: 'eva', seen: () => true, bio: 'Инспектор-чтец Отдела посмертных показаний. Читает последние часы мёртвых. Не спит четвёртую ночь.' },
  { id: 'voron', seen: (v) => (v.chapter as number) >= 1, bio: 'Капитан ОПП, руководитель смены. Наставник. Двадцать лет рядом. Был рядом и после смерти Сони.' },
  { id: 'mira', seen: (v) => !!(v.ev_voron_words || v.ev_afterimage) || (v.chapter as number) >= 2, bio: 'Ведущий инженер «Мнемы», отдел целостности записей. Найдена мёртвой во дворе башни «Лазурь».' },
  { id: 'sonya', seen: (v) => !!(v.ev_photo || v.ev_afterimage) || (v.chapter as number) >= 2, bio: 'Младшая сестра. Журналистка. Погибла три года назад на лестнице своего дома.' },
  { id: 'leo', seen: (v) => !!v.leo_met, bio: 'Бывший ассистент Миры в «Мнеме». Уволен. Прячется в Канале 9.',
    rel: (v) => (v.leo_taken ? 'Схвачен' : v.leo_fled ? 'Сбежал' : (v.trust_leo as number) >= 2 ? 'Доверяет' : (v.trust_leo as number) >= 1 ? 'Насторожен' : 'Не доверяет') },
  { id: 'kessler', seen: (v) => !!v.kessler_met, bio: 'Директор по целостности «Мнемы». Один глаз — серый, второй — золотое кольцо.', rel: (v) => (v.c2_kessler === 1 ? 'Сделка' : v.c2_kessler === 2 ? 'Уважает' : 'Наблюдает') },
  { id: 'hass', seen: (v) => !!v.hass_met, bio: '«Чистый». Осуждён по послеобразу Сони. Метёт ступени в Канале 9. Ему снится лестница.' },
];
const orpheusSeen = (v: Vars) => (v.c0_orpheus as number) > 0 || (v.chapter as number) >= 1;
const unknownCard = () => {
  const row = el('div', 'person unknown');
  row.innerHTML = `<div class="ph"><span>?</span></div><div><h4>НЕИЗВЕСТНО</h4><div class="role">ДАННЫХ НЕТ</div><p>Вы ещё не встречали этого человека.</p></div>`;
  return row;
};

export function openJournal(tab?: string) {
  const g = api.g;
  return panel('Журнал', [['ev', 'Улики'], ['ded', 'Выводы'], ['people', 'Люди'], ['terms', 'Термины']], (t, body) => {
    const v = g.vars();
    if (t === 'ev') {
      const found = g.found();
      if (!found.length) { body.appendChild(el('div', 'empty', 'Улик пока нет.')); return; }
      const grid = el('div', 'ev-grid');
      for (const id of found) {
        const e = EV_BY_ID[id];
        if (!e) continue;
        const c = el('button', 'ev-card' + (g.unread.has(id) ? ' unread' : ''));
        c.innerHTML = `<div class="ico">${icon(e.icon, '#cfc8b6')}</div><div><h4>${escapeHtml(e.title)}</h4><p>${escapeHtml(e.short)}</p></div><span class="tag">${e.kind.toUpperCase()}</span>`;
        c.addEventListener('click', () => detail(id, body));
        grid.appendChild(c);
      }
      body.appendChild(grid);
    } else if (t === 'ded') {
      const list = el('div', 'settings');
      for (const d of DEDUCTIONS) {
        const ok = !!v['ded_' + d.id];
        const row = el('div', 'person');
        row.innerHTML = `<div><h4>${ok ? '✓ ' : ''}${escapeHtml(d.question)}</h4><p>${escapeHtml(ok ? d.answer : 'Не решено. Откройте доску расследования (B), чтобы связать улики.')}</p></div>`;
        list.appendChild(row);
      }
      body.appendChild(list);
    } else if (t === 'terms') {
      const list = el('div', 'settings');
      let hidden = 0;
      for (const g of GLOSSARY) {
        if (!g.seen(v)) { hidden++; continue; }
        const row = el('div', 'person');
        row.innerHTML = `<div><h4>${escapeHtml(g.term)}</h4><p>${escapeHtml(g.text)}</p></div>`;
        list.appendChild(row);
      }
      body.appendChild(list);
      if (hidden) body.appendChild(el('div', 'pct', `Ещё терминов: ${hidden}. Они откроются по ходу расследования.`));
    } else {
      const grid = el('div', 'people');
      for (const p of PEOPLE) {
        if (!p.seen(v)) { grid.appendChild(unknownCard()); continue; }
        const ch = CHARACTERS[p.id];
        const row = el('div', 'person');
        const anon = v[p.id + '_named'] === false;
        row.innerHTML = `<div class="ph"><img src="${portraitUrl(p.id, 'neutral')}" alt=""${isFullBody(p.id) ? ' class="full"' : ''}></div><div><h4>${escapeHtml(anon ? '???' : ch.name)}</h4><div class="role">${escapeHtml(anon ? 'Не представился' : ch.role)}</div><p>${escapeHtml(anon ? 'Вы видели этого человека, но не знаете, кто он.' : p.bio)}</p>${p.rel ? `<div class="rel">ОТНОШЕНИЕ: <span>${escapeHtml(p.rel(v))}</span></div>` : ''}</div>`;
        grid.appendChild(row);
      }
      if (!orpheusSeen(v)) { grid.appendChild(unknownCard()); body.appendChild(grid); return; }
      const orph = el('div', 'person');
      const to = v.trust_orpheus as number;
      orph.innerHTML = `<div class="ph" style="display:grid;place-items:center;color:#9fe8b0">${icon('eye', '#9fe8b0')}</div><div><h4>ОРФЕЙ</h4><div class="role">Аналитическая система ОПП</div><p>Ведёт чтецов по послеобразам. Подчиняется протоколу. Иногда задаёт вопросы не по протоколу.</p><div class="rel">ОТНОШЕНИЕ: <span>${v.orpheus_cut ? 'Отключён' : v.orpheus_ally ? 'Союзник' : to >= 2 ? 'Доверяет' : to >= 0 ? 'Нейтрален' : 'Холоден'}</span></div></div>`;
      grid.appendChild(orph);
      body.appendChild(grid);
    }
  }, tab);
}

function detail(id: string, body: HTMLElement) {
  const e = EV_BY_ID[id];
  api.g.unread.delete(id);
  body.innerHTML = '';
  const d = el('div', 'ev-detail');
  d.innerHTML = `<div class="big">${icon(e.icon, '#d9d2c0')}</div><div><div class="src">${e.kind.toUpperCase()}</div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.text)}</p></div>`;
  const right = d.lastElementChild as HTMLElement;
  if (e.doc) {
    const b = el('button', 'btn-line', 'ОТКРЫТЬ ДОКУМЕНТ');
    b.style.marginRight = '12px';
    b.addEventListener('click', () => openDoc(e.doc!));
    right.appendChild(b);
  }
  const back = el('button', 'back', '← КО ВСЕМ УЛИКАМ');
  back.addEventListener('click', () => { closePanel(); openJournal('ev'); });
  right.appendChild(back);
  body.appendChild(d);
}

// ------------------------------------------------------------ log
export function openLog() {
  return panel('Журнал реплик', [['log', 'Лог']], (_t, body) => {
    const list = el('div', 'log-list');
    for (const e of api.g.log) {
      const ch = e.who ? CHARACTERS[e.who] : undefined;
      const it = el('div', 'log-item' + (e.kind === 'choice' ? ' choice-made' : '') + (e.who === 'thought' ? ' thought' : ''));
      const name = e.kind === 'choice' ? 'ВЫБОР' : e.name ?? (ch?.name || '');
      it.innerHTML = `<div class="who" style="--c:${ch?.color ?? '#8b958f'}">${escapeHtml(name)}</div><div class="what">${escapeHtml(plainText(e.text))}</div>`;
      // озвученную реплику можно переслушать
      const vo = e.kind === 'choice' ? null : lineVo(e.who ?? null, e.text);
      if (vo) {
        const b = el('button', 'replay', '▶');
        b.title = 'Переслушать';
        b.setAttribute('aria-label', 'Переслушать реплику');
        b.addEventListener('click', () => { void audio.playVo(vo); });
        it.querySelector('.who')!.appendChild(b);
      }
      list.appendChild(it);
    }
    if (!api.g.log.length) list.appendChild(el('div', 'empty', 'Пока пусто.'));
    body.appendChild(list);
    requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
  });
}

// ------------------------------------------------------------ chronicle
export function openChronicle(runVars?: Record<string, Record<string, unknown>>) {
  return panel('Хроника решений', [['c', 'Хроника']], (_t, body) => {
    const wrap = el('div', 'chron');
    const chaps = el('div', 'chaps');
    const tree = el('div', 'tree');
    wrap.append(chaps, tree);
    body.appendChild(wrap);
    const show = (n: number) => {
      chaps.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === n));
      tree.innerHTML = '';
      const ch = CHRONICLE[n];
      const vars = runVars?.[String(n)];
      let total = 0, known = 0;
      for (const row of ch.rows) {
        const kn = Meta.known(row.id);
        total += row.opts.length;
        known += row.opts.filter((o) => kn.includes(o.id)).length;
      }
      const pct = el('div', 'pct', `ИССЛЕДОВАНО: ${Math.round((known / Math.max(1, total)) * 100)}%`);
      tree.appendChild(pct);
      for (const row of ch.rows) {
        const r = el('div', 'row');
        r.innerHTML = `<div class="lbl">${escapeHtml(row.label)}</div>`;
        const kn = Meta.known(row.id);
        for (const o of row.opts) {
          const taken = vars ? o.when(vars as never) : false;
          const isKnown = kn.includes(o.id);
          const b = el('div', 'opt' + (taken ? ' taken' : isKnown ? ' known' : ' unknown'));
          b.textContent = taken || isKnown ? o.text : '? ? ?';
          r.appendChild(b);
        }
        tree.appendChild(r);
      }
    };
    CHRONICLE.forEach((ch, i) => {
      const b = el('button', '', `${i === 0 ? 'ПРОЛОГ' : 'ГЛАВА ' + i}<small>${escapeHtml(ch.title)}</small>`);
      b.addEventListener('click', () => show(i));
      chaps.appendChild(b);
    });
    let last = 0;
    if (runVars) for (let i = 0; i < CHRONICLE.length; i++) if (runVars[String(i)]) last = i;
    show(last);
  });
}

// ------------------------------------------------------------ endings
export function openEndings() {
  return panel('Концовки', [['e', 'Концовки']], (_t, body) => {
    const grid = el('div', 'endings');
    const got = Meta.data.endings;
    for (const e of ENDINGS) {
      const has = got.includes(e.id);
      const c = el('div', 'end-card' + (has ? ' got' : ' locked') + (e.hidden ? ' hidden-end' : ''));
      c.innerHTML = `<span class="n">${String(e.n).padStart(2, '0')}${e.hidden ? ' · СКРЫТАЯ' : ''}</span><h4>${has ? escapeHtml(e.title) : '? ? ?'}</h4><p>${escapeHtml(has ? e.text : e.hint)}</p>`;
      grid.appendChild(c);
    }
    body.appendChild(grid);
    const foot = el('div', 'pct', `ОТКРЫТО: ${got.length} / ${ENDINGS.length}   ·   ПРОХОЖДЕНИЙ: ${Meta.data.runs}`);
    foot.style.marginTop = '26px';
    body.appendChild(foot);
  });
}

// ------------------------------------------------------------ chapters
const CH_NAMES = ['ПРОЛОГ', 'ГЛАВА I', 'ГЛАВА II', 'ГЛАВА III', 'ГЛАВА IV'];
export const hasChapterSaves = () => CHAPTER_SLOTS.some((s) => !!Saves.read(s));
/** Выбор главы: начало каждой главы из последнего прохождения, в котором до неё дошли */
export function openChapters(onPick: (slot: string) => void) {
  return panel('Главы', [['c', 'Главы']], (_t, body) => {
    const list = el('div', 'chapters');
    CHAPTER_SLOTS.forEach((slot, n) => {
      const d = Saves.read(slot);
      const b = el('button', 'chapter-row' + (d ? '' : ' locked'));
      b.innerHTML = d
        ? `<span class="n">${CH_NAMES[n]}</span><h4>${escapeHtml(d.chapterTitle)}</h4><p>${escapeHtml(d.clock)} · ${escapeHtml(d.goal || '')}</p><span class="go">НАЧАТЬ ▸</span>`
        : `<span class="n">${CH_NAMES[n]}</span><h4>? ? ?</h4><p>Глава откроется, когда вы до неё дойдёте.</p>`;
      if (d) b.addEventListener('click', async () => {
        if (!(await confirm(`Начать с главы «${d.chapterTitle}»? Решения до неё — из прохождения, в котором вы её открыли. Слоты сохранений не изменятся.`, 'НАЧАТЬ', 'ОТМЕНА'))) return;
        closePanel();
        onPick(slot);
      });
      list.appendChild(b);
    });
    body.appendChild(list);
    body.appendChild(el('div', 'pct', 'Начало главы запоминается при каждом прохождении — можно вернуться и выбрать иначе.'));
  });
}

// ------------------------------------------------------------ gallery
function viewer(src: string, caption: string) {
  const root = overlayRoot();
  const v = el('div', 'viewer');
  v.innerHTML = `<img src="${src}" alt=""><div class="cap">${escapeHtml(caption)}</div><div class="hint">КАСАНИЕ — ЗАКРЫТЬ</div>`;
  const close = (e?: Event) => { e?.stopPropagation(); v.remove(); window.removeEventListener('keydown', onKey, true); audio.sfx('back'); };
  const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); close(); };
  v.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  root.appendChild(v);
}
export function openGallery() {
  return panel('Галерея', [['bg', 'Места'], ['pt', 'Персонажи']], (t, body) => {
    const grid = el('div', t === 'bg' ? 'gallery' : 'gallery pts');
    let open = 0, total = 0;
    if (t === 'bg') {
      for (const g of GALLERY_BG) {
        total++;
        const has = g.id === 'key_art' || Meta.hasArt('bg:' + g.id);
        if (has) open++;
        const c = el('button', 'g-tile' + (has ? '' : ' locked'));
        c.innerHTML = has ? `<img src="${bgUrl(g.id)}" alt="" loading="lazy"><span>${escapeHtml(g.title)}${g.cg ? ' · CG' : ''}</span>` : '<i>?</i><span>? ? ?</span>';
        if (has) c.addEventListener('click', () => viewer(bgUrl(g.id), g.title));
        grid.appendChild(c);
      }
    } else {
      for (const id of GALLERY_CHARS) {
        for (const e of portraitExprs(id)) {
          total++;
          const has = Meta.hasArt(`pt:${id}:${e}`);
          if (has) open++;
          const c = el('button', 'g-tile g-pt' + (has ? '' : ' locked'));
          const name = CHARACTERS[id].name;
          c.innerHTML = has ? `<img src="${portraitUrl(id, e)}" alt="" loading="lazy"${isFullBody(id) ? ' class="full"' : ''}><span>${escapeHtml(name)}</span>` : '<i>?</i>';
          if (has) c.addEventListener('click', () => viewer(portraitUrl(id, e), name));
          grid.appendChild(c);
        }
      }
    }
    body.appendChild(grid);
    body.appendChild(el('div', 'pct', `ОТКРЫТО: ${open} / ${total}`));
  });
}

// ------------------------------------------------------------ settings
export function openSettings() {
  return panel('Настройки', [['a', 'Звук'], ['t', 'Текст'], ['v', 'Изображение']], (t, body) => {
    const box = el('div', 'settings');
    const range = (label: string, sub: string, key: keyof typeof settings, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const row = el('div', 'set-row');
      row.innerHTML = `<label>${label}<small>${sub}</small></label><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key] as number}"><output>${fmt(settings[key] as number)}</output>`;
      const inp = row.querySelector('input')!;
      const out = row.querySelector('output')!;
      inp.addEventListener('input', () => {
        (settings as unknown as Record<string, number>)[key] = parseFloat(inp.value);
        out.textContent = fmt(parseFloat(inp.value));
        saveSettings();
      });
      inp.addEventListener('change', () => audio.sfx('click'));
      box.appendChild(row);
    };
    const toggle = (label: string, sub: string, key: keyof typeof settings) => {
      const row = el('div', 'set-row');
      row.innerHTML = `<label>${label}<small>${sub}</small></label><div class="toggle"><button data-v="1">ВКЛ</button><button data-v="0">ВЫКЛ</button></div><output></output>`;
      const upd = () => row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === !!settings[key]));
      row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        (settings as unknown as Record<string, boolean>)[key] = b.dataset.v === '1';
        saveSettings(); upd(); audio.sfx('click');
      }));
      upd();
      box.appendChild(row);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    if (t === 'a') {
      range('Общая громкость', '', 'master', 0, 1, 0.05, pct);
      range('Музыка', 'Генеративный саундтрек', 'music', 0, 1, 0.05, pct);
      range('Атмосфера', 'Дождь, город, гул', 'ambience', 0, 1, 0.05, pct);
      range('Эффекты', 'Интерфейс и события', 'sfx', 0, 1, 0.05, pct);
      range('Озвучка', 'ОРФЕЙ, терминалы, вступление и трейлер. 0 — выключить', 'vo', 0, 1, 0.05, pct);
      range('Голоса печати', 'Тихие звуки при наборе текста', 'voice', 0, 1, 0.05, pct);
    } else if (t === 't') {
      range('Скорость текста', '0 — мгновенно', 'textSpeed', 0, 120, 5, (v) => (v === 0 ? 'МГН.' : `${v} зн/с`));
      range('Пауза авточтения', 'Секунд после реплики', 'autoDelay', 0.5, 5, 0.1, (v) => `${v.toFixed(1)} с`);
      toggle('Таймер на выборах', 'Решения, которые нужно принять быстро', 'timers');
      range('Размер текста', 'Крупнее — легче читать на телефоне', 'textSize', 0.85, 1.3, 0.05, pct);
      range('Окно текста', 'Непрозрачность фона под репликами', 'boxAlpha', 0.3, 1, 0.05, pct);
      toggle('«Назад» через решения', 'Разрешить отматывать уже принятые решения', 'rollbackChoices');
    } else {
      range('Плёнка и CRT', 'Шум, развёртка', 'fx', 0, 1, 0.05, pct);
      toggle('Вспышки и глитчи', 'Отключите при светочувствительности', 'glitch');
      toggle('Тряска камеры', '', 'shake');
      if ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches) toggle('Вибрация', 'Короткий отклик в напряжённые моменты', 'vibrate');
      const row = el('div', 'set-row fs-row');
      row.innerHTML = `<label>Полный экран<small>${fullscreenSupported() ? 'Кнопка или F11' : 'Не поддерживается этим браузером'}</small></label><div class="toggle"><button type="button" class="fs-btn">${isFullscreen() ? 'ВЫЙТИ' : 'ВКЛЮЧИТЬ'}</button></div><output></output>`;
      row.querySelector('.fs-btn')!.addEventListener('click', async () => {
        const err = await toggleFullscreen();
        if (err) api.g.toast('bad', 'Полный экран', err);
        setTimeout(() => { const b = row.querySelector('.fs-btn'); if (b) b.textContent = isFullscreen() ? 'ВЫЙТИ' : 'ВКЛЮЧИТЬ'; }, 300);
      });
      box.appendChild(row);
      const reset = el('button', 'btn-line', 'СБРОСИТЬ НАСТРОЙКИ');
      reset.addEventListener('click', () => { resetSettings(); closePanel(); openSettings(); });
      box.appendChild(reset);
    }
    body.appendChild(box);
  });
}

// ------------------------------------------------------------ saves
const fmtTime = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function openSaves(mode: 'save' | 'load') {
  return panel(mode === 'save' ? 'Сохранить' : 'Загрузить', [['s', 'Слоты']], (_t, body) => {
    const grid = el('div', 'slots');
    for (const slot of SLOTS) {
      // авто- и быстрый слот пишутся только сами; в загрузке быстрый виден, когда он есть
      if (mode === 'save' && (slot === 'auto' || slot === 'quick')) continue;
      if (slot === 'quick' && !Saves.read(slot)) continue;
      const d = Saves.read(slot);
      const b = el('button', 'slot' + (d ? '' : ' empty'));
      const name = slot === 'auto' ? 'АВТОСОХРАНЕНИЕ' : slot === 'quick' ? 'БЫСТРОЕ СОХРАНЕНИЕ' : `СЛОТ ${slot.slice(1)}`;
      b.innerHTML = d
        ? `<b>${name}</b><h4>${escapeHtml(d.chapterTitle)}</h4><p>${escapeHtml(d.clock)} · ${escapeHtml(d.goal || '')}</p><p style="font-size:14px;color:#5b6460">${fmtTime(d.time)}</p>`
        : `<b>${name}</b><h4>Пусто</h4>`;
      if (d && slot !== 'auto') {
        const del = el('span', 'del', 'УДАЛИТЬ');
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!(await confirm(`Удалить сохранение «${d.chapterTitle} · ${d.clock}»? Это нельзя отменить.`, 'УДАЛИТЬ', 'ОТМЕНА'))) return;
          Saves.remove(slot); closePanel(); openSaves(mode);
        });
        b.appendChild(del);
      }
      b.addEventListener('click', async () => {
        if (mode === 'save') {
          if (!api.g.canSave()) { api.g.toast('bad', 'Сохранение', 'Сейчас сохранить нельзя.'); return; }
          if (d && !(await confirm(`Перезаписать «${d.chapterTitle} · ${d.clock}»?`, 'ПЕРЕЗАПИСАТЬ', 'ОТМЕНА'))) return;
          const ok = api.g.save(slot);
          audio.sfx(ok ? 'confirm' : 'wrong');
          closePanel();
          openSaves('save');
        } else if (d) {
          closePanel();
          api.g.load(slot);
        }
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
  });
}

export function confirm(text: string, yes = 'ДА', no = 'ОТМЕНА'): Promise<boolean> {
  return new Promise((resolve) => {
    const root = overlayRoot();
    const bg = el('div', 'panel-bg');
    const box = el('div', 'confirm');
    box.innerHTML = `<p>${escapeHtml(text)}</p><div class="row"><button class="btn-line" data-v="1">${yes}</button><button class="btn-line" data-v="0">${no}</button></div>`;
    root.append(bg, box);
    box.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest('button')?.dataset.v;
      if (v === undefined) return;
      bg.remove(); box.remove();
      resolve(v === '1');
    });
  });
}

export const evidenceCount = () => EVIDENCE.length;
