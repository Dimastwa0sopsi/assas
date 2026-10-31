/**
 * GIMVERSE — движок: рендер, небо/свет, физика персонажа (AABB vs блоки), камера от 3-го лица.
 */
import * as THREE from 'three';

export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, fogK: 0.65, particles: 0.4 },
  medium: { pixelRatio: 1.4, shadows: true, shadowMap: 1024, fogK: 0.85, particles: 0.75 },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, fogK: 1, particles: 1 },
};

const SKY_VERT = /* glsl */ `
varying vec3 vPos;
void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; uniform vec3 sunDir;
varying vec3 vPos;
void main(){
  vec3 d = normalize(vPos);
  float t = clamp(d.y*0.5+0.5, 0.0, 1.0);
  vec3 col = mix(bottom, top, pow(t, 0.85));
  float s = pow(max(dot(d, normalize(sunDir)), 0.0), 24.0);
  col += sun * s * 0.85;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const PRESETS = {
  day: { top: '#4d90e8', bottom: '#cfe6ff', sun: '#fff2cc', sunDir: [-0.5, 0.8, 0.35], fog: '#cfe0f2', hemi: 1.1, light: 2.1 },
  sunset: { top: '#3b2a63', bottom: '#ff9e6d', sun: '#ffd6a0', sunDir: [0.7, 0.28, 0.4], fog: '#e39a7a', hemi: 0.75, light: 1.7 },
  night: { top: '#050914', bottom: '#1b2b52', sun: '#9fc0ff', sunDir: [0.3, 0.7, -0.5], fog: '#101a33', hemi: 0.4, light: 0.7 },
  neon: { top: '#160a2e', bottom: '#4b1d6b', sun: '#22d3ee', sunDir: [-0.4, 0.6, 0.6], fog: '#2a1450', hemi: 0.6, light: 1.3 },
};

/* ============================================================
   Пространственный хэш коллизий
   ============================================================ */
export class PhysicsWorld {
  constructor(cell = 4) {
    this.cell = cell;
    this.boxes = [];
    this.grid = new Map();
  }

  add(min, max, tag = null) {
    const box = { min: toVec(min), max: toVec(max), tag };
    this.boxes.push(box);
    this._index(box);
    return box;
  }

  addFromObject3D(obj, tag = null) {
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return null;
    return this.add(b.min, b.max, tag);
  }

  _index(box) {
    const { cell } = this;
    const x0 = Math.floor(box.min.x / cell);
    const x1 = Math.floor(box.max.x / cell);
    const y0 = Math.floor(box.min.y / cell);
    const y1 = Math.floor(box.max.y / cell);
    const z0 = Math.floor(box.min.z / cell);
    const z1 = Math.floor(box.max.z / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = `${x},${y},${z}`;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(box);
        }
  }

  query(min, max, out = []) {
    out.length = 0;
    const { cell } = this;
    const seen = new Set();
    const x0 = Math.floor(min.x / cell);
    const x1 = Math.floor(max.x / cell);
    const y0 = Math.floor(min.y / cell);
    const y1 = Math.floor(max.y / cell);
    const z0 = Math.floor(min.z / cell);
    const z1 = Math.floor(max.z / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const arr = this.grid.get(`${x},${y},${z}`);
          if (!arr) continue;
          for (const b of arr) if (!seen.has(b)) (seen.add(b), out.push(b));
        }
    return out;
  }

  clear() {
    this.boxes = [];
    this.grid.clear();
  }
}

const toVec = (v) => (v?.isVector3 ? v.clone() : new THREE.Vector3(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0));

const overlaps = (a, b) =>
  a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z;

/* ============================================================
   Контроллер персонажа
   ============================================================ */
export class PlayerController {
  constructor(world, { radius = 0.31, height = 1.8, gravity = 26, jump = 9.4, speed = 6.2, runMul = 1.55 } = {}) {
    this.world = world;
    this.radius = radius;
    this.height = height;
    this.gravity = gravity;
    this.jumpPower = jump;
    this.speed = speed;
    this.runMul = runMul;
    this.position = new THREE.Vector3(0, height, 0); // ноги
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.yaw = 0;
    this.stepHeight = 0.42;
    this._tmp = [];
    this._tmpFree = [];
    this.onLand = null;
    this.onStep = null;
    this.airTime = 0;
    this.lastGroundY = height;
  }

  box() {
    const r = this.radius;
    return {
      min: { x: this.position.x - r, y: this.position.y + 0.001, z: this.position.z - r },
      max: { x: this.position.x + r, y: this.position.y + this.height, z: this.position.z + r },
    };
  }

  /** Проверка: свободно ли место, если поставить персонажа в точку p. */
  free(x, y, z) {
    const r = this.radius;
    const test = { min: { x: x - r, y: y + 0.02, z: z - r }, max: { x: x + r, y: y + this.height, z: z + r } };
    const list = this.world.query(test.min, test.max, this._tmpFree);
    for (const b of list) if (overlaps(test, b)) return false;
    return true;
  }

  update(dt, move, opts = {}) {
    const { yaw = this.yaw, jump = false, sprint = false, speedScale = 1, gravityScale = 1, worldSpace = false } = opts;
    this.yaw = yaw;
    const p = this.position;
    const v = this.velocity;

    // желаемая скорость в локальных осях камеры
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let dx = worldSpace ? move.x : fx * -move.z + rx * move.x;
    let dz = worldSpace ? move.z : fz * -move.z + rz * move.x;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    const maxSpeed = this.speed * (sprint ? this.runMul : 1) * speedScale;
    const targetX = dx * maxSpeed;
    const targetZ = dz * maxSpeed;
    const accel = this.grounded ? 44 : 14;
    v.x += (targetX - v.x) * Math.min(1, accel * dt * 0.35);
    v.z += (targetZ - v.z) * Math.min(1, accel * dt * 0.35);

    // прыжок
    if (this.grounded) this.coyote = 0.14;
    else this.coyote = Math.max(0, this.coyote - dt);
    if (jump) this.jumpBuffer = 0.16;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      v.y = this.jumpPower;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.onStep?.('jump');
    }

    v.y -= this.gravity * gravityScale * dt;
    if (v.y < -55) v.y = -55;

    const wasGrounded = this.grounded;
    this.grounded = false;
    let blocked = [];

    // X
    p.x += v.x * dt;
    this._resolve('x', blocked);
    // Z
    p.z += v.z * dt;
    this._resolve('z', blocked);

    // Y
    p.y += v.y * dt;
    this._resolve('y', blocked);

    // «пол» на y=0
    if (p.y <= 0) {
      p.y = 0;
      if (v.y < 0) {
        if (!wasGrounded && v.y < -6) this.onLand?.(Math.abs(v.y));
        v.y = 0;
      }
      this.grounded = true;
    }

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.25) this.onLand?.(Math.abs(v.y));
      this.airTime = 0;
      this.lastGroundY = p.y;
    } else this.airTime += dt;

    // трение в воздухе/на земле
    if (this.grounded && len < 0.01) {
      v.x *= Math.pow(0.0008, dt);
      v.z *= Math.pow(0.0008, dt);
    }
    return { grounded: this.grounded, speed: Math.hypot(v.x, v.z), vy: v.y, moving: len > 0.05 };
  }

  _resolve(axis, blocked) {
    const test = this.box();
    const list = this.world.query(test.min, test.max, this._tmp);
    for (const b of list) {
      if (!overlaps(test, b)) continue;
      const p = this.position;
      if (axis === 'y') {
        if (this.velocity.y <= 0) {
          p.y = b.max.y;
          this.grounded = true;
        } else {
          p.y = b.min.y - this.height - 0.001;
        }
        this.velocity.y = 0;
        test.min.y = p.y + 0.001;
        test.max.y = p.y + this.height;
      } else {
        const r = this.radius;
        // авто-подъём: если препятствие низкое и сверху свободно — встаём на него,
        // не теряя скорость (иначе персонаж «залипает» у ступеньки)
        const top = b.max.y;
        if (this.velocity.y <= 0.001 && top > p.y && top - p.y <= this.stepHeight && this.free(p.x, top + 0.02, p.z)) {
          p.y = top + 0.002;
          test.min.y = p.y + 0.001;
          test.max.y = p.y + this.height;
          this.grounded = true;
          this.onStep?.('step');
          continue;
        }
        if (this.position[axis] < (b.min[axis] + b.max[axis]) / 2) {
          p[axis] = b.min[axis] - r - 0.001;
          if (this.velocity[axis] > 0) this.velocity[axis] = 0;
        } else {
          p[axis] = b.max[axis] + r + 0.001;
          if (this.velocity[axis] < 0) this.velocity[axis] = 0;
        }
        if (axis === 'x') {
          test.min.x = p.x - r;
          test.max.x = p.x + r;
        } else {
          test.min.z = p.z - r;
          test.max.z = p.z + r;
        }
        if (!blocked.includes(b)) blocked.push(b);
      }
    }
  }

  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.airTime = 0;
  }

  setSize(height, radius = this.radius) {
    this.height = height;
    this.radius = radius;
  }
}

/* ============================================================
   Камера от третьего лица
   ============================================================ */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.28;
    this.distance = 6.2;
    this.minDistance = 2.4;
    this.maxDistance = 14;
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this.shake = 0;
    this._v = new THREE.Vector3();
  }

  look(dx, dy, sensitivity = 1, invert = false) {
    const k = 0.0032 * sensitivity;
    this.yaw -= dx * k;
    this.pitch += (invert ? 1 : -1) * dy * k;
    this.pitch = Math.max(-0.9, Math.min(1.25, this.pitch));
  }

  zoom(delta) {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + delta * 0.004));
  }

  update(dt, focus, { instant = false } = {}) {
    const cp = Math.cos(this.pitch);
    const desired = this._v.set(
      focus.x + Math.sin(this.yaw) * this.distance * cp,
      focus.y + 1.15 + Math.sin(this.pitch) * this.distance * 0.75,
      focus.z + Math.cos(this.yaw) * this.distance * cp
    );
    if (instant) this.smooth.copy(desired);
    else this.smooth.lerp(desired, 1 - Math.exp(-14 * dt));
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
    }
    this.camera.position.set(this.smooth.x + sx, Math.max(0.4, this.smooth.y + sy), this.smooth.z);
    this.camera.lookAt(focus.x, focus.y + 1.05, focus.z);
  }
}

/* ============================================================
   Движок
   ============================================================ */
export class Engine {
  constructor(canvas, { quality = 'high', preset = 'day', shadows = true, fov = 70 } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 600);
    this.world = new PhysicsWorld();
    this.disposables = [];
    this.frame = 0;

    const skyGeo = new THREE.SphereGeometry(420, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#4d90e8') },
        bottom: { value: new THREE.Color('#cfe6ff') },
        sun: { value: new THREE.Color('#fff2cc') },
        sunDir: { value: new THREE.Vector3(-0.5, 0.8, 0.35) },
      },
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x54604a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
    this.sun.position.set(-60, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.02;
    const cam = this.sun.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 1;
    cam.far = 320;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fog = new THREE.Fog('#cfe0f2', 60, 320);
    this.scene.fog = this.fog;

    this.setQuality(quality, shadows);
    this.applyPreset(preset);
    this.resize();
  }

  setQuality(quality, shadows = true) {
    const q = QUALITY[quality] || QUALITY.high;
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = !!(q.shadows && shadows);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = !!(q.shadows && shadows);
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.fogK = q.fogK;
    this.particlesK = q.particles;
  }

  applyPreset(name) {
    const p = PRESETS[name] || PRESETS.day;
    this.preset = name;
    this.skyMat.uniforms.top.value.set(p.top);
    this.skyMat.uniforms.bottom.value.set(p.bottom);
    this.skyMat.uniforms.sun.value.set(p.sun);
    this.skyMat.uniforms.sunDir.value.set(...p.sunDir).normalize();
    this.sun.position.set(p.sunDir[0] * 120, Math.max(20, p.sunDir[1] * 140), p.sunDir[2] * 120);
    this.sun.color.set(p.sun);
    this.sun.intensity = p.light;
    this.hemi.intensity = p.hemi;
    this.fog.color.set(p.fog);
    this.fog.far = 320 * this.fogK;
    this.fog.near = 60 * this.fogK;
  }

  resize(w = this.canvas.clientWidth, h = this.canvas.clientHeight) {
    const width = Math.max(1, w || window.innerWidth);
    const height = Math.max(1, h || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Центрирует тени вокруг точки (важно для больших карт). */
  focusShadows(x, z, radius = 60) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x - 60, 90, z + 40);
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.updateProjectionMatrix();
  }

  track(m) {
    this.disposables.push(m);
    return m;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => {
          if (!mm) return;
          for (const k of Object.keys(mm)) if (mm[k]?.isTexture) mm[k].dispose();
          mm.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.world.clear();
  }
}

/* ============================================================
   Вспомогательные меши
   ============================================================ */
const matCache = new Map();
export function cachedMat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.8}|${opts.metalness ?? 0.05}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  if (!matCache.has(key)) {
    matCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.8,
        metalness: opts.metalness ?? 0.05,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 1,
        transparent: (opts.opacity ?? 1) < 1,
        opacity: opts.opacity ?? 1,
      })
    );
  }
  return matCache.get(key);
}

export function boxMesh(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cachedMat(color, opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = true;
  return m;
}

/** Простой пул частиц для эффектов (монеты, взрывы, финиш). */
export function makeParticles(count = 200, color = 0xffd166, size = 0.16) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.vel = new Float32Array(count * 3);
  points.userData.life = new Float32Array(count);
  points.visible = false;
  points.userData.burst = (origin, n = 24, power = 5, spread = 1) => {
    const pos = geo.attributes.position;
    const vel = points.userData.vel;
    const life = points.userData.life;
    let placed = 0;
    for (let i = 0; i < pos.count && placed < n; i++) {
      if (life[i] > 0) continue;
      pos.setXYZ(i, origin.x, origin.y, origin.z);
      vel[i * 3] = (Math.random() - 0.5) * power * spread;
      vel[i * 3 + 1] = Math.random() * power;
      vel[i * 3 + 2] = (Math.random() - 0.5) * power * spread;
      life[i] = 0.7 + Math.random() * 0.6;
      placed++;
    }
    pos.needsUpdate = true;
    points.visible = true;
  };
  points.userData.update = (dt) => {
    const pos = geo.attributes.position;
    const vel = points.userData.vel;
    const life = points.userData.life;
    let alive = 0;
    for (let i = 0; i < pos.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= 14 * dt;
      pos.setXYZ(i, pos.getX(i) + vel[i * 3] * dt, pos.getY(i) + vel[i * 3 + 1] * dt, pos.getZ(i) + vel[i * 3 + 2] * dt);
      if (pos.getY(i) < -2) life[i] = 0;
      else alive++;
    }
    pos.needsUpdate = true;
    if (!alive) points.visible = false;
  };
  return points;
}

/** Надпись над объектом (sprite из canvas). */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(8,11,20,.72)', size = 0.9 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 44px Inter, system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 44;
  canvas.width = w;
  canvas.height = 72;
  const c2 = canvas.getContext('2d');
  c2.font = 'bold 44px Inter, system-ui, sans-serif';
  c2.fillStyle = bg;
  const r = 26;
  c2.beginPath();
  c2.roundRect(2, 8, w - 4, 56, r);
  c2.fill();
  c2.fillStyle = color;
  c2.textBaseline = 'middle';
  c2.fillText(text, 22, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set((w / 72) * size, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}
