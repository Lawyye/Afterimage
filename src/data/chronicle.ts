// Хроника решений в духе блок-схемы: что выбрано в этом прохождении,
// что открыто в прошлых, что ещё остаётся «???».
export type Vars = Record<string, number | boolean | string>;
export interface ChronOpt { id: string; text: string; when: (v: Vars) => boolean; }
export interface ChronRow { id: string; label: string; opts: ChronOpt[]; }
export interface ChronChapter { n: number; title: string; rows: ChronRow[]; }

const eq = (k: string, val: number | boolean | string) => (v: Vars) => v[k] === val;

export const CHRONICLE: ChronChapter[] = [
  { n: 0, title: 'Бессонница', rows: [
    { id: 'c0_orpheus', label: 'Голос в темноте', opts: [
      { id: '1', text: '«Не твоё дело»', when: eq('c0_orpheus', 1) },
      { id: '2', text: '«Ты тоже не спишь»', when: eq('c0_orpheus', 2) },
      { id: '3', text: '«Что случилось?»', when: eq('c0_orpheus', 3) },
    ] },
    { id: 'c0_dream', label: 'Что вам снится?', opts: [
      { id: '1', text: 'Лестница', when: eq('c0_dream', 1) },
      { id: '2', text: 'Ничего', when: eq('c0_dream', 2) },
      { id: '3', text: '«Отключись»', when: eq('c0_dream', 3) },
    ] },
    { id: 'c0_note', label: 'За зеркалом', opts: [
      { id: 'y', text: 'Записка найдена', when: eq('ev_note', true) },
      { id: 'n', text: 'Не найдена', when: eq('ev_note', false) },
    ] },
  ] },
  { n: 1, title: 'Мёртвые не лгут', rows: [
    { id: 'c1_voron', label: 'Первый вопрос', opts: [
      { id: '1', text: '«Ты уверен?»', when: eq('c1_voron', 1) },
      { id: '2', text: '«Кто её нашёл?»', when: eq('c1_voron', 2) },
      { id: '3', text: '«Начинаю»', when: eq('c1_voron', 3) },
    ] },
    { id: 'c1_report', label: 'Результат чтения', opts: [
      { id: '1', text: 'Правда капитану', when: eq('c1_report', 1) },
      { id: '2', text: 'Просьба к ОРФЕЮ', when: eq('c1_report', 2) },
      { id: '3', text: 'Ложь', when: eq('c1_report', 3) },
      { id: '4', text: 'Молчание', when: eq('c1_report', 4) },
    ] },
    { id: 'c1_cat', label: 'Свидетель на лежанке', opts: [
      { id: '0', text: 'Не замечен', when: eq('c1_cat', 0) },
      { id: '1', text: 'Погладить', when: (v) => v.c1_cat === 1 && !v.cat_saved },
      { id: 's', text: 'Забрать с собой', when: eq('cat_saved', true) },
      { id: '2', text: 'Отогнать', when: eq('c1_cat', 2) },
    ] },
    { id: 'c1_niche', label: 'Обратная сторона фото', opts: [
      { id: 'y', text: 'Номер найден', when: eq('knows_niche', true) },
      { id: 'n', text: 'Не найден', when: eq('knows_niche', false) },
    ] },
  ] },
  { n: 2, title: 'Ретушь', rows: [
    { id: 'c2_call', label: 'Звонок капитана', opts: [
      { id: '0', text: 'Не звонил', when: eq('c2_call', 0) },
      { id: '1', text: 'Рассказать всё', when: eq('c2_call', 1) },
      { id: '2', text: '«Пока ничего»', when: eq('c2_call', 2) },
    ] },
    { id: 'c2_first', label: 'Первый адрес', opts: [
      { id: '1', text: 'Канал 9', when: eq('c2_first', 1) },
      { id: '2', text: 'Башня «Мнемы»', when: eq('c2_first', 2) },
    ] },
    { id: 'c2_hass', label: 'Человек с метлой', opts: [
      { id: '0', text: 'Не встречен', when: eq('c2_hass', 0) },
      { id: '1', text: 'Пройти мимо', when: eq('c2_hass', 1) },
      { id: '2', text: 'Разговор', when: eq('c2_hass', 2) },
      { id: '3', text: 'Шарф', when: eq('c2_hass', 3) },
    ] },
    { id: 'c2_cleaners', label: 'Белые маски', opts: [
      { id: '0', text: 'Не пришли', when: (v) => v.c2_cleaners === 0 && v.leo_met === true },
      { id: '1', text: 'Бежать вместе', when: eq('c2_cleaners', 1) },
      { id: '2', text: 'Задержать', when: eq('c2_cleaners', 2) },
      { id: '3', text: 'Отойти в сторону', when: eq('c2_cleaners', 3) },
      { id: '4', text: 'Не успеть', when: eq('c2_cleaners', 4) },
    ] },
    { id: 'c2_leo', label: 'Лео Варга', opts: [
      { id: 'x', text: 'Не встречен', when: eq('leo_met', false) },
      { id: 't', text: 'Доверился', when: (v) => v.leo_met === true && (v.trust_leo as number) >= 2 && !v.leo_taken },
      { id: 'f', text: 'Сбежал', when: eq('leo_fled', true) },
      { id: 'n', text: 'Не доверился', when: (v) => v.leo_met === true && (v.trust_leo as number) < 2 && !v.leo_fled && !v.leo_taken },
      { id: 'k', text: 'Схвачен', when: eq('leo_taken', true) },
    ] },
    { id: 'c2_kessler', label: 'Ноа Кесслер', opts: [
      { id: 'x', text: 'Не встречена', when: eq('kessler_met', false) },
      { id: '0', text: 'Разговор', when: (v) => v.kessler_met === true && v.c2_kessler === 0 },
      { id: '1', text: 'Сделка', when: eq('c2_kessler', 1) },
      { id: '2', text: 'Угроза', when: eq('c2_kessler', 2) },
      { id: '3', text: 'Отказ', when: eq('c2_kessler', 3) },
    ] },
  ] },
  { n: 3, title: 'Ниша 1147', rows: [
    { id: 'c3_orpheus', label: 'ОРФЕЙ', opts: [
      { id: '1', text: 'Исповедь', when: eq('c3_orpheus', 1) },
      { id: '4', text: 'Промолчал', when: eq('c3_orpheus', 4) },
      { id: '2', text: 'Донёс', when: eq('c3_orpheus', 2) },
      { id: '3', text: 'Отключён', when: eq('c3_orpheus', 3) },
    ] },
    { id: 'c3_deep', label: 'За порогом', opts: [
      { id: '0', text: 'Недоступно', when: eq('c3_deep', 0) },
      { id: '1', text: 'Прочесть до конца', when: eq('c3_deep', 1) },
      { id: '2', text: 'Отказаться', when: eq('c3_deep', 2) },
    ] },
    { id: 'c3_copy', label: 'Копия архива', opts: [
      { id: '0', text: 'Некому отправить', when: eq('c3_copy', 0) },
      { id: '1', text: 'Отправлена Лео', when: eq('c3_copy', 1) },
      { id: '2', text: 'Не отправлена', when: eq('c3_copy', 2) },
    ] },
  ] },
  { n: 4, title: 'Сверка', rows: [
    { id: 'c4_end', label: 'Финал', opts: [
      { id: 'witness', text: 'Свидетель', when: eq('ending', 'witness') },
      { id: 'eurydice', text: 'Эвридика', when: eq('ending', 'eurydice') },
      { id: 'shared', text: 'Общая память', when: eq('ending', 'shared') },
      { id: 'retouch', text: 'Ретушь', when: eq('ending', 'retouch') },
      { id: 'vengeance', text: 'Возмездие', when: eq('ending', 'vengeance') },
      { id: 'clean', text: 'Чистка', when: eq('ending', 'clean') },
    ] },
  ] },
];
