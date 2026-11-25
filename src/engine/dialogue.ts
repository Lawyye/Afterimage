import { el, escapeHtml, sleep, Token } from './util';
import { CHARACTERS } from '../data/characters';
import { settings } from './settings';
import { audio } from './audio';
import type { Stage } from './stage';

export interface Line {
  speaker: string | null; // id персонажа, 'thought', 'sys' или null (повествование)
  expr: string | null;
  name?: string; // произвольное имя
  text: string;
  tags: string[];
}

interface Seg { t: string; cls?: string; pause?: number }

function parseMarkup(src: string): Seg[] {
  const out: Seg[] = [];
  const re = /(\*[^*]+\*|!![^!]+!!|%%[^%]+%%|\|\|)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: src.slice(last, m.index) });
    const s = m[0];
    if (s === '||') out.push({ t: '', pause: 420 });
    else if (s.startsWith('**') || s.startsWith('*')) out.push({ t: s.slice(1, -1), cls: 'em' });
    else if (s.startsWith('!!')) out.push({ t: s.slice(2, -2), cls: 'red' });
    else out.push({ t: s.slice(2, -2), cls: 'gl' });
    last = m.index + s.length;
  }
  if (last < src.length) out.push({ t: src.slice(last) });
  return out;
}
export function plainText(src: string) {
  return parseMarkup(src).map((s) => s.t).join('');
}

const ORPHEUS_SVG = `<svg viewBox="-150 -150 300 300">
<defs><radialGradient id="orpg" cx="0" cy="0" r="1"><stop offset="0" stop-color="#d8ffe4" stop-opacity=".95"/><stop offset=".35" stop-color="#7ff0a2" stop-opacity=".5"/><stop offset="1" stop-color="#1f6b40" stop-opacity="0"/></radialGradient></defs>
<g class="o-rot1"><circle r="128" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 10" opacity=".6"/></g>
<g class="o-rot2"><circle r="108" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="60 18 4 18" opacity=".55"/></g>
<circle r="86" fill="none" stroke="currentColor" stroke-width="1" opacity=".35"/>
<g class="o-iris"><circle r="62" fill="url(#orpg)" opacity=".55"/><circle r="40" fill="none" stroke="currentColor" stroke-width="3" opacity=".9"/>
<circle class="o-pupil" r="14" fill="currentColor"/></g>
<g opacity=".5"><path d="M-150 0H-100M100 0H150M0 -150V-100M0 100V150" stroke="currentColor" stroke-width="1"/></g>
</svg><div class="lbl">ОРФЕЙ</div>`;

export class Dialogue {
  root = el('div', 'dlg hidden');
  private nameEl = el('div', 'name');
  private textEl = el('div', 'text');
  private nextEl = el('div', 'next');
  private modes = el('div', 'modes');
  private orpheus = el('div', 'orpheus');
  private resolveAdvance: (() => void) | null = null;
  private typing = false;
  private finishTyping: (() => void) | null = null;
  auto = false;
  skip = false;
  onLog: (() => void) | null = null;
  onModeChange: (() => void) | null = null;

  constructor(private ui: HTMLElement, private stage: Stage) {
    const rule = el('div', 'rule');
    const inner = el('div', 'inner');
    inner.appendChild(this.textEl);
    this.root.append(rule, this.nameEl, inner, this.nextEl, this.modes);
    this.modes.innerHTML = `<button data-m="log" title="Журнал реплик (L)">ЛОГ</button><button data-m="auto" title="Авточтение (A)">АВТО</button><button data-m="skip" title="Пропуск прочитанного (S)">ПРОПУСК</button>`;
    this.modes.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = (e.target as HTMLElement).closest('button')?.dataset.m;
      if (m === 'auto') this.setAuto(!this.auto);
      if (m === 'skip') this.setSkip(!this.skip);
      if (m === 'log') this.onLog?.();
    });
    this.root.addEventListener('click', () => this.advance());
    this.orpheus.innerHTML = ORPHEUS_SVG;
    ui.append(this.orpheus, this.root);
  }
  setAuto(v: boolean) {
    this.auto = v;
    if (v) this.skip = false;
    this.updateModes();
    if (v && !this.typing) this.advance();
  }
  setSkip(v: boolean) {
    this.skip = v;
    if (v) this.auto = false;
    this.updateModes();
    if (v) this.advance();
  }
  private updateModes() {
    this.modes.querySelector('[data-m=auto]')!.classList.toggle('on', this.auto);
    this.modes.querySelector('[data-m=skip]')!.classList.toggle('on', this.skip);
    this.onModeChange?.();
  }
  hide() {
    this.root.classList.add('hidden');
    this.setOrpheus(false);
  }
  showBox() {
    this.root.classList.remove('hidden');
  }
  setOrpheus(on: boolean, mood = 'idle') {
    this.orpheus.classList.toggle('on', on);
    this.orpheus.dataset.mood = mood;
  }
  advance() {
    if (this.typing) {
      this.finishTyping?.();
      return;
    }
    const r = this.resolveAdvance;
    this.resolveAdvance = null;
    r?.();
  }
  get waiting() {
    return !!this.resolveAdvance || this.typing;
  }

  /** Мгновенно отрисовать реплику без ожидания (контекст при загрузке). */
  render(line: Line) {
    const fake = new Token();
    const prev = settings.textSpeed;
    settings.textSpeed = 0;
    void this.show(line, fake, true).catch(() => undefined);
    settings.textSpeed = prev;
    this.resolveAdvance = null;
    fake.cancel();
  }

  /** Показ реплики; промис завершается, когда игрок переходит дальше. */
  async show(line: Line, token: Token, seen: boolean) {
    const ch = line.speaker ? CHARACTERS[line.speaker] : undefined;
    this.showBox();
    const isOrpheus = line.speaker === 'orpheus';
    this.setOrpheus(isOrpheus, line.expr ?? 'idle');
    // имя
    if (ch && ch.name) {
      this.nameEl.innerHTML = `<b>${escapeHtml(line.name ?? ch.name)}</b><i>${escapeHtml(ch.role)}</i>`;
      this.nameEl.style.setProperty('--c', ch.color);
      this.nameEl.classList.add('on');
    } else if (line.name) {
      this.nameEl.innerHTML = `<b>${escapeHtml(line.name)}</b><i></i>`;
      this.nameEl.style.setProperty('--c', '#b9c0bc');
      this.nameEl.classList.add('on');
    } else this.nameEl.classList.remove('on');
    this.textEl.className = 'text' + (!line.speaker ? ' narr' : line.speaker === 'thought' ? ' thought' : line.speaker === 'sys' ? ' sys' : isOrpheus ? ' orpheus' : '');
    // текст
    const segs = parseMarkup(line.text);
    this.textEl.innerHTML = '';
    const chars: HTMLElement[] = [];
    const pauses = new Map<number, number>();
    for (const s of segs) {
      if (s.pause) {
        pauses.set(chars.length, (pauses.get(chars.length) ?? 0) + s.pause);
        continue;
      }
      const wrap = s.cls ? el('span', s.cls) : null;
      for (const c of s.t) {
        const sp = el('span', 'ch');
        sp.textContent = c;
        chars.push(sp);
        (wrap ?? this.textEl).appendChild(sp);
      }
      if (wrap) this.textEl.appendChild(wrap);
    }
    this.nextEl.classList.remove('on');
    const instant = settings.textSpeed <= 0 || (this.skip && seen);
    const talking = !!(ch?.portrait && this.stage.isShown(line.speaker!));
    if (!instant) {
      this.typing = true;
      if (talking) this.stage.mouth(true);
      let done = false;
      this.finishTyping = () => (done = true);
      const delay = 1000 / Math.max(10, settings.textSpeed);
      const blipKind = ch?.blip ?? 'soft';
      for (let i = 0; i < chars.length; i++) {
        if (token.cancelled) break;
        if (done) break;
        chars[i].classList.add('v');
        const c = chars[i].textContent!;
        if (ch && ch.pitch && /[а-яёa-z0-9]/i.test(c) && i % 2 === 0) audio.blip(ch.pitch, blipKind);
        let d = delay;
        if (/[.!?…]/.test(c)) d = delay * 7;
        else if (/[,;:—]/.test(c)) d = delay * 3.5;
        const p = pauses.get(i + 1);
        if (p) {
          if (talking) this.stage.mouth(false);
          await this.wait(p, () => done);
          if (talking && !done) this.stage.mouth(true);
        }
        await this.wait(d, () => done);
      }
      this.typing = false;
      this.finishTyping = null;
      this.stage.mouth(false);
    }
    for (const c of chars) c.classList.add('v');
    token.check();
    this.nextEl.classList.add('on');
    if (this.skip && seen) {
      await sleep(60, token);
      return;
    }
    if (this.skip && !seen) this.setSkip(false);
    await new Promise<void>((res) => {
      this.resolveAdvance = res;
      token.onCancel(() => res());
      if (this.auto) {
        const len = plainText(line.text).length;
        const t = setTimeout(() => this.resolveAdvance === res && this.advance(), settings.autoDelay * 1000 + len * 28);
        token.onCancel(() => clearTimeout(t));
      }
    });
    this.nextEl.classList.remove('on');
    token.check();
  }
  private wait(ms: number, stop: () => boolean): Promise<void> {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        if (stop() || performance.now() - t0 >= ms) res();
        else setTimeout(step, Math.min(16, ms));
      };
      setTimeout(step, Math.min(ms, 16));
    });
  }
}
