// Полноэкранный режим: проверка поддержки, понятные сообщения, поворот экрана на телефонах.
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: (o?: unknown) => Promise<void> };

export const isFullscreen = () => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement);
export const fullscreenSupported = () => {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
};

/** Переключает полноэкранный режим. Возвращает текст ошибки для игрока или null. */
export async function toggleFullscreen(): Promise<string | null> {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  if (isFullscreen()) {
    try {
      await (document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.());
      return null;
    } catch {
      return 'Не удалось выйти из полноэкранного режима. Нажмите Esc или жест «назад».';
    }
  }
  if (!fullscreenSupported()) {
    return window.self !== window.top
      ? 'Полноэкранный режим недоступен во встроенном окне. Откройте игру отдельной вкладкой или файлом dist/index.html.'
      : 'Этот браузер не поддерживает полноэкранный режим. На телефоне используйте Chrome или Samsung Internet, либо добавьте страницу на главный экран.';
  }
  try {
    const req = el.requestFullscreen ? el.requestFullscreen.bind(el) : el.webkitRequestFullscreen!.bind(el);
    await req({ navigationUI: 'hide' } as FullscreenOptions);
  } catch (e) {
    return `Браузер не разрешил полноэкранный режим${e instanceof Error && e.message ? ` (${e.message})` : ''}. Попробуйте ещё раз нажатием или через меню браузера.`;
  }
  // на телефонах пробуем закрепить горизонтальную ориентацию (необязательно)
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch { /* поворот не поддерживается — не страшно */ }
  return null;
}
