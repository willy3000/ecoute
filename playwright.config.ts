import { defineConfig } from '@playwright/test';

// Runs against the production build in the locally installed Chrome.
const baseURL = process.env.E2E_URL ?? 'http://localhost:4173/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    acceptDownloads: true,
    permissions: ['microphone'],
  },
  webServer: process.env.E2E_URL ? undefined : { command: 'npm run preview', url: baseURL, reuseExistingServer: true, timeout: 30_000 },
});
