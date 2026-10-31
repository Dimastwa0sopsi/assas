/**
 * Минимальное DOM-окружение для тестов интерфейса (jsdom + заглушки canvas/WebSocket).
 */
import { JSDOM } from 'jsdom';

export const sentMessages = [];

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toast-root"></div><div id="modal-root"></div><div id="game-root" hidden></div></body></html>', {
    url: 'https://gimverse.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // --- canvas 2D ---
  const ctx2d = () => {
    const noop = () => {};
    const handler = {
      get(target, prop) {
        if (prop === 'measureText') return () => ({ width: 42 });
        if (prop === 'canvas') return target.canvas;
        if (prop in target) return target[prop];
        return noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    };
    const base = {
      canvas: null,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '10px sans-serif',
      globalAlpha: 1,
      textBaseline: 'alphabetic',
    };
    return new Proxy(base, handler);
  };

  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') {
      if (!this.__ctx) {
        this.__ctx = ctx2d();
        this.__ctx.canvas = this;
      }
      return this.__ctx;
    }
    return null;
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,STUB';
  window.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  window.HTMLCanvasElement.prototype.releasePointerCapture = function () {};
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { value: 600, configurable: true });

  // --- прочее ---
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  window.navigator.vibrate = () => {};
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async () => true, readText: async () => '{"version":2,"items":[]}' },
    configurable: true,
  });

  // --- WebSocket ---
  class FakeWebSocket {
    static instances = [];
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      FakeWebSocket.instances.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.({});
      }, 0);
    }
    send(data) {
      this.sent.push(data);
      sentMessages.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
    /** Имитация ответа сервера. */
    emit(obj) {
      this.onmessage?.({ data: JSON.stringify(obj) });
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;
  window.WebSocket = FakeWebSocket;

  // --- глобалы ---
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
  globalThis.Image = window.Image;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.WebSocket = FakeWebSocket;
  globalThis.matchMedia = window.matchMedia;
  globalThis.ResizeObserver = window.ResizeObserver;
  globalThis.Blob = window.Blob;
  globalThis.FileReader = window.FileReader;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  for (const ev of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[ev] = window[ev].bind(window);
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.confirm = () => true;
  globalThis.alert = () => {};

  return { window, dom, FakeWebSocket };
}
