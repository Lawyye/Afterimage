// Безопасная обёртка над localStorage: в приватном режиме или превью хранилище
// может быть недоступно — тогда используем память, и игра продолжает работать.
const PREFIX = 'afterimage.v1.';
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    const k = PREFIX + '__probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
let store: Storage | null | undefined;
function get(): Storage | null {
  if (store === undefined) store = ls();
  return store;
}

export const Storage2 = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = get()?.getItem(PREFIX + key) ?? memory.get(key) ?? null;
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    try {
      get()?.setItem(PREFIX + key, raw);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    memory.delete(key);
    try {
      get()?.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
  persistent(): boolean {
    return !!get();
  },
};
