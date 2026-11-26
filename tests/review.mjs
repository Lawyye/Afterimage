// Регрессии по внешнему код-ревью: уход затемнённого портрета, выбор стороны, дождь 30 кадров/с на телефоне,
// вспышка лица не уводит персонажа, гонка фонов, таймер выбора на паузе, лимит уведомлений.
// node tests/review.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('dist/index.html'));
await page.waitForTimeout(400);
await page.locator('.boot').tap();
await page.waitForTimeout(900);
await page.evaluate(() => window.__game.jump('ch1'));
await page.waitForTimeout(6500); // заставка главы прошла, сценарий ждёт на реплике и сам ничего не меняет

// 1. затемнённый уходящий портрет гаснет полностью
await page.evaluate(() => { const s = window.__game.stage; s.hide('all'); s.show('voron', 'neutral', 'left'); s.show('eva', 'neutral', 'right'); s.setSpeaker('eva'); });
await page.waitForTimeout(1200);
ok(await page.evaluate(() => document.querySelector('.pt[data-id=voron]').classList.contains('dim')), 'тест: Ворон должен быть затемнён');
await page.evaluate(() => window.__game.stage.hide('voron'));
await page.waitForTimeout(420);
const op = await page.evaluate(() => { const e = document.querySelector('.pt[data-id=voron]'); return e ? +getComputedStyle(e).opacity : 0; });
ok(op < 0.05, `уходящий затемнённый портрет не погас: opacity ${op}`);

// 2. персонаж без указанной стороны не выталкивает соседа, если другая сторона свободна
await page.evaluate(() => { const s = window.__game.stage; s.hide('all'); });
await page.waitForTimeout(600);
await page.evaluate(() => { const s = window.__game.stage; s.show('voron', 'neutral', 'left'); s.show('leo', 'neutral'); });
await page.waitForTimeout(300);
const sides = await page.evaluate(() => window.__game.stage.snapshot().portraits.map((p) => p.id + ':' + p.side).sort().join(','));
ok(sides === 'leo:right,voron:left', 'авто-выбор стороны: ' + sides);

// 3. вспышка лица (flashpt) не уводит персонажа со сцены
await page.evaluate(async () => { const g = window.__game; await g.preTags(['flashpt: voron angry'], g.token); });
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__game.stage.snapshot().portraits.map((p) => p.id + ':' + p.side + ':' + p.expr).sort().join(','));
ok(/voron:left:neutral/.test(after), 'после вспышки персонаж пропал или сменил место: ' + after);

// 4. гонка фонов: быстрый A→B — виден только B, подсветка полей тоже от B
await page.evaluate(() => { const s = window.__game.stage; s.setBg('canal', 0.2); s.setBg('den', 0.2); });
await page.waitForTimeout(1500);
const bgs = await page.evaluate(() => [...document.querySelectorAll('#bg-layer .bg.on img')].map((i) => i.src.split('/').pop().slice(0, 40)));
ok(bgs.length === 1, 'после быстрой смены фонов видно фонов: ' + bgs.length);
ok(await page.evaluate(() => window.__game.stage.bgId) === 'den', 'текущий фон не тот');

// 5. дождь на телефоне — не чаще ~30 кадров/с
ok(await page.evaluate(() => window.__game.stage.weather.lowfx === true), 'дождь не знает, что это телефон');
const rainFps = await page.evaluate(() => new Promise((res) => {
  const w = window.__game.stage.weather; w.set('heavy');
  const c = document.getElementById('weather').getContext('2d'); const orig = c.clearRect.bind(c); let n = 0;
  c.clearRect = (...a) => { n++; return orig(...a); };
  setTimeout(() => { n = 0; setTimeout(() => { c.clearRect = orig; res(n); }, 1000); }, 600);
}));
ok(rainFps <= 34 && rainFps >= 15, `дождь рисуется ${rainFps} раз/с (ожидалось ~30)`);
await page.evaluate(() => window.__game.stage.weather.set('off'));

// 6. таймер выбора стоит, пока открыта пауза
const g = 'window.__game';
await page.evaluate(() => {
  const gm = window.__game;
  window.__timerResult = null;
  gm.choices.present([{ kind: 'normal', text: 'А', index: 0 }, { kind: 'system', id: 'timeout', text: '@@timeout', index: 1 }], 1.2, gm.token).then((i) => (window.__timerResult = i));
});
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok(await page.locator('.pause').isVisible(), 'пауза не открылась поверх выбора');
await page.waitForTimeout(2200);
ok(await page.evaluate(() => window.__timerResult) === null, 'таймер выбора истёк, пока была открыта пауза');
await page.keyboard.press('1');
await page.waitForTimeout(300);
ok(await page.evaluate(() => window.__timerResult) === null, 'цифра выбрала вариант при открытой паузе');
await page.keyboard.press('Escape');
await page.waitForTimeout(2200);
ok(await page.evaluate(() => window.__timerResult) === 1, 'после паузы таймер не дошёл до конца');

// 8. рот ходит между тремя положениями, а не только «открыт/закрыт»
const levels = await page.evaluate(() => new Promise((res) => {
  const s = window.__game.stage; s.hide('all'); s.show('eva', 'neutral', 'right'); s.setSpeaker('eva');
  setTimeout(() => {
    s.mouth(true);
    const seen = new Set(); const img = document.querySelector('.pt[data-id=eva] .pt-talk');
    const t = setInterval(() => seen.add(img.style.opacity), 20);
    setTimeout(() => { clearInterval(t); s.mouth(false); res([...seen]); }, 1500);
  }, 900);
}));
ok(levels.some((v) => +v > 0.05 && +v < 0.95), 'рот без промежуточных положений: ' + levels.join(','));

// 9. ростовой персонаж: ноги у нижнего края, три места без пересечений; поза меняется тегом и сохраняется в снимке
await page.evaluate(() => {
  const d = window.__ui.definePortrait;
  for (const id of ['voron', 'leo', 'eva']) d(id + '_tf', { full: true, exprs: { neutral: {} }, poses: { crossed: { exprs: { neutral: {} } } } });
  const s = window.__game.stage; s.hide('all');
  s.show('voron_tf', 'neutral', 'left'); s.show('leo_tf', 'neutral', 'center'); s.show('eva_tf', 'neutral', 'right');
});
await page.waitForTimeout(1200);
const boxes = await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  return [...document.querySelectorAll('.pt.pt-full.on')].map((p) => { const r = p.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, h: r.height, sb: st.bottom, sh: st.height }; });
});
ok(boxes.length === 3, 'ростовых на сцене: ' + boxes.length);
ok(boxes.every((b) => Math.abs(b.b - b.sb) < 2 && Math.abs(b.h / b.sh - 980 / 1080) < 0.02), 'ростовые не стоят у нижнего края или неверной высоты: ' + JSON.stringify(boxes[0]));
const sorted = [...boxes].sort((a, b) => a.l - b.l);
ok(sorted[0].r <= sorted[1].l + 1 && sorted[1].r <= sorted[2].l + 1, 'ростовые фигуры пересекаются');
await page.evaluate(async () => { const g = window.__game; await g.preTags(['pose: leo_tf crossed'], g.token); });
ok(await page.evaluate(() => window.__game.stage.snapshot().portraits.find((p) => p.id === 'leo_tf')?.pose) === 'crossed', 'тег pose не сменил позу');
await page.evaluate(async () => { const g = window.__game; await g.preTags(['pose: voron nosuchpose', 'pose: eva crossed'], g.token); });
ok(await page.evaluate(() => window.__game.stage.snapshot().portraits.every((p) => p.id !== 'voron_tf' || !p.pose)), 'несуществующая поза не должна применяться');
await page.evaluate(() => window.__game.stage.hide('all'));

// 10. касание по боковому полю вытянутого экрана листает текст (800×360 — поля по ~80 точек)
await page.evaluate(() => window.__game.jump('ch1'));
await page.waitForFunction(() => !document.querySelector('.chapter-card') && window.__game.dialogue.waiting, null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); });
await page.waitForTimeout(300);
const t0 = await page.locator('.dlg .text').textContent();
await page.touchscreen.tap(30, 150);
await page.waitForTimeout(600);
ok((await page.locator('.dlg .text').textContent()) !== t0, 'касание по боковому полю не листает текст');

// 11. справочник терминов: открыт базовый набор, закрытые термины не показаны
await page.evaluate(() => window.__game.hudAction('journal'));
await page.waitForTimeout(400);
await page.locator('.panel .tabs button', { hasText: 'Термины' }).tap();
await page.waitForTimeout(300);
const terms = await page.locator('.panel .person h4').allTextContents();
ok(terms.includes('Послеобраз') && !terms.includes('Ретушь'), 'справочник терминов: ' + terms.join(', '));
await page.locator('.panel .close').tap();
await page.waitForTimeout(300);

// 12. сохранение со старой версии сценария: глава начинается заново, решения и находки переносятся
await page.evaluate(() => window.__game.jump('ch2', { chapter: 2, knows_leo: true, trust_orpheus: 2 }));
await page.waitForTimeout(6000);
await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); });
await page.waitForTimeout(300);
await page.evaluate(() => { window.__game.save('s5'); const k = 'afterimage.v1.save.s5'; const d = JSON.parse(localStorage.getItem(k)); d.storyHash = 'old-version'; localStorage.setItem(k, JSON.stringify(d)); });
await page.evaluate(() => window.__game.load('s5'));
await page.waitForTimeout(800);
ok(await page.locator('.toast', { hasText: 'Сохранение из прошлой версии' }).count() === 1, 'нет сообщения о старом сохранении');
await page.waitForTimeout(5000);
const mig = await page.evaluate(() => ({ ch: window.__game.story.variablesState.$('chapter'), leo: window.__game.story.variablesState.$('knows_leo'), t: window.__game.story.variablesState.$('trust_orpheus') }));
ok(mig.ch === 2 && mig.leo === true && mig.t === 2, 'старое сохранение потеряло решения: ' + JSON.stringify(mig));
await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); });
await page.waitForTimeout(300);
const tm = await page.locator('.dlg .text').textContent();
for (let i = 0; i < 2; i++) { await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); d.advance(); }); await page.waitForTimeout(600); }
ok((await page.locator('.dlg .text').textContent()) !== tm || await page.locator('.choices .choice').count() > 0, 'после загрузки старого сохранения игра не идёт дальше');
await page.evaluate(() => localStorage.removeItem('afterimage.v1.save.s5'));

// 13. карточка главы пропускается касанием
await page.evaluate(() => window.__game.jump('ch1'));
await page.waitForTimeout(900);
ok(await page.locator('.chapter-card').count() === 1, 'нет карточки главы');
await page.touchscreen.tap(400, 180);
await page.waitForTimeout(900);
ok(await page.locator('.chapter-card').count() === 0, 'карточка главы не пропускается касанием');
await page.waitForTimeout(2500);

// 14. авточтение стоит, пока открыта пауза, и продолжается после
await page.evaluate(() => { const d = window.__game.dialogue; if (d.typing) d.advance(); });
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.dialogue.setAuto(true));
await page.waitForTimeout(150);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const pa = await page.locator('.dlg .text').textContent();
await page.waitForTimeout(6000);
ok((await page.locator('.dlg .text').textContent()) === pa, 'авточтение листает текст при открытой паузе');
await page.keyboard.press('Escape');
await page.waitForTimeout(6000);
ok((await page.locator('.dlg .text').textContent()) !== pa, 'после паузы авточтение не продолжилось');
await page.evaluate(() => window.__game.dialogue.setAuto(false));

// 15. **жирный** и *курсив* в тексте реплики
await page.evaluate(() => { const g = window.__game; void g.dialogue.show({ speaker: null, expr: null, text: '**Жирный** и *курсив*', tags: [] }, g.token, true, true); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => { const t = document.querySelector('.dlg .text'); return !!t.querySelector('.strong') && t.textContent === 'Жирный и курсив'; }), 'разметка **жирного** разбирается неверно');

// 16. отметка «выбирали раньше» и подтверждение перезаписи сохранения
await page.evaluate(() => {
  const gm = window.__game;
  void gm.choices.present([{ kind: 'normal', text: 'Тестовый вариант прошлого', index: 0 }], 0, gm.token);
});
await page.waitForTimeout(500);
await page.locator('.choices .choice').first().tap();
await page.waitForTimeout(800);
await page.evaluate(() => { const gm = window.__game; void gm.choices.present([{ kind: 'normal', text: 'Тестовый вариант прошлого', index: 0 }, { kind: 'normal', text: 'Новый', index: 1 }], 0, gm.token); });
await page.waitForTimeout(500);
ok(await page.locator('.choices .choice.was .past').count() === 1, 'нет отметки «выбирали раньше»');
await page.locator('.choices .choice').nth(1).tap();
await page.waitForTimeout(800);

// 7. уведомлений одновременно не больше трёх
await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__game.toast('ev', 'Тест', 'уведомление ' + i); });
ok(await page.locator('.toasts .toast').count() <= 3, 'уведомлений больше трёх');

void g;
ok(!errors.length, 'ошибки: ' + errors.join(' | '));
await browser.close();
if (fails.length) { console.log('ПРОВАЛЕНО:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('OK: регрессии по код-ревью закрыты');
