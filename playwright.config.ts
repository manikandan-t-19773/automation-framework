import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();  // This line is critical

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  workers: 2,
  /** Max duration for a single test (all steps).  10 min gives room for 17
   *  steps × 120 s each while still failing fast on a hung browser. */
  timeout: 600_000,
  /** Per-assertion wait: 2 minutes before a toBeVisible / not.toBeChecked
   *  assertion gives up.  Playwright will then retry the whole test. */
  expect: { timeout: 120_000 },
  retries: 2,  // attempt 1 normal + 2 retries; 3rd failure triggers trace/debug
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://flow.localzoho.com',
    /** 2 minutes for every individual action (click, fill, hover, …) */
    actionTimeout: 120_000,
    /** 2 minutes for every page.goto / page.waitForURL / waitForLoadState */
    navigationTimeout: 120_000,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
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