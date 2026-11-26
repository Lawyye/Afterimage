// Выборы: обычный список (в т.ч. с таймером и заблокированными вариантами)
// и режим осмотра — интерактивные зоны поверх фона.
import { el, escapeHtml, Token } from './util';
import { audio } from './audio';
import { settings } from './settings';
import { HOTSPOTS } from '../data/hotspots';
import type { Stage } from './stage';

export interface ParsedChoice {
  index: number;
  raw: string;
  kind: 'normal' | 'hotspot' | 'system' | 'locked';
  id?: string;
  text: string;
  hint?: string;
  risky?: boolean;
}

export function parseChoice(raw: string, index: number): ParsedChoice {
  const t = raw.trim();
  if (t.startsWith('@@')) return { index, raw, kind: 'system', id: t.slice(2), text: '' };
  if (t.startsWith('@')) return { index, raw, kind: 'hotspot', id: t.slice(1), text: '' };
  if (t.startsWith('x:')) {
    const [a, b] = t.slice(2).split('::');
    return { index, raw, kind: 'locked', text: a.trim(), hint: b?.trim() };
  }
  if (t.startsWith('!')) return { index, raw, kind: 'normal', text: t.slice(1).trim(), risky: true };
  return { index, raw, kind: 'normal', text: t };
}

export class ChoiceUI {
  private root: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  constructor(private ui: HTMLElement) {}

  present(choices: ParsedChoice[], timer: number, token: Token): Promise<number> {
    const visible = choices.filter((c) => c.kind === 'normal' || c.kind === 'locked');
    const timeout = choices.find((c) => c.kind === 'system' && c.id === 'timeout');
    return new Promise((resolve) => {
      const box = el('div', 'choices');
      this.root = box;
      let done = false;
      let raf = 0;
      const finish = (c: ParsedChoice, btn?: HTMLElement) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        audio.sfx(c.kind === 'system' ? 'timeout' : 'choice');
        btn?.classList.add('picked');
        box.classList.add('done');
        this.cleanupKeys();
        setTimeout(() => { box.remove(); resolve(c.index); }, 520);
      };
      const useTimer = timer > 0 && settings.timers && !!timeout;
      if (useTimer) {
        const lbl = el('div', 'timer-label', 'РЕШАЙТЕ');
        const bar = el('div', 'timer');
        const fill = el('i');
        bar.appendChild(fill);
        box.append(lbl, bar);
        const t0 = performance.now();
        let lastTick = 0;
        const tick = (t: number) => {
          const k = 1 - (t - t0) / (timer * 1000);
          fill.style.transform = `scaleX(${Math.max(0, k)})`;
          const sec = Math.floor((t - t0) / 1000);
          if (sec !== lastTick) { lastTick = sec; audio.sfx('tick', 0.6); }
          if (k <= 0) finish(timeout!);
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
      visible.forEach((c, i) => {
        const b = el('button', 'choice' + (c.kind === 'locked' ? ' locked' : '') + (c.risky ? ' risky' : ''));
        b.style.animationDelay = `${i * 70}ms`;
        b.innerHTML = `<span class="k">${c.kind === 'locked' ? '✕' : i + 1}</span><span>${escapeHtml(c.text)}${c.kind === 'locked' && c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ''}</span>`;
        if (c.kind !== 'locked') {
          b.addEventListener('click', (e) => { e.stopPropagation(); finish(c, b); });
          b.addEventListener('mouseenter', () => audio.sfx('hover', 0.5));
        } else b.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('wrong', 0.5); });
        box.appendChild(b);
      });
      this.ui.appendChild(box);
      this.keyHandler = (e: KeyboardEvent) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= visible.length) {
          const c = visible[n - 1];
          if (c.kind !== 'locked') finish(c, box.querySelectorAll<HTMLElement>('.choice')[n - 1]);
        }
      };
      window.addEventListener('keydown', this.keyHandler);
      token.onCancel(() => { done = true; cancelAnimationFrame(raf); this.cleanupKeys(); box.remove(); });
    });
  }
  private cleanupKeys() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }
}

export class Investigation {
  private label = el('div', 'hs-label');
  constructor(private ui: HTMLElement, private stage: Stage) {}

  present(choices: ParsedChoice[], bgId: string, examined: Set<string>, token: Token): Promise<number> {
    const defs = HOTSPOTS[bgId] ?? {};
    const hs = choices.filter((c) => c.kind === 'hotspot');
    const exit = choices.find((c) => c.kind === 'system' && c.id === 'exit');
    return new Promise((resolve) => {
      const layer = this.stage.bgDrift ?? this.stage.hotspotLayer;
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 1920 1080');
      svg.setAttribute('class', 'hs-svg');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:3';
      const banner = el('div', 'inv-banner');
      const total = hs.length;
      const seenCount = hs.filter((c) => examined.has(`${bgId}.${c.id}`)).length;
      banner.innerHTML = `<b>ОСМОТР</b><span>Осмотрено ${seenCount} из ${total}${exit ? '' : ' · исследуйте место'}</span>`;
      const list = el('div', 'inv-list');
      let done = false;
      const finish = (c: ParsedChoice) => {
        if (done) return;
        done = true;
        audio.sfx('click');
        if (c.kind === 'hotspot') examined.add(`${bgId}.${c.id}`);
        cleanup();
        resolve(c.index);
      };
      const cleanup = () => {
        svg.remove(); banner.remove(); list.remove(); exitBtn?.remove(); this.label.remove();
        window.removeEventListener('keydown', onKey);
      };
      const items: { c: ParsedChoice; g: SVGGElement }[] = [];
      for (const c of hs) {
        const d = defs[c.id!];
        if (!d) {
          const b = el('button', '', escapeHtml(c.id!));
          b.addEventListener('click', () => finish(c));
          list.appendChild(b);
          continue;
        }
        const [x, y, w, h] = d.rect;
        const [dx, dy] = d.dot ?? [x + w / 2, y + h / 2];
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'hs' + (examined.has(`${bgId}.${c.id}`) ? ' done' : ''));
        g.innerHTML = `<rect class="shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><circle class="ring" cx="${dx}" cy="${dy}" r="13"/><circle class="pulse" cx="${dx}" cy="${dy}" r="9"/>`;
        g.addEventListener('mouseenter', () => { audio.sfx('hover', 0.5); this.showLabel(d.label, d.sub, dx, dy - 10); });
        g.addEventListener('mouseleave', () => this.label.classList.remove('on'));
        g.addEventListener('click', (e) => { e.stopPropagation(); finish(c); });
        svg.appendChild(g);
        items.push({ c, g });
      }
      layer.appendChild(svg);
      this.ui.append(banner, list, this.label);
      let exitBtn: HTMLElement | null = null;
      if (exit) {
        exitBtn = el('button', 'inv-exit', 'ЗАВЕРШИТЬ ОСМОТР');
        exitBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(exit); });
        this.ui.appendChild(exitBtn);
      }
      // клавиатура: Tab/стрелки переключают зоны, Enter — выбрать
      let focus = -1;
      const onKey = (e: KeyboardEvent) => {
        if (!items.length) return;
        if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          focus = (focus + (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1) + items.length) % items.length;
          items.forEach((it, i) => it.g.classList.toggle('focus', i === focus));
          const d = defs[items[focus].c.id!];
          const [x, y, w, h] = d.rect;
          const [dx, dy] = d.dot ?? [x + w / 2, y + h / 2];
          this.showLabel(d.label, d.sub, dx, dy - 10);
        } else if (e.key === 'Enter' && focus >= 0) {
          e.preventDefault();
          finish(items[focus].c);
        }
      };
      window.addEventListener('keydown', onKey);
      token.onCancel(() => { done = true; cleanup(); });
    });
  }
  private showLabel(t: string, sub: string | undefined, x: number, y: number) {
    this.label.innerHTML = `${escapeHtml(t)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    const z = this.stage.uiZoom;
    this.label.style.left = `${x / z}px`;
    this.label.style.top = `${y / z}px`;
    this.label.classList.add('on');
  }
}
