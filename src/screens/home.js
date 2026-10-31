/**
 * GIMVERSE — экран «Главная»: витрина, статистика, объявления, онлайн.
 */
import { h, fmtNum, timeAgo } from '../core/ui.js';
import { store } from '../core/store.js';
import { net } from '../core/net.js';
import { buildAvatar } from '../three/avatar.js';
import { Stage } from '../three/preview.js';
import { filterGames, gameCard, launch, openGameInfo } from '../core/library.js';
import { sfx } from '../core/audio.js';

export function renderHome(root, api) {
  let raf = 0;
  let stage = null;
  let avatar = null;

  const heroCanvas = h('canvas.hero-canvas');
  const statCoins = h('b', fmtNum(store.profile.coins));
  const statPlays = h('b', fmtNum(Object.values(store.stats.plays).reduce((a, b) => a + b, 0)));
  const statMaps = h('b', fmtNum(store.library.maps.length));
  const statOnline = h('b', String(net.count()));

  const featured = filterGames({ sort: 'popular' }).slice(0, 4);
  const latest = [...store.library.maps].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4);
  const announcements = store.admin.announcements.slice(0, 3);
  const players = net.listPlayers();

  const el = h(
    'div.page.screen-fade',
    /* ---------- герой ---------- */
    h(
      'section.hero',
      h(
        'div',
        h('span.badge.accent', `👋 ${store.profile.name}${store.profile.title ? ' · ' + store.profile.title : ''}`),
        h('h1', { style: { marginTop: 12 } }, 'Твоя 3D-вселенная ', h('em', 'GIMVERSE')),
        h('p', 'Играй в 3D-игры, настраивай персонажа, собирай карты в GimPrograms 3D Editor и выкладывай их в сеть с донатами.'),
        h(
          'div.row.wrap',
          h('button.btn.primary.lg', { onclick: () => launch(featured[0] || filterGames()[0]) }, '▶ Играть сейчас'),
          h('button.btn.lg.soft', { onclick: () => api.go('avatar') }, '🧍 Редактор персонажа'),
          h('button.btn.lg.ghost', { onclick: () => api.go('dev') }, '🛠️ Создать карту')
        )
      ),
      h('div', heroCanvas)
    ),

    /* ---------- статистика ---------- */
    h(
      'section.stat-grid',
      h('div.stat', h('small', 'Монеты'), statCoins),
      h('div.stat', h('small', 'Запусков игр'), statPlays),
      h('div.stat', h('small', 'Моих карт'), statMaps),
      h('div.stat', h('small', 'Онлайн'), statOnline)
    ),

    /* ---------- объявления ---------- */
    announcements.length
      ? h(
          'section.card.glow',
          h('div.section-head', h('span', '📢'), h('h2', 'Объявления администрации')),
          h(
            'div.list',
            { style: { marginTop: 10 } },
            announcements.map((a) =>
              h('div.item', h('div.avatar.sm', a.pinned ? '📌' : '📢'), h('div', h('b', a.title || 'Объявление'), h('div.small.muted', a.text)), h('div.spacer'), h('span.small.dim', timeAgo(a.at)))
            )
          )
        )
      : null,

    /* ---------- игры ---------- */
    h('section', h('div.section-head', h('h2', '🎮 Популярные игры'), h('div.spacer'), h('button.btn.sm.ghost', { onclick: () => api.go('games') }, 'Все игры →')), h('div.game-grid', { style: { marginTop: 12 } }, featured.map((m) => gameCard(m, { onOpen: openGameInfo })))),

    /* ---------- последние карты ---------- */
    latest.length
      ? h('section', h('div.section-head', h('h2', '🆕 Новые карты сообщества')), h('div.game-grid', { style: { marginTop: 12 } }, latest.map((m) => gameCard(m, { onOpen: openGameInfo }))))
      : h(
          'section.card',
          h('div.row', h('span', { style: { fontSize: 26 } }, '🧱'), h('div', h('h3', 'Карт сообщества пока нет'), h('p', 'Откройте «Разработка» → вставьте JSON из GimPrograms 3D Editor → настройте донаты → «Выложить в сеть».'))),
          h('button.btn.primary', { style: { marginTop: 12 }, onclick: () => api.go('dev') }, '🛠️ Опубликовать первую карту')
        ),

    /* ---------- онлайн ---------- */
    h(
      'section.card',
      h('div.section-head', h('span.dot.' + netDotClass(), { class: netDotClass() === 'ok' ? 'pulse' : '' }), h('h2', '🌐 Сейчас в сети'), h('div.spacer'), h('span.badge', net.state === 'online' ? 'сервер подключён' : net.state === 'connecting' ? 'подключение…' : 'локальный режим')),
      players.length
        ? h(
            'div.row.wrap',
            { style: { marginTop: 12, gap: 8 } },
            players.slice(0, 8).map((p) =>
              h(
                'button.chip',
                { onclick: () => api.go('online') },
                h('span', p.avatar ? '🧍' : '👤'),
                h('span', p.name || 'Игрок'),
                p.game ? h('span.small.dim', '· в игре') : null
              )
            )
          )
        : h('p.muted', { style: { marginTop: 10 } }, 'Других игроков пока не видно. Откройте платформу во второй вкладке или подключитесь к серверу в настройках — статус появится здесь.')
    ),

    /* ---------- быстрый доступ ---------- */
    h(
      'section.stat-grid',
      quickTile('🛠️', 'Разработка', 'Гайды, импорт JSON, публикация', () => api.go('dev')),
      quickTile('🧍', 'Персонаж', 'Внешность, магазин, инвентарь', () => api.go('avatar')),
      quickTile('🛡️', 'Администрация', 'Модерация, баны, объявления', () => api.go('admin')),
      quickTile('⚙️', 'Настройки', 'Графика, звук, сеть, данные', () => api.go('settings'))
    ),

    /* ---------- новости ---------- */
    h(
      'section.card',
      h('div.section-head', h('h2', '📰 Что нового в платформе')),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        [
          ['🎮', 'Две встроенные 3D-игры: «Небесный паркур» и «Кристальная арена» с ботами и бонусами.'],
          ['🧱', 'Импорт карт GimPrograms 3D Editor: JSON v1/v2, текстуры на гранях, динамические блоки.'],
          ['💝', 'Донаты у карт: иконка, цена в монетах, бонусы и цель сбора.'],
          ['🌐', 'Онлайн-режим: сервер wss, чат, приглашения, присутствие в игре + локальный резервный канал.'],
          ['🛡️', 'Администрация: роли, баны, муты, модерация карт, объявления и журнал действий.'],
        ].map(([em, text]) => h('div.item', h('span', em), h('div.small.muted', text)))
      )
    )
  );

  function quickTile(em, title, desc, onClick) {
    return h(
      'button.card.tight',
      { style: { textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', font: 'inherit', color: 'inherit' }, onclick: () => { sfx.tap(); onClick(); } },
      h('div', { style: { fontSize: 24 } }, em),
      h('b', { style: { display: 'block', marginTop: 6 } }, title),
      h('div.small.dim', desc)
    );
  }

  function netDotClass() {
    return net.state === 'online' ? 'ok' : net.state === 'connecting' ? 'warn' : net.state === 'local' ? 'warn' : 'err';
  }

  root.appendChild(el);

  /* ---------- 3D-превью персонажа ---------- */
  stage = new Stage({ preset: 'studio' });
  avatar = buildAvatar(store.profile.avatar, { shadows: true });
  stage.set(avatar.group);
  stage.target.set(0, 0.85, 0);
  stage.distance = 3.6;
  stage.bindDrag(heroCanvas);

  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    avatar.update(dt, { speed: 1.4, grounded: true, emote: null });
    stage.renderTo(heroCanvas, { dt });
  };
  raf = requestAnimationFrame(loop);

  const onNet = net.on((ev) => {
    if (ev.type === 'players.changed' || ev.type === 'status') {
      statOnline.textContent = String(net.count());
    }
  });

  const onStore = store.subscribe((_s, payload) => {
    if (payload.event === 'coins' || payload.event === 'stats') {
      statCoins.textContent = fmtNum(store.profile.coins);
      statPlays.textContent = fmtNum(Object.values(store.stats.plays).reduce((a, b) => a + b, 0));
      statMaps.textContent = fmtNum(store.library.maps.length);
    }
  });

  return () => {
    cancelAnimationFrame(raf);
    onNet();
    onStore();
    avatar?.dispose();
    stage?.dispose();
  };
}

