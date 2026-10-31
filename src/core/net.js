/**
 * GIMVERSE — сетевой слой.
 *  • WebSocket до wss://sandbank-economic-zeppelin.ngrok-free.dev (настраивается в Настройках);
 *  • автоматический переподключение с экспоненциальной задержкой;
 *  • обход предупреждения ngrok free (?ngrok-skip-browser-warning=1);
 *  • запасной канал BroadcastChannel — игроки в соседних вкладках видят друг друга,
 *    даже если сервер недоступен (режим «локальная сеть»);
 *  • протокол не зависит от конкретного сервера: неизвестные сообщения игнорируются.
 */
import { store, uid, rememberUser, pushChat } from './store.js';

const PROTOCOL = 1;
const HEARTBEAT_MS = 20000;
const STALE_MS = 22000;

export const NET_STATES = {
  offline: { label: 'Офлайн', cls: 'err' },
  connecting: { label: 'Подключение…', cls: 'warn' },
  online: { label: 'Онлайн', cls: 'ok' },
  local: { label: 'Локальная сеть', cls: 'warn' },
  banned: { label: 'Доступ закрыт', cls: 'err' },
};

function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^wss?:\/\//i.test(u)) u = 'wss://' + u.replace(/^https?:\/\//i, '');
  try {
    const parsed = new URL(u);
    if (/ngrok/i.test(parsed.hostname) && !parsed.searchParams.has('ngrok-skip-browser-warning')) {
      parsed.searchParams.set('ngrok-skip-browser-warning', '1');
    }
    return parsed.toString();
  } catch {
    return u;
  }
}

export class Net {
  constructor() {
    this.id = uid('net');
    this.state = 'offline';
    this.url = '';
    this.socket = null;
    this.channel = null;
    this.players = new Map();
    this.sentIds = new Set();
    this.listeners = new Set();
    this.attempt = 0;
    this.latency = 0;
    this.lastPong = 0;
    this.manualClose = false;
    this.chatLog = [];
    this._timers = [];
    this._bindChannel();
  }

  /* ---------------- события ---------------- */

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data = {}) {
    for (const fn of this.listeners) {
      try {
        fn({ type, ...data });
      } catch (err) {
        console.warn('[net] listener', err);
      }
    }
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.emit('status', { state });
  }

  /* ---------------- подключение ---------------- */

  connect(url = store.settings.serverUrl) {
    this.url = normalizeUrl(url);
    this.manualClose = false;
    if (!this.url) {
      this.setState('local');
      return;
    }
    this._clearSocket();
    this.setState('connecting');
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      console.warn('[net] не удалось создать сокет', err);
      this.setState('local');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.attempt = 0;
      this.setState('online');
      this.emit('log', { text: `Соединение установлено: ${this.url}` });
      this.send({ t: 'hello', protocol: PROTOCOL, profile: this.selfProfile() }, true);
      this.send({ t: 'maps.request' });
      this.startHeartbeat();
    };
    socket.onmessage = (ev) => {
      if (socket !== this.socket) return;
      this.handleRaw(ev.data, 'ws');
    };
    socket.onerror = () => {
      /* закрывающее событие придёт следом */
    };
    socket.onclose = (ev) => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.stopHeartbeat();
      if (this.manualClose) {
        this.setState('offline');
        return;
      }
      this.setState('local');
      this.emit('log', { text: `Соединение закрыто (код ${ev.code}). Переподключаемся…` });
      this.scheduleReconnect();
    };

    // если сервер молчит — остаёмся в локальном режиме, но продолжаем пытаться
    this._clearTimer('fallback');
    this._timers.push(
      setTimeout(() => {
        if (this.state === 'connecting') this.setState('local');
      }, 7000),
      'fallback'
    );
  }

  disconnect() {
    this.manualClose = true;
    this.stopHeartbeat();
    this._clearSocket();
    this.setState('offline');
    this.emit('log', { text: 'Отключено вручную' });
  }

  _clearSocket() {
    if (!this.socket) return;
    const s = this.socket;
    this.socket = null;
    s.onopen = s.onmessage = s.onerror = s.onclose = null;
    try {
      s.close();
    } catch {
      /* noop */
    }
  }

  scheduleReconnect() {
    this._clearTimer('reconnect');
    this.attempt = Math.min(this.attempt + 1, 6);
    const delay = Math.min(30000, 1000 * 2 ** (this.attempt - 1)) + Math.random() * 600;
    this._timers.push(setTimeout(() => this.connect(this.url), delay), 'reconnect');
    this.emit('log', { text: `Повторная попытка через ${(delay / 1000).toFixed(1)} с` });
  }

  _clearTimer(kind) {
    this._timers = this._timers.filter(([t, k]) => {
      if (k === kind) {
        clearTimeout(t);
        return false;
      }
      return true;
    });
  }

  _bindChannel() {
    try {
      this.channel = new BroadcastChannel('gimverse-net');
      this.channel.onmessage = (ev) => this.handleRaw(JSON.stringify(ev.data), 'bc', ev.data?.from);
    } catch {
      this.channel = null;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this._hb = setInterval(() => {
      if (this.state !== 'online') return;
      if (this.lastPong && Date.now() - this.lastPong > HEARTBEAT_MS + 8000) {
        this.emit('log', { text: 'Сервер не отвечает, переподключение' });
        this.socket?.close();
        return;
      }
      this.send({ t: 'ping', at: Date.now() }, true);
    }, HEARTBEAT_MS);
  }

  stopHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
  }

  /* ---------------- отправка ---------------- */

  selfProfile() {
    const p = store.profile;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      avatar: p.avatar,
      title: p.title || '',
      coins: p.coins,
    };
  }

  send(msg, force = false) {
    const payload = { ...msg, _id: uid('m'), from: store.profile.id, protocol: PROTOCOL };
    this.sentIds.add(payload._id);
    if (this.sentIds.size > 200) this.sentIds = new Set([...this.sentIds].slice(-100));
    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch {
        /* noop */
      }
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(payload));
        return true;
      } catch (err) {
        console.warn('[net] send', err);
      }
    } else if (!force) {
      this.emit('queued', { msg: payload });
    }
    return false;
  }

  /* ---------------- приём ---------------- */

  handleRaw(raw, via = 'ws', bcFrom = null) {
    let data;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        this.emit('log', { text: 'Сервер прислал не-JSON (возможно, страница ngrok). Проверьте адрес в Настройках.' });
        return;
      }
    } else data = raw;
    if (!data || typeof data !== 'object') return;

    const msg = data.msg && typeof data.msg === 'object' ? data.msg : data;
    const from = bcFrom || msg.from || data.from;
    if (msg._id && this.sentIds.has(msg._id)) return; // собственное эхо
    if (from && from === store.profile.id) return;

    const t = msg.t || msg.type || msg.event;
    switch (t) {
      case 'pong':
        this.lastPong = Date.now();
        if (msg.at) this.latency = Math.max(0, Math.round((Date.now() - msg.at) / 2));
        this.emit('ping', { latency: this.latency });
        break;
      case 'welcome':
        this.lastPong = Date.now();
        this.setState('online');
        if (Array.isArray(msg.players)) this.syncPlayers(msg.players);
        if (Array.isArray(msg.maps)) msg.maps.forEach((m) => this.receiveMap(m));
        if (Array.isArray(msg.chat)) msg.chat.forEach((m) => this.receiveChat(m));
        if (Array.isArray(msg.announcements)) this.emit('announcements', { list: msg.announcements });
        this.emit('welcome', { raw: msg });
        break;
      case 'hello':
      case 'join':
        if (msg.profile) this.upsertPlayer(msg.profile, msg.state);
        break;
      case 'players':
      case 'presence':
        this.syncPlayers(msg.players || msg.list || []);
        break;
      case 'state':
        this.upsertPlayer(msg.profile || { id: from }, msg);
        break;
      case 'leave':
      case 'bye':
        this.dropPlayer(msg.profile?.id || from);
        break;
      case 'chat':
        this.receiveChat({ ...msg, from });
        break;
      case 'map.new':
      case 'map.publish':
        this.receiveMap(msg.map || msg);
        break;
      case 'map.remove':
        this.emit('map.remove', { id: msg.id || msg.mapId });
        break;
      case 'admin.action':
        this.emit('admin', { action: msg.action, payload: msg.payload, by: msg.by || from });
        break;
      case 'announce':
        this.emit('announce', { ...msg.payload, by: msg.by || from });
        break;
      case 'invite':
        this.emit('invite', { mapId: msg.mapId, by: msg.profile?.name || from });
        break;
      case 'kick':
        if ((msg.target || msg.userId) === store.profile.id) this.emit('kick', { reason: msg.reason, by: msg.by || from });
        break;
      default:
        if (t) this.emit('unknown', { type: t, msg });
        break;
    }
  }

  syncPlayers(list) {
    const ids = new Set();
    for (const p of list) {
      const id = p.id || p.userId;
      if (!id || id === store.profile.id) continue;
      ids.add(id);
      this.upsertPlayer({ ...p, id }, p.state || p);
    }
    for (const id of [...this.players.keys()]) if (!ids.has(id)) this.dropPlayer(id);
  }

  upsertPlayer(profile, extra = {}) {
    const id = profile?.id;
    if (!id || id === store.profile.id) return;
    const prev = this.players.get(id) || {};
    const next = {
      ...prev,
      ...profile,
      id,
      pos: extra.pos || prev.pos || [0, 0, 0],
      yaw: extra.yaw ?? prev.yaw ?? 0,
      anim: extra.anim || prev.anim || 'idle',
      game: extra.game ?? prev.game ?? null,
      lastSeen: Date.now(),
    };
    const isNew = !prev.id;
    this.players.set(id, next);
    rememberUser({ id, name: next.name, role: next.role, avatar: next.avatar });
    if (isNew) {
      this.emit('player.join', { player: next });
      this.emit('players.changed', { list: this.listPlayers() });
    } else {
      this.emit('player.update', { player: next });
    }
  }

  dropPlayer(id) {
    if (!id || !this.players.has(id)) return;
    const p = this.players.get(id);
    this.players.delete(id);
    this.emit('player.leave', { player: p });
    this.emit('players.changed', { list: this.listPlayers() });
  }

  prune() {
    const now = Date.now();
    for (const [id, p] of this.players) if (now - p.lastSeen > STALE_MS) this.dropPlayer(id);
  }

  listPlayers(gameId = null) {
    const all = [...this.players.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return gameId ? all.filter((p) => p.game === gameId) : all;
  }

  count(gameId = null) {
    const others = this.listPlayers(gameId).length;
    return others + 1;
  }

  receiveChat(msg) {
    if (!msg || !msg.text) return;
    if (msg.id && this.chatLog.some((m) => m.id === msg.id)) return;
    const item = {
      id: msg.id || uid('msg'),
      from: msg.from || msg.userId || 'unknown',
      name: msg.name || msg.profile?.name || 'Игрок',
      role: msg.role || msg.profile?.role || 'user',
      text: String(msg.text).slice(0, 500),
      channel: msg.channel || 'global',
      at: msg.at || Date.now(),
    };
    this.chatLog.push(item);
    if (this.chatLog.length > 150) this.chatLog.shift();
    pushChat(item);
    this.emit('chat', { msg: item });
  }

  receiveMap(map) {
    if (!map || !map.id || !map.map) return;
    this.emit('map', { map });
  }

  /* ---------------- публичные действия ---------------- */

  chat(text, channel = 'global') {
    const p = store.profile;
    const msg = {
      t: 'chat',
      id: uid('msg'),
      text: String(text).slice(0, 500),
      channel,
      name: p.name,
      role: p.role,
      profile: { id: p.id, name: p.name, role: p.role, avatar: p.avatar },
      at: Date.now(),
    };
    this.send(msg, true);
    this.receiveChat(msg);
    return msg;
  }

  /** Публикуем карту в сеть. */
  publishMap(meta) {
    return this.send({ t: 'map.publish', map: meta }, true);
  }

  requestMaps() {
    return this.send({ t: 'maps.request' });
  }

  /** Троттлинговая рассылка позиции в игре. */
  broadcastState(state) {
    if (!store.settings.broadcastState) return;
    this.send({
      t: 'state',
      game: state.game,
      pos: state.pos,
      yaw: state.yaw,
      anim: state.anim,
      profile: this.selfProfile(),
    });
  }

  setGame(gameId) {
    this.send({ t: 'state', game: gameId, profile: this.selfProfile() });
  }

  invite(playerId, mapId) {
    return this.send({ t: 'invite', target: playerId, mapId, profile: this.selfProfile() });
  }

  adminAction(action, payload = {}) {
    return this.send({ t: 'admin.action', action, payload, by: store.profile.id, byName: store.profile.name });
  }

  announce(text) {
    return this.send({ t: 'announce', payload: { text, at: Date.now() }, by: store.profile.name });
  }

  bye() {
    this.send({ t: 'bye', profile: this.selfProfile() }, true);
  }
}

export const net = new Net();

setInterval(() => net.prune(), 8000);
window.addEventListener('beforeunload', () => net.bye());
