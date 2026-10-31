/**
 * GIMVERSE — звук. Синтезируется Web Audio API, внешних файлов нет.
 */
import { store } from './store.js';

let ctx = null;
let master = null;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = store.settings.sound ? store.settings.volume : 0;
  master.connect(ctx.destination);
  return ctx;
}

export function syncVolume() {
  if (!master) return;
  const s = store.settings;
  master.gain.setTargetAtTime(s.sound ? s.volume : 0, ctx.currentTime, 0.05);
}

function tone({ freq = 440, type = 'sine', dur = 0.16, gain = 0.2, slide = 0, delay = 0, attack = 0.008 }) {
  const c = ensure();
  if (!c) return;
  const s = store.settings;
  if (!s.sound || s.volume <= 0) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.2, gain = 0.16, filter = 900, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const s = store.settings;
  if (!s.sound || s.volume <= 0) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bq = c.createBiquadFilter();
  bq.type = 'lowpass';
  bq.frequency.value = filter;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bq).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  click: () => tone({ freq: 620, type: 'triangle', dur: 0.07, gain: 0.1 }),
  tap: () => tone({ freq: 420, type: 'sine', dur: 0.05, gain: 0.07 }),
  jump: () => tone({ freq: 320, slide: 260, type: 'square', dur: 0.16, gain: 0.1 }),
  land: () => noise({ dur: 0.09, gain: 0.08, filter: 500 }),
  coin: () => {
    tone({ freq: 880, type: 'triangle', dur: 0.09, gain: 0.12 });
    tone({ freq: 1320, type: 'triangle', dur: 0.14, gain: 0.1, delay: 0.07 });
  },
  hurt: () => {
    tone({ freq: 200, slide: -120, type: 'sawtooth', dur: 0.28, gain: 0.13 });
    noise({ dur: 0.18, gain: 0.08, filter: 700 });
  },
  die: () => {
    tone({ freq: 300, slide: -220, type: 'sawtooth', dur: 0.5, gain: 0.14 });
    noise({ dur: 0.4, gain: 0.1, filter: 420 });
  },
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.24, gain: 0.13, delay: i * 0.11 }));
  },
  checkpoint: () => {
    tone({ freq: 660, type: 'sine', dur: 0.12, gain: 0.11 });
    tone({ freq: 990, type: 'sine', dur: 0.18, gain: 0.09, delay: 0.1 });
  },
  msg: () => tone({ freq: 720, type: 'sine', dur: 0.09, gain: 0.07 }),
  error: () => tone({ freq: 180, type: 'square', dur: 0.2, gain: 0.1 }),
  buy: () => {
    tone({ freq: 700, type: 'triangle', dur: 0.1, gain: 0.12 });
    tone({ freq: 1050, type: 'triangle', dur: 0.16, gain: 0.1, delay: 0.09 });
  },
  power: () => tone({ freq: 240, slide: 700, type: 'sawtooth', dur: 0.32, gain: 0.1 }),
  ui: () => tone({ freq: 500, type: 'sine', dur: 0.06, gain: 0.06 }),
};

export function unlockAudio() {
  ensure();
  syncVolume();
}

window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
