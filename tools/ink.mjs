// Компиляция сценария ink. Файлы склеиваются по порядку из story/order.txt,
// чтобы номера строк в ошибках можно было сопоставить с исходниками.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Compiler } from 'inkjs/full';

export function loadSources(root) {
  const order = readFileSync(join(root, 'story/order.txt'), 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  const parts = [];
  const map = []; // [startLine, file]
  let line = 1;
  for (const f of order) {
    const p = join(root, 'story', f);
    const src = readFileSync(p, 'utf8').replace(/\r/g, '');
    map.push([line, f]);
    parts.push(src.endsWith('\n') ? src : src + '\n');
    line += src.split('\n').length - (src.endsWith('\n') ? 1 : 0);
  }
  return { source: parts.join(''), map, files: order.map((f) => join(root, 'story', f)) };
}

function locate(map, n) {
  let cur = map[0];
  for (const m of map) if (m[0] <= n) cur = m;
  return `${cur[1]}:${n - cur[0] + 1}`;
}

export function compileStory(root) {
  const { source, map, files } = loadSources(root);
  const errors = [];
  const warnings = [];
  const fix = (msg) =>
    msg.replace(/line (\d+)/g, (_, n) => `line ${n} (${locate(map, Number(n))})`);
  let json = null;
  try {
    const c = new Compiler(source);
    const story = c.Compile();
    for (const e of c.errors) errors.push(fix(e));
    for (const w of c.warnings) warnings.push(fix(w));
    if (story && !errors.length) json = story.ToJson();
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e));
  }
  return { json, errors, warnings, files, source };
}
