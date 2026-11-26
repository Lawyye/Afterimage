// Мета-прогресс между прохождениями и слоты сохранений.
import { Storage2 } from './storage';
import type { StageSnapshot } from './stage';
import type { Line } from './dialogue';

export interface LogEntry { who: string | null; name?: string; text: string; kind?: 'line' | 'choice' }

export interface SaveData {
  v: 1;
  time: number;
  chapter: number;
  chapterTitle: string;
  clock: string;
  goal: string;
  ink: string;
  stage: StageSnapshot;
  music: string;
  amb: string;
  intensity: number;
  current: { kind: 'line'; line: Line } | { kind: 'choices' };
  log: LogEntry[];
  examined: string[];
  unread: string[];
  runChron: Record<string, Record<string, unknown>>;
  storyHash?: string; // версия сценария, с которой сделано сохранение
}

interface Meta {
  endings: string[];
  chron: Record<string, string[]>; // rowKey -> открытые варианты
  seen: string[];
  runs: number;
  lastSlot: string | null;
  art: string[]; // открытое в галерее: bg:<id>, pt:<id>:<expr>
  tips?: string[]; // показанные подсказки по управлению
}

const meta: Meta = Object.assign({ endings: [], chron: {}, seen: [], runs: 0, lastSlot: null, art: [] }, Storage2.read<Partial<Meta>>('meta', {}));
const seenSet = new Set(meta.seen);
const artSet = new Set(meta.art);
let dirty = false;
function persist() {
  meta.seen = [...seenSet].slice(-6000);
  meta.art = [...artSet];
  Storage2.write('meta', meta);
  dirty = false;
}
setInterval(() => dirty && persist(), 4000);

export const Meta = {
  get data() { return meta; },
  isSeen(h: string) { return seenSet.has(h); },
  markSeen(h: string) { if (!seenSet.has(h)) { seenSet.add(h); dirty = true; } },
  unlockEnding(id: string) { if (!meta.endings.includes(id)) meta.endings.push(id); persist(); },
  discover(row: string, opt: string) {
    const arr = (meta.chron[row] ??= []);
    if (!arr.includes(opt)) { arr.push(opt); persist(); }
  },
  known(row: string) { return meta.chron[row] ?? []; },
  addRun() { meta.runs++; persist(); },
  setLast(slot: string) { meta.lastSlot = slot; persist(); },
  seeArt(key: string) { if (!artSet.has(key)) { artSet.add(key); dirty = true; } },
  hasArt(key: string) { return artSet.has(key); },
  /** Подсказку показываем один раз за всё время: true — если её ещё не было (и она отмечается показанной) */
  firstTip(key: string) { const t = (meta.tips ??= []); if (t.includes(key)) return false; t.push(key); persist(); return true; },
  flush: persist,
};

export const SLOTS = ['auto', 'quick', 's1', 's2', 's3', 's4', 's5'];
/** Контрольные точки начала глав последнего прохождения (для выбора главы) */
export const CHAPTER_SLOTS = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4'];
export const Saves = {
  read(slot: string): SaveData | null { return Storage2.read<SaveData | null>('save.' + slot, null); },
  write(slot: string, d: SaveData) { const ok = Storage2.write('save.' + slot, d); Meta.setLast(slot); return ok; },
  remove(slot: string) { Storage2.remove('save.' + slot); },
  latest(): string | null {
    let best: string | null = null, t = 0;
    for (const s of SLOTS) { const d = this.read(s); if (d && d.time > t) { t = d.time; best = s; } }
    return best;
  },
};
