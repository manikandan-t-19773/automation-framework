import { test, expect } from '../../fixtures/base';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC1: SETTINGS_ELEMENTS
 * Validate the elements present in the settings menu in case of owner
 * Source: manualtestcasedoc/Settings_standalone.xlsx
 */
test.describe('[TC1] SETTINGS_ELEMENTS', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("https://flow.localzoho.com/#/settings");
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
  });

  test('Validate the elements present in the settings menu in case of owner', async ({ page }) => {
    // Allow 2 min; retries:2 in playwright.config.ts restarts from Step 1
    // on failure. After 2 retries the trace is saved for the debugging process.
    test.setTimeout(300_000);
    // Step 1: Click on the settings menu
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page.getByRole('heading', { name: 'GENERAL' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'FLOW SETUP' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'MONITORING' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SECURITY & COMPLIANCE' })).toBeVisible();

    // Step 2: Click on the history
    await page.getByRole('link', { name: "History" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    // Expected Result: History link navigates to the task history page (accessible to owner)
    await expect(page).toHaveURL(new RegExp("/settings/history"));

    // Step 3: Click on connection
    await page.getByRole('link', { name: "Connections" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/settings/connections"));

    // Step 4: Click on Members
    await page.getByRole('link', { name: "Members" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/settings/users"));

    // Step 5: Click on publish details
    await page.getByRole('link', { name: "Billing & Usage" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/settings/billing"));

    // Step 6: Click on Audit trail
    await page.getByRole('link', { name: "Audit Trail" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/settings/audit-trail"));

    // Step 7: Click on Support Access
    await page.getByRole('link', { name: "Support Access" }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/settings/support"));
  });
});
