/**
 * GIMVERSE — игра «Небесный паркур».
 * Работает и на процедурной башне, и на карте, импортированной из GimPrograms 3D Editor.
 */
import * as THREE from 'three';
import { boxMesh, makeParticles } from '../three/engine.js';
import { buildMap, pickSpawn, pickFinish, sampleTower } from '../three/mapLoader.js';
import { fmtTime, toast } from '../core/ui.js';
import { sfx } from '../core/audio.js';
import { store, trackBest } from '../core/store.js';
import { hasPerk } from '../game.js';

const COIN_GEO = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 16);
const RING_GEO = new THREE.TorusGeometry(1.05, 0.09, 10, 32);

export function createObby(api, mapData) {
  const { engine, world, player, particles, meta } = api;
  const scene = engine.scene;
  const useMap = !!(mapData?.items?.length);
  const data = useMap ? mapData : sampleTower();
  const built = buildMap(data, { world, shadows: engine.renderer.shadowMap.enabled, maxBlocks: 8000 });
  scene.add(built.group);

  const platforms = collectPlatforms(data);
  const spawn = useMap ? built.spawn : pickSpawn(data.items);
  const finishPoint = useMap ? built.finish : pickFinish(data.items);

  const killY = (useMap ? built.stats.min[1] : -2) - 14;

  /* ---------- чекпоинты ---------- */
  const checkpoints = [];
  const cpMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 1.2, roughness: 0.4 });
  const cpMatOn = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 1.6, roughness: 0.4 });
  const cpPoints = pickCheckpoints(platforms, spawn, finishPoint, useMap ? 4 : 5);
  cpPoints.forEach((p, i) => {
    const ring = new THREE.Mesh(RING_GEO, cpMat);
    ring.position.set(p.x, p.y + 1.1, p.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const pad = boxMesh(2.2, 0.14, 2.2, 0x22d3ee, { emissive: 0x0e7490, emissiveIntensity: 0.7, roughness: 0.5 });
    pad.position.set(p.x, p.y + 0.06, p.z);
    scene.add(pad);
    checkpoints.push({ ring, pad, x: p.x, y: p.y, z: p.z, active: i === 0, index: i });
  });

  /* ---------- движущиеся платформы ---------- */
  const movers = [];
  const moveCount = useMap ? 0 : 7;
  for (let i = 0; i < moveCount; i++) {
    const base = platforms[Math.min(platforms.length - 1, 4 + i * 3)];
    if (!base) break;
    const axis = i % 2 ? 'x' : 'z';
    const mesh = boxMesh(2.6, 0.4, 2.6, 0xf472b6, { emissive: 0x9d174d, emissiveIntensity: 0.35, roughness: 0.55 });
    const p = { x: base.x, y: base.y + 1.2, z: base.z };
    mesh.position.set(p.x, p.y, p.z);
    scene.add(mesh);
    const box = world.add(new THREE.Vector3(p.x - 1.3, p.y - 0.2, p.z - 1.3), new THREE.Vector3(p.x + 1.3, p.y + 0.2, p.z + 1.3));
    movers.push({ mesh, box, axis, amp: 3 + (i % 3), speed: 0.7 + i * 0.12, phase: i * 1.3, prev: new THREE.Vector3(p.x, p.y, p.z), base: p });
  }

  /* ---------- монеты ---------- */
  const coins = [];
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xb45309, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 });
  const coinSpots = pickCoinSpots(platforms, useMap ? 26 : 30);
  for (const s of coinSpots) {
    const m = new THREE.Mesh(COIN_GEO, coinMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(s.x, s.y + 0.85, s.z);
    m.castShadow = true;
    scene.add(m);
    coins.push({ mesh: m, taken: false, base: s.y + 0.85, spin: Math.random() * 6 });
  }

  /* ---------- финиш ---------- */
  const podium = boxMesh(3.4, 0.5, 3.4, 0xf5c451, { emissive: 0xb45309, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.35 });
  podium.position.set(finishPoint.x, finishPoint.y - 0.25, finishPoint.z);
  scene.add(podium);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beacon.position.set(finishPoint.x, finishPoint.y + 6.6, finishPoint.z);
  scene.add(beacon);

  /* ---------- облака ---------- */
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2.4, 10, 8), cloudMat);
    c.position.set((Math.random() - 0.5) * 130, -6 - Math.random() * 12, (Math.random() - 0.5) * 130);
    c.scale.y = 0.45;
    clouds.add(c);
  }
  scene.add(clouds);

  const sparkle = makeParticles(120, 0x67e8f9, 0.14);
  scene.add(sparkle);

  /* ---------- состояние ---------- */
  let time = 0;
  let lives = 3;
  let coinsTaken = 0;
  let currentCp = 0;
  let finished = false;
  let lastRespawn = { x: spawn.x, y: spawn.y, z: spawn.z };
  let clockBase = performance.now();

  player.teleport(spawn.x, spawn.y, spawn.z);

  function respawn(silent = false) {
    player.teleport(lastRespawn.x, lastRespawn.y + 0.3, lastRespawn.z);
    api.shake(0.6);
    if (!silent) {
      sfx.die();
      lives--;
      api.toast(lives > 0 ? `💀 Падение! Осталось жизней: ${lives}` : '💀 Жизни кончились — начинаем заново', 2200);
      if (lives <= 0) {
        lives = 3;
        const first = checkpoints[0];
        lastRespawn = { x: first.x, y: first.y + 0.3, z: first.z };
        currentCp = 0;
        checkpoints.forEach((c, i) => setCheckpoint(c, i === 0));
      }
    }
  }

  function setCheckpoint(cp, on) {
    cp.active = on;
    cp.ring.material = on ? cpMatOn : cpMat;
    cp.pad.material = on ? cpMatOn : cpMat;
  }

  const coinValue = () => (hasPerk('coins2') ? 2 : 1);

  function update(dt, { res }) {
    time = (performance.now() - clockBase) / 1000;
    api.game.time = time;
    if (finished) return;

    // движущиеся платформы
    for (const m of movers) {
      const t = time * m.speed + m.phase;
      const off = Math.sin(t) * m.amp;
      const nx = m.axis === 'x' ? m.base.x + off : m.base.x;
      const nz = m.axis === 'z' ? m.base.z + off : m.base.z;
      m.mesh.position.set(nx, m.base.y, nz);
      m.box.min.set(nx - 1.3, m.base.y - 0.2, nz - 1.3);
      m.box.max.set(nx + 1.3, m.base.y + 0.2, nz + 1.3);
      // перевозим игрока
      const p = player.position;
      if (
        res.grounded &&
        Math.abs(p.y - (m.base.y + 0.2)) < 0.35 &&
        Math.abs(p.x - nx) < 1.5 &&
        Math.abs(p.z - nz) < 1.5
      ) {
        p.x += nx - m.prev.x;
        p.z += nz - m.prev.z;
      }
      m.prev.set(nx, m.base.y, nz);
    }

    // монеты
    const pp = player.position;
    for (const c of coins) {
      if (c.taken) continue;
      c.spin += dt * 3;
      c.mesh.rotation.z = c.spin;
      c.mesh.position.y = c.base + Math.sin(c.spin * 0.8) * 0.12;
      if (c.mesh.position.distanceTo(pp) < 1.15) {
        c.taken = true;
        c.mesh.visible = false;
        coinsTaken++;
        api.addCoins(coinValue());
        sfx.coin();
        particles.userData.burst(c.mesh.position, 12, 3.4, 1);
        api.toast(`🪙 +${coinValue()}`);
      }
    }

    // чекпоинты
    for (const cp of checkpoints) {
      cp.ring.rotation.z += dt * 0.8;
      if (cp.active) continue;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 1.8 && Math.abs(pp.y - cp.y) < 2.6) {
        setCheckpoint(cp, true);
        currentCp = Math.max(currentCp, cp.index);
        lastRespawn = { x: cp.x, y: cp.y + 0.3, z: cp.z };
        sfx.checkpoint();
        sparkle.userData.burst(new THREE.Vector3(cp.x, cp.y + 1, cp.z), 22, 4, 1.2);
        api.toast(`✅ Чекпоинт ${cp.index}/${checkpoints.length - 1}`);
        api.addCoins(3);
      }
    }

    // финиш
    if (Math.hypot(pp.x - finishPoint.x, pp.z - finishPoint.z) < 2 && pp.y > finishPoint.y - 2.5 && pp.y < finishPoint.y + 3) {
      finish();
      return;
    }

    // падение
    if (pp.y < killY) respawn();

    // облака и луч
    clouds.rotation.y += dt * 0.01;
    beacon.material.opacity = 0.16 + Math.sin(time * 2) * 0.07;
    built.update?.(dt);
  }

  function finish() {
    if (finished) return;
    finished = true;
    const bonus = Math.max(0, Math.round(90 - time)) + coinsTaken * 4 + lives * 10;
    const reward = bonus + 20;
    const isRecord = trackBest(meta.id, 'time', time);
    particles.userData.burst(new THREE.Vector3(finishPoint.x, finishPoint.y + 1, finishPoint.z), 60, 8, 1.6);
    api.finishGame({
      emoji: '🏆',
      title: 'Финиш!',
      text: `Время ${fmtTime(time)} · монет ${coinsTaken}`,
      rows: [
        { em: '⏱️', label: 'Время', value: fmtTime(time) },
        { em: '🪙', label: 'Монет собрано', value: String(coinsTaken) },
        { em: '❤️', label: 'Осталось жизней', value: String(lives) },
        { em: '🏅', label: 'Рекورد', value: isRecord ? 'новый!' : fmtTime(bestTime()) },
      ],
      reward,
    });
  }

  function bestTime() {
    return store.stats.best?.[meta.id]?.time ?? Infinity;
  }

  function restart() {
    finished = false;
    coinsTaken = 0;
    lives = 3;
    currentCp = 0;
    coins.forEach((c) => {
      c.taken = false;
      c.mesh.visible = true;
    });
    checkpoints.forEach((c, i) => setCheckpoint(c, i === 0));
    lastRespawn = { x: spawn.x, y: spawn.y, z: spawn.z };
    player.teleport(spawn.x, spawn.y, spawn.z);
    clockBase = performance.now();
    time = 0;
    api.resume();
    sfx.ui();
  }

  return {
    spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
    startYaw: Math.PI,
    time: 0,
    update,
    restart,
    stats: () => [
      { em: '⏱️', value: fmtTime(time) },
      { em: '🪙', value: `${coinsTaken}/${coins.length}` },
      { em: '❤️', value: lives },
      { em: '🚩', value: `${currentCp}/${checkpoints.length - 1}` },
    ],
    summary: () => `Монет: ${coinsTaken} · Чекпоинт: ${currentCp}/${checkpoints.length - 1}`,
    dispose() {
      built.dispose();
      scene.remove(built.group, clouds, beacon, podium, sparkle);
      coins.forEach((c) => scene.remove(c.mesh));
      checkpoints.forEach((c) => {
        scene.remove(c.ring, c.pad);
      });
      movers.forEach((m) => scene.remove(m.mesh));
      coinMat.dispose();
      cpMat.dispose();
      cpMatOn.dispose();
      cloudMat.dispose();
    },
  };
}

/* ============================================================
   Генерация точек
   ============================================================ */
function collectPlatforms(data) {
  return (data.items || [])
    .map((it) => ({
      x: it.pos[0],
      y: it.pos[1] + Math.abs(it.scale[1]) / 2,
      z: it.pos[2],
      w: Math.abs(it.scale[0]),
      d: Math.abs(it.scale[2]),
      area: Math.abs(it.scale[0]) * Math.abs(it.scale[2]),
    }))
    .filter((p) => p.area > 1.2)
    .sort((a, b) => a.y - b.y);
}

function pickCheckpoints(platforms, spawn, finish, count) {
  const list = [{ x: spawn.x, y: spawn.y, z: spawn.z }];
  if (!platforms.length) return list;
  const top = platforms[platforms.length - 1];
  const step = Math.max(1, Math.floor(platforms.length / count));
  for (let i = 1; i < count; i++) {
    const p = platforms[Math.min(platforms.length - 1, i * step)];
    list.push({ x: p.x, y: p.y + 0.15, z: p.z });
  }
  list.push({ x: finish.x, y: finish.y - 1, z: finish.z });
  return list;
}

function pickCoinSpots(platforms, count) {
  const spots = [];
  if (!platforms.length) return spots;
  const step = Math.max(1, Math.floor(platforms.length / count));
  for (let i = 0; i < count; i++) {
    const p = platforms[Math.min(platforms.length - 1, i * step)];
    if (!p) break;
    spots.push({ x: p.x + (Math.random() - 0.5) * Math.min(1.5, p.w * 0.3), y: p.y, z: p.z + (Math.random() - 0.5) * Math.min(1.5, p.d * 0.3) });
  }
  return spots;
}
