/**
 * GIMVERSE — экран «Онлайн»: подключение к серверу, игроки, чат, приглашения.
 */
import { h, toast, clear, fmtClock } from '../core/ui.js';
import { store, updateSettings, isAdmin, logAdmin } from '../core/store.js';
import { net } from '../core/net.js';
import { drawPortrait } from '../three/avatar.js';
import { allGames, launch, findGame } from '../core/library.js';
import { sfx } from '../core/audio.js';
import { DEFAULT_SETTINGS } from '../core/store.js';

const STATE_TEXT = {
  online: ['ok', 'Сервер подключён', 'Сообщения уходят на сервер и видны всем игрокам.'],
  connecting: ['warn', 'Подключение…', 'Пытаемся установить соединение с сервером.'],
  local: ['warn', 'Локальный режим', 'Сервер недоступен. Работает резервный канал: игроки в других вкладках этого браузера видят друг друга.'],
  offline: ['err', 'Отключено', 'Соединение выключено вручную.'],
};

export function renderOnline(root, api) {
  let channel = 'global';
  const urlInput = h('input.input', { value: store.settings.serverUrl, placeholder: 'wss://…' });
  const statusDot = h('span.dot');
  const statusTitle = h('b');
  const statusText = h('div.small.dim');
  const pingEl = h('span.badge');
  const logBox = h('div.col', { style: { gap: 6, maxHeight: 140, overflow: 'auto' } });
  const playersBox = h('div.list');
  const chatLog = h('div.chat-log');
  const chatInput = h('input.input', { placeholder: 'Сообщение… (Enter — отправить)', maxlength: 400 });

  function drawStatus() {
    const [cls, title, text] = STATE_TEXT[net.state] || STATE_TEXT.offline;
    statusDot.className = `dot ${cls}` + (net.state === 'connecting' ? ' pulse' : '');
    statusTitle.textContent = title;
    statusText.textContent = text;
    pingEl.textContent = net.state === 'online' ? `пинг ${net.latency || '—'} мс` : net.state === 'local' ? 'резервный канал' : 'нет связи';
  }

  function logLine(text) {
    logBox.appendChild(h('div.log-line', h('time', fmtClock(Date.now())), h('span', text)));
    if (logBox.children.length > 40) logBox.firstChild.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }

  function drawPlayers() {
    clear(playersBox);
    const list = net.listPlayers();
    if (!list.length) {
      playersBox.appendChild(
        h('div.empty', h('div.big', '👥'), h('div', 'Других игроков пока нет'), h('div.small', 'Откройте платформу в другой вкладке или дождитесь подключения к серверу.'))
      );
      return;
    }
    for (const p of list) {
      const portrait = h('canvas.avatar', { style: { width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)' } });
      try {
        drawPortrait(portrait, p.avatar || {}, 40);
      } catch {
        portrait.textContent = '👤';
      }
      const game = p.game ? findGame(p.game) : null;
      playersBox.appendChild(
        h(
          'div.item',
          portrait,
          h('div', h('b', p.name || 'Игрок'), h('div.small.dim', game ? `▶ ${game.name}` : 'в меню')),
          p.role && p.role !== 'user' ? h('span.badge.' + (p.role === 'owner' ? 'admin' : 'mod'), p.role === 'owner' ? 'OWNER' : p.role === 'admin' ? 'ADMIN' : 'MOD') : null,
          h('div.spacer'),
          h('button.btn.sm.soft', { onclick: () => invite(p) }, '🎮 Пригласить'),
          h('button.btn.sm.ghost', { onclick: () => { chatInput.value = `${p.name}, `; chatInput.focus(); } }, '💬'),
          isAdmin()
            ? h('button.btn.sm.danger', { onclick: () => adminAction(p, 'kick') }, '⛔')
            : null
        )
      );
    }
  }

  function invite(p) {
    const games = allGames();
    const backdrop = h('div.backdrop');
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => e.target === backdrop && close());
    const card = h(
      'div.modal',
      h('div.modal-head', h('h2', `Пригласить ${p.name}`), h('div.spacer'), h('button.btn.icon.ghost', { onclick: close }, '✕')),
      h(
        'div.modal-body',
        h('div.list', games.map((g) => h('div.item', h('div.avatar.sm', g.icon?.emoji || '🎮'), h('div', h('b', g.name), h('div.small.dim', g.desc?.slice(0, 60))), h('div.spacer'), h('button.btn.sm.primary', {
          onclick: () => {
            net.invite(p.id, g.id);
            toast(`Приглашение в «${g.name}» отправлено`, 'ok');
            close();
          },
        }, 'Позвать'))))
      )
    );
    backdrop.appendChild(card);
    document.getElementById('modal-root').appendChild(backdrop);
  }

  function adminAction(p, action) {
    net.adminAction(action, { target: p.id, name: p.name });
    if (action === 'kick') {
      store.admin.bans[p.id] = { until: Date.now() + 5 * 60 * 1000, reason: 'Кик администратором (5 минут)', by: store.profile.name, at: Date.now() };
      store.save();
      logAdmin('kick', p.name, '5 минут');
      toast(`${p.name} исключён на 5 минут`, 'ok');
      drawPlayers();
    }
  }

  /* ---------- чат ---------- */
  function drawChat() {
    clear(chatLog);
    const msgs = [...store.chat].filter((m) => channel === 'global' || m.channel === channel).slice(-60);
    if (!msgs.length) {
      chatLog.appendChild(h('div.empty', h('div.big', '💬'), h('div', 'Сообщений пока нет'), h('div.small', 'Напишите первым — вас услышат все подключённые игроки.')));
      return;
    }
    for (const m of msgs) {
      const me = m.from === store.profile.id;
      chatLog.appendChild(
        h(
          'div.msg' + (me ? '.me' : ''),
          h('div.avatar.sm', m.role === 'owner' ? '👑' : m.role === 'admin' ? '🛡️' : '🧍'),
          h('div', h('div.who', `${m.name || 'Игрок'} · ${fmtClock(m.at)}`), h('div.bubble', m.text))
        )
      );
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function send() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (store.profile.mutedUntil > Date.now()) {
      toast('Чат недоступен: вы в муте', 'err');
      return;
    }
    net.chat(text, channel);
    chatInput.value = '';
    sfx.msg();
    drawChat();
  }
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  const el = h(
    'div.page.screen-fade',
    h('div.page-head', h('div', h('h1', '🌐 Онлайн'), h('p', 'Сервер, игроки в реальном времени, чат и приглашения в игры.')), h('div.spacer'), h('span.badge', `👥 ${net.count()} в сети`)),

    h(
      'section.card',
      h('div.row', statusDot, statusTitle, h('div.spacer'), pingEl),
      h('div', { style: { marginTop: 4 } }, statusText),
      h('div.field', { style: { marginTop: 12 } }, h('label', 'Адрес сервера'), h('div.row', urlInput, h('button.btn.primary', {
        onclick: () => {
          updateSettings({ serverUrl: urlInput.value.trim() });
          net.connect(urlInput.value.trim());
          toast('Подключаемся…', 'info');
        },
      }, 'Подключиться'), h('button.btn.soft', { onclick: () => { net.disconnect(); drawStatus(); } }, 'Отключиться'))),
      h('p.hint', { style: { marginTop: 8 } }, `По умолчанию: ${DEFAULT_SETTINGS.serverUrl}. Для ngrok free автоматически добавляется параметр обхода предупреждения.`),
      h('div', { style: { marginTop: 10 } }, logBox)
    ),

    h(
      'div.dev-layout',
      h(
        'section.card',
        h('div.section-head', h('h2', '👥 Игроки'), h('div.spacer'), h('span.badge', `${net.listPlayers().length}`)),
        h('div', { style: { marginTop: 10 } }, playersBox)
      ),
      h(
        'div.col',
        h(
          'section.chat',
          h(
            'div.tabs',
            { style: { padding: '0 10px' } },
            ...[
              ['global', '🌍 Общий'],
              ['game', '🎮 Игровой'],
            ].map(([id, label]) =>
              h('button', { class: channel === id ? 'active' : '', onclick: (e) => { channel = id; [...e.target.parentNode.children].forEach((c) => c.classList.remove('active')); e.target.classList.add('active'); drawChat(); } }, label)
            )
          ),
          chatLog,
          h('div.chat-form', chatInput, h('button.btn.primary', { onclick: send }, '➤'))
        ),
        h(
          'section.card',
          h('div.section-head', h('h2', '🚀 Быстрый запуск с друзьями')),
          h('p.hint', { style: { margin: '8px 0 10px' } }, 'Запустите игру — другие игроки увидят вас внутри и смогут присоединиться по приглашению.'),
          h(
            'div.row.wrap',
            allGames().slice(0, 3).map((g) => h('button.btn.soft.sm', { onclick: () => launch(g) }, `${g.icon?.emoji || '🎮'} ${g.name}`))
          )
        )
      )
    )
  );

  root.appendChild(el);
  drawStatus();
  drawPlayers();
  drawChat();
  logLine(net.state === 'online' ? 'Соединение активно' : 'Ожидание сервера, резервный канал включён');

  const off = net.on((ev) => {
    if (ev.type === 'status') {
      drawStatus();
      logLine(STATE_TEXT[ev.state]?.[1] || ev.state);
    } else if (ev.type === 'ping') drawStatus();
    else if (ev.type === 'players.changed') drawPlayers();
    else if (ev.type === 'chat') drawChat();
    else if (ev.type === 'log') logLine(ev.text);
    else if (ev.type === 'map') {
      logLine(`Новая карта в сети: ${ev.map.name}`);
    } else if (ev.type === 'invite') {
      const g = findGame(ev.mapId);
      logLine(`Приглашение от ${ev.by}: ${g?.name || ev.mapId}`);
      toast(`${ev.by} зовёт в «${g?.name || 'игру'}»`, 'info', 6000);
    } else if (ev.type === 'announce') {
      logLine(`📢 Объявление: ${ev.text}`);
      toast(`📢 ${ev.text}`, 'warn', 6000);
    }
  });

  const offStore = store.subscribe((_s, p) => {
    if (p.event === 'chat') drawChat();
    if (p.event === 'users') drawPlayers();
  });

  const timer = setInterval(() => drawPlayers(), 9000);

  return () => {
    off();
    offStore();
    clearInterval(timer);
  };
}

