// Проверка всех точек осмотра во всех локациях: ни одна не перекрыта другим слоем.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SCENES = [['prologue.look', {}], ['mira_apt.look', {}], ['ch3.look', {}]];
const fails = [];
const browser = await chromium.launch();
for (const vp of [{ width: 1280, height: 720, touch: false }, { width: 800, height: 360, touch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  await page.goto('file://' + resolve('dist/index.html'));
  await page.waitForTimeout(500);
  await page.locator('.boot').click();
  await page.waitForTimeout(1200);
  for (const [knot, vars] of SCENES) {
    await page.evaluate(({ knot, vars }) => {
      document.querySelector('.title-screen')?.remove();
      const g = window.__game;
      const bg = { 'prologue.look': 'eva_apt', 'mira_apt.look': 'mira_apt', 'ch3.look': 'columbarium' }[knot];
      g.jump(knot, vars);
      g.stage.setBg(bg, 0);
    }, { knot, vars });
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => [...document.querySelectorAll('.hs-svg .hs')].map((g) => {
      const r = g.querySelector('.pulse').getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { id: g.querySelector('.shape') ? Math.round(x) + ',' + Math.round(y) : '?', ok: !!hit && !!hit.closest('.hs'), by: hit ? (hit.id || hit.className?.baseVal || hit.className) : null };
    }));
    if (!res.length) fails.push(`${vp.width}x${vp.height} ${knot}: точки не появились`);
    for (const r of res) if (!r.ok) fails.push(`${vp.width}x${vp.height} ${knot}: точка ${r.id} перекрыта (${r.by})`);
    console.log(`${vp.width}x${vp.height} ${knot}: ${res.filter((r) => r.ok).length}/${res.length} доступны`);
  }
  await ctx.close();
}
await browser.close();
if (fails.length) { console.log('ПРОВАЛЕНО:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('OK: все точки осмотра доступны для нажатия');
