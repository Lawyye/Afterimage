// Рендер превью (портреты/фоны) в PNG для визуальной проверки.
// node tools/preview/run.mjs <entry.ts> <out.png> [query] [width] [height] [scale] [crop:x,y,w,h]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { resolve } from 'node:path';
const [entry, out, query = '', w = '1960', h = '1300', scale = '1', crop] = process.argv.slice(2);
const r = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'iife', loader: { '.webp': 'dataurl', '.png': 'dataurl' } });
const js = r.outputFiles[0].text;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
await page.evaluate((q) => { window.__Q = q; }, query);
await page.addScriptTag({ content: js });
await page.waitForTimeout(300);
const opts = { path: out, fullPage: !crop };
if (crop) { const [x, y, cw, ch] = crop.split(',').map(Number); opts.clip = { x, y, width: cw, height: ch }; }
await page.screenshot(opts);
await browser.close();
console.log('saved', out);
