import './styles/main.css';
import storyJson from 'virtual:story';
import { Game } from './engine/game';
import { boot } from './ui/menus';
import { allAssetUrls, bgUrl } from './engine/stage';
import { openCCTV } from './ui/cctv';
import { openBoard } from './ui/board';
import { openDoc } from './ui/docs';

const BGS = ['eva_apt', 'courtyard', 'mira_apt', 'canal', 'den', 'mnema', 'columbarium', 'hall', 'stairwell', 'taxi', 'dawn', 'key_art', 'cg_door', 'cg_reading', 'cg_stairs'];

function preload(urls: string[], onProgress: (k: number) => void): Promise<void> {
  let done = 0;
  return Promise.all(urls.map((u) => new Promise<void>((res) => {
    const img = new Image();
    img.onload = img.onerror = () => { done++; onProgress(done / urls.length); res(); };
    img.src = u;
  }))).then(() => undefined);
}

import { toggleFullscreen } from './ui/fullscreen';

import { audio } from './engine/audio';
import { pauseOpen } from './ui/menus';
import { panelOpen } from './ui/panels';
import { docOpen } from './ui/docs';

/** Мост для Android-приложения (APK): кнопка «Назад» и сворачивание. */
function setupAndroidBridge(game: Game) {
  const isApp = /AfterimageApp/.test(navigator.userAgent);
  document.documentElement.classList.toggle('app', isApp);
  const w = window as unknown as { __androidBack: () => string; __appPause: (on: boolean) => void };
  w.__androidBack = () => {
    const overlayOpen = pauseOpen() || panelOpen() || docOpen() || !!document.querySelector('.board, .cctv, .confirm, .ending-card');
    if (!game.inGame && !overlayOpen) return 'exit';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return 'ok';
  };
  w.__appPause = (on: boolean) => {
    const ctx = audio.ctx;
    if (!ctx) return;
    if (on) void ctx.suspend(); else void ctx.resume();
  };
}

async function main() {
  document.getElementById('fs-rotate')?.addEventListener('click', async () => {
    const err = await toggleFullscreen();
    if (err) alertBox(err);
  });
  const game = new Game(storyJson);
  setupAndroidBridge(game);
  (window as unknown as { __game: Game }).__game = game;
  (window as unknown as { __ui: unknown }).__ui = { openCCTV, openBoard, openDoc };
  const urls = [...BGS.map(bgUrl), ...allAssetUrls()];
  const loading = preload(urls, (k) => {
    const el = document.querySelector('.boot .load');
    if (el) el.textContent = k < 1 ? `ЗАГРУЗКА ${Math.round(k * 100)}%` : '';
  });
  await boot();
  await loading;
  game.title();
}
void main();

function alertBox(text: string) {
  const hint = document.getElementById('rotate-hint');
  if (!hint) return;
  let m = hint.querySelector('.msg') as HTMLElement | null;
  if (!m) { m = document.createElement('div'); m.className = 'msg'; hint.appendChild(m); }
  m.textContent = text;
}
