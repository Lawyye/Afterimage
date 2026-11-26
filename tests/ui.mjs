// Регрессионный тест интерфейса на разных экранах (мышь и касания).
// node tests/ui.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'tests/out/ui';
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [
  { name: '1280x720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, touch: false },
  { name: '800x360-touch', viewport: { width: 800, height: 360 }, touch: true },
  { name: '360x800-touch', viewport: { width: 360, height: 800 }, touch: true },
];
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); return cond; };

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp.viewport, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tag = (s) => `[${vp.name}] ${s}`;
  const press = async (loc) => {
    const l = typeof loc === 'string' ? page.locator(loc).first() : loc;
    await l.waitFor({ state: 'visible', timeout: 4000 });
    if (vp.touch) await l.tap(); else await l.click();
    await page.waitForTimeout(250);
  };
  /** проверка, что элемент действительно сверху (не перекрыт) */
  const onTop = async (sel) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(30, r.height / 2));
    return !!hit && (el === hit || el.contains(hit));
  }, sel);

  await page.goto('file://' + resolve('dist/index.html'));
  await page.waitForTimeout(600);

  if (vp.name.startsWith('360x800')) {
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display !== 'none');
    ok(shown, tag('нет экрана «поверните телефон» в вертикальной ориентации'));
    await page.screenshot({ path: `${OUT}/${vp.name}-rotate.png` });
    await ctx.close();
    continue;
  }

  // экран запуска
  await press('.boot');
  await page.waitForTimeout(1200);
  ok(await page.locator('.title-screen').isVisible(), tag('нет титульного экрана'));
  await page.screenshot({ path: `${OUT}/${vp.name}-title.png` });

  // кнопки главного меню
  for (const name of ['Настройки', 'Хроника решений', 'Концовки']) {
    await press(page.locator('.menu-btn', { hasText: name }));
    ok(await page.locator('.panel').isVisible(), tag(`«${name}» не открыла панель`));
    ok(await onTop('.panel header'), tag(`панель «${name}» перекрыта другим слоем`));
    if (name === 'Настройки') {
      for (const tab of ['Звук', 'Текст', 'Изображение']) {
        await press(page.locator('.panel .tabs button', { hasText: tab }));
        ok(await page.locator('.panel .tabs button.on', { hasText: tab }).count() === 1, tag(`вкладка «${tab}» не переключилась`));
        const toggles = page.locator('.panel .toggle button:not(.fs-btn)');
        for (let i = 0; i < await toggles.count(); i++) {
          const b = toggles.nth(i);
          await press(b);
          ok(await b.evaluate((x) => x.classList.contains('on')), tag(`переключатель на вкладке «${tab}» не сработал`));
        }
        const ranges = page.locator('.panel input[type=range]');
        if (await ranges.count()) {
          const r = ranges.first();
          const before = await r.inputValue();
          const box = await r.boundingBox();
          if (vp.touch) await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height / 2);
          else await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
          await page.waitForTimeout(150);
          ok((await r.inputValue()) !== before, tag(`ползунок на вкладке «${tab}» не реагирует`));
        }
        await page.screenshot({ path: `${OUT}/${vp.name}-settings-${tab}.png` });
      }
      // вернуть таймеры и эффекты к удобным значениям
      await page.evaluate(() => localStorage.removeItem('afterimage.v1.settings'));
    }
    await press('.panel .close');
    ok(!(await page.locator('.panel').count()), tag(`панель «${name}» не закрылась`));
  }

  // новая игра → пролог
  await press(page.locator('.menu-btn', { hasText: 'Новая игра' }));
  await page.waitForTimeout(800);
  if (await page.locator('.intro').count()) await press('.intro .skip');
  await page.waitForTimeout(8500);
  const bg = await page.evaluate(() => {
    const img = document.querySelector('#bg-layer .bg.on img');
    return img ? { ok: img.naturalWidth > 0, data: img.src.startsWith('data:'), op: getComputedStyle(img.closest('.bg')).opacity } : null;
  });
  ok(bg && bg.ok && bg.data && +bg.op > 0.9, tag(`фон пролога не загружен: ${JSON.stringify(bg)}`));
  await page.screenshot({ path: `${OUT}/${vp.name}-prologue.png` });
  // продвинуть пару реплик касанием/кликом по сцене
  for (let i = 0; i < 3; i++) {
    if (vp.touch) await page.touchscreen.tap(vp.viewport.width / 2, vp.viewport.height * 0.35);
    else await page.mouse.click(vp.viewport.width / 2, vp.viewport.height * 0.35);
    await page.waitForTimeout(700);
  }
  // осмотр квартиры: настоящие касания/клики по точкам (как палец), без программных событий
  const realTap = async (x, y) => { if (vp.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  for (let i = 0; i < 60 && !(await page.locator('.hs-svg .hs').count()); i++) {
    await realTap(vp.viewport.width / 2, vp.viewport.height * 0.35);
    await page.waitForTimeout(450);
  }
  ok(await page.locator('.hs-svg .hs').count() > 0, tag('не дошли до осмотра квартиры'));
  await page.screenshot({ path: `${OUT}/${vp.name}-investigate.png` });
  for (let k = 0; k < 3; k++) {
    const dot = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('.hs-svg .hs:not(.done)')];
      const c = hs[0]?.querySelector('.pulse');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitOk: !!hit && !!hit.closest('.hs') };
    });
    if (!ok(dot, tag('нет неосмотренных точек'))) break;
    ok(dot.hitOk, tag(`точка осмотра перекрыта другим слоем (касание до неё не дойдёт)`));
    await realTap(dot.x, dot.y);
    await page.waitForTimeout(500);
    const reacted = await page.evaluate(() => !document.querySelector('.hs-svg') || !!document.querySelector('.dlg:not(.hidden) .text')?.textContent);
    ok(reacted, tag(`касание точки осмотра №${k + 1} не сработало`));
    // дочитать описание до возврата к осмотру
    for (let i = 0; i < 25 && !(await page.locator('.hs-svg .hs').count()); i++) {
      if (await page.locator('.doc-close').count()) { await press('.doc-close'); continue; }
      if (await page.locator('.choices:not(.done) .choice:not(.locked)').count()) { await press('.choices:not(.done) .choice:not(.locked) >> nth=0'); await page.waitForTimeout(600); continue; }
      await realTap(vp.viewport.width / 2, vp.viewport.height * 0.35);
      await page.waitForTimeout(400);
    }
  }
  await page.screenshot({ path: `${OUT}/${vp.name}-investigate-after.png` });

  // HUD: журнал, доска, лог, меню
  for (const [b, check] of [['journal', '.panel'], ['board', '.board'], ['log', '.panel']]) {
    await press(`.hud [data-b=${b}]`);
    ok(await page.locator(check).isVisible(), tag(`кнопка HUD «${b}» не открыла окно`));
    await page.screenshot({ path: `${OUT}/${vp.name}-hud-${b}.png` });
    if (b === 'board') await press('.board .done-btn'); else await press('.panel .close');
  }
  // пауза → сохранить → загрузить
  await press('.hud [data-b=menu]');
  ok(await page.locator('.pause').isVisible(), tag('пауза не открылась'));
  await page.screenshot({ path: `${OUT}/${vp.name}-pause.png` });
  await press(page.locator('.pause .menu-btn', { hasText: 'Сохранить' }));
  await press(page.locator('.slot', { hasText: 'СЛОТ 1' }));
  ok(await page.locator('.slot', { hasText: 'СЛОТ 1' }).locator('h4', { hasText: 'Бессонница' }).count() === 1, tag('сохранение в слот 1 не записалось'));
  await press('.panel .close');
  await press(page.locator('.pause .menu-btn', { hasText: 'Загрузить' }));
  await press(page.locator('.slot', { hasText: 'СЛОТ 1' }));
  await page.waitForTimeout(1200);
  ok(await page.locator('.dlg:not(.hidden), .hs-svg').count() > 0, tag('после загрузки игра не продолжилась'));
  await page.screenshot({ path: `${OUT}/${vp.name}-after-load.png` });

  if (vp.touch) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const lt = await page.evaluate(() => new Promise((res) => {
      const d = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => d.push(e.duration)));
      po.observe({ entryTypes: ['longtask'] });
      setTimeout(() => { po.disconnect(); res({ n: d.length, max: Math.round(Math.max(0, ...d)) }); }, 6000);
    }));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(tag(`длинные задачи за 6 с при CPU x4: ${lt.n}, максимум ${lt.max} мс`));
    ok(lt.max < 700, tag(`подвисание главного потока ${lt.max} мс — музыка может прерываться`));
  }
  ok(!errors.length, tag('ошибки в консоли: ' + errors.join(' | ')));
  await ctx.close();
}
await browser.close();
if (failures.length) { console.log('ПРОВАЛЕНО:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('OK: все проверки интерфейса пройдены на ' + VIEWPORTS.map((v) => v.name).join(', '));
