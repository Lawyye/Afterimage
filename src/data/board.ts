// Доска расследования: вопросы, на которые игрок отвечает, связывая две улики.
export interface Deduction {
  id: string; // переменная ded_<id>
  question: string;
  answer: string;
  pairs: [string, string][]; // допустимые пары улик (id без ev_)
  hint: string;
}

export const DEDUCTIONS: Deduction[] = [
  { id: 'where', question: 'Где я была этой ночью?', answer: 'Я была в башне «Лазурь». Это моё пальто промокло под этим дождём.',
    pairs: [['coat', 'doorlog'], ['coat', 'cctv'], ['coat', 'frames'], ['pistol', 'doorlog'], ['coat', 'afterimage']],
    hint: 'Что говорит о том, что я выходила? И что связывает меня с её домом?' },
  { id: 'authentic', question: 'Может ли запись с моим лицом быть подделкой?', answer: 'Нет. На послеобразе Миры стоит Печать — Ретушь его не берёт. Всё, что в нём, — правда.',
    pairs: [['retouch', 'seal'], ['afterimage', 'seal']],
    hint: 'Как подделывают послеобразы — и что может этому помешать?' },
  { id: 'voron_there', question: 'Кто стёр терминал Миры?', answer: 'Глеб. Он «уже глянул» терминал, хотя квартиру опечатали, а после — никто не входил. Он был там в 00:31.',
    pairs: [['voron_words', 'doorlog'], ['frames', 'doorlog'], ['frames', 'terminal'], ['voron_words', 'frames']],
    hint: 'Кто говорил о терминале? И когда в квартиру можно было войти?' },
  { id: 'rewritten', question: 'Почему я ничего не помню?', answer: 'Мою память переписали. Через служебный канал ОПП, в 22:50.',
    pairs: [['gap', 'service'], ['retouch', 'service'], ['gap', 'retouch']],
    hint: 'Что подключалось к моему импланту — и что умеет это подключение?' },
  { id: 'sonya', question: 'Кто убил Соню?', answer: 'Глеб Ворон. Тимур Хаас невиновен — его лицо вклеили в её послеобраз.',
    pairs: [['original', 'hass'], ['original', 'log'], ['original', 'photo']],
    hint: 'Нужен настоящий послеобраз Сони.' },
  { id: 'loop', question: 'Сколько раз это уже было?', answer: 'Не в первый раз. Меня переписывали снова и снова — каждый раз, когда я подходила к правде. Я оставляла себе записки.',
    pairs: [['note', 'orpheus_log'], ['note', 'log']],
    hint: 'Что я оставляла себе сама — и где записаны мои стирания?' },
];
