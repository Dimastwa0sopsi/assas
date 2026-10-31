/**
 * GIMVERSE — настройки: профиль, графика, звук, управление, сеть, данные.
 */
import { h, toast, downloadFile, pickFile, confirmDialog } from '../core/ui.js';
import { store, updateSettings, updateProfile, exportState, importState, resetAll } from '../core/store.js';
import { net } from '../core/net.js';
import { sfx } from '../core/audio.js';
import { syncVolume } from '../core/audio.js';
import { EDITOR_URL, EDITOR_REPO } from './dev.js';

const QUALITIES = [
  ['low', 'Низкое'],
  ['medium', 'Среднее'],
  ['high', 'Высокое'],
];

export function renderSettings(root, api) {
  const s = store.settings;

  const seg = (key, options, onChange) =>
    h(
      'div.seg',
      ...options.map(([v, l]) =>
        h('button', {
          class: store.settings[key] === v ? 'active' : '',
          onclick: (e) => {
            updateSettings({ [key]: v });
            [...e.target.parentNode.children].forEach((c) => c.classList.remove('active'));
            e.target.classList.add('active');
            onChange?.(v);
            sfx.tap();
          },
        }, l)
      )
    );

  const toggle = (key, label, hint) => {
    const t = h('div.toggle', {
      role: 'switch',
      'aria-checked': String(!!store.settings[key]),
      onclick: () => {
        const next = t.getAttribute('aria-checked') !== 'true';
        t.setAttribute('aria-checked', String(next));
        updateSettings({ [key]: next });
        sfx.tap();
      },
    });
    return h('div.switch', h('div', h('span.t', label), hint ? h('div.small.dim', hint) : null), t);
  };

  const range = (key, label, min, max, step, format = (v) => v) => {
    const val = h('span.small.mono', format(store.settings[key]));
    const r = h('input', {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(store.settings[key]),
      oninput: (e) => {
        const v = Number(e.target.value);
        val.textContent = format(v);
        updateSettings({ [key]: v });
      },
    });
    return h('div.field', h('label', label), h('div.row', r, val));
  };

  const nameInput = h('input.input', { value: store.profile.name, maxlength: 18 });
  nameInput.addEventListener('change', () => {
    const v = nameInput.value.trim();
    if (!v) return (nameInput.value = store.profile.name);
    updateProfile({ name: v });
    net.send({ t: 'hello', profile: net.selfProfile() });
    toast('Имя сохранено', 'ok');
  });

  const serverInput = h('input.input', { value: store.settings.serverUrl });
  const netStatus = h('span.badge');
  const refreshNet = () => {
    netStatus.textContent = net.state === 'online' ? `🟢 онлайн · ${net.latency || '—'} мс` : net.state === 'connecting' ? '🟡 подключение…' : net.state === 'local' ? '🟡 локальный режим' : '🔴 отключено';
  };

  const el = h(
    'div.page.screen-fade',
    h('div.page-head', h('div', h('h1', '⚙️ Настройки'), h('p', 'Всё сохраняется автоматически и применяется сразу.'))),

    /* профиль */
    h(
      'section.card',
      h('div.section-head', h('h2', '🧍 Профиль')),
      h(
        'div.col',
        { style: { marginTop: 10, gap: 12 } },
        h('div.field', h('label', 'Имя'), nameInput),
        h('div.list', h('div.item', h('span', '🆔'), h('div', h('b', 'ID'), h('div.small.dim.mono', store.profile.id))), h('div.item', h('span', '💰'), h('div', h('b', 'Монеты'), h('div.small.dim', String(store.profile.coins)))), h('div.item', h('span', '🎭'), h('div', h('b', 'Роль'), h('div.small.dim', store.profile.role)))),
        h('div.row.wrap', h('button.btn.soft', { onclick: () => api.go('avatar') }, '🎨 Редактор персонажа'), h('button.btn.ghost', { onclick: () => api.go('admin') }, '🛡️ Панель администрации'))
      )
    ),

    /* графика */
    h(
      'section.card',
      h('div.section-head', h('h2', '🖥️ Графика')),
      h('div.col', { style: { marginTop: 10, gap: 12 } }, h('div.field', h('label', 'Качество'), seg('quality', QUALITIES)), toggle('shadows', 'Тени', 'Отключите на слабых устройствах'), range('fov', 'Угол обзора (FOV)', 55, 100, 1, (v) => `${v}°`), toggle('showFps', 'Счётчик FPS в игре'), toggle('motion', 'Анимации интерфейса', 'Отключение помогает при укачивании'))
    ),

    /* звук */
    h(
      'section.card',
      h('div.section-head', h('h2', '🔊 Звук')),
      h(
        'div.col',
        { style: { marginTop: 10, gap: 12 } },
        toggle('sound', 'Звуковые эффекты', 'Прыжки, монеты, интерфейс'),
        range('volume', 'Громкость', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        h('button.btn.soft', { onclick: () => { updateSettings({ sound: true }); syncVolume(); sfx.coin(); toast('Проверка звука'); } }, '🔔 Проверить звук')
      )
    ),

    /* управление */
    h(
      'section.card',
      h('div.section-head', h('h2', '🎮 Управление')),
      h('div.col', { style: { marginTop: 10, gap: 12 } }, range('sensitivity', 'Чувствительность камеры', 0.3, 2.5, 0.1, (v) => `×${v.toFixed(1)}`), toggle('invertY', 'Инверсия оси Y'), toggle('pointerLock', 'Захват мыши в игре', 'Клик по игре скрывает курсор'), toggle('showHints', 'Подсказки по клавишам')),
      h(
        'div.list',
        { style: { marginTop: 12 } },
        [
          ['W A S D / Ц Ф Ы В', 'движение'],
          ['Пробел', 'прыжок'],
          ['Shift', 'бег'],
          ['ЛКМ + движение', 'обзор камерой'],
          ['Колесо мыши', 'приближение'],
          ['Esc', 'пауза'],
        ].map(([k, v]) => h('div.item', h('span.kbd', k), h('div.small.dim', v)))
      )
    ),

    /* сеть */
    h(
      'section.card',
      h('div.section-head', h('h2', '🌐 Сеть и онлайн'), h('div.spacer'), netStatus),
      h(
        'div.col',
        { style: { marginTop: 10, gap: 12 } },
        h('div.field', h('label', 'Адрес сервера'), h('div.row', serverInput, h('button.btn.primary', { onclick: () => { updateSettings({ serverUrl: serverInput.value.trim() }); net.connect(serverInput.value.trim()); refreshNet(); toast('Подключаемся…'); } }, 'Подключиться'), h('button.btn.soft', { onclick: () => { net.disconnect(); refreshNet(); } }, 'Отключиться'))),
        h('p.hint', 'Для серверов ngrok free автоматически добавляется параметр ngrok-skip-browser-warning. Если сервер недоступен, платформа переходит в локальный режим: игроки в других вкладках браузера видят друг друга.'),
        toggle('autoConnect', 'Подключаться автоматически', 'При запуске платформы'),
        toggle('chat', 'Показывать сетевой чат'),
        toggle('broadcastState', 'Передавать свою позицию', 'Нужно, чтобы другие видели вас в игре'),
        h('button.btn.soft', { onclick: () => { net.requestMaps(); net.send({ t: 'hello', profile: net.selfProfile() }); toast('Запрос состояния отправлен', 'ok'); } }, '🔁 Синхронизироваться')
      )
    ),

    /* данные */
    h(
      'section.card',
      h('div.section-head', h('h2', '💾 Данные')),
      h(
        'div.col',
        { style: { marginTop: 10, gap: 12 } },
        h('p.muted', 'Профиль, аватар, настройки, библиотека карт и рекорды хранятся в этом браузере (localStorage). Экспортируйте файл, чтобы перенести их.'),
        h(
          'div.row.wrap',
          h('button.btn.soft', { onclick: () => { downloadFile(`gimverse-profile-${Date.now()}.json`, exportState()); toast('Файл профиля сохранён', 'ok'); } }, '⬇ Экспорт профиля'),
          h('button.btn.soft', {
            onclick: async () => {
              const f = await pickFile();
              if (!f) return;
              try {
                importState(f.text);
                toast('Профиль загружен', 'ok');
                api.refresh();
              } catch {
                toast('Это не файл профиля GIMVERSE', 'err');
              }
            },
          }, '⬆ Импорт профиля'),
          h('button.btn.danger', {
            onclick: async () => {
              const ok = await confirmDialog({ title: 'Полный сброс', text: 'Удалятся профиль, аватар, карты, рекорды и настройки. Действие необратимо.', ok: 'Сбросить всё', danger: true });
              if (!ok) return;
              resetAll();
              toast('Данные сброшены', 'ok');
              api.refresh();
            },
          }, '🧽 Сбросить всё')
        )
      )
    ),

    /* о платформе */
    h(
      'section.card',
      h('div.section-head', h('h2', 'ℹ️ О платформе')),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        h('div.item', h('span', '🏷️'), h('div', h('b', 'Версия'), h('div.small.dim', 'GIMVERSE 1.0 · three.js 0.170 · Vite'))),
        h('div.item', h('span', '🧱'), h('div', h('b', 'Редактор карт'), h('div.small.dim', 'GimPrograms 3D Editor')), h('a.btn.sm.ghost', { href: EDITOR_URL, target: '_blank', rel: 'noopener' }, 'Открыть')),
        h('div.item', h('span', '🐙'), h('div', h('b', 'Исходный код редактора'), h('div.small.dim', EDITOR_REPO)), h('a.btn.sm.ghost', { href: EDITOR_REPO, target: '_blank', rel: 'noopener' }, 'GitHub')),
        h('div.item', h('span', '🌐'), h('div', h('b', 'Сервер онлайна'), h('div.small.dim', store.settings.serverUrl)))
      )
    )
  );

  root.appendChild(el);
  refreshNet();
  const off = net.on((e) => e.type === 'status' && refreshNet());
  return () => off();
}
