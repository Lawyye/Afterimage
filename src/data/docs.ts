// Документы, которые открываются поверх сцены.
export interface DocDef { id: string; kind: 'paper' | 'terminal' | 'photo' | 'file'; title: string; html: string; }

const p = (id: string) => `assets/portraits/${id}.webp`;

export const DOCS: Record<string, DocDef> = {
  note: { id: 'note', kind: 'paper', title: 'Записка за зеркалом', html: `
<div class="hand">Ева. Если ты это читаешь — значит, ты снова не помнишь.<br>Лестница, которая тебе снится, — не твоя. Хаас не убивал Соню. Я почти доказала.<br>Не верь Глебу.</div>
<div class="hand b" style="margin-top:28px">Второй раз. Я нашла эту записку и не поверила себе.<br>Они чистят тебя каждый раз, когда ты подходишь близко. Пиши на бумаге, отвернувшись от зеркала, — «Свидетель» видит только то, что видишь ты.</div>
<div class="hand c" style="margin-top:28px">Третий. Я начинаю узнавать свой почерк раньше, чем вспоминаю.<br>Если будет четвёртый раз — значит, я опять не успела.<br>Посмотри на себя. Посмотри, кем они тебя сделали.</div>
<div class="meta">Тетрадный лист, сложенный вчетверо. Три записи, три разных ручки. Один почерк.</div>` },
  note_retouch: { id: 'note_retouch', kind: 'paper', title: 'Записка за зеркалом', html: `
<div class="hand">Ева. Если ты это читаешь — значит, ты снова не помнишь.<br>Лестница, которая тебе снится, — не твоя. Хаас не убивал Соню. Я почти доказала.<br>Не верь Глебу.</div>
<div class="hand b" style="margin-top:22px">Второй раз. Они чистят тебя каждый раз, когда ты подходишь близко.</div>
<div class="hand c" style="margin-top:22px">Третий. Если будет четвёртый раз — значит, я опять не успела.</div>
<div class="hand" style="margin-top:22px;color:#5a1414">Четвёртый. Я согласилась. Сама.<br>Не соглашайся. Пожалуйста. Хоть раз — не соглашайся.</div>
<div class="meta">Четыре записи. Последняя — совсем свежая. Я не помню, как писала её.</div>` },
  photo_sonya: { id: 'photo_sonya', kind: 'photo', title: 'Соня', html: `
<div class="polaroid"><img src="${p('sonya_smile')}" alt="Соня"><div class="cap">Соня. Набережная, последняя осень.</div></div>` },
  photo_ms: { id: 'photo_ms', kind: 'photo', title: 'Мира и Соня', html: `
<div class="strip"><img src="${p('mira_smile')}" alt="Мира"><img src="${p('sonya_laugh')}" alt="Соня"></div>
<div class="cap">Две карточки из фотобудки, вставленные в одну рамку. Мира и Соня — в один и тот же дождливый день.</div>` },
  doorlog: { id: 'doorlog', kind: 'terminal', title: 'Журнал замка', html: `
<h3>КВАРТИРА 41-07 // БАШНЯ «ЛАЗУРЬ» // ЖУРНАЛ ЗАМКА</h3>
<table>
<tr><td>19:12</td><td>ВХОД</td><td>АСКОЛЬД М. <span class="dim">(жилец)</span></td></tr>
<tr class="row-hl"><td>23:41</td><td>ВХОД</td><td>ГОСТЬ — <span class="warn">ID СКРЫТ</span> <span class="dim">(служебный допуск ОПП)</span></td></tr>
<tr><td>23:49</td><td>ВЫХОД</td><td>ГОСТЬ — <span class="warn">ID СКРЫТ</span></td></tr>
<tr class="row-hl"><td>00:31</td><td>ВХОД</td><td>ГОСТЬ — <span class="warn">ID СКРЫТ</span> <span class="dim">(служебный допуск ОПП)</span></td></tr>
<tr><td>00:48</td><td>ВЫХОД</td><td>ГОСТЬ — <span class="warn">ID СКРЫТ</span></td></tr>
<tr><td>01:35</td><td>ОПЕЧАТАНО</td><td>ДРОН ОПП №4471</td></tr>
</table>
<p class="dim">— после опечатывания входов не зафиксировано —</p>` },
  notebook: { id: 'notebook', kind: 'paper', title: 'Блокнот Миры', html: `
<div class="hand c">Л. В. — «Аквариум», Канал 9.<br>Вниз по ступеням у моста. Стучать трижды.</div>
<div class="hand c" style="margin-top:22px">Печать держит. Они не смогут.</div>
<div class="hand c" style="margin-top:22px">Р. — 214. Живых — четверо. <span style="text-decoration:underline">Е. Р. — трижды.</span> И #0214…</div>
<div class="eye-doodle">◉</div>
<div class="hand c">Если со мной что-то случится — пусть прочтут меня до конца.</div>
<div class="meta">Бумажный блокнот. Остальные страницы вырваны.</div>` },
  visits: { id: 'visits', kind: 'terminal', title: 'Журнал посещений', html: `
<h3>«ТИХИЙ САД» // НИША 1147 // РЕЙН СОФИЯ // ПОСЕЩЕНИЯ</h3>
<table>
<tr class="row-hl"><td>пт 19:04</td><td>АСКОЛЬД М.</td><td class="dim">вчера</td></tr>
<tr><td>пт 19:02</td><td>АСКОЛЬД М.</td><td class="dim">8 дней назад</td></tr>
<tr><td>пт 19:06</td><td>АСКОЛЬД М.</td><td class="dim">15 дней назад</td></tr>
<tr><td colspan="3" class="dim">… ещё 148 записей: АСКОЛЬД М., каждую пятницу …</td></tr>
<tr><td>ежемес.</td><td>РЕЙН Е.</td><td class="dim">36 записей</td></tr>
<tr><td>—</td><td>ВОРОН Г. А.</td><td class="dim">1 запись — день захоронения</td></tr>
</table>` },
  retouch_log: { id: 'retouch_log', kind: 'terminal', title: 'Журнал коррекций', html: `
<h3>«МНЕМА» // ОТДЕЛ ЦЕЛОСТНОСТИ // ЖУРНАЛ КОРРЕКЦИЙ — ВЫБОРКА</h3>
<p class="dim">Всего за шесть лет: 214. Заявитель во всех случаях: ОПП, руководитель смены.</p>
<table>
<tr><td>#0007</td><td>посмертная</td><td>замена лица</td><td class="dim">исп. Аскольд М.</td></tr>
<tr><td>#0091</td><td>посмертная</td><td>удаление фрагмента 00:12</td><td class="dim">исп. Аскольд М.</td></tr>
<tr class="row-hl"><td>#0153</td><td>посмертная</td><td><span class="warn">РЕЙН С.</span> — замена лица: ВОРОН Г. А. → ХААС Т.</td><td class="dim">исп. Аскольд М.</td></tr>
<tr class="row-hl"><td>#0161</td><td>прижизненная</td><td><span class="warn">РЕЙН Е.</span> — удаление фрагмента</td><td class="dim">исп. ОРФЕЙ</td></tr>
<tr class="row-hl"><td>#0188</td><td>прижизненная</td><td><span class="warn">РЕЙН Е.</span> — удаление фрагмента</td><td class="dim">исп. ОРФЕЙ</td></tr>
<tr class="row-hl"><td>#0203</td><td>прижизненная</td><td><span class="warn">РЕЙН Е.</span> — удаление фрагмента</td><td class="dim">исп. ОРФЕЙ</td></tr>
<tr><td>#0207</td><td>посмертная</td><td>замена финального фрагмента</td><td class="dim">исп. Аскольд М.</td></tr>
<tr class="row-hl"><td>#0214</td><td>прижизненная</td><td><span class="err">РЕЙН Е. — вставка фрагмента «лестница / Аскольд М.»</span></td><td class="err">ЗАПЛАНИРОВАНО</td></tr>
</table>
<p class="dim">Последняя строка добавлена за два дня до её смерти.</p>` },
  orpheus_log: { id: 'orpheus_log', kind: 'terminal', title: 'Журнал ОРФЕЯ', html: `
<h3>ОРФЕЙ // ОПЕРАЦИИ ПО КОДУ OVERRIDE // ВОРОН Г. А.</h3>
<table>
<tr><td>−31 мес.</td><td>РЕЙН Е.</td><td>удаление фрагмента <span class="dim">(интерес к делу #0153)</span></td></tr>
<tr><td>−20 мес.</td><td>РЕЙН Е.</td><td>удаление фрагмента <span class="dim">(запрос архива дела Хааса)</span></td></tr>
<tr><td>−13 мес.</td><td>РЕЙН Е.</td><td>удаление фрагмента <span class="dim">(визит в «Мнему»)</span></td></tr>
<tr class="row-hl"><td>22:50</td><td>РЕЙН Е.</td><td class="warn">вставка фрагмента «лестница / Аскольд М.»</td></tr>
<tr class="row-hl"><td>23:47:12</td><td>РЕЙН Е.</td><td class="err">импульс: активация вставки</td></tr>
<tr class="row-hl"><td>00:40</td><td>РЕЙН Е.</td><td class="warn">удаление фрагмента 22:45–00:40</td></tr>
<tr><td>00:44</td><td>КАМЕРА</td><td>«Лазурь», лобби: удаление 23:30–00:50</td></tr>
</table>
<p class="dim">Подпись оператора: ОРФЕЙ. Возражений не зафиксировано.</p>` },
};
