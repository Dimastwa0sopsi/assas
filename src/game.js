/**
 * GIMVERSE — игровой рантайм: канвас, HUD, игрок, сетевые игроки, пауза, награды.
 * Игры (src/games/*) получают готовый контекст и занимаются только своей механикой.
 */
import * as THREE from 'three';
import { Engine, CameraRig, PlayerController, makeParticles } from './three/engine.js';
import { buildAvatar } from './three/avatar.js';
import { Input, mountTouchControls } from './core/input.js';
import { store, updateSettings, addCoins, trackPlay, trackBest } from './core/store.js';
import { net } from './core/net.js';
import { h, clear, fmtTime, fmtNum, toast, esc } from './core/ui.js';
import { sfx } from './core/audio.js';

export const BUILTIN_GAMES = [
  {
    id: 'gim-obby',
    builtin: 'obby',
    name: 'Небесный паркур',
    desc: 'Башня из платформ над облаками: чекпоинты, монеты, движущиеся плиты и финишный подиум.',
    icon: { emoji: '🏔️', color: '#7c5cff' },
    tags: ['Обби', 'Паркур', 'Соло'],
    genre: 'obby',
    author: 'GIMVERSE',
  },
  {
    id: 'gim-arena',
    builtin: 'arena',
    name: 'Кристальная арена',
    desc: '90 секунд на арене: собирай кристаллы быстрее ботов, лови бонусы и удерживай комбо.',
    icon: { emoji: '💎', color: '#22d3ee' },
    tags: ['Арена', 'Сбор', 'Боты'],
    genre: 'arena',
    author: 'GIMVERSE',
  },
];

let current = null;

export const activeGame = () => current;

/**
 * @param {{meta:object, onExit:Function}} opts
 */
export function startGame({ meta, onExit }) {
  if (current) current.exit();
  const root = document.getElementById('game-root');
  root.hidden = false;
  clear(root);
  document.body.classList.add('in-game');

  const canvas = h('canvas');
  root.appendChild(canvas);

  const settings = store.settings;
  const engine = new Engine(canvas, {
    quality: settings.quality,
    shadows: settings.shadows,
    fov: settings.fov,
    preset: meta.preset || 'day',
  });
  engine.renderer.domElement.style.touchAction = 'none';

  const input = new Input().attach().setCanvas(canvas);
  const rig = new CameraRig(engine.camera);
  const player = new PlayerController(engine.world, { height: 1.8, radius: 0.31 });
  const avatar = buildAvatar(store.profile.avatar, { shadows: settings.shadows });
  engine.scene.add(avatar.group);

  const particles = makeParticles(300, 0xffd166, 0.18);
  engine.scene.add(particles);

  /* ---------- HUD ---------- */
  const hud = h('div.game-hud');
  const topBar = h('div.hud-top');
  const statsRow = h('div.row.wrap', { style: { gap: '8px' } });
  const pauseBtn = h('button.hud-pill', { title: 'Пауза (Esc)' }, '⏸');
  topBar.append(statsRow, h('div.spacer'), pauseBtn);
  const toastLine = h('div.hud-toast', { style: { display: 'none' } });
  const bottom = h('div.hud-bottom');
  const coinPill = h('div.hud-pill', h('span.em', '💰'), h('span', '0'));
  const hints = h('div.hud-pill.small', 'WASD — движение · Пробел — прыжок · ЛКМ — обзор · Esc — пауза');
  bottom.append(coinPill, h('div.spacer'), hints);
  const tagLayer = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
  const fpsEl = h('div.fps', { style: { display: settings.showFps ? 'block' : 'none' } }, '– FPS');
  hud.append(topBar, toastLine, bottom, tagLayer, fpsEl);
  root.appendChild(hud);

  mountTouchControls(hud, input, { onAction: () => game?.onAction?.() });

  let sessionCoins = 0;
  let hudToastTimer = null;
  const api = {
    engine,
    input,
    rig,
    player,
    avatar,
    particles,
    meta,
    stats: {},
    scene: engine.scene,
    world: engine.world,
    get sessionCoins() {
      return sessionCoins;
    },
    addCoins(n) {
      sessionCoins += n;
      addCoins(n);
      coinPill.lastChild.textContent = String(store.profile.coins);
      return sessionCoins;
    },
    toast(text, ms = 1800) {
      toastLine.textContent = text;
      toastLine.style.display = 'block';
      clearTimeout(hudToastTimer);
      hudToastTimer = setTimeout(() => (toastLine.style.display = 'none'), ms);
    },
    shake(v = 0.5) {
      rig.shake = Math.max(rig.shake, v);
    },
    say(text) {
      toast(text, 'info', 2600);
    },
  };

  coinPill.lastChild.textContent = String(store.profile.coins);

  /* ---------- сетевые игроки ---------- */
  const remotes = new Map();
  const remoteLayer = [];

  function addRemote(p) {
    if (remotes.has(p.id)) return;
    const av = buildAvatar(p.avatar || {}, { shadows: false });
    av.group.scale.setScalar(1);
    engine.scene.add(av.group);
    const tag = h('div.nametag', esc(p.name || 'Игрок'));
    tagLayer.appendChild(tag);
    const entry = {
      id: p.id,
      av,
      tag,
      pos: new THREE.Vector3(...(p.pos || [player.position.x, player.position.y, player.position.z + 2])),
      yaw: p.yaw || 0,
      anim: 'idle',
      t: 0,
    };
    remotes.set(p.id, entry);
    api.toast(`${p.name || 'Игрок'} в игре`);
    sfx.msg();
  }

  function dropRemote(id) {
    const e = remotes.get(id);
    if (!e) return;
    engine.scene.remove(e.av.group);
    e.av.dispose();
    e.tag.remove();
    remotes.delete(id);
  }

  const offNet = [
    net.on((ev) => {
      if (ev.type === 'player.join') addRemote(ev.player);
      else if (ev.type === 'player.leave') dropRemote(ev.player?.id);
      else if (ev.type === 'player.update') {
        const e = remotes.get(ev.player.id);
        if (!e) return;
        if (ev.player.game && ev.player.game !== meta.id) return;
        e.pos.set(...ev.player.pos);
        e.yaw = ev.player.yaw || 0;
        e.anim = ev.player.anim || 'idle';
      } else if (ev.type === 'chat' && store.settings.chat) {
        api.toast(`💬 ${ev.msg.name}: ${ev.msg.text.slice(0, 60)}`);
      } else if (ev.type === 'kick') {
        api.say(`Вас исключил администратор: ${ev.reason || 'без причины'}`);
        setTimeout(() => api.finishGame?.({ kicked: true }), 1200);
      }
    }),
  ];
  net.setGame(meta.id);
  for (const p of net.listPlayers(meta.id)) addRemote(p);

  /* ---------- игра ---------- */
  let game = null;
  try {
    game = createGameInstance(meta, api);
  } catch (err) {
    console.error('[game] не удалось создать игру', err);
    toast('Ошибка запуска игры: ' + err.message, 'err', 6000);
    api.exit();
    return null;
  }

  api.game = game;
  game.onAction = game.onAction || (() => {});

  // старт
  if (game.spawn) player.teleport(game.spawn.x, game.spawn.y, game.spawn.z);
  rig.smooth.set(player.position.x, player.position.y + 3, player.position.z + 6);
  rig.yaw = game.startYaw ?? Math.PI;
  rig.update(0, player.position, { instant: true });
  trackPlay(meta.id);

  /* ---------- HUD-статы ---------- */
  function refreshStats() {
    const list = game.stats?.() || [];
    if (list.length !== statsRow.children.length) {
      clear(statsRow);
      for (const s of list) statsRow.appendChild(h('div.hud-pill', h('span.em', s.em || ''), h('span', String(s.value ?? ''))));
    } else {
      list.forEach((s, i) => {
        const pill = statsRow.children[i];
        pill.firstChild.textContent = s.em || '';
        pill.lastChild.textContent = String(s.value ?? '');
      });
    }
  }
  refreshStats();

  /* ---------- пауза ---------- */
  let paused = false;
  let overlay = null;

  function buildOverlay(kind, data = {}) {
    overlay?.remove();
    const card = h('div.overlay-card');
    if (kind === 'pause') {
      card.append(
        h('div.row', h('div', { style: { fontSize: 34 } }, meta.icon?.emoji || '🎮'), h('div', h('h2', { style: { margin: 0 } }, meta.name), h('div.small.dim', 'Пауза'))),
        h('div.list',
          h('div.item', h('span', '💰'), h('div', h('b', `Монет за сессию: ${sessionCoins}`))),
          h('div.item', h('span', '⏱️'), h('div', h('b', `Время: ${fmtTime(game.time || 0)}`))),
          game.summary ? h('div.item', h('span', '📊'), h('div', h('b', game.summary()))) : null
        ),
        h('div.col',
          h('button.btn.primary', { onclick: () => resume() }, '▶ Продолжить'),
          h('button.btn.soft', {
            onclick: () => {
              const q = ['low', 'medium', 'high'];
              const next = q[(q.indexOf(store.settings.quality) + 1) % q.length];
              updateSettings({ quality: next });
              engine.setQuality(next, store.settings.shadows);
              api.say(`Качество: ${next === 'high' ? 'высокое' : next === 'medium' ? 'среднее' : 'низкое'}`);
            },
          }, `🎚️ Качество: ${store.settings.quality}`),
          h('button.btn.soft', { onclick: () => game.restart?.() }, '🔄 Заново'),
          h('button.btn.danger', { onclick: () => api.exit() }, '🚪 Выйти в меню')
        )
      );
    } else if (kind === 'finish') {
      const reward = data.reward || 0;
      card.append(
        h('div', { style: { textAlign: 'center', fontSize: 46 } }, data.emoji || '🏁'),
        h('h2', { style: { margin: 0, textAlign: 'center' } }, data.title || 'Готово!'),
        h('p.muted', { style: { margin: 0, textAlign: 'center' } }, data.text || ''),
        data.rows ? h('div.list', data.rows.map((r) => h('div.item', h('span', r.em), h('div', h('b', r.label)), h('div.spacer'), h('b', r.value)))) : null,
        reward ? h('div.badge.coin', { style: { alignSelf: 'center' } }, `+${reward} монет`) : null,
        h('div.col',
          h('button.btn.primary', { onclick: () => game.restart?.() }, '🔄 Играть ещё'),
          meta.donates?.items?.length
            ? h('button.btn.soft', { onclick: () => openDonateSheet(meta) }, '💝 Поддержать автора')
            : null,
          h('button.btn.soft', {
            onclick: async () => {
              const text = `Я прошёл «${meta.name}» в GIMVERSE: ${data.text || ''}`;
              await navigator.clipboard?.writeText(text).catch(() => {});
              api.say('Результат скопирован');
            },
          }, '📋 Поделиться результатом'),
          h('button.btn.ghost', { onclick: () => api.exit() }, 'Выйти в меню')
        )
      );
    } else if (kind === 'dead') {
      card.append(
        h('div', { style: { textAlign: 'center', fontSize: 44 } }, '💀'),
        h('h2', { style: { margin: 0, textAlign: 'center' } }, 'Вы упали!'),
        h('p.muted', { style: { margin: 0, textAlign: 'center' } }, data.text || 'Возврат на последний чекпоинт.'),
        h('button.btn.primary', { onclick: () => resume() }, 'Продолжить')
      );
    }
    overlay = h('div.overlay-screen', card);
    hud.appendChild(overlay);
  }

  function pause() {
    if (paused) return;
    paused = true;
    buildOverlay('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resume() {
    paused = false;
    overlay?.remove();
    overlay = null;
    input.reset();
  }
  pauseBtn.onclick = () => (paused ? resume() : pause());

  api.pause = pause;
  api.resume = resume;
  api.showOverlay = (kind, data) => {
    paused = true;
    buildOverlay(kind, data);
  };

  window.addEventListener('keydown', onGlobalKey);
  function onGlobalKey(e) {
    if (e.code === 'Escape') {
      e.preventDefault();
      paused ? resume() : pause();
    }
  }

  /* ---------- цикл ---------- */
  let last = performance.now();
  let frames = 0;
  let fpsT = 0;
  let netT = 0;
  let running = true;
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!running) return;

    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      if (store.settings.showFps) fpsEl.textContent = `${Math.round(frames / fpsT)} FPS`;
      frames = 0;
      fpsT = 0;
    }

    if (paused) {
      engine.renderer.render(engine.scene, engine.camera);
      return;
    }

    // обзор
    const look = input.consumeLook(store.settings.invertY);
    rig.look(look.dx, look.dy, store.settings.sensitivity, store.settings.invertY);
    rig.zoom(input.consumeWheel());
    if (store.settings.pointerLock && input.pointerDown && !input.locked && canvas.requestPointerLock) canvas.requestPointerLock();

    // движение
    const move = { x: input.moveX, z: input.moveZ };
    const jump = input.consumeJump();
    const st = game.control ? game.control(dt) : {};
    const res = player.update(dt, move, {
      yaw: rig.yaw,
      jump,
      sprint: input.run,
      speedScale: st.speedScale ?? 1,
      gravityScale: st.gravityScale ?? 1,
    });

    // аватар
    avatar.group.position.copy(player.position);
    const moving = res.speed > 0.4;
    if (moving) avatar.group.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
    avatar.update(dt, {
      speed: res.speed,
      run: input.run,
      grounded: res.grounded,
      emote: game.emote || null,
      baseY: 0,
    });
    engine.focusShadows(player.position.x, player.position.z, 55);
    rig.update(dt, player.position);

    // игра
    game.update?.(dt, { player, rig, res, input });

    // сетевые игроки
    for (const e of remotes.values()) {
      e.av.group.position.lerp(e.pos, 1 - Math.exp(-8 * dt));
      e.av.group.rotation.y = e.yaw;
      e.av.update(dt, { speed: e.anim === 'walk' ? 3 : 0, grounded: true });
      const v = e.av.group.position.clone();
      v.y += 2.1;
      v.project(engine.camera);
      if (v.z < 1) {
        e.tag.style.display = 'block';
        e.tag.style.left = `${(v.x * 0.5 + 0.5) * canvas.clientWidth}px`;
        e.tag.style.top = `${(-v.y * 0.5 + 0.5) * canvas.clientHeight}px`;
      } else e.tag.style.display = 'none';
    }

    particles.userData.update(dt);
    refreshStats();

    // сеть
    netT += dt;
    if (netT > 0.1) {
      netT = 0;
      net.broadcastState({
        game: meta.id,
        pos: [round(player.position.x), round(player.position.y), round(player.position.z)],
        yaw: round(avatar.group.rotation.y),
        anim: res.grounded ? (res.speed > 0.4 ? 'walk' : 'idle') : 'jump',
      });
    }

    engine.renderer.render(engine.scene, engine.camera);
  }
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => engine.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight));
  ro.observe(canvas);
  engine.resize(window.innerWidth, window.innerHeight);

  function onVisibility() {
    if (document.hidden && !paused) pause();
  }
  document.addEventListener('visibilitychange', onVisibility);

  api.exit = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('keydown', onGlobalKey);
    input.detach();
    offNet.forEach((off) => off());
    net.setGame(null);
    game.dispose?.();
    avatar.dispose();
    for (const e of remotes.values()) {
      e.av.dispose();
      e.tag.remove();
    }
    remotes.clear();
    engine.dispose();
    root.hidden = true;
    clear(root);
    document.body.classList.remove('in-game');
    current = null;
    if (document.pointerLockElement) document.exitPointerLock();
    onExit?.();
  };

  api.finishGame = (data) => {
    if (data?.kicked) {
      api.exit();
      return;
    }
    const reward = data?.reward ?? 0;
    if (reward) api.addCoins(reward);
    sfx.win();
    api.showOverlay('finish', data);
  };

  current = api;
  return api;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/* ============================================================
   Подключение игр
   ============================================================ */
import { createObby } from './games/obby.js';
import { createArena } from './games/arena.js';

function createGameInstance(meta, api) {
  if (meta.builtin === 'arena') return createArena(api);
  return createObby(api, meta.map?.items ? meta.map : null);
}

/* ============================================================
   Донаты карты (общий UI для игры и каталога)
   ============================================================ */
export function openDonateSheet(meta) {
  const items = meta?.donates?.items || [];
  const root = document.getElementById('modal-root');
  const backdrop = h('div.backdrop');
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());

  const list = h('div.list');
  const goal = meta.donates?.goal || 0;
  const collected = store.stats.donated?.[meta.id]?.total || 0;

  for (const it of items) {
    const bought = store.stats.donated?.[meta.id]?.items?.includes(it.id);
    const row = h(
      'div.item',
      h('div.avatar', it.icon || '🎁'),
      h('div', h('b', it.name), h('div.small.dim', it.desc || perkLabel(it.perk))),
      h('div.spacer'),
      h('div.col', { style: { alignItems: 'flex-end', gap: 6 } },
        h('div.badge.coin', `💰 ${it.price}`),
        h(
          `button.btn.sm.${bought ? 'ok' : 'primary'}`,
          { disabled: bought || store.profile.coins < it.price },
          bought ? 'Куплено' : 'Поддержать'
        )
      )
    );
    row.querySelector('button').onclick = () => {
      if (store.profile.coins < it.price) {
        sfx.error();
        toast('Не хватает монет — заработайте их в играх', 'warn');
        return;
      }
      addCoins(-it.price);
      const d = store.stats.donated[meta.id] || { total: 0, items: [] };
      d.total += it.price;
      d.items.push(it.id);
      store.stats.donated[meta.id] = d;
      store.save();
      store.notify({ event: 'donate' });
      sfx.buy();
      toast(`Спасибо! «${it.name}» активирован`, 'ok');
      applyPerk(it.perk);
      close();
    };
    list.appendChild(row);
  }

  const card = h(
    'div.modal',
    h('div.modal-head', h('div', h('h2', `💝 Донаты: ${meta.name}`), h('div.small.dim', 'Монеты идут автору карты и открывают бонусы')), h('div.spacer'), h('button.btn.icon.ghost', { onclick: close }, '✕')),
    h('div.modal-body',
      goal
        ? h('div', h('div.row.between', h('span.small', 'Цель сбора'), h('span.small', `${fmtNum(collected)} / ${fmtNum(goal)}`)), h('div.progress', { style: { marginTop: 6 } }, h('i', { style: { width: `${Math.min(100, (collected / goal) * 100)}%` } })))
        : null,
      items.length ? list : h('div.empty', h('div.big', '🎁'), h('div', 'Автор пока не добавил донаты'))
    )
  );
  backdrop.appendChild(card);
  root.appendChild(backdrop);
}

const PERK_EFFECTS = new Set();

function perkLabel(perk) {
  return (
    {
      coins2: 'Двойные монеты в этой карте',
      speed: 'Ускорение персонажа',
      jump: 'Двойной прыжок',
      vip: 'VIP-табличка в онлайне',
      cosmetic: 'Косметический бонус',
      luck: 'Удача: больше бонусов',
    }[perk] || 'Бонус от автора'
  );
}

export function applyPerk(perk) {
  PERK_EFFECTS.add(perk);
  setTimeout(() => PERK_EFFECTS.delete(perk), 5 * 60 * 1000);
}

export const hasPerk = (perk) => PERK_EFFECTS.has(perk);
