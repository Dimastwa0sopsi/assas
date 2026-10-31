/**
 * GIMVERSE — игра «Кристальная арена»: сбор кристаллов на время против ботов.
 */
import * as THREE from 'three';
import { boxMesh, makeParticles, PlayerController } from '../three/engine.js';
import { buildAvatar } from '../three/avatar.js';
import { fmtTime } from '../core/ui.js';
import { sfx } from '../core/audio.js';
import { store, trackBest } from '../core/store.js';
import { hasPerk } from '../game.js';

const ROUND = 90;
const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.42, 0);
const BOT_NAMES = ['Бот Вольт', 'Бот Комета', 'Бот Титан'];
const BOT_LOOKS = [
  { skin: '#b6f0d6', shirt: '#ef4444', pants: '#334155', shoes: '#111827', hair: 'spiky', hairColor: '#12100e', face: 'angry', hat: 'hat_cap' },
  { skin: '#f7d7b8', shirt: '#22d3ee', pants: '#1f2937', shoes: '#0f172a', hair: 'ponytail', hairColor: '#e0c060', face: 'cool', hat: 'hat_headset' },
  { skin: '#9c6640', shirt: '#fbbf24', pants: '#4b5563', shoes: '#111827', hair: 'mohawk', hairColor: '#c0392b', face: 'happy', hat: 'hat_none' },
];

export function createArena(api) {
  const { engine, world, player, particles, meta } = api;
  const scene = engine.scene;
  const SIZE = 22;

  /* ---------- арена ---------- */
  const floor = boxMesh(SIZE * 2, 1, SIZE * 2, 0x2b3550, { roughness: 0.95 });
  floor.position.y = -0.5;
  scene.add(floor);
  world.add(new THREE.Vector3(-SIZE, -1, -SIZE), new THREE.Vector3(SIZE, 0, SIZE));

  // плитка
  for (let x = -SIZE + 2; x < SIZE; x += 4) {
    for (let z = -SIZE + 2; z < SIZE; z += 4) {
      const dark = ((x + z) / 4) % 2 === 0;
      const tile = boxMesh(3.7, 0.12, 3.7, dark ? 0x384465 : 0x2f3a58, { roughness: 0.9 });
      tile.position.set(x, 0.06, z);
      scene.add(tile);
    }
  }

  // стены
  const wallMat = 0x7c5cff;
  const walls = [
    [0, SIZE, SIZE * 2, 0.8],
    [0, -SIZE, SIZE * 2, 0.8],
    [SIZE, 0, 0.8, SIZE * 2],
    [-SIZE, 0, 0.8, SIZE * 2],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = boxMesh(w, 3.4, d, wallMat, { emissive: 0x3b2a8f, emissiveIntensity: 0.35, roughness: 0.6 });
    wall.position.set(x, 1.7, z);
    scene.add(wall);
    world.add(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, 3.4, z + d / 2));
  }

  // препятствия: колонны и пандусы
  const obstacles = [
    [8, 8, 2.4, 4.5], [-8, 8, 2.4, 4.5], [8, -8, 2.4, 4.5], [-8, -8, 2.4, 4.5],
    [0, 13, 6, 2], [0, -13, 6, 2], [13, 0, 2, 6], [-13, 0, 2, 6],
  ];
  for (const [x, z, w, d] of obstacles) {
    const h = 2 + Math.random() * 2.5;
    const b = boxMesh(w, h, d, 0x4b5b7d, { roughness: 0.8 });
    b.position.set(x, h / 2, z);
    scene.add(b);
    world.add(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h, z + d / 2));
  }
  // центральный подиум
  const podium = boxMesh(6, 1.2, 6, 0xf5c451, { emissive: 0xb45309, emissiveIntensity: 0.35, metalness: 0.4 });
  podium.position.set(0, 0.6, 0);
  scene.add(podium);
  world.add(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 1.2, 3));

  /* ---------- кристаллы ---------- */
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.3 });
  const slots = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 6 + (i % 4) * 4;
    slots.push(new THREE.Vector3(Math.cos(a) * r, 0.9, Math.sin(a) * r));
  }
  const crystals = [];
  const usedSlots = new Set();
  function spawnCrystal(slotIdx) {
    const idx = slotIdx ?? freeSlot();
    if (idx == null) return null;
    usedSlots.add(idx);
    const mesh = new THREE.Mesh(CRYSTAL_GEO, crystalMat);
    mesh.position.copy(slots[idx]);
    mesh.castShadow = true;
    scene.add(mesh);
    const c = { mesh, slot: idx, born: performance.now(), spin: Math.random() * 6, taken: false, magnet: false };
    crystals.push(c);
    return c;
  }
  function freeSlot() {
    const free = slots.map((_, i) => i).filter((i) => !usedSlots.has(i));
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }
  for (let i = 0; i < 12; i++) spawnCrystal();

  /* ---------- бонусы ---------- */
  const powerups = [];
  const POWER_KINDS = [
    { id: 'magnet', em: '🧲', color: 0xf472b6, label: 'Магнит' },
    { id: 'speed', em: '⚡', color: 0xfbbf24, label: 'Ускорение' },
    { id: 'freeze', em: '❄️', color: 0x93c5fd, label: 'Заморозка ботов' },
    { id: 'x2', em: '✖️', color: 0x34d399, label: 'Двойные очки' },
  ];
  let powerTimer = 6;

  function spawnPower() {
    const kind = POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)];
    const idx = freeSlot();
    if (idx == null) return;
    usedSlots.add(idx);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: kind.color, emissive: kind.color, emissiveIntensity: 1.2, roughness: 0.3 }));
    mesh.position.copy(slots[idx]);
    mesh.position.y = 1.1;
    scene.add(mesh);
    powerups.push({ mesh, slot: idx, kind, spin: 0 });
  }

  /* ---------- боты ---------- */
  const bots = [];
  for (let i = 0; i < 3; i++) {
    const ctrl = new PlayerController(world, { height: 1.8, radius: 0.3, speed: 5.4, jump: 9 });
    const ang = (i / 3) * Math.PI * 2;
    ctrl.teleport(Math.cos(ang) * 14, 0.2, Math.sin(ang) * 14);
    const av = buildAvatar(BOT_LOOKS[i], { shadows: false });
    scene.add(av.group);
    bots.push({ ctrl, av, name: BOT_NAMES[i], score: 0, target: null, jumpCd: 0, frozen: 0, stuck: 0, lastPos: ctrl.position.clone() });
  }

  const sparkle = makeParticles(160, 0x67e8f9, 0.15);
  scene.add(sparkle);

  /* ---------- состояние ---------- */
  let score = 0;
  let combo = 0;
  let comboT = 0;
  let timeLeft = ROUND;
  let finished = false;
  let effects = { magnet: 0, speed: 0, x2: 0, freeze: 0 };
  let knockCd = 0;
  const startTime = performance.now();
  let clockBase = startTime;

  player.teleport(0, 1.6, 16);

  function gain(n, pos) {
    const mult = (effects.x2 > 0 || hasPerk('x2') ? 2 : 1) * (combo >= 3 ? 1.5 : 1);
    const add = Math.max(1, Math.round(n * mult));
    score += add;
    api.addCoins(Math.ceil(add / 2));
    particles.userData.burst(pos, 16, 4, 1);
    sparkle.userData.burst(pos, 10, 3, 1);
  }

  function update(dt) {
    timeLeft = Math.max(0, ROUND - (performance.now() - clockBase) / 1000);
    api.game.time = ROUND - timeLeft;
    if (finished) return;

    comboT = Math.max(0, comboT - dt);
    if (comboT === 0) combo = 0;
    knockCd = Math.max(0, knockCd - dt);
    for (const k of Object.keys(effects)) effects[k] = Math.max(0, effects[k] - dt);

    const pp = player.position;

    // кристаллы
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.spin += dt * 2.2;
      c.mesh.rotation.y = c.spin;
      c.mesh.rotation.x = c.spin * 0.6;
      c.mesh.position.y = 0.9 + Math.sin(c.spin) * 0.16;

      // магнит
      if (effects.magnet > 0) {
        const d = c.mesh.position.distanceTo(pp);
        if (d < 9) c.mesh.position.lerp(pp, Math.min(0.12, dt * 2.2));
      }

      if (c.mesh.position.distanceTo(pp) < 1.25) {
        combo++;
        comboT = 4;
        gain(1, c.mesh.position);
        sfx.coin();
        if (combo > 1 && combo % 3 === 0) api.toast(`🔥 Комбо x${combo}`);
        scene.remove(c.mesh);
        usedSlots.delete(c.slot);
        crystals.splice(i, 1);
        setTimeout(() => !finished && spawnCrystal(), 1400);
        continue;
      }

      // боты тоже собирают
      for (const b of bots) {
        if (b.frozen > 0) continue;
        if (c.mesh.position.distanceTo(b.ctrl.position) < 1.2) {
          b.score++;
          scene.remove(c.mesh);
          usedSlots.delete(c.slot);
          crystals.splice(i, 1);
          particles.userData.burst(c.mesh.position, 8, 2.4, 1);
          setTimeout(() => !finished && spawnCrystal(), 1800);
          break;
        }
      }
    }
    while (crystals.length < 10 && freeSlot() != null) spawnCrystal();

    // бонусы
    powerTimer -= dt;
    if (powerTimer <= 0 && powerups.length < 2) {
      spawnPower();
      powerTimer = 11 + Math.random() * 8;
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.spin += dt * 2;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 1.1 + Math.sin(p.spin * 1.4) * 0.2;
      if (p.mesh.position.distanceTo(pp) < 1.4) {
        applyPower(p.kind.id);
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        usedSlots.delete(p.slot);
        powerups.splice(i, 1);
      }
    }

    // боты
    for (const b of bots) {
      b.frozen = Math.max(0, b.frozen - dt);
      b.jumpCd = Math.max(0, b.jumpCd - dt);
      if (!b.target || b.target.taken || !crystals.includes(b.target) || Math.random() < dt * 0.4) {
        b.target = nearestCrystal(b.ctrl.position, crystals);
      }
      const t = b.target?.mesh?.position || new THREE.Vector3(0, 0, 0);
      let dx = t.x - b.ctrl.position.x;
      let dz = t.z - b.ctrl.position.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // расталкивание
      for (const other of bots) {
        if (other === b) continue;
        const ox = b.ctrl.position.x - other.ctrl.position.x;
        const oz = b.ctrl.position.z - other.ctrl.position.z;
        const od = Math.hypot(ox, oz);
        if (od < 1.4 && od > 0.001) {
          dx += (ox / od) * 0.6;
          dz += (oz / od) * 0.6;
        }
      }
      const speedScale = b.frozen > 0 ? 0.25 : 1;
      const res = b.ctrl.update(dt, { x: dx, z: dz }, { yaw: Math.atan2(dx, dz), jump: b.jumpCd <= 0 && Math.random() < dt * 1.2, worldSpace: true, speedScale });
      if (res.grounded && b.jumpCd <= 0 && Math.random() < dt * 0.5) b.jumpCd = 1.4;
      // застревание — прыжок
      if (b.ctrl.position.distanceTo(b.lastPos) < 0.02 && res.grounded) {
        b.stuck += dt;
        if (b.stuck > 0.6) {
          b.ctrl.velocity.y = 9;
          b.stuck = 0;
        }
      } else b.stuck = 0;
      b.lastPos.copy(b.ctrl.position);
      b.av.group.position.copy(b.ctrl.position);
      b.av.group.rotation.y = Math.atan2(dx, dz);
      b.av.update(dt, { speed: res.speed, grounded: res.grounded });
    }

    // толчки от ботов
    for (const b of bots) {
      const d = b.ctrl.position.distanceTo(pp);
      if (d < 1.15 && knockCd <= 0) {
        const push = new THREE.Vector3().subVectors(pp, b.ctrl.position).setY(0).normalize().multiplyScalar(9);
        player.velocity.add(push);
        player.velocity.y = 5.5;
        knockCd = 1.2;
        combo = 0;
        score = Math.max(0, score - 1);
        sfx.hurt();
        api.shake(0.7);
        api.toast(`💥 ${b.name} сбил вас! −1`);
      }
    }

    if (timeLeft <= 0) finish();
  }

  function nearestCrystal(pos, list) {
    let best = null;
    let bd = Infinity;
    for (const c of list) {
      const d = c.mesh.position.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  function applyPower(id) {
    if (id === 'magnet') effects.magnet = 8;
    else if (id === 'speed') effects.speed = 9;
    else if (id === 'x2') effects.x2 = 10;
    else if (id === 'freeze') {
      effects.freeze = 6;
      bots.forEach((b) => (b.frozen = 6));
    }
    sfx.power();
    const kind = POWER_KINDS.find((k) => k.id === id);
    api.toast(`${kind?.em || '✨'} ${kind?.label || 'Бонус'}!`);
    api.shake(0.3);
  }

  function finish() {
    finished = true;
    const best = bots.reduce((a, b) => (b.score > a.score ? b : a), bots[0]);
    const won = score > best.score;
    const reward = score * 3 + (won ? 40 : 10);
    const record = trackBest(meta.id, 'score', score);
    api.finishGame({
      emoji: won ? '🏆' : '🤝',
      title: won ? 'Победа!' : 'Раунд окончен',
      text: won ? `Вы обошли лучшего бота (${best.name}: ${best.score})` : `Лучший бот: ${best.name} — ${best.score}`,
      rows: [
        { em: '💎', label: 'Ваши кристаллы', value: String(score) },
        ...bots.map((b) => ({ em: '🤖', label: b.name, value: String(b.score) })),
        { em: '🏅', label: 'Рекорд', value: record ? 'новый!' : String(store_best_score(meta.id)) },
      ],
      reward,
    });
  }

  function restart() {
    finished = false;
    score = 0;
    combo = 0;
    timeLeft = ROUND;
    clockBase = performance.now();
    effects = { magnet: 0, speed: 0, x2: 0, freeze: 0 };
    crystals.forEach((c) => scene.remove(c.mesh));
    crystals.length = 0;
    usedSlots.clear();
    for (let i = 0; i < 12; i++) spawnCrystal();
    bots.forEach((b, i) => {
      b.score = 0;
      const ang = (i / 3) * Math.PI * 2;
      b.ctrl.teleport(Math.cos(ang) * 14, 0.2, Math.sin(ang) * 14);
    });
    player.teleport(0, 1.6, 16);
    api.resume();
    sfx.ui();
  }

  const leader = () => bots.reduce((a, b) => (b.score > a.score ? b : a), { name: '—', score: -1 });

  return {
    spawn: { x: 0, y: 1.6, z: 16 },
    startYaw: Math.PI,
    time: 0,
    update,
    restart,
    control: () => ({ speedScale: effects.speed > 0 || hasPerk('speed') ? 1.6 : 1 }),
    stats: () => [
      { em: '⏱️', value: fmtTime(timeLeft) },
      { em: '💎', value: score },
      { em: '🔥', value: combo > 1 ? `x${combo}` : '—' },
      { em: '🤖', value: `${leader().name.replace('Бот ', '')}: ${leader().score}` },
    ],
    summary: () => `Кристаллов: ${score} · Лучший бот: ${leader().name} (${leader().score})`,
    dispose() {
      scene.remove(floor, podium, sparkle);
      crystals.forEach((c) => scene.remove(c.mesh));
      powerups.forEach((p) => {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
      });
      bots.forEach((b) => {
        scene.remove(b.av.group);
        b.av.dispose();
      });
      crystalMat.dispose();
    },
  };
}

function store_best_score(mapId) {
  try {
    return store.stats.best?.[mapId]?.score ?? 0;
  } catch {
    return 0;
  }
}
