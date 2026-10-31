/**
 * Тесты чистой логики: разбор карт GimPrograms, валидация, генерация, физика персонажа.
 * Запуск: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// минимальная замена localStorage: store.js пишет в неё при каждом изменении
if (!globalThis.localStorage) {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
}

import { parseMapJson, validateMap, mapStats, buildMap, sampleTower, sampleIsland, pickSpawn, pickFinish } from '../src/three/mapLoader.js';
import { PhysicsWorld, PlayerController } from '../src/three/engine.js';
import { store, load, addCoins, upsertMap, trackBest, logAdmin, isAdmin } from '../src/core/store.js';

/* ---------------- разбор JSON ---------------- */

test('parseMapJson: формат version 2 из редактора', () => {
  const json = JSON.stringify({
    version: 2,
    items: [{ kind: 'block', pos: [1, 0.5, 2], rot: [0, 0.3, 0], scale: [2, 1, 3], color: '#ff0000', physics: true, faces: [null, null, null, null, null, null], faceFlip: [false, false, false, false, false, false] }],
  });
  const { data, error } = parseMapJson(json);
  assert.equal(error, null);
  assert.equal(data.version, 2);
  assert.equal(data.items.length, 1);
  assert.deepEqual(data.items[0].pos, [1, 0.5, 2]);
  assert.equal(data.items[0].physics, true);
});

test('parseMapJson: принимает голый массив (v1) и обёртку { map }', () => {
  const v1 = parseMapJson(JSON.stringify([{ kind: 'block', pos: [0, 0.5, 0], scale: [1, 1, 1] }]));
  assert.equal(v1.data.items.length, 1);
  assert.ok(v1.warnings.join(' ').includes('версии 1'));

  const wrapped = parseMapJson(JSON.stringify({ map: { version: 2, items: [{ kind: 'block', pos: [0, 1, 0], scale: [1, 1, 1] }] } }));
  assert.equal(wrapped.data.items.length, 1);
});

test('parseMapJson: понятные ошибки на мусоре', () => {
  assert.match(parseMapJson('не json').error, /не JSON/);
  assert.match(parseMapJson('{"foo":1}').error, /нет списка items/);
  assert.match(parseMapJson('{"items":[{"kind":"light"}]}').error, /нет ни одного блока/);
});

test('parseMapJson: чинит битые числа и цвета, отбрасывает чужие kind', () => {
  const { data, warnings } = parseMapJson(
    JSON.stringify({
      version: 2,
      items: [
        { kind: 'block', pos: ['x', null, 3], scale: [1, -4, 2], color: 'red' },
        { kind: 'spawn', pos: [0, 0, 0] },
      ],
    })
  );
  assert.equal(data.items.length, 1);
  assert.deepEqual(data.items[0].pos, [0, 0, 3]);
  assert.equal(data.items[0].scale[1], 0.05); // отрицательный размер поднят до минимума
  assert.equal(data.items[0].color, '#88aaff'); // невалидный цвет заменён
  assert.equal(warnings.length, 1);
});

/* ---------------- статистика и валидация ---------------- */

test('mapStats считает блоки, динамику, текстуры и границы', () => {
  const data = {
    version: 2,
    items: [
      { kind: 'block', pos: [0, 0, 0], rot: [0, 0, 0], scale: [2, 2, 2], color: '#fff', physics: false, faces: [null, null, null, null, null, null] },
      { kind: 'block', pos: [10, 4, -6], rot: [0, 0, 0], scale: [1, 1, 1], color: '#000', physics: true, faces: ['data:image/png;base64,AA', null, null, null, null, null] },
    ],
  };
  const s = mapStats(data, '{"a":1}');
  assert.equal(s.blocks, 2);
  assert.equal(s.dynamic, 1);
  assert.equal(s.textured, 1);
  assert.equal(s.colors, 2);
  assert.ok(s.max[0] > 10 && s.min[0] < 0);
  assert.ok(s.jsonBytes > 0);
});

test('validateMap ловит превышение лимита блоков', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ kind: 'block', pos: [i, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#fff', physics: false, faces: [] }));
  const strict = validateMap({ version: 2, items }, { maxBlocks: 10, maxJsonKb: 4096 });
  assert.equal(strict.ok, false);
  assert.match(strict.errors[0], /Слишком много блоков/);
  const loose = validateMap({ version: 2, items }, { maxBlocks: 500, maxJsonKb: 4096 });
  assert.equal(loose.ok, true);
});

/* ---------------- демонстрационные карты ---------------- */

test('примеры карт валидны и дают точку старта и финиша', () => {
  for (const data of [sampleTower(), sampleIsland()]) {
    const check = validateMap(data, { maxBlocks: 6000, maxJsonKb: 4096 });
    assert.equal(check.ok, true, check.errors.join('; '));
    assert.ok(check.stats.blocks > 20);
    const spawn = pickSpawn(data.items);
    const finish = pickFinish(data.items);
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.y));
    assert.ok(finish.y > spawn.y, 'финиш должен быть выше старта');
  }
});

test('buildMap собирает сцену, коллайдеры и симуляцию динамических блоков', () => {
  const data = sampleIsland();
  const world = new PhysicsWorld(8);
  const built = buildMap(data, { world, shadows: false });
  assert.ok(built.group.children.length > 0);
  assert.ok(world.boxes.length >= 20, `коллайдеров: ${world.boxes.length}`);
  assert.ok(built.stats.dynamic > 0);
  // динамический блок падает и ложится на землю
  const dynamic = data.items.filter((i) => i.physics)[0];
  const before = dynamic.pos[1];
  for (let i = 0; i < 240; i++) built.update(1 / 60);
  const mesh = built.group.children.find((c) => c.isMesh && c.material?.emissive);
  assert.ok(mesh, 'динамический блок добавлен отдельным мешем');
  assert.ok(mesh.position.y < before, `блок упал: ${before} → ${mesh.position.y}`);
  built.dispose();
});

/* ---------------- физика персонажа ---------------- */

function step(player, n, move = { x: 0, z: 0 }, opts = {}) {
  let res;
  for (let i = 0; i < n; i++) res = player.update(1 / 60, move, opts);
  return res;
}

test('персонаж падает и приземляется на платформу', () => {
  const world = new PhysicsWorld(4);
  world.add({ x: -10, y: -1, z: -10 }, { x: 10, y: 0, z: 10 });
  const p = new PlayerController(world);
  p.teleport(0, 6, 0);
  const res = step(p, 120);
  assert.equal(res.grounded, true);
  assert.ok(Math.abs(p.position.y) < 0.05, `y = ${p.position.y}`);
});

test('стена останавливает движение', () => {
  const world = new PhysicsWorld(4);
  world.add({ x: -20, y: -1, z: -20 }, { x: 20, y: 0, z: 20 });
  world.add({ x: 4, y: 0, z: -4 }, { x: 5, y: 3, z: 4 });
  const p = new PlayerController(world);
  p.teleport(0, 0.05, 0);
  step(p, 90, { x: 1, z: 0 }, { worldSpace: true });
  assert.ok(p.position.x < 4.7, `x = ${p.position.x}`);
});

test('прыжок поднимает персонажа, coyote-time работает', () => {
  const world = new PhysicsWorld(4);
  world.add({ x: -10, y: -1, z: -10 }, { x: 10, y: 0, z: 10 });
  const p = new PlayerController(world);
  p.teleport(0, 0.02, 0);
  step(p, 10);
  const r1 = p.update(1 / 60, { x: 0, z: 0 }, { jump: true });
  assert.ok(p.velocity.y > 5, `vy = ${p.velocity.y}`);
  step(p, 20);
  assert.ok(p.position.y > 0.6, `высота после прыжка: ${p.position.y}`);
  assert.equal(r1.grounded, false);
});

test('авто-подъём на невысокую ступеньку', () => {
  const world = new PhysicsWorld(4);
  world.add({ x: -20, y: -1, z: -20 }, { x: 20, y: 0, z: 20 });
  world.add({ x: 2, y: 0, z: -5 }, { x: 20, y: 0.35, z: 5 }); // длинная ступень высотой 0.35
  const p = new PlayerController(world);
  p.teleport(0, 0.05, 0);
  const res = step(p, 120, { x: 1, z: 0 }, { worldSpace: true });
  assert.ok(p.position.x > 8, `персонаж не забрался на ступень: x = ${p.position.x}`);
  assert.ok(Math.abs(p.position.y - 0.35) < 0.05, `y = ${p.position.y}`);
  assert.equal(res.grounded, true);
});

/* ---------------- хранилище ---------------- */

test('store: монеты, карта, рекорд, журнал и права', () => {
  load();
  const before = store.profile.coins;
  assert.equal(addCoins(50), before + 50);
  assert.equal(addCoins(-1000), 0); // не уходит в минус
  addCoins(300);

  upsertMap({ id: 'test-map', name: 'Тест', desc: '', icon: { emoji: '🧱', color: '#fff' }, map: { version: 2, items: [] }, blocks: 0, status: 'published' });
  assert.ok(store.library.maps.some((m) => m.id === 'test-map'));

  assert.equal(trackBest('test-map', 'time', 50), true);
  assert.equal(trackBest('test-map', 'time', 60), false);
  assert.equal(trackBest('test-map', 'time', 40), true);
  assert.equal(store.stats.best['test-map'].time, 40);

  logAdmin('test', 'цель', 'детали');
  assert.equal(store.admin.logs[0].action, 'test');
  assert.equal(isAdmin(), true, 'владелец по умолчанию — админ');
});
