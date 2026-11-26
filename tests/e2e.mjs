// Сквозной тест в браузере: проходит игру через настоящий интерфейс.
// node tests/e2e.mjs [policy=kind|random|cold] [outdir] [seed]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const policy = process.argv[2] || 'kind';
const out = process.argv[3] || `tests/out/e2e-${policy}`;
let seed = parseInt(process.argv[4] || '7', 10);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
mkdirSync(out, { recursive: true });

const r = await build({ entryPoints: ['src/data/board.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { DEDUCTIONS } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

const PREFER = {
  kind: /Ты, я смотрю|Лестница|Не знаю|Показать ему запись|Я не за тобой|Перевернуть|Посмотреть на обороте|Погладить|Забрать кота|Отдать ему|Заговорить|Бежать вместе|Задержать|Шёпотом|Прочесть Миру|Отправить копию|Поговорить с ней|Почему ты говоришь|Попросить|Спросить|Открыть|Пусть вспомнят|ОРФЕЙ. Покажи|Канал 9|Проверить карманы|Не отвечай|Что было в 22:50|Что она тебе оставила|Если я не справлюсь/,
  random: /$^/,
  cold: /Отключить|Заткнись|Солгать|Опусти. Полиция|Прижать|Отойти|Выстрелить|Башня/,
};
const AVOID = /Отключить ОРФЕЯ|Заткнись|Отключись|Не твоё дело|Опусти. Полиция|Прижать|Отойти|Солгать|Принять его|Ничего не делать|Достать пистолет|Хватит. Время/;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  try {
    if (!localStorage.getItem('afterimage.v1.e2e')) {
      localStorage.clear();
      localStorage.setItem('afterimage.v1.e2e', '1');
    }
    localStorage.setItem('afterimage.v1.settings', JSON.stringify({ textSpeed: 0, autoDelay: 0.5, timers: true, master: 0 }));
  } catch { /* */ }
});
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForTimeout(500);
await page.mouse.click(640, 360);
await page.waitForTimeout(1200);
await page.click('text=Новая игра');
await page.waitForTimeout(800);

const shots = new Set();
let shotN = 0;
const shot = async (key) => {
  if (shots.has(key)) return;
  shots.add(key);
  await page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}-${key.replace(/[^a-z0-9_-]/gi, '_')}.png` });
};

let steps = 0, ended = null, savedOnce = false, loadedOnce = false;
const t0 = Date.now();
while (steps < 3000 && !ended) {
  steps++;
  const st = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const g = window.__game;
    return {
      ending: !!q('.ending-card'), intro: !!q('.intro'), chapter: !!q('.chapter-card'), doc: !!q('.doc-close'),
      cctv: !!q('.cctv'), cctvMark: !!q('.cctv [data-a=mark]'), board: !!q('.board'), panel: q('.panel h2')?.textContent ?? null,
      choices: [...document.querySelectorAll('.choices .choice')].map((b) => ({ t: b.textContent, locked: b.classList.contains('locked') })),
      hotspots: document.querySelectorAll('.hs-svg .hs').length, exit: !!q('.inv-exit'),
      bg: g?.stage?.bgId ?? null, title: !!q('.title-screen'), pause: !!q('.pause'),
      memory: document.getElementById('world').classList.contains('memory'),
      speaker: q('.dlg .name.on b')?.textContent ?? '',
    };
  });
  if (st.ending) { await page.waitForTimeout(4500); await shot('ending'); ended = await page.evaluate(() => document.querySelector('.ending-card h2')?.textContent); break; }
  if (st.title && steps > 5) { errors.push('Неожиданный возврат на титульный экран'); break; }
  if (st.bg) await shot('bg-' + st.bg + (st.memory ? '-mem' : ''));
  if (st.speaker) await shot('spk-' + st.speaker);
  if (st.intro) { await shot('intro'); await page.keyboard.press('Enter'); await page.waitForTimeout(600); continue; }
  if (st.chapter) { await shot('chapter-' + steps); await page.waitForTimeout(1500); continue; }
  if (st.panel) { await shot('panel-' + st.panel); await page.keyboard.press('Escape'); await page.waitForTimeout(300); continue; }
  if (st.doc) { await shot('doc-' + steps); await page.click('.doc-close'); await page.waitForTimeout(300); continue; }
  if (st.cctv) {
    await shot('cctv' + (st.cctvMark ? '' : '-restored'));
    if (st.cctvMark) {
      for (let k = 0; k < 45; k++) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.click('.cctv [data-a=mark]');
      await page.waitForTimeout(300);
      await shot('cctv-marked');
    } else {
      for (let k = 0; k < 89; k++) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
      await shot('cctv-grey');
    }
    await page.click('.cctv [data-a=close]');
    await page.waitForTimeout(300);
    continue;
  }
  if (st.board) {
    await shot('board-' + steps);
    // попытка решить все доступные выводы
    for (const d of DEDUCTIONS) {
      const ids = await page.evaluate(() => [...document.querySelectorAll('.bcard')].map((c) => c.dataset.id));
      const pair = d.pairs.find(([a, b]) => ids.includes(a) && ids.includes(b));
      const solved = await page.evaluate((q) => [...document.querySelectorAll('.board .q.solved b')].some((b) => b.textContent.includes(q)), d.question);
      if (!pair || solved) continue;
      await page.locator('.board .q', { hasText: d.question }).click();
      await page.click(`.bcard[data-id="${pair[0]}"]`);
      await page.click(`.bcard[data-id="${pair[1]}"]`);
      await page.waitForTimeout(250);
    }
    await shot('board-solved-' + steps);
    await page.click('.board .done-btn');
    await page.waitForTimeout(300);
    continue;
  }
  if (st.hotspots || st.exit) {
    await shot('inv-' + st.bg);
    const n = await page.evaluate(() => document.querySelectorAll('.hs-svg .hs:not(.done)').length);
    const exitChance = policy === 'kind' ? (n === 0 ? 1 : 0.02) : 0.25;
    if (st.exit && (n === 0 || rnd() < exitChance)) { await page.click('.inv-exit'); }
    else {
      const all = await page.$$('.hs-svg .hs:not(.done)');
      const list = all.length ? all : await page.$$('.hs-svg .hs');
      const el = list[Math.floor(rnd() * list.length)];
      // настоящий клик по точке — проверяет, что её ничто не перекрывает
      const c = await (await el.$('.pulse')).boundingBox();
      await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    }
    await page.waitForTimeout(250);
    continue;
  }
  if (st.choices.length) {
    await shot('choices-' + steps);
    // проверка сохранения/загрузки на выборе
    if (!savedOnce && steps > 60) {
      savedOnce = true;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.click('.pause >> text=Сохранить');
      await page.waitForTimeout(300);
      await page.click('.slot >> nth=0');
      await page.waitForTimeout(300);
      await shot('save-panel');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.click('.pause >> text=Загрузить');
      await page.waitForTimeout(300);
      await page.locator('.slot', { hasText: 'СЛОТ 1' }).click();
      await page.waitForTimeout(1500);
      loadedOnce = true;
      await shot('after-load');
      continue;
    }
    const usable = st.choices.map((c, i) => ({ ...c, i })).filter((c) => !c.locked);
    const pref = usable.filter((c) => PREFER[policy].test(c.t));
    const safe = usable.filter((c) => !AVOID.test(c.t));
    let pool = pref.length && rnd() < 0.9 ? pref : policy === 'kind' && safe.length ? safe : usable;
    const pick = pool[Math.floor(rnd() * pool.length)];
    await page.locator('.choices .choice').nth(pick.i).click();
    await page.waitForTimeout(650);
    continue;
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
}
const secs = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify({ policy, ending: ended, steps, secs, savedOnce, loadedOnce, shots: shotN, errors }, null, 1));
await browser.close();
if (!ended || errors.length) process.exit(1);
