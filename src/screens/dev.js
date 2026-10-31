/**
 * GIMVERSE — раздел «Разработка»: ссылка на GimPrograms 3D Editor, мини-гайды,
 * импорт JSON-карты, настройка (название, описание, иконка, донаты) и публикация в сеть.
 */
import { h, toast, clear, pickFile, fileToImage, copyText, fmtBytes, confirmDialog } from '../core/ui.js';
import { store, upsertMap, uid, saveDraft, queueForSync, logAdmin } from '../core/store.js';
import { net } from '../core/net.js';
import { parseMapJson, validateMap, buildMap, sampleTower, sampleIsland } from '../three/mapLoader.js';
import { Stage } from '../three/preview.js';
import { PhysicsWorld } from '../three/engine.js';
import { launch } from '../core/library.js';
import { sfx } from '../core/audio.js';

export const EDITOR_URL = 'https://dimastwa0sopsi.github.io/Gim-Builder/';
export const EDITOR_REPO = 'https://github.com/Dimastwa0sopsi/Gim-Builder';

const ICONS = ['🏔️', '🏝️', '🏙️', '🌋', '🏰', '🚀', '💎', '🧱', '🎢', '🏎️', '⚽', '🎯', '🧟', '🐉', '🌲', '🌊', '🔥', '❄️', '🌙', '☄️', '🛸', '🏗️', '🗺️', '🎪', '🌈', '🧪', '🤖', '👾', '🎃', '🍄'];
const PERKS = [
  ['coins2', '×2 монеты в этой карте'],
  ['speed', 'Ускорение персонажа'],
  ['jump', 'Двойной прыжок'],
  ['vip', 'VIP-табличка в онлайне'],
  ['luck', 'Больше бонусов'],
  ['cosmetic', 'Косметический бонус'],
];

export function renderDev(root, api) {
  let tab = 'overview';
  const content = h('div.col', { style: { gap: 18 } });
  const tabs = h(
    'div.tabs',
    ...[
      ['overview', '📖 Обзор'],
      ['guides', '📚 Мини-гайды'],
      ['import', '🧱 Импорт и публикация'],
      ['schema', '📄 Формат JSON'],
      ['mine', '🗂️ Мои проекты'],
    ].map(([id, label]) =>
      h('button', {
        class: tab === id ? 'active' : '',
        onclick: (e) => {
          tab = id;
          [...tabs.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
          draw();
        },
      }, label)
    )
  );

  const el = h(
    'div.page.screen-fade',
    h(
      'div.page-head',
      h('div', h('h1', '🛠️ Отдел разработки'), h('p', 'Всё для создания своих 3D-миров: редактор GimPrograms, пошаговые гайды, импорт JSON и публикация карты с донатами.')),
      h('div.spacer'),
      h('a.btn.primary', { href: EDITOR_URL, target: '_blank', rel: 'noopener' }, '↗ Открыть GimPrograms 3D Editor')
    ),
    tabs,
    content
  );
  root.appendChild(el);

  function draw() {
    clear(content);
    if (tab === 'overview') content.appendChild(renderOverview(api));
    else if (tab === 'guides') content.appendChild(renderGuides());
    else if (tab === 'import') content.appendChild(renderImporter(api));
    else if (tab === 'schema') content.appendChild(renderSchema());
    else content.appendChild(renderMine(api));
  }
  draw();

  const off = store.subscribe((_s, p) => {
    if (p.event === 'library' && tab === 'mine') draw();
  });
  return () => off();
}

/* ============================================================
   Обзор
   ============================================================ */
function renderOverview(api) {
  const maps = store.library.maps;
  const published = maps.filter((m) => m.status === 'published').length;
  const pending = maps.filter((m) => (store.admin.moderation[m.id] || m.status) === 'pending').length;
  const queue = store.library.queue.length;

  return h(
    'div.dev-layout',
    h(
      'div.col',
      h(
        'section.card.glow',
        h('div.section-head', h('span', { style: { fontSize: 26 } }, '🧱'), h('h2', 'GimPrograms 3D Editor')),
        h('p.muted', { style: { marginTop: 8 } }, 'Мобильный редактор карт в браузере: собирайте уровни из блоков, накладывайте фото на грани, проверяйте карту в режиме игры и экспортируйте её одним JSON-файлом.'),
        h(
          'div.row.wrap',
          { style: { marginTop: 14 } },
          h('a.btn.primary', { href: EDITOR_URL, target: '_blank', rel: 'noopener' }, '↗ Открыть редактор'),
          h('a.btn.soft', { href: EDITOR_REPO, target: '_blank', rel: 'noopener' }, '🐙 Исходный код'),
          h('button.btn.ghost', { onclick: () => toast('Скопируйте JSON в редакторе (📋), затем вставьте его во вкладке «Импорт и публикация»', 'info', 6000) }, '❓ Как перенести карту')
        )
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '🔁 Путь карты от редактора до игры')),
        h(
          'div.list',
          { style: { marginTop: 10 } },
          [
            ['1', 'Соберите карту в редакторе: блоки, текстуры, физика.'],
            ['2', 'Нажмите 📋 «Скопировать JSON» (или 💾 «Сохранить» файлом).'],
            ['3', 'В GIMVERSE откройте «Импорт и публикация» и вставьте JSON.'],
            ['4', 'Проверьте карту в 3D-превью и тест-драйве.'],
            ['5', 'Заполните название, описание, иконку и донаты.'],
            ['6', 'Нажмите «Выложить в сеть» — карта уйдёт в каталог и другим игрокам.'],
          ].map(([n, t]) => h('div.item', h('div.avatar.sm', n), h('div.small.muted', t)))
        )
      )
    ),
    h(
      'div.col',
      h(
        'section.card',
        h('div.section-head', h('h2', '📊 Мои проекты')),
        h(
          'div.stat-grid',
          { style: { marginTop: 10 } },
          h('div.stat', h('small', 'Всего карт'), h('b', String(maps.length))),
          h('div.stat', h('small', 'Опубликовано'), h('b', String(published))),
          h('div.stat', h('small', 'На модерации'), h('b', String(pending))),
          h('div.stat', h('small', 'В очереди синхронизации'), h('b', String(queue)))
        ),
        queue ? h('p.hint', { style: { marginTop: 10 } }, `Очередь: ${queue} карт(ы) ждут подключения к серверу и уйдут автоматически.`) : null,
        h('button.btn.primary', { style: { marginTop: 12 }, onclick: () => api.go('dev') }, '🧱 Импорт JSON')
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '🌐 Статус сети')),
        h(
          'div.list',
          { style: { marginTop: 10 } },
          h('div.item', h('span.dot.' + (net.state === 'online' ? 'ok' : 'warn')), h('div', h('b', net.state === 'online' ? 'Сервер подключён' : net.state === 'connecting' ? 'Подключение…' : 'Локальный режим'), h('div.small.dim', net.url || 'адрес не задан'))),
          h('div.item', h('span', '👥'), h('div', h('b', `Игроков: ${net.count()}`), h('div.small.dim', 'видят ваши публикации в реальном времени')))
        ),
        h('p.hint', { style: { marginTop: 10 } }, 'Публикация работает и без сервера: карта сохраняется локально и ставится в очередь синхронизации.')
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '📜 Правила раздела')),
        h(
          'ul.small.muted',
          { style: { paddingLeft: 18, margin: '8px 0 0' } },
          ['Без оскорблений — уважайте других авторов.', 'Не выдавайте чужие карты за свои.', 'Не спамьте одинаковыми публикациями.', 'Сообщайте о багах администрации.', 'Делитесь картами — так платформа растёт.'].map((t) => h('li', t))
        )
      )
    )
  );
}

/* ============================================================
   Мини-гайды
   ============================================================ */
function guide(title, body, open = false) {
  return h(
    'details.guide',
    { open: open || undefined },
    h('summary', h('span', title), h('span.caret', '›')),
    h('div.g-body', body)
  );
}

function renderGuides() {
  return h(
    'div.col',
    h('div.section-head', h('h2', '📚 Мини-гайды по GimPrograms 3D Editor')),
    h('p.muted', 'Короткие инструкции: интерфейс, управление, создание карты, текстуры, экспорт и перенос в GIMVERSE.'),

    guide(
      '🧭 1. Знакомство с интерфейсом редактора',
      [
        h('p', 'Редактор открывается прямо в браузере по ссылке ', h('a', { href: EDITOR_URL, target: '_blank', rel: 'noopener' }, EDITOR_URL), '. Всё управление — на двух панелях.'),
        h(
          'ul',
          [
            h('li', h('b', 'Верхняя панель: '), '▶ Играть — проверка карты; 🎚️ качество; 🌞 день/ночь; ⛶ весь экран; 💾 сохранить файл; 📋 скопировать JSON; 📂 загрузить; ❓ справка.'),
            h('li', h('b', 'Нижняя панель: '), '➕ Блок — добавить куб; ⚙️ Настройки выбранного; 🔀 Move / 🔄 Rotate / 📐 Scale — режимы гизмо; 🗑 Удалить.'),
            h('li', h('b', 'Левая шторка '), 'открывается кнопкой ⚙️ и содержит точные значения позиции, вращения, размера, цвет, переключатель физики и кнопку «🖼️ Текстура».'),
          ]
        ),
        h('p', h('b', 'Важно: '), 'простой тап по блоку только выделяет его. Чтобы открыть настройки — нажмите ⚙️.'),
      ],
      true
    ),

    guide('🎮 2. Управление камерой и горячие клавиши', [
      h('p', 'Камера в редакторе свободная, как в шутере:'),
      h(
        'ul',
        [
          h('li', h('b', 'W / Ц'), ' — вперёд, ', h('b', 'S / Ы'), ' — назад, ', h('b', 'A / Ф'), ' — влево, ', h('b', 'D / В'), ' — вправо.'),
          h('li', h('b', 'Пробел'), ' — вверх, ', h('b', 'Shift'), ' или ', h('b', 'Ctrl'), ' — вниз.'),
          h('li', 'Мышь или свайп — осмотреться; колесо — приблизить.'),
          h('li', 'На телефоне работают экранные кнопки WASD, джойстик и кнопка прыжка.'),
        ]
      ),
      h('p', 'В режиме ▶ Играть персонаж бегает по вашей карте: WASD + пробел (прыжок), камера от третьего лица.'),
    ]),

    guide('🧱 3. Создание карты: пошагово', [
      h(
        'ol',
        [
          'Наведите камеру туда, где нужна платформа, и нажмите ➕ Блок — куб появится в центре экрана.',
          'Выделите блок тапом и нажмите ⚙️ Настройки: задайте размер (Scale), например 8 × 0.5 × 8 — получится плита.',
          'Режимом 🔀 Move разложите блоки по уровню, 🔄 Rotate — наклоните, 📐 Scale — растяните.',
          'Добавьте цвет: поле «Цвет» в шторке настроек. Цвет задаётся каждому блоку отдельно.',
          'Соберите маршрут: старт → препятствия → финиш. Держите прыжки достижимыми: разрыв не больше 3–4 блоков.',
          'Нажмите ▶ Играть и проверьте уровень персонажем. Вернитесь в редактор той же кнопкой.',
          'Сохраните: 💾 скачает JSON-файл, 📋 скопирует JSON в буфер обмена.',
        ]
      ),
      h('p', h('b', 'Совет: '), 'начинайте с 20–40 блоков. Большие карты тяжелее грузятся и медленнее публикуются.'),
    ]),

    guide('🖼️ 4. Текстуры и фото на гранях', [
      h(
        'ul',
        [
          'Выберите блок → ⚙️ Настройки → 🖼️ Текстура.',
          'Появится панель «Грани блока»: покрутите куб и нажмите на нужную сторону.',
          'Выберите фото — оно встанет только на эту грань. Повторное нажатие заменит картинку.',
          '«↔ Отразить» зеркалит изображение, «🧽 Грань» убирает картинку, «Сбросить все текстуры» чистит блок целиком.',
        ]
      ),
      h('p', 'Картинки хранятся внутри JSON как data-URL, поэтому файл с фото получается большим. В GIMVERSE такие карты импортируются полностью, но при нехватке места в браузере часть фото может быть отброшена — вы увидите предупреждение.'),
    ]),

    guide('⚙️ 5. Физика блоков', [
      h('p', 'Переключатель «Физика (динамический блок)» в настройках блока делает блок подвижным: в режиме ▶ Играть он падает и толкается.'),
      h('p', 'В GIMVERSE динамические блоки тоже падают при старте игры и ложатся на статику — из них получаются падающие ящики и ловушки. Если блоков с физикой больше 240, часть останется статичной для стабильности.'),
    ]),

    guide('📤 6. Экспорт и перенос карты в GIMVERSE', [
      h(
        'ol',
        [
          'В редакторе нажмите 📋 «Скопировать JSON».',
          'В GIMVERSE откройте «Разработка» → «Импорт и публикация».',
          'Вставьте JSON в большое поле и нажмите «Разобрать JSON». Увидите число блоков, размер и 3D-превью.',
          'Проверьте карту кнопкой «Тест-драйв» — она запустится как паркур.',
          'Заполните название, описание, выберите иконку и добавьте донаты.',
          'Нажмите «🌐 Выложить в сеть». Карта появится в каталоге «Игры» и у других подключённых игроков.',
        ]
      ),
      h('p', 'Если файла нет под рукой, нажмите «Пример» — подставится готовая карта-башня в том же формате.'),
    ]),

    guide('💝 7. Донаты карты', [
      h(
        'ul',
          [
            'Каждый донат — это иконка (эмодзи), название, цена в монетах и бонус игроку.',
            'Монеты игроки зарабатывают в играх: монеты на трассе, чекпоинты, финиш, очки арены.',
            'Бонусы: ×2 монеты, ускорение, двойной прыжок, VIP-табличка, удача, косметика.',
            'Цель сбора показывает прогресс на странице карты и мотивирует поддержать автора.',
          ]
      ),
    ]),

    guide('🩺 8. Если что-то пошло не так', [
      h(
        'ul',
          [
            h('li', '«Это не JSON» — скопировали не всё или вставили текст с описанием. Нужен только JSON, начинающийся с {."'),
            h('li', '«В JSON нет списка items» — файл не из GimPrograms 3D Editor или карта пустая.'),
            h('li', 'Карта не видна в превью — нажмите «Вписать в камеру» или уменьшите масштаб колесом.'),
            h('li', 'Публикация не уходит в сеть — карта сохранится локально и встанет в очередь синхронизации; проверьте адрес сервера в Настройках.'),
          ]
        ),
    ])
  );
}

/* ============================================================
   Импорт и публикация
   ============================================================ */
function renderImporter(api) {
  const jsonInput = h('textarea.input.code', { placeholder: '{\n  "version": 2,\n  "items": [ ... ]\n}\n\nВставьте сюда JSON из GimPrograms 3D Editor', spellcheck: 'false' });
  const statusLine = h('div.small.muted', 'JSON ещё не разобран');
  const previewCanvas = h('canvas');
  const nameInput = h('input.input', { maxlength: 40, placeholder: 'Например: Лесная башня' });
  const descInput = h('textarea.input', { maxlength: 280, rows: 3, placeholder: 'Короткое описание: о чём карта, как играть, что сложного' });
  const tagsInput = h('input.input', { placeholder: 'паркур, башня, соло' });
  const genreSelect = h(
    'select.input',
    ...[
      ['parkour', 'Паркур'],
      ['obby', 'Обби'],
      ['sandbox', 'Песочница'],
      ['arena', 'Арена'],
      ['other', 'Прочее'],
    ].map(([v, l]) => h('option', { value: v }, l))
  );
  const emojiGrid = h('div.grid-picker');
  const colorInput = h('input', { type: 'color', value: '#7c5cff' });
  const imageBtn = h('button.btn.sm.soft', '🖼️ Загрузить картинку');
  const iconPreview = h('div.avatar.lg', '🏔️');
  const donateToggle = h('div.toggle', { role: 'switch', 'aria-checked': 'true' });
  const goalInput = h('input.input', { type: 'number', min: 0, step: 50, value: 500 });
  const donateList = h('div.list');
  const publishBtn = h('button.btn.primary.lg', '🌐 Выложить в сеть');
  const draftBtn = h('button.btn.soft', '💾 Сохранить черновик');
  const testBtn = h('button.btn.soft', '🎮 Тест-драйв');

  let parsed = null;
  let preview = null;
  let stage = null;
  let raf = 0;
  let icon = { emoji: '🏔️', color: '#7c5cff', image: null };
  let donates = [
    { id: uid('don'), icon: '⚡', name: 'Ускорение', price: 100, perk: 'speed', desc: 'Быстрый бег на 5 минут' },
    { id: uid('don'), icon: '💰', name: 'Двойные монеты', price: 250, perk: 'coins2', desc: '×2 монеты на этой карте' },
  ];

  /* --- 3D-превью --- */
  stage = new Stage({ preset: 'empty' });
  stage.bindDrag(previewCanvas);
  stage.distance = 22;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    stage.renderTo(previewCanvas, { dt: 0.016, autoRotateSpeed: 0.06 });
  };
  raf = requestAnimationFrame(loop);

  function setPreview(data) {
    if (preview) {
      stage.scene.remove(preview.group);
      preview.dispose();
      preview = null;
    }
    if (!data) return;
    const built = buildMap(data, { world: new PhysicsWorld(8), shadows: true, maxBlocks: 4000 });
    preview = built;
    stage.scene.add(built.group);
    // границы считаем вручную — без импорта THREE в этот модуль
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const it of data.items) {
      const r = Math.max(...it.scale.map(Math.abs)) * 0.6;
      min = [Math.min(min[0], it.pos[0] - r), Math.min(min[1], it.pos[1] - r), Math.min(min[2], it.pos[2] - r)];
      max = [Math.max(max[0], it.pos[0] + r), Math.max(max[1], it.pos[1] + r), Math.max(max[2], it.pos[2] + r)];
    }
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const len = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    stage.target.set(cx, cy, cz);
    stage.distance = Math.max(8, len * 0.75);
    stage.pitch = 0.3;
  }

  /* --- разбор JSON --- */
  function parse(silent = false) {
    const text = jsonInput.value.trim();
    if (!text) {
      parsed = null;
      statusLine.textContent = 'JSON ещё не разобран';
      setPreview(null);
      return false;
    }
    const res = parseMapJson(text);
    if (!res.data) {
      parsed = null;
      statusLine.textContent = '';
      statusLine.appendChild(h('span', { style: { color: 'var(--danger)' } }, '⛔ ' + res.error));
      setPreview(null);
      if (!silent) {
        sfx.error();
        toast(res.error, 'err');
      }
      return false;
    }
    const check = validateMap(res.data, store.admin.limits);
    const stats = check.stats;
    parsed = res.data;
    clear(statusLine);
    statusLine.append(
      h('span', { style: { color: check.ok ? 'var(--ok)' : 'var(--danger)' } }, check.ok ? '✅ Карта разобрана' : '⛔ Есть ошибки'),
      ` · блоков: ${stats.blocks}`,
      ` · динамических: ${stats.dynamic}`,
      ` · с текстурами: ${stats.textured}`,
      ` · цветов: ${stats.colors}`,
      ` · размер JSON: ${fmtBytes(stats.jsonBytes)}`
    );
    for (const w of [...res.warnings, ...check.warnings]) statusLine.appendChild(h('div', { style: { color: 'var(--warn)' } }, '⚠️ ' + w));
    for (const e of check.errors) statusLine.appendChild(h('div', { style: { color: 'var(--danger)' } }, '⛔ ' + e));
    setPreview(parsed);
    if (!silent) {
      sfx.checkpoint();
      toast(`Карта загружена: ${stats.blocks} блоков`, 'ok');
    }
    return check.ok;
  }

  /* --- иконка --- */
  function renderEmoji() {
    clear(emojiGrid);
    for (const em of ICONS) {
      emojiGrid.appendChild(
        h('button.pick' + (icon.emoji === em ? '.active' : ''), { onclick: () => { icon.emoji = em; icon.image = null; renderEmoji(); updateIcon(); } }, h('span.em', em))
      );
    }
  }
  function updateIcon() {
    clear(iconPreview);
    iconPreview.style.background = `linear-gradient(140deg, ${icon.color}cc, ${icon.color}44)`;
    if (icon.image) iconPreview.appendChild(h('img', { src: icon.image, style: { width: '100%', height: '100%', objectFit: 'cover' } }));
    else iconPreview.textContent = icon.emoji;
  }
  colorInput.addEventListener('input', () => {
    icon.color = colorInput.value;
    updateIcon();
  });
  imageBtn.addEventListener('click', async () => {
    const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return;
      try {
        icon.image = await fileToImage(f, 256);
        updateIcon();
        toast('Иконка обновлена', 'ok');
      } catch {
        toast('Не удалось прочитать картинку', 'err');
      }
    });
    input.click();
  });

  /* --- донаты --- */
  function renderDonates() {
    clear(donateList);
    donates.forEach((d, i) => {
      const row = h(
        'div.donate-row',
        h('input.input', { value: d.icon, maxlength: 2, style: { textAlign: 'center', padding: '8px 4px' }, oninput: (e) => (d.icon = e.target.value) }),
        h('input.input', { value: d.name, maxlength: 28, placeholder: 'Название доната', oninput: (e) => (d.name = e.target.value) }),
        h('input.input', { type: 'number', min: 10, step: 10, value: String(d.price), title: 'Цена в монетах', oninput: (e) => (d.price = Math.max(0, Number(e.target.value) || 0)) }),
        h(
          'select.input',
          { onchange: (e) => (d.perk = e.target.value) },
          ...PERKS.map(([v, l]) => h('option', { value: v, selected: d.perk === v }, l))
        ),
        h('button.btn.icon.danger', { title: 'Удалить', onclick: () => { donates.splice(i, 1); renderDonates(); } }, '🗑')
      );
      donateList.appendChild(row);
    });
    donateList.appendChild(
      h(
        'button.btn.sm.soft',
        {
          onclick: () => {
            donates.push({ id: uid('don'), icon: '🎁', name: 'Поддержка автора', price: 50, perk: 'cosmetic', desc: '' });
            renderDonates();
          },
        },
        '＋ Добавить донат'
      )
    );
  }

  /* --- публикация --- */
  function buildMeta(status) {
    const now = Date.now();
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);
    const meta = {
      id: currentId || uid('map'),
      name: nameInput.value.trim() || 'Карта без названия',
      desc: descInput.value.trim(),
      icon: { ...icon },
      tags,
      genre: genreSelect.value,
      createdAt: currentCreated || now,
      updatedAt: now,
      authorId: store.profile.id,
      authorName: store.profile.name,
      map: parsed,
      blocks: parsed?.items?.length || 0,
      status,
      plays: store.stats.plays[currentId] || 0,
      likes: currentLikes || 0,
      donates: { enabled: donateToggle.getAttribute('aria-checked') === 'true', goal: Number(goalInput.value) || 0, items: donates.map((d) => ({ ...d })) },
      source: 'import',
    };
    return meta;
  }

  let currentId = null;
  let currentCreated = null;
  let currentLikes = 0;

  publishBtn.addEventListener('click', () => {
    if (!parse(true)) {
      toast('Сначала загрузите корректный JSON карты', 'warn');
      return;
    }
    if (!nameInput.value.trim()) {
      toast('Придумайте название карты', 'warn');
      nameInput.focus();
      return;
    }
    const autoApprove = ['owner', 'admin'].includes(store.profile.role);
    const status = autoApprove ? 'published' : 'pending';
    const meta = buildMeta(status);
    upsertMap(meta);
    currentId = meta.id;
    currentCreated = meta.createdAt;
    if (!autoApprove) store.admin.moderation[meta.id] = 'pending';
    logAdmin('publish.map', meta.name, `${meta.blocks} блоков`);

    const sent = net.publishMap(meta);
    if (!sent) {
      queueForSync(meta);
      toast('Карта опубликована локально и поставлена в очередь синхронизации', 'warn', 5000);
    } else {
      toast('Карта выложена в сеть 🎉', 'ok');
    }
    sfx.win();
    api.go('games');
  });

  draftBtn.addEventListener('click', () => {
    if (!parsed) {
      toast('Сначала разберите JSON', 'warn');
      return;
    }
    saveDraft({ id: currentId || uid('draft'), name: nameInput.value.trim() || 'Черновик', desc: descInput.value.trim(), icon: { ...icon }, map: parsed, donates: donates.map((d) => ({ ...d })), at: Date.now() });
    toast('Черновик сохранён', 'ok');
  });

  testBtn.addEventListener('click', () => {
    if (!parse(true)) {
      toast('Нужен корректный JSON', 'warn');
      return;
    }
    launch({
      id: currentId || 'preview-map',
      name: nameInput.value.trim() || 'Тест-драйв карты',
      desc: descInput.value.trim(),
      icon: { ...icon },
      tags: ['тест'],
      genre: genreSelect.value,
      authorId: store.profile.id,
      authorName: store.profile.name,
      map: parsed,
      builtin: 'obby',
      donates: null,
      preset: 'day',
    });
  });

  const pasteBtn = h('button.btn.sm.soft', { onclick: async () => { const t = await navigator.clipboard?.readText?.().catch(() => ''); if (t) { jsonInput.value = t; parse(); } else toast('Буфер обмена недоступен — вставьте вручную (Ctrl+V)', 'warn'); } }, '📋 Вставить');
  const fileBtn = h('button.btn.sm.soft', {
    onclick: async () => {
      const f = await pickFile();
      if (!f) return;
      jsonInput.value = f.text;
      if (!nameInput.value.trim()) nameInput.value = f.name.replace(/\.json$/i, '').slice(0, 40);
      parse();
    },
  }, '📁 Файл');
  const sampleBtn = h('button.btn.sm.ghost', {
    onclick: () => {
      const data = Math.random() > 0.5 ? sampleTower() : sampleIsland();
      jsonInput.value = JSON.stringify(data, null, 1);
      parse();
    },
  }, '✨ Пример');
  const clearBtn = h('button.btn.sm.ghost', { onclick: () => { jsonInput.value = ''; parse(true); statusLine.textContent = 'JSON ещё не разобран'; } }, '🧽 Очистить');

  jsonInput.addEventListener('blur', () => jsonInput.value.trim() && parse(true));

  const layout = h(
    'div.dev-layout',
    h(
      'div.col',
      h(
        'section.card',
        h('div.section-head', h('h2', '① Вставьте JSON карты'), h('div.spacer'), h('a.btn.sm.ghost', { href: EDITOR_URL, target: '_blank', rel: 'noopener' }, '↗ Открыть редактор')),
        h('p.muted', { style: { margin: '6px 0 10px' } }, 'В редакторе нажмите 📋 «Скопировать JSON», затем вставьте сюда. Поддерживаются версии 1 и 2, обёртка { map: … } и блоки с текстурами.'),
        jsonInput,
        h('div.row.wrap', { style: { marginTop: 10 } }, h('button.btn.sm.primary', { onclick: () => parse() }, '🔍 Разобрать JSON'), pasteBtn, fileBtn, sampleBtn, clearBtn),
        h('div', { style: { marginTop: 10 } }, statusLine)
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '② Настройте карту')),
        h(
          'div.col',
          { style: { marginTop: 10, gap: 12 } },
          h('div.field', h('label', 'Название'), nameInput),
          h('div.field', h('label', 'Описание'), descInput),
          h('div.row.wrap', h('div.field', { style: { flex: '1 1 160px' } }, h('label', 'Жанр'), genreSelect), h('div.field', { style: { flex: '2 1 220px' } }, h('label', 'Теги через запятую'), tagsInput)),
          h('div.field', h('label', 'Иконка'), h('div.row', iconPreview, h('div.col', { style: { gap: 8 } }, h('div.row', colorInput, imageBtn), h('span.hint', 'Эмодзи + цвет или своя картинка (сожмётся до 256 px)'))), emojiGrid)
        )
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '③ Донаты'), h('div.spacer'), donateToggle),
        h('p.hint', { style: { margin: '6px 0 10px' } }, 'Донаты покупаются за игровые монеты и дают бонус в этой карте.'),
        h('div.field', h('label', 'Цель сбора (монет)'), goalInput),
        h('div', { style: { height: 8 } }),
        donateList
      ),
      h('section.card', h('div.section-head', h('h2', '④ Публикация')), h('p.hint', { style: { margin: '8px 0 12px' } }, 'Карта уйдёт в каталог «Игры» и подключённым игрокам. Публикации новых авторов проходят модерацию в разделе «Администрация».'), h('div.row.wrap', publishBtn, draftBtn, testBtn))
    ),
    h(
      'div.col',
      h('section.preview-3d', previewCanvas, h('div.ovl-bar', h('span.badge', '3D-превью'), h('span.small.dim', 'перетащите — вращение, колесо — зум'))),
      h(
        'section.card',
        h('div.section-head', h('h2', '🔎 Что проверяется')),
        h(
          'div.list',
          { style: { marginTop: 10 } },
          ['Совместимость формата (v1/v2, обёртка map)', 'Число блоков и лимит платформы', 'Размер JSON и вес текстур', 'Динамические блоки (будут падать)', 'Наличие точки появления и финиша'].map((t) => h('div.item', h('span', '•'), h('div.small.muted', t)))
        )
      ),
      h(
        'section.card',
        h('div.section-head', h('h2', '⌨️ Быстрые команды')),
        h(
          'div.list',
          { style: { marginTop: 10 } },
          [h('div.item', h('span.kbd', 'Ctrl'), h('span.kbd', 'V'), h('div.small.muted', 'вставить JSON в поле')), h('div.item', h('span.kbd', 'Esc'), h('div.small.muted', 'пауза в тест-драйве'))]
        )
      )
    )
  );

  donateToggle.addEventListener('click', () => {
    const on = donateToggle.getAttribute('aria-checked') !== 'true';
    donateToggle.setAttribute('aria-checked', String(on));
  });

  renderEmoji();
  updateIcon();
  renderDonates();

  // авто-очистка при уходе с экрана
  layout.addEventListener('remove', () => {
    cancelAnimationFrame(raf);
    stage.dispose();
  });

  return layout;
}

/* ============================================================
   Формат JSON
   ============================================================ */
function renderSchema() {
  const example = JSON.stringify(
    {
      version: 2,
      items: [
        { kind: 'block', pos: [0, 0.5, 0], rot: [0, 0, 0], scale: [8, 1, 8], color: '#7c5cff', physics: false, faces: [null, null, null, null, null, null], faceFlip: [false, false, false, false, false, false] },
        { kind: 'block', pos: [0, 6, -4], rot: [0, 0.4, 0], scale: [1, 1, 1], color: '#22d3ee', physics: true, faces: [null, null, 'data:image/webp;base64,…', null, null, null], faceFlip: [false, false, true, false, false, false] },
      ],
    },
    null,
    2
  );

  const validatorText = h('textarea.input.code', { placeholder: 'Вставьте JSON для проверки', spellcheck: 'false' });
  const validatorOut = h('div.small.muted', 'Проверка ещё не запускалась');

  return h(
    'div.col',
    h(
      'section.card',
      h('div.section-head', h('h2', '📄 Формат карты GimPrograms')),
      h('p.muted', { style: { margin: '8px 0' } }, 'GIMVERSE принимает тот же JSON, который экспортирует редактор. Каждый элемент items — один блок-куб размером 1×1×1, растянутый полем scale.'),
      h(
        'div.list',
        [
          ['version', '1 или 2. Версия 1 — просто массив блоков.'],
          ['items[]', 'Список блоков. Другие kind игнорируются.'],
          ['kind', '"block" — единственный поддерживаемый тип.'],
          ['pos', '[x, y, z] — центр блока в метрах.'],
          ['rot', '[x, y, z] — поворот в радианах.'],
          ['scale', '[x, y, z] — размер блока (минимум 0.05).'],
          ['color', 'Цвет в формате #rrggbb.'],
          ['physics', 'true — динамический блок: в игре он упадёт и ляжет на опору.'],
          ['faces', '6 картинок (data-URL) для граней: +X, −X, +Y, −Y, +Z, −Z.'],
          ['faceFlip', '6 флагов зеркалирования граней.'],
        ].map(([k, v]) => h('div.item', h('code.mono', { style: { color: '#a5f3fc' } }, k), h('div.small.muted', v)))
      ),
      h('div.row.between', { style: { marginTop: 10 } }, h('span.tiny', 'Пример'), h('button.btn.sm.soft', { onclick: () => { copyText(example); toast('Пример скопирован', 'ok'); } }, '📋 Копировать')),
      h('pre', { style: { background: '#05070d', color: '#cfe3ff', padding: 14, borderRadius: 12, overflow: 'auto', fontSize: 12.3, fontFamily: 'var(--mono)', border: '1px solid rgba(255,255,255,.1)' } }, example)
    ),
    h(
      'section.card',
      h('div.section-head', h('h2', '🩺 Валидатор JSON')),
      h('p.muted', { style: { margin: '8px 0' } }, 'Проверьте карту до публикации: формат, число блоков, размер и предупреждения платформы.'),
      validatorText,
      h(
        'div.row.wrap',
        { style: { marginTop: 10 } },
        h('button.btn.sm.primary', {
          onclick: () => {
            const res = parseMapJson(validatorText.value);
            clear(validatorOut);
            if (!res.data) {
              validatorOut.appendChild(h('div', { style: { color: 'var(--danger)' } }, '⛔ ' + res.error));
              sfx.error();
              return;
            }
            const check = validateMap(res.data, store.admin.limits);
            validatorOut.appendChild(h('div', { style: { color: check.ok ? 'var(--ok)' : 'var(--danger)' } }, check.ok ? `✅ Всё в порядке: ${check.stats.blocks} блоков, ${fmtBytes(check.stats.jsonBytes)}` : '⛔ Карта не пройдёт публикацию'));
            for (const w of [...res.warnings, ...check.warnings]) validatorOut.appendChild(h('div', { style: { color: 'var(--warn)' } }, '⚠️ ' + w));
            for (const e of check.errors) validatorOut.appendChild(h('div', { style: { color: 'var(--danger)' } }, '⛔ ' + e));
            sfx.checkpoint();
          },
        }, '🔍 Проверить'),
        h('span.hint', 'Лимиты платформы задаёт администрация в разделе «Администрация».')
      ),
      h('div', { style: { marginTop: 10 } }, validatorOut)
    )
  );
}

/* ============================================================
   Мои проекты
   ============================================================ */
function renderMine(api) {
  const maps = store.library.maps;
  const drafts = store.library.drafts;
  const queue = store.library.queue;

  if (!maps.length && !drafts.length)
    return h(
      'section.card',
      h('div.empty', h('div.big', '🗂️'), h('b', 'Проектов пока нет'), h('div.small', 'Импортируйте JSON карты во вкладке «Импорт и публикация» — проект появится здесь.'), h('button.btn.primary', { onclick: () => api.go('dev') }, '🧱 Импортировать карту'))
    );

  return h(
    'div.col',
    queue.length
      ? h('section.card', h('div.section-head', h('span.dot.warn'), h('h2', 'Очередь синхронизации')), h('p.hint', { style: { marginTop: 8 } }, `${queue.length} карт(ы) ждут подключения к серверу. Они уйдут автоматически, как только соединение появится.`))
      : null,
    h(
      'section.card',
      h('div.section-head', h('h2', '🗂️ Мои карты'), h('div.spacer'), h('span.badge', `${maps.length}`)),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        maps.map((m) =>
          h(
            'div.item',
            h('div.avatar', m.icon?.image ? h('img', { src: m.icon.image, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : m.icon?.emoji || '🧱'),
            h('div', h('b', m.name), h('div.small.dim', `${m.blocks || m.map?.items?.length || 0} блоков · ▶ ${m.plays || store.stats.plays[m.id] || 0} · 💝 ${m.donates?.items?.length || 0}`)),
            h('div.spacer'),
            h('span.badge.' + ((store.admin.moderation[m.id] || m.status) === 'published' ? 'ok' : (store.admin.moderation[m.id] || m.status) === 'rejected' ? 'danger' : 'warn'), statusLabel(store.admin.moderation[m.id] || m.status)),
            h('button.btn.sm.soft', { onclick: () => launch(m) }, '▶ Играть'),
            h('button.btn.sm.ghost', {
              onclick: () => {
                copyText(JSON.stringify(m.map, null, 1));
                toast('JSON карты скопирован', 'ok');
              },
            }, '📋 JSON'),
            h('button.btn.sm.danger', {
              onclick: async () => {
                const ok = await confirmDialog({ title: 'Удалить карту', text: `Карта «${m.name}» будет удалена из библиотеки.`, ok: 'Удалить', danger: true });
                if (!ok) return;
                store.library.maps = store.library.maps.filter((x) => x.id !== m.id);
                store.save();
                store.notify({ event: 'library' });
                toast('Карта удалена', 'ok');
              },
            }, '🗑')
          )
        )
      )
    ),
    drafts.length
      ? h(
          'section.card',
          h('div.section-head', h('h2', '📝 Черновики')),
          h(
            'div.list',
            { style: { marginTop: 10 } },
            drafts.map((d) => h('div.item', h('div.avatar.sm', d.icon?.emoji || '📝'), h('div', h('b', d.name), h('div.small.dim', `${d.map?.items?.length || 0} блоков · сохранён ${new Date(d.at).toLocaleString('ru-RU')}`)), h('div.spacer'), h('span.small.dim', 'Черновик')))
          )
        )
      : null
  );
}

function statusLabel(s) {
  return { published: 'опубликована', pending: 'на модерации', rejected: 'отклонена', draft: 'черновик' }[s] || s;
}

