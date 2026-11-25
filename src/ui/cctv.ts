// Архив камеры лобби: процедурно отрисованная запись с прокруткой по времени.
import { el } from '../engine/util';
import { audio } from '../engine/audio';
import { overlayRoot } from './api';

const START = 23 * 60; // 23:00
const SPAN = 160; // минут (до 01:40)
const GAP = [30, 110]; // 23:30–00:50
const fmt = (m: number) => {
  const t = (START + m) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

interface Walker { from: number; to: number; x0: number; x1: number; kind: 'resident' | 'eva' | 'eva_out' | 'grey' | 'grey_out' | 'drone' | 'courier'; restoredOnly?: boolean }
const WALKERS: Walker[] = [
  { from: 8, to: 12, x0: 1500, x1: 600, kind: 'resident' },
  { from: 19, to: 22, x0: 1460, x1: 900, kind: 'courier' },
  { from: 38, to: 41, x0: 1480, x1: 560, kind: 'eva', restoredOnly: true },
  { from: 52, to: 54, x0: 560, x1: 1480, kind: 'eva_out', restoredOnly: true },
  { from: 88, to: 91, x0: 1480, x1: 560, kind: 'grey', restoredOnly: true },
  { from: 111, to: 113, x0: 560, x1: 1480, kind: 'grey_out', restoredOnly: true },
  { from: 150, to: 156, x0: 1480, x1: 700, kind: 'drone' },
];

function drawLobby(c: CanvasRenderingContext2D, W: number, H: number) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2e2f'); g.addColorStop(1, '#121414');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // пол в перспективе
  c.strokeStyle = 'rgba(200,210,200,0.08)';
  for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(W / 2 + i * 30, H * 0.48); c.lineTo(W / 2 + i * 180, H); c.stroke(); }
  for (let j = 0; j < 9; j++) { const y = H * 0.48 + Math.pow(j / 8, 1.8) * H * 0.52; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  // задняя стена и лифты
  c.fillStyle = '#3a3e3e'; c.fillRect(200, 80, W - 400, H * 0.4);
  c.fillStyle = '#4b5150'; c.fillRect(470, 130, 150, 230); c.fillRect(660, 130, 150, 230);
  c.strokeStyle = '#1d2020'; c.lineWidth = 3; c.beginPath(); c.moveTo(545, 130); c.lineTo(545, 360); c.moveTo(735, 130); c.lineTo(735, 360); c.stroke();
  c.fillStyle = 'rgba(255,240,200,0.55)'; c.fillRect(530, 112, 30, 10); c.fillRect(720, 112, 30, 10);
  // стойка консьержа
  c.fillStyle = '#262a2a'; c.fillRect(900, 300, 280, 90); c.fillStyle = '#3d4342'; c.fillRect(900, 290, 280, 14);
  // стеклянный вход справа с дождём
  c.fillStyle = '#1b2224'; c.fillRect(1300, 60, 260, 380);
  c.strokeStyle = 'rgba(200,220,230,0.14)';
  for (let i = 0; i < 40; i++) { const x = 1300 + Math.random() * 260, y = 60 + Math.random() * 380; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 18); c.stroke(); }
  c.strokeStyle = '#555c5c'; c.lineWidth = 4; c.strokeRect(1300, 60, 260, 380); c.beginPath(); c.moveTo(1430, 60); c.lineTo(1430, 440); c.stroke();
  // растение
  c.fillStyle = '#1e2422'; c.beginPath(); c.ellipse(320, 400, 40, 70, 0, 0, Math.PI * 2); c.fill();
  // светильники
  for (const x of [400, 800, 1200]) { const r = c.createRadialGradient(x, 40, 0, x, 40, 260); r.addColorStop(0, 'rgba(255,250,230,0.2)'); r.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = r; c.fillRect(x - 260, 0, 520, 360); }
}

function drawFigure(c: CanvasRenderingContext2D, x: number, y: number, s: number, kind: Walker['kind'], t: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const bob = Math.sin(t * 9) * 3;
  c.fillStyle = kind.startsWith('grey') ? '#7c8080' : kind.startsWith('eva') ? '#15191d' : '#2b2f30';
  if (kind === 'drone') {
    c.fillStyle = '#9aa'; c.fillRect(-40, -260, 80, 18); c.fillStyle = 'rgba(255,80,80,0.9)'; c.fillRect(-6, -246, 12, 8);
    c.restore(); return;
  }
  // пальто
  c.beginPath(); c.moveTo(-34, -190 + bob); c.lineTo(34, -190 + bob); c.lineTo(kind.startsWith('eva') || kind.startsWith('grey') ? 46 : 30, 0); c.lineTo(kind.startsWith('eva') || kind.startsWith('grey') ? -46 : -30, 0); c.closePath(); c.fill();
  // голова
  c.beginPath(); c.arc(0, -214 + bob, 24, 0, Math.PI * 2); c.fill();
  if (kind.startsWith('eva')) { c.fillStyle = '#0a0c0e'; c.beginPath(); c.moveTo(-26, -222 + bob); c.lineTo(26, -232 + bob); c.lineTo(30, -196 + bob); c.lineTo(14, -210 + bob); c.closePath(); c.fill(); c.fillStyle = '#1b2026'; c.fillRect(-36, -196 + bob, 72, 18); }
  if (kind.startsWith('grey')) {
    // зонт
    c.fillStyle = '#0d0f10'; c.beginPath(); c.arc(0, -250 + bob, 70, Math.PI, 0); c.fill();
    c.strokeStyle = '#0d0f10'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -250 + bob); c.lineTo(0, -150 + bob); c.stroke();
    // шарф и блеск булавки
    c.fillStyle = '#4a3434'; c.fillRect(-30, -192 + bob, 60, 16);
    const glint = 0.5 + 0.5 * Math.sin(t * 6);
    c.fillStyle = `rgba(255,255,255,${0.5 + glint * 0.5})`; c.beginPath(); c.arc(-18, -160 + bob, 3.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = `rgba(255,255,255,${glint * 0.35})`; c.beginPath(); c.arc(-18, -160 + bob, 10, 0, Math.PI * 2); c.fill();
  }
  if (kind === 'courier') { c.fillStyle = '#4a4f50'; c.fillRect(20, -120, 40, 40); }
  c.restore();
}

export function openCCTV(mode: 'lobby' | 'lobby_restored'): Promise<boolean> {
  const restored = mode === 'lobby_restored';
  return new Promise((resolve) => {
    const root = overlayRoot();
    const bg = el('div', 'panel-bg');
    const box = el('div', 'cctv');
    box.innerHTML = `<h3><span>«ЛАЗУРЬ» // КАМЕРА 01 // ЛОББИ ${restored ? '// ВОССТАНОВЛЕНО ИЗ КЭША' : ''}</span><b>● REC</b></h3>
      <div class="screen"><canvas width="1440" height="650"></canvas><div class="ts"></div><div class="cam">CAM-01</div></div>
      <div class="scrub"></div>
      <div class="ctl"><button data-a="prev">◀ −1 МИН</button><button data-a="play">▶ ВОСПР.</button><button data-a="next">+1 МИН ▶</button>
      ${restored ? '' : '<button data-a="mark" class="primary">ОТМЕТИТЬ АНОМАЛИЮ</button>'}<span class="hint"></span><button data-a="close">ЗАКРЫТЬ</button></div>`;
    root.append(bg, box);
    const canvas = box.querySelector('canvas')!;
    const c = canvas.getContext('2d')!;
    const ts = box.querySelector('.ts') as HTMLElement;
    const scrub = box.querySelector('.scrub') as HTMLElement;
    const hint = box.querySelector('.hint') as HTMLElement;
    // разметка шкалы
    for (let m = 0; m <= SPAN; m += 20) {
      const t = el('div', 'tick');
      t.style.left = `${(m / SPAN) * 100}%`;
      t.innerHTML = `<span>${fmt(m)}</span>`;
      scrub.appendChild(t);
    }
    if (!restored) {
      const gap = el('div', 'gap');
      gap.style.left = `${(GAP[0] / SPAN) * 100}%`;
      gap.style.width = `${((GAP[1] - GAP[0]) / SPAN) * 100}%`;
      gap.style.opacity = '0';
      scrub.appendChild(gap);
    }
    const head = el('div', 'head');
    scrub.appendChild(head);
    hint.textContent = restored ? 'Фрагменты из кэша. Найдите посетителей.' : 'Прокрутите запись. Если что-то не так — отметьте.';
    let pos = 0;
    let playing = false;
    let marked = false;
    const lobby = document.createElement('canvas');
    lobby.width = 1440; lobby.height = 650;
    drawLobby(lobby.getContext('2d')!, 1440, 650);
    const inGap = (m: number) => m >= GAP[0] && m < GAP[1];
    const render = (time: number) => {
      const m = Math.floor(pos);
      ts.textContent = `${fmt(m)}:${String(Math.floor((pos % 1) * 60)).padStart(2, '0')}`;
      head.style.left = `${(pos / SPAN) * 100}%`;
      if (inGap(m) && !restored) {
        c.fillStyle = '#060707'; c.fillRect(0, 0, 1440, 650);
        for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; c.fillRect(Math.random() * 1440, Math.random() * 650, 2, 2); }
        c.fillStyle = '#e8e8e0'; c.font = '600 40px "Plex Mono", monospace'; c.textAlign = 'center';
        c.fillText('НЕТ ЗАПИСИ', 720, 310);
        c.font = '400 22px "Plex Mono", monospace'; c.fillStyle = '#9a9a92'; c.fillText('ФРАГМЕНТ ОТСУТСТВУЕТ В АРХИВЕ', 720, 350);
        return;
      }
      c.drawImage(lobby, 0, 0);
      const corrupt = restored && inGap(m) && !WALKERS.some((w) => w.restoredOnly && pos >= w.from - 0.5 && pos <= w.to + 0.5);
      for (const w of WALKERS) {
        if (w.restoredOnly && !restored) continue;
        if (pos < w.from || pos > w.to) continue;
        const k = (pos - w.from) / (w.to - w.from);
        const x = w.x0 + (w.x1 - w.x0) * k;
        const depth = 0.9 + (1 - Math.abs(x - 1000) / 1000) * 0.15;
        drawFigure(c, x, 600, depth, w.kind, time / 1000);
      }
      if (corrupt) {
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.6})`; c.fillRect(0, Math.random() * 650, 1440, 2 + Math.random() * 20); }
      }
      // зерно и вигнетка
      for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; c.fillRect(Math.random() * 1440, Math.random() * 650, 2, 2); }
      const v = c.createRadialGradient(720, 325, 300, 720, 325, 900); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = v; c.fillRect(0, 0, 1440, 650);
      c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 650; y += 3) c.fillRect(0, y, 1440, 1);
    };
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      if (playing) { pos += dt * 1.5; if (pos >= SPAN - 0.01) { pos = SPAN - 0.01; playing = false; } }
      render(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const setPos = (p: number) => { pos = Math.max(0, Math.min(SPAN - 0.01, p)); };
    let drag = false;
    const fromEvent = (e: PointerEvent) => {
      const r = scrub.getBoundingClientRect();
      setPos(((e.clientX - r.left) / r.width) * SPAN);
    };
    scrub.addEventListener('pointerdown', (e) => { drag = true; playing = false; fromEvent(e); scrub.setPointerCapture(e.pointerId); });
    scrub.addEventListener('pointermove', (e) => drag && fromEvent(e));
    scrub.addEventListener('pointerup', () => (drag = false));
    const close = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      bg.remove(); box.remove();
      audio.sfx('back');
      resolve(marked);
    };
    const act = (a: string) => {
      audio.sfx('click');
      if (a === 'prev') { playing = false; setPos(Math.floor(pos) - 1); }
      if (a === 'next') { playing = false; setPos(Math.floor(pos) + 1); }
      if (a === 'play') playing = !playing;
      if (a === 'close') close();
      if (a === 'mark') {
        if (inGap(Math.floor(pos))) {
          marked = true;
          audio.sfx('evidence');
          hint.textContent = 'Аномалия отмечена: 23:30–00:50 — час записи вырезан.';
          hint.classList.add('ok');
          const gap = scrub.querySelector('.gap') as HTMLElement;
          if (gap) gap.style.opacity = '1';
          const mk = el('div', 'mark');
          mk.style.left = `${(GAP[0] / SPAN) * 100}%`;
          mk.style.width = `${((GAP[1] - GAP[0]) / SPAN) * 100}%`;
          scrub.appendChild(mk);
        } else {
          audio.sfx('wrong');
          hint.textContent = 'Здесь ничего необычного.';
          hint.classList.remove('ok');
        }
      }
    };
    box.querySelector('.ctl')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (a) act(a);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); act('prev'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); act('next'); }
      else if (e.key === ' ') { e.preventDefault(); act('play'); }
      else if (e.key === 'Escape') { e.preventDefault(); act('close'); }
      else if (e.key.toLowerCase() === 'm' && !restored) act('mark');
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
  });
}
