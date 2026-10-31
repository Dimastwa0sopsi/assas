/**
 * GIMVERSE — единый 3D-превью рендерер: один WebGL-контекст на всё приложение,
 * картинка переносится в нужный canvas через drawImage.
 */
import * as THREE from 'three';

let shared = null;

function getShared() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  shared = { renderer, canvas };
  return shared;
}

export class Stage {
  constructor({ preset = 'studio', shadows = true } = {}) {
    const { renderer } = getShared();
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 1.4, 4.6);
    this.target = new THREE.Vector3(0, 0.9, 0);
    this.yaw = 0.5;
    this.pitch = 0.12;
    this.distance = 4.6;
    this.autoRotate = true;
    this.dragging = false;
    this.disposables = [];

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 6, 4);
    key.castShadow = shadows;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.001;
    const cam = key.shadow.camera;
    cam.left = -12;
    cam.right = 12;
    cam.top = 12;
    cam.bottom = -12;
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2b3350, 1.5));
    const rim = new THREE.DirectionalLight(0x7c5cff, 1.1);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);

    if (preset === 'studio') {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), new THREE.MeshStandardMaterial({ color: 0x1b2138, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.scene.add(floor);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.03, 8, 60), new THREE.MeshBasicMaterial({ color: 0x7c5cff }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.01;
      this.scene.add(ring);
      this.floor = floor;
    }
    this._obj = null;
  }

  set(object) {
    if (this._obj) this.scene.remove(this._obj);
    this._obj = object;
    if (object) this.scene.add(object);
  }

  focus(box, padding = 1.5) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.target.copy(center);
    this.distance = Math.max(4, size.length() * 0.62 * padding);
  }

  bindDrag(canvas, { onZoom = true } = {}) {
    const off = [];
    const on = (t, fn, o) => {
      canvas.addEventListener(t, fn, o);
      off.push([t, fn, o]);
    };
    let last = null;
    on('pointerdown', (e) => {
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    });
    on('pointermove', (e) => {
      if (!this.dragging || !last) return;
      this.yaw -= (e.clientX - last.x) * 0.008;
      this.pitch = Math.max(-0.6, Math.min(1.2, this.pitch + (e.clientY - last.y) * 0.006));
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => {
      this.dragging = false;
      last = null;
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('pointerleave', end);
    if (onZoom) on('wheel', (e) => { this.distance = Math.max(1.6, Math.min(60, this.distance + e.deltaY * 0.006)); e.preventDefault(); }, { passive: false });
    this._off = () => off.forEach(([t, fn, o]) => canvas.removeEventListener(t, fn, o));
    return this;
  }

  renderTo(canvas, { autoRotateSpeed = 0.35, dt = 0.016, bg = null } = {}) {
    const w = Math.max(2, canvas.clientWidth || canvas.width);
    const h = Math.max(2, canvas.clientHeight || canvas.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    if (this.autoRotate && !this.dragging) this.yaw += autoRotateSpeed * dt;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * this.distance * cp,
      this.target.y + this.distance * Math.sin(this.pitch) + 0.4,
      this.target.z + Math.cos(this.yaw) * this.distance * cp
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);

    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(bg || 0x000000, bg ? 1 : 0);
    this.renderer.render(this.scene, this.camera);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  dispose() {
    this._off?.();
    if (this._obj) this.scene.remove(this._obj);
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => mm?.dispose?.());
      }
    });
  }
}

