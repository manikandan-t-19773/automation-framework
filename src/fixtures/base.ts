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
import { PageGuard } from '../helpers/pageGuard';

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

    // 1. Patch goto
    patchGoto(page, guard);

    // 2. Listen for failed requests — log SSL/cert failures and reload once
    let reloadScheduled = false;
    page.on('requestfailed', async (request) => {
      const failure = request.failure()?.errorText ?? '';
      if (isRecoverable(failure) && !reloadScheduled) {
        reloadScheduled = true;
        console.warn(
          `[BaseFixture] Request failed with "${failure}" on ${request.url().slice(0, 80)} — scheduling reload…`,
        );
        // Small delay so current event loop drains
        setTimeout(async () => {
          try {
            await page.reload({ waitUntil: 'domcontentloaded' });
          } catch { /* ignore */ }
          reloadScheduled = false;
        }, 1500);
      }
    });

    await use(page);
  },

  // Expose guard fixture for per-step wrapping in specs that need it
  guard: async ({ page }, use) => {
    const guard = new PageGuard(page);
    await use(guard);
  },
});

export { expect };
