/* =========================================================================
   Lord Knows — Try the Look (runway)
   <runway-section> custom element + a local "styling bag".
   ========================================================================= */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Catalogue: products, looks and settings come from the CMS. The server
  // renders them into <script id="lk-data"> (see backend/app/site.py).
  // A product's `price` is a number, or null to keep prices off the page.
  // Each look's `tone` picks its UI colour from the product palette in
  // runway.css (red, flame, green, pink, gold, ink).
  // ---------------------------------------------------------------------------
  const DATA = (() => {
    try { return JSON.parse(document.getElementById('lk-data')?.textContent || '{}'); } catch { return {}; }
  })();
  const CURRENCY = DATA.currency || 'GHS';
  const BUNDLE_SAVING = DATA.bundleSaving ?? 0.10;
  const PRODUCTS = DATA.products || {};
  const LOOKS = DATA.looks || [];
  const COPY = { title: 'Try the Look.', sub: `${LOOKS.length} looks, styled head to toe. Tap a pin to see the piece.`, ...DATA.runway };

  const VARIANTS = {};
  Object.entries(PRODUCTS).forEach(([pid, p]) => {
    p.thumb = p.thumb || p.img; // small (240px) image for the bag, picker and panel
    p.variants = p.sizes.map((size) => {
      const id = `${pid}/${size}`;
      VARIANTS[id] = { id, pid, size };
      return VARIANTS[id];
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (() => {
    let f;
    try { f = new Intl.NumberFormat('en-GH', { style: 'currency', currency: CURRENCY }); } catch { f = null; }
    return (n) => (n == null ? '' : f ? f.format(n) : `${CURRENCY} ${n.toFixed(2)}`);
  })();
  const hasPrice = (pid) => typeof PRODUCTS[pid].price === 'number';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lookSrc = (look, w) => look.src[w];

  const ICONS = {
    plus: '<svg class="rw__i-plus" width="16" height="16" viewBox="0 0 24 24" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    check: '<svg class="rw__i-check" width="16" height="16" viewBox="0 0 24 24" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>',
    spin: '<svg class="rw__i-spin" width="18" height="18" viewBox="0 0 24 24" stroke-width="1.6" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>',
    arrowR: '<svg width="26" height="14" viewBox="0 0 26 14" fill="currentColor" aria-hidden="true"><path d="M1 5.9h16.6V1.4L25.4 7l-7.8 5.6V8.1H1z"/></svg>',
    arrowL: '<svg width="26" height="14" viewBox="0 0 26 14" fill="currentColor" aria-hidden="true"><path d="M25 5.9H8.4V1.4L.6 7l7.8 5.6V8.1H25z"/></svg>',
    play: '<svg class="rw__i-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg class="rw__i-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h3.5v15H6.5zM14 4.5h3.5v15H14z"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  let toastTimer;
  function toast(text) {
    const el = document.getElementById('bag-status');
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2500);
  }

  // ---------------------------------------------------------------------------
  // Styling bag (localStorage). A shortlist only: nothing is ordered or paid here.
  // ---------------------------------------------------------------------------
  const Bag = {
    KEY: 'runway-styling-bag-v3',
    items: [],
    load() {
      try {
        const raw = JSON.parse(localStorage.getItem(this.KEY) || '[]');
        this.items = Array.isArray(raw)
          ? raw.filter((e) => e && VARIANTS[e.id] && Number.isInteger(e.quantity) && e.quantity >= 1 && e.quantity <= 20).slice(0, 50)
          : [];
      } catch { this.items = []; }
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.items)); } catch { /* storage full or blocked */ } },
    count() { return this.items.reduce((n, e) => n + e.quantity, 0); },
    has(id) { return this.items.some((e) => e.id === id); },
    add(list) {
      list.forEach(({ id }) => { if (!VARIANTS[id]) throw new Error('Please choose an available size.'); });
      list.forEach(({ id, quantity = 1 }) => {
        const found = this.items.find((e) => e.id === id);
        if (found) found.quantity = Math.min(20, found.quantity + quantity);
        else if (this.items.length < 50) this.items.push({ id, quantity });
      });
      this.save();
      this.changed(true);
      toast(list.length === 1 ? 'Piece saved to your styling bag' : 'Look saved to your styling bag');
    },
    setQty(id, q) {
      const found = this.items.find((e) => e.id === id);
      if (!found) return;
      if (q < 1) this.items = this.items.filter((e) => e.id !== id);
      else found.quantity = Math.min(20, q);
      this.save();
      this.changed(false);
    },
    remove(id) { this.setQty(id, 0); },
    changed(bump) {
      const n = this.count();
      document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; });
      BagDialog.render();
      document.dispatchEvent(new CustomEvent('lk:bag'));
    },
  };

  const BagDialog = {
    init() {
      this.dialog = document.getElementById('bag-dialog');
      if (!this.dialog) return;
      this.list = this.dialog.querySelector('#bag-items');
      this.total = this.dialog.querySelector('#bag-total');
      this.exportBtn = this.dialog.querySelector('#export-bag');
      document.getElementById('open-bag')?.addEventListener('click', () => this.open());
      const close = () => (window.LordKnows?.softClose || ((d) => d.close()))(this.dialog);
      this.dialog.querySelector('#close-bag')?.addEventListener('click', close);
      this.dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
      this.dialog.addEventListener('click', (e) => {
        const r = this.dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { close(); return; }
        const remove = e.target.closest('[data-bag-remove]');
        if (remove) Bag.remove(remove.dataset.bagRemove);
      });
      this.exportBtn?.addEventListener('click', () => this.download());
    },
    open() {
      if (!this.dialog) return;
      this.render();
      if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
      else this.dialog.setAttribute('open', '');
    },
    render() {
      if (!this.list) return;
      if (!Bag.items.length) {
        this.list.innerHTML = '<p class="bag-note">Your styling bag is empty. Choose a size beside a piece to save it.</p>';
        this.total.textContent = '';
      } else {
        this.list.innerHTML = Bag.items.map((e) => {
          const v = VARIANTS[e.id];
          const p = PRODUCTS[v.pid];
          const size = v.size === 'One size' ? 'One size' : `Size ${v.size}`;
          const price = hasPrice(v.pid) ? ` · ${money(p.price)}` : '';
          return `<div class="bag-row">
            <img src="${p.thumb}" alt="${esc(p.name)}" decoding="async">
            <div>
              <h3>${esc(p.name)}</h3>
              <p>${esc(size)} · Quantity ${e.quantity}${price}</p>
              <a href="${p.img}" target="_blank" rel="noopener noreferrer">View piece ↗</a>
            </div>
            <button type="button" class="bag-remove" data-bag-remove="${esc(e.id)}" aria-label="Remove ${esc(p.name)}">×</button>
          </div>`;
        }).join('');
        const priced = Bag.items.every((e) => hasPrice(VARIANTS[e.id].pid));
        this.total.textContent = priced
          ? `Reference subtotal ${money(Bag.items.reduce((sum, e) => sum + PRODUCTS[VARIANTS[e.id].pid].price * e.quantity, 0))}`
          : '';
      }
      if (this.exportBtn) this.exportBtn.disabled = !Bag.items.length;
    },
    download() {
      if (!Bag.items.length) return;
      const lines = Bag.items.map((e) => {
        const v = VARIANTS[e.id];
        const p = PRODUCTS[v.pid];
        return `${p.name} · ${v.size === 'One size' ? 'One size' : `Size ${v.size}`} · Quantity ${e.quantity}\n${new URL(p.img, location.href).href}`;
      });
      const text = ['RUNWAY — STYLING SHORTLIST', 'Reference prices; no order or payment has been placed.', '', ...lines].join('\n\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'runway-outfit-shortlist.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  // ---------------------------------------------------------------------------
  // <runway-section>
  // ---------------------------------------------------------------------------
  class RunwaySection extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      if (!LOOKS.length) { this.hidden = true; return; } // nothing published yet

      this.n = LOOKS.length;
      this.N = this.n * Math.ceil(8 / this.n);
      this.K = 95;
      this.C = 2 * Math.sqrt(this.K);
      this.speed = Number(this.dataset.speed) || 5000;
      this.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

      this.index = 0;
      this.target = 0;
      this.startOffset = reduceMotion ? 0 : 1.15;
      this.cur = -this.startOffset;
      this.vel = 0;
      this.still = null;
      this.visible = false;
      this.playing = false;
      this.engaged = false;
      this.panelHover = false;
      this.zoomed = false;
      this.dragging = false;
      this.suppressUntil = 0;
      this.wheelAcc = 0;

      this.style.setProperty('--rw-speed', `${this.speed / 1000}s`);
      this.render();
      this.cache();
      this.bind();
      this.measure();
      this.setIndex(0, true);
      this.observe();
      this.hydrateLater();
      this.setupCursor();
      if (this.dataset.autoplay === 'true' && !reduceMotion) this.play(true);
    }

    // ----- image loading -----
    // Looks near the start load straight away; every other look's images wait
    // (data-src) until the visitor moves near them or the page is idle, so the
    // first view isn't competing with 13 looks it can't see yet.
    near(i) {
      const d = Math.min(Math.abs(i), this.n - Math.abs(i));
      return d <= 1;
    }
    srcAttrs(src, i, srcset) {
      const a = srcset ? ` srcset="${srcset}"` : '';
      return this.near(i)
        ? `src="${src}"${a}`
        : `data-look="${i}" data-src="${src}"${srcset ? ` data-srcset="${srcset}"` : ''}`;
    }
    hydrate(i, reach = 2) {
      const want = new Set();
      for (let d = -reach; d <= reach; d++) want.add(((i + d) % this.n + this.n) % this.n);
      this.querySelectorAll('img[data-src]').forEach((im) => {
        if (reach < this.n && !want.has(Number(im.dataset.look))) return;
        if (im.dataset.srcset) im.srcset = im.dataset.srcset;
        im.src = im.dataset.src;
        im.removeAttribute('data-src');
        im.removeAttribute('data-srcset');
      });
    }
    hydrateLater() {
      const all = () => this.hydrate(0, this.n);
      const idle = () => (window.requestIdleCallback ? requestIdleCallback(all, { timeout: 4000 }) : setTimeout(all, 1500));
      if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
    }

    // ----- markup -----
    render() {
      const { n, N } = this;
      const look = (i) => LOOKS[i % n];
      // Only the first look and its neighbours get a real src now; the rest
      // carry data-src and are filled in by hydrate() (see below).
      const img = (l, extra = '') => `<img ${this.srcAttrs(lookSrc(l, 640), LOOKS.indexOf(l), `${lookSrc(l, 640)} 640w, ${lookSrc(l, 1080)} 1080w`)} sizes="(min-width: 1800px) 540px, (min-width: 750px) 420px, 320px" width="1080" height="1920" alt="${esc(l.name)}" decoding="async" draggable="false" data-model-image ${extra}>`;

      const bodies = Array.from({ length: N }, (_, a) => {
        const l = look(a);
        return `<div class="rw__model" data-rw-model data-index="${a}" aria-hidden="true">
          ${l.rack ? '' : '<span class="rw__shadow"></span>'}
          <div class="rw__figure" style="--rw-ar:0.5625"><div class="rw__art">${img(l)}<button type="button" class="rw__hit" data-rw-go="${a}" aria-label="Look ${a % n + 1}: ${esc(l.name)}" tabindex="-1"></button></div></div>
        </div>`;
      }).join('');

      const heroes = LOOKS.map((l, i) => `<div class="rw__hero${i === 0 ? ' is-on' : ''}" data-rw-hero data-index="${i}" data-name="${esc(l.name)}" data-label="Look ${i + 1}: ${esc(l.name)}" data-probe="${lookSrc(l, 640)}" aria-hidden="${i !== 0}">
          <div class="rw__morph">
            ${l.rack ? '' : '<span class="rw__shadow"></span>'}
            <div class="rw__figure" style="--rw-ar:0.5625"><div class="rw__art">${img(l)}<button type="button" class="rw__zoom" data-rw-zoom aria-label="View look: ${esc(l.name)}" tabindex="-1"></button><div class="rw__pins">${this.pinsHTML(l, -1)}</div></div></div>
          </div>
        </div>`).join('');

      const ticks = LOOKS.map((l, i) => `<button type="button" class="rw__tick" data-rw-tick="${i}" aria-current="${i === 0}" aria-label="Look ${i + 1}: ${esc(l.name)}">
          <span class="rw__tick-bar"></span><span class="rw__tick-label">${pad(i + 1)}<span class="rw__tick-name">&nbsp;&nbsp;${esc(l.name)}</span></span>
        </button>`).join('');

      const panels = LOOKS.map((l, i) => this.panelHTML(l, i)).join('');

      this.innerHTML = `
        <div class="rw__sticky">
          <div class="rw__grid">
            <div class="rw__left">
              <div class="rw__head">
                <div class="rw__intro">
                  <h2 class="rw__title">${esc(COPY.title)}</h2>
                  <p class="rw__sub">${esc(COPY.sub)}</p>
                </div>
                <span class="rw__sr" aria-live="polite" aria-atomic="true" data-rw-live></span>
              </div>
              <div class="rw__stage" data-rw-stage tabindex="0" role="region" aria-roledescription="carousel" aria-label="${esc(COPY.title)} — use arrow keys or swipe to change look">
                <div class="rw__actors" data-rw-actors>${bodies}</div>
                <div class="rw__heroes" data-rw-heroes>${heroes}</div>
                <span class="rw__sweep" aria-hidden="true"></span>
                <span class="rw__cursor" data-rw-cursor aria-hidden="true"><span class="rw__cursor-in"><span class="rw__cursor-label rw__cursor-drag">Drag</span><span class="rw__cursor-label rw__cursor-view">View</span></span></span>
                <span class="rw__walk" aria-hidden="true"><span class="rw__walk-line"></span></span>
              </div>
              <div class="rw__controls">
                <button type="button" class="rw__icon" data-rw-prev aria-label="Previous look">${ICONS.arrowL}</button>
                <div class="rw__ticks">${ticks}</div>
                <button type="button" class="rw__icon rw__auto" data-rw-auto aria-pressed="false" aria-label="Autoplay">${ICONS.play}${ICONS.pause}</button>
                <button type="button" class="rw__icon" data-rw-next aria-label="Next look">${ICONS.arrowR}</button>
              </div>
              <div class="rw__lb" data-rw-lb role="dialog" aria-label="Look details" hidden>
                <div class="rw__lb-bg" data-rw-lb-bg></div>
                <div class="rw__lb-stage" data-rw-lb-stage><div class="rw__lb-fig" data-rw-lb-fig></div></div>
                <div class="rw__lb-meta">
                  <span class="rw__lb-kicker" data-rw-lb-kicker></span>
                  <span class="rw__lb-name" data-rw-lb-name></span>
                </div>
                <button type="button" class="rw__lb-close" data-rw-lb-close aria-label="Close look">×</button>
              </div>
            </div>
            <aside class="rw__panel has-rule" aria-labelledby="rw-panel-title">
              <div class="rw__panel-inner">
                <div class="rw__panel-head">
                  <h3 class="rw__panel-title" id="rw-panel-title">In this look</h3>
                  <span class="rw__label" data-rw-pieces></span>
                </div>
                ${panels}
              </div>
            </aside>
          </div>
        </div>
        <div class="rw__sheet-host" data-rw-sheet><div class="rw__sheet-bg" data-rw-sheet-bg></div></div>`;
    }

    pinsHTML(look, tab) {
      return look.items.map((it, k) => (it.pin
        ? `<button type="button" class="rw__pin" data-rw-pin="${k + 1}" data-tip="${esc(PRODUCTS[it.id].name)}" style="left:${it.pin[0]}%; top:${it.pin[1]}%; --pi:${k + 1}" aria-label="${k + 1}: ${esc(PRODUCTS[it.id].name)}" tabindex="${tab}"><span class="rw__pin-dot">${k + 1}</span></button>`
        : '')).join('');
    }

    panelHTML(look, i) {
      const one = look.items.length === 1;
      const pieces = `${look.items.length} piece${one ? '' : 's'}`;
      const priced = look.items.every((it) => hasPrice(it.id));
      const full = priced ? look.items.reduce((s, it) => s + PRODUCTS[it.id].price, 0) : null;
      const bundle = priced ? Math.round(full * (1 - BUNDLE_SAVING) * 100) / 100 : null;

      const items = look.items.map((it, k) => {
        const n = k + 1;
        const p = PRODUCTS[it.id];
        const direct = p.sizes.length === 1;
        const key = `rw-${i}-${n}`;
        const href = p.img;
        const tryAttr = ' target="_blank" rel="noopener noreferrer"';
        const thumbH = Math.round(400 * p.h / p.w);
        const picker = direct ? '' : `
          <div class="rw__picker" id="${key}-picker" data-rw-picker hidden>
            <div class="rw__picker-head">
              <img ${this.srcAttrs(p.thumb, i)} alt="" class="${p.cutout ? 'is-cutout' : ''}" decoding="async">
              <div><strong>${esc(p.name)}</strong><span>${esc(p.meta)}${hasPrice(it.id) ? ` · ${money(p.price)}` : ''}</span></div>
              <button type="button" class="rw__pick-close" data-rw-pick-close aria-label="Close size picker">×</button>
            </div>
            <fieldset class="rw__opt">
              <legend class="rw__opt-name">${esc(p.legend || 'Size')}</legend>
              <div class="rw__values">
                ${p.variants.map((v) => `<label class="rw__pill"><input type="radio" name="${key}-size" value="${esc(v.id)}" data-rw-option="0"${v === p.variants[0] ? ' checked' : ''}><span class="rw__pill-label">${esc(v.size)}</span></label>`).join('')}
              </div>
            </fieldset>
            <button type="button" class="rw__confirm" data-rw-confirm><span data-rw-confirm-label>Add to bag</span><span class="rw__sr"> — ${esc(p.name)}</span></button>
          </div>`;
        return `<li class="rw__item" data-rw-card="${n}" data-pid="${it.id}" style="--i:${n}" data-title="${esc(p.name)}"${direct ? ` data-direct="1" data-selected="${esc(p.variants[0].id)}"` : ` data-selected="${esc(p.variants[0].id)}"`}>
            ${it.tag ? `<span class="rw__tag"><span class="rw__tag-text">${esc(it.tag)}</span></span>` : ''}
            <a class="rw__media" href="${href}"${tryAttr} tabindex="-1" aria-hidden="true"><img ${this.srcAttrs(p.thumb, i)} width="400" height="${thumbH}" alt="" decoding="async"><span class="rw__num">${n}</span></a>
            <div class="rw__info">
              <span class="rw__type">${esc(p.meta)}</span>
              <a class="rw__name" href="${href}"${tryAttr}>${esc(p.name)}</a>
              ${hasPrice(it.id) ? `<span class="rw__price"><span>${money(p.price)}</span></span>` : ''}
            </div>
            <button type="button" class="rw__add" data-rw-add${direct ? '' : ` aria-expanded="false" aria-controls="${key}-picker"`} aria-label="Add to bag: ${esc(p.name)}" data-added-label="Added to bag: ${esc(p.name)}">${ICONS.plus}${ICONS.check}${ICONS.spin}</button>
            ${picker}
          </li>`;
      }).join('');

      return `<div class="rw__look-panel${i === 0 ? ' is-in' : ''}" data-rw-panel="${i}"${i === 0 ? '' : ' hidden'}>
          <div class="rw__mhead"><span class="rw__mhead-title">${esc(look.name)}</span><span class="rw__label">${pieces}</span></div>
          <ul class="rw__items" role="list">${items}</ul>
          <div class="rw__bundle has-rule">
            <p class="rw__msg" data-rw-msg role="status" aria-live="polite"></p>
            <div class="rw__bundle-row">
              <div class="rw__bundle-copy">
                <span class="rw__bundle-title">Complete the look</span>
                <span class="rw__bundle-note">${priced ? (one ? 'The full look' : `Bundle all ${look.items.length} and save ${Math.round(BUNDLE_SAVING * 100)}%`) : (one ? 'The full look, saved together' : `All ${look.items.length} pieces, saved together`)}</span>
              </div>
              ${priced ? `<div class="rw__bundle-price"><s>${money(full)}</s><strong>${money(bundle)}</strong></div>` : ''}
            </div>
            <button type="button" class="rw__cta" data-rw-all>
              <span class="rw__cta-add">Add full look to bag</span>
              <span class="rw__cta-m">Add full look${priced ? ` — ${money(bundle)}` : ''}</span>
              <span class="rw__cta-done">Full look in your bag</span>
              <svg class="rw__cta-arrow" width="22" height="12" viewBox="0 0 26 14" aria-hidden="true"><path d="M1 5.9h16.6V1.4L25.4 7l-7.8 5.6V8.1H1z"/></svg>
              <svg class="rw__cta-spin" width="16" height="16" viewBox="0 0 24 24" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>
            </button>
          </div>
          <template data-rw-pieces-text>${pieces}</template>
        </div>`;
    }

    cache() {
      const $ = (s) => this.querySelector(s);
      this.stage = $('[data-rw-stage]');
      this.live = $('[data-rw-live]');
      this.piecesEl = $('[data-rw-pieces]');
      this.cursor = $('[data-rw-cursor]');
      this.autoBtn = $('[data-rw-auto]');
      this.lb = $('[data-rw-lb]');
      this.lbBg = $('[data-rw-lb-bg]');
      this.lbStage = $('[data-rw-lb-stage]');
      this.lbFig = $('[data-rw-lb-fig]');
      this.lbKicker = $('[data-rw-lb-kicker]');
      this.lbName = $('[data-rw-lb-name]');
      this.lbClose = $('[data-rw-lb-close]');
      this.panel = $('.rw__panel');
      this.sheet = $('[data-rw-sheet]');
      this.ticks = [...this.querySelectorAll('[data-rw-tick]')];
      this.heroes = [...this.querySelectorAll('[data-rw-hero]')];
      this.panels = [...this.querySelectorAll('[data-rw-panel]')];
      this.bodies = [...this.querySelectorAll('[data-rw-model]')].map((el) => ({ el, hit: el.querySelector('.rw__hit'), w: 0, o: null, blur: null, vis: null, pe: null }));
      this.querySelectorAll('[data-rw-picker]').forEach((p) => { p.rwCard = p.closest('.rw__item'); });

      // Model images appear in one step once decoded
      this.querySelectorAll('img[data-model-image]').forEach((img) => {
        const show = () => img.classList.add('is-decoded');
        if (img.complete && img.naturalWidth) { show(); return; }
        img.addEventListener('load', () => (img.decode ? img.decode().then(show, show) : show()), { once: true });
      });
    }

    // ----- events -----
    bind() {
      this.addEventListener('click', (e) => {
        if (performance.now() < this.suppressUntil) { e.preventDefault(); e.stopPropagation(); }
      }, true);
      this.addEventListener('click', (e) => this.onClick(e));
      this.addEventListener('change', (e) => {
        const input = e.target.closest('input[data-rw-option]');
        if (!input) return;
        this.engage();
        const card = input.closest('[data-rw-picker]')?.rwCard;
        if (card) this.onOption(card, true);
      });
      this.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (this.sheetCard) { this.closePicker(this.sheetCard, true); e.stopPropagation(); }
        else if (this.zoomed) { this.closePopup(); e.stopPropagation(); }
      });
      this.stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
        else if ((e.key === 'Enter' || e.key === ' ') && e.target === this.stage) { e.preventDefault(); this.openPopup(); }
      });

      // drag / swipe
      this.stage.addEventListener('pointerdown', (e) => this.onDown(e));
      this.stage.addEventListener('pointermove', (e) => this.onMove(e));
      this.stage.addEventListener('pointerup', (e) => this.onUp(e));
      this.stage.addEventListener('pointercancel', (e) => this.onUp(e));
      this.stage.addEventListener('lostpointercapture', (e) => this.onUp(e));
      this.stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      this.stage.addEventListener('dragstart', (e) => e.preventDefault());

      // panel hover holds autoplay; row hover links to the pin
      this.panel.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.panelHover = true; });
      this.panel.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.panelHover = false; this.restartBar(); } });
      this.panel.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const card = e.target.closest('.rw__item');
        if (card && !card.classList.contains('is-hot')) this.hot(Number(card.dataset.rwCard));
      });
      this.panel.addEventListener('pointerout', (e) => {
        if (e.pointerType !== 'mouse') return;
        const card = e.target.closest('.rw__item');
        if (card && !card.contains(e.relatedTarget)) this.hot(0);
      });

      // a click on anything interactive in the panel means the shopper is working: stop autoplay
      const engageOn = (root) => root.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, label')) this.engage();
      });
      engageOn(this.panel);
      engageOn(this.sheet);

      let rt;
      window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => this.measure(), 120); });
      if ('ResizeObserver' in window) {
        let last = '';
        new ResizeObserver(([entry]) => {
          const key = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
          if (key !== last) { last = key; this.measure(); }
        }).observe(this.stage);
      }
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.kick(); this.restartBar(); } });
      document.addEventListener('lk:bag', () => this.syncWithBag());
    }

    onClick(e) {
      const t = e.target;
      const q = (s) => t.closest(s);
      let el;
      if (q('[data-rw-pick-close]')) { const card = q('[data-rw-picker]')?.rwCard; if (card) this.closePicker(card, true); return; }
      if (q('[data-rw-sheet-bg]')) { if (this.sheetCard) this.closePicker(this.sheetCard, true); return; }
      if (q('[data-rw-lb-close]')) { this.closePopup(); return; }
      if (t === this.lbBg || t === this.lbStage) { this.closePopup(); return; }
      if (q('[data-rw-zoom]')) { this.openPopup(); return; }
      if (q('[data-rw-next]')) { this.next(); return; }
      if (q('[data-rw-prev]')) { this.prev(); return; }
      if ((el = q('[data-rw-tick]'))) { this.go(Number(el.dataset.rwTick)); return; }
      if (q('[data-rw-auto]')) { if (!this.playing) this.engaged = false; this.play(!this.playing); return; }
      if ((el = q('[data-rw-pin]'))) { this.engage(); this.hot(Number(el.dataset.rwPin), true); return; }
      if ((el = q('[data-rw-go]'))) {
        const k = this.rank(Number(el.dataset.rwGo));
        if (k !== 0 && Math.abs(k) < this.N / 2) this.moveTo(Math.round(this.target) + k);
        else this.openPopup();
        return;
      }
      if ((el = q('[data-rw-confirm]'))) { const card = q('[data-rw-picker]')?.rwCard; if (card) { card.dataset.touched = '1'; this.addCards([card]); } return; }
      if ((el = q('[data-rw-add]'))) { this.onAdd(el.closest('.rw__item')); return; }
      if ((el = q('[data-rw-all]'))) { this.addAll(el.closest('.rw__look-panel')); return; }
    }

    // ----- navigation -----
    next() { this.moveTo(Math.round(this.target) + 1); }
    prev() { this.moveTo(Math.round(this.target) - 1); }
    go(i) {
      let d = (((i - this.index) % this.n) + this.n) % this.n;
      if (d > this.n / 2) d -= this.n;
      this.moveTo(Math.round(this.target) + d);
    }
    moveTo(T) {
      this.target = T;
      this.setStill(false);
      this.setIndex(((T % this.n) + this.n) % this.n);
      this.updateRanks();
      this.kick();
    }

    wrapN(v) { return ((v % this.N) + this.N) % this.N; }
    rank(a) {
      const k = this.wrapN(a - Math.round(this.target));
      if (this.mode === 'ring') return k > this.N / 2 ? k - this.N : k;
      return k;
    }
    updateRanks() {
      this.bodies.forEach((b, a) => {
        const k = this.rank(a);
        const on = k !== 0 && (this.mode === 'ring' ? Math.abs(k) <= 2 : k <= 3);
        b.hit.tabIndex = on ? 0 : -1;
        if (on) b.el.removeAttribute('aria-hidden'); else b.el.setAttribute('aria-hidden', 'true');
      });
    }

    setIndex(i, silent = false) {
      if (i === this.index && !silent) { this.updateRanks(); return; }
      const old = this.index;
      this.index = i;
      this.hydrate(i);
      const look = LOOKS[i];
      this.dataset.tone = look.tone || 'ink';
      if (!silent) {
        this.closePopup();
        if (this.sheetCard) this.closePicker(this.sheetCard, false);
      }
      this.style.setProperty('--rw-progress', ((i + 1) / this.n).toFixed(3));
      this.heroes.forEach((h, j) => {
        h.classList.toggle('is-on', j === i);
        h.classList.toggle('was', j === old && j !== i);
        h.setAttribute('aria-hidden', String(j !== i));
        h.querySelector('[data-rw-zoom]').tabIndex = j === i ? 0 : -1;
      });
      if (!silent && !reduceMotion) {
        this.stage.classList.remove('is-sweep');
        void this.stage.offsetWidth;
        this.stage.classList.add('is-sweep');
      }
      if (!silent) this.live.textContent = `Look ${i + 1}: ${look.name}`;
      this.ticks.forEach((t, j) => {
        t.setAttribute('aria-current', String(j === i));
        t.classList.toggle('is-past', j < i);
      });

      this.panels.forEach((p, j) => { p.hidden = j !== i; if (!silent) p.classList.remove('is-in'); });
      if (!silent) { void this.panels[i].offsetWidth; this.panels[i].classList.add('is-in'); }
      this.piecesEl.textContent = this.panels[i].querySelector('template[data-rw-pieces-text]').innerHTML;
      if (!silent) { this.piecesEl.classList.remove('is-swap'); void this.piecesEl.offsetWidth; this.piecesEl.classList.add('is-swap'); }
      const msg = this.panels[i].querySelector('[data-rw-msg]');
      if (msg) msg.textContent = '';

      this.hot(0);
      this.updateRanks();
      this.restartBar();
    }

    // ----- autoplay -----
    play(on) {
      this.playing = on;
      this.classList.toggle('is-playing', on);
      this.autoBtn.setAttribute('aria-pressed', String(on));
      this.restartBar();
    }
    restartBar() {
      clearTimeout(this.timer);
      this.ticks.forEach((t) => t.classList.remove('is-run'));
      if (!this.playing) return;
      void this.offsetWidth;
      this.ticks[this.index].classList.add('is-run');
      this.timer = setTimeout(() => {
        if (this.playing && this.visible && !this.dragging && !document.hidden && !this.panelHover && !this.zoomed && !this.engaged) this.next();
        else this.restartBar();
      }, this.speed);
    }
    engage() {
      if (this.engaged) return;
      this.engaged = true;
      this.play(false);
    }

    // ----- layout -----
    measure() {
      const w = window.innerWidth;
      const phone = w < 750;
      const mode = phone ? 'classic' : 'ring';
      this.phone = phone;
      if (mode !== this.mode) {
        const first = !this.mode;
        this.mode = mode;
        if (mode === 'ring') { if (!first) { this.cur = this.target; this.vel = 0; } }
        this.resetClassic(first ? this.startOffset : 0);
        if (!phone && this.sheetCard) this.closePicker(this.sheetCard, false);
        this.bodies.forEach((b) => { b.blur = null; b.el.style.filter = ''; });
      }

      const hh = [...document.querySelectorAll('.shopify-section-group-header-group, #shopify-section-header, #shopify-section-announcement-bar')]
        .filter((el) => !el.contains(this) && el.offsetParent !== null)
        .reduce((sum, el) => sum + el.offsetHeight, 0);
      let frameH;
      if (w >= 1100) frameH = Math.max(380, window.innerHeight - hh);
      else if (!phone) frameH = Math.max(460, Math.round((window.innerHeight - hh) * 0.86));
      else {
        if (!this.vh || w !== this.lastW || Math.abs(window.innerHeight - this.vh) >= 160) { this.vh = window.innerHeight; this.lastW = w; }
        const pct = this.dataset.mheightMode === 'custom' ? clamp(Number(this.dataset.mheightVh) || 109, 50, 120) : 100;
        frameH = Math.round((this.vh * pct) / 100);
      }
      this.style.setProperty('--rw-frame-h', `${frameH}px`);

      const r = this.stage.getBoundingClientRect();
      this.W = r.width;
      this.H = r.height;
      const ring = mode === 'ring';
      this.fs = ring ? 1.08 : 1;
      const modelH = ring ? Math.max(200, Math.round((this.H - 34 - 18) / 1.08)) : Math.max(200, Math.round(this.H - 24 - 18));
      const hx = ring ? 0.5 * this.W : 0.3 * this.W;
      const hy = ring ? 34 : 22;
      this.stage.style.setProperty('--rw-model-h', `${modelH}px`);
      this.stage.style.setProperty('--rw-hx', `${hx}px`);
      this.stage.style.setProperty('--rw-hy', `${hy}px`);
      this.style.setProperty('--rw-fs', this.fs);
      this.style.setProperty('--rw-ax', `${this.W ? (hx / this.W) * 100 : 50}%`);
      this.bodies.forEach((b) => { b.w = modelH * 0.5625; });
      this.unit = ring ? Math.max(120, 0.3 * this.W) : Math.max(90, this.W * 0.32 * 1.6);
      this.updateRanks();
      this.renderAll();
      this.kick();
    }

    resetClassic(offset) {
      this.cs = this.bodies.map((_, a) => {
        const goal = this.wrapN(a - this.target);
        return { x: goal + offset, g: goal + offset, v: 0, goal, trip: false, from: 0 };
      });
    }

    // ----- motion loop -----
    kick() {
      if (this.raf || !this.visible || document.hidden) return;
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
    frame = (now) => {
      this.raf = 0;
      const dt = this.last ? Math.min(0.034, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      const moving = this.mode === 'ring' ? this.stepRing(dt) : this.stepClassic(dt);
      const active = moving || this.dragging;
      this.setStill(!active);
      this.renderAll();
      if (active && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    };
    stepRing(dt) {
      const h = dt / 3;
      for (let i = 0; i < 3; i++) {
        const acc = -this.K * (this.cur - this.target) - this.C * this.vel;
        this.vel += acc * h;
        this.cur += this.vel * h;
      }
      if (Math.abs(this.cur - this.target) <= 0.0005 && Math.abs(this.vel) <= 0.0005) {
        this.cur = this.target;
        this.vel = 0;
        return false;
      }
      return true;
    }
    stepClassic(dt) {
      let moving = false;
      const h = dt / 3;
      this.cs.forEach((s, a) => {
        const goal = this.wrapN(a - this.target);
        if (Math.abs(goal - s.goal) > this.N / 2) { s.trip = true; s.from = s.x; }
        s.goal = goal;
        const tau = this.dragging ? 0.016 : s.trip ? 0.1 : 0.03 + 0.04 * Math.min(goal, 4);
        s.g += (goal - s.g) * (1 - Math.exp(-dt / tau));
        for (let i = 0; i < 3; i++) {
          const acc = -this.K * (s.x - s.g) - this.C * s.v;
          s.v += acc * h;
          s.x += s.v * h;
        }
        if (s.trip && Math.abs(s.x - goal) < 0.02) s.trip = false;
        if (Math.abs(s.x - goal) <= 0.0006 && Math.abs(s.v) <= 0.0006 && Math.abs(s.g - goal) <= 0.0006) {
          s.x = s.g = goal; s.v = 0; s.trip = false;
        } else moving = true;
      });
      return moving;
    }
    setStill(v) {
      if (v === this.still) return;
      this.still = v;
      this.classList.toggle('rw--still', v);
    }

    renderAll() {
      if (!this.W || !this.H) return;
      if (this.mode === 'ring') this.renderRing(); else this.renderClassic();
    }
    renderRing() {
      const { W, H, N } = this;
      const cx = 0.5 * W, R = 0.62 * W, P = 1.65 * W;
      const floor = H - 34, horizon = 0.36 * H, step = (2 * Math.PI) / N, fs = this.fs;
      const blurOn = this.dataset.blur !== 'false';
      this.bodies.forEach((s, a) => {
        let phi = ((a - this.cur) * step) % (2 * Math.PI);
        if (phi > Math.PI) phi -= 2 * Math.PI;
        if (phi <= -Math.PI) phi += 2 * Math.PI;
        const z = R * (1 - Math.cos(phi));
        const persp = P / (P + z);
        const sl = Math.abs(phi) / step;
        const scale = persp * (1 + (fs - 1) * clamp(1 - sl, 0, 1));
        const x = cx + R * Math.sin(phi) * persp;
        const feet = horizon + (floor - horizon) * persp;
        const blur = sl <= 1 ? 1.8 * sl : Math.min(1.8 + (sl - 1) * 2, 6.5);
        let op = clamp((Math.cos(phi) + 0.55) / 0.3, 0, 1);
        if (this.still && sl < 0.02) op = 0;
        this.put(s, x, H - feet, scale, op, blurOn ? blur : 0, Math.round(scale * 1000));
      });
    }
    renderClassic() {
      const W = this.W;
      const ax = 0.3, ay = 22, sx = 0.32, sy = 22, sr = 0.76, ex = 0.55, d = 4;
      this.bodies.forEach((b, a) => {
        const s = this.cs[a];
        let k = s.x, e = -1;
        if (s.trip) {
          const span = Math.abs(s.goal - s.from) || 1;
          const u = clamp(Math.abs(s.x - s.from) / span, 0, 1);
          if (s.goal > s.from) { if (u < 0.5) e = 2 * u * 1.4; else k = s.goal + 2 * (1 - u); }
          else if (u < 0.5) k = s.from + 2 * u;
          else e = 2 * (1 - u) * 1.4;
        } else if (k < 0) e = Math.min(-k, 1.4);

        if (e >= 0) {
          this.put(b, W * (ax - ex * e), ay - 22 * e, 1 + 0.14 * e, Math.max(0, 1 - 1.05 * e), 4 * Math.min(e, 1), 1100);
        } else {
          let op = k <= d - 1 ? 1 - 0.13 * k : Math.max(0, 0.61 * (d - k));
          if (this.still && Math.abs(k) < 0.02) op = 0;
          this.put(b, W * (ax + sx * k), ay + sy * k, Math.pow(sr, k), op, Math.min(0.9 * k, 3.2), 1000 - Math.round(10 * k));
        }
      });
    }
    put(s, x, bottom, scale, op, blur, z) {
      const half = (s.w * scale) / 2;
      if (x + half < -4 || x - half > this.W + 4) op = 0;
      s.el.style.transform = `translate3d(${x.toFixed(2)}px, ${(-bottom).toFixed(2)}px, 0) translateX(-50%) scale(${scale.toFixed(4)})`;
      const o = op.toFixed(3);
      if (o !== s.o) { s.el.style.opacity = o; s.o = o; }
      if (z !== s.z) { s.el.style.zIndex = z; s.z = z; }
      const vis = op < 0.01 ? 'hidden' : '';
      if (vis !== s.vis) { s.el.style.visibility = vis; s.vis = vis; }
      const pe = op < 0.5 ? 'none' : '';
      if (pe !== s.pe) { s.el.style.pointerEvents = pe; s.pe = pe; }
      // Blur in 1.5px steps: a changed blur makes the browser redraw the whole
      // figure, so it should change a few times per move, not every frame.
      // Between steps the blurred figure is reused and only slides (cheap).
      const bl = Math.round(blur / 1.5) * 1.5;
      if (bl !== s.blur) { s.el.style.filter = bl > 0 ? `blur(${bl}px)` : ''; s.blur = bl; }
    }

    // ----- drag, swipe, trackpad -----
    onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: this.target, drag: false, samples: [{ x: e.clientX, time: e.timeStamp }] };
    }
    onMove(e) {
      if (e.pointerType === 'mouse') this.moveCursor(e);
      const p = this.ptr;
      if (!p || e.pointerId !== p.id) return;
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) { this.onUp(e); return; }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.drag) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > 1.2 * Math.abs(dy)) {
          p.drag = true;
          this.dragging = true;
          this.classList.add('is-dragging');
          this.cursorState();
          try { this.stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          this.setStill(false);
        } else if (Math.abs(dy) > 10) { this.ptr = null; return; }
        else return;
      }
      p.samples.push({ x: e.clientX, time: e.timeStamp });
      if (p.samples.length > 6) p.samples.shift();
      this.target = p.t - dx / this.unit;
      this.kick();
    }
    onUp(e) {
      const p = this.ptr;
      if (!p || e.pointerId !== p.id) return;
      this.ptr = null;
      if (!p.drag) return;
      this.dragging = false;
      this.classList.remove('is-dragging');
      this.cursorState();
      const s = p.samples, f = s[0], l = s[s.length - 1];
      const span = l.time - f.time;
      const vx = span > 0 ? (l.x - f.x) / span : 0;
      const dx = l.x - p.x;
      const sign = -1;
      const from = Math.round(p.t);
      if (this.phone) {
        this.moveTo(Math.abs(dx) > 30 || Math.abs(vx) > 0.3 ? from + sign * (dx > 0 ? 1 : -1) : from);
      } else {
        let i = Math.round(this.target + (sign * vx * 160) / this.unit);
        if (i === from && Math.abs(vx) > 0.3) i = from + (vx < 0 ? 1 : -1);
        this.moveTo(clamp(i, from - 2, from + 2));
      }
      this.suppressUntil = performance.now() + 60;
    }
    onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (this.wheelLock) return;
      this.wheelAcc += e.deltaX;
      if (Math.abs(this.wheelAcc) > 45) {
        if (this.wheelAcc > 0) this.next(); else this.prev();
        this.wheelAcc = 0;
        this.wheelLock = true;
        setTimeout(() => { this.wheelLock = false; }, 520);
      }
    }

    // ----- custom cursor -----
    setupCursor() {
      if (!this.fine) { this.cursor.remove(); this.cursor = null; return; }
      this.classList.add('rw--cursor');
      this.cx = this.cy = this.tx = this.ty = 0;
      this.stage.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'mouse' || !this.cursor) return;
        this.cursor.classList.remove('is-on', 'is-link', 'is-view');
        this.cursorOn = false;
      });
    }
    moveCursor(e) {
      if (!this.cursor) return;
      const r = this.stage.getBoundingClientRect();
      this.tx = e.clientX - r.left;
      this.ty = e.clientY - r.top;
      this.hoverEl = e.target;
      if (!this.cursorOn) {
        this.cursorOn = true;
        this.cx = this.tx; this.cy = this.ty;
        this.cursor.classList.add('is-on');
      }
      this.cursorState();
      if (!this.cursorRaf) this.cursorRaf = requestAnimationFrame(this.cursorLoop);
    }
    cursorState() {
      if (!this.cursor) return;
      const t = this.hoverEl;
      const drag = this.dragging;
      this.cursor.classList.toggle('is-view', !drag && !!t?.closest?.('.rw__zoom'));
      this.cursor.classList.toggle('is-link', !drag && !!t?.closest?.('.rw__hit, .rw__pin'));
    }
    cursorLoop = () => {
      this.cursorRaf = 0;
      const k = reduceMotion ? 1 : 0.18;
      this.cx += (this.tx - this.cx) * k;
      this.cy += (this.ty - this.cy) * k;
      this.cursor.style.transform = `translate3d(${this.cx.toFixed(1)}px, ${this.cy.toFixed(1)}px, 0)`;
      if (Math.hypot(this.tx - this.cx, this.ty - this.cy) > 0.2) this.cursorRaf = requestAnimationFrame(this.cursorLoop);
    };

    // ----- visibility + reveal -----
    observe() {
      if (!('IntersectionObserver' in window)) { this.visible = true; this.classList.add('is-revealed'); this.kick(); return; }
      new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) { this.kick(); this.restartBar(); }
      }, { threshold: 0 }).observe(this);

      this.classList.add('rw--js');
      if (reduceMotion) { this.classList.add('is-revealed'); return; }
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => this.classList.add('is-revealed')));
      }, { threshold: 0, rootMargin: '0px 0px -22% 0px' });
      io.observe(this);
    }

    // ----- "View look" popup -----
    openPopup() {
      if (this.zoomed) return;
      const look = LOOKS[this.index];
      this.engage();
      this.zoomed = true;
      this.lbKicker.textContent = `Look ${pad(this.index + 1)} / ${pad(this.n)}`;
      this.lbName.textContent = look.name;
      this.lb.setAttribute('aria-label', `Look ${this.index + 1}: ${look.name}`);
      const h = Math.max(200, this.H - 40);
      const pins = this.pinsHTML(look, 0);
      this.lbFig.innerHTML = `<img src="${lookSrc(look, 1080)}" sizes="${Math.round(h * 0.5625)}px" srcset="${lookSrc(look, 640)} 640w, ${lookSrc(look, 1080)} 1080w" alt="${esc(look.name)}" width="1080" height="1920"><div class="rw__pins">${pins}</div>`;
      this.lb.hidden = false;
      void this.lb.offsetWidth;
      this.lb.classList.add('is-open');
      this.lbClose.focus({ preventScroll: true });
    }
    closePopup() {
      if (!this.zoomed) return;
      this.zoomed = false;
      const hadFocus = this.lb.contains(document.activeElement);
      this.lb.classList.remove('is-open');
      clearTimeout(this.lbTimer);
      this.lbTimer = setTimeout(() => { if (!this.zoomed) this.lb.hidden = true; }, reduceMotion ? 0 : 450);
      this.hot(0);
      if (hadFocus) this.stage.focus({ preventScroll: true });
      this.restartBar();
    }

    // ----- pins <-> rows -----
    hot(n, scroll = false) {
      this.querySelectorAll('.is-hot').forEach((x) => x.classList.remove('is-hot'));
      if (!n) return;
      if (this.zoomed) this.lbFig.querySelector(`[data-rw-pin="${n}"]`)?.classList.add('is-hot');
      const card = this.panels[this.index].querySelector(`[data-rw-card="${n}"]`);
      if (!card) return;
      card.classList.add('is-hot');
      if (scroll) this.reveal(card);
    }
    reveal(card) {
      const list = card.parentElement;
      const behavior = reduceMotion ? 'auto' : 'smooth';
      const cr = card.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      if (list.scrollWidth > list.clientWidth + 1) list.scrollBy({ left: cr.left - lr.left - 16, behavior });
      else if (list.scrollHeight > list.clientHeight + 1) list.scrollBy({ top: cr.top - lr.top - 12, behavior });
      else if (cr.top < 0 || cr.bottom > window.innerHeight - 140) window.scrollBy({ top: cr.top - 0.3 * window.innerHeight, behavior });
    }

    // ----- pieces, pickers, bag -----
    onAdd(card) {
      if (!card || card.classList.contains('is-added') || card.classList.contains('is-loading')) return;
      if (card.dataset.direct) { this.addCards([card]); return; }
      this.togglePicker(card);
    }
    togglePicker(card, force) {
      const picker = card.querySelector('[data-rw-picker]') || this.sheet.querySelector('[data-rw-picker]');
      if (!picker || picker.rwCard !== card) return;
      const open = force ?? !card.classList.contains('is-picking');
      if (!open) { this.closePicker(card, false); return; }
      if (card.classList.contains('is-picking')) return;
      if (this.phone) {
        if (this.sheetCard && this.sheetCard !== card) this.closePicker(this.sheetCard, false);
        this.sheet.appendChild(picker);
        this.sheet.classList.add('is-open');
        this.sheetCard = card;
      }
      picker.hidden = false;
      card.classList.add('is-picking');
      card.querySelector('[data-rw-add]').setAttribute('aria-expanded', 'true');
      this.onOption(card, false);
      (picker.querySelector('input:checked') || picker.querySelector('input'))?.focus({ preventScroll: true });
      if (!this.phone) this.reveal(card);
    }
    closePicker(card, focusButton) {
      const picker = this.pickerOf(card);
      if (!picker) return;
      picker.hidden = true;
      card.classList.remove('is-picking');
      const add = card.querySelector('[data-rw-add]');
      if (!card.classList.contains('is-added')) add.setAttribute('aria-expanded', 'false');
      if (picker.parentElement !== card) card.appendChild(picker);
      if (this.sheetCard === card) { this.sheet.classList.remove('is-open'); this.sheetCard = null; }
      if (focusButton && !card.classList.contains('is-added')) add.focus({ preventScroll: true });
    }
    pickerOf(card) {
      return card.querySelector('[data-rw-picker]') || [...this.sheet.querySelectorAll('[data-rw-picker]')].find((p) => p.rwCard === card);
    }
    onOption(card, touched) {
      const picker = this.pickerOf(card);
      if (!picker) return;
      const pid = card.dataset.pid;
      const checked = picker.querySelector('input:checked');
      const v = checked && VARIANTS[checked.value];
      picker.querySelectorAll('.rw__pill').forEach((pill) => pill.classList.toggle('is-unavailable', !VARIANTS[pill.querySelector('input').value]));
      const confirm = picker.querySelector('[data-rw-confirm]');
      const label = confirm.querySelector('[data-rw-confirm-label]');
      confirm.disabled = !v || v.pid !== pid;
      label.textContent = confirm.disabled ? (this.dataset.msgSoldout || 'Sold out') : 'Add to bag';
      if (v) card.dataset.selected = v.id;
      if (touched) card.dataset.touched = '1';
    }

    async addCards(cards, cta) {
      const panel = cards[0]?.closest('.rw__look-panel');
      const msg = panel?.querySelector('[data-rw-msg]');
      cards.forEach((c) => c.classList.add('is-loading'));
      cta?.classList.add('is-loading');
      try {
        if (!reduceMotion) await new Promise((r) => setTimeout(r, 420));
        Bag.add(cards.map((c) => ({ id: c.dataset.selected, quantity: 1 })));
        cards.forEach((c) => this.markAdded(c));
      } catch (err) {
        if (msg) msg.textContent = (err && err.message) || this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
      } finally {
        cards.forEach((c) => c.classList.remove('is-loading'));
        cta?.classList.remove('is-loading');
        if (panel) this.checkComplete(panel);
      }
    }
    markAdded(card) {
      card.classList.add('is-added');
      this.closePicker(card, false);
      const add = card.querySelector('[data-rw-add]');
      add.setAttribute('aria-label', add.dataset.addedLabel);
      add.removeAttribute('aria-expanded');
      card.dataset.added = card.dataset.selected;
      if (this.phone && !reduceMotion && navigator.vibrate) { try { navigator.vibrate(12); } catch { /* ignore */ } }
    }
    async addAll(panel) {
      const cta = panel.querySelector('[data-rw-all]');
      if (panel.classList.contains('is-complete') || cta.classList.contains('is-loading')) return;
      const msg = panel.querySelector('[data-rw-msg]');
      msg.textContent = '';
      const cards = [...panel.querySelectorAll('.rw__item')].filter((c) => !c.classList.contains('is-added'));
      const ready = cards.filter((c) => c.dataset.direct || (c.dataset.touched && c.dataset.selected));
      const pending = cards.filter((c) => !ready.includes(c));
      if (ready.length) await this.addCards(ready, cta);
      if (pending.length) {
        (this.phone ? pending.slice(0, 1) : pending).forEach((c) => this.togglePicker(c, true));
        if (!this.phone) this.reveal(pending[0]);
        msg.textContent = (this.dataset.msgChoose || 'Pick a size for: [items]').replace('[items]', pending.map((c) => c.dataset.title).join(', '));
      }
    }
    checkComplete(panel) {
      const cards = [...panel.querySelectorAll('.rw__item')];
      const done = cards.length >= 2 && cards.every((c) => c.classList.contains('is-added'));
      panel.classList.toggle('is-complete', done);
      if (done) panel.querySelector('[data-rw-msg]').textContent = '';
    }
    // If a piece is removed from the bag, let it be added again here.
    syncWithBag() {
      this.querySelectorAll('.rw__item.is-added').forEach((card) => {
        if (Bag.has(card.dataset.added)) return;
        card.classList.remove('is-added');
        delete card.dataset.added;
        const add = card.querySelector('[data-rw-add]');
        add.setAttribute('aria-label', `Add to bag: ${card.dataset.title}`);
        if (!card.dataset.direct) add.setAttribute('aria-expanded', 'false');
        this.checkComplete(card.closest('.rw__look-panel'));
      });
    }
  }

  Bag.load();
  BagDialog.init();
  Bag.changed(false);
  // Shared with shop.js (The Collection)
  window.LordKnows = { PRODUCTS, DATA, Bag, money, hasPrice, BagDialog };
  if (!customElements.get('runway-section')) customElements.define('runway-section', RunwaySection);
})();
