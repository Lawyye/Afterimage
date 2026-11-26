// Запись трейлера в видео: кадры — CDP screencast, звук — MediaRecorder на выходе звукового движка.
// node tools/trailer/record.mjs [выход.mp4]   (нужен ffmpeg; по умолчанию dist/Afterimage-trailer.mp4)
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = resolve(process.argv[2] ?? 'dist/Afterimage-trailer.mp4');
const tmp = resolve('build-tmp/trailer');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(tmp, 'f'), { recursive: true });
const W = 1280, H = 720;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-gpu-rasterization'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForTimeout(500);
await page.locator('.boot').click();
await page.waitForTimeout(1500);
// интерфейс записи не должен попасть в кадр
await page.addStyleTag({ content: '.cine-skip { display: none !important; } .tip { display: none !important; }' });

// звук: ответвление от общей шины движка в MediaRecorder
await page.evaluate(() => {
  const a = window.__ui.audio;
  const dest = a.ctx.createMediaStreamDestination();
  a.master.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  window.__rec = { rec, chunks, t0: 0 };
});

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  frames.push({ t: f.metadata.timestamp, data: f.data });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await page.waitForTimeout(300);
// трейлер целиком; запись звука и видео отсчитывается от нажатия «Трейлер»
const started = Date.now();
const audioStart = await page.evaluate(() => {
  window.__rec.rec.start();
  const t = Date.now() / 1000;
  [...document.querySelectorAll('.menu-btn')].find((b) => b.textContent.includes('Трейлер')).click();
  return t;
});
await page.waitForTimeout(1500);
await page.waitForFunction(() => !document.querySelector('.cine'), null, { timeout: 180000, polling: 250 });
const len = (Date.now() - started) / 1000;
const audioB64 = await page.evaluate(() => new Promise((res) => {
  const r = window.__rec;
  r.rec.onstop = async () => {
    const buf = await new Blob(r.chunks, { type: 'audio/webm' }).arrayBuffer();
    let s = '';
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    res(btoa(s));
  };
  r.rec.stop();
}));
await cdp.send('Page.stopScreencast');
await browser.close();
writeFileSync(join(tmp, 'audio.webm'), Buffer.from(audioB64, 'base64'));

// кадры с реальными временными метками → ровные 30 кадров/с
const t0 = audioStart;
const list = [];
frames.forEach((f, i) => {
  const name = `f/${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(tmp, name), Buffer.from(f.data, 'base64'));
  const next = frames[i + 1]?.t ?? f.t + 1 / 30;
  if (f.t + (next - f.t) < t0) return;
  list.push(`file '${name}'\nduration ${Math.max(0.001, next - Math.max(f.t, t0)).toFixed(4)}`);
});
list.push(list.at(-1).split('\n')[0]);
writeFileSync(join(tmp, 'frames.txt'), list.join('\n') + '\n');
const fps = frames.length / ((frames.at(-1).t - frames[0].t) || 1);
console.log(`[trailer] ${len.toFixed(1)} с, кадров ${frames.length} (~${fps.toFixed(0)}/с)`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'), '-i', join(tmp, 'audio.webm'),
  '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k', '-af', 'afade=t=out:st=' + Math.max(0, len - 1.2).toFixed(2) + ':d=1.2',
  '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (errors.length) console.log('ошибки страницы:', errors.join(' | '));
console.log('[trailer]', out);
