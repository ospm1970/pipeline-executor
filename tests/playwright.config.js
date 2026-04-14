import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/ui.test.js',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { outputFolder: 'tests/playwright-report', open: 'never' }]],
  webServer: {
    command: 'node ../server.js',
    url: 'http://localhost:3001/health',
    timeout: 15000,
    reuseExistingServer: true,
    env: {
      API_KEY: 'test-ui-key',
      PORT: '3001',
      OPENAI_API_KEY: 'test-dummy-key',
    },
  },
});
