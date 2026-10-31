/**
 * GIMVERSE — единое хранилище состояния + персистентность (localStorage).
 * Всё, что меняет пользователь (профиль, аватар, настройки, библиотека карт,
 * администрация, статистика) живёт здесь.
 */

const KEY = 'gimverse.state.v1';
const listeners = new Set();
let saveTimer = null;

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

export const DEFAULT_AVATAR = {
  skin: '#f2c29b',
  shirt: '#7c5cff',
  pants: '#25304a',
  shoes: '#151a26',
  eyes: '#2b3350',
  face: 'happy',
  hair: 'short',
  hairColor: '#3a2a1c',
  hat: 'none',
  accessory: 'none',
  scale: 1,
  trail: 'none',
};

export const DEFAULT_SETTINGS = {
  quality: 'high', // low | medium | high
  shadows: true,
  fov: 70,
  drawDistance: 1, // множитель дальности тумана
  sensitivity: 1,
  invertY: false,
  pointerLock: false,
  showFps: false,
  showHints: true,
  sound: true,
  volume: 0.7,
  theme: 'dark',
  motion: true,
  uiScale: 1,
  serverUrl: 'wss://sandbank-economic-zeppelin.ngrok-free.dev',
  autoConnect: true,
  chat: true,
  broadcastState: true,
};

const NICKS = ['Кубик', 'Неон', 'Пиксель', 'Страйк', 'Вольт', 'Комета', 'Титан', 'Луна', 'Рывок', 'Спарк'];

export function randomNick() {
  return `${NICKS[Math.floor(Math.random() * NICKS.length)]}${Math.floor(10 + Math.random() * 89)}`;
}

function freshState() {
  return {
    version: 1,
    profile: {
      id: uid('usr'),
      name: randomNick(),
      role: 'owner', // owner | admin | moderator | user
      coins: 250,
      createdAt: Date.now(),
      avatar: { ...DEFAULT_AVATAR },
      owned: ['hat_none', 'hat_cap', 'hair_short', 'acc_none', 'trail_none'],
      titles: [],
      title: '',
      mutedUntil: 0,
      bannedUntil: 0,
    },
    settings: { ...DEFAULT_SETTINGS },
    library: { maps: [], drafts: [], queue: [] },
    admin: {
      code: 'gim-admin',
      sessions: 0,
      bans: {}, // userId -> { until, reason, by, at }
      mutes: {},
      roles: {}, // userId -> role
      announcements: [],
      logs: [],
      moderation: {}, // mapId -> 'pending' | 'approved' | 'rejected'
      limits: { maxBlocks: 6000, maxJsonKb: 4096, registration: true },
    },
    stats: { plays: {}, best: {}, liked: [], donated: {}, totalCoinsEarned: 0, timePlayed: 0 },
    chat: [],
    knownUsers: [],
  };
}

let state = freshState();

/* ---------------- загрузка / сохранение ---------------- */

function migrate(raw) {
  const base = freshState();
  const s = { ...base, ...raw };
  s.profile = { ...base.profile, ...(raw.profile || {}) };
  s.profile.avatar = { ...DEFAULT_AVATAR, ...(raw.profile?.avatar || {}) };
  s.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  s.library = { maps: [], drafts: [], queue: [], ...(raw.library || {}) };
  s.admin = { ...base.admin, ...(raw.admin || {}) };
  s.admin.limits = { ...base.admin.limits, ...(raw.admin?.limits || {}) };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.chat = Array.isArray(raw.chat) ? raw.chat.slice(-120) : [];
  s.knownUsers = Array.isArray(raw.knownUsers) ? raw.knownUsers.slice(-80) : [];
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return state;
    state = migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[store] не удалось прочитать сохранение', err);
  }
  return state;
}

/** Сброс «тяжёлых» данных карты, если localStorage переполнен. */
function shrinkForQuota() {
  let dropped = 0;
  for (const m of state.library.maps) {
    const items = m?.map?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (Array.isArray(it.faces) && it.faces.some(Boolean)) {
        it.faces = it.faces.map(() => null);
        dropped++;
      }
    }
  }
  return dropped;
}

export function save(now = false) {
  if (!now) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(true), 350);
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    const dropped = shrinkForQuota();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (dropped) notify({ kind: 'state', quota: dropped });
    } catch (err2) {
      console.warn('[store] сохранение не влезло', err2);
    }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(payload = {}) {
  for (const fn of listeners) {
    try {
      fn(state, payload);
    } catch (err) {
      console.warn('[store] listener', err);
    }
  }
}

export function set(patch, event = 'change') {
  state = { ...state, ...patch };
  save();
  notify({ event });
  return state;
}

export const store = {
  get state() {
    return state;
  },
  get profile() {
    return state.profile;
  },
  get settings() {
    return state.settings;
  },
  get library() {
    return state.library;
  },
  get admin() {
    return state.admin;
  },
  get stats() {
    return state.stats;
  },
  get chat() {
    return state.chat;
  },
  get knownUsers() {
    return state.knownUsers;
  },
  load,
  save,
  set,
  subscribe,
  notify,
};

/* ---------------- профиль ---------------- */

export function updateProfile(patch) {
  state.profile = { ...state.profile, ...patch };
  save();
  notify({ event: 'profile' });
  return state.profile;
}

export function updateAvatar(patch) {
  state.profile.avatar = { ...state.profile.avatar, ...patch };
  save();
  notify({ event: 'avatar' });
  return state.profile.avatar;
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
  notify({ event: 'settings' });
  return state.settings;
}

export function addCoins(delta) {
  const next = Math.max(0, Math.round(state.profile.coins + delta));
  state.profile.coins = next;
  if (delta > 0) state.stats.totalCoinsEarned += delta;
  save();
  notify({ event: 'coins', delta });
  return next;
}

export function owns(itemId) {
  return state.profile.owned.includes(itemId);
}

export function grant(itemId) {
  if (owns(itemId)) return false;
  state.profile.owned.push(itemId);
  save();
  notify({ event: 'inventory' });
  return true;
}

/* ---------------- библиотека карт ---------------- */

export function upsertMap(map) {
  const list = state.library.maps;
  const i = list.findIndex((m) => m.id === map.id);
  if (i >= 0) list[i] = { ...list[i], ...map };
  else list.unshift(map);
  save();
  notify({ event: 'library', map });
  return map;
}

export function removeMap(id) {
  state.library.maps = state.library.maps.filter((m) => m.id !== id);
  save();
  notify({ event: 'library' });
}

export function getMap(id) {
  return state.library.maps.find((m) => m.id === id) || null;
}

export function saveDraft(draft) {
  const list = state.library.drafts;
  const i = list.findIndex((d) => d.id === draft.id);
  if (i >= 0) list[i] = { ...list[i], ...draft };
  else list.unshift(draft);
  state.library.drafts = list.slice(0, 12);
  save();
  notify({ event: 'drafts' });
  return draft;
}

export function queueForSync(map) {
  state.library.queue.push({ id: map.id, at: Date.now() });
  state.library.queue = state.library.queue.slice(-20);
  save();
  notify({ event: 'queue' });
}

export function dequeue(id) {
  state.library.queue = state.library.queue.filter((q) => q.id !== id);
  save();
  notify({ event: 'queue' });
}

/* ---------------- статистика ---------------- */

export function trackPlay(mapId) {
  state.stats.plays[mapId] = (state.stats.plays[mapId] || 0) + 1;
  save();
  notify({ event: 'stats' });
}

export function trackBest(mapId, metric, value) {
  const cur = state.stats.best[mapId] || {};
  const better = metric === 'time' ? cur.time == null || value < cur.time : cur.score == null || value > cur.score;
  if (!better) return false;
  state.stats.best[mapId] = { ...cur, [metric]: value, at: Date.now() };
  save();
  notify({ event: 'stats' });
  return true;
}

export function toggleLike(mapId) {
  const liked = state.stats.liked;
  const i = liked.indexOf(mapId);
  if (i >= 0) liked.splice(i, 1);
  else liked.push(mapId);
  save();
  notify({ event: 'stats' });
  return i < 0;
}

/* ---------------- администрация ---------------- */

export function isAdmin() {
  return ['owner', 'admin', 'moderator'].includes(state.profile.role);
}

export function isOwner() {
  return state.profile.role === 'owner';
}

export function logAdmin(action, target = '', detail = '') {
  state.admin.logs.unshift({ at: Date.now(), by: state.profile.name, action, target, detail });
  state.admin.logs = state.admin.logs.slice(0, 220);
  save();
  notify({ event: 'admin-log' });
}

export function roleOf(userId) {
  if (userId === state.profile.id) return state.profile.role;
  return state.admin.roles[userId] || 'user';
}

export function banOf(userId) {
  const b = state.admin.bans[userId];
  if (!b) return null;
  if (b.until && b.until < Date.now()) {
    delete state.admin.bans[userId];
    save();
    return null;
  }
  return b;
}

export function pushAnnouncement(a) {
  state.admin.announcements.unshift({ id: uid('ann'), at: Date.now(), by: state.profile.name, ...a });
  state.admin.announcements = state.admin.announcements.slice(0, 20);
  save();
  notify({ event: 'announce' });
  return state.admin.announcements[0];
}

export function rememberUser(user) {
  if (!user?.id) return;
  const list = state.knownUsers.filter((u) => u.id !== user.id);
  list.unshift({ ...user, seenAt: Date.now() });
  state.knownUsers = list.slice(0, 60);
  save();
  notify({ event: 'users' });
}

export function pushChat(msg) {
  state.chat.push(msg);
  state.chat = state.chat.slice(-120);
  save();
  notify({ event: 'chat', msg });
}

/* ---------------- экспорт / импорт профиля ---------------- */

export function exportState() {
  return JSON.stringify(
    {
      exportedAt: Date.now(),
      profile: state.profile,
      settings: state.settings,
      library: {
        maps: state.library.maps.map((m) => ({ ...m })),
      },
      stats: state.stats,
    },
    null,
    2
  );
}

export function importState(text) {
  const data = JSON.parse(text);
  if (data.profile) state.profile = { ...state.profile, ...data.profile };
  if (data.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (data.library?.maps) state.library.maps = data.library.maps;
  if (data.stats) state.stats = { ...state.stats, ...data.stats };
  save(true);
  notify({ event: 'import' });
  return true;
}

export function resetAll() {
  state = freshState();
  save(true);
  notify({ event: 'reset' });
}
