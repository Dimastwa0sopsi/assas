/**
 * GIMVERSE — ввод: клавиатура (раскладко-независимо, по e.code), мышь, тач-джойстик.
 * Один экземпляр на игровой контекст, чтобы экраны не дрались за события.
 */
import { isTouch } from './ui.js';

export const KEY_HINTS = {
  forward: 'W',
  back: 'S',
  left: 'A',
  right: 'D',
  jump: 'Пробел',
  run: 'Shift',
  reset: 'R',
  pause: 'Esc',
  chat: 'T',
  emote: 'E',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.axis = { x: 0, y: 0 }; // тач-джойстик: -1..1
    this.look = { dx: 0, dy: 0 }; // накопленный обзор за кадр
    this.wheel = 0;
    this.jumpQueued = false;
    this.anyKey = false;
    this.pointerDown = false;
    this.locked = false;
    this.target = null;
    this._handlers = [];
  }

  attach(target = window) {
    this.target = target;
    const on = (obj, type, fn, opts) => {
      obj.addEventListener(type, fn, opts);
      this._handlers.push([obj, type, fn, opts]);
    };

    on(window, 'keydown', (e) => {
      if (e.repeat) {
        if (e.code === 'Space') this.jumpQueued = true;
        return;
      }
      this.keys.add(e.code);
      this.anyKey = true;
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => {
      this.keys.clear();
      this.axis.x = this.axis.y = 0;
    });

    // обзор мышью: перетаскивание по канвасу
    on(window, 'pointerdown', (e) => {
      if (e.target !== this.canvas && !this.locked) return;
      this.pointerDown = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._pid = e.pointerId;
    });
    on(window, 'pointermove', (e) => {
      if (this.locked) {
        this.look.dx += e.movementX || 0;
        this.look.dy += e.movementY || 0;
        return;
      }
      if (!this.pointerDown || e.pointerId !== this._pid) return;
      this.look.dx += e.clientX - (this._lastX ?? e.clientX);
      this.look.dy += e.clientY - (this._lastY ?? e.clientY);
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    on(window, 'pointerup', () => {
      this.pointerDown = false;
      this._pid = null;
    });
    on(window, 'pointercancel', () => {
      this.pointerDown = false;
      this._pid = null;
    });
    on(window, 'wheel', (e) => (this.wheel += e.deltaY), { passive: true });
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    return this;
  }

  /** Канвас, на котором работает обзор/pointer lock. */
  setCanvas(canvas) {
    this.canvas = canvas;
    return this;
  }

  detach() {
    for (const [obj, type, fn, opts] of this._handlers) obj.removeEventListener(type, fn, opts);
    this._handlers = [];
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  get forward() {
    return this.down('KeyW') || this.down('ArrowUp') || this.axis.y < -0.2;
  }
  get back() {
    return this.down('KeyS') || this.down('ArrowDown') || this.axis.y > 0.2;
  }
  get left() {
    return this.down('KeyA') || this.down('ArrowLeft') || this.axis.x < -0.2;
  }
  get right() {
    return this.down('KeyD') || this.down('ArrowRight') || this.axis.x > 0.2;
  }
  get run() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }
  get moveX() {
    const k = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    return Math.abs(this.axis.x) > 0.2 ? this.axis.x : k;
  }
  get moveZ() {
    const k = (this.back ? 1 : 0) - (this.forward ? 1 : 0);
    return Math.abs(this.axis.y) > 0.2 ? this.axis.y : k;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** Возвращает приращение обзора и сбрасывает его. */
  consumeLook(invertY = false) {
    const dx = this.look.dx;
    const dy = this.look.dy * (invertY ? -1 : 1);
    this.look.dx = 0;
    this.look.dy = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  reset() {
    this.keys.clear();
    this.axis.x = this.axis.y = 0;
    this.look.dx = this.look.dy = 0;
    this.jumpQueued = false;
  }
}

/** Тач-джойстик + кнопки (показывается только на тач-устройствах). */
export function mountTouchControls(root, input, { onJump, onAction } = {}) {
  const knob = document.createElement('div');
  knob.className = 'knob';
  const joy = document.createElement('div');
  joy.className = 'joy';
  joy.appendChild(knob);

  let pid = null;
  let cx = 0;
  let cy = 0;
  const R = 44;

  const move = (x, y) => {
    let dx = x - cx;
    let dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.axis.x = dx / R;
    input.axis.y = dy / R;
  };

  joy.addEventListener('pointerdown', (e) => {
    pid = e.pointerId;
    const r = joy.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    joy.setPointerCapture(pid);
    move(e.clientX, e.clientY);
    e.preventDefault();
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    move(e.clientX, e.clientY);
    e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    input.axis.x = 0;
    input.axis.y = 0;
    knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);

  const jumpBtn = document.createElement('button');
  jumpBtn.textContent = 'ПРЫЖОК';
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.jumpQueued = true;
    onJump?.();
  });

  const actBtn = document.createElement('button');
  actBtn.textContent = 'ДЕЙСТВИЕ';
  actBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onAction?.();
  });

  const wrap = document.createElement('div');
  wrap.className = 'touch-controls';
  const btns = document.createElement('div');
  btns.className = 'touch-btns';
  btns.appendChild(actBtn);
  btns.appendChild(jumpBtn);
  wrap.appendChild(joy);
  wrap.appendChild(btns);
  root.appendChild(wrap);
  if (isTouch()) document.body.classList.add('touch');
  return wrap;
}
