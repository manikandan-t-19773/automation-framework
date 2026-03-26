import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx     = await browser.newContext({ storageState: 'playwright/.auth/user.json', ignoreHTTPSErrors: true });
  const page    = await ctx.newPage();

  // Navigate to an existing test flow or create new
  await page.goto('https://flow.localzoho.com/#/workspace/default/flows');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Create flow
  await page.getByRole('button', { name: /create flow/i }).click();
  await page.waitForTimeout(1500);
  await page.locator('input[name="displayName"]').fill('Schflow2');
  const createBtn = page.locator('#createFlowButton, input[type="submit"][name="save"]').first();
  await createBtn.click();
  try { await page.waitForURL(url => !url.href.includes('/create'), { timeout: 20000 }); } catch {}
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());
  await page.screenshot({ path: 'test-results/diag_builder_fresh.png', fullPage: false });

  // Dump ALL visible text content to understand page structure
  const bodyText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 3000);
  });
  console.log('\n--- Page body text ---\n' + bodyText);

  // Count Configure buttons
  const configBtns = await page.locator('button, [role="button"]').filter({ hasText: /configure/i }).all();
  console.log('\nConfigure buttons count:', configBtns.length);
  for (const btn of configBtns) {
    const cls = await btn.getAttribute('class');
    const id  = await btn.getAttribute('id');
    const txt = await btn.innerText();
    const box = await btn.boundingBox();
    console.log(`  id=${id} cls=${cls?.substring(0,60)} txt=${txt?.replace(/\n/,' ')} pos=y${box?.y?.toFixed(0)}`);
  }

  // Check if there's a schedule block visible
  console.log('\n--- Schedule-related text on page ---');
  const scheduleEl = page.getByText(/schedule/i).first();
  const schedCount = await page.getByText(/schedule/i).count();
  console.log('schedule text count:', schedCount);

  // Check for the schedule trigger block specifically
  const scheduleTrigger = page.locator('.trigger-block, .zf-trigger-block, [class*="trigger"]').first();
  const trigCount = await scheduleTrigger.count();
  console.log('trigger blocks:', trigCount);

  await browser.close();
})();
