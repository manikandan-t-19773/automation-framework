import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();  // This line is critical

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  workers: 2,
  /** 5 min per test — sufficient for the longest flow (create+configure+drag+fill). */
  timeout: 300_000,
  /** Per-assertion wait: 15 s — visible elements resolve in <5 s on a healthy page. */
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://flow.localzoho.com',
    /** 30 s per action (click, fill, hover, …) — measured steps complete in <10 s. */
    actionTimeout: 30_000,
    /** 60 s per navigation — Zoho SPA route changes take 5–15 s; 60 s is generous. */
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        channel: 'chrome',
        ignoreHTTPSErrors: true,
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'playwright/.auth/user.json',
        ignoreHTTPSErrors: true,
        // Override viewport: default Desktop Chrome is 1280×720.
        // The Zoho Flow canvas drop zone renders at y≈742 which is 
        // below the 720px fold — use 900px to keep it fully visible.
        viewport: { width: 1280, height: 900 },
        launchOptions: {
          args: ['--ignore-certificate-errors'],
        },
      },
      dependencies: ['setup'],
    },
    // {
    //   name: 'firefox',
    //   use: { 
    //     ...devices['Desktop Firefox'],
    //     storageState: 'playwright/.auth/user.json',  // Add for firefox too
    //   },
    //   dependencies: ['setup'],  // Add dependency
    // },
    // {
    //   name: 'mobile',
    //   use: { 
    //     ...devices['Pixel 5'],
    //     storageState: 'playwright/.auth/user.json',  // Add for mobile too
    //   },
    //   dependencies: ['setup'],  // Add dependency
    // },
  ],
});