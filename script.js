const header = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
const toggle = document.querySelector('.menu-toggle');
const menu = document.getElementById('mobile-menu');

// Header turns solid once the hero has scrolled past
function updateHeader() {
  const threshold = hero.offsetHeight - header.offsetHeight;
  header.classList.toggle('is-solid', window.scrollY > threshold);
}
window.addEventListener('scroll', updateHeader, { passive: true });
window.addEventListener('resize', updateHeader);
updateHeader();

// Mobile menu
function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
  menu.hidden = !open;
  document.body.classList.toggle('menu-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
toggle.addEventListener('click', () => setMenu(menu.hidden));
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

// Email signup (front-end only — connect to the client's mailing provider)
const form = document.querySelector('.signup-form');
const note = document.querySelector('.form-note');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = form.email;
  if (!email.checkValidity()) {
    note.textContent = 'Please enter a valid email address.';
    email.focus();
    return;
  }
  note.textContent = 'Thank you. You’re on the list.';
  form.reset();
});

document.getElementById('year').textContent = new Date().getFullYear();
