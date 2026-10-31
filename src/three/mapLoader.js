/**
 * GIMVERSE — импорт карт GimPrograms 3D Editor (https://dimastwa0sopsi.github.io/Gim-Builder/).
 * Формат совместим с редактором: { version: 2, items: [{ kind:'block', pos, rot, scale, color, physics, faces, faceFlip }] }
 * Допустимы также «голый» массив items (v1) и обёртка { map: { items } }.
 */
import * as THREE from 'three';
import { PhysicsWorld } from './engine.js';

export const MAP_SCHEMA_DOC = {
  version: 2,
  items: [
    {
      kind: 'block',
      pos: [0, 0.5, 0],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#88aaff',
      physics: false,
      faces: [null, null, null, null, null, null],
      faceFlip: [false, false, false, false, false, false],
    },
  ],
};

const texCache = new Map();

function textureFrom(dataUrl, flip = false) {
  const key = `${flip ? 'f' : 'n'}:${dataUrl.slice(0, 64)}:${dataUrl.length}`;
  if (texCache.has(key)) return texCache.get(key);
  const tex = new THREE.TextureLoader().load(dataUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = !flip;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/* ============================================================
   Разбор и проверка
   ============================================================ */

/**
 * Терпимый парсер JSON карты.
 * @returns {{ data: {version:number, items:Array}|null, error: string|null, warnings: string[] }}
 */
export function parseMapJson(text) {
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^\uFEFF/, '').trim());
  } catch (err) {
    return { data: null, error: `Это не JSON: ${err.message}`, warnings };
  }
  if (Array.isArray(raw)) {
    warnings.push('Формат версии 1 (массив блоков) — преобразован в version 2');
    raw = { version: 1, items: raw };
  }
  if (raw && raw.map && Array.isArray(raw.map.items)) {
    warnings.push('Найдена обёртка { map: … } — использована внутренняя карта');
    raw = raw.map;
  }
  if (!raw || !Array.isArray(raw.items)) return { data: null, error: 'В JSON нет списка items', warnings };

  const items = [];
  let skipped = 0;
  for (const it of raw.items) {
    if (!it || typeof it !== 'object') {
      skipped++;
      continue;
    }
    const kind = it.kind || 'block';
    if (kind !== 'block') {
      skipped++;
      continue;
    }
    items.push({
      kind: 'block',
      pos: num3(it.pos, [0, 0.5, 0]),
      rot: num3(it.rot, [0, 0, 0]),
      scale: num3(it.scale, [1, 1, 1], 0.05),
      color: typeof it.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(it.color) ? it.color : '#88aaff',
      physics: !!it.physics,
      faces: Array.isArray(it.faces) ? it.faces.slice(0, 6).map((f) => (typeof f === 'string' ? f : null)) : [null, null, null, null, null, null],
      faceFlip: Array.isArray(it.faceFlip) ? it.faceFlip.slice(0, 6).map(Boolean) : [false, false, false, false, false, false],
    });
  }
  if (!items.length) return { data: null, error: 'В карте нет ни одного блока (kind: "block")', warnings };
  if (skipped) warnings.push(`Пропущено объектов без kind:"block": ${skipped}`);
  return { data: { version: Number(raw.version) || 2, items }, error: null, warnings };
}

function num3(v, def, min = null) {
  if (!Array.isArray(v) || v.length < 3) return [...def];
  const out = v.slice(0, 3).map((n) => (Number.isFinite(+n) ? +n : 0));
  if (min != null) return out.map((n) => Math.max(min, n));
  return out;
}

export function mapStats(data, jsonText = '') {
  const items = data?.items || [];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let dynamic = 0;
  let textured = 0;
  let volume = 0;
  const colors = new Set();
  for (const it of items) {
    const [x, y, z] = it.pos;
    const [sx, sy, sz] = it.scale;
    const r = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) * 0.72;
    min.set(Math.min(min.x, x - r), Math.min(min.y, y - r), Math.min(min.z, z - r));
    max.set(Math.max(max.x, x + r), Math.max(max.y, y + r), Math.max(max.z, z + r));
    if (it.physics) dynamic++;
    if (it.faces?.some(Boolean)) textured++;
    volume += Math.abs(sx * sy * sz);
    colors.add(it.color);
  }
  const size = new THREE.Vector3().subVectors(max, min);
  return {
    blocks: items.length,
    dynamic,
    textured,
    colors: colors.size,
    volume: Math.round(volume),
    min: min.toArray(),
    max: max.toArray(),
    size: size.toArray(),
    jsonBytes: jsonText ? new Blob([jsonText]).size : JSON.stringify(data || {}).length,
  };
}

export function validateMap(data, limits = { maxBlocks: 6000, maxJsonKb: 4096 }) {
  const errors = [];
  const warnings = [];
  const stats = mapStats(data);
  if (!data?.items?.length) errors.push('Карта пустая');
  if (stats.blocks > limits.maxBlocks) errors.push(`Слишком много блоков: ${stats.blocks} (лимит ${limits.maxBlocks})`);
  if (stats.jsonBytes > limits.maxJsonKb * 1024) warnings.push(`JSON большой (${(stats.jsonBytes / 1024).toFixed(0)} КБ) — публикация в сеть может не пройти`);
  if (stats.dynamic > 200) warnings.push(`Очень много динамических блоков (${stats.dynamic}) — они будут падать при старте`);
  if (stats.textured && stats.jsonBytes > 3 * 1024 * 1024) warnings.push('Много текстур — карта тяжёлая, часть фото может не влезть в хранилище');
  if (!isFinite(stats.size[0])) errors.push('Не удалось вычислить размеры карты');
  return { ok: errors.length === 0, errors, warnings, stats };
}

/* ============================================================
   Построение сцены
   ============================================================ */

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/**
 * Строит карту: инстанс-меши по цветам + отдельные меши для блоков с текстурами.
 * Возвращает группу, коллайдеры и симуляцию динамических блоков.
 */
export function buildMap(data, { engine, world = null, shadows = true, maxBlocks = 8000 } = {}) {
  const phys = world || new PhysicsWorld();
  const group = new THREE.Group();
  group.name = 'map';
  const disposables = [];
  const dynamics = [];
  const items = (data?.items || []).slice(0, maxBlocks);

  const buckets = new Map(); // color -> {matrices:[], mesh?}
  const textured = [];

  for (const it of items) {
    const hasTex = it.faces.some(Boolean);
    if (hasTex) textured.push(it);
    else {
      let b = buckets.get(it.color);
      if (!b) buckets.set(it.color, (b = []));
      b.push(it);
    }
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const sv = new THREE.Vector3();

  const registerCollider = (it) => {
    const [px, py, pz] = it.pos;
    const [rx, ry, rz] = it.rot;
    const [sx, sy, sz] = it.scale;
    euler.set(rx, ry, rz);
    q.setFromEuler(euler);
    // AABB повёрнутого бокса
    const ex = Math.abs(sx / 2);
    const ey = Math.abs(sy / 2);
    const ez = Math.abs(sz / 2);
    const a = Math.abs(Math.cos(ry));
    const b = Math.abs(Math.sin(ry));
    const hx = ex * a + ez * b;
    const hz = ex * b + ez * a;
    const tilt = Math.abs(Math.sin(rx)) + Math.abs(Math.sin(rz));
    const hy = ey + (ex + ez) * tilt * 0.5;
    phys.add(v3.set(px - hx, py - hy, pz - hz), v3.clone().set(px + hx, py + hy, pz + hz), it);
    return { hx, hy, hz };
  };

  // инстанс-меши по цветам
  for (const [color, list] of buckets) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 });
    disposables.push(mat);
    const inst = new THREE.InstancedMesh(boxGeo, mat, list.length);
    inst.castShadow = shadows;
    inst.receiveShadow = true;
    list.forEach((it, i) => {
      euler.set(it.rot[0], it.rot[1], it.rot[2]);
      q.setFromEuler(euler);
      sv.set(it.scale[0], it.scale[1], it.scale[2]);
      v3.set(it.pos[0], it.pos[1], it.pos[2]);
      m4.compose(v3, q, sv);
      inst.setMatrixAt(i, m4);
      if (!it.physics) registerCollider(it);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // блоки с текстурами
  for (const it of textured) {
    const mats = it.faces.map((url, i) => {
      if (!url) return new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.72, metalness: 0.02 });
      return new THREE.MeshStandardMaterial({ map: textureFrom(url, it.faceFlip[i]), roughness: 0.75, metalness: 0.02 });
    });
    disposables.push(...mats);
    const mesh = new THREE.Mesh(boxGeo, mats);
    mesh.position.fromArray(it.pos);
    mesh.rotation.set(...it.rot);
    mesh.scale.fromArray(it.scale);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!it.physics) registerCollider(it);
  }

  // динамические блоки: лёгкая симуляция (гравитация + опора на статику)
  for (const it of items.filter((i) => i.physics).slice(0, 240)) {
    const mat = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.6, metalness: 0.05, emissive: 0x111111 });
    disposables.push(mat);
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.fromArray(it.pos);
    mesh.rotation.set(...it.rot);
    mesh.scale.fromArray(it.scale);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    dynamics.push({
      mesh,
      vel: new THREE.Vector3(),
      hx: Math.abs(it.scale[0]) / 2,
      hy: Math.abs(it.scale[1]) / 2,
      hz: Math.abs(it.scale[2]) / 2,
      sleeping: false,
    });
  }

  const tmpMin = new THREE.Vector3();
  const tmpMax = new THREE.Vector3();
  const found = [];

  const update = (dt, playerBox = null) => {
    if (!dynamics.length) return;
    for (const d of dynamics) {
      if (d.sleeping) continue;
      const p = d.mesh.position;
      d.vel.y -= 22 * dt;
      p.y += d.vel.y * dt;
      tmpMin.set(p.x - d.hx, p.y - d.hy, p.z - d.hz);
      tmpMax.set(p.x + d.hx, p.y + d.hy, p.z + d.hz);
      const list = phys.query(tmpMin, tmpMax, found);
      let rest = false;
      for (const b of list) {
        if (tmpMin.x < b.max.x && tmpMax.x > b.min.x && tmpMin.y < b.max.y && tmpMax.y > b.min.y && tmpMin.z < b.max.z && tmpMax.z > b.min.z) {
          if (d.vel.y <= 0 && p.y - d.hy < b.max.y && p.y > b.max.y - 0.6) {
            p.y = b.max.y + d.hy;
            rest = true;
          } else if (d.vel.y > 0) {
            p.y = b.min.y - d.hy;
          }
          d.vel.y = 0;
        }
      }
      if (p.y - d.hy <= 0) {
        p.y = d.hy;
        d.vel.y = 0;
        rest = true;
      }
      // игрок может стоять сверху
      if (playerBox && rest) {
        if (
          playerBox.min.x < p.x + d.hx &&
          playerBox.max.x > p.x - d.hx &&
          playerBox.min.z < p.z + d.hz &&
          playerBox.max.z > p.z - d.hz &&
          playerBox.min.y < p.y + d.hy &&
          playerBox.max.y > p.y - d.hy
        ) {
          if (playerBox.min.y > p.y) playerBox.min.y = p.y + d.hy;
        }
      }
      if (rest && Math.abs(d.vel.y) < 0.01) {
        d.restFrames = (d.restFrames || 0) + 1;
        if (d.restFrames > 30) d.sleeping = true;
      } else d.restFrames = 0;
    }
  };

  const dispose = () => {
    disposables.forEach((m) => m.dispose());
    group.clear();
  };

  return { group, update, dispose, world: phys, stats: mapStats(data), spawn: pickSpawn(items), finish: pickFinish(items) };
}

function blockTop(it) {
  return it.pos[1] + Math.abs(it.scale[1]) / 2;
}

function area(it) {
  return Math.abs(it.scale[0]) * Math.abs(it.scale[2]);
}

/** Точка появления: самый нижний и широкий блок рядом с центром карты. */
export function pickSpawn(items) {
  if (!items?.length) return { x: 0, y: 2, z: 0 };
  const cx = items.reduce((s, i) => s + i.pos[0], 0) / items.length;
  const cz = items.reduce((s, i) => s + i.pos[2], 0) / items.length;
  const minY = Math.min(...items.map((i) => i.pos[1]));
  const near = items
    .filter((i) => Math.hypot(i.pos[0] - cx, i.pos[2] - cz) < 26)
    .sort((a, b) => a.pos[1] - b.pos[1] || area(b) - area(a));
  const base = near[0] || items.slice().sort((a, b) => a.pos[1] - b.pos[1])[0];
  return { x: base.pos[0], y: blockTop(base) + 0.4, z: base.pos[2], minY };
}

/** Финиш: вершина самого высокого блока. */
export function pickFinish(items) {
  if (!items?.length) return { x: 0, y: 10, z: 0 };
  const top = items.slice().sort((a, b) => blockTop(b) - blockTop(a))[0];
  return { x: top.pos[0], y: blockTop(top) + 1.2, z: top.pos[2] };
}

/* ============================================================
   Демонстрационные карты (тот же формат, что экспортирует редактор)
   ============================================================ */

function block(x, y, z, sx = 1, sy = 1, sz = 1, color = '#88aaff', physics = false) {
  return { kind: 'block', pos: [x, y, z], rot: [0, 0, 0], scale: [sx, sy, sz], color, physics, faces: [null, null, null, null, null, null], faceFlip: [false, false, false, false, false, false] };
}

/** Паркур-башня из блоков — как если бы её собрали в GimPrograms 3D Editor. */
export function sampleTower() {
  const items = [];
  const colors = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185'];
  // стартовая площадка
  items.push(block(0, 0.5, 0, 8, 1, 8, '#3b4a6b'));
  let x = 0;
  let y = 1.4;
  let z = -6;
  for (let i = 0; i < 26; i++) {
    const c = colors[i % colors.length];
    const w = 2.6 - Math.min(1.3, i * 0.05);
    items.push(block(x, y, z, w, 0.5, w, c));
    const angle = i * 0.62;
    const dist = 4.2 + Math.sin(i * 0.7) * 1.1;
    x += Math.cos(angle) * dist;
    z += Math.sin(angle) * dist;
    y += 1.25;
    if (i % 5 === 4) items.push(block(x, y + 0.1, z, 5, 0.5, 5, '#4b5b7d')); // контрольная точка
  }
  // финишная платформа
  items.push(block(x, y + 1.4, z, 7, 0.6, 7, '#f5c451'));
  items.push(block(x - 3, y + 2.4, z - 3, 0.6, 2.4, 0.6, '#e5e7eb'));
  items.push(block(x + 3, y + 2.4, z - 3, 0.6, 2.4, 0.6, '#e5e7eb'));
  items.push(block(x, y + 3.8, z - 3, 6.6, 0.5, 0.5, '#fb7185'));
  return { version: 2, items };
}

/** Небольшой остров-песочница. */
export function sampleIsland() {
  const items = [];
  items.push(block(0, 0.5, 0, 26, 1, 26, '#6aa84f'));
  items.push(block(0, 1.2, 0, 22, 0.6, 22, '#7ec850'));
  // дорожки
  for (let i = -10; i <= 10; i += 2) items.push(block(i, 1.6, 0, 2, 0.2, 2.4, '#d8c9a3'));
  // домики
  for (const [hx, hz, c] of [[-7, -7, '#f4a261'], [7, -7, '#e76f51'], [-7, 7, '#2a9d8f'], [7, 7, '#e9c46a']]) {
    items.push(block(hx, 2.6, hz, 4, 2.4, 4, c));
    items.push(block(hx, 4.2, hz, 4.6, 0.6, 4.6, '#8d5b3f'));
  }
  // башня
  for (let i = 0; i < 8; i++) items.push(block(0, 2.2 + i * 1.2, -10, 3 - i * 0.15, 1.2, 3 - i * 0.15, '#cfd8ea'));
  items.push(block(0, 12, -10, 4, 0.5, 4, '#f5c451'));
  // деревья
  for (const [tx, tz] of [[-11, 3], [11, 4], [3, 11], [-4, -11]]) {
    items.push(block(tx, 2.4, tz, 0.6, 2, 0.6, '#7a5230'));
    items.push(block(tx, 4, tz, 2.4, 1.6, 2.4, '#3f8f4a'));
  }
  // динамические ящики
  for (let i = 0; i < 6; i++) items.push(block(-2 + i * 0.9, 8 + i, 6, 1, 1, 1, '#fbbf24', true));
  return { version: 2, items };
}

export const SAMPLE_MAPS = {
  tower: { name: 'Пример: башня-обби', data: sampleTower },
  island: { name: 'Пример: остров', data: sampleIsland },
};
