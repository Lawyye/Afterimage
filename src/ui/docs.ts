import { el } from '../engine/util';
import { audio } from '../engine/audio';
import { DOCS } from '../data/docs';
import { overlayRoot } from './api';

let open = false;
export const docOpen = () => open;

export function openDoc(id: string): Promise<void> {
  const d = DOCS[id];
  if (!d) return Promise.resolve();
  open = true;
  audio.sfx(d.kind === 'terminal' ? 'typing' : 'paper');
  return new Promise((resolve) => {
    const root = overlayRoot();
    const bg = el('div', 'panel-bg');
    const wrap = el('div', 'doc-wrap');
    const doc = el('div', `doc ${d.kind === 'photo' ? 'photo' : d.kind}`);
    doc.innerHTML = (d.kind === 'paper' ? `<h3>${d.title}</h3>` : '') + d.html;
    const btn = el('button', 'doc-close', 'ЗАКРЫТЬ  ⏎');
    wrap.append(doc);
    root.append(bg, wrap, btn);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      open = false;
      audio.sfx('back');
      window.removeEventListener('keydown', onKey, true);
      bg.remove(); wrap.remove(); btn.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'Enter', ' ', 'Space'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); close(); }
    };
    // клавиши подключаются с задержкой (чтобы Enter, открывший документ, его же не закрыл);
    // если документ успели закрыть раньше — не подключаем, иначе обработчик «съест» клавиши навсегда
    setTimeout(() => { if (!closed) window.addEventListener('keydown', onKey, true); }, 250);
    btn.addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  });
}
