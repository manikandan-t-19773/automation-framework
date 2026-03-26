import 'dotenv/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { crawlPage, DOMSnapshot } from './domCrawler';
import { generateTests } from './testGenerator';
import { saveSnapshot, loadAllSnapshots, urlToSlug } from './snapshotStore';
import * as fs from 'fs';
import * as path from 'path';

const GENERATED_DIR = path.join(process.cwd(), 'src', 'tests', 'generated');
const SNAPSHOT_DIR  = path.join(process.cwd(), 'src', 'dom-snapshots');
const BASE_URL      = 'https://flow.localzoho.com';
const AUTH_FILE     = 'playwright/.auth/user.json';

// ─── Known Zoho Flow routes to probe directly ────────────────────────────────
const SEED_ROUTES: string[] = [
  '/#',
  '/#/workspace/default/flows',
  '/#/workspace/default/connections',
  '/#/workspace/default/history',
  '/#/workspace/default/analytics',
  '/#/workspace/default/settings',
  '/#/workspace/default/apps',
  '/#/explore',
  '/#/apps',
  '/#/dashboard',
  '/#/workspace/default',
  '/#/workspace/default/flows/create',
  '/#/workspace/default/integration',
  '/#/workspace/default/team',
];

// Sidebar / nav text labels to click — ordered from most to least likely
const NAV_LABELS: string[] = [
  'Dashboard', 'My Flows', 'Flows', 'Connections', 'History',
  'Analytics', 'Reports', 'Settings', 'Apps', 'Integrations',
  'Team', 'Members', 'Explore', 'Gallery', 'Templates',
  'Notifications', 'Account', 'Profile', 'Billing', 'Subscription',
  'Logs', 'Activity', 'Manage', 'Workflows',
];

// CSS selectors identifying navigation containers
const NAV_SELECTORS = [
  'nav a', 'nav li', 'nav [role="menuitem"]',
  '.sidebar a', '.sidebar li', '.sidebar [data-route]',
  '[role="navigation"] a', '[role="navigation"] li',
  '.left-panel a', '.left-panel li',
  '.menu-item', '.nav-item', '.navitem',
  '[routerlink]', '[ng-href]', '[data-href]',
  '[class*="sidebar"] a', '[class*="nav"] a',
  '[class*="menu"] a', '[class*="menu"] li',
  '[class*="tab"] a', '[class*="tab"] li',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: current full URL (including hash) from the page
// ─────────────────────────────────────────────────────────────────────────────
async function currentUrl(page: Page): Promise<string> {
  return page.evaluate(() => window.location.href);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: collect all hash-based SPA routes visible on the current DOM
// ─────────────────────────────────────────────────────────────────────────────
async function collectHashRoutes(page: Page): Promise<string[]> {
  return page.evaluate((base: string) => {
    const routes = new Set<string>();
    document.querySelectorAll('[href],[data-href],[ng-href],[routerlink],[data-route]').forEach(el => {
      for (const attr of ['href', 'data-href', 'ng-href', 'routerlink', 'data-route']) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        if (val.startsWith('#/') || val.startsWith('/#/')) {
          routes.add(base.replace(/\/$/, '') + (val.startsWith('#') ? '/' + val : val));
        } else if (val.startsWith(base) && val.includes('#/')) {
          routes.add(val);
        }
      }
    });
    // Also from <script> JSON embedded route data
    document.querySelectorAll('script:not([src])').forEach(s => {
      const m = s.textContent?.matchAll(/"(\/[a-z0-9/_-]{3,60})"/gi);
      if (m) {
        for (const match of m) {
          if (match[1].includes('/workspace') || match[1].includes('/flow')) {
            routes.add(base + '/#' + match[1]);
          }
        }
      }
    });
    return Array.from(routes);
  }, BASE_URL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: wait for any hash URL change after an action (up to 4 s)
// ─────────────────────────────────────────────────────────────────────────────
async function waitForHashChange(page: Page, before: string, ms = 4000): Promise<string> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const after = await currentUrl(page);
    if (after !== before && after.includes('#')) return after;
    await page.waitForTimeout(200);
  }
  return await currentUrl(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Deep SPA page discovery
//   Strategy A – probe known seed routes
//   Strategy B – click every nav / sidebar element and track hash changes
//   Strategy C – collect href attributes from each visited page
// ─────────────────────────────────────────────────────────────────────────────
async function discoverPages(): Promise<string[]> {
  console.log('\n=== PHASE 1: Deep SPA page discovery ===\n');

  const browser: Browser = await chromium.launch({ headless: false });
  const contextOptions: any = {};
  if (fs.existsSync(AUTH_FILE)) contextOptions.storageState = AUTH_FILE;
  const context: BrowserContext = await browser.newContext(contextOptions);
  const page: Page = await context.newPage();

  const discovered = new Set<string>();
  const visited    = new Set<string>();

  // ── Strategy A: probe all seed routes ────────────────────────────────────
  console.log('--- Strategy A: probing seed routes ---');
  for (const route of SEED_ROUTES) {
    const url = BASE_URL + route;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      const actual = await currentUrl(page);
      if (actual.startsWith(BASE_URL)) {
        discovered.add(actual);
        console.log('  ✓ ' + actual);
        // also collect hash routes visible on this page
        const found = await collectHashRoutes(page);
        found.forEach(u => { if (u.startsWith(BASE_URL)) discovered.add(u); });
      }
    } catch {
      // route not accessible — skip
    }
  }

  // ── Strategy B: navigate to the main workspace and click every nav item ──
  console.log('\n--- Strategy B: click-based SPA navigation ---');
  const workflowUrl = BASE_URL + '/#/workspace/default/flows';

  try {
    await page.goto(workflowUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  } catch {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
  }

  // Click by text label
  for (const label of NAV_LABELS) {
    const before = await currentUrl(page);
    try {
      // Try multiple locator strategies for the label
      const locators = [
        page.getByRole('link', { name: new RegExp(label, 'i') }),
        page.getByRole('menuitem', { name: new RegExp(label, 'i') }),
        page.getByRole('tab', { name: new RegExp(label, 'i') }),
        page.locator(`nav, .sidebar, [role="navigation"], [class*="sidebar"], [class*="nav"], [class*="menu"]`)
            .getByText(new RegExp('^' + label + '$', 'i')).first(),
      ];
      let clicked = false;
      for (const loc of locators) {
        if (await loc.count() > 0) {
          await loc.first().click({ timeout: 3000 });
          clicked = true;
          break;
        }
      }
      if (!clicked) continue;

      const after = await waitForHashChange(page, before, 3500);
      if (after !== before && after.startsWith(BASE_URL)) {
        if (!discovered.has(after)) {
          console.log(`  ✓ [click "${label}"] ${after}`);
          discovered.add(after);
        }
        // Collect any new routes visible after navigation
        const found = await collectHashRoutes(page);
        found.forEach(u => { if (u.startsWith(BASE_URL)) discovered.add(u); });

        // Look for sub-tabs on this page and click them too
        const tabs = await page.locator('[role="tab"], [class*="tab"], .subtab, .sub-nav a').all();
        for (const tab of tabs.slice(0, 8)) {
          const tabBefore = await currentUrl(page);
          try {
            await tab.click({ timeout: 2000 });
            const tabAfter = await waitForHashChange(page, tabBefore, 2500);
            if (tabAfter !== tabBefore && tabAfter.startsWith(BASE_URL)) {
              if (!discovered.has(tabAfter)) {
                const tabText = await tab.textContent().then(t => t?.trim() || 'tab') .catch(() => 'tab');
                console.log(`    ✓ [sub-tab "${tabText}"] ${tabAfter}`);
                discovered.add(tabAfter);
              }
            }
          } catch { /* tab not clickable */ }
        }

        // Return to main page for next nav item
        await page.goto(workflowUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);
      }
    } catch { /* element not found */ }
  }

  // ── Strategy C: click ALL nav-selector elements found on the page ────────
  console.log('\n--- Strategy C: bulk nav element clicking ---');
  try {
    await page.goto(workflowUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  } catch { /* fallback */ }

  for (const sel of NAV_SELECTORS) {
    try {
      const elements = await page.locator(sel).all();
      for (const el of elements.slice(0, 15)) {
        const before = await currentUrl(page);
        try {
          const txt = await el.textContent().then(t => t?.trim().substring(0, 40) || '').catch(() => '');
          if (!txt) continue;
          if (/logout|signout|signup|register|login/i.test(txt)) continue;
          await el.click({ timeout: 2000, force: false });
          const after = await waitForHashChange(page, before, 3000);
          if (after !== before && after.startsWith(BASE_URL) && !discovered.has(after)) {
            console.log(`  ✓ [${sel} "${txt}"] ${after}`);
            discovered.add(after);
            const found = await collectHashRoutes(page);
            found.forEach(u => { if (u.startsWith(BASE_URL)) discovered.add(u); });
          }
        } catch { /* not clickable */ }
      }
    } catch { /* selector not found */ }
  }

  // ── Strategy D: scrape href/routerLink from entire DOM ───────────────────
  console.log('\n--- Strategy D: DOM href scraping ---');
  const allUrls = [...discovered];
  for (const url of allUrls.slice(0, 20)) {
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      const found = await collectHashRoutes(page);
      found.forEach(u => { if (u.startsWith(BASE_URL)) discovered.add(u); });
    } catch { /* skip */ }
  }

  await browser.close();

  // Filter and deduplicate: only keep flow.localzoho.com URLs
  const urls = Array.from(discovered)
    .filter(u =>
      u.startsWith(BASE_URL) &&
      !u.includes('logout') &&
      !u.includes('signout') &&
      !u.includes('signup') &&
      !u.includes('store.localzoho') &&
      u.length < 300
    )
    .sort();

  console.log('\n✅ Discovered ' + urls.length + ' unique page(s):');
  urls.forEach(u => console.log('  ' + u));
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Capture full DOM snapshot for every discovered URL
// ─────────────────────────────────────────────────────────────────────────────
async function captureSnapshots(urls: string[], force = false): Promise<void> {
  console.log('\n=== PHASE 2: Capture DOM snapshots (' + urls.length + ' pages) ===\n');
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const slug = urlToSlug(url);
    const snapshotPath = path.join(SNAPSHOT_DIR, slug + '.json');

    if (!force && fs.existsSync(snapshotPath)) {
      console.log(`  [${i + 1}/${urls.length}] [cached] ${url}`);
      continue;
    }

    try {
      console.log(`  [${i + 1}/${urls.length}] Capturing: ${url}`);
      const snapshot: DOMSnapshot = await crawlPage(url);

      console.log(
        `    → headings=${snapshot.headings.length}` +
        ` buttons=${snapshot.buttons.length}` +
        ` inputs=${snapshot.inputs.length}` +
        ` links=${snapshot.links.length}` +
        ` tables=${snapshot.tables.length}` +
        ` regions=${snapshot.regions.length}`
      );

      saveSnapshot(snapshot);
    } catch (err) {
      console.error(`  ✗ Failed capturing ${url}: ${(err as Error).message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Generate Playwright test files from snapshots via Ollama
// ─────────────────────────────────────────────────────────────────────────────
async function generateAllTests(force = false): Promise<void> {
  console.log('\n=== PHASE 3: Generate test files ===\n');
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const snapshots: DOMSnapshot[] = loadAllSnapshots();
  console.log('Loaded ' + snapshots.length + ' snapshot(s) from disk.\n');

  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    const slug = urlToSlug(snapshot.url);
    const outFile = path.join(GENERATED_DIR, slug + '.spec.ts');

    if (!force && fs.existsSync(outFile)) {
      console.log(`  [${i + 1}/${snapshots.length}] [cached] ${snapshot.url}`);
      skipped++;
      continue;
    }

    console.log(`\n  [${i + 1}/${snapshots.length}] Generating → ${snapshot.url}`);

    try {
      const testCode = await generateTests(snapshot);

      if (!testCode || testCode.trim().length < 50) {
        throw new Error('Generated code too short / empty.');
      }

      fs.writeFileSync(outFile, testCode, 'utf-8');
      console.log(`  ✓ Written: ${outFile}`);
      generated++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${(err as Error).message}`);
      failed++;
    }

    // Throttle Ollama calls
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n=== Generation complete ===`);
  console.log(`  Generated : ${generated}`);
  console.log(`  Skipped   : ${skipped}  (use --force to regenerate)`);
  console.log(`  Failed    : ${failed}`);
  console.log(`\nRun tests with: npm test`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
//   Flags:
//     --snapshots-only   run phases 1 & 2 only (no LLM)
//     --generate-only    skip discovery, generate from existing snapshots
//     --force            re-capture and re-generate even if files exist
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args         = process.argv.slice(2);
  const snapshotsOnly = args.includes('--snapshots-only');
  const generateOnly  = args.includes('--generate-only');
  const force         = args.includes('--force');

  if (!generateOnly) {
    const urls = await discoverPages();
    await captureSnapshots(urls, force);
  }

  if (!snapshotsOnly) {
    await generateAllTests(force);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
