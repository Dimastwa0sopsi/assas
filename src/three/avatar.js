/**
 * GIMVERSE — блочный персонаж (R6-подобный): построение, анимация, 2D-портрет для карточек.
 * Размеры в «метрах»: общая высота ≈ 1.8 * scale — совпадает с физикой редактора GimPrograms.
 */
import * as THREE from 'three';

export const SKINS = ['#f7d7b8', '#f2c29b', '#e0a878', '#c68a5c', '#9c6640', '#6f4726', '#b6f0d6', '#c9d6ff', '#ffd7e8'];
export const CLOTH = [
  '#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#f472b6', '#60a5fa', '#a78bfa',
  '#f97316', '#14b8a6', '#ef4444', '#84cc16', '#e5e7eb', '#1f2937', '#0ea5e9', '#c084fc',
];
export const HAIR_COLORS = ['#3a2a1c', '#12100e', '#6b4a2b', '#a9743f', '#e0c060', '#c0392b', '#7c5cff', '#22d3ee', '#f472b6', '#e8eaf2'];

export const FACES = ['happy', 'cool', 'angry', 'wink', 'robot', 'cute', 'sleepy'];
export const HAIRS = ['none', 'short', 'spiky', 'bun', 'long', 'mohawk', 'ponytail'];

export const SHOP = {
  hat: [
    { id: 'hat_none', name: 'Без убора', em: '🚫', price: 0 },
    { id: 'hat_cap', name: 'Кепка', em: '🧢', price: 0 },
    { id: 'hat_crown', name: 'Корона', em: '👑', price: 450 },
    { id: 'hat_top', name: 'Цилиндр', em: '🎩', price: 320 },
    { id: 'hat_helmet', name: 'Шлем', em: '⛑️', price: 260 },
    { id: 'hat_halo', name: 'Нимб', em: '😇', price: 600 },
    { id: 'hat_horns', name: 'Рожки', em: '😈', price: 380 },
    { id: 'hat_headset', name: 'Гарнитура', em: '🎧', price: 210 },
  ],
  accessory: [
    { id: 'acc_none', name: 'Без аксессуара', em: '🚫', price: 0 },
    { id: 'acc_backpack', name: 'Рюкзак', em: '🎒', price: 180 },
    { id: 'acc_wings', name: 'Крылья', em: '🪽', price: 520 },
    { id: 'acc_jet', name: 'Джетпак', em: '🚀', price: 700 },
    { id: 'acc_sword', name: 'Меч', em: '🗡️', price: 300 },
    { id: 'acc_cape', name: 'Плащ', em: '🦸', price: 240 },
  ],
  trail: [
    { id: 'trail_none', name: 'Без следа', em: '🚫', price: 0 },
    { id: 'trail_spark', name: 'Искры', em: '✨', price: 260 },
    { id: 'trail_flame', name: 'Пламя', em: '🔥', price: 420 },
    { id: 'trail_rainbow', name: 'Радуга', em: '🌈', price: 650 },
  ],
};

export function shopItem(kind, id) {
  return SHOP[kind]?.find((i) => i.id === id) || SHOP[kind]?.[0];
}

/* ============================================================
   Лицо (общий код для текстуры и 2D-портрета)
   ============================================================ */
export function drawFace(ctx, cx, cy, size, face = 'happy', eyes = '#2b3350', skin = '#f2c29b') {
  const u = size / 8; // условная единица
  ctx.clearRect(cx - size / 2, cy - size / 2, size, size);
  ctx.fillStyle = skin;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.fillStyle = eyes;

  const eyeY = cy - u * 0.55;
  const ex = u * 1.35;
  const eyeW = u * 1.0;
  const eyeH = face === 'cute' ? u * 1.25 : u * 0.95;

  if (face === 'cool') {
    ctx.fillStyle = '#141824';
    ctx.fillRect(cx - ex - eyeW / 2 - u * 0.15, eyeY - eyeH / 2, ex * 2 + eyeW + u * 0.3, eyeH * 1.05);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(cx - ex - eyeW / 2, eyeY - eyeH / 2, eyeW * 0.45, eyeH * 0.5);
  } else if (face === 'robot') {
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(cx - ex - eyeW / 2, eyeY - eyeH / 2, eyeW, eyeH * 0.7);
    ctx.fillRect(cx + ex - eyeW / 2, eyeY - eyeH / 2, eyeW, eyeH * 0.7);
  } else if (face === 'wink') {
    ctx.beginPath();
    ctx.ellipse(cx - ex, eyeY, eyeW / 2, eyeH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = eyes;
    ctx.lineWidth = u * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx + ex - eyeW / 2, eyeY);
    ctx.lineTo(cx + ex + eyeW / 2, eyeY);
    ctx.stroke();
  } else if (face === 'sleepy') {
    ctx.strokeStyle = eyes;
    ctx.lineWidth = u * 0.22;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * ex, eyeY, eyeW / 2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * ex, eyeY, eyeW / 2, eyeH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx + s * ex + eyeW * 0.16, eyeY - eyeH * 0.18, eyeW * 0.16, eyeH * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eyes;
    }
  }

  // брови
  ctx.strokeStyle = eyes;
  ctx.lineWidth = u * 0.18;
  if (face === 'angry') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * (ex - eyeW * 0.6), eyeY - eyeH * 1.15);
      ctx.lineTo(cx + s * (ex + eyeW * 0.6), eyeY - eyeH * 0.75);
      ctx.stroke();
    }
  }

  // рот
  const my = cy + u * 1.15;
  ctx.strokeStyle = '#8a4a3a';
  ctx.fillStyle = '#8a4a3a';
  ctx.lineWidth = u * 0.24;
  ctx.beginPath();
  if (face === 'angry') {
    ctx.arc(cx, my + u * 0.6, u * 0.85, 1.15 * Math.PI, 1.85 * Math.PI);
  } else if (face === 'robot') {
    ctx.rect(cx - u * 1.1, my - u * 0.25, u * 2.2, u * 0.5);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * u * 0.6, my - u * 0.25);
      ctx.lineTo(cx + i * u * 0.6, my + u * 0.25);
      ctx.stroke();
    }
    return;
  } else if (face === 'sleepy') {
    ctx.ellipse(cx, my, u * 0.4, u * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${u * 1.1}px sans-serif`;
    ctx.fillText('z', cx + u * 1.5, cy - u * 1.6);
    return;
  } else if (face === 'cute') {
    ctx.ellipse(cx, my, u * 0.7, u * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(cx, my - u * 0.35, u * 0.95, 0.18 * Math.PI, 0.82 * Math.PI);
  }
  ctx.stroke();
}

function makeFaceTexture(data) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFace(ctx, size / 2, size / 2, size, data.face, data.eyes, data.skin);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============================================================
   Построение персонажа
   ============================================================ */
const P = {
  legW: 0.34,
  legH: 0.72,
  torsoW: 0.74,
  torsoH: 0.62,
  armW: 0.26,
  armH: 0.66,
  head: 0.46,
};

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.78, metalness: opts.metalness ?? 0.04, ...opts });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildHair(style, color, headSize) {
  const g = new THREE.Group();
  const mat = std(color, { roughness: 0.9 });
  const s = headSize;
  const top = s / 2;
  if (style === 'short') {
    g.add(box(s * 1.04, s * 0.34, s * 1.04, mat, 0, top - s * 0.06, 0));
    g.add(box(s * 1.06, s * 0.16, s * 0.3, mat, 0, top - s * 0.2, -s * 0.4));
  } else if (style === 'spiky') {
    g.add(box(s * 1.02, s * 0.2, s * 1.02, mat, 0, top - s * 0.02, 0));
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(s * 0.16, s * 0.55, 5), mat);
      c.position.set((i - 2) * s * 0.2, top + s * 0.22, (i % 2 ? 0.12 : -0.12) * s);
      c.rotation.z = (i - 2) * 0.16;
      c.castShadow = true;
      g.add(c);
    }
  } else if (style === 'bun') {
    g.add(box(s * 1.04, s * 0.3, s * 1.04, mat, 0, top - s * 0.05, 0));
    const b = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 14, 12), mat);
    b.position.set(0, top + s * 0.22, -s * 0.18);
    b.castShadow = true;
    g.add(b);
  } else if (style === 'long') {
    g.add(box(s * 1.06, s * 0.32, s * 1.06, mat, 0, top - s * 0.05, 0));
    g.add(box(s * 1.04, s * 0.95, s * 0.24, mat, 0, -s * 0.28, -s * 0.44));
    g.add(box(s * 0.24, s * 0.8, s * 0.9, mat, s * 0.44, -s * 0.2, 0));
    g.add(box(s * 0.24, s * 0.8, s * 0.9, mat, -s * 0.44, -s * 0.2, 0));
  } else if (style === 'mohawk') {
    for (let i = -2; i <= 2; i++) {
      g.add(box(s * 0.14, s * (0.42 - Math.abs(i) * 0.07), s * 0.3, mat, 0, top + s * 0.1, i * s * 0.18));
    }
  } else if (style === 'ponytail') {
    g.add(box(s * 1.04, s * 0.3, s * 1.04, mat, 0, top - s * 0.05, 0));
    g.add(box(s * 0.3, s * 0.7, s * 0.3, mat, 0, -s * 0.1, -s * 0.55));
    const tie = box(s * 0.36, s * 0.12, s * 0.36, std('#f472b6'), 0, s * 0.24, -s * 0.52);
    g.add(tie);
  }
  return g;
}

function buildHat(id, data, headSize) {
  const g = new THREE.Group();
  const s = headSize;
  const top = s / 2;
  const cloth = std(data.shirt, { roughness: 0.7 });
  const dark = std('#1b2130', { roughness: 0.6 });
  const gold = std('#f5c451', { roughness: 0.3, metalness: 0.65 });
  if (id === 'hat_cap') {
    g.add(box(s * 1.06, s * 0.24, s * 1.06, cloth, 0, top + s * 0.02, 0));
    g.add(box(s * 0.62, s * 0.07, s * 0.5, cloth, 0, top - s * 0.02, s * 0.66));
    g.add(box(s * 0.3, s * 0.16, s * 0.06, std('#ffffff'), 0, top + s * 0.06, s * 0.54));
  } else if (id === 'hat_crown') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.52, s * 0.56, s * 0.24, 16), gold);
    ring.position.y = top + s * 0.06;
    ring.castShadow = true;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(s * 0.1, s * 0.3, 4), gold);
      const a = (i / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * s * 0.44, top + s * 0.3, Math.sin(a) * s * 0.44);
      sp.castShadow = true;
      g.add(sp);
    }
  } else if (id === 'hat_top') {
    g.add(box(s * 1.25, s * 0.08, s * 1.25, dark, 0, top - s * 0.02, 0));
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.42, s * 0.44, s * 0.72, 18), dark);
    cyl.position.y = top + s * 0.34;
    cyl.castShadow = true;
    g.add(cyl);
    g.add(box(s * 0.92, s * 0.1, s * 0.92, std('#8b1e2d'), 0, top + s * 0.08, 0));
  } else if (id === 'hat_helmet') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(s * 0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#e0483f', { roughness: 0.45 }));
    dome.position.y = top - s * 0.04;
    dome.castShadow = true;
    g.add(dome);
    g.add(box(s * 1.28, s * 0.1, s * 1.28, std('#d9dde7'), 0, top - s * 0.04, 0));
  } else if (id === 'hat_halo') {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(s * 0.42, s * 0.06, 10, 26), std('#ffe066', { emissive: '#ffb703', emissiveIntensity: 0.7, roughness: 0.3 }));
    torus.rotation.x = Math.PI / 2;
    torus.position.y = top + s * 0.5;
    g.add(torus);
  } else if (id === 'hat_horns') {
    const mat = std('#8b1e2d', { roughness: 0.5 });
    for (const s2 of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(s * 0.11, s * 0.42, 8), mat);
      horn.position.set(s2 * s * 0.34, top + s * 0.18, 0);
      horn.rotation.z = s2 * 0.45;
      horn.castShadow = true;
      g.add(horn);
    }
  } else if (id === 'hat_headset') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(s * 0.55, s * 0.06, 8, 22, Math.PI), dark);
    band.position.y = top + s * 0.02;
    g.add(band);
    for (const s2 of [-1, 1]) {
      g.add(box(s * 0.12, s * 0.3, s * 0.3, std('#7c5cff'), s2 * s * 0.56, top - s * 0.12, 0));
    }
    g.add(box(s * 0.06, s * 0.06, s * 0.5, dark, s * 0.56, top - s * 0.3, s * 0.3));
  }
  return g;
}

function buildAccessory(id, data, dims) {
  const g = new THREE.Group();
  const { torsoW, torsoH, armW } = dims;
  const back = -0.2;
  if (id === 'acc_backpack') {
    const pack = box(torsoW * 0.7, torsoH * 0.7, 0.24, std(data.shirt === '#7c5cff' ? '#22d3ee' : '#7c5cff', { roughness: 0.7 }), 0, torsoH * 0.12, back - 0.12);
    g.add(pack);
    g.add(box(torsoW * 0.3, 0.12, 0.08, std('#111827'), 0, torsoH * 0.3, back - 0.24));
  } else if (id === 'acc_wings') {
    const mat = std('#e8f0ff', { roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.72 - i * 0.12, 4), mat);
        f.rotation.z = s * (Math.PI / 2 - 0.35 - i * 0.22);
        f.position.set(s * (0.22 + i * 0.1), 0.26 - i * 0.16, back - 0.06);
        f.castShadow = true;
        w.add(f);
      }
      g.add(w);
    }
    g.userData.flap = true;
  } else if (id === 'acc_jet') {
    for (const s of [-1, 1]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 12), std('#9aa4b8', { metalness: 0.5, roughness: 0.35 }));
      cyl.position.set(s * 0.17, 0.06, back - 0.12);
      cyl.castShadow = true;
      g.add(cyl);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 10), std('#ffb703', { emissive: '#ff6d00', emissiveIntensity: 1.4 }));
      flame.position.set(s * 0.17, -0.3, back - 0.12);
      flame.rotation.x = Math.PI;
      flame.name = 'flame';
      g.add(flame);
    }
  } else if (id === 'acc_sword') {
    const sw = new THREE.Group();
    sw.add(box(0.07, 0.86, 0.03, std('#dfe7f5', { metalness: 0.75, roughness: 0.25 }), 0, 0.4, 0));
    sw.add(box(0.26, 0.07, 0.08, std('#f5c451', { metalness: 0.6, roughness: 0.35 }), 0, -0.02, 0));
    sw.add(box(0.09, 0.2, 0.09, std('#5b3a1e'), 0, -0.16, 0));
    sw.position.set(armW + 0.22, torsoH * 0.1, 0.05);
    sw.rotation.z = -0.5;
    g.add(sw);
  } else if (id === 'acc_cape') {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(torsoW * 1.05, torsoH * 1.5, 4, 6), std(data.shirt, { side: THREE.DoubleSide, roughness: 0.85 }));
    cape.position.set(0, -torsoH * 0.28, back - 0.06);
    cape.name = 'cape';
    cape.castShadow = true;
    g.add(cape);
  }
  return g;
}

/**
 * Создаёт персонажа.
 * @returns {{group:THREE.Group, update:(dt:number, st:object)=>void, dispose:()=>void, apply:(data:object)=>void}}
 */
export function buildAvatar(data = {}, { shadows = true } = {}) {
  const group = new THREE.Group();
  const parts = {};
  let faceTex = null;
  let trail = null;

  const mats = {};
  const ensureMats = (d) => {
    mats.skin?.dispose();
    mats.shirt?.dispose();
    mats.pants?.dispose();
    mats.shoes?.dispose();
    mats.hair?.dispose();
    mats.skin = std(d.skin);
    mats.shirt = std(d.shirt);
    mats.pants = std(d.pants);
    mats.shoes = std(d.shoes, { roughness: 0.5 });
    mats.hair = std(d.hairColor, { roughness: 0.92 });
    if (faceTex) faceTex.dispose();
    faceTex = makeFaceTexture(d);
    mats.face = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.8 });
  };

  const legGeo = new THREE.BoxGeometry(P.legW, P.legH, P.legW);
  const armGeo = new THREE.BoxGeometry(P.armW, P.armH, P.armW * 1.05);
  const torsoGeo = new THREE.BoxGeometry(P.torsoW, P.torsoH, P.torsoW * 0.52);
  const headGeo = new THREE.BoxGeometry(P.head, P.head, P.head);

  const build = (d) => {
    // ноги (пивот в бедре)
    const legL = new THREE.Group();
    const legLMesh = new THREE.Mesh(legGeo, [mats.pants, mats.pants, mats.pants, mats.shoes, mats.pants, mats.pants]);
    legLMesh.position.y = -P.legH / 2;
    legL.add(legLMesh);
    const legR = legL.clone();
    legL.position.set(-P.legW * 0.56, P.legH, 0);
    legR.position.set(P.legW * 0.56, P.legH, 0);

    const torso = new THREE.Mesh(torsoGeo, mats.shirt);
    torso.position.y = P.legH + P.torsoH / 2;

    const armL = new THREE.Group();
    const armLMesh = new THREE.Mesh(armGeo, mats.skin);
    armLMesh.position.y = -P.armH / 2;
    armL.add(armLMesh);
    const armR = armL.clone();
    armL.position.set(-P.torsoW / 2 - P.armW / 2 - 0.02, P.legH + P.torsoH - 0.04, 0);
    armR.position.set(P.torsoW / 2 + P.armW / 2 + 0.02, P.legH + P.torsoH - 0.04, 0);

    const headPivot = new THREE.Group();
    headPivot.position.y = P.legH + P.torsoH + P.head / 2;
    const head = new THREE.Mesh(headGeo, [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin]);
    headPivot.add(head);

    const hair = buildHair(d.hair, d.hairColor, P.head);
    headPivot.add(hair);
    const hat = buildHat(d.hat, d, P.head);
    headPivot.add(hat);

    const acc = buildAccessory(d.accessory, d, { torsoW: P.torsoW, torsoH: P.torsoH, armW: P.armW });
    acc.position.y = P.legH + P.torsoH * 0.45;
    torso.add(acc);

    group.clear();
    group.add(legL, legR, torso, armL, armR, headPivot);
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    const s = d.scale || 1;
    group.scale.setScalar(s);

    Object.assign(parts, { legL, legR, torso, armL, armR, head: headPivot, acc });
    group.userData.height = (P.legH + P.torsoH + P.head) * s;
  };

  ensureMats(data);
  build(data);

  let phase = 0;
  let idleT = 0;

  const update = (dt, st = {}) => {
    idleT += dt;
    const speed = st.speed || 0;
    const moving = speed > 0.25;
    phase += dt * (st.run ? 15 : 10) * Math.min(1.6, 0.4 + speed / 5);

    const swing = moving ? Math.sin(phase) * (st.run ? 0.95 : 0.7) : Math.sin(idleT * 1.6) * 0.05;
    parts.armL.rotation.x = -swing;
    parts.armR.rotation.x = swing;
    parts.legL.rotation.x = swing * 0.9;
    parts.legR.rotation.x = -swing * 0.9;
    parts.torso.rotation.y = moving ? swing * 0.08 : 0;
    parts.head.rotation.y = st.headYaw || 0;
    parts.head.rotation.x = (st.headPitch || 0) * 0.35 + (moving ? Math.sin(phase * 2) * 0.02 : Math.sin(idleT * 1.3) * 0.02);

    if (!st.grounded) {
      parts.armL.rotation.x = -1.5;
      parts.armR.rotation.x = -1.4;
      parts.legL.rotation.x = 0.35;
      parts.legR.rotation.x = -0.25;
    }
    if (st.emote === 'wave') {
      parts.armR.rotation.x = -2.5;
      parts.armR.rotation.z = Math.sin(idleT * 9) * 0.4 - 0.3;
    } else parts.armR.rotation.z = 0;
    if (st.emote === 'dance') {
      const b = Math.sin(idleT * 7);
      parts.torso.rotation.z = b * 0.12;
      parts.armL.rotation.z = 0.6 + b * 0.5;
      parts.armR.rotation.z = -0.6 - b * 0.5;
      group.position.y = (st.baseY || 0) + Math.abs(b) * 0.08;
    }

    // плащ / крылья
    const cape = parts.acc?.getObjectByName('cape');
    if (cape) cape.rotation.x = Math.min(0.9, speed * 0.12) + Math.sin(idleT * 3) * 0.04;
    if (parts.acc?.userData.flap) parts.acc.rotation.z = Math.sin(idleT * 6) * 0.12;
    const flame = parts.acc?.getObjectByName('flame');
    if (flame) flame.scale.y = 0.7 + Math.random() * 0.6;

    // след
    if (trail && moving) {
      const pos = trail.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const life = trail.userData.life[i];
        if (life <= 0) {
          if (Math.random() < 0.5) {
            pos.setXYZ(i, (Math.random() - 0.5) * 0.3, Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
            trail.userData.life[i] = 1;
            const c = trail.geometry.attributes.color;
            const col = trailColor(data.trail, Math.random());
            c.setXYZ(i, col.r, col.g, col.b);
          }
        } else {
          trail.userData.life[i] = life - dt * 1.6;
          pos.setY(i, pos.getY(i) + dt * 0.6);
        }
      }
      pos.needsUpdate = true;
      trail.geometry.attributes.color.needsUpdate = true;
      trail.material.opacity = 0.85;
    } else if (trail) trail.material.opacity = 0;
  };

  const apply = (d) => {
    ensureMats(d);
    build(d);
    if (trail) {
      group.parent?.remove(trail);
      trail.geometry.dispose();
      trail.material.dispose();
      trail = null;
    }
    if (d.trail && d.trail !== 'trail_none') {
      const N = 60;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false });
      trail = new THREE.Points(geo, mat);
      trail.userData.life = new Array(N).fill(0);
      trail.frustumCulled = false;
      group.add(trail);
    }
  };

  const dispose = () => {
    group.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => {
          mm?.map?.dispose?.();
          mm?.dispose?.();
        });
      }
    });
  };

  return { group, parts, update, apply, dispose, get height() { return group.userData.height || 1.8; } };
}

function trailColor(id, r) {
  const c = new THREE.Color();
  if (id === 'trail_flame') c.setHSL(0.03 + r * 0.07, 1, 0.55);
  else if (id === 'trail_rainbow') c.setHSL(r, 0.9, 0.6);
  else c.setHSL(0.13 + r * 0.05, 0.95, 0.7);
  return c;
}

/* ============================================================
   2D-портрет для карточек и списков
   ============================================================ */
export function drawPortrait(canvas, data, size = 128) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const s = data.scale || 1;
  const u = (size / 10) * s;
  const cx = size / 2;
  const feetY = size * 0.94;
  const legH = u * 2.1;
  const torsoH = u * 1.85;
  const head = u * 1.5;

  // ноги
  ctx.fillStyle = data.pants;
  ctx.fillRect(cx - u * 1.05, feetY - legH, u * 0.95, legH - u * 0.25);
  ctx.fillRect(cx + u * 0.1, feetY - legH, u * 0.95, legH - u * 0.25);
  ctx.fillStyle = data.shoes;
  ctx.fillRect(cx - u * 1.1, feetY - u * 0.3, u * 1.05, u * 0.3);
  ctx.fillRect(cx + u * 0.05, feetY - u * 0.3, u * 1.05, u * 0.3);

  // торс
  const ty = feetY - legH - torsoH;
  ctx.fillStyle = data.shirt;
  ctx.fillRect(cx - u * 1.15, ty, u * 2.3, torsoH);
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(cx + u * 0.75, ty, u * 0.4, torsoH);

  // руки
  ctx.fillStyle = data.skin;
  ctx.fillRect(cx - u * 1.75, ty + u * 0.1, u * 0.6, torsoH * 0.95);
  ctx.fillRect(cx + u * 1.15, ty + u * 0.1, u * 0.6, torsoH * 0.95);

  // голова
  const hy = ty - head;
  ctx.fillStyle = data.skin;
  ctx.fillRect(cx - head / 2, hy, head, head);

  // лицо
  const faceSize = head * 0.92;
  const off = document.createElement('canvas');
  off.width = off.height = 256;
  const octx = off.getContext('2d');
  drawFace(octx, 128, 128, 256, data.face, data.eyes, data.skin);
  ctx.drawImage(off, cx - faceSize / 2, hy + (head - faceSize) / 2, faceSize, faceSize);

  // волосы
  ctx.fillStyle = data.hairColor;
  const hh = head * 0.28;
  if (data.hair === 'short') {
    ctx.fillRect(cx - head / 2 - 2, hy - 2, head + 4, hh);
  } else if (data.hair === 'spiky') {
    ctx.fillRect(cx - head / 2 - 2, hy - 2, head + 4, hh * 0.7);
    for (let i = 0; i < 5; i++) {
      const x = cx - head / 2 + (i + 0.5) * (head / 5);
      ctx.beginPath();
      ctx.moveTo(x - head * 0.1, hy);
      ctx.lineTo(x, hy - head * 0.34);
      ctx.lineTo(x + head * 0.1, hy);
      ctx.fill();
    }
  } else if (data.hair === 'bun') {
    ctx.fillRect(cx - head / 2 - 2, hy - 2, head + 4, hh);
    ctx.beginPath();
    ctx.arc(cx, hy - head * 0.16, head * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (data.hair === 'long') {
    ctx.fillRect(cx - head / 2 - 4, hy - 2, head + 8, hh);
    ctx.fillRect(cx - head / 2 - 5, hy, head * 0.22, head * 1.5);
    ctx.fillRect(cx + head / 2 - head * 0.22 + 5, hy, head * 0.22, head * 1.5);
  } else if (data.hair === 'mohawk') {
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - head * 0.08, hy - head * 0.3 + i * 2, head * 0.16, head * 0.32);
  } else if (data.hair === 'ponytail') {
    ctx.fillRect(cx - head / 2 - 2, hy - 2, head + 4, hh);
    ctx.fillRect(cx - head * 0.12, hy - head * 0.1, head * 0.24, head * 0.9);
  }

  // головной убор
  const hat = data.hat;
  if (hat === 'hat_cap') {
    ctx.fillStyle = data.shirt;
    ctx.fillRect(cx - head / 2 - 3, hy - head * 0.16, head + 6, head * 0.2);
    ctx.fillRect(cx - head * 0.1, hy - head * 0.18, head * 0.85, head * 0.1);
  } else if (hat === 'hat_crown') {
    ctx.fillStyle = '#f5c451';
    ctx.fillRect(cx - head * 0.42, hy - head * 0.16, head * 0.84, head * 0.16);
    for (let i = 0; i < 3; i++) {
      const x = cx - head * 0.3 + i * head * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - head * 0.08, hy - head * 0.16);
      ctx.lineTo(x, hy - head * 0.4);
      ctx.lineTo(x + head * 0.08, hy - head * 0.16);
      ctx.fill();
    }
  } else if (hat === 'hat_top') {
    ctx.fillStyle = '#1b2130';
    ctx.fillRect(cx - head * 0.6, hy - head * 0.08, head * 1.2, head * 0.08);
    ctx.fillRect(cx - head * 0.36, hy - head * 0.62, head * 0.72, head * 0.56);
  } else if (hat === 'hat_helmet') {
    ctx.fillStyle = '#e0483f';
    ctx.beginPath();
    ctx.arc(cx, hy + head * 0.06, head * 0.56, Math.PI, 0);
    ctx.fill();
  } else if (hat === 'hat_halo') {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = head * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, hy - head * 0.26, head * 0.34, head * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (hat === 'hat_horns') {
    ctx.fillStyle = '#8b1e2d';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * head * 0.3 - head * 0.06, hy);
      ctx.lineTo(cx + sgn * head * 0.42, hy - head * 0.34);
      ctx.lineTo(cx + sgn * head * 0.3 + head * 0.06, hy);
      ctx.fill();
    }
  } else if (hat === 'hat_headset') {
    ctx.strokeStyle = '#1b2130';
    ctx.lineWidth = head * 0.1;
    ctx.beginPath();
    ctx.arc(cx, hy + head * 0.1, head * 0.55, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#7c5cff';
    ctx.fillRect(cx - head * 0.62, hy, head * 0.16, head * 0.3);
    ctx.fillRect(cx + head * 0.46, hy, head * 0.16, head * 0.3);
  }

  // аксессуар
  if (data.accessory === 'acc_backpack') {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(cx - u * 0.7, ty + u * 0.3, u * 1.4, torsoH * 0.6);
  } else if (data.accessory === 'acc_wings') {
    ctx.fillStyle = 'rgba(232,240,255,.75)';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + sgn * u * 1.7, ty + torsoH * 0.35, u * 0.55, u * 1.1, sgn * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (data.accessory === 'acc_cape') {
    ctx.fillStyle = data.shirt;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(cx - u * 1.1, ty, u * 2.2, torsoH * 1.5);
    ctx.globalAlpha = 1;
  } else if (data.accessory === 'acc_sword') {
    ctx.fillStyle = '#dfe7f5';
    ctx.save();
    ctx.translate(cx + u * 1.6, ty + u * 0.6);
    ctx.rotate(-0.5);
    ctx.fillRect(-u * 0.08, -u * 1.1, u * 0.16, u * 1.6);
    ctx.restore();
  }
  return canvas;
}

/** Быстрый портрет в dataURL — для карточек в сети. */
export function portraitDataURL(data, size = 96) {
  const c = document.createElement('canvas');
  drawPortrait(c, data, size);
  return c.toDataURL('image/png');
}
