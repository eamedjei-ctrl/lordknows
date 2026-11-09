/* =========================================================================
   Lord Knows — The Collection, photo zoom and section reveals.
   Uses the catalogue and styling bag from runway.js (window.LordKnows).
   ========================================================================= */
(() => {
  'use strict';
  const LK = window.LordKnows;
  const grid = document.querySelector('[data-shop-grid]');
  if (!LK || !grid) return;
  const { PRODUCTS, DATA, Bag, money, hasPrice } = LK;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lines (with their colour) and the shop order come from the CMS.
  const LINES = DATA.lines || {};
  const ORDER = DATA.order || Object.keys(PRODUCTS);
  const ON_DARK = new Set(['green', 'pink', 'gold']); // light colours get dark text
  const toneStyle = (t) => (t ? `--tone:var(--lk-${t});--tone-on:${ON_DARK.has(t) ? 'var(--lk-ink)' : '#fff'}` : '');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // g = gallery photo { sm, lg, bg, fit }. Product shots on a plain backdrop
  // are shown whole (fit: contain) on their own backdrop colour.
  const img = (g, alt) => `<img src="${g.sm}" srcset="${g.sm} 720w, ${g.lg} 1400w" sizes="(max-width: 749px) 50vw, (max-width: 1099px) 33vw, 25vw" alt="${esc(alt)}" loading="lazy" decoding="async"${g.fit === 'contain' ? ' style="--fit:contain"' : ''}>`;

  // ---- Render the cards ----
  grid.innerHTML = ORDER.filter((id) => PRODUCTS[id]).map((id) => {
    const p = PRODUCTS[id];
    // no gallery photos yet: fall back to the product's own image
    const g = p.gallery?.length ? p.gallery : [{ sm: p.img, lg: p.img, fit: p.cutout ? 'contain' : 'cover' }];
    const bg = (g[0] && g[0].bg) || '#f4f4f4';
    const one = p.sizes.length === 1;
    const pills = one ? '' : `<div class="lk-pills" role="group" aria-label="Size for ${esc(p.name)}">${p.sizes.map((s) =>
      `<button type="button" class="lk-pill" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div>`;
    return `<article class="lk-card" data-pid="${id}" data-line="${esc(p.line)}" style="${toneStyle(LINES[p.line]?.tone)}" id="p-${id}">
      <div class="lk-card-media" style="--bg:${esc(bg)}">
        <span class="lk-card-tag">${esc(LINES[p.line]?.tag || '')}</span>
        ${g.slice(0, 2).map((n, i) => img(n, i ? `${p.name}, ${p.meta}: second view` : `${p.name}, ${p.meta}`)).join('')}
      </div>
      <span class="lk-card-meta">${esc(p.meta)}</span>
      <h3 class="lk-card-name">${esc(p.name)}</h3>
      ${hasPrice(id) ? `<span class="lk-card-price">${money(p.price)}</span>` : ''}
      ${pills}
      <button type="button" class="lk-btn" data-add ${one ? `data-size="${esc(p.sizes[0])}"` : ''}>${one ? 'Add to bag' : 'Choose a size'}</button>
    </article>`;
  }).join('');

  // ---- Size + add ----
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.lk-card');
    if (!card) return;
    const pill = e.target.closest('.lk-pill');
    const add = card.querySelector('[data-add]');
    if (pill) {
      card.querySelectorAll('.lk-pill').forEach((b) => b.setAttribute('aria-pressed', String(b === pill)));
      add.dataset.size = pill.dataset.size;
      add.textContent = `Add to bag — ${pill.dataset.size}`;
      add.classList.remove('is-added');
      return;
    }
    if (e.target.closest('[data-add]')) {
      if (!add.dataset.size) {
        add.textContent = 'Pick a size first';
        card.querySelector('.lk-pill')?.focus();
        return;
      }
      try {
        Bag.add([{ id: `${card.dataset.pid}/${add.dataset.size}` }]);
        add.textContent = 'Saved to bag ✓';
        add.classList.add('is-added');
      } catch (err) {
        add.textContent = 'Couldn’t add. Try again.';
      }
    }
  });

  // ---- Filters ----
  const filters = [...document.querySelectorAll('.lk-filter')];
  function filter(line) {
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === line)));
    grid.querySelectorAll('.lk-card').forEach((c) => { c.hidden = line !== 'all' && c.dataset.line !== line; });
  }
  filters.forEach((b) => b.addEventListener('click', () => filter(b.dataset.filter)));

  // Links elsewhere on the page that jump to a filter or a single piece
  const shop = document.getElementById('shop');
  document.querySelectorAll('[data-shop-filter]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    filter(a.dataset.shopFilter);
    shop.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }));
  document.querySelectorAll('[data-shop-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    filter('all');
    const card = document.getElementById(`p-${a.dataset.shopJump}`);
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    card.classList.add('is-flash');
    setTimeout(() => card.classList.remove('is-flash'), 1600);
  }));

  // ---- Photo zoom (lookbook) ----
  const zoom = document.getElementById('zoom-dialog');
  if (zoom && typeof zoom.showModal === 'function') {
    const zimg = zoom.querySelector('img');
    document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      zimg.src = b.dataset.zoom;
      zimg.alt = b.querySelector('img').alt;
      zoom.showModal();
    }));
    zoom.addEventListener('click', (e) => { if (e.target === zoom || e.target.closest('.lk-zoom-close') || e.target === zimg) zoom.close(); });
  }

  // ---- Sections fade up as they arrive ----
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const els = document.querySelectorAll('.lk-head, .lk-card, .lk-look, .lk-club-fig, .lk-comm figure, .lk-story-art, .lk-story-text');
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => { el.classList.add('lk-reveal'); io.observe(el); });
  }
})();
