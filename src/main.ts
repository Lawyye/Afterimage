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

async function main() {
  const game = new Game(storyJson);
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
