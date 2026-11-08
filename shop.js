/* =========================================================================
   Lord Knows — The Collection, photo zoom and section reveals.
   Uses the catalogue and styling bag from runway.js (window.LordKnows).
   ========================================================================= */
(() => {
  'use strict';
  const LK = window.LordKnows;
  const grid = document.querySelector('[data-shop-grid]');
  if (!LK || !grid) return;
  const { PRODUCTS, Bag, money, hasPrice } = LK;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Product shots on a plain backdrop are shown whole (contain) on their own
  // backdrop colour; everything else fills the card.
  const STUDIO = {
    'classic-trucker-cap': '#ffffff',
    'cross-graphic-tee-black': '#ffffff',
    'cross-graphic-tee-white': '#070808',
    'fallen-angel-shirt-black-back': '#f1f1f1',
    'fallen-angel-shirt-black': '#ffffff',
    'fallen-angel-shirt-white-long-sleeve': '#cbc9c7',
    'fallen-angel-tee': '#b2b2b2',
    'feather-button-shirt': '#ecebe9',
    'feather-shirt-detail': '#bbbbbb',
    'heart-of-the-messiah-tee': '#a9a9ab',
    'signature-shirt': '#757379',
    'armour-of-god-artwork-hd': '#f2f2f2',
    'popup-display': '#0e1015',
  };
  const LINES = { graphic: 'Graphic', shirts: 'Shirt', stadium: 'Stadium set', club: 'Girls’ Club', caps: 'Cap' };
  const ORDER = ['armour-shirt', 'fallen-shirt-black', 'fallen-longsleeve', 'fallen-tee', 'messiah-tee', 'gothic-tee-black', 'gothic-tee-white',
    'college-tee-white', 'college-tee-black', 'lord-knows-joggers', 'salvation-joggers',
    'feather-shirt-black', 'feather-shirt-white', 'signature-shirt',
    'club-tee-green', 'club-tee-pink', 'raglan-crop', 'club-trucker', 'red-trucker', 'classic-trucker'];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const src = (n, w) => `assets/images/web/${n}-${w}.webp`;
  const img = (n, alt) => `<img src="${src(n, 720)}" srcset="${src(n, 720)} 720w, ${src(n, 1400)} 1400w" sizes="(max-width: 749px) 50vw, (max-width: 1099px) 33vw, 25vw" alt="${esc(alt)}" loading="lazy" decoding="async"${STUDIO[n] ? ' style="--fit:contain"' : ''}>`;

  // ---- Render the cards ----
  grid.innerHTML = ORDER.filter((id) => PRODUCTS[id]).map((id) => {
    const p = PRODUCTS[id];
    const g = p.gallery || [];
    const bg = STUDIO[g[0]] || '#f4f4f4';
    const one = p.sizes.length === 1;
    const pills = one ? '' : `<div class="lk-pills" role="group" aria-label="Size for ${esc(p.name)}">${p.sizes.map((s) =>
      `<button type="button" class="lk-pill" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div>`;
    return `<article class="lk-card" data-pid="${id}" data-line="${p.line}" id="p-${id}">
      <div class="lk-card-media" style="--bg:${bg}">
        <span class="lk-card-tag">${LINES[p.line] || ''}</span>
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
      zimg.src = src(b.dataset.zoom, 1400);
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
