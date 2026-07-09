import { renderHome } from './views/home.js';
import { renderBinList } from './views/bin-list.js';
import { renderBinDetail } from './views/bin-detail.js';
import { renderSearch } from './views/search.js';
import { renderSettings } from './views/settings.js';
import { startLogBin } from './views/log-bin.js';
import { processPendingItemAi } from './item-ai.js';

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
      renderHome(main, {
        onLogBin: () => startLogBin(),
        onOpenSettings: () => navigate('settings'),
      });
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

const updateBanner = document.getElementById('update-banner');

function showUpdateBanner(waitingWorker) {
  updateBanner.classList.remove('hidden');
  document.getElementById('update-banner-btn').addEventListener(
    'click',
    () => waitingWorker.postMessage('SKIP_WAITING'),
    { once: true },
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // An update may already be sitting there waiting from a previous visit.
      if (reg.waiting && reg.active) showUpdateBanner(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // "installed" with an existing controller means this is an update,
          // not the very first install of the app.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(installing);
          }
        });
      });

      // Reopening the installed app doesn't always trigger a fresh update
      // check on its own — ask explicitly whenever it comes back to the
      // foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });

  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}

// Describe any item photos that haven't been processed yet, so search can
// find them. Delayed so it never competes with app startup.
setTimeout(() => {
  processPendingItemAi().catch(() => {});
}, 4000);

navigate('home');