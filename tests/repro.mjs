// Воспроизведение: кнопки главного меню и пролог.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const out = 'tests/out/repro';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { ...devices['Galaxy S9+ landscape'] }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + resolve('dist/index.html'));
  await page.waitForTimeout(500);
  await page.mouse.click(200, 150);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-title.png` });
  await page.locator('.menu-btn', { hasText: 'Настройки' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-settings.png` });
  const top = await page.evaluate(() => { const p = document.querySelector('.panel'); if (!p) return 'no panel'; const r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + 40); return e ? e.className : null; });
  console.log(name, 'settings top element:', top);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.menu-btn', { hasText: 'Новая игра' }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${out}/${name}-prologue.png` });
  const st = await page.evaluate(() => ({ bg: window.__game.stage.bgId, bgs: [...document.querySelectorAll('#bg-layer .bg')].map((b) => b.className + ' op=' + getComputedStyle(b).opacity), fade: getComputedStyle(document.getElementById('fade')).opacity, imgs: [...document.querySelectorAll('#bg-layer img')].map((i) => i.src.split('/').pop() + ':' + i.naturalWidth) }));
  console.log(name, JSON.stringify(st), errs.join(' | '));
  await ctx.close();
}
await browser.close();
