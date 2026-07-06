import { defineConfig, devices } from '@playwright/test';

const PORT = 4610;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Mobile-first PWA: test at a phone-sized portrait viewport.
        viewport: { width: 390, height: 844 },
        permissions: ['camera'],
        launchOptions: {
          args: [
            // Feed getUserMedia a synthetic camera that actually decodes
            // frames (so video.videoWidth is populated) and auto-approve it.
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npx serve -l ${PORT} .`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
