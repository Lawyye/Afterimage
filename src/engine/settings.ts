import { Storage2 } from './storage';

export interface Settings {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  voice: number; // «голосовые» блипы при печати текста
  textSpeed: number; // символов в секунду, 0 = мгновенно
  autoDelay: number; // секунды паузы в авто-режиме
  fx: number; // интенсивность CRT/шума 0..1
  glitch: boolean; // вспышки и глитчи (для фоточувствительных можно выключить)
  shake: boolean;
  timers: boolean; // таймеры на выборах
  vibrate: boolean; // вибрация в ключевые моменты (телефоны)
  boxAlpha: number; // непрозрачность окна текста 0.3..1
  rollbackChoices: boolean; // «Назад» может отматывать принятые решения
  textSize: number; // множитель размера текста реплик 0.85..1.3
}

const defaults: Settings = {
  master: 0.8,
  music: 0.7,
  ambience: 0.75,
  sfx: 0.8,
  voice: 0.35,
  textSpeed: 55,
  autoDelay: 1.6,
  fx: 0.7,
  glitch: true,
  shake: true,
  timers: true,
  vibrate: true,
  boxAlpha: 1,
  rollbackChoices: false,
  textSize: 1,
};

type Listener = (s: Settings) => void;
const listeners: Listener[] = [];

export const settings: Settings = { ...defaults, ...Storage2.read<Partial<Settings>>('settings', {}) };

export function saveSettings() {
  Storage2.write('settings', settings);
  for (const l of listeners) l(settings);
}
export function onSettings(l: Listener) {
  listeners.push(l);
  l(settings);
}
export function resetSettings() {
  Object.assign(settings, defaults);
  saveSettings();
}
