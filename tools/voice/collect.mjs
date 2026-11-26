// Собирает всё, что нужно озвучить: реплики ОРФЕЯ и объявления терминалов из сценария
// (все варианты, встреченные симулятором: .art-cache/tts/lines.json), фразы кат-сцен и заставки глав.
// Результат: .art-cache/tts/all.json — [{ key, role, text }], key = hash(«роль:текст») как в движке.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { compileStory } from '../ink.mjs';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

const r = await build({ entryPoints: ['src/data/cinema.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const cinema = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

// объявления терминалов, которые звучат голосом; записки, надписи и номера остаются только текстом
const SYS_VOICED = [/^ВХОДЯЩИЙ ВЫЗОВ/, /^ТАКСИ ОЖИДАЕТ/, /ПОВРЕЖДЕНИЕ ЗАПИСИ/, /^СЛУЖЕБНЫЙ КАНАЛ/, /^СВЕРКА: ЗАВЕРШЕНА/, /^МЁРТВЫЕ НЕ ЛГУТ/];

const items = new Map();
const add = (role, text) => { const key = hash(role + ':' + text); if (!items.has(key)) items.set(key, { key, role, text }); };

for (const l of JSON.parse(readFileSync('.art-cache/tts/lines.json', 'utf8'))) {
  if (l.speaker === 'orpheus') add('orpheus', l.text);
  else if (l.speaker === 'sys' && SYS_VOICED.some((re) => re.test(l.text))) add('sys', l.text);
}
for (const v of cinema.cinemaLines()) add(v.role, v.text);
const { source } = compileStory('.');
for (const m of source.matchAll(/#\s*chapter:\s*(\d+)\s*\/\s*([^/#\n]+)/g)) add('narrator', cinema.chapterVo(parseInt(m[1], 10), m[2]));

const all = [...items.values()];
writeFileSync('.art-cache/tts/all.json', JSON.stringify(all, null, 1));
const by = all.reduce((a, x) => ((a[x.role] = (a[x.role] ?? 0) + 1), a), {});
console.log(`[voice] к озвучке: ${all.length}`, by);
