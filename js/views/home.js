import { aiEnabled } from '../ai-settings.js';

const BANNER_DISMISSED = 'binbuilder-ai-banner-dismissed';

export function renderHome(container, { onLogBin, onOpenSettings }) {
  let bannerDismissed = false;
  try {
    bannerDismissed = !!localStorage.getItem(BANNER_DISMISSED);
  } catch { /* storage unavailable */ }
  const showAiBanner = !aiEnabled() && !bannerDismissed;

  container.innerHTML = `
    <div class="stack">
      <h2 class="hero-title">BinBuilder</h2>
      <p class="hero-sub">Scan a QR label or photograph your bin, record items as you pack, then review and save.</p>
      <button type="button" id="btn-log-bin" class="btn btn-primary">Log a bin</button>
      ${showAiBanner ? `
        <button type="button" class="card" id="ai-banner" style="text-align:left;cursor:pointer;display:flex;gap:12px;align-items:center;border:1px solid var(--accent-light)">
          <span style="font-size:1.4rem">✨</span>
          <span style="flex:1">
            <span style="font-weight:700;display:block">Maximize your experience</span>
            <span class="muted" style="font-size:0.85rem">Add AI item descriptions under <strong>More</strong> — search finds items by what's in the photo.</span>
          </span>
          <span id="ai-banner-dismiss" aria-label="Dismiss" style="padding:8px;font-size:1.1rem">✕</span>
        </button>
      ` : ''}
      <div class="card">
        <p class="card-title">How it works</p>
        <p class="muted" style="margin:0;line-height:1.6">
          1. Identify the bin (QR label or photo)<br>
          2. Snap each item as you pack it<br>
          3. Review and save
        </p>
      </div>
      <p class="muted" style="font-size:0.85rem;margin:0">
        Pre-printed QR labels available for purchase. Photo mode works with handwritten labels too.
      </p>
    </div>
  `;

  container.querySelector('#btn-log-bin').addEventListener('click', onLogBin);

  const banner = container.querySelector('#ai-banner');
  if (banner) {
    banner.addEventListener('click', (e) => {
      if (e.target.closest('#ai-banner-dismiss')) {
        try {
          localStorage.setItem(BANNER_DISMISSED, '1');
        } catch { /* storage unavailable */ }
        banner.remove();
        return;
      }
      onOpenSettings();
    });
  }
}
