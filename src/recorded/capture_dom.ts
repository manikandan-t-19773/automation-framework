/**
 * capture_dom.ts  — Full-product DOM crawler for flow.localzoho.com
 * ─────────────────────────────────────────────────────────────────────────────
 * Navigates EVERY reachable page + popup in Zoho Flow and saves snapshots to
 *   dom-snapshots/<page-label>/
 *
 * Each folder contains:
 *   dom.html        – full page / modal HTML
 *   screenshot.png  – visual reference
 *   inputs.json     – every <input>/<textarea>/<select> with all attributes
 *   buttons.json    – every button/link with text + attributes
 *   modals.json     – every visible overlay/popup
 *   elements.json   – important elements (id/name/aria/role/testid)
 *
 * npm run capture:dom              → everything
 * npm run capture:dom:sendemail    → single popup
 * npx ts-node src/recorded/capture_dom.ts <label>
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs   from 'fs';
import * as path from 'path';
import { capturePageDOM, captureModal } from '../helpers/domCapture';

// ─── config ───────────────────────────────────────────────────────────────────
const BASE_URL  = 'https://flow.localzoho.com';
const AUTH_FILE = path.resolve(__dirname, '../../playwright/.auth/user.json');
const SNAPSHOTS = path.resolve(__dirname, '../../dom-snapshots');
const FLOW_NAME = `domcaptest${Date.now()}`;

// ─── helpers ──────────────────────────────────────────────────────────────────
const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);

async function tryClick(page: Page, sel: string, timeout = 10_000) {
  try {
    await page.locator(sel).first().waitFor({ state: 'visible', timeout });
    await page.locator(sel).first().click();
  } catch {
    console.warn(`    ⚠  tryClick failed: ${sel.slice(0, 60)}`);
  }
}

async function dragModule(page: Page, label: string, drop: { x: number; y: number }) {
  const src = page.locator(`p.zf-module-label:text-is("${label}")`).first();
  try {
    await src.waitFor({ state: 'attached', timeout: 10_000 });
    // Module list container may be scrolled — bring element into view first
    await src.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    await src.waitFor({ state: 'visible', timeout: 10_000 });
    const box = await src.boundingBox();
    if (!box) throw new Error('no bbox');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await settle(page, 300);
    await page.mouse.move(drop.x, drop.y, { steps: 25 });
    await settle(page, 400);
    await page.mouse.up();
    await settle(page, 2500);
  } catch (e) {
    console.warn(`    ⚠  drag "${label}" failed: ${String(e).slice(0, 80)}`);
  }
}

async function snap(page: Page, label: string, sel?: string) {
  console.log(`    📸  → dom-snapshots/${label}/`);
  await capturePageDOM(page, label, sel);
}

async function snapModal(page: Page, label: string) {
  await captureModal(page, label);
}

// ─── temp-flow lifecycle ──────────────────────────────────────────────────────
let tempFlowUrl = '';

async function createTempFlow(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  await tryClick(page, 'button:has-text("Create Flow"), a:has-text("Create Flow"), .create-flow-btn, [class*="createFlow"]');
  await settle(page, 1200);

  // Fill flow name — field is input[name="displayName"]
  const nameInput = page.locator('input[name="displayName"]').first();
  try {
    await nameInput.waitFor({ state: 'visible', timeout: 8_000 });
    await nameInput.fill(FLOW_NAME);
  } catch {
    console.warn('    ⚠  flow name input not found');
    return false;
  }
  await settle(page, 400);

  // Zoho Flow's submit button: input#createFlowButton (type="submit")
  const preCreateUrl = page.url();
  try {
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first()
      .waitFor({ state: 'visible', timeout: 6_000 });
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
  } catch {
    await page.keyboard.press('Enter');
  }

  // Debug snapshot right after click
  const dbgDir = path.join(SNAPSHOTS, 'debug', 'create-flow-submit');
  fs.mkdirSync(dbgDir, { recursive: true });
  await settle(page, 800);
  await page.screenshot({ path: path.join(dbgDir, '01-after-click.png') }).catch(() => {});
  fs.writeFileSync(path.join(dbgDir, '01-url.txt'), page.url());
  console.log(`    URL after click: ${page.url()}`);

  // Canvas URL for Zoho Flow is: .../flows/{name}/edit
  try {
    await page.waitForURL(
      (url: URL) => url.href.includes('/edit') && url.href !== preCreateUrl,
      { timeout: 20_000 }
    );
  } catch {
    await settle(page, 3000);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await settle(page, 2000);

  const url = page.url();
  await page.screenshot({ path: path.join(dbgDir, '02-after-wait.png') }).catch(() => {});
  fs.writeFileSync(path.join(dbgDir, '02-url.txt'), url);
  console.log(`    URL after wait: ${url}`);

  const isCanvas = url.includes('/edit') && url !== preCreateUrl;
  if (isCanvas) {
    tempFlowUrl = url;
    console.log(`    ✅  Canvas ready: ${url}`);
  } else {
    console.warn(`    ⚠  Canvas URL not reached (URL: ${url})`);
    // Last attempt: open the new flow from the list
    try {
      await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
      await settle(page, 1200);
      const flowLink = page.locator(`tr:has-text("${FLOW_NAME}") a, a:has-text("${FLOW_NAME}")`).first();
      await flowLink.waitFor({ state: 'visible', timeout: 5_000 });
      await flowLink.click();
      await settle(page, 3000);
      const url3 = page.url();
      if (url3.includes('/edit')) {
        tempFlowUrl = url3;
        console.log(`    ✅  Canvas (via list): ${url3}`);
      }
    } catch { /* give up */ }
  }
  return !!tempFlowUrl;
}

async function deleteTempFlow(page: Page) {
  try {
    await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
    await settle(page, 1200);
    const row = page.locator(`text="${FLOW_NAME}"`).first();
    await row.hover({ timeout: 5_000 });
    await page.locator(`tr:has-text("${FLOW_NAME}") [title*="delete" i], tr:has-text("${FLOW_NAME}") .zf-delete, tr:has-text("${FLOW_NAME}") [class*="delete"]`).first().click();
    await settle(page, 600);
    await tryClick(page, 'button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete")');
    await settle(page, 1000);
    console.log(`    🗑  Temp flow "${FLOW_NAME}" deleted`);
  } catch {
    console.warn(`    ⚠  Could not auto-delete "${FLOW_NAME}" — delete manually`);
  }
}

// ─── helpers to navigate back to canvas ──────────────────────────────────────
async function goCanvas(page: Page) {
  if (!tempFlowUrl) return;
  await page.goto(tempFlowUrl, { waitUntil: 'networkidle' });
  await settle(page, 2000);
}

async function openBuiltins(page: Page, tab: string) {
  // When a trigger is configured the Built-ins tab is fully visible and clickable.
  // When NO trigger is configured (trigger chooser visible) the side-bar container
  // has pointer-events:none so we must fall back to dispatchEvent.
  const builtinsLoc = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });
  await builtinsLoc.first().waitFor({ state: 'attached', timeout: 15_000 });

  // Try regular click first (works when trigger is configured — normal interaction)
  let regularClickWorked = false;
  try {
    await builtinsLoc.first().waitFor({ state: 'visible', timeout: 5_000 });
    await builtinsLoc.first().click({ timeout: 5_000 });
    regularClickWorked = true;
    console.log('    openBuiltins: regular click on Built-ins ✅');
  } catch {
    // Fall back to dispatchEvent (bypasses pointer-events CSS when no trigger)
    await builtinsLoc.first().dispatchEvent('click');
    console.log('    openBuiltins: dispatchEvent on Built-ins (pointer-events bypass)');
  }
  await settle(page, 1500);   // sidebar transition animation

  // Click the target sub-tab
  const tabLoc = page.locator('[data-ember-action]').filter({ hasText: new RegExp('^' + tab + '$', 'i') });
  try {
    if (regularClickWorked) {
      await tabLoc.first().waitFor({ state: 'visible', timeout: 8_000 });
      await tabLoc.first().click({ timeout: 5_000 });
    } else {
      await tabLoc.first().waitFor({ state: 'attached', timeout: 8_000 });
      await tabLoc.first().dispatchEvent('click');
    }
  } catch {
    await page.getByText(tab, { exact: true }).first().dispatchEvent('click').catch(() => {});
  }
  await settle(page, 1500);   // tab content load

  // Scroll sidebar list to top so modules are in the viewport
  await page.locator('div.sidebarMenuList').first()
    .evaluate((el: HTMLElement) => { el.scrollTop = 0; }).catch(() => {});

  // Final visibility check
  const modCount = await page.locator('p.zf-module-label:visible').count();
  console.log(`    openBuiltins(${tab}): ${modCount} visible module labels`);
}

async function closeModal(page: Page) {
  await page.keyboard.press('Escape');
  await settle(page, 600);
}

/** Ensures the flow has a Schedule trigger configured.
 *  Webhook trigger fails on this instance (server error generating URL → Next disabled).
 *  Schedule trigger wizard: Configure → select "Once" → set date 5 min in future → Apply → Done
 */
async function ensureTrigger(page: Page) {
  const currUrl = page.url();
  if (!currUrl.includes('/edit')) {
    console.warn(`    ⚠  ensureTrigger: not on canvas URL (${currUrl})`);
    return;
  }
  // Reload to get a fresh canvas state
  await page.goto(currUrl, { waitUntil: 'networkidle' });
  await settle(page, 1500);

  // Check: trigger chooser tiles present means no trigger configured
  const tiles = await page.locator('li.zf-tigger-list:visible').count();
  if (tiles === 0) {
    // Also verify the sidebar is actually visible (not just tiles hidden by overlay)
    const sidebarDisplay = await page.locator('aside.buildersideBar, aside.menu.buildersideBar').first()
      .evaluate((el: HTMLElement) => window.getComputedStyle(el).display).catch(() => 'unknown');
    if (sidebarDisplay !== 'none') {
      console.log('    ✅  Trigger already configured (sidebar visible)');
      return;
    }
  }

  if (tiles > 0) {
    console.log(`    Trigger not configured (${tiles} tile(s) visible) — setting up Schedule trigger...`);
  } else {
    console.log('    Tiles hidden but sidebar display:none — re-configuring Schedule trigger...');
  }

  // ── Step 1: Click "Configure" on the Schedule tile (index 1) ──────────────
  const scheduleTile = page.locator('li.zf-tigger-list')
    .filter({ has: page.locator('small:text-is("Schedule")') });
  const sCnt = await scheduleTile.count();
  console.log(`    Schedule tile count: ${sCnt}`);

  try {
    if (sCnt > 0) {
      const btn = scheduleTile.locator('button[name="Continue"]').first();
      await btn.waitFor({ state: 'attached', timeout: 5_000 });
      await btn.dispatchEvent('click');
      console.log('    Clicked Schedule → Configure');
    } else {
      // Fallback: Schedule is the 2nd Configure button (index 1)
      await page.locator('button[name="Continue"]').nth(1).dispatchEvent('click');
      console.log('    Clicked nth(1) Configure (Schedule fallback)');
    }
  } catch (e) {
    console.warn(`    ⚠  Schedule Configure click failed: ${String(e).slice(0, 80)}`);
    return;
  }
  await settle(page, 2000);

  // ── Step 2: Select frequency "Once" ────────────────────────────────────────
  const freqWrapper = page.locator('.customSelect_scheduleBy');
  try {
    await freqWrapper.waitFor({ state: 'visible', timeout: 10_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await settle(page, 500);
    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect-ul li')
      .filter({ hasText: /^Once$/i }).first();
    try {
      await onceOpt.waitFor({ state: 'visible', timeout: 5_000 });
      await onceOpt.click();
    } catch {
      await page.getByText('Once', { exact: true }).first().click();
    }
    await settle(page, 500);
    console.log('    Selected frequency: Once ✅');
  } catch (e) {
    console.warn(`    ⚠  Frequency selector failed: ${String(e).slice(0, 80)}`);
  }

  // ── Step 3: Set start date 5 minutes from now ───────────────────────────────
  try {
    const d = new Date(Date.now() + 5 * 60_000);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${p2(d.getMonth()+1)}/${p2(d.getDate())}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    if (await dateBox.count() > 0) {
      await dateBox.fill(dateStr);
      console.log(`    Set date: ${dateStr} ✅`);
    }
  } catch (e) {
    console.warn(`    ⚠  Date fill failed: ${String(e).slice(0, 60)}`);
  }
  await settle(page, 400);

  // ── Step 4: Click Apply ─────────────────────────────────────────────────────
  try {
    await page.getByRole('button', { name: /^apply$/i }).click();
    await settle(page, 600);
    console.log('    Clicked Apply ✅');
  } catch (e) {
    console.warn(`    ⚠  Apply click failed: ${String(e).slice(0, 60)}`);
  }

  // ── Step 5: Click Done ──────────────────────────────────────────────────────
  try {
    await page.getByRole('button', { name: /^done$/i }).click();
    await settle(page, 1500);
    console.log('    Clicked Done ✅');
  } catch (e) {
    console.warn(`    ⚠  Done click failed: ${String(e).slice(0, 60)}`);
  }

  // ── Verify: sidebar should now be visible ───────────────────────────────────
  const sidebarDisplay = await page.locator('aside.buildersideBar, aside.menu.buildersideBar').first()
    .evaluate((el: HTMLElement) => window.getComputedStyle(el).display).catch(() => 'unknown');
  const tilesAfter = await page.locator('li.zf-tigger-list:visible').count();
  if (sidebarDisplay !== 'none' || tilesAfter === 0) {
    console.log(`    ✅  Schedule trigger configured — sidebar display=${sidebarDisplay}, tiles=${tilesAfter}`);
  } else {
    console.warn(`    ⚠  Still not configured — sidebar=${sidebarDisplay}, tiles=${tilesAfter}`);
  }
  await settle(page, 800);
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Top-level pages (no flow context needed)
// ─────────────────────────────────────────────────────────────────────────────

async function cap01_flowsList(page: Page) {
  console.log('\n━━  [01] Flows List  ━━');
  await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
  await settle(page, 1500);
  await snap(page, 'flows-list');
}

async function cap02_createFlowDialog(page: Page) {
  console.log('\n━━  [02] Create Flow Dialog  ━━');
  await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
  await settle(page, 1000);
  await tryClick(page, 'button:has-text("Create Flow"), a:has-text("Create Flow")');
  await settle(page, 1200);
  await snap(page, 'create-flow-dialog');
  await closeModal(page);
}

async function cap03_flowsListActions(page: Page) {
  console.log('\n━━  [03] Flows list — search, filter, row hover  ━━');
  await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  // Search / filter
  await tryClick(page, 'input[type="search"], input[placeholder*="search" i], .zf-search-input');
  await settle(page, 500);
  await snap(page, 'flows-list-search-active');
  await page.keyboard.press('Escape');
  await tryClick(page, 'button[title*="filter" i], [aria-label*="filter" i], .zf-filter-btn');
  await settle(page, 600);
  await snap(page, 'flows-list-filter-open');
  await page.keyboard.press('Escape');
  // Row hover + context menu
  const firstRow = page.locator('tr.zf-table-row, .flow-item, .zf-flow-row').first();
  try {
    await firstRow.waitFor({ state: 'visible', timeout: 5_000 });
    await firstRow.hover();
    await settle(page, 500);
    await snap(page, 'flows-list-row-hover');
    await firstRow.click({ button: 'right' });
    await settle(page, 500);
    await snap(page, 'flows-list-context-menu');
    await page.keyboard.press('Escape');
  } catch { console.warn('    ⚠  No flow rows for hover'); }
}

async function cap04_connectionsPage(page: Page) {
  console.log('\n━━  [04] Connections  ━━');
  for (const u of [`${BASE_URL}/#/workspace/default/connections`, `${BASE_URL}/#/connections`]) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(page, 1500);
    if (!/\/flows$/.test(page.url())) { await snap(page, 'connections-page'); return; }
  }
  await tryClick(page, 'a:has-text("Connections"), nav a:has-text("Connect")');
  await settle(page, 1500);
  await snap(page, 'connections-page');
}

async function cap05_templatesPage(page: Page) {
  console.log('\n━━  [05] Templates / Marketplace  ━━');
  for (const u of [
    `${BASE_URL}/#/workspace/default/templates`,
    `${BASE_URL}/#/templates`,
    `${BASE_URL}/#/marketplace`,
  ]) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(page, 1500);
    if (!/\/flows$/.test(page.url())) { await snap(page, 'templates-page'); return; }
  }
  await tryClick(page, 'a:has-text("Templates"), a:has-text("Marketplace")');
  await settle(page, 1500);
  await snap(page, 'templates-page');
}

async function cap06_dashboardPage(page: Page) {
  console.log('\n━━  [06] Dashboard / Home  ━━');
  for (const u of [
    `${BASE_URL}/#/workspace/default/dashboard`,
    `${BASE_URL}/#/dashboard`,
    BASE_URL,
  ]) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(page, 1500);
    if (!/\/flows\/[^/]+/.test(page.url())) { await snap(page, 'dashboard-page'); return; }
  }
}

async function cap07_settingsPages(page: Page) {
  console.log('\n━━  [07] Settings pages  ━━');
  const urls: Array<[string, string]> = [
    [`${BASE_URL}/#/workspace/default/settings`,        'settings-workspace'],
    [`${BASE_URL}/#/settings`,                          'settings-global'],
    [`${BASE_URL}/#/workspace/default/account`,         'settings-account'],
    [`${BASE_URL}/#/workspace/default/preferences`,     'settings-preferences'],
    [`${BASE_URL}/#/workspace/default/notifications`,   'settings-notifications'],
    [`${BASE_URL}/#/workspace/default/audit`,           'settings-audit'],
  ];
  for (const [u, label] of urls) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(page, 1200);
    await snap(page, label);
  }
  // Nav icon fallback
  await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
  await settle(page, 1000);
  await tryClick(page, '[title*="setting" i], [aria-label*="setting" i], .zf-settings-nav, a:has-text("Settings")');
  await settle(page, 1500);
  await snap(page, 'settings-nav-open');
}

async function cap08_workspacePages(page: Page) {
  console.log('\n━━  [08] Workspace pages  ━━');
  for (const [u, label] of [
    [`${BASE_URL}/#/workspace`,                 'workspace-home'],
    [`${BASE_URL}/#/workspace/settings`,        'workspace-settings'],
    [`${BASE_URL}/#/workspace/default/members`, 'workspace-members'],
  ] as [string,string][]) {
    await page.goto(u, { waitUntil: 'networkidle' }).catch(() => {});
    await settle(page, 1200);
    await snap(page, label);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Flow Canvas & Trigger / Schedule
// ─────────────────────────────────────────────────────────────────────────────

async function cap09_canvasEmpty(page: Page) {
  console.log('\n━━  [09] Flow Canvas (empty)  ━━');
  await snap(page, 'flow-canvas-empty');
}

async function cap10_schedulePopup(page: Page) {
  console.log('\n━━  [10] Schedule trigger popup (capture-only)  ━━');
  // Trigger-chooser tile order: App(0), Schedule(1), Webhook(2), URL(3), Email(4), RSS(5), Subflow(6)
  // Click Schedule tile's Configure button to show the frequency chooser (for snapshot)
  const scheduleTile = page.locator('li.zf-tigger-list')
    .filter({ has: page.locator('small:text-is("Schedule")') });
  try {
    await scheduleTile.locator('button[name="Continue"]').click();
  } catch {
    console.warn('    ⚠  Schedule tile filter failed — trying nth(1)');
    await page.locator('.zf-chooseTrigger button[name="Continue"]').nth(1).click().catch(() => {});
  }
  await settle(page, 1800);
  await snap(page, 'schedule-popup');          // capture frequency chooser
  await snapModal(page, 'schedule-popup-modal');
  // Close WITHOUT saving — ensureTrigger() in cap12-14 sets up Webhook trigger
  await closeModal(page);
  await settle(page, 800);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Built-ins sidebar: all tabs
// ─────────────────────────────────────────────────────────────────────────────

async function cap11_builtinsAllTabs(page: Page) {
  console.log('\n━━  [11] Built-ins panel — all tabs  ━━');
  // Click Built-ins tab using correct selector with dispatchEvent (bypasses pointer-events CSS)
  const builtinsLoc = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });
  try {
    await builtinsLoc.first().waitFor({ state: 'attached', timeout: 15_000 });
    await builtinsLoc.first().dispatchEvent('click');
  } catch {
    await page.getByText('Built-ins', { exact: true }).first().dispatchEvent('click').catch(() => {});
  }
  await settle(page, 1200);
  await snap(page, 'builtins-panel');

  const allLabels: Record<string, string[]> = {};
  // Actual subtab names from Zoho Flow Built-ins panel (confirmed via auto_recorder.ts)
  for (const tab of ['Logic', 'Notification', 'Subflow', 'Webhooks', 'Custom Function', 'Commands & Scripts']) {
    const tabLoc = page.locator('[data-ember-action]').filter({ hasText: new RegExp('^' + tab + '$', 'i') });
    try {
      await tabLoc.first().waitFor({ state: 'attached', timeout: 8_000 });
      await tabLoc.first().dispatchEvent('click');
    } catch {
      await page.getByText(tab, { exact: true }).first().dispatchEvent('click').catch(() => {});
    }
    await settle(page, 800);
    const visible = await page.locator('p.zf-module-label').allTextContents();
    console.log(`    ${tab}: ${visible.length} modules`);
    if (visible.length > 0) {
      allLabels[tab] = visible.map(l => l.trim()).filter(Boolean);
      const safeTab = tab.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await snap(page, `builtins-${safeTab}-panel`);
    }
  }
  // Write combined module labels JSON
  const dir = path.join(SNAPSHOTS, 'all-module-labels');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'all-modules.json'), JSON.stringify(allLabels, null, 2));
  console.log('    Module labels saved:', Object.keys(allLabels));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Logic module popups
// ─────────────────────────────────────────────────────────────────────────────

async function cap12_setVariablePopup(page: Page) {
  console.log('\n━━  [12] Set Variable popup  ━━');
  await ensureTrigger(page);
  console.log(`    Page URL after ensureTrigger: ${page.url()}`);
  await openBuiltins(page, 'Logic');
  await dragModule(page, 'Set Variable', { x: 715, y: 434 });
  if (await page.locator('.workflowModal, [role="dialog"]').count() === 0) {
    console.warn('    ⚠  Set Variable popup did not open');
    return;
  }
  await snap(page, 'set-variable-popup');
  await snapModal(page, 'set-variable-popup-modal');
  // Save so canvas has a node
  await page.locator('input[name="variableValue"], input[name="value"]').first().fill('qatest').catch(() => {});
  await settle(page, 400);
  await tryClick(page, '.workflowModal button:has-text("Done"), button:has-text("Done")');
  await settle(page, 1200);
  console.log('    Set Variable saved at y=434');
}

async function cap13_decisionPopup(page: Page) {
  console.log('\n━━  [13] Decision popup  ━━');
  await ensureTrigger(page);   // Schedule trigger needed before a module drag shows config form
  await openBuiltins(page, 'Logic');
  await dragModule(page, 'Decision', { x: 715, y: 580 });
  if (await page.locator('.workflowModal, [role="dialog"]').count() === 0) {
    console.warn('    ⚠  Decision popup did not open');
    return;
  }
  await snap(page, 'decision-popup');
  await snapModal(page, 'decision-popup-modal');
  // Open 1st chooser dropdown
  await page.locator('.workflowModal .customSelectInputfield').first().click().catch(() => {});
  await settle(page, 800);
  await snap(page, 'decision-popup-chooser1-open');
  // Select "Set Variable" if visible
  await page.locator('.customSelect-ul li, .workflowModal li').filter({ hasText: /Set Variable/i }).first().click().catch(() => {});
  await settle(page, 600);
  await snap(page, 'decision-popup-chooser1-selected');
  // Open 2nd chooser (operator)
  await page.locator('.workflowModal .customSelectInputfield').nth(1).click().catch(() => {});
  await settle(page, 800);
  await snap(page, 'decision-popup-chooser2-open');
  await snapModal(page, 'decision-popup-chooser2-modal');
  await closeModal(page);
}

async function cap14_sendEmailPopup(page: Page) {
  console.log('\n━━  [14] Send Email / Send Mail popup  ━━');
  await ensureTrigger(page);   // Schedule trigger needed before Send Email shows its config form
  await openBuiltins(page, 'Notification');  // opens Built-ins tab then Notification subtab
  let label = '';
  for (const lbl of ['Send Mail', 'Send Email']) {
    try {
      await page.locator(`p.zf-module-label:text-is("${lbl}")`).first().waitFor({ state: 'visible', timeout: 5_000 });
      label = lbl;
      break;
    } catch { /* try next */ }
  }
  if (!label) {
    const labels = await page.locator('p.zf-module-label').allTextContents();
    console.warn(`    ⚠  Send Mail/Email not found. Visible: ${JSON.stringify(labels)}`);
    return;
  }
  // Drop below Set Variable (y=520); fallback y=434
  await dragModule(page, label, { x: 715, y: 520 });
  if (await page.locator('.workflowModal, [role="dialog"]').count() === 0) {
    console.log('    y=520 missed — retry y=434');
    await dragModule(page, label, { x: 715, y: 434 });
  }
  if (await page.locator('.workflowModal, [role="dialog"]').count() === 0) {
    console.warn('    ⚠  Send Email popup still not open');
    await snap(page, 'send-email-popup-failed');
    return;
  }
  await snap(page, 'send-email-popup');
  await snapModal(page, 'send-email-popup-modal');
  // Detailed input dump
  const detail = await page.evaluate(() => {
    const modal = document.querySelector('.workflowModal, [role="dialog"], .zf-action-popup');
    const root  = modal || document;
    return Array.from(root.querySelectorAll('input, textarea, select')).map(el => {
      const e = el as HTMLInputElement;
      return {
        tag: e.tagName, name: e.name, id: e.id, type: e.type,
        placeholder: e.placeholder,
        ariaLabel: e.getAttribute('aria-label'),
        ariaPlaceholder: e.getAttribute('aria-placeholder'),
        className: e.className,
        outerHTML: e.outerHTML.slice(0, 300),
      };
    });
  });
  const dir = path.join(SNAPSHOTS, 'send-email-popup');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'inputs-detail.json'), JSON.stringify(detail, null, 2));
  console.log(`    inputs-detail: ${detail.length} inputs`);
  await closeModal(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — ALL remaining module popups (auto-discovered)
// ─────────────────────────────────────────────────────────────────────────────

async function cap15_allRemainingModules(page: Page) {
  console.log('\n━━  [15] All remaining module popups (auto-discovered)  ━━');
  const skipDone = new Set(['Set Variable', 'Decision', 'Send Mail', 'Send Email']);
  let ySlot = 750;

  for (const tab of ['Logic', 'Notification', 'Subflow', 'Webhooks', 'Custom Function', 'Commands & Scripts']) {
    await openBuiltins(page, tab);
    const labels = await page.locator('p.zf-module-label').allTextContents();
    console.log(`    [${tab}] modules: ${JSON.stringify(labels)}`);
    for (const lbl of labels) {
      const clean = lbl.trim();
      if (!clean || skipDone.has(clean)) continue;
      const snapLbl = `${tab.toLowerCase()}-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-popup`;
      console.log(`    Dragging "${clean}" → y=${ySlot} → ${snapLbl}`);
      await dragModule(page, clean, { x: 715, y: ySlot });
      const count = await page.locator('.workflowModal, [role="dialog"]').count();
      if (count > 0) {
        await snap(page, snapLbl);
        await snapModal(page, `${snapLbl}-modal`);
        skipDone.add(clean);
        ySlot += 160;
      } else {
        console.warn(`    ⚠  No popup for "${clean}"`);
      }
      await closeModal(page);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Canvas states
// ─────────────────────────────────────────────────────────────────────────────

async function cap16_canvasWithActions(page: Page) {
  console.log('\n━━  [16] Canvas with action nodes  ━━');
  await snap(page, 'flow-canvas-with-actions');
}

async function cap17_canvasToolbar(page: Page) {
  console.log('\n━━  [17] Canvas toolbar / zoom controls  ━━');
  await snap(page, 'canvas-toolbar');
  await tryClick(page, '.zf-zoom-in, button[title*="zoom" i], [aria-label*="zoom" i]');
  await settle(page, 400);
  await snap(page, 'canvas-zoom-in');
  await tryClick(page, '.zf-zoom-out, button[title*="zoom out" i]');
  await settle(page, 400);
  await snap(page, 'canvas-zoom-out');
  // Undo/Redo
  await tryClick(page, 'button[title*="undo" i], [aria-label*="undo" i], .zf-undo');
  await settle(page, 400);
  await snap(page, 'canvas-undo');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Switch ON + History
// ─────────────────────────────────────────────────────────────────────────────

async function cap18_switchOnAndHistory(page: Page) {
  console.log('\n━━  [18] Switch ON + History tab  ━━');
  await snap(page, 'flow-canvas-before-switch');
  const togSel = 'input[name="switch"], input[name="flowStatus"], .toggle-switch input, .onoffswitch-checkbox, [class*="toggle" i] input';
  try {
    await page.locator(togSel).first().waitFor({ state: 'visible', timeout: 8_000 });
    await page.locator(togSel).first().click();
  } catch {
    await page.locator('[class*="switch" i], [class*="toggle" i]').first().click().catch(() => {});
  }
  await settle(page, 1500);
  await snap(page, 'flow-canvas-switch-on');
  // History tab
  await tryClick(page, 'a:has-text("History"), .zf-history-tab, [class*="history"]');
  await settle(page, 2000);
  await snap(page, 'history-tab');
  // Refresh button
  await tryClick(page, 'button[title*="refresh" i], button[aria-label*="refresh" i], .refresh-icon, .icon-refresh');
  await settle(page, 800);
  await snap(page, 'history-tab-after-refresh');
  // Try opening latest execution
  const execRow = page.locator('table tr, .execution-row, tr.zf-table-row, .zf-history-row').first();
  try {
    await execRow.waitFor({ state: 'visible', timeout: 10_000 });
    await execRow.click();
    await settle(page, 1500);
    await snap(page, 'execution-detail');
    // SetVariable input/output
    await tryClick(page, '[class*="setVariable" i], .setvariable-input, text=Set Variable');
    await settle(page, 800);
    await snap(page, 'execution-setvariable-input');
    // close
    await tryClick(page, '.close-icon, button[title*="close" i], [aria-label*="close" i]');
    await settle(page, 600);
  } catch {
    console.warn('    ⚠  No execution rows (flow not yet triggered)');
  }
}

async function cap19_flowSettings(page: Page) {
  console.log('\n━━  [19] Flow Settings panel  ━━');
  await tryClick(page, '.zf-flow-settings, [title*="settings" i], [aria-label*="settings" i], button.settings-btn');
  await settle(page, 1000);
  await snap(page, 'flow-settings-panel');
  await closeModal(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Notification / Alert system
// ─────────────────────────────────────────────────────────────────────────────

async function cap20_notificationPanel(page: Page) {
  console.log('\n━━  [20] Notification panel  ━━');
  await tryClick(page, '[class*="notification-bell" i], [title*="notification" i], [aria-label*="Notification" i]');
  await settle(page, 1000);
  await snap(page, 'notification-bell-panel');
  await closeModal(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const target = (process.argv[2] || 'all').toLowerCase();

  console.log('\n🚀  Zoho Flow — Full-Product DOM Capture');
  console.log(`    Target  : ${target}`);
  console.log(`    Base URL: ${BASE_URL}`);
  console.log(`    Snapshots → ${SNAPSHOTS}/`);
  console.log(`    Auth    : ${AUTH_FILE}`);

  if (!fs.existsSync(AUTH_FILE)) {
    console.error(`\n❌  Auth file not found: ${AUTH_FILE}`);
    console.error('    Run:  npm run record:codegen  (log in once, then close)');
    process.exit(1);
  }

  const browser: Browser = await chromium.launch({
    headless: false,
    args: ['--ignore-certificate-errors', '--start-maximized'],
  });
  const context: BrowserContext = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: null,
    ignoreHTTPSErrors: true,
  });
  const page: Page = await context.newPage();

  let flowCreated = false;

  const isAll = target === 'all';

  // Helper: run a named section if it matches the target (or target=all)
  const run = async (labels: string[], fn: () => Promise<void>) => {
    if (!isAll && !labels.includes(target)) return;
    try { await fn(); }
    catch (e) { console.error(`  ❌  [${labels[0]}]: ${e}`); }
  };

  try {
    // ── No-flow-context pages ──────────────────────────────────────────────
    await run(['flows-list'],          () => cap01_flowsList(page));
    await run(['create-flow-dialog'],  () => cap02_createFlowDialog(page));
    await run(['flows-list'],          () => cap03_flowsListActions(page));
    await run(['connections-page'],    () => cap04_connectionsPage(page));
    await run(['templates-page'],      () => cap05_templatesPage(page));
    await run(['dashboard-page'],      () => cap06_dashboardPage(page));
    await run(['settings-page'],       () => cap07_settingsPages(page));
    await run(['workspace-page'],      () => cap08_workspacePages(page));

    // ── Pages that need a temp flow ────────────────────────────────────────
    const flowTargets = new Set([
      'flow-canvas-empty', 'schedule-popup', 'builtins-panel',
      'set-variable-popup', 'decision-popup', 'send-email-popup',
      'history-tab', 'all-module-labels', 'canvas-toolbar', 'all',
    ]);
    if (isAll || flowTargets.has(target)) {
      console.log('\n⚙   Creating temporary flow for canvas / popup captures...');
      await page.goto(`${BASE_URL}/#/workspace/default/flows`, { waitUntil: 'networkidle' });
      await settle(page, 1200);
      flowCreated = await createTempFlow(page);

      if (!flowCreated) {
        console.error('❌  Could not create temp flow — skipping canvas sections');
      } else {
        await run(['flow-canvas-empty'],  () => cap09_canvasEmpty(page));
        await run(['schedule-popup'],     () => cap10_schedulePopup(page));
        await run(['builtins-panel', 'all-module-labels'], () => cap11_builtinsAllTabs(page));
        await run(['set-variable-popup'], () => cap12_setVariablePopup(page));
        await run(['decision-popup'],     () => cap13_decisionPopup(page));
        await run(['send-email-popup'],   () => cap14_sendEmailPopup(page));
        await run(['all-module-labels'],  () => cap15_allRemainingModules(page));
        await run(['canvas-toolbar'],     () => cap16_canvasWithActions(page));
        await run(['canvas-toolbar'],     () => cap17_canvasToolbar(page));
        if (isAll) {
          await cap18_switchOnAndHistory(page);
          await cap19_flowSettings(page);
          await cap20_notificationPanel(page);
        }
        await run(['history-tab'],        () => cap18_switchOnAndHistory(page));
      }
    }

  } finally {
    if (flowCreated) await deleteTempFlow(page);
    await browser.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n\n✅  Capture complete.\n');
  const dirs = fs.readdirSync(SNAPSHOTS)
    .filter(d => fs.statSync(path.join(SNAPSHOTS, d)).isDirectory() && d !== 'debug')
    .sort();
  let totalFiles = 0;
  for (const d of dirs) {
    const files = fs.readdirSync(path.join(SNAPSHOTS, d)).sort();
    totalFiles += files.length;
    console.log(`  dom-snapshots/${d.padEnd(45)}  [${files.join(', ')}]`);
  }
  const debugDir = path.join(SNAPSHOTS, 'debug');
  if (fs.existsSync(debugDir)) {
    const dumps = fs.readdirSync(debugDir).filter(d =>
      fs.statSync(path.join(debugDir, d)).isDirectory());
    if (dumps.length) console.log(`\n  debug/ (${dumps.length} failure dumps)`);
  }
  console.log(`\n  Total snapshot folders: ${dirs.length}  |  Total files: ${totalFiles}`);
}

main().catch(e => { console.error(e); process.exit(1); });
