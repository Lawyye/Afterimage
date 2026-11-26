// Озвучка и кат-сцены: трейлер с титульного экрана, озвученное вступление, голос ОРФЕЯ в прологе,
// заставка главы с диктором, кнопка «переслушать» в журнале реплик, отключение озвучки в настройках.
// node tests/voice.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'tests/out/voice';
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); else console.log('  ✓', m); return c; };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForTimeout(400);
await page.locator('.boot').tap();
await page.waitForTimeout(900);
const A = (fn, arg) => page.evaluate(fn, arg);
// следим за озвучкой: сколько фраз реально декодировано и запущено
await A(() => {
  const a = window.__ui.audio;
  window.__vo = { started: 0, decoded: 0, failed: 0 };
  const play = a.playVo.bind(a);
  a.playVo = async (k, o) => { window.__vo.started++; const b = await a.loadVo(k); if (b) window.__vo.decoded++; else window.__vo.failed++; return play(k, o); };
});

// 1. трейлер
await page.locator('.menu-btn', { hasText: 'Трейлер' }).tap();
await page.waitForTimeout(600);
ok(await page.locator('.cine').count() === 1, 'трейлер открывается');
let subSeen = false, cardSeen = false;
for (let i = 0; i < 40 && !(subSeen && cardSeen); i++) {
  await page.waitForTimeout(500);
  if ((await page.locator('.cine-sub.on').textContent().catch(() => '')).trim()) subSeen = true;
  if ((await page.locator('.cine-card.on .c').textContent().catch(() => '')).trim()) cardSeen = true;
}
await page.screenshot({ path: `${OUT}/trailer.png` });
ok(subSeen, 'в трейлере есть субтитры');
ok(cardSeen, 'в трейлере есть титры-карточки');
let v = await A(() => window.__vo);
ok(v.decoded >= 2 && v.failed === 0, `голос трейлера декодируется (${v.decoded} фраз, ошибок ${v.failed})`);
await page.locator('.cine-skip').tap();
await page.waitForTimeout(1200);
ok(await page.locator('.cine').count() === 0 && await page.locator('.title-screen:not(.behind)').count() === 1, 'пропуск трейлера возвращает на титульный экран');

// 2. новая игра → вступление
await page.locator('.menu-btn', { hasText: 'Новая игра' }).tap();
await page.waitForTimeout(1500);
ok(await page.locator('.cine').count() === 1, 'вступление — кат-сцена');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/intro.png` });
v = await A(() => window.__vo);
ok(await A(() => window.__ui.audio.voPlaying) || v.started >= 4, 'во вступлении звучит голос диктора');
// касание по экрану не пропускает вступление, а только показывает кнопку
await page.touchscreen.tap(400, 180);
await page.waitForTimeout(300);
ok(await page.locator('.cine.show-skip').count() === 1, 'касание показывает кнопку пропуска, а не пропускает');
await page.locator('.cine-skip').tap();
await page.waitForTimeout(1500);
ok(await page.locator('.cine').count() === 0, 'вступление пропускается кнопкой');

// 3. заставка пролога с диктором
await page.waitForTimeout(800);
const cardVo = await A(() => window.__vo.started);
ok(cardVo > v.started, 'заставку главы читает диктор');
await page.waitForTimeout(5000);

// 4. пролог, звонок: объявление терминала звучит, на мысли героини голос обрывается, ОРФЕЙ звучит
await A(() => window.__game.jump('prologue.call'));
const state = () => A(() => { const g = window.__game, a = window.__ui.audio; return { sp: g.lastLine?.speaker ?? null, typing: g.dialogue.typing, waiting: g.dialogue.waiting, playing: a.voPlaying }; });
let sysVoiced = false, cut = null, orph = false;
for (let i = 0; i < 60 && !(orph && cut !== null); i++) {
  await page.waitForTimeout(300);
  const st = await state();
  if (st.sp === 'sys' && st.playing) sysVoiced = true;
  if (sysVoiced && cut === null && st.sp !== 'orpheus' && st.sp !== 'sys' && st.waiting && !st.typing) cut = !st.playing;
  if (st.sp === 'orpheus' && st.playing) orph = true;
  if (!(orph && cut !== null)) await A(() => window.__game.dialogue.advance());
}
ok(sysVoiced, 'объявление терминала звучит голосом');
ok(cut === true, 'голос обрывается, когда игрок идёт дальше');
ok(orph, 'реплика ОРФЕЯ звучит голосом');

// 5. журнал реплик: «переслушать»
await page.keyboard.press('l');
await page.waitForTimeout(600);
const replay = page.locator('.log-item .replay');
ok(await replay.count() > 0, 'в журнале у озвученных реплик есть кнопка «переслушать»');
if (await replay.count()) {
  const before = await A(() => window.__vo.started);
  await replay.last().tap();
  await page.waitForTimeout(400);
  ok(await A(() => window.__vo.started) > before, 'кнопка «переслушать» запускает голос');
}
await page.screenshot({ path: `${OUT}/log.png` });
await page.locator('.panel .close').first().tap();
await page.waitForTimeout(400);

// 6. озвучка выключена в настройках → реплики ОРФЕЯ без голоса
await A(() => { window.__ui.audio.stopVo(); window.__ui.settings.vo = 0; });
await A(() => window.__game.jump('prologue.call'));
let silentOk = true, sawOrph = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(300);
  const name = await page.locator('.dlg .name').textContent().catch(() => '');
  if (/ОРФЕЙ/.test(name ?? '')) { sawOrph = true; if (await A(() => window.__ui.audio.voPlaying)) silentOk = false; }
  await A(() => window.__game.dialogue.advance());
}
ok(sawOrph && silentOk, 'с выключенной озвучкой ОРФЕЙ молчит');
await A(() => { window.__ui.settings.vo = 0.9; });

if (errors.length) fails.push('ошибки страницы: ' + [...new Set(errors)].join(' | '));
await browser.close();
if (fails.length) { console.log('ПРОВАЛ:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('OK: озвучка и кат-сцены работают');
