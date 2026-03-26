/**
 * PageGuard — automatic white screen and SSL error recovery.
 *
 * Wraps Playwright's Page object to:
 *  1. Detect blank/white screens after any navigation
 *  2. Detect SSL / certificate / net-error pages
 *  3. Retry with page.reload() up to `maxRetries` times before throwing
 *
 * Used via the custom base fixture (src/fixtures/base.ts) which patches
 * page.goto() automatically — no changes needed in individual spec files.
 */

import { Page } from '@playwright/test';

/**
 * Thrown when white-screen / SSL errors cannot be recovered by reloading.
 * Playwright treats any thrown error as a test failure and — when `retries`
 * is set in playwright.config.ts — restarts the ENTIRE test from Step 1.
 * After `retries` attempts the test is marked failed and the trace is saved
 * for the debugging process.
 */
export class RetryFromStartError extends Error {
  constructor(reason: string) {
    super(`[RETRY_FROM_START] ${reason}`);
    this.name = 'RetryFromStartError';
  }
}

/** Text patterns that identify error / blank pages */
const ERROR_PATTERNS = [
  'ERR_SSL',
  'ERR_CERT',
  'ERR_BAD_SSL',
  'NET::ERR',
  'Your connection is not private',
  "This site can't be reached",
  'SSL_ERROR',
  'CERT_COMMON_NAME_INVALID',
  'Secure Connection Failed',
  'ERR_CONNECTION_REFUSED',
  'ERR_TIMED_OUT',
];

/** Maximum reload attempts before giving up */
const MAX_RETRIES = 3;
/** ms to wait after a reload before re-checking */
const RETRY_DELAY_MS = 2000;

export class PageGuard {
  constructor(private page: Page) {}

  /**
   * Check whether the current page is a white/blank screen or error page.
   * Returns a description string if an issue is found, empty string if OK.
   */
  async detectIssue(): Promise<string> {
    try {
      const result = await this.page.evaluate((): string => {
        const body = document.body;
        if (!body) return 'NO_BODY';

        const html = document.documentElement.outerHTML;

        // White / blank screen: body is effectively empty
        const text = body.innerText?.trim() ?? '';
        const hasContent = body.children.length > 0 && text.length > 10;
        if (!hasContent) return 'WHITE_SCREEN';

        // Chrome "This site can't be reached" / SSL error pages
        // Chrome renders these in a shadow-DOM div with id="main-message"
        const errorBox = document.getElementById('main-message');
        if (errorBox) return `CHROME_ERROR:${errorBox.textContent?.trim().slice(0, 80)}`;

        // Generic SSL / network error patterns in page source
        const errorPatterns = [
          'ERR_SSL', 'ERR_CERT', 'NET::ERR', 'ERR_BAD_SSL',
          "Your connection is not private", 'SSL_ERROR',
          'Secure Connection Failed', 'ERR_CONNECTION_REFUSED',
        ];
        for (const p of errorPatterns) {
          if (html.includes(p)) return `SSL_OR_NET_ERROR:${p}`;
        }

        return '';
      });
      return result;
    } catch {
      // If evaluate itself throws (e.g. page crashed) treat as blank
      return 'EVALUATE_FAILED';
    }
  }

  /**
   * Navigate to a URL with automatic white-screen / SSL retry.
   * Retries up to MAX_RETRIES times using page.reload() before re-throwing.
   */
  async safeGoto(
    url: string,
    options?: Parameters<Page['goto']>[1],
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          ...options,
        });
        // Wait for SPA to finish rendering (Ember/React apps need networkidle)
        await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await this.page.waitForTimeout(500);

        const issue = await this.detectIssue();
        if (!issue) return; // Page loaded cleanly

        console.warn(
          `[PageGuard] safeGoto detected "${issue}" on attempt ${attempt}/${MAX_RETRIES} — reloading…`,
        );
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        const isRecoverable = ERROR_PATTERNS.some((p) => msg.includes(p));
        if (!isRecoverable || attempt === MAX_RETRIES) throw err;
        console.warn(
          `[PageGuard] Navigation error on attempt ${attempt}/${MAX_RETRIES}: ${msg.slice(0, 100)} — reloading…`,
        );
      }

      if (attempt < MAX_RETRIES) {
        await this.page.waitForTimeout(RETRY_DELAY_MS);
        try {
          await this.page.reload({ waitUntil: 'domcontentloaded' });
        } catch {
          // reload itself may throw if page is in an error state — continue loop
        }
      }
    }

    // Final check after all retries
    const finalIssue = await this.detectIssue();
    if (finalIssue) {
      // Throw RetryFromStartError so Playwright restarts the test from Step 1
      throw new RetryFromStartError(
        `Page still shows "${finalIssue}" after ${MAX_RETRIES} reload attempts for URL: ${url}`,
      );
    }
  }

  /**
   * Wrap any async step with white-screen / SSL recovery.
   * If the step throws OR if the page is blank/errored after the step,
   * reload the page and retry the step once.
   *
   * Usage:
   *   await guard.withGuard(() => page.getByRole('button').click());
   */
  async withGuard<T>(
    fn: () => Promise<T>,
    label = 'step',
  ): Promise<T> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await fn();

        // Check for white screen AFTER the step too
        const issue = await this.detectIssue();
        if (issue) {
          console.warn(
            `[PageGuard] "${issue}" detected after ${label} (attempt ${attempt}) — reloading…`,
          );
          if (attempt < 2) {
            await this.page.waitForTimeout(RETRY_DELAY_MS);
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            continue;
          }
        }
        return result;
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        const isRecoverable =
          ERROR_PATTERNS.some((p) => msg.includes(p)) ||
          msg.includes('white') ||
          msg.includes('blank');

        if (!isRecoverable || attempt >= 2) throw err;

        console.warn(
          `[PageGuard] Recoverable error in ${label} (attempt ${attempt}): ${msg.slice(0, 120)} — reloading…`,
        );
        await this.page.waitForTimeout(RETRY_DELAY_MS);
        try {
          await this.page.reload({ waitUntil: 'domcontentloaded' });
        } catch {
          // ignore reload errors
        }
      }
    }
    // All withGuard attempts exhausted — throw RetryFromStartError so
    // Playwright restarts the test from Step 1 (up to config retries limit)
    throw new RetryFromStartError(`${label} failed after 2 internal reload attempts`);
  }
}
