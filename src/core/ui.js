/**
 * GIMVERSE — DOM-утилиты, тосты, модальные окна, форматирование.
 */

/** Гиперскрипт: h('div.card', {onclick}, children...) */
export function h(spec, props = {}, ...children) {
  // второй аргумент может быть не объектом свойств, а сразу дочерним узлом
  if (props == null || Array.isArray(props) || typeof props !== 'object' || typeof props.nodeType === 'number') {
    children.unshift(props);
    props = {};
  }
  const [tagPart, ...classParts] = String(spec).split('.');
  const [tag, ...rest] = (tagPart || 'div').split('#');
  const node = document.createElement(tag || 'div');
  const classes = [...classParts, ...rest.filter(Boolean)];
  const attrs = props || {};
  if (attrs.class) classes.push(...String(attrs.class).split(/\s+/));
  if (classes.length) node.className = classes.filter(Boolean).join(' ');
  if (attrs.id) node.id = attrs.id;

  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class' || k === 'id' || v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const c of children.flat(6)) {
    if (c == null || c === false || c === true) continue;
    parent.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- тосты ---------------- */

const ICONS = { info: 'ℹ️', ok: '✅', err: '⛔', warn: '⚠️' };

export function toast(text, kind = 'info', ms = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = h('div.toast.' + (kind === 'info' ? '' : kind), h('span.em', ICONS[kind] || 'ℹ️'), h('div', text));
  root.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 260);
  }, ms);
  while (root.children.length > 4) root.firstChild.remove();
  return node;
}

/* ---------------- модальные окна ---------------- */

let openModals = 0;

export function modal({ title, body, actions = [], wide = false, onClose, subtitle }) {
  const root = document.getElementById('modal-root');
  const backdrop = h('div.backdrop');
  const close = (result) => {
    backdrop.remove();
    openModals--;
    document.body.classList.toggle('modal-open', openModals > 0);
    onClose?.(result);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(null);
  });

  const card = h('div.modal' + (wide ? '.wide' : ''));
  const head = h(
    'div.modal-head',
    h('div', h('h2', title), subtitle ? h('div.small.dim', subtitle) : null),
    h('div.spacer'),
    h('button.btn.icon.ghost', { onclick: () => close(null), title: 'Закрыть', 'aria-label': 'Закрыть' }, '✕')
  );
  card.appendChild(head);
  const bodyNode = h('div.modal-body');
  append(bodyNode, [body]);
  card.appendChild(bodyNode);
  if (actions.length) {
    const foot = h('div.modal-foot');
    for (const a of actions) {
      foot.appendChild(
        h(
          `button.btn.${a.variant || 'soft'}`,
          {
            onclick: () => {
              const r = a.onClick?.(close, card);
              if (a.keepOpen !== true && r !== false) close(a.value ?? true);
            },
          },
          a.label
        )
      );
    }
    card.appendChild(foot);
  }
  backdrop.appendChild(card);
  root.appendChild(backdrop);
  openModals++;
  document.body.classList.add('modal-open');

  const onKey = (e) => {
    if (e.key === 'Escape') {
      close(null);
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  return { close, card, body: bodyNode };
}

export function confirmDialog({ title = 'Подтвердите', text = '', ok = 'Да', cancel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: h('p.muted', { style: { margin: 0 } }, text),
      actions: [
        { label: cancel, onClick: () => (done = true) || resolve(false) },
        {
          label: ok,
          variant: danger ? 'danger' : 'primary',
          onClick: () => (done = true) || resolve(true),
        },
      ],
      onClose: () => !done && resolve(false),
    });
    void m;
  });
}

export function promptDialog({ title = 'Введите', text = '', value = '', placeholder = '', ok = 'ОК', multiline = false }) {
  return new Promise((resolve) => {
    const input = multiline
      ? h('textarea.input', { rows: 4, placeholder })
      : h('input.input', { value, placeholder });
    if (!multiline) input.value = value;
    let done = false;
    modal({
      title,
      body: [text ? h('p.muted', { style: { margin: 0 } }, text) : null, input],
      actions: [
        { label: 'Отмена', onClick: () => (done = true) || resolve(null) },
        {
          label: ok,
          variant: 'primary',
          onClick: () => {
            done = true;
            const v = input.value.trim();
            resolve(v || null);
          },
        },
      ],
      onClose: () => !done && resolve(null),
    });
    setTimeout(() => input.focus(), 60);
  });
}

/* ---------------- формат ---------------- */

export const fmtNum = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} сек назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

export function fmtTime(sec) {
  if (!isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/* ---------------- файлы и буфер ---------------- */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

export function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      const f = input.files?.[0] || null;
      input.remove();
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, size: f.size, text: String(reader.result || '') });
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Читает картинку и ужимает её в dataURL нужного размера. */
export function fileToImage(file, max = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * k));
        canvas.height = Math.max(1, Math.round(img.height * k));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
