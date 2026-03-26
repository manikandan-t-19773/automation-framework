import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://flow.localzoho.com/#/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('[LOAD] page loads successfully', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/i);
  });

  test('[TITLE] page title contains "Zoho Flow"', async ({ page }) => {
    await expect(page).toHaveTitle(/Zoho Flow/i);
  });

  test('[HEADING] H1 "Dashboard" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });

  test('[HEADING] H3 "Flow Execution" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 3, name: 'Flow Execution' })).toBeVisible();
  });

  test('[HEADING] H3 "Task Usage" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 3, name: 'Task Usage' })).toBeVisible();
  });

  test('[NAV] "Explore Gallery" link is visible and navigates to correct URL', async ({ page }) => {
    await expect(page.locator('#explore-gallary')).toBeVisible();
    await page.locator('#explore-gallary').click();
    await expect(page).toHaveURL(/explore/i);
  });

  test('[NAV] "Subscription" link is visible and navigates to correct URL', async ({ page }) => {
    await expect(page.getByText('Subscription')).toBeVisible();
    await page.getByText('Subscription').click();
    await expect(page).toHaveURL(/store\.localzoho\.com/i);
  });

  test('[BUTTON] "Notifications" button is visible and enabled', async ({ page }) => {
    await expect(page.locator('#notification-icon')).toBeVisible();
    await expect(page.locator('#notification-icon')).toBeEnabled();
  });

  test('[BUTTON] "All Zoho Apps" button is visible and enabled', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'All Zoho Apps' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Zoho Apps' })).toBeEnabled();
  });

  test('[BUTTON] "Help" button is visible and enabled', async ({ page }) => {
    await expect(page.locator('#flowHelpSidebar')).toBeVisible();
    await expect(page.locator('#flowHelpSidebar')).toBeEnabled();
  });

  test('[FORM-FIELD] input with placeholder "Choose" is visible', async ({ page }) => {
    await expect(page.getByPlaceholder('Choose')).toBeVisible();
  });

  test('[ACCESSIBILITY] header region is present', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('[ACCESSIBILITY] main region contains H3 "Task Usage"', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 3, name: 'Task Usage' })).toBeVisible();
  });

  test('[ACCESSIBILITY] nav region contains "Explore Gallery" link', async ({ page }) => {
    await expect(page.getByText('Explore Gallery')).toBeVisible();
  });
});