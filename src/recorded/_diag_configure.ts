import { chromium } from '@playwright/test';
import * as fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx     = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  console.log('Navigating to flows...');
  await page.goto('https://flow.localzoho.com/#/workspace/default/flows');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // click Create Flow
  console.log('Clicking Create Flow...');
  await page.getByRole('button', { name: /create flow/i }).click();
  await page.waitForTimeout(1500);

  // fill name specifically into the displayName field
  await page.locator('input[name="displayName"]').fill('DiagFlow_DeleteMe');
  await page.waitForTimeout(500);

  // click Create  — it's an <input type="submit"> not a <button>
  const createBtn = page.locator('#createFlowButton, input[type="submit"][name="save"]').first();
  await createBtn.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Clicking Create (input#createFlowButton)...');
  await createBtn.click();

  // Wait for URL to change away from /create (flow builder route)
  console.log('Waiting for flow builder to load...');
  try {
    await page.waitForURL(url => !url.href.includes('/create'), { timeout: 20000 });
  } catch { /* already past create */ }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);

  console.log('URL after create:', page.url());
  await page.screenshot({ path: 'test-results/diag_after_create.png', fullPage: false });

  // Find all buttons on the flow builder canvas
  console.log('\n--- Buttons on flow builder ---');
  const allBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a[class*="btn"]'))
      .filter((el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el: Element) => ({
        tag:     el.tagName,
        id:      el.id.substring(0, 30),
        classes: el.className?.substring(0, 100),
        text:    ((el as HTMLElement).innerText || el.getAttribute('value') || '').replace(/\n/g, ' ').trim().substring(0, 60),
        title:   el.getAttribute('title')?.substring(0, 40) || '',
        aria:    el.getAttribute('aria-label')?.substring(0, 40) || '',
      }));
  });
  allBtns.forEach(b => console.log(JSON.stringify(b)));

  // Try clicking Configure using text search
  console.log('\n--- Trying to click Configure button ---');
  const configureVisible = page.locator('button, [role="button"]').filter({ hasText: /configure/i }).first();
  const configCount = await configureVisible.count();
  console.log('Configure buttons (text):', configCount);

  if (configCount > 0) {
    await configureVisible.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/diag_after_configure.png', fullPage: false });

    console.log('\n--- Elements inside Configure dialog ---');
    const dialogEls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select, button, [role="combobox"], [role="option"], [role="listbox"], [class*="select"], [class*="dropdown"], [class*="frequency"], [class*="trigger"], li'))
        .filter((el: Element) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el: Element) => ({
          tag:     el.tagName,
          id:      el.id.substring(0, 20),
          classes: el.className?.substring(0, 100),
          role:    el.getAttribute('role') || '',
          text:    ((el as HTMLElement).innerText || '').replace(/\n/g, ' ').trim().substring(0, 60),
          name:    el.getAttribute('name') || '',
          type:    el.getAttribute('type') || '',
        }));
    });
    dialogEls.forEach(e => console.log(JSON.stringify(e)));
  }

  await page.screenshot({ path: 'test-results/diag_configure.png', fullPage: false });
  console.log('\nScreenshot saved to test-results/diag_configure.png');

  await browser.close();
})();
