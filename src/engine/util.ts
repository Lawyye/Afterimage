import { settings } from './settings';
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Токен отмены: при загрузке сохранения текущий прогон сценария прерывается. */
export class Token {
  cancelled = false;
  private listeners: (() => void)[] = [];
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const l of this.listeners) l();
    this.listeners = [];
  }
  onCancel(f: () => void) {
    if (this.cancelled) f();
    else this.listeners.push(f);
  }
  check() {
    if (this.cancelled) throw new Cancelled();
  }
}

export function sleep(ms: number, token?: Token): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => res(), ms);
    token?.onCancel(() => {
      clearTimeout(t);
      rej(new Cancelled());
    });
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Короткая вибрация (Android); тихо ничего не делает, если не поддерживается или выключена. */
export function haptic(pattern: number | number[]) {
  try {
    const n = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof n.vibrate === 'function' && settings.vibrate) n.vibrate(pattern);
  } catch { /* нет вибрации */ }
}
