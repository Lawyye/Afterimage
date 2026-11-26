// Адреса ресурсов. В автономной сборке (dist/index.html) картинки встроены
// прямо в файл как data:-адреса; в веб-версии — загружаются по относительному пути.
import inline from 'virtual:assets';
const MAP = inline as Record<string, string>;
export const asset = (path: string): string => MAP[path] ?? path;
