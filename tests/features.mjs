// Проверка функций новеллы: досье «Люди» (неизвестные — «?»), «???» вместо имени незнакомца,
// быстрое сохранение и загрузка, скрытие интерфейса, выбор главы, галерея, прозрачность окна текста,
// плавность появления портретов в начале главы 1. Мышь (1280×720) и касания (800×360).
// node tests/features.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'tests/out/features';
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };
const browser = await chromium.launch();

for (const vp of [{ name: '1280x720', w: 1280, h: 720, touch: false }, { name: '800x360-touch', w: 800, h: 360, touch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tag = (s) => `[${vp.name}] ${s}`;
  const press = async (loc) => {
    const l = typeof loc === 'string' ? page.locator(loc).first() : loc.first();
    await l.waitFor({ state: 'visible', timeout: 5000 });
    if (vp.touch) await l.tap(); else await l.click();
    await page.waitForTimeout(300);
  };
  const tapScene = async () => { if (vp.touch) await page.touchscreen.tap(vp.w / 2, vp.h * 0.45); else await page.mouse.click(vp.w / 2, vp.h * 0.45); await page.waitForTimeout(250); };
  const closePanel = () => press('.panel .close');
  const waitLine = async (re, max = 60) => {
    for (let i = 0; i < max; i++) {
      const t = await page.locator('.dlg .text').textContent().catch(() => '');
      if (re.test(t ?? '')) return true;
      await page.evaluate(() => window.__game.dialogue.advance());
      await page.waitForTimeout(120);
    }
    return false;
  };

  await page.goto('file://' + resolve('dist/index.html'));
  await page.waitForTimeout(500);
  await press('.boot');
  await page.waitForTimeout(1000);
  // название на английском, «Главы» недоступны до первой главы, «Галерея» есть
  ok((await page.locator('.title-screen h1').textContent()).startsWith('AFTERIMAGE'), tag('название на титульном экране не английское'));
  ok(await page.title() === 'Afterimage', tag('заголовок вкладки не «Afterimage»'));
  ok(await page.locator('.menu-btn', { hasText: 'Главы' }).isDisabled(), tag('«Главы» должны быть недоступны до начала игры'));
  await page.screenshot({ path: `${OUT}/${vp.name}-title.png` });

  // новая игра → пролог
  await press(page.locator('.menu-btn', { hasText: 'Новая игра' }));
  await page.waitForTimeout(600);
  if (await page.locator('.intro .skip').count()) await press('.intro .skip');
  await page.waitForTimeout(6000);

  // досье: в начале известна только героиня, остальные — «?»
  await press(page.locator('.hud [data-b=journal]'));
  await press(page.locator('.panel .tabs button', { hasText: 'Люди' }));
  const unknown = await page.locator('.person.unknown').count();
  const known = await page.locator('.person:not(.unknown)').count();
  ok(known === 1 && unknown === 7, tag(`досье в прологе: известно ${known}, неизвестно ${unknown} (ожидалось 1 и 7)`));
  await page.screenshot({ path: `${OUT}/${vp.name}-people-prologue.png` });
  await closePanel();

  // быстрое сохранение — кнопкой в окне текста (мышь) или в паузе (касания)
  ok(await waitLine(/./), tag('нет реплики в прологе'));
  if (!vp.touch) await press('.dlg .modes [data-m=qsave]');
  else {
    ok(!(await page.locator('.dlg .modes [data-m=qsave]').isVisible()), tag('кнопка Б.СОХР не должна теснить окно текста на телефоне'));
    await press('.hud [data-b=menu]');
    await press(page.locator('.pause .menu-btn', { hasText: 'Быстрое сохранение' }));
  }
  ok(await page.evaluate(() => !!localStorage.getItem('afterimage.v1.save.quick')), tag('быстрое сохранение не записано'));
  const savedText = await page.locator('.dlg .text').textContent();
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__game.dialogue.advance(); });
  await page.waitForTimeout(800);

  // скрыть интерфейс: касание возвращает его и не листает реплику
  await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); });
  await page.waitForTimeout(400);
  const before = await page.locator('.dlg .text').textContent();
  await press('.dlg .modes [data-m=hide]');
  ok(await page.evaluate(() => document.getElementById('stage').classList.contains('ui-hidden')), tag('интерфейс не скрылся'));
  const dlgOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('.dlg')).opacity);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vp.name}-hidden.png` });
  await tapScene();
  ok(!(await page.evaluate(() => document.getElementById('stage').classList.contains('ui-hidden'))), tag('касание не вернуло интерфейс'));
  ok((await page.locator('.dlg .text').textContent()) === before, tag('касание при скрытом интерфейсе пролистало реплику'));
  ok(dlgOpacity !== '1', tag('окно текста не спряталось визуально'));

  // быстрая загрузка возвращает к сохранённой реплике
  if (!vp.touch) await page.keyboard.press('F9');
  else {
    await press('.hud [data-b=menu]');
    await press(page.locator('.pause .menu-btn', { hasText: 'Быстрая загрузка' }));
    await press('.confirm [data-v="1"]');
  }
  await page.waitForTimeout(1500);
  ok((await page.locator('.dlg .text').textContent()) === savedText, tag('быстрая загрузка вернула не ту реплику'));

  // глава 1: замер плавности портретов (без «прыжков» размера при смене говорящего)
  await page.evaluate(() => window.__game.jump('ch1'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__ptlog = [];
    const tick = () => {
      for (const p of document.querySelectorAll('#char-layer .pt.on')) {
        const r = p.getBoundingClientRect();
        window.__ptlog.push([p.dataset.id, Math.round(r.width * 10) / 10, performance.now()]);
      }
      if (window.__ptlog.length < 20000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  ok(await waitLine(/Опять не спала/, 80), tag('не дошли до первой реплики Ворона'));
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(900); await page.evaluate(() => { const d = window.__game.dialogue; d.advance(); }); }
  const jitter = await page.evaluate(() => {
    const by = {};
    for (const [id, w] of window.__ptlog) (by[id] ??= new Set()).add(w);
    return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.size]));
  });
  ok(Object.keys(jitter).length >= 2, tag('в начале главы 1 должны быть видны два портрета: ' + JSON.stringify(jitter)));
  for (const [id, n] of Object.entries(jitter)) ok(n <= 2, tag(`портрет ${id} меняет размер при смене говорящего (${n} разных размеров)`));
  await page.screenshot({ path: `${OUT}/${vp.name}-ch1.png` });
  // в досье теперь есть Ворон и Мира
  await press('.hud [data-b=journal]');
  await press(page.locator('.panel .tabs button', { hasText: 'Люди' }));
  ok((await page.locator('.person:not(.unknown) h4', { hasText: 'Глеб Ворон' }).count()) === 1, tag('Ворон не появился в досье после встречи'));
  await closePanel();

  // в меню: «Главы» открыты, контрольная точка главы 1 есть
  await page.evaluate(() => window.__game.toTitle());
  await page.waitForTimeout(1500);
  ok(!(await page.locator('.menu-btn', { hasText: 'Главы' }).isDisabled()), tag('«Главы» не открылись после начала главы'));
  await press(page.locator('.menu-btn', { hasText: 'Главы' }));
  const open = await page.locator('.chapter-row:not(.locked)').count();
  ok(open >= 2, tag(`открыто глав: ${open} (ожидались пролог и глава I)`));
  await page.screenshot({ path: `${OUT}/${vp.name}-chapters.png` });
  await press(page.locator('.chapter-row:not(.locked)').nth(1));
  await press('.confirm [data-v="1"]');
  await page.waitForTimeout(5500);
  ok(await page.evaluate(() => window.__game.inGame), tag('выбор главы не запустил игру'));
  ok(/Глава 1|ГЛАВА 1/i.test(await page.locator('.hud .chap').textContent()), tag('выбор главы открыл не ту главу'));

  // галерея: увиденные места открыты, остальные — «?»
  await page.evaluate(() => window.__game.toTitle());
  await page.waitForTimeout(1500);
  await press(page.locator('.menu-btn', { hasText: 'Галерея' }));
  const tiles = await page.locator('.g-tile:not(.locked)').count();
  const locked = await page.locator('.g-tile.locked').count();
  ok(tiles >= 3 && locked >= 5, tag(`галерея мест: открыто ${tiles}, закрыто ${locked}`));
  await page.screenshot({ path: `${OUT}/${vp.name}-gallery.png` });
  await press(page.locator('.g-tile:not(.locked)').nth(1));
  ok(await page.locator('.viewer').isVisible(), tag('просмотр иллюстрации не открылся'));
  await page.screenshot({ path: `${OUT}/${vp.name}-viewer.png` });
  await press('.viewer');
  ok(!(await page.locator('.viewer').count()), tag('просмотр не закрылся'));
  await press(page.locator('.panel .tabs button', { hasText: 'Персонажи' }));
  ok((await page.locator('.g-tile.g-pt:not(.locked)').count()) >= 2, tag('в галерее персонажей нет увиденных эмоций'));
  const tileBox = await page.locator('.g-tile.g-pt').first().boundingBox();
  ok(tileBox && tileBox.width > 40 && tileBox.width < vp.w / 3 && (await page.locator('.g-tile.g-pt').first().evaluate((e) => getComputedStyle(e).opacity)) === '1', tag('плитки галереи персонажей невидимы или неверного размера: ' + JSON.stringify(tileBox)));
  await page.screenshot({ path: `${OUT}/${vp.name}-gallery-pt.png` });
  await closePanel();

  // настройки: прозрачность окна текста
  await press(page.locator('.menu-btn', { hasText: 'Настройки' }));
  await press(page.locator('.panel .tabs button', { hasText: 'Текст' }));
  ok(await page.locator('.set-row', { hasText: 'Окно текста' }).count() === 1, tag('нет настройки окна текста'));
  await page.screenshot({ path: `${OUT}/${vp.name}-settings-text.png` });
  await closePanel();

  const size = await page.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; });
  console.log(`[${vp.name}] localStorage: ${(size / 1024).toFixed(0)} КБ`);
  ok(!errors.length, tag('ошибки: ' + errors.join(' | ')));
  await ctx.close();
}
await browser.close();
if (fails.length) { console.log('ПРОВАЛЕНО:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('OK: функции новеллы работают');
