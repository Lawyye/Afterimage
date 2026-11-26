// Проверка после правки текста сценария: структура (узлы, выборы, условия, переменные, переходы,
// теги режиссуры, говорящие и их эмоции) должна совпадать с исходной; меняться может только текст.
// node tools/storycheck.mjs <папка-оригинала>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const orig = process.argv[2];
let bad = 0;
const skeleton = (src) => {
  const out = [];
  for (let raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const tags = [...line.matchAll(/#\s*([^#]+)/g)].map((m) => m[1].trim());
    const diverts = [...line.matchAll(/->\s*([\w.]+)/g)].map((m) => '->' + m[1]);
    const conds = [...line.matchAll(/\{\s*([^:}]+?)\s*:/g)].map((m) => '{' + m[1].replace(/\s+/g, ' '));
    const sp = /^(?:[*+]\s*(?:\{[^}]*\}\s*)*\[[^\]]*\]\s*)?(?:-\s*)?([a-z]+_?(?:\/[a-z]+)?):/.exec(line.replace(/^[*+-]\s*[*+-]?\s*/, ''));
    let kind = '';
    if (/^={2,3}/.test(line)) kind = line.replace(/\s+/g, ' ');
    else if (/^=\s/.test(line)) kind = line.replace(/\s+/g, ' ');
    else if (/^~/.test(line)) kind = line.replace(/\s+/g, ' ');
    else if (/^[*+]/.test(line)) {
      const m = /^([*+\s]+)((?:\{[^}]*\}\s*)*)\[([^\]]*)\]/.exec(line);
      const t = m ? m[3] : '';
      const sys = t.startsWith('@') ? t : t.startsWith('x:') ? 'x' : t.startsWith('!') ? '!' : 'choice';
      kind = 'CH ' + (m ? m[1].replace(/\s/g, '') + ' ' + m[2].replace(/\s+/g, ' ') : '?') + ' ' + sys;
    } else if (/^-\s/.test(line) || line === '-') kind = 'GATHER';
    else if (/^[{}]|^-\s*(else)?\s*:/.test(line)) kind = 'BR ' + line.replace(/\s+/g, ' ').replace(/:.*$/, ':');
    for (const x of [kind, ...conds, ...diverts, ...tags.map((t) => '#' + t)]) if (x) out.push(x);
    if (sp && !/^(sys|thought)$/.test(sp[1]) || (sp && /^(sys|thought)$/.test(sp[1]))) { /* говорящий учитывается ниже */ }
    if (sp) out.push('SPK ' + sp[1]);
  }
  return out;
};
for (const f of readdirSync(orig).filter((f) => f.endsWith('.ink'))) {
  const a = skeleton(readFileSync(join(orig, f), 'utf8'));
  const b = skeleton(readFileSync(join('story', f), 'utf8'));
  // говорящие могут добавляться/удаляться (строки текста делятся и сливаются) — сравниваем без них
  const A = a.filter((x) => !x.startsWith('SPK')), B = b.filter((x) => !x.startsWith('SPK'));
  let i = 0;
  for (; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) break;
  if (i < Math.max(A.length, B.length)) { bad++; console.log(`${f}: расхождение структуры на элементе ${i}:\n  было:  ${A.slice(i, i + 3).join(' | ')}\n  стало: ${B.slice(i, i + 3).join(' | ')}`); }
  const spA = new Set(a.filter((x) => x.startsWith('SPK'))), spB = new Set(b.filter((x) => x.startsWith('SPK')));
  for (const s of spB) if (!spA.has(s)) { bad++; console.log(`${f}: новый говорящий/эмоция ${s}`); }
  if (!bad) console.log(`${f}: структура совпадает (${A.length} элементов)`);
}
process.exit(bad ? 1 : 0);
