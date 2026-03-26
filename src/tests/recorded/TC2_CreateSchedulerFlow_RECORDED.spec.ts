import { test, expect } from '@playwright/test';

test.use({
  ignoreHTTPSErrors: true,
  storageState: 'playwright/.auth/user.json'
});

test('test', async ({ page }) => {
  await page.goto('https://flow.localzoho.com/#/workspace/default/flows');
  await page.getByRole('button', { name: 'Create Flow' }).click();
  await page.getByRole('textbox', { name: 'E.g. Zoho Desk to Zoho CRM' }).click();
  await page.getByRole('textbox', { name: 'E.g. Zoho Desk to Zoho CRM' }).fill('qaflow');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.goto('https://flow.localzoho.com/#/workspace/default/flows/qaflow/edit');
  await page.getByRole('listitem').filter({ hasText: 'Schedule Triggers a one-time' }).locator('#continue').click();
  await page.getByRole('textbox', { name: 'Choose Frequency' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Once' }).click();
  await page.getByRole('textbox', { name: 'Start Date' }).click();
  await page.getByRole('button', { name: '26' }).click();
  await page.locator('.minutes > .zf-relative > .zf-i-arrows > .zf-icon-down-arrow.zf-top').click();
  await page.locator('.minutes > .zf-relative > .zf-i-arrows > .zf-icon-down-arrow.zf-top').click();
  await page.locator('.minutes > .zf-relative > .zf-i-arrows > .zf-icon-down-arrow.zf-top').click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('textbox', { name: 'Search apps, actions, or logic' }).click();
  await page.getByRole('textbox', { name: 'Search apps, actions, or logic' }).fill('slack');
  await page.locator('#ember2682').click();
  await page.getByRole('textbox', { name: 'Choose Connection' }).click();
  await page.getByRole('listitem').filter({ hasText: 'slackflow1' }).click();
  await page.locator('textarea[name="text"]').click();
  await page.locator('textarea[name="text"]').fill('test');
  await page.getByRole('textbox', { name: 'Choose To' }).click();
  await page.getByText('tmaniflow1 - U0535GX6W0G').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('span').nth(1).click();
});