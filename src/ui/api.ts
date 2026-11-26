// Связь интерфейсных панелей с игрой без циклических импортов.
import type { LogEntry } from '../engine/meta';

export interface GameApi {
  vars(): Record<string, unknown>;
  setVar(name: string, v: boolean | number): void;
  found(): string[];
  unread: Set<string>;
  log: LogEntry[];
  inGame: boolean;
  canSave(): boolean;
  save(slot: string): boolean;
  load(slot: string): void;
  newGame(): void;
  toTitle(): void;
  resume(): void;
  quickSave(): void;
  quickLoad(): void;
  toast(kind: 'ev' | 'rel' | 'bad' | 'ded', title: string, text: string, icon?: string): void;
}

export const api: { g: GameApi } = { g: null as unknown as GameApi };

/** Общий оверлей с ожиданием закрытия */
export function overlayRoot(): HTMLElement {
  return document.getElementById('overlay')!;
}
