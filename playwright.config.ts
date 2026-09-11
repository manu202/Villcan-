import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'es-PY',
    timezoneId: 'America/Asuncion',
  },

  projects: [
    // Global auth setup — runs once before authenticated tests
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // Public routes — no auth (storefront)
    {
      name: 'public',
      use: { ...devices['Pixel 5'] },
      testMatch: /storefront\.spec\.ts/,
    },

    // Authenticated backoffice routes
    {
      name: 'authenticated',
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /storefront\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
