// Оркестратор: исполняет сценарий ink, обрабатывает теги режиссуры,
// управляет сценой, диалогами, выборами, сохранениями и мета-прогрессом.
import { Story } from 'inkjs';
import { el, escapeHtml, hash, sleep, Token, Cancelled } from './util';
import { audio } from './audio';
import { settings } from './settings';
import { Stage, Side, hasPortrait } from './stage';
import { Dialogue, Line, plainText } from './dialogue';
import { ChoiceUI, Investigation, parseChoice } from './choices';
import { Meta, Saves, SaveData, LogEntry } from './meta';
import { CHARACTERS } from '../data/characters';
import { EV_BY_ID, EVIDENCE } from '../data/evidence';
import { DEDUCTIONS } from '../data/board';
import { CHRONICLE } from '../data/chronicle';
import { api, GameApi } from '../ui/api';
import { openDoc, docOpen } from '../ui/docs';
import { openCCTV } from '../ui/cctv';
import { openBoard } from '../ui/board';
import { openJournal, openLog, openChronicle, panelOpen, closePanel } from '../ui/panels';
import { showTitle, closeTitle, togglePause, pauseOpen, closePause, chapterCard, endingCard, intro } from '../ui/menus';
import { icon } from '../ui/icons';
import { toggleFullscreen } from '../ui/fullscreen';

/** Снимок состояния: то же, что сохранение, плюс таймер выбора */
type Snapshot = SaveData & { last?: Line | null; timer?: number };

const LINE_RE = /^([a-z]+)(_)?(?:\/([a-z]+))?:\s*([\s\S]*)$/;

function parseLine(text: string, tags: string[]): Line & { voiceOnly: boolean } {
  const m = LINE_RE.exec(text);
  if (m && CHARACTERS[m[1]]) {
    const id = m[1];
    const sp = id === 'voice' ? null : id;
    return { speaker: sp, expr: m[3] ?? null, text: m[4].trim(), tags, voiceOnly: !!m[2], name: id === 'voice' ? 'Голос' : undefined };
  }
  return { speaker: null, expr: null, text, tags, voiceOnly: false };
}

const ORDER_PRE = new Set(['bg', 'show', 'hide', 'expr', 'pose', 'music', 'amb', 'sfx', 'rain', 'fx', 'flash', 'shake', 'bars', 'fade', 'wait', 'time', 'goal', 'chapter', 'flashpt', 'autosave', 'timer', 'intro', 'cam', 'layer']);
const ORDER_POST = new Set(['doc', 'cctv', 'board', 'chronicle', 'ending']);

export class Game implements GameApi {
  story: Story;
  ui = document.getElementById('ui')!;
  stage = new Stage();
  dialogue: Dialogue;
  choices: ChoiceUI;
  investigation: Investigation;
  token = new Token();
  inGame = false;
  log: LogEntry[] = [];
  unread = new Set<string>();
  examined = new Set<string>();
  runChron: Record<string, Record<string, unknown>> = {};
  private hud = el('div', 'hud hidden');
  private toasts = el('div', 'toasts');
  private chapter = 0;
  private chapterTitle = 'Пролог';
  private clock = '';
  private goal = '';
  private lastLine: Line | null = null;
  private atChoices = false;
  private pendingTimer = 0;
  private autosavePending = false;
  private chapterCheckpoint = false;
  private history: Snapshot[] = []; // снимки для «Назад»
  private busy = false; // блокирующие оверлеи
  private suppressToasts = false;
  private varNames: string[] = [];

  constructor(json: unknown) {
    this.story = new Story(json as never);
    this.story.onError = (msg: string) => console.error('[ink]', msg);
    this.dialogue = new Dialogue(this.ui, this.stage);
    this.choices = new ChoiceUI(this.ui);
    this.investigation = new Investigation(this.ui, this.stage);
    this.dialogue.onLog = () => openLog();
    ChoiceUI.paused = () => pauseOpen() || panelOpen() || docOpen() || !!document.querySelector('.confirm');
    this.dialogue.onQuick = (m) => (m === 'back' ? this.rollback() : m === 'hide' ? this.hideUi() : m === 'qsave' ? this.quickSave() : this.quickLoad());
    this.stage.onSeen = (key) => Meta.seeArt(key);
    this.ui.append(this.hud, this.toasts);
    this.buildHud();
    this.collectVarNames();
    this.observe();
    this.bindInput();
    api.g = this;
  }

  // -------------------------------------------------------------- vars
  private collectVarNames() {
    const vs = this.story.variablesState as unknown as { _globalVariables?: Map<string, unknown> };
    this.varNames = vs._globalVariables ? [...vs._globalVariables.keys()] : [];
  }
  vars(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const n of this.varNames) out[n] = this.story.variablesState.$(n);
    out.__runChron = this.runChron;
    return out;
  }
  setVar(name: string, v: boolean | number) {
    this.story.variablesState.$(name, v);
    if (name.startsWith('ded_') && v) {
      const d = DEDUCTIONS.find((x) => 'ded_' + x.id === name);
      if (d) this.toast('ded', 'Вывод', d.question);
    }
  }
  found(): string[] {
    return EVIDENCE.filter((e) => this.story.variablesState.$('ev_' + e.id) === true).map((e) => e.id);
  }
  private observe() {
    for (const e of EVIDENCE) {
      this.story.ObserveVariable('ev_' + e.id, (_n: string, val: unknown) => {
        if (val === true && !this.suppressToasts) {
          this.unread.add(e.id);
          this.toast('ev', e.kind === 'показание' ? 'Показание' : e.kind === 'документ' ? 'Документ' : 'Улика', e.title, e.icon);
          audio.sfx('evidence', 0.8);
          this.hud.querySelector('[data-b=journal]')?.classList.add('new');
        }
      });
    }
    const rel = (name: string, who: string) => {
      let prev = 0;
      this.story.ObserveVariable(name, (_n: string, val: unknown) => {
        const v = val as number;
        if (!this.suppressToasts && v !== prev) this.toast(v > prev ? 'rel' : 'bad', who, v > prev ? 'Доверие растёт' : 'Доверие падает', v > prev ? 'up' : 'down');
        prev = v;
      });
    };
    this.story.ObserveVariable('ending', (_n: string, val: unknown) => {
      if (val) { this.goal = ''; this.hud.classList.add('hidden'); }
    });
    rel('trust_leo', 'Лео Варга');
    rel('trust_orpheus', 'ОРФЕЙ');
  }

  toast(kind: 'ev' | 'rel' | 'bad' | 'ded', title: string, text: string, ic?: string) {
    const t = el('div', 'toast' + (kind === 'ev' ? '' : ' ' + kind));
    const glyph = ic === 'up' ? '▲' : ic === 'down' ? '▼' : '';
    t.innerHTML = `<div class="ic">${glyph || (ic ? icon(ic, 'currentColor') : '◆')}</div><div><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></div>`;
    this.toasts.appendChild(t);
    // не больше трёх уведомлений разом — старые уходят
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), 5000);
  }

  // -------------------------------------------------------------- HUD & input
  private buildHud() {
    this.hud.innerHTML = `<div class="clock"><span class="t">--:--</span><small></small></div><div class="chap"></div><div class="goal"></div>
      <div class="btns"><button data-b="journal">ЖУРНАЛ <kbd>J</kbd></button><button data-b="board">ДОСКА <kbd>B</kbd></button><button data-b="log">ЛОГ <kbd>L</kbd></button><button data-b="menu">МЕНЮ <kbd>ESC</kbd></button><button data-b="fs" title="Полный экран (F)">⛶</button></div>`;
    this.hud.querySelector('.btns')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')?.dataset.b;
      if (b) this.hudAction(b);
    });
  }
  private hudAction(b: string) {
    if (b === 'fs') { void toggleFullscreen().then((err) => err && this.toast('bad', 'Полный экран', err)); return; }
    if (!this.inGame || this.busy) return;
    audio.sfx('click');
    if (b === 'journal') { this.hud.querySelector('[data-b=journal]')?.classList.remove('new'); openJournal(); }
    if (b === 'board') openBoard(false);
    if (b === 'log') openLog();
    if (b === 'menu') togglePause();
    if (b === 'fs') void toggleFullscreen().then((err) => err && this.toast('bad', 'Полный экран', err));
  }
  private updateHud() {
    (this.hud.querySelector('.clock .t') as HTMLElement).textContent = this.clock || '--:--';
    const left = this.minutesToDawn();
    (this.hud.querySelector('.clock small') as HTMLElement).innerHTML = left !== null ? `СВЕРКА 06:00 · <b>${Math.floor(left / 60)} Ч ${String(left % 60).padStart(2, '0')} МИН</b>` : '';
    (this.hud.querySelector('.chap') as HTMLElement).innerHTML = `${this.chapter === 0 ? 'ПРОЛОГ' : 'ГЛАВА ' + this.chapter}<b>${escapeHtml(this.chapterTitle)}</b>`;
    const g = this.hud.querySelector('.goal') as HTMLElement;
    g.innerHTML = this.goal ? `<b>ЦЕЛЬ</b>${escapeHtml(this.goal)}` : '';
    g.classList.toggle('on', !!this.goal);
  }
  private minutesToDawn(): number | null {
    const m = /^(\d\d):(\d\d)$/.exec(this.clock);
    if (!m) return null;
    let t = +m[1] * 60 + +m[2];
    if (t >= 22 * 60) t -= 24 * 60;
    if (t > 6 * 60) return null;
    return 6 * 60 - t;
  }
  private bindInput() {
    const advance = () => {
      if (this.stage.uiHidden) { this.stage.setUiHidden(false); return; }
      if (!this.inGame || this.busy || pauseOpen() || panelOpen() || docOpen()) return;
      this.dialogue.advance();
    };
    document.getElementById('world')!.addEventListener('click', advance);
    window.addEventListener('keydown', (e) => {
      if (!this.inGame) return;
      const k = e.key.toLowerCase();
      if (this.stage.uiHidden) { e.preventDefault(); this.stage.setUiHidden(false); return; }
      if (e.key === 'F5' || e.key === 'F9') {
        e.preventDefault();
        if (!pauseOpen() && !panelOpen() && !docOpen()) { if (e.key === 'F5') this.quickSave(); else this.quickLoad(); }
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpen() || docOpen()) return;
        if (!this.busy || pauseOpen()) togglePause();
        return;
      }
      if (pauseOpen() || panelOpen() || docOpen() || this.busy) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
      else if (k === 'j' || k === 'о') this.hudAction('journal');
      else if (k === 'b' || k === 'и') this.hudAction('board');
      else if (k === 'l' || k === 'д') this.hudAction('log');
      else if (k === 'a' || k === 'ф') this.dialogue.setAuto(!this.dialogue.auto);
      else if (k === 's' || k === 'ы') this.dialogue.setSkip(!this.dialogue.skip);
      else if (e.key === 'Control') this.dialogue.setSkip(true);
      else if (k === 'f' || k === 'а') this.hudAction('fs');
      else if (k === 'h' || k === 'р') this.hideUi();
      else if (e.key === 'Backspace' || e.key === 'PageUp') { e.preventDefault(); this.rollback(); }
    });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control' && this.inGame) this.dialogue.setSkip(false); });
    window.addEventListener('wheel', (e) => { if (this.inGame && e.deltaY < 0 && !panelOpen() && !this.busy && !pauseOpen()) openLog(); }, { passive: true });
  }

  // -------------------------------------------------------------- lifecycle
  title() {
    this.inGame = false;
    this.stage.setUiHidden(false);
    this.hud.classList.add('hidden');
    this.dialogue.hide();
    this.stage.reset();
    showTitle(() => this.newGame(), (slot) => this.load(slot));
  }
  private beginRun() {
    this.token.cancel();
    this.token = new Token();
    closeTitle();
    closePause();
    closePanel();
    this.ui.querySelectorAll('.choices,.inv-banner,.inv-list,.inv-exit,.chapter-card').forEach((n) => n.remove());
    this.stage.hotspotLayer.innerHTML = '';
    document.querySelectorAll('.hs-svg').forEach((n) => n.remove());
    this.inGame = true;
    this.busy = false;
    this.stage.setUiHidden(false);
    this.stage.stage.classList.remove('inv-mode');
    this.hud.classList.remove('hidden');
    return this.token;
  }
  newGame() {
    const token = this.beginRun();
    this.history = [];
    this.suppressToasts = true;
    this.story.ResetState();
    this.suppressToasts = false;
    this.log = [];
    this.unread.clear();
    this.examined.clear();
    this.runChron = {};
    this.chapter = 0; this.chapterTitle = 'Бессонница'; this.clock = ''; this.goal = '';
    this.lastLine = null;
    this.stage.reset();
    this.dialogue.hide();
    this.updateHud();
    void this.run(token);
  }
  load(slot: string) {
    const d = Saves.read(slot);
    if (!d) return;
    this.history = [];
    this.restore(d, false);
  }
  /** Восстановить состояние из сохранения или снимка «Назад» (quiet — без уведомления, текст сразу целиком) */
  private restore(d: Snapshot, quiet: boolean) {
    const token = this.beginRun();
    this.suppressToasts = true;
    try {
      this.story.state.LoadJson(d.ink);
      // сохранения старых версий: «представились» все, с кем уже встречались после второй главы
      const V = this.story.variablesState;
      if ((V.$('chapter') as number) >= 3) for (const id of ['leo', 'kessler']) if (V.$(id + '_met') && !V.$(id + '_named')) V.$(id + '_named', true);
    } finally { this.suppressToasts = false; }
    this.log = d.log ?? [];
    this.unread = new Set(d.unread ?? []);
    this.examined = new Set(d.examined ?? []);
    this.runChron = d.runChron ?? {};
    this.chapter = d.chapter; this.chapterTitle = d.chapterTitle; this.clock = d.clock; this.goal = d.goal;
    this.stage.restore(d.stage);
    audio.setIntensity(d.intensity);
    audio.music(d.music, d.intensity, 1);
    audio.ambience(d.amb, 1);
    this.updateHud();
    if (!quiet) this.toast('ev', 'Загружено', `${d.chapterTitle} · ${d.clock}`);
    this.pendingTimer = d.timer ?? 0;
    const last = d.last ?? null;
    void this.run(token, d.current.kind === 'line' ? d.current.line : null, d.current.kind === 'choices' ? last : null, quiet);
  }
  /** «Назад»: вернуться к предыдущей реплике. Через принятые решения — только если это разрешено в настройках. */
  rollback() {
    if (!this.inGame || this.busy || pauseOpen() || panelOpen() || docOpen()) return;
    // на экране выбора «Назад» возвращает реплику, которая видна под вариантами
    if (this.atChoices) {
      if (this.history[this.history.length - 1]?.current.kind === 'choices') this.history.pop();
      const line = this.history.pop();
      if (line) { audio.sfx('back', 0.6); this.restore(line, true); }
      return;
    }
    if (this.history.length < 2) {
      audio.sfx('wrong');
      this.toast('bad', 'Назад', settings.rollbackChoices ? 'Дальше назад нельзя.' : 'Решение уже принято — его не отменить. Перемотку через решения можно включить в настройках.');
      return;
    }
    audio.sfx('back', 0.6);
    this.history.pop();
    this.restore(this.history.pop()!, true);
  }
  private snapshot(): Snapshot {
    return {
      v: 1, time: Date.now(), chapter: this.chapter, chapterTitle: this.chapterTitle, clock: this.clock, goal: this.goal,
      ink: this.story.state.toJson(), stage: this.stage.snapshot(), music: audio.currentMusic, amb: audio.currentAmb, intensity: audio.intensity,
      current: this.atChoices ? { kind: 'choices' } : { kind: 'line', line: this.lastLine! },
      log: this.log.slice(-200), examined: [...this.examined], unread: [...this.unread], runChron: JSON.parse(JSON.stringify(this.runChron)),
      last: this.lastLine,
    };
  }
  private pushHistory(timer = 0) {
    const s = this.snapshot();
    if (timer) s.timer = timer;
    this.history.push(s);
    if (this.history.length > 80) this.history.shift();
  }
  /** Отладка/тесты: начать с указанного узла сценария */
  jump(path: string, vars: Record<string, boolean | number> = {}) {
    const token = this.beginRun();
    this.history = [];
    this.story.ResetState();
    for (const [k, v] of Object.entries(vars)) this.story.variablesState.$(k, v);
    this.story.ChoosePathString(path);
    this.stage.reset();
    void this.run(token);
  }
  toTitle() {
    this.token.cancel();
    this.title();
  }
  resume() { /* пауза закрывается сама */ }
  /** Спрятать окно текста и интерфейс (касание или любая клавиша — вернуть) */
  hideUi() {
    if (!this.inGame || this.busy || this.atChoices || !this.dialogue.waiting) return;
    this.dialogue.setAuto(false);
    this.dialogue.setSkip(false);
    this.stage.setUiHidden(true);
  }
  quickSave() {
    if (!this.inGame || this.busy) return;
    if (!this.canSave() || !this.save('quick')) { this.toast('bad', 'Быстрое сохранение', 'Сейчас сохранить нельзя.'); audio.sfx('wrong'); return; }
    audio.sfx('confirm');
    this.toast('ev', 'Быстрое сохранение', `${this.chapterTitle} · ${this.clock || '--:--'}`);
  }
  quickLoad() {
    if (this.busy) return;
    if (!Saves.read('quick')) { this.toast('bad', 'Быстрая загрузка', 'Быстрого сохранения пока нет.'); audio.sfx('wrong'); return; }
    audio.sfx('confirm');
    this.load('quick');
  }
  /** Автосохранение + контрольная точка начала главы */
  private autosave() {
    this.save('auto');
    if (this.chapterCheckpoint) { this.chapterCheckpoint = false; this.save('ch' + this.chapter); }
  }
  canSave() {
    return this.inGame && !this.busy && (this.atChoices || !!this.lastLine);
  }
  save(slot: string): boolean {
    if (!this.canSave()) return false;
    return Saves.write(slot, this.snapshot());
  }

  // -------------------------------------------------------------- main loop
  private async run(token: Token, resumeLine: Line | null = null, contextLine: Line | null = null, instant = false) {
    try {
      if (resumeLine) await this.showLine(resumeLine, token, !!(resumeLine as Line & { voiceOnly?: boolean }).voiceOnly, true, instant);
      else if (contextLine) await this.showLine(contextLine, token, false, false);
      while (!token.cancelled) {
        if (this.story.canContinue) {
          const text = (this.story.Continue() ?? '').trim();
          const tags = (this.story.currentTags ?? []).map((t) => t.trim());
          const line = parseLine(text, tags);
          // «???» вместо имени, пока персонаж не представился
          if (line.speaker && this.story.variablesState.$(line.speaker + '_named') === false) { line.name = '???'; line.anon = true; }
          const post = await this.preTags(tags, token);
          if (line.text && line.text !== '@') await this.showLine(line, token, line.voiceOnly);
          for (const t of post) await this.postTag(t, token);
        } else if (this.story.currentChoices.length) {
          const idx = await this.presentChoices(token);
          token.check();
          this.story.ChooseChoiceIndex(idx);
        } else {
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        console.error(e);
        this.toast('bad', 'Ошибка', String((e as Error).message ?? e));
      }
    }
  }

  private async showLine(line: Line, token: Token, voiceOnly: boolean, wait = true, instant = false) {
    this.atChoices = false;
    const sp = line.speaker;
    if (sp && hasPortrait(sp) && !voiceOnly) {
      if (!this.stage.isShown(sp)) this.stage.show(sp, line.expr ?? 'neutral');
      else if (line.expr) this.stage.setExpr(sp, line.expr);
    }
    this.stage.setSpeaker(sp && hasPortrait(sp) && !voiceOnly ? sp : null);
    this.lastLine = line;
    const h = hash(line.text);
    const seen = Meta.isSeen(h);
    if (wait) {
      this.pushHistory();
      this.log.push({ who: sp, name: line.name, text: line.text });
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    }
    if (this.autosavePending) {
      this.autosavePending = false;
      this.autosave();
    }
    if (!wait) {
      this.dialogue.render(line);
      return;
    }
    await this.dialogue.show(line, token, seen, instant);
    Meta.markSeen(h);
  }

  private async preTags(tags: string[], token: Token): Promise<string[]> {
    const post: string[] = [];
    for (const raw of tags) {
      const i = raw.indexOf(':');
      const key = (i >= 0 ? raw.slice(0, i) : raw).trim();
      const val = i >= 0 ? raw.slice(i + 1).trim() : '';
      if (ORDER_POST.has(key)) { post.push(raw); continue; }
      if (!ORDER_PRE.has(key)) { console.warn('unknown tag', raw); continue; }
      const a = val.split(/\s+/);
      switch (key) {
        case 'bg': this.stage.setBg(a[0] === 'none' ? null : a[0], a[1] ? parseFloat(a[1]) : 1.2); break;
        case 'show': this.stage.show(a[0], a[1] ?? 'neutral', (a[2] as Side) ?? undefined); break;
        case 'hide': this.stage.hide(a[0] || 'all'); this.stage.setSpeaker(null); break;
        case 'expr': this.stage.setExpr(a[0], a[1]); break;
        case 'pose': this.stage.setPose(a[0], a[1] && a[1] !== 'idle' ? a[1] : ''); break;
        case 'music': audio.music(a[0], a[1] ? parseFloat(a[1]) : undefined, a[0] === 'off' ? (a[1] ? parseFloat(a[1]) : 2) : 3); break;
        case 'layer': audio.setIntensity(parseFloat(a[0])); break;
        case 'amb': audio.ambience(a[0], a[1] ? parseFloat(a[1]) : 2); break;
        case 'sfx': audio.sfx(a[0]); break;
        case 'rain': this.stage.setRain(a[0] as never); break;
        case 'fx':
          if (a[0] === 'glitch') { this.stage.glitch.burst(parseFloat(a[1] ?? '0.6'), 300 + parseFloat(a[1] ?? '0.6') * 500); }
          if (a[0] === 'memory') this.stage.setMemory(a[1] === 'on');
          break;
        case 'flash': this.stage.flash(a[0] === 'red' ? '#ff2a3a' : '#ffffff', 700); break;
        case 'shake': this.stage.shake(parseFloat(a[0] || '1')); break;
        case 'bars': this.stage.setBars(a[0] === 'on'); break;
        case 'fade': await this.stage.fade(a[0] === 'black' ? 'black' : 'clear', parseFloat(a[1] ?? '1'), token); break;
        case 'wait': this.dialogue.hide(); await sleep(parseFloat(a[0]) * 1000, token); break;
        case 'time': this.clock = val; this.updateHud(); break;
        case 'goal': this.goal = val; this.updateHud(); break;
        case 'cam': this.stage.push(a[0] === 'push'); break;
        case 'timer': this.pendingTimer = parseFloat(a[0]); break;
        case 'autosave': this.autosavePending = true; this.chapterCheckpoint = true; break;
        case 'flashpt': {
          // вспышка лица; если персонаж уже на сцене — не уводим его с места, а только меняем эмоцию на миг
          if (this.stage.isShown(a[0])) {
            const prev = this.stage.snapshot().portraits.find((p) => p.id === a[0])!.expr;
            this.stage.setExpr(a[0], a[1] ?? 'neutral');
            this.stage.glitch.burst(0.8, 500);
            await sleep(420, token);
            this.stage.setExpr(a[0], prev);
          } else {
            this.stage.show(a[0], a[1] ?? 'neutral', 'center');
            this.stage.glitch.burst(0.8, 500);
            await sleep(420, token);
            this.stage.hide(a[0]);
            this.stage.forgetSide(a[0]);
          }
          break;
        }
        case 'chapter': {
          const parts = val.split(' / ');
          this.chapter = parseInt(parts[0], 10);
          this.chapterTitle = (parts[1] ?? '').trim();
          this.dialogue.hide();
          this.stage.setSpeaker(null);
          this.busy = true;
          try { await chapterCard(val, token); } finally { this.busy = false; }
          this.updateHud();
          break;
        }
        case 'intro': {
          this.hud.classList.add('hidden');
          this.busy = true;
          try { await intro(token); } finally { this.busy = false; }
          this.hud.classList.remove('hidden');
          break;
        }
      }
      token.check();
    }
    return post;
  }

  private async postTag(raw: string, token: Token) {
    const i = raw.indexOf(':');
    const key = (i >= 0 ? raw.slice(0, i) : raw).trim();
    const val = i >= 0 ? raw.slice(i + 1).trim() : '';
    this.busy = true;
    try {
      if (key === 'doc') await openDoc(val);
      else if (key === 'cctv') {
        const marked = await openCCTV(val === 'lobby_restored' ? 'lobby_restored' : 'lobby');
        if (marked && val === 'lobby') this.story.variablesState.$('ev_cctv', true);
      } else if (key === 'board') {
        this.dialogue.hide();
        await openBoard(true);
      } else if (key === 'chronicle') {
        this.snapshotChronicle(parseInt(val, 10));
        this.dialogue.hide();
        await openChronicle(this.runChron);
      } else if (key === 'ending') {
        await this.finishEnding(val, token);
      }
    } finally {
      this.busy = false;
    }
    token.check();
  }

  private snapshotChronicle(n: number) {
    const v = this.vars();
    delete v.__runChron;
    this.runChron[String(n)] = v;
    const ch = CHRONICLE[n];
    if (!ch) return;
    for (const row of ch.rows) for (const o of row.opts) if (o.when(v as never)) Meta.discover(row.id, o.id);
  }

  private async finishEnding(id: string, token: Token) {
    this.snapshotChronicle(4);
    Meta.unlockEnding(id);
    Meta.addRun();
    this.dialogue.hide();
    this.hud.classList.add('hidden');
    const found = this.found().length;
    const ded = DEDUCTIONS.filter((d) => this.story.variablesState.$('ded_' + d.id)).length;
    await sleep(1200, token);
    audio.music('ending', 0.4, 3);
    await endingCard(id, `УЛИК НАЙДЕНО: ${found} / ${EVIDENCE.length}   ·   ВЫВОДОВ: ${ded} / ${DEDUCTIONS.length}   ·   КОНЦОВОК ОТКРЫТО: ${Meta.data.endings.length} / 6`);
    this.toTitle();
    throw new Cancelled();
  }

  private async presentChoices(token: Token): Promise<number> {
    const parsed = this.story.currentChoices.map((c, i) => parseChoice(c.text, i));
    this.atChoices = true;
    if (this.autosavePending) { this.autosavePending = false; this.autosave(); }
    // служебные «готово» после оверлеев выбираются автоматически
    const auto = parsed.find((c) => c.kind === 'system' && /_done$/.test(c.id!));
    if (auto) { this.atChoices = false; return auto.index; }
    const timer = this.pendingTimer;
    this.pendingTimer = 0;
    if (settings.rollbackChoices) this.pushHistory(timer);
    this.stage.mouth(false);
    let idx: number;
    if (parsed.some((c) => c.kind === 'hotspot')) {
      this.dialogue.hide();
      this.stage.setSpeaker(null);
      idx = await this.investigation.present(parsed, this.stage.bgId ?? '', this.examined, token, (this.story.variablesState.$('inv_limit') as number) || 0);
    } else {
      if (this.dialogue.skip) this.dialogue.setSkip(false);
      if (this.dialogue.auto) this.dialogue.setAuto(false);
      idx = await this.choices.present(parsed, timer, token);
      const c = parsed[idx];
      if (c.kind === 'normal') this.log.push({ who: null, text: c.text, kind: 'choice' });
    }
    this.atChoices = false;
    // решение принято: без разрешения в настройках назад через него не отмотать
    if (!settings.rollbackChoices) this.history = [];
    return idx;
  }
}

export function lineText(l: Line) { return plainText(l.text); }
export { EV_BY_ID };
