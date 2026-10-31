/**
 * GIMVERSE — каталог игр: объединяет встроенные игры, импортированные карты и карты из сети.
 */
import { h, fmtNum, toast } from './ui.js';
import { store, toggleLike, upsertMap } from './store.js';
import { BUILTIN_GAMES, startGame, openDonateSheet } from '../game.js';
import { sfx } from './audio.js';
import { net } from './net.js';

export function allGames() {
  const maps = store.library.maps.filter((m) => (store.admin.moderation[m.id] || m.status) !== 'rejected');
  const builtin = BUILTIN_GAMES.map((g) => ({
    ...g,
    id: g.id,
    plays: store.stats.plays[g.id] || 0,
    builtin: g.builtin,
    donates: g.donates || null,
  }));
  return [...builtin, ...maps];
}

export function findGame(id) {
  return allGames().find((g) => g.id === id) || null;
}

export function filterGames({ search = '', genre = 'all', sort = 'popular', mine = false } = {}) {
  let list = allGames();
  if (mine) list = list.filter((g) => g.authorId === store.profile.id);
  if (genre !== 'all') list = list.filter((g) => (g.genre || 'other') === genre);
  const q = search.trim().toLowerCase();
  if (q)
    list = list.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.desc || '').toLowerCase().includes(q) ||
        (g.tags || []).join(' ').toLowerCase().includes(q) ||
        (g.authorName || g.author || '').toLowerCase().includes(q)
    );
  if (sort === 'new') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else if (sort === 'rating') list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  else if (sort === 'coins') list.sort((a, b) => (b.donates?.items?.length || 0) - (a.donates?.items?.length || 0));
  else list.sort((a, b) => (b.plays || 0) - (a.plays || 0));
  return list;
}

/* ============================================================
   Карточка
   ============================================================ */
export function thumbNode(meta, size = 54) {
  const icon = meta.icon || {};
  if (icon.image) {
    const img = h('img', { src: icon.image, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } });
    return h('div.avatar', { style: { width: size + 'px', height: size + 'px', padding: 0 } }, img);
  }
  return h(
    'div.avatar',
    {
      style: {
        width: size + 'px',
        height: size + 'px',
        fontSize: Math.round(size * 0.5) + 'px',
        background: `linear-gradient(140deg, ${icon.color || '#7c5cff'}55, ${icon.color || '#22d3ee'}22)`,
      },
    },
    icon.emoji || '🎮'
  );
}

export function gameCard(meta, { onOpen } = {}) {
  const icon = meta.icon || {};
  const plays = meta.plays || store.stats.plays[meta.id] || 0;
  const liked = store.stats.liked.includes(meta.id);
  const status = store.admin.moderation[meta.id] || meta.status;
  const card = h(
    'button.game-card',
    { onclick: () => (onOpen ? onOpen(meta) : openGameInfo(meta)) },
    h(
      'div.game-thumb',
      {
        style: {
          background: icon.image
            ? 'none'
            : `radial-gradient(120% 120% at 20% 0%, ${icon.color || '#7c5cff'}aa, ${icon.color || '#22d3ee'}33 60%, #0b0e17)`,
        },
      },
      icon.image ? h('img', { src: icon.image, alt: '' }) : h('span', icon.emoji || '🎮'),
      h('div.ovl'),
      h(
        'div.tags',
        status === 'pending' ? h('span.badge.warn', 'на модерации') : null,
        status === 'rejected' ? h('span.badge.danger', 'отклонена') : null,
        meta.authorId === store.profile.id ? h('span.badge.accent', 'моя') : null
      ),
      meta.donates?.items?.length ? h('span.badge.coin.don', `💝 ${meta.donates.items.length}`) : null,
      h('div.plays', `▶ ${fmtNum(plays)}`)
    ),
    h(
      'div.game-body',
      h('b.nowrap', meta.name),
      h('div.desc', meta.desc || 'Описание не заполнено'),
      h(
        'div.game-meta',
        h('span', meta.builtin ? '🛠️ GIMVERSE' : `👤 ${meta.authorName || 'Автор'}`),
        h('div.spacer'),
        h('span', `${liked ? '💜' : '🤍'} ${meta.likes || 0}`)
      )
    )
  );
  return card;
}

export function gridOf(list, opts = {}) {
  if (!list.length)
    return h(
      'div.empty',
      h('div.big', '🗺️'),
      h('b', 'Пока ничего не найдено'),
      h('div.small', 'Соберите карту в GimPrograms 3D Editor, скопируйте JSON и опубликуйте в разделе «Разработка».'),
      h('button.btn.primary.sm', { onclick: () => location.assign('#/dev') }, 'Открыть раздел разработки')
    );
  return h('div.game-grid', list.map((m) => gameCard(m, opts)));
}

/* ============================================================
   Окно информации об игре
   ============================================================ */
export function openGameInfo(meta) {
  const root = document.getElementById('modal-root');
  const backdrop = h('div.backdrop');
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());

  const best = store.stats.best[meta.id];
  const likes = meta.likes || 0;
  const liked = store.stats.liked.includes(meta.id);

  const likeBtn = h(
    `button.btn.sm.${liked ? 'ok' : 'soft'}`,
    {
      onclick: (e) => {
        const on = toggleLike(meta.id);
        meta.likes = likes + (on ? 1 : -1);
        store.save();
        e.target.textContent = on ? '💜 Нравится' : '🤍 Нравится';
        e.target.className = `btn sm ${on ? 'ok' : 'soft'}`;
        sfx.tap();
      },
    },
    liked ? '💜 Нравится' : '🤍 Нравится'
  );

  const donateBtn = meta.donates?.items?.length
    ? h('button.btn.sm.soft', { onclick: () => openDonateSheet(meta) }, `💝 Донаты (${meta.donates.items.length})`)
    : null;

  const rows = [];
  rows.push(h('div.item', h('span', '👤'), h('div', h('b', 'Автор'), h('div.small.dim', meta.builtin ? 'Команда GIMVERSE' : meta.authorName || 'неизвестен'))));
  rows.push(h('div.item', h('span', '▶'), h('div', h('b', 'Запусков'), h('div.small.dim', fmtNum(meta.plays || store.stats.plays[meta.id] || 0)))));
  if (meta.map?.items) rows.push(h('div.item', h('span', '🧱'), h('div', h('b', 'Блоков в карте'), h('div.small.dim', String(meta.map.items.length)))));
  if (best?.time != null) rows.push(h('div.item', h('span', '⏱️'), h('div', h('b', 'Лучшее время'), h('div.small.dim', best.time.toFixed(2) + ' с'))));
  if (best?.score != null) rows.push(h('div.item', h('span', '💎'), h('div', h('b', 'Рекорд очков'), h('div.small.dim', String(best.score)))));
  if (meta.createdAt) rows.push(h('div.item', h('span', '📅'), h('div', h('b', 'Опубликовано'), h('div.small.dim', new Date(meta.createdAt).toLocaleDateString('ru-RU')))));

  const donateList = meta.donates?.items?.length
    ? h(
        'div.col',
        h('div.tiny', 'Донаты автору'),
        h(
          'div.list',
          meta.donates.items.map((d) =>
            h('div.item', h('div.avatar.sm', d.icon || '🎁'), h('div', h('b', d.name), h('div.small.dim', d.desc || '')), h('div.spacer'), h('span.badge.coin', `💰 ${d.price}`))
          )
        )
      )
    : null;

  const online = net.count(meta.id);

  const card = h(
    'div.modal.wide',
    h(
      'div.modal-head',
      thumbNode(meta, 44),
      h('div', h('h2', meta.name), h('div.small.dim', (meta.tags || []).map((t) => `#${t}`).join(' ') || meta.genre || '')),
      h('div.spacer'),
      h('button.btn.icon.ghost', { onclick: close }, '✕')
    ),
    h(
      'div.modal-body',
      h(
        'div',
        {
          style: {
            borderRadius: '18px',
            height: '150px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '62px',
            background: `radial-gradient(120% 120% at 20% 0%, ${meta.icon?.color || '#7c5cff'}aa, #0b0e17)`,
          },
        },
        meta.icon?.image ? h('img', { src: meta.icon.image, style: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px' } }) : meta.icon?.emoji || '🎮'
      ),
      h('p.muted', { style: { margin: 0 } }, meta.desc || 'Описание не заполнено.'),
      h('div.row.wrap', h('span.badge', `🟢 Игроков сейчас: ${online}`), h('span.badge', meta.builtin ? '🛠️ встроенная игра' : '🧩 карта автора'), donateBtn),
      h('div.list', rows),
      donateList,
      meta.authorId === store.profile.id
        ? h('div.row.wrap', h('button.btn.sm.soft', { onclick: () => { close(); location.assign('#/dev'); } }, '✏️ Редактировать в разделе «Разработка»'))
        : null
    ),
    h(
      'div.modal-foot',
      likeBtn,
      h('button.btn.soft', { onclick: () => { close(); } }, 'Закрыть'),
      h('button.btn.primary', {
        onclick: () => {
          close();
          launch(meta);
        },
      }, '▶ Играть')
    )
  );
  backdrop.appendChild(card);
  root.appendChild(backdrop);
}

/* ============================================================
   Запуск
   ============================================================ */
export function launch(meta) {
  if (!meta) return;
  const ban = store.admin.bans[store.profile.id];
  if (ban && ban.until > Date.now()) {
    toast('Ваш аккаунт заблокирован администрацией', 'err', 5000);
    return;
  }
  sfx.ui();
  try {
    startGame({ meta, onExit: () => window.dispatchEvent(new CustomEvent('gim:refresh')) });
  } catch (err) {
    console.error(err);
    toast('Не удалось запустить игру: ' + err.message, 'err', 6000);
  }
}

/** Приём карты из сети: сохраняем в библиотеку, если её ещё нет. */
export function receiveNetworkMap(map) {
  if (!map?.id || !map?.map) return;
  const existing = store.library.maps.find((m) => m.id === map.id);
  if (existing && (existing.updatedAt || 0) >= (map.updatedAt || 0)) return;
  upsertMap({ ...map, source: 'network', status: map.status || 'published' });
}

