import { renderHome } from './views/home.js';
import { renderBinList } from './views/bin-list.js';
import { renderBinDetail } from './views/bin-detail.js';
import { renderSearch } from './views/search.js';
import { renderSettings } from './views/settings.js';
import { startLogBin } from './views/log-bin.js';

const main = document.getElementById('main');
const header = document.getElementById('header');
const headerTitle = document.getElementById('header-title');
const btnBack = document.getElementById('btn-back');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

let currentRoute = 'home';
let backHandler = null;
let toastTimer;

export function showToast(message, ms = 2500) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function setHeader(title, showBack = false, onBack = null) {
  if (title) {
    header.classList.remove('hidden');
    headerTitle.textContent = title;
  } else {
    header.classList.add('hidden');
  }

  backHandler = onBack;
  if (showBack) {
    btnBack.classList.remove('hidden');
  } else {
    btnBack.classList.add('hidden');
  }
}

function setNavVisible(visible, active = currentRoute) {
  if (visible) {
    nav.classList.remove('hidden');
    document.body.style.paddingBottom = '';
    nav.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === active);
    });
  } else {
    nav.classList.add('hidden');
    document.body.style.paddingBottom = '0';
  }
}

btnBack.addEventListener('click', () => {
  if (backHandler) backHandler();
  else navigate('home');
});

nav.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-route]');
  if (btn) navigate(btn.dataset.route);
});

export function navigate(route, params = {}) {
  currentRoute = route;
  main.innerHTML = '';

  switch (route) {
    case 'home':
      setHeader(null);
      setNavVisible(true, 'home');
      renderHome(main, { onLogBin: () => startLogBin() });
      break;

    case 'bins':
      setHeader('Bins', false);
      setNavVisible(true, 'bins');
      renderBinList(main, {
        onOpenBin: (id) => navigate('bin-detail', { id }),
      });
      break;

    case 'bin-detail':
      setHeader('Bin', true, () => navigate('bins'));
      setNavVisible(false);
      renderBinDetail(main, params.id, {
        onBack: () => navigate('bins'),
        onLogMore: () => startLogBin(params.id),
      });
      break;

    case 'search':
      setHeader('Search', false);
      setNavVisible(true, 'search');
      renderSearch(main, {
        onOpenBin: (id) => navigate('bin-detail', { id }),
      });
      break;

    case 'settings':
      setHeader('More', false);
      setNavVisible(true, 'settings');
      renderSettings(main);
      break;

    default:
      navigate('home');
  }
}

export function hideChrome() {
  header.classList.add('hidden');
  nav.classList.add('hidden');
  document.body.style.paddingBottom = '0';
}

export function showChrome(route = currentRoute) {
  if (route === 'bin-detail') return;
  setNavVisible(true, route);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

navigate('home');