/**
 * discover_locators.ts
 * Navigates the Zoho Flow app through LogicContainers steps and dumps
 * real DOM attributes for every interactive element at each key state.
 *
 * Run: npx ts-node src/recorded/discover_locators.ts 2>&1 | tee /tmp/locators.log
 */
import { chromium, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';

const FLOWS_URL = 'https://flow.localzoho.com/#/workspace/default/flows';

/* ── dump all interactive elements visible on the page ─────────────────────── */
async function dumpInteractive(page: Page, label: string): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SNAPSHOT: ${label}`);
  console.log('='.repeat(70));

  const rows = await page.evaluate(() => {
    const results: string[] = [];
    const sel = [
      'input', 'textarea', 'select', 'button',
      '[role="textbox"]', '[role="combobox"]', '[role="listbox"]',
      '[role="option"]', '[role="tab"]', '[role="button"]',
      '[contenteditable="true"]',
      '[draggable="true"]',
      'li[class*="action"]', 'li[class*="item"]',
      'p[class*="action"]', 'span[class*="action"]',
      '[class*="accordion"]', '[class*="subtab"]', '[class*="tab-item"]',
    ].join(',');

    document.querySelectorAll(sel).forEach((el: Element) => {
      const e = el as HTMLElement;
      const rect = e.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;   // skip hidden
      const info = {
        tag:             e.tagName.toLowerCase(),
        id:              e.id || '',
        name:            (e as HTMLInputElement).name || '',
        type:            (e as HTMLInputElement).type || '',
        placeholder:     e.getAttribute('placeholder') || '',
        ariaLabel:       e.getAttribute('aria-label') || '',
        role:            e.getAttribute('role') || '',
        cls:             e.className?.toString().substring(0, 80) || '',
        text:            (e.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 60),
        draggable:       e.getAttribute('draggable') || '',
        dataFieldName:   e.getAttribute('data-field-name') || '',
        contentEditable: e.getAttribute('contenteditable') || '',
        rect:            `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      };
      // Only print if has something useful
      const useful = info.id || info.name || info.placeholder || info.ariaLabel
                   || info.role || info.draggable === 'true' || info.text;
      if (useful) {
        results.push(JSON.stringify(info));
      }
    });
    return results;
  });

  rows.forEach(r => {
    const o = JSON.parse(r);
    const parts = [`<${o.tag}>`];
    if (o.id)              parts.push(`id="${o.id}"`);
    if (o.name)            parts.push(`name="${o.name}"`);
    if (o.type)            parts.push(`type="${o.type}"`);
    if (o.placeholder)     parts.push(`placeholder="${o.placeholder}"`);
    if (o.ariaLabel)       parts.push(`aria-label="${o.ariaLabel}"`);
    if (o.role)            parts.push(`role="${o.role}"`);
    if (o.draggable==='true') parts.push(`draggable`);
    if (o.dataFieldName)   parts.push(`data-field-name="${o.dataFieldName}"`);
    if (o.contentEditable) parts.push(`contenteditable="${o.contentEditable}"`);
    if (o.text)            parts.push(`text="${o.text}"`);
    parts.push(`@ ${o.rect}`);
    console.log('  ' + parts.join('  '));
  });
  console.log(`  (${rows.length} elements)`);
}

/* ── helper: wait for network quiet ────────────────────────────────────────── */
async function settle(page: Page, ms = 800) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms);
}

/* ── main discovery flow ────────────────────────────────────────────────────── */
async function main() {
  const browser  = await chromium.launch({ channel: 'chrome', headless: false, slowMo: 200 });
  const context: BrowserContext = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    /* ── 1. My Flows page ─────────────────────────────────────────────────── */
    await page.goto(FLOWS_URL, { waitUntil: 'domcontentloaded' });
    await settle(page, 2000);
    await dumpInteractive(page, '1. MY FLOWS PAGE');

    /* ── 2. Open Create Flow dialog ───────────────────────────────────────── */
    const createBtn = page.getByRole('button', { name: /create flow/i });
    await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await createBtn.click();
    await settle(page, 1200);
    await dumpInteractive(page, '2. CREATE FLOW DIALOG');

    /* ── 3. Fill flow name ────────────────────────────────────────────────── */
    // Real locator from snapshot: input[name="displayName"]
    const nameEl = page.locator('input[name="displayName"]');
    await nameEl.waitFor({ state: 'visible', timeout: 15_000 });
    await nameEl.fill('lc_discover_del');
    await settle(page, 500);

    /* ── 4. Click Create ──────────────────────────────────────────────────── */
    // Real locator from snapshot: input#createFlowButton  (type=submit, not a button)
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    // Wait for URL to change to flow editor
    await page.waitForURL(/\/edit/, { timeout: 30_000 });
    await settle(page, 3000);
    await dumpInteractive(page, '4. FLOW EDITOR — INITIAL (after Create)');

    /* ── 5. Click Configure (Schedule trigger) ────────────────────────────── */
    const configureBtn = page.getByRole('button', { name: /configure/i }).first();
    if (await configureBtn.count() > 0) {
      await configureBtn.click();
      await settle(page, 1500);
      await dumpInteractive(page, '5. CONFIGURE SCHEDULE PANEL');
    }

    /* ── 6. Frequency dropdown ────────────────────────────────────────────── */
    await dumpInteractive(page, '6. SCHEDULE — FREQUENCY FIELD AREA');

    /* ── 7. Click Apply ───────────────────────────────────────────────────── */
    const applyBtn = page.getByRole('button', { name: /apply/i });
    if (await applyBtn.count() > 0) {
      await applyBtn.click();
      await settle(page, 800);
    }

    /* ── 8. Click Done ─────────────────────────────────────────────────────── */
    const doneBtn = page.getByRole('button', { name: /^done$/i });
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      await settle(page, 1000);
    }
    await dumpInteractive(page, '8. FLOW EDITOR — AFTER SCHEDULE DONE');

    /* ── 9. Click Built-ins tab ───────────────────────────────────────────── */
    const builtinsTab = page.getByText('Built-ins', { exact: true }).first();
    if (await builtinsTab.count() > 0) {
      await builtinsTab.click();
      await settle(page, 1000);
      await dumpInteractive(page, '9. BUILT-INS PANEL OPEN');
    }

    /* ── 10. Click Logic accordion ────────────────────────────────────────── */
    const logicTab = page.getByText('Logic', { exact: true }).first();
    if (await logicTab.count() > 0) {
      await logicTab.click();
      await settle(page, 1000);
      await dumpInteractive(page, '10. LOGIC SUBTAB EXPANDED — items visible');
    }

    /* ── 11. Drag Set Variable to canvas ──────────────────────────────────── */
    // Dump draggable items before drag
    console.log('\n>>> DRAGGABLE ACTION ITEMS:');
    const draggables = await page.evaluate(() => {
      const els: string[] = [];
      document.querySelectorAll('[draggable="true"], li, p, span').forEach((el: Element) => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        const text = (e.textContent || '').replace(/\s+/g,' ').trim();
        if (rect.width > 0 && text && text.length < 50)
          els.push(`${e.tagName.toLowerCase()}  cls="${e.className?.toString().substring(0,60)}"  text="${text}"  @ ${Math.round(rect.x)},${Math.round(rect.y)}`);
      });
      return [...new Set(els)].slice(0, 80);
    });
    draggables.forEach(d => console.log('  ' + d));

    /* ── 12. After dragging Set Variable → Value field ──────────────────────── */
    // Simulate drag via JS mouse events for discovery
    const svEl = page.locator('p, span, li').filter({ hasText: /^Set Variable$/i }).first();
    if (await svEl.count() > 0) {
      const svBox = await svEl.boundingBox();
      if (svBox) {
        // Drag to canvas
        await page.mouse.move(svBox.x + svBox.width/2, svBox.y + svBox.height/2);
        await page.mouse.down();
        await page.mouse.move(715, 434, { steps: 20 });
        await page.mouse.up();
        await settle(page, 2000);
        await dumpInteractive(page, '12. AFTER SET VARIABLE DRAG — ACTION PANEL');
      }
    }

    /* ── 13. Subflow tab ─────────────────────────────────────────────────────── */
    const subflowTab = page.getByText('Subflow', { exact: true }).first();
    if (await subflowTab.count() > 0) {
      await page.getByRole('button', { name: /^done$/i }).click().catch(()=>{});
      await settle(page, 600);
      await subflowTab.click();
      await settle(page, 800);
      await dumpInteractive(page, '13. SUBFLOW SUBTAB');
    }

    /* ── 14. Webhooks tab ─────────────────────────────────────────────────────── */
    const webhooksTab = page.getByText('Webhooks', { exact: true }).first();
    if (await webhooksTab.count() > 0) {
      await webhooksTab.click();
      await settle(page, 800);
      await dumpInteractive(page, '14. WEBHOOKS SUBTAB');
    }

    /* ── 15. Notification tab ─────────────────────────────────────────────────── */
    const notifTab = page.getByText('Notification', { exact: true }).first();
    if (await notifTab.count() > 0) {
      await notifTab.click();
      await settle(page, 800);
      await dumpInteractive(page, '15. NOTIFICATION SUBTAB');
    }

    /* ── 16. Custom Function tab ──────────────────────────────────────────────── */
    const cfTab = page.getByText('Custom Function', { exact: true }).first();
    if (await cfTab.count() > 0) {
      await cfTab.click();
      await settle(page, 800);
      await dumpInteractive(page, '16. CUSTOM FUNCTION SUBTAB');
    }

    /* ── 17. Commands & Scripts tab ───────────────────────────────────────────── */
    const csTab = page.getByText('Commands & Scripts', { exact: true }).first();
    if (await csTab.count() > 0) {
      await csTab.click();
      await settle(page, 800);
      await dumpInteractive(page, '17. COMMANDS & SCRIPTS SUBTAB');
    }

    console.log('\n\n>>> DISCOVERY COMPLETE. Cleaning up test flow...');

    /* ── Cleanup: delete the discovery flow ──────────────────────────────────── */
    await page.goto(FLOWS_URL, { waitUntil: 'domcontentloaded' });
    await settle(page, 2000);
    // Find and delete lc_discover_del
    const flowCard = page.locator('[class*="flow-card"], [class*="flow-item"]')
                         .filter({ hasText: 'lc_discover_del' }).first();
    if (await flowCard.count() > 0) {
      await flowCard.hover();
      await settle(page, 400);
      const menuBtn = flowCard.locator('[aria-label*="more" i], [class*="more-opt"], button').last();
      if (await menuBtn.count() > 0) await menuBtn.click();
      await settle(page, 400);
      const deleteOpt = page.getByText(/^delete$/i).first();
      if (await deleteOpt.count() > 0) {
        await deleteOpt.click();
        await settle(page, 600);
        await page.getByRole('button', { name: /^delete$/i }).first().click().catch(()=>{});
        await settle(page, 1000);
        console.log('Test flow deleted.');
      }
    }

  } finally {
    await browser.close();
    console.log('\nLog saved to /tmp/locators.log (if run with tee)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
