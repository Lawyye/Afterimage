// Озвучка ОРФЕЯ, объявлений терминалов и кат-сцен (tools/voice). Ключ — хеш «роль:текст».
import clips from 'virtual:voice';
import durations from '../../assets/voice/index.json';
import { hash } from './util';

const DUR = durations as Record<string, number>;

export const voKey = (role: string, text: string): string => hash(role + ':' + text);
export const hasVo = (key: string): boolean => key in clips;
export const voUrl = (key: string): string | undefined => clips[key];
export const voDuration = (key: string): number => DUR[key] ?? 0;
/** ключ озвучки для реплики сценария или null, если она не озвучена */
export function lineVo(speaker: string | null, text: string): string | null {
  if (speaker !== 'orpheus' && speaker !== 'sys') return null;
  const k = voKey(speaker, text);
  return hasVo(k) ? k : null;
}
