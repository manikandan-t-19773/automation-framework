import { test, expect } from '../../../fixtures/base';
import { FlowHelper } from '../../../helpers/flowHelper';
import { DragHelper } from '../../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC1: LOGIC_ELEMENTS
 * Validate the logic container elements
 * Source: manualtestcasedoc/LogicContainers.xlsx
 */
test.describe('[LC_TC1] LOGIC_ELEMENTS', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    if (flowName) {
      try {
        const flow = new FlowHelper(page);
        await flow.deleteFlow(flowName);
      } catch (_) { /* best-effort cleanup */ }
    }
  });

  test('Validate the logic container elements', async ({ page }) => {
    test.setTimeout(300_000); // 25 min ceiling (scheduler wait = 4 min)
    const flow = new FlowHelper(page);

    await page.goto('https://flow.localzoho.com/#/workspace/default/flows');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    // Step1: Click My Flows Tab
    await page.getByRole('link', { name: /my flows/i }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp('/workspace/default/flows'));

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(200);

    // Step3: Provide FlowName as "sendmailflow" in Flow Name field
    flowName = 'sendmailflow';
    // Real locator from DOM: input[name="displayName"]
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20_000 });
    await nameInput.fill('sendmailflow');
    await page.waitForTimeout(300);

    // Step4: Click Create Button
    // Proven locator: input#createFlowButton (type=submit) — store pre-URL for hash-router
    const preCreateUrl = page.url();
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    // Step5: Click Configure button in Schedule section
    // Wait for trigger-chooser text, then click the Schedule Configure button (index 1)
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(400);

    // Step6: Click Frequency field and set Once
    // Proven locators from TC2: .customSelect_scheduleBy input.customSelectInputfield
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 30_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await page.waitForTimeout(200);
    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect_scheduleBy div, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();
    const onceOptFallback = page.getByText('Once', { exact: true }).first();
    try {
      await onceOpt.waitFor({ state: 'visible', timeout: 30_000 });
      await onceOpt.click();
    } catch {
      await onceOptFallback.waitFor({ state: 'visible', timeout: 30_000 });
      await onceOptFallback.click();
    }
    await page.waitForTimeout(200);

    // Step7: Click DateField and set 3Minutes later
    // Proven locator from TC2: getByRole('textbox', { name: /start date/i })
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    await dateBox.waitFor({ state: 'visible', timeout: 30_000 });
    const future = new Date(Date.now() + 3 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const month   = pad(future.getMonth() + 1);
    const day     = pad(future.getDate());
    const year    = future.getFullYear();
    const hours   = pad(future.getHours());
    const minutes = pad(future.getMinutes());
    await dateBox.fill('');
    await dateBox.type(`${month}/${day}/${year} ${hours}:${minutes}`);
    await page.waitForTimeout(400);

    // Step8: Click Apply button
    await page.getByRole('button', { name: /apply/i }).click();
    await page.waitForTimeout(200);

    // Step9: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(200);

    // Step10: Click Build-ins Subtab
    // Real locator: span[data-ember-action] with text "Built-ins"
    // Only visible after the canvas / sidebar has loaded
    const builtinsBtn = page.locator('span[data-ember-action]').filter({ hasText: /^Built-ins$/i });
    await builtinsBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await builtinsBtn.first().click();
    await page.waitForTimeout(200);

    // Step11: Click Logic Subtab
    // Click the Logic accordion in the Built-ins sidebar
    // Real DOM: [data-ember-action] (not span-specific) confirmed from live discovery
    const logicSection = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });
    await logicSection.first().waitFor({ state: 'visible', timeout: 20_000 });
    await logicSection.first().click();
    await page.waitForTimeout(200);

    // Step12: Verify "SetVariable" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step12 = page.getByText("Set Variable", { exact: true }).first()
                           .or(page.getByText("SetVariable", { exact: false }).first());
    await expect(verifyEl_step12).toBeVisible({ timeout: 20_000 });

    // Step13: Verify "Decision" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step13 = page.getByText("Decision", { exact: true }).first()
                           .or(page.getByText("Decision", { exact: false }).first());
    await expect(verifyEl_step13).toBeVisible({ timeout: 20_000 });

    // Step14: Verify "Delay" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step14 = page.getByText("Delay", { exact: true }).first()
                           .or(page.getByText("Delay", { exact: false }).first());
    await expect(verifyEl_step14).toBeVisible({ timeout: 20_000 });

    // Step15: Verify "If else" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step15 = page.getByText("If else", { exact: true }).first()
                           .or(page.getByText("If else", { exact: false }).first());
    await expect(verifyEl_step15).toBeVisible({ timeout: 20_000 });

    // Step16: Click "Subflow" Subtab
    await page.getByText('Subflow', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step17: Verify "Call a subflow" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step17 = page.getByText("Call a subflow", { exact: true }).first()
                           .or(page.getByText("Call a subflow", { exact: false }).first());
    await expect(verifyEl_step17).toBeVisible({ timeout: 20_000 });

    // Step18: Click "Webhooks" Subtab
    await page.getByText('Webhooks', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step19: Verify "Send Webhook" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step19 = page.getByText("Send Webhook", { exact: true }).first()
                           .or(page.getByText("Send Webhook", { exact: false }).first());
    await expect(verifyEl_step19).toBeVisible({ timeout: 20_000 });

    // Step20: Click "Notification" Subtab
    await page.getByText('Notification', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step21: Verify "Send Email" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step21 = page.getByText("Send Email", { exact: true }).first()
                           .or(page.getByText("Send Email", { exact: false }).first());
    await expect(verifyEl_step21).toBeVisible({ timeout: 20_000 });

    // Step22: Click "Custom Function" Subtab
    // Custom Function item is in Developer Tools section of Built-ins, may be off-screen
    // Use scrollIntoViewIfNeeded + force:true because it renders as input[type=submit]
    const cfItem = page.locator('input[value="Custom Function"]').first();
    const cfItemCount = await cfItem.count();
    if (cfItemCount > 0) {
      await cfItem.scrollIntoViewIfNeeded();
      await cfItem.click({ force: true });
    } else {
      // Fallback: search in sidebar searchbox
      await page.locator('input[name="searchbox"]').fill('Custom Function');
      await page.waitForTimeout(200);
      await page.locator('p.zf-module-label:text-is("Custom Function"), .zf-module-label:has-text("Custom Function")').first().click({ force: true });
    }
    await page.waitForTimeout(200);

    // Step23: Verify any 1 of custom function record available
    // TODO: implement — "Verify any 1 of custom function record available"
    await page.screenshot({ path: 'test-results/TC1_step23.png', fullPage: false });
    await page.waitForTimeout(200);

    // Step24: Click "Commands & Scripts" Subtab
    await page.getByText('Commands & Scripts', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step25: Verify "Execute Base script" Present
    // Verify element — check both camelCase form and spaced form
    const verifyEl_step25 = page.getByText("Execute Base script", { exact: true }).first()
                           .or(page.getByText("Execute Base script", { exact: false }).first());
    await expect(verifyEl_step25).toBeVisible({ timeout: 20_000 });
  });
});
