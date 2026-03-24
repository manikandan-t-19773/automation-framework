import { test, expect } from '@playwright/test';

test.describe('https://flow.localzoho.com', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://flow.localzoho.com');
  });

  test('should load the page', async ({ page }) => {
    await expect(page).toHaveURL('https://flow.localzoho.com');
  });

  test('should have a search bar', async ({ page }) => {
    const searchBar = page.locator('#zgh-search-query');
    await expect(searchBar).toBeVisible();
  });

  test('should have a signup form', async ({ page }) => {
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('should have a skip to main content link', async ({ page }) => {
    const link = page.locator('#zw-product-header-skip');
    await expect(link).toBeVisible();
  });

  test('should have navigation links', async ({ page }) => {
    const links = page.locator('.nav-link');
    await expect(links).toHaveCountGreaterThan(0);
  });
});