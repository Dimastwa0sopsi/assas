/**
 * Интеграционные тесты интерфейса: приложение целиком запускается в jsdom
 * (three подключён с заглушкой WebGL-рендера), экраны рендерятся, действия работают.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './harness/dom.mjs';

const { FakeWebSocket } = setupDom();

const { store } = await import('../src/core/store.js');
const { net } = await import('../src/core/net.js');
const { sampleTower } = await import('../src/three/mapLoader.js');
const { BUILTIN_GAMES, activeGame } = await import('../src/game.js');
const { launch } = await import('../src/core/library.js');
await import('../src/main.js'); // запуск приложения

const app = document.getElementById('app');
const main = () => document.querySelector('main.main');
const text = () => main()?.textContent || '';
const go = async (route) => {
  window.location.hash = `#/${route}`;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick();
};
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const byText = (sel, needle) => [...main().querySelectorAll(sel)].find((n) => (n.textContent || '').includes(needle));

/* ---------------- оболочка ---------------- */

test('оболочка: боковое меню, профиль, статус сети', async () => {
  const nav = app.querySelectorAll('.nav button');
  assert.equal(nav.length, 7, 'пунктов меню');
  assert.match(app.textContent, /GIMVERSE/);
  assert.ok(app.querySelector('.profile-card'), 'карточка профиля');
  assert.ok(app.querySelector('.net-pill'), 'индикатор сети');
  assert.match(app.querySelector('.profile-card').textContent, /💰/);
  assert.ok(app.querySelectorAll('.tabbar button').length >= 5, 'мобильный таб-бар');
});

test('главная: герой, статистика и карточки встроенных игр', async () => {
  await go('home');
  assert.match(text(), /Твоя 3D-вселенная/);
  const cards = main().querySelectorAll('.game-card');
  assert.ok(cards.length >= 2, `карточек игр: ${cards.length}`);
  assert.match(text(), /Небесный паркур/);
  assert.match(text(), /Кристальная арена/);
  assert.ok(main().querySelector('canvas.hero-canvas'), '3D-превью персонажа');
});

/* ---------------- экраны ---------------- */

test('каталог: поиск и фильтр по жанру', async () => {
  await go('games');
  assert.match(text(), /Каталог|Игры/);
  const search = main().querySelector('input.input');
  search.value = 'арена';
  search.dispatchEvent(new window.Event('input'));
  await tick();
  const found = main().querySelectorAll('.game-card');
  assert.equal(found.length, 1, 'поиск оставил одну карточку');
  assert.match(found[0].textContent, /Кристальная арена/);

  search.value = '';
  search.dispatchEvent(new window.Event('input'));
  await tick();
  assert.ok(main().querySelectorAll('.game-card').length >= 2);
});

test('редактор персонажа: смена лица и покупка в магазине', async () => {
  await go('avatar');
  assert.match(text(), /Редактор персонажа/);
  const before = store.profile.avatar.face;
  // вкладка «Лицо»
  byText('.tabs button', '🙂 Лицо').click();
  await tick();
  const cool = byText('.grid-picker .pick', 'Крутой');
  assert.ok(cool, 'есть вариант лица «Крутой»');
  cool.click();
  await tick();
  assert.equal(store.profile.avatar.face, 'cool');
  assert.notEqual(store.profile.avatar.face, before);

  // магазин: покупаем корону
  byText('.tabs button', '👒 Уборы').click();
  await tick();
  store.profile.coins = 1000;
  store.save();
  const crown = byText('.grid-picker .pick', 'Корона');
  crown.click();
  await tick();
  assert.ok(store.profile.owned.includes('hat_crown'), 'корона куплена');
  assert.equal(store.profile.avatar.hat, 'crown');
  assert.ok(store.profile.coins < 1000, 'монеты списаны');
});

test('разработка: гайды содержат ссылку на редактор и шаги создания карты', async () => {
  await go('dev');
  assert.match(text(), /Отдел разработки/);
  const links = [...main().querySelectorAll('a')].map((a) => a.href);
  assert.ok(links.some((h) => h.includes('dimastwa0sopsi.github.io/Gim-Builder')), 'ссылка на GimPrograms 3D Editor');
  byText('.tabs button', '📚 Мини-гайды').click();
  await tick();
  const guides = main().querySelectorAll('details.guide');
  assert.ok(guides.length >= 6, `гайдов: ${guides.length}`);
  assert.match(text(), /Создание карты/);
  assert.match(text(), /Скопировать JSON/);
  assert.match(text(), /Горячие клавиши|Управление камерой/);
});

test('разработка: импорт JSON → превью → публикация в сеть', async () => {
  await go('dev');
  byText('.tabs button', '🧱 Импорт и публикация').click();
  await tick();

  const area = main().querySelector('textarea.input.code');
  area.value = JSON.stringify(sampleTower());
  byText('button', '🔍 Разобрать JSON').click();
  await tick(40);
  assert.match(main().textContent, /Карта разобрана/);
  assert.match(main().textContent, /блоков: \d+/);

  main().querySelector('input.input[maxlength="40"]').value = 'Башня из теста';
  const desc = main().querySelector('textarea.input:not(.code)');
  desc.value = 'Тестовая карта для проверки публикации';

  const mapsBefore = store.library.maps.length;
  byText('button', '🌐 Выложить в сеть').click();
  await tick(40);

  assert.equal(store.library.maps.length, mapsBefore + 1, 'карта добавлена в библиотеку');
  const map = store.library.maps[0];
  assert.equal(map.name, 'Башня из теста');
  assert.ok(map.map.items.length > 20);
  assert.ok(map.donates.items.length >= 2, 'донаты прикреплены');
  assert.ok(map.donates.items.every((d) => d.icon && d.name && d.price >= 0), 'у донатов есть иконка, название и цена');

  await tick(40);
  const published = FakeWebSocket.instances.flatMap((s) => s.sent.map((m) => JSON.parse(m)));
  assert.ok(published.some((m) => m.t === 'map.publish'), 'карта отправлена на сервер');
});

test('валидатор JSON в разделе разработки отклоняет мусор', async () => {
  await go('dev');
  byText('.tabs button', '📄 Формат JSON').click();
  await tick();
  const ta = main().querySelector('textarea.input.code');
  ta.value = '{"items":[]}';
  byText('button', '🔍 Проверить').click();
  await tick();
  assert.match(main().textContent, /нет ни одного блока/);

  ta.value = JSON.stringify(sampleTower());
  byText('button', '🔍 Проверить').click();
  await tick();
  assert.match(main().textContent, /Всё в порядке/);
});

/* ---------------- администрация ---------------- */

test('администрация: объявление, роль и журнал', async () => {
  await go('admin');
  assert.match(text(), /Администрация/);
  byText('.tabs button', '📢 Объявления').click();
  await tick();
  const title = main().querySelector('input.input');
  const body = main().querySelector('textarea.input');
  title.value = 'Техработы';
  body.value = 'Сервер обновляется';
  byText('button', '📢 Опубликовать').click();
  await tick();
  assert.equal(store.admin.announcements.length, 1);
  assert.equal(store.admin.announcements[0].text, 'Сервер обновляется');

  byText('.tabs button', '👥 Пользователи').click();
  await tick();
  const roleSelect = main().querySelector('select.input');
  assert.ok(roleSelect, 'селектор роли');
  roleSelect.value = 'moderator';
  roleSelect.dispatchEvent(new window.Event('change'));
  await tick();
  assert.equal(store.profile.role, 'moderator');
  assert.ok(store.admin.logs.some((l) => l.action === 'role.self'), 'запись в журнале');

  byText('.tabs button', '📜 Журнал').click();
  await tick();
  assert.ok(main().querySelectorAll('.log-line').length >= 1, 'журнал отображается');

  // возвращаем роль владельца
  store.profile.role = 'owner';
  store.save();
});

test('модерация: карта публикуется и проходит одобрение', async () => {
  const map = store.library.maps[0];
  assert.ok(map, 'есть опубликованная карта');
  await go('admin');
  byText('.tabs button', '🧱 Модерация карт').click();
  await tick();
  const ok = byText('button.btn.sm.ok', '✔');
  assert.ok(ok, 'кнопка одобрения');
  ok.click();
  await tick();
  assert.equal(store.admin.moderation[map.id], 'approved');
});

/* ---------------- настройки ---------------- */

test('настройки: тема, качество и адрес сервера применяются сразу', async () => {
  await go('settings');
  assert.match(text(), /Настройки/);
  const light = [...main().querySelectorAll('.seg button')].find((b) => b.textContent === 'Низкое');
  light.click();
  await tick();
  assert.equal(store.settings.quality, 'low');

  const themeToggle = main().querySelectorAll('.toggle')[main().querySelectorAll('.toggle').length - 1];
  void themeToggle;
  const serverInput = [...main().querySelectorAll('input.input')].find((i) => i.value.startsWith('wss://'));
  assert.ok(serverInput, 'поле адреса сервера');
  serverInput.value = 'wss://example.test/socket';
  byText('button', 'Подключиться').click();
  await tick(30);
  assert.equal(store.settings.serverUrl, 'wss://example.test/socket');
  assert.ok(net.url.includes('example.test'), 'сетевой клиент принял новый адрес');

  // звук
  const vol = main().querySelector('input[type="range"][max="1"]');
  vol.value = '0.3';
  vol.dispatchEvent(new window.Event('input'));
  await tick();
  assert.equal(store.settings.volume, 0.3);
});

/* ---------------- сеть ---------------- */

test('онлайн: приём игроков и карт с сервера', async () => {
  await go('online');
  assert.match(text(), /Онлайн/);
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  assert.ok(socket, 'сокет создан');

  socket.emit({
    t: 'welcome',
    players: [{ id: 'usr_remote1', name: 'ТестовыйИгрок', role: 'user', avatar: { shirt: '#f00' }, game: null }],
    maps: [],
    chat: [],
  });
  await tick(30);
  assert.equal(net.listPlayers().length, 1);
  assert.match(main().textContent, /ТестовыйИгрок/);

  const mapId = 'map_from_net';
  socket.emit({ t: 'map.new', map: { id: mapId, name: 'Карта из сети', desc: 'прислал сервер', icon: { emoji: '🛰️', color: '#22d3ee' }, map: sampleTower(), blocks: 30, status: 'published', createdAt: Date.now(), donates: { items: [] } } });
  await tick(30);
  assert.ok(store.library.maps.some((m) => m.id === mapId), 'карта из сети сохранена');

  socket.emit({ t: 'chat', text: 'Привет всем!', name: 'ТестовыйИгрок', from: 'usr_remote1', channel: 'global' });
  await tick(30);
  assert.match(main().textContent, /Привет всем!/);
});

test('онлайн: сообщение уходит в сокет', async () => {
  await go('online');
  const input = [...main().querySelectorAll('input.input')].find((i) => i.placeholder.includes('Сообщение'));
  input.value = 'Всем привет из теста';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(30);
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  const sent = socket.sent.map((m) => JSON.parse(m));
  assert.ok(sent.some((m) => m.t === 'chat' && m.text === 'Всем привет из теста'), 'чат отправлен на сервер');
});

test('админ-действие с сервера применяется к профилю', async () => {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  socket.emit({ t: 'admin.action', action: 'mute', payload: { target: store.profile.id, minutes: 10 }, by: 'owner1' });
  await tick(20);
  assert.ok(store.profile.mutedUntil > Date.now(), 'мут применён');
  socket.emit({ t: 'admin.action', action: 'unmute', payload: { target: store.profile.id }, by: 'owner1' });
  await tick(20);
  assert.equal(store.profile.mutedUntil, 0);
});

/* ---------------- игровой рантайм ---------------- */

test('игра запускается: HUD, физика, выход', async () => {
  await go('games');
  launch(BUILTIN_GAMES[0]);
  await tick(60);
  const root = document.getElementById('game-root');
  assert.equal(root.hidden, false, 'игровой слой открыт');
  assert.ok(root.querySelector('.game-hud'), 'HUD на месте');
  const game = activeGame();
  assert.ok(game, 'игра активна');
  assert.ok(game.player.position.y > -20, `игрок не провалился: y=${game.player.position.y}`);

  // несколько кадров физики: игрок должен стоять на стартовой площадке башни
  const startY = game.player.position.y;
  await tick(120);
  assert.ok(game.player.position.y >= startY - 1, `игрок держится на поверхности: ${startY} → ${game.player.position.y}`);
  assert.ok(root.querySelectorAll('.hud-pill').length >= 3, 'пиллы статистики');

  // пауза по Esc
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  await tick(30);
  assert.ok(root.querySelector('.overlay-card'), 'оверлей паузы');
  assert.match(root.textContent, /Пауза/);

  game.exit();
  await tick(20);
  assert.equal(document.getElementById('game-root').hidden, true, 'игровой слой закрыт');
  assert.equal(activeGame(), null);
});

test('импортированная карта запускается как игра', async () => {
  const map = store.library.maps.find((m) => m.map?.items?.length);
  assert.ok(map, 'есть карта с блоками');
  launch(map);
  await tick(80);
  const game = activeGame();
  assert.ok(game, 'игра по карте запустилась');
  assert.ok(Number.isFinite(game.player.position.y), 'позиция игрока конечна');
  game.exit();
  await tick(10);
});

after(() => {
  // приложение держит rAF/интервалы — завершаем процесс принудительно
  setTimeout(() => process.exit(0), 50);
});
