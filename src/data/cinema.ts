// Кат-сцены: озвученное вступление, трейлер и голос заставок глав.
// Только завязка — то, что игрок узнаёт в первые минуты. Никаких поздних локаций и сцен.
// Каждая реплика `vo` озвучена заранее (tools/voice): файл ищется по хешу «роль:текст».

export type VoRole = 'narrator' | 'orpheus' | 'sys';

export interface Shot {
  /** фон (id из assets/bg) или 'black' */
  bg: string;
  /** движение камеры: [x0, y0, масштаб0, x1, y1, масштаб1], сдвиг в % кадра */
  cam?: [number, number, number, number, number, number];
  /** озвученные фразы; пока звучит фраза, она же видна субтитром */
  vo?: { role: VoRole; text: string }[];
  /** субтитр без голоса (мысль героини, надпись) */
  sub?: string;
  /** крупная надпись по центру */
  card?: string;
  /** мелкая подпись над карточкой */
  kicker?: string;
  /** минимальная длительность кадра, мс */
  dur?: number;
  /** пауза после голоса, мс */
  tail?: number;
  sfx?: string[];
  fx?: 'glitch' | 'flash' | 'flicker' | 'lightning';
  rain?: 'off' | 'light' | 'heavy' | 'memory';
  music?: [string, number];
  /** длительность перехода в кадр, мс */
  fade?: number;
}

const N = (text: string) => ({ role: 'narrator' as const, text });
const O = (text: string) => ({ role: 'orpheus' as const, text });

/** Вступление перед прологом */
export const INTRO: Shot[] = [
  { bg: 'key_art', cam: [2, 3, 1.2, -1, 0, 1.06], rain: 'heavy', music: ['title', 0.3], fade: 2200, tail: 700, sfx: ['thunder'], fx: 'lightning',
    vo: [N('Порт-Ирис.'), N('Город, в котором никогда не прекращается дождь.')] },
  { bg: 'courtyard', cam: [-3, 0, 1.14, 3, -1, 1.08], rain: 'heavy', fade: 1600, tail: 600,
    vo: [N('Каждый житель старше шестнадцати носит за ухом «Свидетеля».'), N('Имплант помнит последние шесть часов: всё, что ты видел, слышал и чувствовал.')] },
  { bg: 'hall', cam: [0, 2, 1.04, 0, -1, 1.16], rain: 'off', fade: 1600, tail: 600, sfx: ['scan'],
    vo: [N('После смерти запись замирает. Её называют послеобразом.'), N('Чтецы Отдела посмертных показаний проживают последние минуты мёртвых и называют убийцу.')] },
  { bg: 'mnema', cam: [2, -1, 1.1, -2, 1, 1.04], rain: 'light', fade: 1600, tail: 900,
    vo: [N('Шесть лет город верит в одно правило.'), N('Шесть лет оно не ошибалось.')] },
  { bg: 'black', card: 'МЁРТВЫЕ НЕ ЛГУТ', fade: 900, tail: 1600, sfx: ['stinger'], fx: 'glitch', rain: 'off',
    vo: [{ role: 'sys', text: 'Мёртвые не лгут.' }] },
];

/** Трейлер (меню «Трейлер» на титульном экране) */
export const TRAILER: Shot[] = [
  { bg: 'black', kicker: 'ПОРТ-ИРИС · 01:47', dur: 2600, fade: 600, rain: 'heavy', music: ['tension', 0.25], sfx: ['thunder'] },
  { bg: 'key_art', cam: [0, 4, 1.25, 0, 0, 1.08], fade: 1400, tail: 500, fx: 'lightning', vo: [N('Порт-Ирис.')] },
  { bg: 'courtyard', cam: [3, 0, 1.12, -3, 0, 1.12], fade: 900, tail: 400, vo: [N('Здесь каждый носит за ухом «Свидетеля».')] },
  { bg: 'cg_reading', cam: [0, 0, 1.02, 0, -2, 1.14], fade: 900, tail: 500, rain: 'memory', sfx: ['rig_on'],
    vo: [N('Чтецы Отдела посмертных показаний проживают последние минуты мёртвых и называют убийцу.')] },
  { bg: 'eva_apt', cam: [-2, 0, 1.08, 1, 0, 1.18], fade: 700, dur: 3200, rain: 'heavy', music: ['insomnia', 0.4], sub: 'Без четверти два ночи. Я опять проснулась.' },
  { bg: 'eva_apt', cam: [1, 0, 1.18, 2, -1, 1.3], fade: 200, dur: 2600, fx: 'glitch', sfx: ['glitch'], sub: 'Мне снова снилась лестница.' },
  { bg: 'mira_apt', cam: [2, 1, 1.15, -2, 0, 1.06], fade: 500, tail: 600, rain: 'light', music: ['tension', 0.55], sfx: ['phone'],
    vo: [O('Инспектор. У нас новое дело.')] },
  { bg: 'taxi', cam: [0, 0, 1.06, 0, 0, 1.16], fade: 300, dur: 1900, rain: 'heavy', card: 'ОДНА НОЧЬ', sfx: ['whoosh'] },
  { bg: 'canal', cam: [3, 0, 1.16, -3, 0, 1.08], fade: 300, dur: 2200, card: 'КАЖДОЕ РЕШЕНИЕ НЕОБРАТИМО', sfx: ['whoosh'], music: ['confront', 0.5] },
  { bg: 'courtyard', cam: [0, 0, 1.3, 0, 0, 1.12], fade: 200, dur: 1500, fx: 'flash', sfx: ['heartbeat'] },
  { bg: 'black', card: 'МЁРТВЫЕ НЕ ЛГУТ', fade: 300, tail: 900, sfx: ['stinger'], fx: 'glitch', rain: 'off', vo: [{ role: 'sys', text: 'Мёртвые не лгут.' }] },
  { bg: 'black', card: 'AFTERIMAGE', kicker: 'ИНТЕРАКТИВНЫЙ ДЕТЕКТИВ', fade: 700, dur: 4200, sfx: ['boom'], music: ['title', 0.3] },
];

const ORD = ['Пролог', 'Глава первая', 'Глава вторая', 'Глава третья', 'Глава четвёртая', 'Глава пятая', 'Глава шестая'];

/** Текст, который диктор читает на заставке главы (тег `chapter: N / Название / Место`) */
export function chapterVo(n: number, title: string): string {
  const head = ORD[n] ?? `Глава ${n}`;
  const t = title.trim().replace(/[.!?…]+$/, '');
  return t ? `${head}. ${t}.` : `${head}.`;
}

/** Все озвучиваемые фразы кат-сцен — для генератора голоса */
export function cinemaLines(): { role: VoRole; text: string }[] {
  const out: { role: VoRole; text: string }[] = [];
  for (const s of [...INTRO, ...TRAILER]) for (const v of s.vo ?? []) out.push(v);
  return out;
}
