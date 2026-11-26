// Симулятор сюжета: тысячи случайных прохождений сценария.
// Проверяет: отсутствие ошибок и тупиков, достижимость всех концовок и узлов,
// корректность ссылок на улики, документы, зоны осмотра и выводы.
import { build } from 'esbuild';
import { Story } from 'inkjs';
import { compileStory } from '../tools/ink.mjs';
import { resolve } from 'node:path';

const root = resolve('.');
const { json, errors, warnings, source } = compileStory(root);
if (errors.length) { console.error('Ошибки компиляции:\n' + errors.join('\n')); process.exit(1); }
if (warnings.length) console.warn('Предупреждения:\n' + warnings.join('\n'));

// загрузка игровых данных из TypeScript
async function loadTs(file) {
  const virtualAssets = { name: 'va', setup(b) {
    b.onResolve({ filter: /^virtual:assets$/ }, () => ({ path: 'va', namespace: 'va' }));
    b.onLoad({ filter: /.*/, namespace: 'va' }, () => ({ contents: 'export default {}', loader: 'js' }));
  } };
  const r = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [virtualAssets] });
  const code = r.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { DEDUCTIONS } = await loadTs('src/data/board.ts');
const { EVIDENCE } = await loadTs('src/data/evidence.ts');
const { HOTSPOTS } = await loadTs('src/data/hotspots.ts');
const { DOCS } = await loadTs('src/data/docs.ts');
const { ENDINGS } = await loadTs('src/data/endings.ts');
const { CHRONICLE } = await loadTs('src/data/chronicle.ts');

const problems = [];
// --- статические проверки
const evIds = new Set(EVIDENCE.map((e) => e.id));
for (const m of source.matchAll(/\bev_([a-z_]+)\b/g)) if (!evIds.has(m[1])) problems.push(`Нет данных для улики ev_${m[1]}`);
for (const e of EVIDENCE) if (!source.includes('ev_' + e.id)) problems.push(`Улика ${e.id} не используется в сценарии`);
for (const d of DEDUCTIONS) for (const p of d.pairs) for (const id of p) if (!evIds.has(id)) problems.push(`Вывод ${d.id}: неизвестная улика ${id}`);
for (const d of DEDUCTIONS) if (!source.includes('ded_' + d.id)) problems.push(`Вывод ded_${d.id} не объявлен в сценарии`);
for (const m of source.matchAll(/# doc: ([a-z_]+)/g)) if (!DOCS[m[1]]) problems.push(`Нет документа ${m[1]}`);
for (const e of EVIDENCE) if (e.doc && !DOCS[e.doc]) problems.push(`Улика ${e.id}: нет документа ${e.doc}`);
const KNOWN_TAGS = new Set(['bg', 'show', 'hide', 'expr', 'pose', 'music', 'amb', 'sfx', 'rain', 'fx', 'flash', 'shake', 'bars', 'fade', 'wait', 'time', 'goal', 'chapter', 'flashpt', 'autosave', 'timer', 'intro', 'cam', 'layer', 'doc', 'cctv', 'board', 'chronicle', 'ending']);
const SFX = new Set(['hover', 'click', 'confirm', 'back', 'choice', 'evidence', 'deduction', 'wrong', 'tick', 'timeout', 'glitch', 'static', 'glass', 'heartbeat', 'rig_on', 'rig_off', 'phone', 'door', 'door_slide', 'buzz', 'elevator', 'typing', 'paper', 'camera', 'stinger', 'boom', 'whoosh', 'chapter', 'drip', 'purr', 'gunshot', 'thunder', 'scan', 'breath', 'fall', 'silence_hit', 'crunch']);
const MUSIC = new Set(['title', 'insomnia', 'investigation', 'tension', 'memory', 'grief', 'confront', 'ending', 'open', 'sonya', 'off']);
const AMB = new Set(['rain_out', 'rain_in', 'apartment', 'highrise', 'street', 'canal', 'den', 'office', 'columbarium', 'hall', 'memory', 'stairwell', 'cell', 'dawn', 'taxi', 'off', 'silence']);
const BGS = new Set(['eva_apt', 'courtyard', 'mira_apt', 'canal', 'den', 'mnema', 'columbarium', 'hall', 'stairwell', 'taxi', 'dawn', 'key_art', 'cg_door', 'cg_reading', 'cg_stairs', 'none']);
const CHARS = new Set(['eva', 'voron', 'kessler', 'leo', 'mira', 'sonya', 'hass', 'orpheus', 'sys', 'voice', 'thought']);
const tagSeen = new Set();
function checkTag(t, where) {
  const i = t.indexOf(':');
  const k = (i >= 0 ? t.slice(0, i) : t).trim();
  const v = i >= 0 ? t.slice(i + 1).trim() : '';
  const key = k + ':' + v;
  if (tagSeen.has(key)) return;
  tagSeen.add(key);
  if (!KNOWN_TAGS.has(k)) problems.push(`Неизвестный тег «${t}» (${where})`);
  const a = v.split(/\s+/);
  if (k === 'sfx' && !SFX.has(a[0])) problems.push(`Неизвестный звук ${a[0]}`);
  if (k === 'music' && !MUSIC.has(a[0])) problems.push(`Неизвестная музыка ${a[0]}`);
  if (k === 'amb' && !AMB.has(a[0])) problems.push(`Неизвестная атмосфера ${a[0]}`);
  if (k === 'bg' && !BGS.has(a[0])) problems.push(`Неизвестный фон ${a[0]}`);
  if ((k === 'show' || k === 'expr' || k === 'flashpt' || k === 'pose') && !CHARS.has(a[0])) problems.push(`Неизвестный персонаж ${a[0]}`);
}

// --- прохождения
const endings = {};
const knotsVisited = new Set();
const allKnots = new Set([...source.matchAll(/^===\s*(?:function\s+)?([a-z_0-9]+)/gm)].map((m) => m[1]));
const flagsSeen = {};
const chronSeen = new Set();
let maxSteps = 0, totalLines = 0, runs = 0, deadEnds = 0;

function playthrough(policy, seed) {
  let s = seed;
  // mulberry32: честная 32-битная арифметика (прежний LCG терял точность на больших числах и зацикливался)
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const story = new Story(json);
  let err = null;
  story.onError = (m) => { err = m; };
  let steps = 0, lines = 0;
  const ev = () => EVIDENCE.filter((e) => story.variablesState.$('ev_' + e.id) === true).map((e) => e.id);
  let curBg = null;
  while (steps < 4000) {
    steps++;
    if (story.canContinue) {
      const text = story.Continue();
      lines++;
      const path = story.state.currentPathString;
      if (path) knotsVisited.add(path.split('.')[0]);
      for (const t of story.currentTags ?? []) {
        checkTag(t, path);
        if (t.startsWith('bg:')) curBg = t.slice(3).trim().split(/\s+/)[0];
        if (t.startsWith('cctv: lobby') && t.trim() === 'cctv: lobby' && rnd() < policy.cctv) story.variablesState.$('ev_cctv', true);
        if (t.startsWith('board:')) {
          const found = ev();
          for (const d of DEDUCTIONS) {
            if (d.pairs.some(([a, b]) => found.includes(a) && found.includes(b)) && rnd() < policy.board) story.variablesState.$('ded_' + d.id, true);
          }
        }
      }
      const m = /^([a-z]+)_?(?:\/([a-z]+))?:/.exec(text.trim());
      if (m && !CHARS.has(m[1]) && !/^[a-z]+$/.test('')) problems.push(`Неизвестный говорящий ${m[1]}`);
      // логика: говорит ли тот, кто в этот момент говорить не может
      if (m) {
        const V = (k) => story.variablesState.$(k);
        const where = path ?? '?';
        if (m[1] === 'orpheus' && V('orpheus_cut') && !/подо—/.test(text) && !where.startsWith('end_retouch')) problems.push(`ОРФЕЙ говорит после отключения (${where}): ${text.trim().slice(0, 60)}`);
        if (m[1] === 'leo' && !V('leo_met') && !where.startsWith('leo')) problems.push(`Лео говорит до встречи (${where})`);
        if (V(m[1] + '_named') === false && V(m[1] + '_met') && !where.startsWith(m[1])) problems.push(`${m[1]} так и не представился, но говорит в ${where}`);
        if (m[1] === 'kessler' && !V('kessler_met') && !where.startsWith('kessler')) problems.push(`Кесслер говорит до встречи (${where})`);
        if (m[1] === 'hass' && !V('hass_met') && !where.startsWith('leo') && !where.startsWith('end_clean')) problems.push(`Хаас говорит до встречи (${where})`);
      }
      if (err) break;
      continue;
    }
    const ch = story.currentChoices;
    if (!ch.length) break;
    // фильтрация: заблокированные никогда не выбираются
    const usable = ch.filter((c) => !c.text.startsWith('x:'));
    if (!usable.length) { problems.push('Только заблокированные выборы в ' + story.state.currentPathString); break; }
    const hot = usable.filter((c) => c.text.startsWith('@') && !c.text.startsWith('@@'));
    for (const c of hot) {
      const id = c.text.slice(1);
      if (curBg && !(HOTSPOTS[curBg] && HOTSPOTS[curBg][id])) problems.push(`Нет зоны ${curBg}.${id}`);
    }
    let pick;
    const done = usable.find((c) => /^@@\w+_done$/.test(c.text));
    if (done) pick = done;
    else if (hot.length) {
      const exit = usable.find((c) => c.text === '@@exit');
      if (exit && rnd() < policy.exitChance) pick = exit;
      else pick = hot[Math.floor(rnd() * hot.length)];
    } else {
      const timeout = usable.find((c) => c.text === '@@timeout');
      const normal = usable.filter((c) => !c.text.startsWith('@@'));
      if (timeout && rnd() < policy.timeout) pick = timeout;
      else {
        const pref = policy.prefer ? normal.filter((c) => policy.prefer(c.text)) : [];
        const avoid = policy.avoid ? normal.filter((c) => !policy.avoid(c.text)) : normal;
        const pool = pref.length && rnd() < 0.85 ? pref : avoid.length ? avoid : normal;
        pick = pool[Math.floor(rnd() * pool.length)];
      }
    }
    story.ChooseChoiceIndex(pick.index);
  }
  maxSteps = Math.max(maxSteps, steps);
  totalLines += lines;
  runs++;
  if (err) problems.push('Ошибка ink: ' + err);
  const end = story.variablesState.$('ending');
  if (!end) { deadEnds++; if (deadEnds < 4) problems.push(`Прохождение без концовки (шагов ${steps}) в ${story.state.currentPathString}`); }
  else endings[end] = (endings[end] ?? 0) + 1;
  if (end) {
    const vars = {};
    for (const k of story.variablesState._globalVariables.keys()) vars[k] = story.variablesState.$(k);
    for (const ch of CHRONICLE) for (const row of ch.rows) for (const o of row.opts) if (o.when(vars)) chronSeen.add(row.id + ':' + o.id);
  }
  for (const n of ['orpheus_ally', 'has_archive', 'deep_read', 'ev_note', 'ded_loop', 'sent_copy_leo', 'leo_taken', 'cat_saved', 'hass_kind', 'kessler_offer', 'orpheus_cut']) {
    if (story.variablesState.$(n)) flagsSeen[n] = (flagsSeen[n] ?? 0) + 1;
  }
  return { end, lines };
}

const POLICIES = {
  random: { exitChance: 0.18, timeout: 0.15, board: 0.6, cctv: 0.6 },
  thorough: { exitChance: 0.05, timeout: 0.05, board: 0.95, cctv: 0.95 },
  kind: { exitChance: 0.06, timeout: 0.02, board: 0.95, cctv: 0.9,
    prefer: (t) => /Ты, я смотрю|Лестница|Не знаю|Показать ему запись|Я не за тобой|Перевернуть|Посмотреть на обороте|Погладить|Забрать кота|Отдать ему|Заговорить|Бежать вместе|Задержать|Шёпотом|Прочесть Миру|Отправить копию|Поговорить с ней|Почему ты говоришь|Попросить|Спросить|Открыть|Лео. Пускай|ОРФЕЙ. Покажи|Пусть вспомнят|Канал 9|Проверить карманы|Не отвечай|Что было в 22:50/.test(t),
    avoid: (t) => /Отключить ОРФЕЯ|Заткнись|Отключись|Не твоё дело|Опусти. Полиция|Прижать|Отойти|Солгать/.test(t) },
  cold: { exitChance: 0.3, timeout: 0.3, board: 0.3, cctv: 0.3,
    prefer: (t) => /Отключить|Заткнись|Солгать|Опусти. Полиция|Прижать|Отойти|Выстрелить|Принять/.test(t) },
};
const N = parseInt(process.argv[2] ?? '2500', 10);
let seed = 1;
for (const [name, pol] of Object.entries(POLICIES)) {
  const before = { ...endings };
  for (let i = 0; i < N; i++) playthrough(pol, seed++ * 7919);
  const diff = Object.fromEntries(Object.entries(endings).map(([k, v]) => [k, v - (before[k] ?? 0)]));
  console.log(`политика ${name.padEnd(9)} →`, JSON.stringify(diff));
}

// --- итоги
console.log(`\nПрохождений: ${runs}. Средняя длина: ${Math.round(totalLines / runs)} строк. Макс. шагов: ${maxSteps}. Без концовки: ${deadEnds}`);
console.log('Концовки:', endings);
console.log('Флаги:', flagsSeen);
for (const e of ENDINGS) if (!endings[e.id]) problems.push(`Концовка «${e.title}» (${e.id}) не достигнута`);
const unvisited = [...allKnots].filter((k) => !knotsVisited.has(k) && k !== 'visited_both');
if (unvisited.length) problems.push('Не посещены узлы: ' + unvisited.join(', '));
// хроника: все варианты встречаются
for (const ch of CHRONICLE) for (const row of ch.rows) for (const o of row.opts) if (!chronSeen.has(row.id + ':' + o.id)) problems.push(`Хроника: вариант «${o.text}» (${row.id}) ни разу не встретился`);
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.log('\nПРОБЛЕМЫ (' + uniq.length + '):\n- ' + uniq.join('\n- '));
  process.exit(1);
} else console.log('\nOK: проблем не найдено.');
