/**
 * Base test fixture — extends Playwright's built-in `test` with automatic
 * white-screen and SSL error recovery via PageGuard.
 *
 * What it does:
 *  - Patches page.goto() to use PageGuard.safeGoto() (auto-reload on blank/SSL)
 *  - Registers a page.on('requestfailed') listener that logs SSL/cert errors
 *    and triggers a reload + retry
 *  - Exposes a `guard` fixture for wrapping individual steps with withGuard()
 *
 * All spec files should import { test, expect } from '../../fixtures/base'
 * instead of '@playwright/test'.  The `expect` re-export is identical so
 * no other changes are needed in specs.
 */

import { test as base, expect, Page } from '@playwright/test';
import { PageGuard, RetryFromStartError } from '../helpers/pageGuard';

const MAIN_PAGE = process.env.BASE_URL || 'https://flow.localzoho.com';

/** Error substrings that indicate SSL / network / blank-page problems */
const RECOVERABLE = [
  'ERR_SSL', 'ERR_CERT', 'ERR_BAD_SSL', 'NET::ERR',
  'SSL_ERROR', 'ERR_CONNECTION_REFUSED', 'ERR_TIMED_OUT',
  'ERR_BAD_SSL_CLIENT_AUTH_CERT',
];

function isRecoverable(msg: string): boolean {
  return RECOVERABLE.some((p) => msg.includes(p));
}

// ── Patch page.goto to use PageGuard.safeGoto ──────────────────────────────
function patchGoto(page: Page, guard: PageGuard): void {
  const origGoto = page.goto.bind(page);

  // Override goto — TypeScript cast needed to replace the bound method
  (page as any).goto = async (
    url: string,
    options?: Parameters<Page['goto']>[1],
  ) => {
    try {
      return await origGoto(url, options);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (!isRecoverable(msg)) throw err;

      console.warn(`[BaseFixture] goto caught recoverable error: ${msg.slice(0, 100)} — retrying via safeGoto…`);
      await guard.safeGoto(url, options);
      return null;
    }
  };
}

// ── Extended fixtures ──────────────────────────────────────────────────────
type ExtraFixtures = {
  /** PageGuard instance — use guard.withGuard(() => ...) for step-level retry */
  guard: PageGuard;
};

export const test = base.extend<ExtraFixtures>({
  // Override the built-in `page` fixture to inject guard behaviour
  page: async ({ page }, use) => {
    const guard = new PageGuard(page);

    // ── 1. Patch goto ────────────────────────────────────────────────────────
    patchGoto(page, guard);

    // ── 2. Pre-test white-screen / SSL guard ─────────────────────────────────
    // Runs BEFORE every test attempt (including retries). If the page is already
    // showing a white/error screen from a previous run, reload once. If still
    // broken, throw RetryFromStartError so this attempt is counted as a retry.
    // Skip entirely on a fresh page (about:blank) — nothing to check yet.
    const currentUrl = page.url();
    const isBlankPage = !currentUrl || currentUrl === 'about:blank';
    const preIssue = isBlankPage ? null : await guard.detectIssue().catch(() => 'DETECT_FAILED');
    if (preIssue) {
      console.warn(`[BaseFixture] Pre-test issue "${preIssue}" — reloading before test starts…`);
      try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch { /* ignore */ }
      const postReloadIssue = await guard.detectIssue().catch(() => 'DETECT_FAILED');
      if (postReloadIssue) {
        throw new RetryFromStartError(`Pre-test page state unrecoverable: "${postReloadIssue}"`);
      }
    }

    // ── 3. Network-failure listener ──────────────────────────────────────────
    // Logs SSL/certificate request failures and schedules one reload attempt.
    // The reload gives the app a chance to recover; if the next Playwright
    // action then times out, Playwright will retry the test from Step 1.
    let reloadScheduled = false;
    page.on('requestfailed', async (request) => {
      const failure = request.failure()?.errorText ?? '';
      if (isRecoverable(failure) && !reloadScheduled) {
        reloadScheduled = true;
        console.warn(
          `[BaseFixture] Request failed with "${failure}" on ${request.url().slice(0, 80)} — scheduling reload…`,
        );
        setTimeout(async () => {
          try {
            await page.reload({ waitUntil: 'domcontentloaded' });
          } catch { /* ignore */ }
          reloadScheduled = false;
        }, 1500);
      }
    });

    // ── 4. Navigate to main page before every test attempt ───────────────────
    // Ensures every test starts from a known, authenticated landing page
    // regardless of where the browser was left after a previous run.
    console.log(`[BaseFixture] Navigating to main page before test…`);
    await guard.safeGoto(MAIN_PAGE);

    try {
      await use(page);
    } finally {
      // ── 5. Return to main page after every test (pass OR fail) ─────────────
      // Resets the browser to a clean known state for the next test / report.
      try {
        await page.goto(MAIN_PAGE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        console.log('[BaseFixture] Main page loaded after test.');
      } catch {
        // Non-fatal — don't mask the original test result
      }
    }
  },

  // Expose guard fixture for per-step wrapping in specs that need it
  guard: async ({ page }, use) => {
    const guard = new PageGuard(page);
    await use(guard);
  },
});

export { expect };
