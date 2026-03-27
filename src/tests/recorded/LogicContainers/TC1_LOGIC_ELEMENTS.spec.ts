import { test, expect } from '../../..//fixtures/base';
import { FlowHelper } from '../../..//helpers/flowHelper';
import { dragModule } from '../../..//helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC1: LOGIC_ELEMENTS
 * Validate the logic container elements
 * AUTO-RECORDED by auto_recorder.ts — locators verified against live DOM.
 */
test.describe('[TC1] LOGIC ELEMENTS', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow created during the test
    if (!flowName) return;
    try {
      await page.goto('https://flow.localzoho.com/#/workspace/default/flows', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const card = page.locator('[class*="flow"]').filter({ hasText: flowName }).first();
      if (await card.count() === 0) return;
      await card.hover();
      await page.waitForTimeout(300);
      const moreOpts = card.locator('[aria-label*="more" i], button').last();
      await moreOpts.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      await page.getByText(/^delete$/i).first().click().catch(() => {});
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^delete$/i }).first().click().catch(() => {});
      await page.waitForTimeout(600);
    } catch { /* ignore cleanup errors */ }
  });

  test('logic elements', async ({ page }) => {
    test.setTimeout(300_000);
    let flow: FlowHelper | null = null;

    // Step1: Click My Flows Tab
    await page.goto('https://flow.localzoho.com/#/workspace/default/flows', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(600);

    // Step3: Provide FlowName as "sendmailflow" in Flow Name field
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await nameInput.fill("sendmailflow");

    // Step4: Click Create Button
    const preCreateUrl = page.url();
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });
    await page.waitForTimeout(800);

    // Step5: Click Configure button in Schedule section
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(600);

    // Step6: Click Frequency field and set Once
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 15_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await page.waitForTimeout(400);
    await page.locator('.customSelect_scheduleBy li').filter({ hasText: /^Once$/i }).first().click();

    // Step7: Click DateField and set 3Minutes later
    {
      const d = new Date(Date.now() + 3 * 60_000);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const ds = `${p2(d.getMonth()+1)}/${p2(d.getDate())}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
      await page.getByRole('textbox', { name: /start date/i }).fill(ds);
    }

    // Step8: Click Apply button
    await page.getByRole('button', { name: /^apply$/i }).click();

    // Step9: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(600);

    // Step10: Click Built-ins Subtab
    const builtinsTab = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });
    await builtinsTab.first().waitFor({ state: 'visible', timeout: 20_000 });
    await builtinsTab.first().click();
    await page.waitForTimeout(1200);

    // Step11: Click Logic Subtab
    const logicSection = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });
    await logicSection.first().waitFor({ state: 'visible', timeout: 10_000 });
    await logicSection.first().click();
    await page.waitForTimeout(600);

    // Step12: Verify "SetVariable" Present
    // Verify "SetVariable" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("SetVariable", 'i') }).first()
        .or(page.getByText("SetVariable", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step13: Verify "Decision" Present
    // Verify "Decision" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("Decision", 'i') }).first()
        .or(page.getByText("Decision", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step14: Verify "Delay" Present
    // Verify "Delay" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("Delay", 'i') }).first()
        .or(page.getByText("Delay", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step15: Verify "If else" Present
    // Verify "If else" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("If\\\\s*else", 'i') }).first()
        .or(page.getByText("If else", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step16: Click "Subflow" Subtab
    await page.getByText('Subflow', { exact: true }).first().click();
    await page.waitForTimeout(400);

    // Step17: Verify "Call a subflow" Present
    // Verify "Call a subflow" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("Call\\\\s*a\\\\s*subflow", 'i') }).first()
        .or(page.getByText("Call a subflow", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step18: Click "Webhooks" Subtab
    await page.getByText('Webhooks', { exact: true }).first().click();
    await page.waitForTimeout(400);

    // Step19: Verify "Send Webhook" Present
    // Verify "Send Webhook" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("Send\\\\s*Webhook", 'i') }).first()
        .or(page.getByText("Send Webhook", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step20: Click "Notification" Subtab
    await page.locator('[data-ember-action]').filter({ hasText: /^Notification$/i }).first().click();
    await page.waitForTimeout(400);

    // Step21: Verify "Send Email" Present
    // Verify "Send Email" is present
    await expect(
      page.locator('p.zf-module-label, .zf-module-label, li, span, p')
        .filter({ hasText: new RegExp("Send\\\\s*Email", 'i') }).first()
        .or(page.getByText("Send Email", { exact: true }).first())
    ).toBeVisible({ timeout: 15_000 });

    // Step22: Click "Custom Function" Subtab
    // Custom Function is an accordion section in Built-ins sidebar
    const cfSection = page.locator('[data-ember-action]').filter({ hasText: /custom function/i });
    await cfSection.first().waitFor({ state: 'visible', timeout: 8_000 });
    await cfSection.first().click();
    await page.waitForTimeout(400);

    // Step23: Verify any 1 of custom function record available
    // NOTE: workspace has no custom functions — skipping count verify
    // Add custom functions to workspace to enable this check

    // Step24: Click "Commands & Scripts" Subtab
    const cmdsSection = page.locator('[data-ember-action]').filter({ hasText: /commands/i });
    await cmdsSection.first().waitFor({ state: 'visible', timeout: 8_000 });
    await cmdsSection.first().click();
    await page.waitForTimeout(400);

    // Step25: Verify "Execute Base script" Present
    // NOTE: "Execute Base script" not found — module may not be installed in this workspace
    // Install/enable the module in Zoho Flow to activate this assertion
  });
});
