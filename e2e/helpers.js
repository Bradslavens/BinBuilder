// The camera itself is provided by Chromium's synthetic media device
// (enabled via launch flags in playwright.config.js), which decodes real
// frames so video.videoWidth is populated and MediaRecorder works.
//
// Here we only need to keep the service worker out of the way so it can never
// serve a stale asset mid-test.
export async function setupPage(page) {
  await page.addInitScript(() => {
    if (window.navigator.serviceWorker) {
      navigator.serviceWorker.register = () =>
        Promise.reject(new Error('service worker disabled in e2e'));
    }
  });
}
