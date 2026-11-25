export interface CharDef {
  id: string;
  name: string;
  role: string;
  color: string;
  pitch: number; // высота «голоса» печати
  blip?: 'soft' | 'sys' | 'orpheus';
  portrait?: boolean; // есть ли портрет
  bio?: string;
}

export const CHARACTERS: Record<string, CharDef> = {
  eva: { id: 'eva', name: 'Ева Рейн', role: 'Инспектор-чтец ОПП', color: '#c9d6e0', pitch: 330, portrait: true },
  voron: { id: 'voron', name: 'Глеб Ворон', role: 'Капитан ОПП', color: '#d9b98a', pitch: 150, portrait: true },
  kessler: { id: 'kessler', name: 'Ноа Кесслер', role: '«Мнема» // Целостность', color: '#e8e2d2', pitch: 260, portrait: true },
  leo: { id: 'leo', name: 'Лео Варга', role: 'Бывший инженер «Мнемы»', color: '#f08a5d', pitch: 280, portrait: true },
  mira: { id: 'mira', name: 'Мира Аскольд', role: 'Инженер «Мнемы»', color: '#9fd3c1', pitch: 300, portrait: true },
  sonya: { id: 'sonya', name: 'Соня Рейн', role: 'Журналистка', color: '#f2c94c', pitch: 360, portrait: true },
  hass: { id: 'hass', name: 'Тимур Хаас', role: 'Муниципальная служба', color: '#f0883e', pitch: 170, portrait: true },
  orpheus: { id: 'orpheus', name: 'ОРФЕЙ', role: 'Аналитическая система ОПП', color: '#9fe8b0', pitch: 520, blip: 'orpheus' },
  sys: { id: 'sys', name: '', role: '', color: '#9fe8b0', pitch: 900, blip: 'sys' },
  voice: { id: 'voice', name: 'Голос', role: '', color: '#b9c0bc', pitch: 220 },
  thought: { id: 'thought', name: '', role: '', color: '#b7c3c8', pitch: 0 },
};

export const POSITIONS: Record<string, number> = {
  farleft: 360,
  left: 560,
  midleft: 760,
  center: 960,
  midright: 1160,
  right: 1360,
  farright: 1560,
};
