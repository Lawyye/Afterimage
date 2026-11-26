// Проверка сборки из APK в условиях приложения: те же файлы (assets/index.html + assets/assets/*),
// метка AfterimageApp в user-agent, телефонный экран с касаниями, кнопка «Назад» через мост.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 AfterimageApp/1.0' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => errors.push('не загрузилось: ' + r.url()));
await page.goto('file://' + resolve('build-android/apk/assets/index.html'));
await page.waitForTimeout(600);
ok(await page.evaluate(() => document.documentElement.classList.contains('app')), 'режим приложения не распознан');
await page.locator('.boot').tap();
await page.waitForTimeout(1200);
ok(!(await page.locator('.menu-btn', { hasText: 'Полный экран' }).count()), 'в приложении не должно быть пункта «Полный экран»');
ok(await page.evaluate(() => window.__androidBack()) === 'exit', '«Назад» на титульном экране должна закрывать приложение');
await page.locator('.menu-btn', { hasText: 'Настройки' }).tap();
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.__androidBack()) === 'ok', '«Назад» при открытых настройках должна их закрыть');
await page.waitForTimeout(400);
ok(!(await page.locator('.panel').count()), 'настройки не закрылись кнопкой «Назад»');
await page.locator('.menu-btn', { hasText: 'Новая игра' }).tap();
await page.waitForTimeout(800);
if (await page.locator('.intro').count()) await page.locator('.intro .skip').tap();
await page.waitForTimeout(8500);
const img = await page.evaluate(() => { const i = document.querySelector('#bg-layer .bg.on img'); return i ? [i.naturalWidth, i.src.split('/').slice(-3).join('/')] : null; });
ok(img && img[0] === 1920, 'фон из ресурсов APK не загрузился: ' + JSON.stringify(img));
ok(!(await page.locator('.hud [data-b=fs]').isVisible()), 'кнопка полноэкранного режима видна в приложении');
await page.screenshot({ path: 'tests/out/android-game.png' });
ok(await page.evaluate(() => window.__androidBack()) === 'ok', '«Назад» в игре');
await page.waitForTimeout(400);
ok(await page.locator('.pause').isVisible(), '«Назад» в игре должна открывать паузу');
await page.screenshot({ path: 'tests/out/android-pause.png' });
await page.evaluate(() => window.__appPause(true));
ok(await page.evaluate(() => window.__game && true), 'мост сворачивания');
ok(!errors.length, 'ошибки: ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('ПРОВАЛЕНО:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('OK: сборка APK работает в режиме приложения');
