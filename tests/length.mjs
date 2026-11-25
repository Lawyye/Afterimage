// Оценка длительности прохождения по объёму текста одного маршрута.
import { Story } from 'inkjs';
import { compileStory } from '../tools/ink.mjs';
const { json } = compileStory(process.cwd());
let seed = +(process.argv[2] ?? 3);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const results = [];
for (let run = 0; run < 40; run++) {
  const s = new Story(json);
  let chars = 0, lines = 0, choices = 0, waits = 0;
  for (let i = 0; i < 5000; i++) {
    if (s.canContinue) {
      const t = s.Continue().trim();
      for (const tag of s.currentTags ?? []) { const m = /^wait:\s*([\d.]+)/.exec(tag); if (m) waits += +m[1]; if (tag.startsWith('chapter')) waits += 4.6; }
      if (t && t !== '@') { lines++; chars += t.replace(/^[a-z_]+\/?[a-z]*:\s*/, '').length; }
      continue;
    }
    const ch = s.currentChoices.filter((c) => !c.text.startsWith('x:'));
    if (!ch.length) break;
    choices++;
    const done = ch.find((c) => /_done$/.test(c.text));
    const hot = ch.filter((c) => c.text.startsWith('@') && !c.text.startsWith('@@'));
    const exit = ch.find((c) => c.text === '@@exit');
    let pick = done ?? (hot.length ? (exit && rnd() < 0.1 ? exit : hot[Math.floor(rnd() * hot.length)]) : ch.filter((c) => !c.text.startsWith('@@'))[Math.floor(rnd() * ch.filter((c) => !c.text.startsWith('@@')).length)] ?? ch[0]);
    s.ChooseChoiceIndex(pick.index);
  }
  const min = chars / 950 + lines * 0.9 / 60 + choices * 4 / 60 + waits / 60 + 3.5; // чтение + клики + решения + паузы + осмотр/доска/документы
  results.push({ chars, lines, choices, min });
}
const avg = (k) => Math.round(results.reduce((a, r) => a + r[k], 0) / results.length);
console.log('символов', avg('chars'), 'реплик', avg('lines'), 'выборов', avg('choices'), '≈ минут', (results.reduce((a, r) => a + r.min, 0) / results.length).toFixed(1),
  'мин/макс', Math.min(...results.map((r) => r.min)).toFixed(1), Math.max(...results.map((r) => r.min)).toFixed(1));
