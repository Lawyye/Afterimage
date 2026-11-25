// Проверка одного персонажа в игре: все эмоции, переходы, речь, моргание.
// node tests/portrait-test.mjs <id> <outdir>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const id = process.argv[2] || 'eva';
const out = process.argv[3] || `tests/out/portrait-${id}`;
mkdirSync(out, { recursive: true });
const EXPR = { eva: ['neutral', 'smile', 'sad', 'fear', 'angry', 'shock', 'closed', 'glitch'], voron: ['warm', 'neutral', 'cold', 'angry', 'sad', 'cornered', 'closed'],
  kessler: ['neutral', 'smirk', 'cold', 'angry', 'surprised', 'calculating', 'closed'], leo: ['neutral', 'smile', 'sad', 'fear', 'angry', 'suspicious', 'closed'],
  mira: ['neutral', 'smile', 'plead', 'fear', 'shock', 'cry', 'closed'], sonya: ['smile', 'laugh', 'worry', 'fear', 'determined', 'sad', 'closed'],
  hass: ['neutral', 'smile', 'confused', 'sad', 'surprised', 'cry', 'closed'] }[id];
const bg = { eva: 'eva_apt', voron: 'courtyard', kessler: 'mnema', leo: 'den', mira: 'mira_apt', sonya: 'columbarium', hass: 'canal' }[id];
const side = id === 'eva' ? 'right' : 'left';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: out + '/video', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('afterimage.v1.settings', JSON.stringify({ textSpeed: 32, master: 0, fx: 0.7 })));
await page.goto('file://' + resolve('dist/index.html'));
await page.mouse.click(960, 540);
await page.waitForTimeout(1500);
await page.evaluate(({ bg, id, side }) => {
  const t = document.querySelector('.title-screen'); if (t) t.style.display = 'none';
  const g = window.__game; g.inGame = true;
  g.stage.setBg(bg, 0.1); g.stage.show(id, 'neutral', side); g.stage.setSpeaker(id);
}, { bg, id, side });
await page.waitForTimeout(1500);
const box = { x: side === 'right' ? 1010 : 10, y: 0, width: 900, height: 1080 };
for (const e of EXPR) {
  await page.evaluate(({ id, e }) => window.__game.stage.setExpr(id, e), { id, e });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/expr-${e}.png`, clip: box });
}
await page.screenshot({ path: `${out}/scene.png` });
// переход: кадры каждые 50 мс
await page.evaluate(({ id }) => window.__game.stage.setExpr(id, 'neutral'), { id });
await page.waitForTimeout(600);
await page.evaluate(({ id }) => window.__game.stage.setExpr(id, EXPR_T), { id }).catch(() => {});
const target = EXPR.find((x) => x === 'angry') ?? EXPR[2];
await page.evaluate(({ id, t }) => window.__game.stage.setExpr(id, t), { id, t: target });
for (let i = 0; i < 5; i++) { await page.screenshot({ path: `${out}/trans-${i}.png`, clip: box }); await page.waitForTimeout(45); }
// речь и моргание
await page.evaluate(({ id }) => window.__game.stage.setExpr(id, 'neutral'), { id });
await page.waitForTimeout(500);
await page.evaluate(() => { document.querySelector('.pt .pt-talk').style.opacity = '1'; });
await page.screenshot({ path: `${out}/talk-open.png`, clip: box });
await page.evaluate(() => { document.querySelector('.pt .pt-talk').style.opacity = '0'; document.querySelector('.pt .pt-blink').style.opacity = '1'; });
await page.screenshot({ path: `${out}/blink.png`, clip: box });
await page.evaluate(() => { document.querySelector('.pt .pt-blink').style.opacity = '0'; });
// реплики с анимацией рта для видео
await page.evaluate(async ({ id, ex }) => {
  const g = window.__game; const tk = { cancelled: false, onCancel() {}, check() {} };
  const lines = [['neutral', 'Мне нужно поговорить. О Соне. Это не займёт много времени.'], ['sad', 'Три года. Три года, как её нет.'], ['angry', 'Кто-то залез ко мне в голову. И я узнаю, кто.'], ['smile', 'Ты всегда умела находить слова. Даже сейчас.']];
  for (const [e, t] of lines) {
    if (!ex.includes(e)) continue;
    g.stage.setExpr(id, e);
    const p = g.dialogue.show({ speaker: id, expr: e, text: t, tags: [] }, tk, false);
    await new Promise((r) => setTimeout(r, t.length * 34 + 900));
    g.dialogue.advance();
    await p;
  }
}, { id, ex: EXPR });
await page.waitForTimeout(500);
const v = page.video();
await ctx.close();
console.log('video', await v.path());
await browser.close();
