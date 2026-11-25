// Быстрые скриншоты игры: node tests/shot.mjs <outdir> [steps]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || 'tests/out';
const steps = parseInt(process.argv[3] || '6', 10);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/00-boot.png` });
await page.mouse.click(640, 360);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-title.png` });
// новая игра
await page.click('text=Новая игра');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-intro.png` });
await page.keyboard.press('Enter'); // пропуск заставки
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/03-chapter.png` });
await page.waitForTimeout(3500);
for (let i = 0; i < steps; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/1${i}-step.png` });
}
console.log(errors.join('\n') || 'no errors');
await browser.close();
