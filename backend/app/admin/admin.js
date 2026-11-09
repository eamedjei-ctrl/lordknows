/* =========================================================================
   Lord Knows — admin dashboard
   Plain JS, no build step. Talks to /api/auth/* and /api/admin/*.
   All user text goes into the page through textContent (the h() helper),
   never as HTML.
   ========================================================================= */

// ------------------------------------------------------------------ basics
const TONES = { ink: '#151413', red: '#aa201b', flame: '#c2412d', green: '#08ba64', pink: '#d981a5', gold: '#d9a85b' };
const TONE_NAMES = { ink: 'Ink', red: 'College red', flame: 'Scarlet', green: 'Club green', pink: 'Club pink', gold: 'Feather gold' };
const ON_DARK = new Set(['green', 'pink', 'gold']);
const APPAREL = ['S', 'M', 'L', 'XL', '2XL'];

const app = document.getElementById('app');
const state = { me: null, csrf: '' };
let dirty = false;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function toast(msg, err = false) {
  const t = h('div', { class: 'toast' + (err ? ' toast--err' : '') }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), err ? 6000 : 2800);
}

class ApiError extends Error {}

async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') opts.headers['X-CSRF-Token'] = state.csrf;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  if (res.status === 401 && !path.startsWith('/api/auth/login')) { state.me = null; renderLogin(); throw new ApiError('Please sign in again.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let d = data.detail;
    if (Array.isArray(d)) d = d.map((e) => `${(e.loc || []).filter((x) => x !== 'body').join(' › ') || 'Input'}: ${e.msg}`).join('\n');
    throw new ApiError(d || `Something went wrong (${res.status}).`);
  }
  return data;
}

// run an async action from a button, showing errors as toasts
async function act(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message || String(e), true);
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// smallest image variant at least `w` wide
function pick(m, w = 240) {
  if (!m || !m.variants) return '';
  const sizes = Object.keys(m.variants).map(Number).sort((a, b) => a - b);
  const best = sizes.find((s) => s >= w) ?? sizes[sizes.length - 1];
  return m.variants[String(best)];
}

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
const swatch = (tone) => h('span', { class: 'swatch', style: { background: TONES[tone] || TONES.ink } });

function setDirty(v = true) {
  dirty = v;
  const s = document.querySelector('.savebar .state');
  if (s) { s.textContent = v ? 'Unsaved changes' : 'All changes saved'; s.classList.toggle('is-dirty', v); }
}
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// in-page confirm (no browser dialogs)
function confirmBox(message, okLabel = 'Delete', danger = true) {
  return new Promise((resolve) => {
    const d = h('dialog', { class: 'modal modal--small' },
      h('div', { class: 'modal-body' }, h('p', { style: { margin: 0, whiteSpace: 'pre-line' } }, message)),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => close(false) }, 'Cancel'),
        h('button', { class: danger ? 'btn btn--danger' : 'btn', type: 'button', onclick: () => close(true) }, okLabel)));
    const close = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    document.body.append(d);
    d.showModal();
  });
}

// drag-to-reorder for rows with data-id; calls onOrder(ids) after a drop
function sortable(container, onOrder) {
  let dragged = null;
  let before = '';
  const ids = () => [...container.querySelectorAll('[data-id]')].map((el) => Number(el.dataset.id));
  container.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('[data-id]');
    if (!dragged) return;
    before = ids().join();
    dragged.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const over = e.target.closest('[data-id]');
    if (!over || over === dragged) return;
    const r = over.getBoundingClientRect();
    over.parentNode.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
  });
  container.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged = null;
    if (ids().join() !== before) onOrder(ids());
  });
}

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

// ------------------------------------------------------------------ media picker
let mediaCache = null;
async function loadMedia(force = false) {
  if (!mediaCache || force) mediaCache = await api('GET', '/api/admin/media');
  return mediaCache;
}

async function uploadFiles(files, { frame = null, alt = '' } = {}) {
  const out = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('alt', alt);
    if (frame) fd.append('frame', frame);
    toast(`Uploading ${f.name}…`);
    out.push(await api('POST', '/api/admin/media', fd));
  }
  await loadMedia(true);
  return out;
}

// opens the library; resolves to a media id, or null if closed
function pickMedia({ title = 'Choose an image', frame = null } = {}) {
  return new Promise(async (resolve) => {
    let chosen = null;
    const grid = h('div', { class: 'mgrid' });
    const frameBox = h('input', { type: 'checkbox', checked: frame === 'look' });
    const input = h('input', { type: 'file', accept: 'image/*', class: 'sr', multiple: true, onchange: async () => {
      const up = await act(null, () => uploadFiles([...input.files], { frame: frameBox.checked ? 'look' : null }), 'Uploaded');
      input.value = '';
      if (up?.length) { chosen = up[up.length - 1].id; draw(); }
    } });
    const useBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => close(chosen) }, 'Use this image');
    const draw = async () => {
      const media = await loadMedia();
      grid.replaceChildren(...media.map((m) => h('button', {
        type: 'button', class: 'mcard', 'aria-pressed': String(m.id === chosen),
        onclick: () => { chosen = m.id; draw(); }, ondblclick: () => close(m.id),
      }, h('img', { src: pick(m, 240), alt: '', loading: 'lazy' }), h('span', { class: 'cap' }, m.alt || m.filename || m.key || `Image ${m.id}`))));
      useBtn.disabled = chosen == null;
    };
    const d = h('dialog', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h2', null, title),
        h('div', { class: 'row' },
          h('label', { class: 'check small' }, frameBox, 'Fit into runway frame (9:16)'),
          h('label', { class: 'btn btn--ghost btn--sm' }, 'Upload…', input),
          useBtn,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close(null) }, '×'))),
      h('div', { class: 'modal-body' }, h('p', { class: 'muted small', style: { margin: 0 } }, 'Click to select, double-click to use. New uploads are resized for the web automatically.'), grid));
    const close = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(d);
    d.showModal();
    draw();
  });
}

function imageField(label, get, set, { frame = null, hint, optional = false } = {}) {
  const wrap = h('div', { class: 'field' });
  const draw = async () => {
    const media = byId(await loadMedia());
    const m = media[get()];
    wrap.replaceChildren(h('span', null, label),
      h('div', { class: 'img-field' },
        m ? h('img', { src: pick(m, 240), alt: '' }) : h('div', { class: 'ph' }, 'No image'),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => {
            const id = await pickMedia({ title: label, frame });
            if (id != null) { set(id); setDirty(); draw(); }
          } }, m ? 'Change' : 'Choose'),
          optional && m ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { set(null); setDirty(); draw(); } }, 'Remove') : null)),
      hint ? h('span', { class: 'hint' }, hint) : null);
  };
  draw();
  return wrap;
}

// ------------------------------------------------------------------ login
function renderLogin(message = '') {
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const err = h('p', { class: 'error', role: 'alert' }, message);
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/login', { email: email.value, password: password.value });
      state.me = r.user; state.csrf = r.csrf;
      route();
    } catch (ex) {
      err.textContent = ex.message;
      password.select();
    } finally { btn.disabled = false; }
  } },
  h('div', null, h('div', { class: 'brand' }, 'Lord Knows'), h('p', { class: 'muted', style: { margin: 0 } }, 'Sign in to manage the site.')),
  field('Email', email), field('Password', password), err, btn);
  app.replaceChildren(h('div', { class: 'login' }, form));
  email.focus();
}

// ------------------------------------------------------------------ shell + router
const NAV = [
  ['#/looks', 'Looks', TONES.red],
  ['#/products', 'Products', TONES.gold],
  ['#/lines', 'Product lines', TONES.green],
  ['#/pages', 'Page sections', TONES.pink],
  ['#/media', 'Media library', TONES.flame],
  ['#/users', 'Users', TONES.ink],
  ['#/account', 'My account', TONES.ink],
];

function shell(content) {
  const hash = location.hash || '#/looks';
  app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, 'Lord Knows'),
      h('div', { class: 'brand-sub kicker' }, 'Admin'),
      h('nav', { class: 'nav', 'aria-label': 'Admin' }, NAV.map(([href, label, c]) =>
        h('a', { href, 'aria-current': hash.startsWith(href) ? 'page' : null }, h('span', { class: 'dot', style: { background: c } }), label))),
      h('div', { class: 'side-foot' },
        h('a', { class: 'btn btn--ghost btn--sm', href: '/', target: '_blank', rel: 'noopener' }, 'View site ↗'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: logout }, 'Sign out'),
        h('span', { class: 'muted small' }, state.me?.email))),
    h('main', { class: 'main' }, content)));
}

async function logout() {
  if (dirty && !(await confirmBox('You have unsaved changes. Sign out anyway?', 'Sign out'))) return;
  setDirty(false);
  await api('POST', '/api/auth/logout').catch(() => {});
  state.me = null; state.csrf = '';
  renderLogin();
}

const ROUTES = [
  [/^#\/looks\/new$/, () => lookEditor(null)],
  [/^#\/looks\/(\d+)$/, (m) => lookEditor(Number(m[1]))],
  [/^#\/looks$/, looksList],
  [/^#\/products\/new$/, () => productEditor(null)],
  [/^#\/products\/(\d+)$/, (m) => productEditor(Number(m[1]))],
  [/^#\/products$/, productsList],
  [/^#\/lines$/, linesPage],
  [/^#\/pages\/(\w+)$/, (m) => sectionEditor(m[1])],
  [/^#\/pages$/, pagesList],
  [/^#\/media$/, mediaPage],
  [/^#\/users$/, usersPage],
  [/^#\/account$/, accountPage],
];

let lastHash = location.hash;
let skipNext = false;
window.addEventListener('hashchange', async () => {
  if (skipNext) { skipNext = false; return; }
  if (dirty && !(await confirmBox('You have unsaved changes. Leave without saving?', 'Leave'))) {
    skipNext = true;
    location.hash = lastHash;
    return;
  }
  setDirty(false);
  route();
});

async function route() {
  if (!state.me) {
    try {
      const r = await api('GET', '/api/auth/me');
      state.me = r.user; state.csrf = r.csrf;
    } catch { return; } // api() already showed the login
  }
  if (!location.hash || location.hash === '#/') { location.replace('#/looks'); return; }
  lastHash = location.hash;
  for (const [re, view] of ROUTES) {
    const m = location.hash.match(re);
    if (m) {
      shell(h('p', { class: 'muted' }, 'Loading…'));
      try { await view(m); } catch (e) { if (!(e instanceof ApiError) || state.me) shell(h('div', { class: 'panel' }, h('p', { class: 'error' }, e.message))); }
      return;
    }
  }
  location.replace('#/looks');
}

function header(title, sub, ...actions) {
  return h('div', { class: 'head' },
    h('div', { class: 'stack' }, h('h1', null, title), sub ? h('p', { class: 'muted', style: { margin: 0 } }, sub) : null),
    h('div', { class: 'row' }, actions));
}

function saveBar(onSave, extra = []) {
  const btn = h('button', { class: 'btn', type: 'button' }, 'Save');
  btn.addEventListener('click', () => onSave(btn));
  return h('div', { class: 'savebar' }, btn, ...extra, h('span', { class: 'spacer' }), h('span', { class: 'state' }, 'All changes saved'));
}

// ================================================================== LOOKS
async function looksList() {
  const [looks, products, media] = await Promise.all([api('GET', '/api/admin/looks'), api('GET', '/api/admin/products'), loadMedia()]);
  const M = byId(media);
  const list = h('div', { class: 'list' }, looks.map((lk, i) => h('a', { class: 'item', href: `#/looks/${lk.id}`, 'data-id': lk.id, draggable: 'true' },
    h('span', { class: 'handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, '⋮⋮'),
    h('img', { class: 'thumb thumb--tall', src: pick(M[lk.image_id], 240), alt: '' }),
    h('div', null,
      h('div', { class: 'title' }, `${String(i + 1).padStart(2, '0')}  ${lk.name}`),
      h('div', { class: 'meta row' }, swatch(lk.tone), [TONE_NAMES[lk.tone], `${lk.items.length} piece${lk.items.length === 1 ? '' : 's'}`, lk.rack ? 'garment display' : ''].filter(Boolean).join(' · '))),
    lk.published ? h('span', { class: 'badge' }, 'Live') : h('span', { class: 'badge badge--off' }, 'Hidden'))));
  sortable(list, (ids) => act(null, () => api('PUT', '/api/admin/looks/order', { ids }).then(() => route()), 'Order saved'));
  shell([
    header('Looks', 'The runway, in order. Drag to reorder; open a look to change its photo, colour and pins.',
      h('a', { class: 'btn', href: '#/looks/new' }, '+ New look')),
    looks.length ? list : h('div', { class: 'panel empty' }, 'No looks yet.'),
    products.length ? null : h('p', { class: 'muted' }, 'Add products first: a look is made of products.'),
  ]);
}

async function lookEditor(id) {
  const [products, media] = await Promise.all([api('GET', '/api/admin/products'), loadMedia()]);
  const P = byId(products);
  const look = id ? await api('GET', `/api/admin/looks/${id}`)
    : { name: '', tone: 'ink', rack: false, published: true, image_id: null, items: [] };
  let active = look.items.findIndex((it) => !it.pin);
  if (active < 0) active = look.items.length ? 0 : -1;

  const stage = h('div', { class: 'stage' });
  const hint = h('p', { class: 'stage-hint' });
  const pieces = h('div', { class: 'pieces' });
  const toneRow = h('div', { class: 'tones', role: 'group', 'aria-label': 'Look colour' });

  const pct = (e) => {
    const r = stage.getBoundingClientRect();
    const c = (v) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    return [c(((e.clientX - r.left) / r.width) * 100), c(((e.clientY - r.top) / r.height) * 100)];
  };

  function drawStage() {
    stage.style.setProperty('--tone', TONES[look.tone]);
    stage.style.setProperty('--on-tone', ON_DARK.has(look.tone) ? TONES.ink : '#fff');
    const m = byId(mediaCache || media)[look.image_id];
    stage.replaceChildren(
      m ? h('img', { src: pick(m, 640), alt: '' }) : h('div', { class: 'none' }, 'Choose a photo for this look (a 9:16 cut-out works best).'),
      ...look.items.map((it, i) => it.pin ? h('button', {
        type: 'button', class: 'pin' + (i === active ? ' is-active' : ''), style: { left: `${it.pin[0]}%`, top: `${it.pin[1]}%` },
        'aria-label': `Pin ${i + 1}: ${P[it.product_id]?.name || ''}. Drag to move.`, 'data-i': i,
      }, String(i + 1)) : null));
    hint.textContent = active >= 0 && look.items[active]
      ? (look.items[active].pin ? `Drag pin ${active + 1} to move it, or click the photo to put it somewhere else.` : `Click the photo where piece ${active + 1} sits to pin it.`)
      : 'Add a piece, then click the photo to pin it.';
  }

  // click to place, drag to move
  let dragI = null;
  stage.addEventListener('pointerdown', (e) => {
    const pin = e.target.closest('.pin');
    if (pin) { dragI = Number(pin.dataset.i); active = dragI; stage.setPointerCapture(e.pointerId); drawPieces(); drawStage(); return; }
    if (!look.image_id || active < 0 || !look.items[active]) return;
    look.items[active].pin = pct(e);
    setDirty();
    // move on to the next unpinned piece
    const next = look.items.findIndex((it) => !it.pin);
    if (next >= 0) active = next;
    drawStage(); drawPieces();
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragI == null) return;
    look.items[dragI].pin = pct(e);
    setDirty();
    const el = stage.querySelector(`.pin[data-i="${dragI}"]`);
    if (el) { el.style.left = `${look.items[dragI].pin[0]}%`; el.style.top = `${look.items[dragI].pin[1]}%`; }
  });
  const endDrag = () => { if (dragI != null) { dragI = null; drawPieces(); } };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function drawPieces() {
    pieces.replaceChildren(...look.items.map((it, i) => {
      const sel = h('select', { 'aria-label': `Piece ${i + 1}`, onchange: () => { it.product_id = Number(sel.value); setDirty(); drawStage(); } },
        products.map((p) => h('option', { value: p.id, selected: p.id === it.product_id }, `${p.name} — ${p.meta}${p.published ? '' : ' (hidden)'}`)));
      return h('div', { class: 'piece' + (i === active ? ' is-active' : ''), onclick: (e) => { if (e.target.closest('button, select')) return; active = i; drawPieces(); drawStage(); } },
        h('span', { class: 'n', style: it.pin ? { background: TONES[look.tone], color: ON_DARK.has(look.tone) ? TONES.ink : '#fff' } : null }, String(i + 1)),
        h('div', null, sel, h('div', { class: 'pinned' }, it.pin ? `Pinned at ${it.pin[0]}%, ${it.pin[1]}%` : 'Not pinned: listed in the look only')),
        h('div', { class: 'acts' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { active = i; drawPieces(); drawStage(); } }, it.pin ? 'Move pin' : 'Place pin'),
          it.pin ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { it.pin = null; setDirty(); drawPieces(); drawStage(); } }, 'Unpin') : null,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { move(look.items, i, -1); active = i - 1; setDirty(); drawPieces(); drawStage(); } }, '↑'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === look.items.length - 1, onclick: () => { move(look.items, i, 1); active = i + 1; setDirty(); drawPieces(); drawStage(); } }, '↓'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove piece', onclick: () => { look.items.splice(i, 1); active = Math.min(active, look.items.length - 1); setDirty(); drawPieces(); drawStage(); } }, '×')));
    }));
  }

  function drawTones() {
    toneRow.replaceChildren(...Object.entries(TONES).map(([k, c]) => h('button', {
      type: 'button', class: 'tone', style: { background: c }, title: TONE_NAMES[k], 'aria-label': TONE_NAMES[k], 'aria-pressed': String(look.tone === k),
      onclick: () => { look.tone = k; setDirty(); drawTones(); drawStage(); drawPieces(); },
    })));
  }

  const name = h('input', { type: 'text', value: look.name, maxlength: 160, oninput: () => { look.name = name.value; setDirty(); } });
  const rack = h('input', { type: 'checkbox', checked: look.rack, onchange: () => { look.rack = rack.checked; setDirty(); } });
  const pub = h('input', { type: 'checkbox', checked: look.published, onchange: () => { look.published = pub.checked; setDirty(); } });
  const addPiece = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: !products.length, onclick: () => {
    look.items.push({ product_id: products[0].id, pin: null });
    active = look.items.length - 1;
    setDirty(); drawPieces(); drawStage();
  } }, '+ Add piece');

  const save = (btn) => act(btn, async () => {
    if (!look.name.trim()) throw new Error('Give the look a name.');
    if (!look.image_id) throw new Error('Choose a photo for the look.');
    if (!look.items.length) throw new Error('Add at least one piece.');
    const body = { name: look.name.trim(), tone: look.tone, rack: look.rack, published: look.published, image_id: look.image_id, items: look.items };
    const saved = id ? await api('PATCH', `/api/admin/looks/${id}`, body) : await api('POST', '/api/admin/looks', body);
    setDirty(false);
    if (!id) { location.hash = `#/looks/${saved.id}`; }
  }, 'Look saved');

  const del = id ? h('button', { class: 'btn btn--danger', type: 'button', onclick: async (e) => {
    if (!(await confirmBox(`Delete the look “${look.name}”? The products stay in the shop.`))) return;
    await act(e.target, () => api('DELETE', `/api/admin/looks/${id}`), 'Look deleted');
    setDirty(false);
    location.hash = '#/looks';
  } }, 'Delete look') : null;

  shell([
    header(id ? look.name || 'Look' : 'New look', 'Click the photo to pin each piece where it sits.', h('a', { class: 'btn btn--ghost', href: '#/looks' }, '← All looks')),
    h('div', { class: 'editor' },
      h('div', { class: 'stage-wrap' }, stage, hint),
      h('div', { class: 'stack' },
        h('div', { class: 'panel stack' },
          field('Name', name),
          h('div', { class: 'field' }, h('span', null, 'Colour'), toneRow, h('span', { class: 'hint' }, 'Tints the pins, buttons and progress bar while this look is on screen.')),
          imageField('Photo', () => look.image_id, (v) => { look.image_id = v; drawStage(); }, { frame: 'look', hint: 'Upload with “Fit into runway frame” on so the figure stands on the floor line.' }),
          h('div', { class: 'row' }, h('label', { class: 'check' }, rack, 'Garment display (no model; no floor shadow)')),
          h('div', { class: 'row' }, h('label', { class: 'check' }, pub, 'Show on the site'))),
        h('div', { class: 'panel stack' },
          h('div', { class: 'row' }, h('h2', null, 'Pieces in this look'), h('span', { class: 'spacer' }), addPiece),
          pieces)),
    ),
    saveBar(save, [del]),
  ]);
  drawTones(); drawStage(); drawPieces();
}

// ================================================================== PRODUCTS
async function productsList() {
  const [products, lines, media] = await Promise.all([api('GET', '/api/admin/products'), api('GET', '/api/admin/lines'), loadMedia()]);
  const M = byId(media);
  const L = byId(lines);
  let filter = 'all';
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'filters' });
  const draw = () => {
    chips.replaceChildren(...[['all', 'All', null], ...lines.map((l) => [String(l.id), l.label, l.tone])].map(([k, label, tone]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === k), onclick: () => { filter = k; draw(); } }, tone ? swatch(tone) : null, label)));
    const shown = products.filter((p) => filter === 'all' || String(p.line_id) === filter);
    list.replaceChildren(...shown.map((p) => h('a', { class: 'item', href: `#/products/${p.id}`, 'data-id': p.id, draggable: filter === 'all' ? 'true' : 'false' },
      h('span', { class: 'handle', 'aria-hidden': 'true', style: filter === 'all' ? null : { visibility: 'hidden' } }, '⋮⋮'),
      h('img', { class: 'thumb', src: pick(M[p.thumb_id] || M[p.image_id], 240), alt: '' }),
      h('div', null,
        h('div', { class: 'title' }, p.name),
        h('div', { class: 'meta row' }, swatch(L[p.line_id]?.tone), [L[p.line_id]?.label, p.meta, p.price != null ? Number(p.price).toFixed(2) : 'No price'].filter(Boolean).join(' · '))),
      p.published ? h('span', { class: 'badge' }, 'Live') : h('span', { class: 'badge badge--off' }, 'Hidden'))));
    if (!shown.length) list.replaceChildren(h('div', { class: 'empty' }, 'No products here yet.'));
  };
  sortable(list, (ids) => filter === 'all' && act(null, () => api('PUT', '/api/admin/products/order', { ids }).then(() => route()), 'Order saved'));
  draw();
  shell([
    header('Products', 'Everything in The Collection, in shop order. Drag to reorder (with “All” selected).',
      h('a', { class: 'btn', href: '#/products/new' }, '+ New product')),
    chips, list,
  ]);
}

async function productEditor(id) {
  const [lines, content] = await Promise.all([api('GET', '/api/admin/lines'), api('GET', '/api/admin/content/site')]);
  if (!lines.length) { shell([header('New product'), h('div', { class: 'panel' }, 'Create a product line first (', h('a', { href: '#/lines' }, 'Product lines'), ').')]); return; }
  const p = id ? await api('GET', `/api/admin/products/${id}`)
    : { slug: '', name: '', meta: '', description: '', line_id: lines[0].id, sizes: [...APPAREL], price: null, image_id: null, thumb_id: null, cutout: false, published: true, gallery: [] };
  let slugTouched = !!id;

  const on = (el, key, fn = (v) => v) => { el.addEventListener('input', () => { p[key] = fn(el.value); setDirty(); }); return el; };
  const nameIn = h('input', { type: 'text', value: p.name, maxlength: 160 });
  const slugIn = h('input', { type: 'text', value: p.slug, maxlength: 80, pattern: '[a-z0-9]+(-[a-z0-9]+)*' });
  nameIn.addEventListener('input', () => {
    p.name = nameIn.value; setDirty();
    if (!slugTouched) { p.slug = slugIn.value = nameIn.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }
  });
  slugIn.addEventListener('input', () => { slugTouched = true; p.slug = slugIn.value; setDirty(); });
  const meta = on(h('input', { type: 'text', value: p.meta, maxlength: 200, placeholder: 'Black · Back print' }), 'meta');
  const desc = on(h('textarea', { value: p.description, maxlength: 5000, rows: 3 }), 'description');
  const line = h('select', { onchange: () => { p.line_id = Number(line.value); setDirty(); } }, lines.map((l) => h('option', { value: l.id, selected: l.id === p.line_id }, l.label)));
  const price = h('input', { type: 'number', min: 0, step: '0.01', value: p.price ?? '', placeholder: 'Leave empty to hide' });
  price.addEventListener('input', () => { p.price = price.value === '' ? null : price.value; setDirty(); });
  const sizes = h('input', { type: 'text', value: p.sizes.join(', ') });
  sizes.addEventListener('input', () => { p.sizes = sizes.value.split(',').map((s) => s.trim()).filter(Boolean); setDirty(); });
  const preset = (label, list) => h('button', { class: 'chip', type: 'button', onclick: () => { p.sizes = [...list]; sizes.value = list.join(', '); setDirty(); } }, label);
  const cutout = h('input', { type: 'checkbox', checked: p.cutout, onchange: () => { p.cutout = cutout.checked; setDirty(); } });
  const pub = h('input', { type: 'checkbox', checked: p.published, onchange: () => { p.published = pub.checked; setDirty(); } });

  const gallery = h('div', { class: 'gallery' });
  const drawGallery = async () => {
    const M = byId(await loadMedia());
    gallery.replaceChildren(...p.gallery.map((mid, i) => h('figure', null,
      h('img', { src: pick(M[mid], 240), alt: '' }),
      h('div', { class: 'acts' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move left', disabled: i === 0, onclick: () => { move(p.gallery, i, -1); setDirty(); drawGallery(); } }, '←'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move right', disabled: i === p.gallery.length - 1, onclick: () => { move(p.gallery, i, 1); setDirty(); drawGallery(); } }, '→'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove photo', onclick: () => { p.gallery.splice(i, 1); setDirty(); drawGallery(); } }, '×')))),
    p.gallery.length < 12 ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { alignSelf: 'center' }, onclick: async () => {
      const mid = await pickMedia({ title: 'Add a shop photo' });
      if (mid != null) { p.gallery.push(mid); setDirty(); drawGallery(); }
    } }, '+ Add photo') : null);
  };

  const save = (btn) => act(btn, async () => {
    const body = { slug: p.slug, name: p.name, meta: p.meta, description: p.description, line_id: p.line_id, sizes: p.sizes,
      price: p.price === '' ? null : p.price, image_id: p.image_id, thumb_id: p.thumb_id, cutout: p.cutout, published: p.published, gallery: p.gallery };
    if (!body.name.trim()) throw new Error('Give the product a name.');
    if (!body.sizes.length) throw new Error('Add at least one size (or “One size”).');
    const saved = id ? await api('PATCH', `/api/admin/products/${id}`, body) : await api('POST', '/api/admin/products', body);
    setDirty(false);
    if (!id) location.hash = `#/products/${saved.id}`;
  }, 'Product saved');

  const del = id ? h('button', { class: 'btn btn--danger', type: 'button', onclick: async (e) => {
    if (!(await confirmBox(`Delete “${p.name}”? It's removed from the shop and from any looks it's in.`))) return;
    await act(e.target, () => api('DELETE', `/api/admin/products/${id}`), 'Product deleted');
    setDirty(false);
    location.hash = '#/products';
  } }, 'Delete product') : null;

  shell([
    header(id ? p.name : 'New product', id ? `/${p.slug}` : 'Fill in the details, add photos, save.', h('a', { class: 'btn btn--ghost', href: '#/products' }, '← All products')),
    h('div', { class: 'stack' },
      h('div', { class: 'panel stack' },
        h('div', { class: 'grid2' }, field('Name', nameIn), field('Detail line', meta, 'Colour and print, shown above the name.')),
        h('div', { class: 'grid2' },
          field('Product line', line),
          field(`Price (${content.currency || 'GHS'})`, price, 'Empty = no price shown on the site.')),
        h('div', { class: 'field' }, h('span', null, 'Sizes'), sizes, h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Comma-separated.'), preset('S – 2XL', APPAREL), preset('One size', ['One size']))),
        field('Description (optional)', desc),
        h('div', { class: 'row' }, h('label', { class: 'check' }, pub, 'Show on the site'))),
      h('div', { class: 'panel stack' },
        h('h2', null, 'Images'),
        h('div', { class: 'grid2' },
          imageField('Main image', () => p.image_id, (v) => { p.image_id = v; }, { hint: 'Used in the runway panel and the styling bag.' }),
          imageField('Thumbnail (optional)', () => p.thumb_id, (v) => { p.thumb_id = v; }, { optional: true, hint: 'Small square image; defaults to the main image.' })),
        h('div', { class: 'row' }, h('label', { class: 'check' }, cutout, 'Main image is a cut-out (transparent background)')),
        h('div', { class: 'field' }, h('span', null, 'Shop photos'), gallery, h('span', { class: 'hint' }, 'The first is the card photo in The Collection, the second shows on hover.'))),
      h('details', { class: 'panel' }, h('summary', null, 'Advanced'),
        h('div', { class: 'stack', style: { marginTop: '14px' } }, field('Web address id (slug)', slugIn, 'Lowercase letters, numbers and dashes. Changing it empties this item from visitors’ saved bags.')))),
    saveBar(save, [del]),
  ]);
  drawGallery();
}

// ================================================================== LINES
async function linesPage() {
  const lines = await api('GET', '/api/admin/lines');
  const tbody = h('tbody');
  const toneSelect = (val, onchange) => h('select', { onchange }, Object.keys(TONES).map((k) => h('option', { value: k, selected: k === val }, TONE_NAMES[k])));
  const draw = () => tbody.replaceChildren(...lines.map((l, i) => {
    const label = h('input', { type: 'text', value: l.label, maxlength: 80 });
    const tag = h('input', { type: 'text', value: l.tag, maxlength: 80 });
    const tone = toneSelect(l.tone, () => { dot.style.background = TONES[tone.value]; });
    const dot = swatch(l.tone);
    return h('tr', null,
      h('td', null, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => reorder(i, -1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === lines.length - 1, onclick: () => reorder(i, 1) }, '↓'))),
      h('td', null, label), h('td', null, tag), h('td', null, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, dot, tone)),
      h('td', { class: 'muted small' }, l.key),
      h('td', null, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => act(e.target, () => api('PATCH', `/api/admin/lines/${l.id}`, { label: label.value, tag: tag.value, tone: tone.value }), 'Line saved') }, 'Save'),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async (e) => {
          if (!(await confirmBox(`Delete the “${l.label}” line?`))) return;
          if (await act(e.target, () => api('DELETE', `/api/admin/lines/${l.id}`), 'Line deleted') !== undefined) route();
        } }, 'Delete'))));
  }));
  const reorder = (i, d) => { move(lines, i, d); draw(); act(null, () => api('PUT', '/api/admin/lines/order', { ids: lines.map((l) => l.id) }), 'Order saved'); };
  draw();

  const nLabel = h('input', { type: 'text', placeholder: 'Outerwear', maxlength: 80 });
  const nTag = h('input', { type: 'text', placeholder: 'Jacket', maxlength: 80 });
  const nTone = toneSelect('ink', () => {});
  const add = h('form', { class: 'panel stack', onsubmit: async (e) => {
    e.preventDefault();
    const key = nLabel.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (await act(e.submitter, () => api('POST', '/api/admin/lines', { key, label: nLabel.value, tag: nTag.value || nLabel.value, tone: nTone.value }), 'Line added') !== undefined) route();
  } },
  h('h2', null, 'Add a line'),
  h('div', { class: 'grid2' }, field('Filter label', nLabel, 'Shown on the shop filter, e.g. “Shirts”.'), field('Card tag', nTag, 'Shown on each product card, e.g. “Shirt”.')),
  h('div', { class: 'row' }, field('Colour', nTone), h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'submit' }, 'Add line')));

  shell([
    header('Product lines', 'The shop filters. Each line has a colour from the product palette, used on its filter and cards.'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Order'), h('th', null, 'Filter label'), h('th', null, 'Card tag'), h('th', null, 'Colour'), h('th', null, 'Id'), h('th'))), tbody),
    h('div', { style: { height: '16px' } }), add,
  ]);
}

// ================================================================== PAGE SECTIONS
const T = (key, label, hint, extra = {}) => ({ key, label, hint, type: 'text', ...extra });
const A = (key, label, hint) => ({ key, label, hint, type: 'area' });
const SECTIONS = {
  site: { title: 'Site settings', about: 'Browser title, search description, currency, contact, socials, the scrolling band and small print.', fields: [
    T('title', 'Browser tab title'), A('description', 'Search & share description', 'Shown by Google and when the link is shared.'),
    T('currency', 'Currency code', 'e.g. GHS, USD.'), { key: 'bundle_saving', label: 'Full-look saving (%)', hint: 'Discount shown when someone adds a whole look. 0 = none.', type: 'percent' },
    T('contact_email', 'Contact email'), T('intro_kicker', 'Intro line', 'Under the welcome animation.'),
    T('footer_note', 'Footer note'), A('bag_note', 'Styling bag note', 'Shown at the top of the styling bag.'),
    A('ticker', 'Scrolling band', 'The big moving words under the runway. One phrase per line; leave empty to hide it.'),
    T('instagram', 'Instagram link', 'Full link starting with https://. Social links show in the footer once filled in.'),
    T('tiktok', 'TikTok link'), T('x', 'X (Twitter) link'), T('youtube', 'YouTube link'), T('whatsapp', 'WhatsApp link', 'e.g. https://wa.me/233XXXXXXXXX')] },
  runway: { title: 'Try the Look', about: 'The runway heading.', fields: [T('title', 'Heading'), T('sub', 'Subheading', '{count} is replaced by the number of looks.')] },
  shop: { title: 'The Collection', about: 'Heading above the shop grid.', fields: [T('kicker', 'Small label'), T('title', 'Heading'), A('sub', 'Intro')] },
  story: { title: 'Armour of God', about: 'The artwork story and its featured piece.', fields: [
    T('kicker', 'Small label'), T('title', 'Heading'), A('verse', 'Verse'), A('body', 'Story', 'Put *asterisks* around words to show them in italics.'),
    { key: 'image_id', label: 'Artwork', type: 'image' }, { key: 'product_slug', label: 'Featured piece', type: 'product' }, T('button_label', 'Button label')] },
  lookbook: { title: 'Lookbook', about: 'Photo grid; each photo opens bigger on tap.', fields: [T('kicker', 'Small label'), T('title', 'Heading'), A('sub', 'Intro'), { key: 'items', label: 'Photos', type: 'figures', max: 40 }] },
  club: { title: 'Girls’ Club', about: 'Feature row with a button that filters the shop.', fields: [
    T('kicker', 'Small label'), T('title', 'Heading'), A('sub', 'Intro'), T('button_label', 'Button label'),
    { key: 'line_key', label: 'Button opens shop filter', type: 'line' }, { key: 'items', label: 'Photos', type: 'figures', max: 12 }] },
  community: { title: 'Community', about: 'One big photo and two beside it.', fields: [T('kicker', 'Small label'), T('title', 'Heading'), A('sub', 'Intro'), { key: 'items', label: 'Photos (up to 3)', type: 'figures', max: 3, captionLabel: 'Description (for screen readers)' }] },
};

function pagesList() {
  shell([
    header('Page sections', 'All the words and photos on the page, section by section.'),
    h('div', { class: 'list' }, Object.entries(SECTIONS).map(([k, s]) => h('a', { class: 'item', href: `#/pages/${k}`, style: { gridTemplateColumns: '1fr auto' } },
      h('div', null, h('div', { class: 'title' }, s.title), h('div', { class: 'meta' }, s.about)), h('span', { class: 'muted' }, 'Edit →')))),
  ]);
}

async function sectionEditor(key) {
  const spec = SECTIONS[key];
  if (!spec) { location.hash = '#/pages'; return; }
  const needs = spec.fields.map((f) => f.type);
  const [data, products, lines] = await Promise.all([
    api('GET', `/api/admin/content/${key}`),
    needs.includes('product') ? api('GET', '/api/admin/products') : [],
    needs.includes('line') ? api('GET', '/api/admin/lines') : [],
  ]);
  await loadMedia();

  const figures = (f) => {
    const wrap = h('div', { class: 'figs' });
    const draw = () => {
      const M = byId(mediaCache);
      const items = data[f.key];
      wrap.replaceChildren(...items.map((it, i) => {
        const cap = h('input', { type: 'text', value: it.caption, maxlength: 200, placeholder: f.captionLabel || 'Caption', oninput: () => { it.caption = cap.value; setDirty(); } });
        return h('div', { class: 'fig' },
          h('img', { src: pick(M[it.image_id], 240), alt: '' }),
          h('div', { class: 'stack', style: { gap: '6px' } }, cap,
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => {
              const id = await pickMedia(); if (id != null) { it.image_id = id; setDirty(); draw(); }
            } }, 'Change photo')),
          h('div', { class: 'acts' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { move(items, i, -1); setDirty(); draw(); } }, '↑'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { move(items, i, 1); setDirty(); draw(); } }, '↓'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove photo', onclick: () => { items.splice(i, 1); setDirty(); draw(); } }, '×')));
      }), data[f.key].length < f.max ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => {
        const id = await pickMedia({ title: 'Add a photo' });
        if (id != null) { data[f.key].push({ image_id: id, caption: '' }); setDirty(); draw(); }
      } }, '+ Add photo') : null);
    };
    draw();
    return h('div', { class: 'field' }, h('span', null, f.label), wrap);
  };

  const controls = spec.fields.map((f) => {
    if (f.type === 'image') return imageField(f.label, () => data[f.key], (v) => { data[f.key] = v; }, { optional: true });
    if (f.type === 'figures') return figures(f);
    if (f.type === 'product' || f.type === 'line') {
      const opts = f.type === 'product' ? products.map((p) => [p.slug, `${p.name} — ${p.meta}`]) : lines.map((l) => [l.key, l.label]);
      const sel = h('select', { onchange: () => { data[f.key] = sel.value; setDirty(); } },
        h('option', { value: '' }, '— None —'), opts.map(([v, t]) => h('option', { value: v, selected: v === data[f.key] }, t)));
      return field(f.label, sel, f.hint);
    }
    if (f.type === 'percent') {
      const el = h('input', { type: 'number', min: 0, max: 90, step: 1, value: Math.round((data[f.key] || 0) * 100) });
      el.addEventListener('input', () => { data[f.key] = Math.min(90, Math.max(0, Number(el.value) || 0)) / 100; setDirty(); });
      return field(f.label, el, f.hint);
    }
    const el = f.type === 'area' ? h('textarea', { value: data[f.key] ?? '', rows: 3 }) : h('input', { type: 'text', value: data[f.key] ?? '' });
    el.addEventListener('input', () => { data[f.key] = el.value; setDirty(); });
    return field(f.label, el, f.hint);
  });

  shell([
    header(spec.title, spec.about, h('a', { class: 'btn btn--ghost', href: '#/pages' }, '← All sections')),
    h('div', { class: 'panel stack' }, controls),
    saveBar((btn) => act(btn, async () => { await api('PUT', `/api/admin/content/${key}`, data); setDirty(false); }, 'Section saved'),
      [h('a', { class: 'btn btn--ghost', href: '/', target: '_blank', rel: 'noopener' }, 'Preview site ↗')]),
  ]);
}

// ================================================================== MEDIA
async function mediaPage() {
  const [media, usage] = await Promise.all([loadMedia(true), api('GET', '/api/admin/media-usage')]);
  let sel = null;
  let query = '';
  const grid = h('div', { class: 'mgrid' });
  const side = h('div', { class: 'panel stack' });
  const frameBox = h('input', { type: 'checkbox' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr', onchange: () => upload([...fileIn.files]) });
  const drop = h('div', { class: 'drop' },
    h('p', { style: { margin: '0 0 10px' } }, 'Drop photos here, or'),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('label', { class: 'btn' }, 'Choose files', fileIn),
      h('label', { class: 'check small' }, frameBox, 'Fit into runway frame (for look photos)')),
    h('p', { class: 'muted small', style: { margin: '10px 0 0' } }, 'JPG, PNG, WebP or AVIF, up to 25 MB. Resized to web sizes automatically.'));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); upload([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });

  async function upload(files) {
    if (!files.length) return;
    const up = await act(null, () => uploadFiles(files, { frame: frameBox.checked ? 'look' : null }), `${files.length} uploaded`);
    fileIn.value = '';
    if (up) { media.splice(0, media.length, ...mediaCache); sel = up[up.length - 1].id; draw(); }
  }

  const search = h('input', { type: 'text', placeholder: 'Search by description or file name', oninput: () => { query = search.value.toLowerCase(); draw(); } });

  function drawSide() {
    const m = media.find((x) => x.id === sel);
    if (!m) { side.replaceChildren(h('p', { class: 'muted', style: { margin: 0 } }, 'Select an image to edit its description or delete it.')); return; }
    const used = usage[m.id] || [];
    const alt = h('textarea', { value: m.alt, rows: 3 });
    const bg = h('input', { type: 'text', value: m.bg || '', placeholder: '#ffffff' });
    const fit = h('select', null, h('option', { value: 'cover', selected: m.fit === 'cover' }, 'Fill the card'), h('option', { value: 'contain', selected: m.fit === 'contain' }, 'Show whole (product shot)'));
    side.replaceChildren(
      h('img', { class: 'preview', src: pick(m, 720), alt: '' }),
      h('div', { class: 'small muted' }, `${m.width} × ${m.height}px · ${m.storage === 'static' ? 'built-in' : 'uploaded'}`),
      field('Description (alt text)', alt, 'What’s in the photo, for screen readers and search.'),
      h('div', { class: 'grid2' }, field('Card fit', fit), field('Backdrop colour', bg, 'For “show whole”.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => act(e.target, async () => {
          const body = { alt: alt.value, fit: fit.value };
          if (bg.value.trim()) body.bg = bg.value.trim();
          Object.assign(m, await api('PATCH', `/api/admin/media/${m.id}`, body));
          mediaCache = null; draw();
        }, 'Image saved') }, 'Save'),
        h('a', { class: 'btn btn--ghost btn--sm', href: pick(m, 2000), target: '_blank', rel: 'noopener' }, 'Open ↗'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', disabled: used.length > 0, title: used.length ? 'In use' : '', onclick: async (e) => {
          if (!(await confirmBox('Delete this image? This can’t be undone.'))) return;
          if (await act(e.target, () => api('DELETE', `/api/admin/media/${m.id}`), 'Image deleted') !== undefined) {
            media.splice(media.indexOf(m), 1); mediaCache = null; sel = null; draw();
          }
        } }, 'Delete')),
      used.length ? h('div', { class: 'small muted' }, h('strong', null, 'Used by: '), used.join(', ')) : h('div', { class: 'small muted' }, 'Not used anywhere.'));
  }

  function draw() {
    const shown = media.filter((m) => !query || `${m.alt} ${m.filename} ${m.key || ''}`.toLowerCase().includes(query));
    grid.replaceChildren(...shown.map((m) => h('button', { type: 'button', class: 'mcard', 'aria-pressed': String(m.id === sel), onclick: () => { sel = m.id; draw(); } },
      h('img', { src: pick(m, 240), alt: '', loading: 'lazy' }),
      usage[m.id] ? null : h('span', { class: 'badge used' }, 'Unused'),
      h('span', { class: 'cap' }, m.alt || m.filename || m.key))));
    drawSide();
  }
  draw();
  shell([
    header('Media library', `${media.length} images. Uploads are stored on the server’s media volume.`),
    h('div', { class: 'media-side' }, h('div', null, drop, h('div', { style: { height: '14px' } }), search, grid), side),
  ]);
}

// ================================================================== USERS + ACCOUNT
async function usersPage() {
  const users = await api('GET', '/api/admin/users');
  const fmt = (d) => (d ? new Date(d).toLocaleString() : 'Never');
  const rows = users.map((u) => h('tr', null,
    h('td', null, h('div', { class: 'title' }, u.name || '—'), h('div', { class: 'small muted' }, u.email)),
    h('td', { class: 'small' }, fmt(u.last_login_at)),
    h('td', null, u.is_active ? h('span', { class: 'badge' }, 'Active') : h('span', { class: 'badge badge--off' }, 'Disabled')),
    h('td', null, u.id === state.me.id ? h('span', { class: 'muted small' }, 'You') : h('div', { class: 'row' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: (e) => act(e.target, () => api('PATCH', `/api/admin/users/${u.id}`, { is_active: !u.is_active }).then(() => route()), u.is_active ? 'Disabled' : 'Enabled') }, u.is_active ? 'Disable' : 'Enable'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => resetPw(u) }, 'Set password'),
      h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async (e) => {
        if (!(await confirmBox(`Delete ${u.email}? They won’t be able to sign in.`))) return;
        if (await act(e.target, () => api('DELETE', `/api/admin/users/${u.id}`), 'User deleted') !== undefined) route();
      } }, 'Delete')))));

  function resetPw(u) {
    const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10 });
    const d = h('dialog', { class: 'modal modal--small' },
      h('form', { method: 'dialog', onsubmit: async (e) => {
        e.preventDefault();
        if (await act(e.submitter, () => api('PATCH', `/api/admin/users/${u.id}`, { password: pw.value }), 'Password set. They’ve been signed out everywhere.') !== undefined) { d.close(); d.remove(); }
      } },
      h('div', { class: 'modal-body stack' }, h('h2', null, `New password for ${u.email}`), field('Password', pw, 'At least 10 characters. Share it with them privately.')),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { d.close(); d.remove(); } }, 'Cancel'),
        h('button', { class: 'btn', type: 'submit' }, 'Set password'))));
    document.body.append(d); d.showModal(); pw.focus();
  }

  const email = h('input', { type: 'email', required: true, autocomplete: 'off' });
  const name = h('input', { type: 'text', maxlength: 120 });
  const pw = h('input', { type: 'password', required: true, minlength: 10, autocomplete: 'new-password' });
  const add = h('form', { class: 'panel stack', onsubmit: async (e) => {
    e.preventDefault();
    if (await act(e.submitter, () => api('POST', '/api/admin/users', { email: email.value, name: name.value, password: pw.value }), 'User added') !== undefined) route();
  } },
  h('h2', null, 'Add someone'),
  h('div', { class: 'grid2' }, field('Email', email), field('Name', name)),
  field('Temporary password', pw, 'At least 10 characters. They can change it under My account.'),
  h('div', null, h('button', { class: 'btn', type: 'submit' }, 'Add user')));

  shell([
    header('Users', 'People who can sign in to this admin. Everyone here can edit everything.'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Person'), h('th', null, 'Last sign-in'), h('th', null, 'Status'), h('th'))), h('tbody', null, rows)),
    h('div', { style: { height: '16px' } }), add,
  ]);
}

function accountPage() {
  const cur = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const nw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
  const again = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const form = h('form', { class: 'panel stack', style: { maxWidth: '480px' }, onsubmit: async (e) => {
    e.preventDefault();
    if (nw.value !== again.value) { toast('The new passwords don’t match.', true); return; }
    if (await act(e.submitter, () => api('POST', '/api/auth/password', { current: cur.value, new: nw.value }), 'Password changed. Other browsers have been signed out.') !== undefined) form.reset();
  } },
  h('h2', null, 'Change password'), field('Current password', cur), field('New password', nw, 'At least 10 characters.'), field('New password again', again),
  h('div', null, h('button', { class: 'btn', type: 'submit' }, 'Change password')));
  shell([header('My account', `Signed in as ${state.me.email}`), form]);
}

route();
