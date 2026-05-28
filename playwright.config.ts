import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL: process.env.LIA_E2E_PWA_URL ?? 'https://pwa.aneety.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Pixel 7']
  },
  reporter: process.env.CI ? 'github' : 'list'
});
