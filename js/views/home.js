export function renderHome(container, { onLogBin }) {
  container.innerHTML = `
    <div class="stack">
      <h2 class="hero-title">BinBuilder</h2>
      <p class="hero-sub">Scan a QR label or photograph your bin, record items as you pack, then review and save.</p>
      <button type="button" id="btn-log-bin" class="btn btn-primary">Log a bin</button>
      <div class="card">
        <p class="card-title">How it works</p>
        <p class="muted" style="margin:0;line-height:1.6">
          1. Identify the bin (QR label or photo)<br>
          2. Record video while adding items<br>
          3. Review frames and save
        </p>
      </div>
      <p class="muted" style="font-size:0.85rem;margin:0">
        Pre-printed QR labels available for purchase. Photo mode works with handwritten labels too.
      </p>
    </div>
  `;

  container.querySelector('#btn-log-bin').addEventListener('click', onLogBin);
}