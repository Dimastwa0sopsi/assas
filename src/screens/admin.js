/**
 * GIMVERSE — система администрации: роли, баны, муты, модерация карт, объявления, журнал.
 */
import { h, toast, clear, timeAgo, fmtNum, promptDialog, confirmDialog } from '../core/ui.js';
import { store, updateProfile, logAdmin, pushAnnouncement, isAdmin } from '../core/store.js';
import { net } from '../core/net.js';
import { launch } from '../core/library.js';
import { sfx } from '../core/audio.js';

const ROLES = [
  ['user', 'Игрок'],
  ['moderator', 'Модератор'],
  ['admin', 'Администратор'],
  ['owner', 'Владелец'],
];
const BAN_TIMES = [
  [5 * 60 * 1000, '5 минут'],
  [60 * 60 * 1000, '1 час'],
  [24 * 60 * 60 * 1000, '1 день'],
  [7 * 24 * 60 * 60 * 1000, '7 дней'],
  [0, 'навсегда'],
];

export function renderAdmin(root, api) {
  if (!isAdmin()) {
    root.appendChild(renderLogin());
    return () => {};
  }
  let tab = 'dash';
  const content = h('div.col', { style: { gap: 18 } });
  const tabs = h(
    'div.tabs',
    ...[
      ['dash', '📊 Панель'],
      ['users', '👥 Пользователи'],
      ['mods', '🧱 Модерация карт'],
      ['announce', '📢 Объявления'],
      ['logs', '📜 Журнал'],
      ['rules', '⚙️ Правила платформы'],
    ].map(([id, label]) =>
      h('button', {
        class: tab === id ? 'active' : '',
        onclick: (e) => {
          tab = id;
          [...tabs.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
          sfx.tap();
          draw();
        },
      }, label)
    )
  );

  const pending = store.library.maps.filter((m) => (store.admin.moderation[m.id] || m.status) === 'pending').length;

  const el = h(
    'div.page.screen-fade',
    h(
      'div.page-head',
      h('div', h('h1', '🛡️ Администрация'), h('p', `Роль: ${ROLES.find((r) => r[0] === store.profile.role)?.[1] || store.profile.role}. Управление пользователями, модерация карт, объявления и правила платформы.`)),
      h('div.spacer'),
      pending ? h('span.badge.warn', `на модерации: ${pending}`) : h('span.badge.ok', 'очередь пуста'),
      h('button.btn.soft', { onclick: () => { updateProfile({ role: 'user' }); logAdmin('logout', store.profile.name); toast('Вы вышли из панели администрации'); api.refresh(); } }, '🚪 Выйти из админки')
    ),
    tabs,
    content
  );
  root.appendChild(el);

  function draw() {
    clear(content);
    if (tab === 'dash') content.appendChild(dash());
    else if (tab === 'users') content.appendChild(users());
    else if (tab === 'mods') content.appendChild(moderation());
    else if (tab === 'announce') content.appendChild(announcements());
    else if (tab === 'logs') content.appendChild(logs());
    else content.appendChild(rules());
  }
  draw();

  const off = store.subscribe((_s, p) => {
    if (['admin-log', 'library', 'announce', 'users'].includes(p.event)) draw();
  });
  return () => off();
}

/* ---------------- вход ---------------- */
function renderLogin() {
  const input = h('input.input', { type: 'password', placeholder: 'Код администратора' });
  const doLogin = () => {
    if (input.value.trim() === store.admin.code) {
      updateProfile({ role: store.profile.role === 'owner' ? 'owner' : 'admin' });
      logAdmin('login', store.profile.name);
      sfx.win();
      toast('Доступ разрешён', 'ok');
      window.dispatchEvent(new CustomEvent('gim:refresh'));
    } else {
      sfx.error();
      input.classList.add('err');
      toast('Неверный код администратора', 'err');
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && doLogin());
  return h(
    'div.page.screen-fade',
    h(
      'section.card',
      { style: { maxWidth: 460, margin: '40px auto' } },
      h('div.section-head', h('span', { style: { fontSize: 26 } }, '🛡️'), h('h2', 'Вход в панель администрации')),
      h('p.muted', { style: { margin: '8px 0 14px' } }, 'Раздел доступен администраторам и модераторам. Код по умолчанию задаётся при первом запуске платформы — смените его в «Правила платформы».'),
      h('div.field', h('label', 'Код'), input),
      h('div.row.wrap', { style: { marginTop: 12 } }, h('button.btn.primary', { onclick: doLogin }, 'Войти'), h('span.hint', `Подсказка для владельца: ${store.admin.code}`))
    )
  );
}

/* ---------------- панель ---------------- */
function dash() {
  const maps = store.library.maps;
  const pending = maps.filter((m) => (store.admin.moderation[m.id] || m.status) === 'pending');
  const bans = Object.keys(store.admin.bans).length;
  const queue = store.library.queue.length;

  return h(
    'div.col',
    h(
      'div.admin-grid',
      h('div.stat', h('small', 'Известно игроков'), h('b', fmtNum(Math.max(store.knownUsers.length, net.listPlayers().length)))),
      h('div.stat', h('small', 'Онлайн сейчас'), h('b', String(net.count()))),
      h('div.stat', h('small', 'Карт в библиотеке'), h('b', String(maps.length))),
      h('div.stat', h('small', 'Ждут модерации'), h('b', String(pending.length))),
      h('div.stat', h('small', 'Банов'), h('b', String(bans))),
      h('div.stat', h('small', 'Записей в журнале'), h('b', String(store.admin.logs.length)))
    ),
    h(
      'section.card',
      h('div.section-head', h('h2', '⚡ Быстрые действия')),
      h(
        'div.row.wrap',
        { style: { marginTop: 10 } },
        h('button.btn.primary', { onclick: async () => { const t = await promptDialog({ title: 'Объявление', text: 'Текст увидят все подключённые игроки', multiline: true, ok: 'Отправить' }); if (!t) return; pushAnnouncement({ text: t, pinned: false }); net.announce(t); logAdmin('announce', 'все', t.slice(0, 40)); toast('Объявление отправлено', 'ok'); } }, '📢 Отправить объявление'),
        queue
          ? h('button.btn.soft', { onclick: () => { let n = 0; for (const q of store.library.queue) { const m = store.library.maps.find((x) => x.id === q.id); if (m && net.publishMap(m)) n++; } if (n) { store.library.queue = store.library.queue.slice(n); store.save(); store.notify({ event: 'library' }); } toast(n ? `Отправлено карт: ${n}` : 'Сервер недоступен — очередь осталась', n ? 'ok' : 'warn'); } }, `🔁 Синхронизировать очередь (${queue})`)
          : null,
        h('button.btn.soft', { onclick: () => { store.admin.sessions++; store.save(); toast('Счётчик сессий увеличен'); } }, '🧪 Тестовая запись в журнал')
      )
    ),
    pending.length
      ? h(
          'section.card',
          h('div.section-head', h('h2', '🧱 Очередь модерации')),
          h('div.list', { style: { marginTop: 10 } }, pending.map((m) => h('div.item', h('div.avatar.sm', m.icon?.emoji || '🧱'), h('div', h('b', m.name), h('div.small.dim', `${m.blocks} блоков · ${m.authorName}`)), h('div.spacer'), h('button.btn.sm.soft', { onclick: () => launch(m) }, '▶'), h('button.btn.sm.ok', { onclick: () => moderate(m, 'approved') }, '✔ Одобрить'), h('button.btn.sm.danger', { onclick: () => moderate(m, 'rejected') }, '✖ Отклонить'))))
        )
      : null,
    h(
      'section.card',
      h('div.section-head', h('h2', '📜 Последние действия')),
      h('div.list', { style: { marginTop: 10 } }, store.admin.logs.slice(0, 6).map((l) => h('div.item', h('span', '•'), h('div.small.muted', `${l.action} → ${l.target || '—'} (${l.by})`), h('div.spacer'), h('span.small.dim', timeAgo(l.at)))))
    )
  );
}

function moderate(map, status) {
  store.admin.moderation[map.id] = status;
  map.status = status;
  store.save();
  store.notify({ event: 'library' });
  net.adminAction('map.moderate', { id: map.id, status });
  logAdmin(status === 'approved' ? 'approve.map' : 'reject.map', map.name);
  sfx.ui();
  toast(status === 'approved' ? 'Карта одобрена' : 'Карта отклонена', status === 'approved' ? 'ok' : 'warn');
}

/* ---------------- пользователи ---------------- */
function users() {
  const known = new Map(store.knownUsers.map((u) => [u.id, u]));
  for (const p of net.listPlayers()) known.set(p.id, { ...known.get(p.id), ...p, online: true });
  const list = [...known.values()].sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
  const onlineIds = new Set(net.listPlayers().map((p) => p.id));

  return h(
    'div.col',
    h(
      'section.card',
      h('div.section-head', h('h2', '👥 Пользователи'), h('div.spacer'), h('span.badge', `${list.length}`)),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        list.length
          ? list.map((u) => {
              const role = u.id === store.profile.id ? store.profile.role : store.admin.roles[u.id] || 'user';
              const ban = store.admin.bans[u.id];
              const mute = store.admin.mutes[u.id];
              return h(
                'div.item',
                h('div.avatar', u.avatar ? '🧍' : '👤'),
                h('div', h('b', u.name || 'Игрок'), h('div.small.dim', `${u.id.slice(0, 12)}… · ${onlineIds.has(u.id) ? 'в сети' : 'был(а) ' + timeAgo(u.seenAt || Date.now())}`)),
                ban ? h('span.badge.danger', `бан до ${ban.until ? new Date(ban.until).toLocaleDateString('ru-RU') : '∞'}`) : null,
                mute && mute.until > Date.now() ? h('span.badge.warn', 'мут') : null,
                h('div.spacer'),
                h(
                  'select.input',
                  {
                    style: { width: 'auto', padding: '6px 8px' },
                    onchange: (e) => {
                      const val = e.target.value;
                      if (u.id === store.profile.id) {
                        updateProfile({ role: val });
                        logAdmin('role.self', store.profile.name, val);
                      } else {
                        store.admin.roles[u.id] = val;
                        store.save();
                        store.notify({ event: 'users' });
                        net.adminAction('role', { target: u.id, role: val });
                        logAdmin('role', u.name, val);
                      }
                      toast('Роль обновлена', 'ok');
                    },
                  },
                  ...ROLES.map(([v, l]) => h('option', { value: v, selected: role === v }, l))
                ),
                h('button.btn.sm.soft', { onclick: () => doMute(u) }, mute && mute.until > Date.now() ? '🔊 Снять мут' : '🔇 Мут'),
                h('button.btn.sm.soft', { onclick: () => doKick(u) }, '👢 Кик'),
                h('button.btn.sm.danger', { onclick: () => doBan(u) }, ban ? '🔓 Разбан' : '⛔ Бан')
              );
            })
          : [h('div.empty', h('div.big', '👥'), h('div', 'Пока никого нет'), h('div.small', 'Игроки появятся здесь, как только подключатся к сети.'))]
      )
    )
  );

  async function doMute(u) {
    const cur = store.admin.mutes[u.id];
    if (cur && cur.until > Date.now()) {
      delete store.admin.mutes[u.id];
      logAdmin('unmute', u.name);
      net.adminAction('unmute', { target: u.id });
      toast('Мут снят', 'ok');
    } else {
      const mins = await promptDialog({ title: `Мут: ${u.name}`, text: 'Длительность в минутах', value: '15' });
      if (!mins) return;
      store.admin.mutes[u.id] = { until: Date.now() + Math.max(1, Number(mins) || 15) * 60000, by: store.profile.name, at: Date.now() };
      logAdmin('mute', u.name, `${mins} мин`);
      net.adminAction('mute', { target: u.id, minutes: Number(mins) });
      toast('Мут выдан', 'ok');
    }
    store.save();
    store.notify({ event: 'users' });
  }

  function doKick(u) {
    net.adminAction('kick', { target: u.id, name: u.name });
    logAdmin('kick', u.name);
    toast(`${u.name} исключён из сессии`, 'ok');
  }

  async function doBan(u) {
    const cur = store.admin.bans[u.id];
    if (cur) {
      delete store.admin.bans[u.id];
      store.save();
      store.notify({ event: 'users' });
      net.adminAction('unban', { target: u.id });
      logAdmin('unban', u.name);
      toast('Бан снят', 'ok');
      return;
    }
    const backdrop = h('div.backdrop');
    const close = () => backdrop.remove();
    const reason = h('input.input', { placeholder: 'Причина', value: 'Нарушение правил' });
    const timeSel = h('select.input', ...BAN_TIMES.map(([ms, l]) => h('option', { value: String(ms) }, l)));
    const card = h(
      'div.modal',
      h('div.modal-head', h('h2', `Бан: ${u.name}`), h('div.spacer'), h('button.btn.icon.ghost', { onclick: close }, '✕')),
      h('div.modal-body', h('div.field', h('label', 'Причина'), reason), h('div.field', h('label', 'Срок'), timeSel)),
      h(
        'div.modal-foot',
        h('button.btn.soft', { onclick: close }, 'Отмена'),
        h('button.btn.danger', {
          onclick: () => {
            const ms = Number(timeSel.value);
            store.admin.bans[u.id] = { until: ms ? Date.now() + ms : 0, reason: reason.value.trim() || 'без причины', by: store.profile.name, at: Date.now() };
            store.save();
            store.notify({ event: 'users' });
            net.adminAction('ban', { target: u.id, ms, reason: reason.value });
            logAdmin('ban', u.name, reason.value);
            close();
            toast('Бан выдан', 'ok');
          },
        }, '⛔ Забанить')
      )
    );
    backdrop.appendChild(card);
    document.getElementById('modal-root').appendChild(backdrop);
  }
}

/* ---------------- модерация ---------------- */
function moderation() {
  const maps = store.library.maps;
  return h(
    'section.card',
    h('div.section-head', h('h2', '🧱 Все карты'), h('div.spacer'), h('span.badge', `${maps.length}`)),
    maps.length
      ? h(
          'div.list',
          { style: { marginTop: 10 } },
          maps.map((m) => {
            const status = store.admin.moderation[m.id] || m.status || 'pending';
            return h(
              'div.item',
              h('div.avatar', m.icon?.image ? h('img', { src: m.icon.image, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : m.icon?.emoji || '🧱'),
              h('div', h('b', m.name), h('div.small.dim', `${m.blocks} блоков · ${m.authorName} · ▶ ${m.plays || 0}`)),
              h('span.badge.' + (status === 'published' || status === 'approved' ? 'ok' : status === 'rejected' ? 'danger' : 'warn'), status === 'approved' ? 'одобрена' : status),
              h('div.spacer'),
              h('button.btn.sm.soft', { onclick: () => launch(m) }, '▶'),
              h('button.btn.sm.ok', { onclick: () => moderate(m, 'approved') }, '✔'),
              h('button.btn.sm.danger', { onclick: () => moderate(m, 'rejected') }, '✖'),
              h('button.btn.sm.ghost', {
                onclick: async () => {
                  const ok = await confirmDialog({ title: 'Удалить карту', text: `«${m.name}» будет удалена у всех, кто её получил.`, ok: 'Удалить', danger: true });
                  if (!ok) return;
                  store.library.maps = store.library.maps.filter((x) => x.id !== m.id);
                  store.save();
                  store.notify({ event: 'library' });
                  net.adminAction('map.remove', { id: m.id });
                  logAdmin('delete.map', m.name);
                  toast('Карта удалена', 'ok');
                },
              }, '🗑')
            );
          })
        )
      : h('div.empty', h('div.big', '🧱'), h('div', 'Карт пока нет'))
  );
}

/* ---------------- объявления ---------------- */
function announcements() {
  const title = h('input.input', { placeholder: 'Заголовок (необязательно)', maxlength: 60 });
  const text = h('textarea.input', { placeholder: 'Текст объявления', rows: 3, maxlength: 300 });
  const pinned = h('div.toggle', { role: 'switch', 'aria-checked': 'false', onclick: (e) => e.target.setAttribute('aria-checked', String(e.target.getAttribute('aria-checked') !== 'true')) });

  return h(
    'div.col',
    h(
      'section.card',
      h('div.section-head', h('h2', '📢 Новое объявление')),
      h('div.col', { style: { marginTop: 10, gap: 10 } }, h('div.field', h('label', 'Заголовок'), title), h('div.field', h('label', 'Текст'), text), h('div.switch', h('span.t', 'Закрепить на главной'), pinned)),
      h(
        'div.row.wrap',
        { style: { marginTop: 12 } },
        h('button.btn.primary', {
          onclick: () => {
            if (!text.value.trim()) {
              toast('Введите текст объявления', 'warn');
              return;
            }
            pushAnnouncement({ title: title.value.trim(), text: text.value.trim(), pinned: pinned.getAttribute('aria-checked') === 'true' });
            net.announce(text.value.trim());
            logAdmin('announce', 'все', text.value.slice(0, 40));
            title.value = '';
            text.value = '';
            toast('Объявление опубликовано', 'ok');
          },
        }, '📢 Опубликовать')
      )
    ),
    h(
      'section.card',
      h('div.section-head', h('h2', '🗂️ История')),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        store.admin.announcements.length
          ? store.admin.announcements.map((a) =>
              h(
                'div.item',
                h('div.avatar.sm', a.pinned ? '📌' : '📢'),
                h('div', h('b', a.title || 'Объявление'), h('div.small.muted', a.text), h('div.small.dim', `${a.by} · ${timeAgo(a.at)}`)),
                h('div.spacer'),
                h('button.btn.sm.danger', {
                  onclick: () => {
                    store.admin.announcements = store.admin.announcements.filter((x) => x.id !== a.id);
                    store.save();
                    store.notify({ event: 'announce' });
                    logAdmin('announce.delete', a.title || a.text.slice(0, 20));
                  },
                }, '🗑')
              )
            )
          : [h('div.empty', h('div.big', '📭'), h('div', 'Объявлений пока нет'))]
      )
    )
  );
}

/* ---------------- журнал ---------------- */
function logs() {
  return h(
    'section.card',
    h('div.section-head', h('h2', '📜 Журнал действий'), h('div.spacer'), h('button.btn.sm.danger', {
      onclick: async () => {
        const ok = await confirmDialog({ title: 'Очистить журнал', text: 'Все записи будут удалены.', ok: 'Очистить', danger: true });
        if (!ok) return;
        store.admin.logs = [];
        store.save();
        store.notify({ event: 'admin-log' });
        toast('Журнал очищен', 'ok');
      },
    }, '🧽 Очистить')),
    h(
      'div.col',
      { style: { marginTop: 10, gap: 6 } },
      store.admin.logs.length
        ? store.admin.logs.map((l) => h('div.log-line', h('time', new Date(l.at).toLocaleString('ru-RU')), h('span', `${l.action} · ${l.target || '—'} ${l.detail ? '· ' + l.detail : ''} · ${l.by}`)))
        : [h('div.empty', h('div.big', '📜'), h('div', 'Журнал пуст'))]
    )
  );
}

/* ---------------- правила платформы ---------------- */
function rules() {
  const code = h('input.input', { value: store.admin.code, type: 'text' });
  const maxBlocks = h('input.input', { type: 'number', min: 100, max: 60000, step: 100, value: String(store.admin.limits.maxBlocks) });
  const maxJson = h('input.input', { type: 'number', min: 256, max: 32768, step: 256, value: String(store.admin.limits.maxJsonKb) });
  const regToggle = h('div.toggle', { role: 'switch', 'aria-checked': String(store.admin.limits.registration), onclick: (e) => e.target.setAttribute('aria-checked', String(e.target.getAttribute('aria-checked') !== 'true')) });

  return h(
    'div.col',
    h(
      'section.card',
      h('div.section-head', h('h2', '⚙️ Правила платформы')),
      h(
        'div.col',
        { style: { marginTop: 10, gap: 12 } },
        h('div.field', h('label', 'Код администратора'), code),
        h('div.row.wrap', h('div.field', { style: { flex: '1 1 160px' } }, h('label', 'Лимит блоков в карте'), maxBlocks), h('div.field', { style: { flex: '1 1 160px' } }, h('label', 'Макс. размер JSON, КБ'), maxJson)),
        h('div.switch', h('span.t', 'Публикация карт открыта'), regToggle),
        h('button.btn.primary', {
          onclick: () => {
            store.admin.code = code.value.trim() || 'gim-admin';
            store.admin.limits.maxBlocks = Math.max(100, Number(maxBlocks.value) || 6000);
            store.admin.limits.maxJsonKb = Math.max(256, Number(maxJson.value) || 4096);
            store.admin.limits.registration = regToggle.getAttribute('aria-checked') === 'true';
            store.save();
            store.notify({ event: 'admin-log' });
            logAdmin('settings', 'платформа');
            toast('Правила сохранены', 'ok');
          },
        }, '💾 Сохранить')
      )
    ),
    h(
      'section.card',
      h('div.section-head', h('h2', '🎭 Роли и права')),
      h(
        'div.list',
        { style: { marginTop: 10 } },
        [
          ['👑', 'Владелец', 'Полный доступ: роли, баны, модерация, правила платформы.'],
          ['🛡️', 'Администратор', 'Баны, муты, кик, модерация карт, объявления.'],
          ['🧑‍⚖️', 'Модератор', 'Модерация карт и муты.'],
          ['🧍', 'Игрок', 'Игры, публикация карт, чат.'],
        ].map(([em, name, desc]) => h('div.item', h('span', em), h('div', h('b', name), h('div.small.dim', desc))))
      )
    )
  );
}
