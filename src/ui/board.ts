// Доска расследования: игрок выбирает вопрос и связывает две улики нитью.
import { el, escapeHtml } from '../engine/util';
import { audio } from '../engine/audio';
import { DEDUCTIONS } from '../data/board';
import { EV_BY_ID } from '../data/evidence';
import { icon } from './icons';
import { api, overlayRoot } from './api';

export function openBoard(forced: boolean): Promise<void> {
  return new Promise((resolve) => {
    const g = api.g;
    const found = g.found();
    const root = overlayRoot();
    const board = el('div', 'board');
    const wall = el('div', 'wall');
    const side = el('div', 'side');
    board.append(wall, side);
    root.appendChild(board);
    audio.sfx('paper');

    const svgNS = 'http://www.w3.org/2000/svg';
    const threads = document.createElementNS(svgNS, 'svg');
    threads.setAttribute('class', 'threads');
    threads.setAttribute('viewBox', '0 0 1450 1080');
    wall.appendChild(threads);

    // раскладка карточек сеткой с лёгким разбросом
    const cols = 6;
    const pos: Record<string, [number, number]> = {};
    found.forEach((id, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = 34 + c * 232 + ((i * 37) % 24) - 12;
      const y = 44 + r * 198 + ((i * 53) % 20) - 10;
      pos[id] = [x, y];
      const ev = EV_BY_ID[id];
      const card = el('button', 'bcard');
      card.dataset.id = id;
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      card.style.transform = `rotate(${((i * 29) % 7) - 3}deg)`;
      card.innerHTML = `<div class="pin"></div><div class="img">${icon(ev?.icon ?? 'note', '#d9d2c0')}</div><b>${escapeHtml(ev?.title ?? id)}</b>`;
      card.title = ev?.short ?? '';
      wall.appendChild(card);
    });
    if (!found.length) wall.appendChild(el('div', 'empty', 'Пока нечего прикрепить к доске.'));

    const center = (id: string): [number, number] => {
      const [x, y] = pos[id];
      return [x + 109, y + 20];
    };
    const drawThread = (a: string, b: string, cls = '') => {
      const [x1, y1] = center(a), [x2, y2] = center(b);
      const p = document.createElementNS(svgNS, 'path');
      const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + 60;
      p.setAttribute('d', `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
      if (cls) p.setAttribute('class', cls);
      threads.appendChild(p);
      return p;
    };

    // уже решённые выводы
    const vars = g.vars();
    for (const d of DEDUCTIONS) {
      if (!vars['ded_' + d.id]) continue;
      const pair = d.pairs.find(([a, b]) => found.includes(a) && found.includes(b));
      if (pair) drawThread(pair[0], pair[1]);
    }

    side.innerHTML = `<h2>ДОСКА</h2><div class="help">Выберите вопрос, затем соедините нитью две улики, которые на него отвечают.</div>`;
    const qbox = el('div');
    qbox.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    side.appendChild(qbox);
    const status = el('div', 'status');
    side.appendChild(status);
    const doneBtn = el('button', 'done-btn', forced ? 'ПРОДОЛЖИТЬ' : 'ЗАКРЫТЬ');
    side.appendChild(doneBtn);

    let active: string | null = null;
    let first: string | null = null;
    const renderQ = () => {
      qbox.innerHTML = '';
      const v = g.vars();
      for (const d of DEDUCTIONS) {
        const solved = !!v['ded_' + d.id];
        const b = el('button', 'q' + (solved ? ' solved' : '') + (active === d.id ? ' on' : ''));
        b.innerHTML = `<b>${escapeHtml(d.question)}</b><span>${escapeHtml(solved ? d.answer : active === d.id ? d.hint : 'Не решено')}</span>`;
        if (!solved) b.addEventListener('click', () => { active = d.id; first = null; clearSel(); audio.sfx('click'); status.textContent = 'Выберите первую улику.'; status.className = 'status'; renderQ(); });
        qbox.appendChild(b);
      }
    };
    const clearSel = () => wall.querySelectorAll('.bcard.sel').forEach((c) => c.classList.remove('sel'));
    renderQ();

    // подсказка, если игрок долго не может ничего связать: какой вопрос решаем и с какой улики начать
    let lastProgress = performance.now();
    const HINT_AFTER = 90_000;
    const hintTimer = window.setInterval(() => {
      if (performance.now() - lastProgress < HINT_AFTER) return;
      const v = g.vars();
      const d = DEDUCTIONS.find((x) => !v['ded_' + x.id] && x.pairs.some(([a, b]) => found.includes(a) && found.includes(b)));
      if (!d) return;
      const [a] = d.pairs.find(([p1, p2]) => found.includes(p1) && found.includes(p2))!;
      lastProgress = performance.now();
      wall.querySelectorAll('.bcard.hint').forEach((c) => c.classList.remove('hint'));
      wall.querySelector(`.bcard[data-id="${a}"]`)?.classList.add('hint');
      status.textContent = `Подсказка: вопрос «${d.question}» уже можно решить. Начните с улики «${EV_BY_ID[a]?.title ?? a}».`;
      status.className = 'status';
      audio.sfx('hover');
    }, 5000);

    wall.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.bcard') as HTMLElement | null;
      if (!card) return;
      const id = card.dataset.id!;
      if (!active) {
        status.textContent = EV_BY_ID[id]?.short ?? '';
        status.className = 'status bad';
        audio.sfx('hover');
        return;
      }
      if (!first) { first = id; card.classList.add('sel'); audio.sfx('click'); status.textContent = 'Теперь — вторую.'; status.className = 'status'; return; }
      if (first === id) { first = null; clearSel(); return; }
      const d = DEDUCTIONS.find((x) => x.id === active)!;
      const ok = d.pairs.some(([a, b]) => (a === first && b === id) || (a === id && b === first));
      if (ok) {
        lastProgress = performance.now();
        wall.querySelectorAll('.bcard.hint').forEach((c) => c.classList.remove('hint'));
        drawThread(first, id);
        g.setVar('ded_' + d.id, true);
        audio.sfx('deduction');
        status.textContent = d.answer;
        status.className = 'status';
        active = null;
      } else {
        const p = drawThread(first, id, 'bad');
        setTimeout(() => p.remove(), 1000);
        audio.sfx('wrong');
        status.textContent = 'Не сходится.';
        status.className = 'status bad';
      }
      first = null;
      clearSel();
      renderQ();
    });

    const close = () => {
      clearInterval(hintTimer);
      window.removeEventListener('keydown', onKey, true);
      board.remove();
      audio.sfx('back');
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'b') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    doneBtn.addEventListener('click', close);
  });
}
