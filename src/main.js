/**
 * GIMVERSE — точка входа: оболочка, маршрутизация, инициализация сети и хранилища.
 */
import './style.css';
import { h, clear, toast } from './core/ui.js';
import { store, load, updateProfile, subscribe, notify, rememberUser } from './core/store.js';
import { net } from './core/net.js';
import { drawPortrait } from './three/avatar.js';
import { receiveNetworkMap } from './core/library.js';
import { sfx, syncVolume } from './core/audio.js';

import { renderHome } from './screens/home.js';
import { renderAvatar } from './screens/avatar.js';
import { renderGames } from './screens/games.js';
import { renderDev } from './screens/dev.js';
import { renderOnline } from './screens/online.js';
import { renderAdmin } from './screens/admin.js';
import { renderSettings } from './screens/settings.js';

const ROUTES = {
  home: { title: 'Главная', em: '🏠', render: renderHome },
  games: { title: 'Игры', em: '🎮', render: renderGames },
  avatar: { title: 'Аватар', em: '🧍', render: renderAvatar },
  dev: { title: 'Разработка', em: '🛠️', render: renderDev },
  online: { title: 'Онлайн', em: '🌐', render: renderOnline },
  admin: { title: 'Администрация', em: '🛡️', render: renderAdmin },
  settings: { title: 'Настройки', em: '⚙️', render: renderSettings },
};

/* ============================================================
   Применение настроек к документу
   ============================================================ */
function applySettings() {
  const s = store.settings;
  document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.motion = s.motion === false ? 'off' : 'on';
  document.documentElement.style.setProperty('--ui', String(s.uiScale || 1));
  syncVolume();
}

/* ============================================================
   Оболочка
   ============================================================ */
const main = h('main.main');
const portrait = h('canvas', { style: { width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)' } });
const nameEl = h('b.nowrap', store.profile.name);
const coinsEl = h('span.badge.coin', `💰 ${store.profile.coins}`);
const coinsTop = h('span.badge.coin', `💰 ${store.profile.coins}`);
const roleEl = h('span.badge');
const netPill = h('button.net-pill');

function refreshProfile() {
  nameEl.textContent = store.profile.name;
  coinsEl.textContent = `💰 ${store.profile.coins}`;
  coinsTop.textContent = coinsEl.textContent;
  const r = store.profile.role;
  roleEl.textContent = r === 'owner' ? '👑 владелец' : r === 'admin' ? '🛡️ админ' : r === 'moderator' ? '🧑‍⚖️ модер' : '🧍 игрок';
  roleEl.className = 'badge ' + (r === 'owner' ? 'admin' : r === 'admin' ? 'admin' : r === 'moderator' ? 'mod' : '');
  try {
    drawPortrait(portrait, store.profile.avatar, 40);
  } catch {
    portrait.textContent = '🧍';
  }
}

function refreshNet() {
  const map = {
    online: ['ok', 'Сервер подключён'],
    connecting: ['warn', 'Подключение…'],
    local: ['warn', 'Локальный режим'],
    offline: ['err', 'Офлайн'],
  };
  const [cls, label] = map[net.state] || map.offline;
  clear(netPill);
  netPill.append(h(`span.dot.${cls}` + (net.state === 'connecting' ? '.pulse' : '')), h('span', `${label} · 👥 ${net.count()}`));
}

const navButtons = new Map();

function buildShell() {
  const nav = h('nav.nav');
  const mk = (id) => {
    const r = ROUTES[id];
    const b = h('button', h('span.em', r.em), h('span', r.title), h('span.cnt', { style: { display: 'none' } }));
    b.onclick = () => {
      sfx.tap();
      location.hash = `#/${id}`;
    };
    navButtons.set(id, b);
    return b;
  };
  nav.append(mk('home'), mk('games'), mk('avatar'), mk('dev'), mk('online'), h('div.sep'), mk('admin'), mk('settings'));

  const sidebar = h(
    'aside.sidebar',
    h('div.brand', h('div.mark', 'G'), h('div.txt', h('b', 'GIMVERSE'), h('small', '3D платформа'))),
    nav,
    h(
      'div.side-foot',
      netPill,
      h('div.profile-card', portrait, h('div', { style: { minWidth: 0 } }, h('div.row', nameEl, roleEl), h('div', coinsEl)))
    )
  );
  netPill.onclick = () => {
    sfx.tap();
    location.hash = '#/online';
  };

  const topbar = h(
    'div.topbar',
    h('div.brand', { style: { padding: 0 } }, h('div.mark', { style: { width: 34, height: 34, borderRadius: 11, fontSize: 15 } }, 'G'), h('div.txt', h('b', { style: { fontSize: 15 } }, 'GIMVERSE'))),
    h('div.spacer'),
    coinsTop,
    h('button.btn.icon.ghost', { onclick: () => location.assign('#/settings'), title: 'Настройки' }, '⚙️')
  );

  const moreSheet = () => {
    const backdrop = h('div.backdrop');
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => e.target === backdrop && close());
    const card = h(
      'div.modal',
      h('div.modal-head', h('h2', 'Ещё'), h('div.spacer'), h('button.btn.icon.ghost', { onclick: close }, '✕')),
      h(
        'div.modal-body',
        h('div.list', ['avatar', 'admin', 'settings'].map((id) => h('button.item', { style: { width: '100%', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }, onclick: () => { close(); location.assign(`#/${id}`); } }, h('span', { style: { fontSize: 20 } }, ROUTES[id].em), h('b', ROUTES[id].title))))
      )
    );
    backdrop.appendChild(card);
    document.getElementById('modal-root').appendChild(backdrop);
  };

  const tabbar = h(
    'div.tabbar',
    ...['home', 'games', 'dev', 'online'].map((id) => {
      const b = h('button', h('span.em', ROUTES[id].em), h('span', id === 'dev' ? 'Создать' : ROUTES[id].title));
      b.dataset.route = id;
      b.onclick = () => {
        sfx.tap();
        location.hash = `#/${id}`;
      };
      navButtons.set('tab-' + id, b);
      return b;
    }),
    (() => {
      const b = h('button', h('span.em', '☰'), h('span', 'Ещё'));
      b.onclick = moreSheet;
      return b;
    })()
  );

  const shell = h('div.shell', sidebar, h('div', { style: { display: 'contents' } }, topbar, main, tabbar));
  document.getElementById('app').appendChild(shell);
}

/* ============================================================
   Маршрутизация
   ============================================================ */
let cleanup = null;
let currentRoute = null;

function currentId() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
  return ROUTES[raw] ? raw : 'home';
}

function navigate(force = false) {
  const id = currentId();
  if (!force && id === currentRoute) return;
  currentRoute = id;
  cleanup?.();
  cleanup = null;
  clear(main);
  main.scrollTop = 0;
  document.title = `${ROUTES[id].title} · GIMVERSE`;
  for (const [key, btn] of navButtons) {
    const active = key === id || key === 'tab-' + id;
    btn.classList.toggle('active', active);
  }
  try {
    cleanup = ROUTES[id].render(main, { go: (r) => location.assign(`#/${r}`), refresh: () => navigate(true) }) || null;
  } catch (err) {
    console.error('[router]', err);
    main.appendChild(h('div.page', h('section.card', h('h3', 'Ошибка экрана'), h('p.muted', String(err.message)))));
  }
}

window.addEventListener('hashchange', () => navigate());
window.addEventListener('gim:refresh', () => navigate(true));

/* ============================================================
   Сетевые события → хранилище
   ============================================================ */
function bindNet() {
  net.on((ev) => {
    switch (ev.type) {
      case 'map':
        receiveNetworkMap(ev.map);
        toast(`Новая карта: ${ev.map.name}`, 'info');
        break;
      case 'map.remove': {
        const i = store.library.maps.findIndex((m) => m.id === ev.id);
        if (i >= 0) {
          store.library.maps.splice(i, 1);
          store.save();
          notify({ event: 'library' });
        }
        break;
      }
      case 'admin': {
        const me = store.profile.id;
        const p = ev.payload || {};
        if (p.target === me || p.userId === me) {
          if (ev.action === 'ban') {
            updateProfile({ bannedUntil: p.ms ? Date.now() + p.ms : Date.now() + 31536000000 });
            toast(`Вы забанены: ${p.reason || 'без причины'}`, 'err', 8000);
          } else if (ev.action === 'unban') {
            updateProfile({ bannedUntil: 0 });
            toast('Бан снят', 'ok');
          } else if (ev.action === 'mute') {
            updateProfile({ mutedUntil: Date.now() + (p.minutes || 15) * 60000 });
            toast(`Вам выдан мут на ${p.minutes || 15} мин`, 'warn');
          } else if (ev.action === 'unmute') {
            updateProfile({ mutedUntil: 0 });
          } else if (ev.action === 'role') {
            updateProfile({ role: p.role });
            toast(`Ваша роль: ${p.role}`, 'ok');
          }
        }
        if (ev.action === 'map.moderate') {
          const m = store.library.maps.find((x) => x.id === p.id);
          if (m) {
            m.status = p.status;
            store.admin.moderation[m.id] = p.status;
            store.save();
            notify({ event: 'library' });
          }
        }
        break;
      }
      case 'announce':
        toast(`📢 ${ev.text}`, 'warn', 7000);
        break;
      case 'players.changed':
        refreshNet();
        break;
      case 'status':
        refreshNet();
        if (ev.state === 'online') flushQueue();
        break;
      case 'welcome':
        flushQueue();
        break;
      default:
        break;
    }
  });
}

function flushQueue() {
  const queue = store.library.queue;
  if (!queue.length) return;
  let sent = 0;
  for (const q of [...queue]) {
    const m = store.library.maps.find((x) => x.id === q.id);
    if (m && net.publishMap(m)) {
      store.library.queue = store.library.queue.filter((x) => x.id !== q.id);
      sent++;
    }
  }
  if (sent) {
    store.save();
    notify({ event: 'queue' });
    toast(`Синхронизировано карт: ${sent}`, 'ok');
  }
}

/* ============================================================
   Первый запуск
   ============================================================ */
function onboarding() {
  if (localStorage.getItem('gimverse.seen')) return;
  localStorage.setItem('gimverse.seen', '1');
  const backdrop = h('div.backdrop');
  const close = () => backdrop.remove();
  const card = h(
    'div.modal.wide',
    h('div.modal-head', h('div', h('h2', '👋 Добро пожаловать в GIMVERSE'), h('div.small.dim', '3D-платформа: игры, персонаж, создание карт, онлайн и администрация'))),
    h(
      'div.modal-body',
      h(
        'div.list',
        [
          ['🎮', 'Играйте в 3D-игры', '«Небесный паркур» и «Кристальная арена» — обе с монетами, рекордами и онлайном.'],
          ['🧍', 'Соберите персонажа', 'Цвета, лицо, причёска, уборы и аксессуары. Монеты зарабатываются в играх.'],
          ['🛠️', 'Создавайте свои миры', 'Соберите карту в GimPrograms 3D Editor, вставьте JSON в разделе «Разработка» и опубликуйте с донатами.'],
          ['🌐', 'Онлайн', 'Сервер wss, чат, приглашения. Если сервер недоступен — работает локальный режим между вкладками.'],
          ['🛡️', 'Администрация', 'Вход по коду, роли, баны, модерация карт и объявления.'],
        ].map(([em, t, d]) => h('div.item', h('span', { style: { fontSize: 20 } }, em), h('div', h('b', t), h('div.small.dim', d))))
      ),
      h('p.hint', 'Подсказка: клавиша Esc в игре — пауза и быстрая смена качества графики.')
    ),
    h('div.modal-foot', h('button.btn.soft', { onclick: () => { close(); location.assign('#/dev'); } }, '🛠️ Хочу создать карту'), h('button.btn.primary', { onclick: () => { close(); location.assign('#/games'); } }, '🎮 Играть'))
  );
  backdrop.appendChild(card);
  document.getElementById('modal-root').appendChild(backdrop);
}

/* ============================================================
   Старт
   ============================================================ */
function boot() {
  load();
  applySettings();
  buildShell();
  refreshProfile();
  refreshNet();
  bindNet();

  subscribe((_s, payload) => {
    if (['coins', 'profile', 'avatar', 'inventory', 'settings'].includes(payload.event)) {
      refreshProfile();
      if (payload.event === 'settings') applySettings();
    }
  });

  if (!location.hash) location.hash = '#/home';
  navigate(true);
  onboarding();

  if (store.settings.autoConnect) net.connect(store.settings.serverUrl);
  else net.setState('offline');

  net.send({ t: 'hello', profile: net.selfProfile() });
  rememberUser({ id: store.profile.id, name: store.profile.name, role: store.profile.role, avatar: store.profile.avatar });

  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
    toast('Ошибка: ' + (e.message || 'неизвестно'), 'err', 5000);
  });

}

boot();
