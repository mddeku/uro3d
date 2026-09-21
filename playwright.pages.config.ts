import { defineConfig } from '@playwright/test';

// Test the production bundle under a repository subpath, as on GitHub Pages.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/uro3d/',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.URO3D_BROWSER || undefined,
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort --base /uro3d/',
    url: 'http://127.0.0.1:4173/uro3d/',
    reuseExistingServer: false,
  },
});
