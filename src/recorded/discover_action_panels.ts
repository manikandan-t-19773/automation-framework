/**
 * discover_action_panels.ts
 * Navigates to flow canvas, expands Logic, drags Set Variable,
 * and dumps the exact DOM of the action config panel.
 *
 * Run: npx ts-node src/recorded/discover_action_panels.ts 2>&1 | tee /tmp/panels.log
 */
import { chromium, Page } from '@playwright/test';

const FLOWS_URL = 'https://flow.localzoho.com/#/workspace/default/flows';

async function dumpAll(page: Page, label: string) {
  console.log(`\n${'='.repeat(65)}\nSNAPSHOT: ${label}\n${'='.repeat(65)}`);
  const rows = await page.evaluate((): string[] => {
    const results: string[] = [];
    // Dump EVERYTHING that is visible (rect > 0x0)
    document.querySelectorAll('*').forEach((el: Element) => {
      const e = el as HTMLElement;
      const rect = e.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const tag = e.tagName.toLowerCase();
      const id = e.id ? `id="${e.id}"` : '';
      const name = (e as HTMLInputElement).name ? `name="${(e as HTMLInputElement).name}"` : '';
      const type = (e as HTMLInputElement).type ? `type="${(e as HTMLInputElement).type}"` : '';
      const ph   = e.getAttribute('placeholder') ? `placeholder="${e.getAttribute('placeholder')}"` : '';
      const al   = e.getAttribute('aria-label') ? `aria-label="${e.getAttribute('aria-label')}"` : '';
      const role = e.getAttribute('role') ? `role="${e.getAttribute('role')}"` : '';
      const val  = (e as HTMLInputElement).value ? `value="${(e as HTMLInputElement).value?.substring(0,40)}"` : '';
      const cls  = e.className?.toString().substring(0, 60) || '';
      const txt  = (e.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50);
      const useful = id || name || ph || al || role || val
         || tag === 'input' || tag === 'textarea' || tag === 'label'
         || tag === 'button'
         || (cls.includes('label') || cls.includes('field') || cls.includes('input') || cls.includes('form'));
      if (useful) {
        results.push(`<${tag}> ${id} ${name} ${type} ${ph} ${al} ${role} ${val} cls="${cls}" text="${txt}" @ ${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
    });
    return [...new Set(results)];
  });
  rows.forEach(r => console.log('  ' + r));
  console.log(`  (${rows.length} elements)`);
}

async function settle(page: Page, ms = 800) {
  try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
  await page.waitForTimeout(ms);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, slowMo: 150 });
  const context = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    /* 1. Go to My Flows */
    await page.goto(FLOWS_URL, { waitUntil: 'domcontentloaded' });
    await settle(page, 2000);

    /* 2. Create flow */
    await page.getByRole('button', { name: /create flow/i }).click();
    await settle(page, 1000);
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.fill('lc_panel_discover_del');
    await settle(page, 300);
    const preUrl = page.url();
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preUrl, { timeout: 30_000 });
    await settle(page, 3000);
    console.log('\nFlow editor URL:', page.url());

    /* 3. Configure Schedule */
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await settle(page, 2000);

    /* 4. Frequency → Once */
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 20_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await settle(page, 800);
    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();
    try {
      await onceOpt.waitFor({ state: 'visible', timeout: 5000 });
      await onceOpt.click();
    } catch {
      await page.getByText('Once', { exact: true }).first().click();
    }
    await settle(page, 500);

    /* 5. Date → +3 min */
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    if (await dateBox.count() > 0) {
      const f = new Date(Date.now() + 3 * 60_000);
      const p2 = (n: number) => String(n).padStart(2,'0');
      await dateBox.fill(`${p2(f.getMonth()+1)}/${p2(f.getDate())}/${f.getFullYear()} ${p2(f.getHours())}:${p2(f.getMinutes())}`);
    }
    await settle(page, 300);

    /* 6. Apply + Done */
    await page.getByRole('button', { name: /apply/i }).click();
    await settle(page, 600);
    await page.getByRole('button', { name: /^done$/i }).click();
    await settle(page, 1500);

    /* 7. Open Built-ins → Logic */
    await dumpAll(page, 'BEFORE OPENING BUILT-INS — left sidebar state');

    // Try multiple approaches to find Built-ins tab
    const builtinsSelectors = [
      'span[data-ember-action]',     // original
      '[data-ember-action]',
      'li[class*="builtin"]',
      'li[class*="built-in"]',
      'a, button, li, span',         // broad
    ];
    let builtinsClicked = false;
    for (const sel of builtinsSelectors) {
      const matches = await page.locator(sel).all();
      for (const el of matches) {
        const txt = (await el.textContent() || '').trim();
        const box = await el.boundingBox();
        if (box && (txt === 'Built-ins' || txt.toLowerCase().includes('built-in'))) {
          console.log(`\n>>> Clicking Built-ins via: ${sel} text="${txt}" box=${JSON.stringify(box)}`);
          await el.click({ force: true });
          builtinsClicked = true;
          break;
        }
      }
      if (builtinsClicked) break;
    }
    await settle(page, 1500);
    await dumpAll(page, 'AFTER BUILT-INS CLICK');

    // Now find Logic accordion / section
    const logicSelectors = [
      { sel: 'span[data-ember-action]', text: /^Logic$/i },
      { sel: '[data-ember-action]', text: /^Logic$/i },
      { sel: 'li, div, span, h3, a', text: /^Logic$/i },
    ];
    let logicClicked = false;
    for (const { sel, text } of logicSelectors) {
      const matches = await page.locator(sel).all();
      for (const el of matches) {
        const t = (await el.textContent() || '').trim();
        if (text.test(t)) {
          const box = await el.boundingBox();
          if (box) {
            console.log(`\n>>> Clicking Logic via: ${sel} text="${t}" box=${JSON.stringify(box)}`);
            await el.click({ force: true });
            logicClicked = true;
            break;
          }
        }
      }
      if (logicClicked) break;
    }
    if (!logicClicked) {
      console.log('\n>>> Logic section not found — dumping all visible text nodes with data-ember-action');
      const allEmber = await page.locator('[data-ember-action]').all();
      for (const el of allEmber) {
        const t = (await el.textContent() || '').trim();
        const box = await el.boundingBox();
        if (box) console.log(`  [data-ember-action] text="${t}" box=${JSON.stringify(box)}`);
      }
    }
    await settle(page, 1500);

    await dumpAll(page, 'AFTER LOGIC SUBTAB CLICK — items in sidebar');

    /* 8. Drag Set Variable */
    const svLabel = page.locator('p.zf-module-label:text-is("Set Variable")');
    const svCount = await svLabel.count();
    console.log(`\n>>> p.zf-module-label:text-is("Set Variable") count = ${svCount}`);
    if (svCount > 0) {
      const box = await svLabel.first().boundingBox();
      if (box) {
        console.log(`    Source bbox: ${JSON.stringify(box)}`);
        // Drag using mouse events
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
        await page.mouse.down();
        await page.mouse.move(715, 434, { steps: 25 });
        await page.mouse.up();
        console.log('    Drag completed');
        await settle(page, 2500);
      }
    } else {
      // Dump visible sidebar labels for debugging
      const labels = await page.locator('p.zf-module-label').allTextContents();
      console.log('    Available zf-module-labels:', labels);
    }

    await dumpAll(page, 'AFTER SET VARIABLE DRAG — action config panel');

    /* 9. Dump all label elements explicitly */
    console.log('\n>>> ALL <label> elements:');
    const labelTexts = await page.locator('label').allTextContents();
    labelTexts.forEach(t => console.log('  label:', JSON.stringify(t.trim())));

    console.log('\n>>> ALL <input> and <textarea> elements with name or placeholder:');
    const inputInfos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea')).map(e => {
        const el = e as HTMLInputElement;
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder,
          id: el.id,
          ariaLabel: el.getAttribute('aria-label'),
          value: el.value?.substring(0, 30),
          visible: rect.width > 0 && rect.height > 0,
          rect: `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
          cls: el.className?.toString().substring(0, 60),
        };
      });
    });
    inputInfos.filter(i => i.visible).forEach(i => console.log('  INPUT:', JSON.stringify(i)));

    /* 10. Custom Function + Commands & Scripts subtabs — check visibility */
    const cfBtn = page.getByText('Custom Function', { exact: true });
    console.log(`\n>>> 'Custom Function' count = ${await cfBtn.count()}`);
    const builtinsInputs = await page.locator('input[type="submit"], input[type="button"]').allTextContents();
    console.log('>>> submit/button inputs:', builtinsInputs.slice(0, 20));
    const cfInputs = await page.locator('input[value="Custom Function"]').all();
    for (const el of cfInputs) {
      const box = await el.boundingBox();
      console.log('  Custom Function input box:', JSON.stringify(box));
    }

  } finally {
    /* Cleanup */
    await page.goto(FLOWS_URL, { waitUntil: 'domcontentloaded' });
    await settle(page, 2000);
    console.log('\n>>> Discovery done. Removing test flow...');
    const card = page.locator('[class*="flow-card"], [class*="flow-item"], .zf-flows-list-section li')
                     .filter({ hasText: 'lc_panel_discover_del' }).first();
    if (await card.count() > 0) {
      await card.hover();
      await settle(page, 400);
      const moreBtn = card.locator('[aria-label*="more" i], button').last();
      await moreBtn.click().catch(()=>{});
      await settle(page, 400);
      await page.getByText(/^delete$/i).first().click().catch(()=>{});
      await settle(page, 500);
      await page.getByRole('button', { name: /^delete$/i }).first().click().catch(()=>{});
      await settle(page, 1000);
    }
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
