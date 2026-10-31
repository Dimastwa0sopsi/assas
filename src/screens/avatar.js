/**
 * GIMVERSE — редактор персонажа: 3D-просмотр, кастомизация, магазин и инвентарь.
 */
import { h, toast, clear } from '../core/ui.js';
import { store, updateAvatar, updateProfile, addCoins, owns, grant } from '../core/store.js';
import { buildAvatar, drawPortrait, SKINS, CLOTH, HAIR_COLORS, FACES, HAIRS, SHOP, shopItem } from '../three/avatar.js';
import { Stage } from '../three/preview.js';
import { sfx } from '../core/audio.js';
import { net } from '../core/net.js';

const FACE_META = {
  happy: ['😊', 'Улыбка'],
  cool: ['😎', 'Крутой'],
  angry: ['😠', 'Злой'],
  wink: ['😉', 'Подмигивание'],
  robot: ['🤖', 'Робо'],
  cute: ['🥺', 'Милый'],
  sleepy: ['😴', 'Сонный'],
};
const HAIR_META = {
  none: ['🚫', 'Без волос'],
  short: ['👦', 'Короткие'],
  spiky: ['⚡', 'Шипы'],
  bun: ['🍡', 'Пучок'],
  long: ['👧', 'Длинные'],
  mohawk: ['🦔', 'Ирокез'],
  ponytail: ['🎀', 'Хвост'],
};

export function renderAvatar(root, api) {
  let raf = 0;
  const canvas = h('canvas');
  const stage = new Stage({ preset: 'studio' });
  let avatar = buildAvatar(store.profile.avatar, { shadows: true });
  stage.set(avatar.group);
  stage.target.set(0, 0.85, 0);
  stage.distance = 3.4;
  stage.bindDrag(canvas);

  const coinsEl = h('b.badge.coin', `💰 ${store.profile.coins}`);
  const nameInput = h('input.input', { value: store.profile.name, maxlength: 18, placeholder: 'Имя персонажа' });
  const scaleRange = h('input', { type: 'range', min: 0.85, max: 1.3, step: 0.01, value: String(store.profile.avatar.scale || 1) });
  const scaleVal = h('span.small.mono', `${store.profile.avatar.scale || 1}`);
  const portrait = h('canvas', { style: { borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg-3)' } });

  const body = h('div.col');
  const tabs = h('div.tabs');
  const TABS = [
    ['body', '🎨 Тело'],
    ['face', '🙂 Лицо'],
    ['hair', '💇 Волосы'],
    ['hat', '👒 Уборы'],
    ['acc', '🎒 Аксессуары'],
    ['inv', '🧳 Инвентарь'],
  ];
  let tab = 'body';

  const refresh = () => {
    avatar.apply(store.profile.avatar);
    drawPortrait(portrait, store.profile.avatar, 120);
    net.send({ t: 'state', profile: net.selfProfile(), game: null });
    renderTab();
  };

  const patch = (p) => {
    updateAvatar(p);
    refresh();
    sfx.tap();
  };

  function swatches(colors, key) {
    return h(
      'div.swatches',
      colors.map((c) =>
        h('button.swatch', {
          style: { background: c },
          class: store.profile.avatar[key] === c ? 'active' : '',
          title: c,
          onclick: () => patch({ [key]: c }),
        })
      ),
      h('label', { style: { display: 'grid', placeItems: 'center' } }, h('input', { type: 'color', value: store.profile.avatar[key], oninput: (e) => patch({ [key]: e.target.value }) }), h('span.tiny', 'свой'))
    );
  }

  function picker(kind, meta, items) {
    return h(
      'div.grid-picker',
      items.map((id) => {
        const item = shopItem(kind, id);
        const locked = item && !owns(item.id);
        return h(
          'button.pick' + (store.profile.avatar[kind] === id ? '.active' : '') + (locked ? '.locked' : ''),
          {
            onclick: () => {
              if (item && locked) return tryBuy(kind, item);
              patch({ [kind]: id });
            },
          },
          h('span.em', meta?.[id]?.[0] || item?.em || '❔'),
          h('span', meta?.[id]?.[1] || item?.name || id),
          locked ? h('span.badge.coin', `💰 ${item.price}`) : null
        );
      })
    );
  }

  function shopGrid(kind) {
    return h(
      'div.col',
      h('div.row.between', h('span.lbl', 'Ма'), h('span.lbl', 'Магазин')),
      h(
        'div.grid-picker',
        SHOP[kind].map((item) => {
          const ownedNow = owns(item.id);
          const active = store.profile.avatar[kind] === item.id.replace(/^(hat|acc|trail)_/, '');
          return h(
            'button.pick' + (active ? '.active' : '') + (!ownedNow ? '.locked' : ''),
            {
              onclick: () => {
                if (!ownedNow) return tryBuy(kind, item);
                patch({ [kind]: item.id.replace(/^(hat|acc|trail)_/, '') });
              },
            },
            h('span.em', item.em),
            h('span', item.name),
            ownedNow ? (active ? h('span.badge.ok', 'надето') : h('span.small.dim', 'есть')) : h('span.badge.coin', `💰 ${item.price}`)
          );
        })
      )
    );
  }

  function tryBuy(kind, item) {
    if (store.profile.coins < item.price) {
      sfx.error();
      toast(`Не хватает ${item.price - store.profile.coins} монет. Заработайте их в играх!`, 'warn');
      return;
    }
    addCoins(-item.price);
    grant(item.id);
    sfx.buy();
    toast(`Куплено: ${item.name}`, 'ok');
    patch({ [kind]: item.id.replace(/^(hat|acc|trail)_/, '') });
    coinsEl.textContent = `💰 ${store.profile.coins}`;
  }

  function renderTab() {
    clear(body);
    coinsEl.textContent = `💰 ${store.profile.coins}`;
    if (tab === 'body') {
      body.append(
        h('div.field', h('label', 'Имя персонажа'), nameInput),
        h('div.field', h('label', 'Кожа'), swatches(SKINS, 'skin')),
        h('div.field', h('label', 'Футболка'), swatches(CLOTH, 'shirt')),
        h('div.field', h('label', 'Штаны'), swatches(CLOTH, 'pants')),
        h('div.field', h('label', 'Обувь'), swatches(['#151a26', '#1f2937', '#4b5563', '#8d5b3f', '#e5e7eb', '#7c5cff', '#22d3ee', '#fb7185'], 'shoes')),
        h('div.field', h('label', 'Рост'), h('div.row', scaleRange, scaleVal))
      );
    } else if (tab === 'face') {
      body.append(h('div.field', h('label', 'Выражение лица'), picker('face', FACE_META, FACES)), h('div.field', h('label', 'Цвет глаз'), swatches(['#2b3350', '#0f766e', '#7c3aed', '#b45309', '#111827', '#22d3ee', '#ef4444', '#f5f5f4'], 'eyes')));
    } else if (tab === 'hair') {
      body.append(h('div.field', h('label', 'Причёска'), picker('hair', HAIR_META, HAIRS)), h('div.field', h('label', 'Цвет волос'), swatches(HAIR_COLORS, 'hairColor')));
    } else if (tab === 'hat') {
      body.append(shopGrid('hat'), h('p.hint', 'Уборы покупаются за монеты, которые зарабатываются в играх и за поддержку авторов карт.'));
    } else if (tab === 'acc') {
      body.append(shopGrid('accessory'), h('div.field', h('label', 'След за персонажем'), shopGrid('trail')));
    } else if (tab === 'inv') {
      const ownedItems = [];
      for (const kind of ['hat', 'accessory', 'trail']) {
        for (const item of SHOP[kind]) {
          if (owns(item.id)) ownedItems.push({ kind, ...item });
        }
      }
      body.append(
        h('div.tiny', `В инвентаре: ${ownedItems.length}`),
        h(
          'div.list',
          ownedItems.map((it) => {
            const key = it.kind === 'hat' ? 'hat' : it.kind;
            const short = it.id.replace(/^(hat|acc|trail)_/, '');
            const equipped = store.profile.avatar[key] === short;
            return h(
              'div.item',
              h('div.avatar.sm', it.em),
              h('div', h('b', it.name), h('div.small.dim', it.kind === 'hat' ? 'Головной убор' : it.kind === 'accessory' ? 'Аксессуар' : 'След')),
              h('div.spacer'),
              h(
                `button.btn.sm.${equipped ? 'ok' : 'soft'}`,
                { onclick: () => patch({ [key]: short }) },
                equipped ? 'Надето' : 'Надеть'
              )
            );
          })
        ),
        h('div.tiny', 'Сброс'),
        h(
          'button.btn.soft',
          {
            onclick: () => {
              updateAvatar({ hat: 'none', accessory: 'none', trail: 'none', hair: 'short', face: 'happy' });
              refresh();
              toast('Внешность сброшена к базовой', 'ok');
            },
          },
          '↩ Сбросить внешний вид (предметы останутся в инвентаре)'
        )
      );
    }
  }

  for (const [id, label] of TABS) {
    tabs.appendChild(
      h('button', {
        class: tab === id ? 'active' : '',
        onclick: (e) => {
          tab = id;
          [...tabs.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
          sfx.tap();
          renderTab();
        },
      }, label)
    );
  }

  nameInput.addEventListener('change', () => {
    const v = nameInput.value.trim().slice(0, 18);
    if (!v) {
      nameInput.value = store.profile.name;
      return;
    }
    updateProfile({ name: v });
    toast('Имя обновлено', 'ok');
    net.send({ t: 'hello', profile: net.selfProfile() });
  });
  scaleRange.addEventListener('input', () => {
    scaleVal.textContent = scaleRange.value;
    updateAvatar({ scale: Number(scaleRange.value) });
    avatar.apply(store.profile.avatar);
    drawPortrait(portrait, store.profile.avatar, 120);
  });

  const el = h(
    'div.page.screen-fade',
    h('div.page-head', h('div', h('h1', '🧍 Редактор персонажа'), h('p', 'Соберите образ: цвета, лицо, причёска, уборы и аксессуары. Персонаж используется во всех играх и виден другим игрокам в онлайне.')), h('div.spacer'), coinsEl),
    h(
      'div.editor',
      h(
        'div.viewport',
        canvas,
        h(
          'div.hud',
          h('button.btn.sm.soft', { onclick: () => { stage.yaw += 0.8; } }, '↻ Повернуть'),
          h('button.btn.sm.soft', { onclick: randomize }, '🎲 Случайно'),
          h('button.btn.sm.soft', { onclick: emoteWave }, '👋 Помахать'),
          h('button.btn.sm.soft', { onclick: emoteDance }, '🕺 Танец'),
          h('div.spacer'),
          h('span.small.dim', 'Перетащите мышью — обзор · колесо — зум')
        )
      ),
      h(
        'div.card',
        h('div.row', h('div', portrait), h('div', h('b', 'Так вас видят другие'), h('div.small.dim', 'Портрет используется в карточках, чате и списках игроков'))),
        h('div', { style: { height: 12 } }),
        tabs,
        body
      )
    )
  );

  let emote = null;
  function emoteWave() {
    emote = 'wave';
    setTimeout(() => (emote = null), 2600);
    sfx.ui();
  }
  function emoteDance() {
    emote = 'dance';
    setTimeout(() => (emote = null), 5200);
    sfx.ui();
  }
  function randomize() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    updateAvatar({
      skin: pick(SKINS),
      shirt: pick(CLOTH),
      pants: pick(CLOTH),
      shoes: pick(['#151a26', '#1f2937', '#e5e7eb', '#7c5cff']),
      eyes: pick(['#2b3350', '#0f766e', '#7c3aed', '#111827']),
      face: pick(FACES),
      hair: pick(HAIRS),
      hairColor: pick(HAIR_COLORS),
    });
    refresh();
    toast('Случайный образ готов', 'ok');
  }

  root.appendChild(el);
  refresh();

  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    avatar.update(dt, { speed: 0, grounded: true, emote });
    stage.renderTo(canvas, { dt });
  };
  raf = requestAnimationFrame(loop);

  const offStore = store.subscribe((_s, p) => {
    if (p.event === 'coins') coinsEl.textContent = `💰 ${store.profile.coins}`;
  });

  return () => {
    cancelAnimationFrame(raf);
    offStore();
    avatar.dispose();
    stage.dispose();
  };
}
