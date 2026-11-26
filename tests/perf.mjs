// Замер плавности на телефонном экране с реальной плотностью пикселей (как у Android-флагманов, DPR ≈ 2.6):
// кадры в секунду, доля «рваных» кадров и время растеризации (работа GPU-потоков) в начале главы 1
// и во время разговора с ОРФЕЕМ в прологе. node tests/perf.mjs [метка] [css-переопределения]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const label = process.argv[2] ?? 'current';
const extraCss = process.argv[3] ?? '';
const OUT = 'tests/out/perf';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 AfterimageApp/1.0' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('dist/index.html'));
if (extraCss) await page.addStyleTag({ content: extraCss });
await page.waitForTimeout(500);
await page.locator('.boot').tap();
await page.waitForTimeout(1200);

async function measure(name, setup, ms = 7000) {
  await setup();
  await page.waitForTimeout(1500);
  await browser.startTracing(page, { categories: ['disabled-by-default-devtools.timeline', 'devtools.timeline', 'cc', 'viz', 'gpu'] });
  const frames = await page.evaluate((ms) => new Promise((res) => {
    const t = []; const t0 = performance.now();
    // реплики идут сами, как при чтении
    const adv = setInterval(() => window.__game.dialogue.advance(), 1600);
    const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else { clearInterval(adv); res(t); } };
    requestAnimationFrame(f);
  }), ms);
  const buf = await browser.stopTracing();
  // слои композитора: сколько их и сколько видеопамяти они занимают при DPR 2.625
  const cdp = await ctx.newCDPSession(page);
  const layers = await new Promise((res) => {
    cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) res(e.layers); });
    cdp.send('LayerTree.enable');
    setTimeout(() => res([]), 3000);
  });
  await cdp.send('LayerTree.disable').catch(() => {});
  const drawn = layers.filter((l) => l.drawsContent);
  const memMB = Math.round(drawn.reduce((a, l) => a + l.width * l.height, 0) * 2.625 * 2.625 * 4 / 1048576);
  const big = drawn.map((l) => ({ w: Math.round(l.width), h: Math.round(l.height) })).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6);
  const trace = JSON.parse(buf.toString());
  const ev = trace.traceEvents ?? trace;
  let raster = 0, paint = 0, rasterN = 0;
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    if (e.name === 'RasterTask' || e.name === 'TileManager::RunRasterTask' ) { raster += e.dur; rasterN++; }
    if (e.name === 'Paint') paint += e.dur;
  }
  const d = frames.slice(1).map((x, i) => x - frames[i]);
  const secs = (frames.at(-1) - frames[0]) / 1000;
  const r = { name, fps: +(d.length / secs).toFixed(1), jank: d.filter((x) => x > 50).length, worst: Math.round(Math.max(...d)),
    rasterMs: Math.round(raster / 1000), rasterTasks: rasterN, paintMs: Math.round(paint / 1000), layers: drawn.length, layerMB: memMB, big };
  await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  return r;
}

const results = [];
results.push(await measure('ch1-start', async () => { await page.evaluate(() => window.__game.jump('ch1')); await page.waitForTimeout(5200); }));
results.push(await measure('prologue-orpheus', async () => { await page.evaluate(() => window.__game.jump('prologue.call')); await page.waitForTimeout(800); }));
console.log(label, JSON.stringify(results));
const file = `${OUT}/results.json`;
let all = {}; try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* новый файл */ }
all[label] = results;
writeFileSync(file, JSON.stringify(all, null, 1));
if (errors.length) console.log('ошибки:', errors.join(' | '));
await browser.close();
