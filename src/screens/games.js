/**
 * GIMVERSE — каталог игр: поиск, фильтры, сортировка, карточки.
 */
import { h, clear } from '../core/ui.js';
import { store } from '../core/store.js';
import { filterGames, gridOf, launch, openGameInfo } from '../core/library.js';
import { sfx } from '../core/audio.js';

const GENRES = [
  ['all', '🌐 Все'],
  ['obby', '🏔️ Обби'],
  ['arena', '💎 Арены'],
  ['parkour', '🧗 Паркур'],
  ['sandbox', '🏝️ Песочницы'],
  ['other', '🧩 Прочее'],
];

export function renderGames(root, api) {
  let state = { search: '', genre: 'all', sort: 'popular', mine: false };

  const grid = h('div.game-grid');
  const count = h('span.badge');

  const search = h('input.input', { placeholder: '🔎 Поиск по названию, описанию, тегам…', value: state.search });
  search.addEventListener('input', () => {
    state.search = search.value;
    draw();
  });

  const chips = h(
    'div.chips',
    GENRES.map(([id, label]) =>
      h('button.chip' + (state.genre === id ? '.active' : ''), {
        onclick: (e) => {
          state.genre = id;
          [...chips.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
          sfx.tap();
          draw();
        },
      }, label)
    )
  );

  const sortSeg = h(
    'div.seg',
    ...[
      ['popular', 'Популярные'],
      ['new', 'Новые'],
      ['rating', 'По лайкам'],
      ['coins', 'С донатами'],
    ].map(([id, label]) =>
      h('button', {
        class: state.sort === id ? 'active' : '',
        onclick: (e) => {
          state.sort = id;
          [...sortSeg.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
          draw();
        },
      }, label)
    )
  );

  const mineToggle = h('div.toggle', { role: 'switch', 'aria-checked': 'false', onclick: () => { state.mine = !state.mine; mineToggle.setAttribute('aria-checked', String(state.mine)); draw(); } });

  function draw() {
    const list = filterGames(state);
    clear(grid);
    grid.appendChild(gridOf(list, { onOpen: openGameInfo }));
    count.textContent = `Найдено: ${list.length}`;
  }

  const totalPlays = Object.values(store.stats.plays).reduce((a, b) => a + b, 0);
  const records = Object.entries(store.stats.best).length;

  const el = h(
    'div.page.screen-fade',
    h(
      'div.page-head',
      h('div', h('h1', '🎮 Игры'), h('p', 'Встроенные 3D-игры и карты, собранные в GimPrograms 3D Editor и опубликованные сообществом.')),
      h('div.spacer'),
      h('button.btn.soft', { onclick: () => { const l = filterGames(); launch(l[Math.floor(Math.random() * l.length)]); } }, '🎲 Случайная игра'),
      h('button.btn.primary', { onclick: () => api.go('dev') }, '＋ Создать игру')
    ),

    h(
      'section.stat-grid',
      h('div.stat', h('small', 'Всего игр'), h('b', String(filterGames().length))),
      h('div.stat', h('small', 'Моих запусков'), h('b', String(totalPlays))),
      h('div.stat', h('small', 'Рекордов'), h('b', String(records))),
      h('div.stat', h('small', 'Монеты'), h('b', String(store.profile.coins)))
    ),

    h('section.card', h('div.row.wrap', search, chips, h('div.spacer'), sortSeg), h('div.row', { style: { marginTop: 12 } }, mineToggle, h('span.t', 'Только мои карты'), h('div.spacer'), count)),

    h('section', grid),

    h(
      'section.card',
      h('div.section-head', h('h2', '💡 Как добавить свою игру')),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        [
          ['1️⃣', 'Соберите карту в GimPrograms 3D Editor и нажмите «Скопировать JSON».'],
          ['2️⃣', 'Вставьте JSON в разделе «Разработка» → «Импорт и публикация».'],
          ['3️⃣', 'Настройте название, описание, иконку и донаты.'],
          ['4️⃣', 'Нажмите «Выложить в сеть» — карта появится в этом каталоге у всех подключённых игроков.'],
        ].map(([n, t]) => h('div.item', h('span', n), h('div.small.muted', t)))
      ),
      h('button.btn.primary', { style: { marginTop: 12 }, onclick: () => api.go('dev') }, '🛠️ Открыть раздел разработки')
    )
  );

  root.appendChild(el);
  draw();

  const off = store.subscribe((_s, p) => {
    if (p.event === 'library' || p.event === 'stats' || p.event === 'coins') draw();
  });
  return () => off();
}
