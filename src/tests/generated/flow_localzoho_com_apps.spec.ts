import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Apps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://flow.localzoho.com/#/apps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('[LOAD] page loads successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/apps/i);
  });

  test('[TITLE] page title contains "Zoho Flow"', async ({ page }) => {
    await expect(page).toHaveTitle(/Zoho Flow/i);
  });

  test('[HEADING] "Flow" H2 is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Flow', level: 2 })).toBeVisible();
  });

  test('[HEADING] "Page not found" H3 is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Page not found', level: 3 })).toBeVisible();
  });

  test('[HEADING] "Note" H2 is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Note', level: 2 })).toBeVisible();
  });

  test('[BUTTON] Help button is visible and enabled', async ({ page }) => {
    await expect(page.locator('#flowHelpSidebar')).toBeVisible();
    await expect(page.locator('#flowHelpSidebar')).toBeEnabled();
  });

  test('[BUTTON] Refer button is visible and enabled', async ({ page }) => {
    await expect(page.locator('#refer-icon')).toBeVisible();
    await expect(page.locator('#refer-icon')).toBeEnabled();
  });

  test('[BUTTON] Accessibility button 1 is visible and enabled', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Missing translation: common.labels.accessibility/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Missing translation: common.labels.accessibility/i })).toBeEnabled();
  });

  test('[BUTTON] Accessibility button 2 is visible and enabled', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Missing translation: common.labels.accessibility/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Missing translation: common.labels.accessibility/i })).toBeEnabled();
  });

  test('[LINK] "Sign Out" link is visible and has correct text', async ({ page }) => {
    await expect(page.getByText('Sign Out')).toBeVisible();
    await expect(page.getByText('Sign Out')).toHaveText('Sign Out');
  });

  test('[LINK] "Go to My Flows" link is visible and navigates to correct URL', async ({ page }) => {
    await expect(page.locator('#ember522')).toBeVisible();
    await page.locator('#ember522').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/flows/i);
  });

  test('[LINK] "support@zohoflow.com" link is visible and has correct text', async ({ page }) => {
    await expect(page.getByText('support@zohoflow.com')).toBeVisible();
    await expect(page.getByText('support@zohoflow.com')).toHaveText('support@zohoflow.com');
  });

  test('[ACCESSIBILITY] Header landmark is present', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('[ACCESSIBILITY] Nav landmark is present', async ({ page }) => {
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('[ACCESSIBILITY] Main landmark is present', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible();
  });
});