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
    test.setTimeout(1_500_000); // 25 min ceiling (scheduler wait = 4 min)
    const flow = new FlowHelper(page);

    await page.goto('https://flow.localzoho.com/#/workspace/default/flows');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Step1: Click My Flows Tab
    await page.getByRole('link', { name: /my flows/i }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(new RegExp('/workspace/default/flows'));

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(800);

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
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step5: Click Configure button in Schedule section
    // Wait for trigger-chooser text, then click the Schedule Configure button (index 1)
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(2000);

    // Step6: Click Frequency field and set Once
    // Proven locators from TC2: .customSelect_scheduleBy input.customSelectInputfield
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 30_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await page.waitForTimeout(1000);
    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect_scheduleBy div, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();
    const onceOptFallback = page.getByText('Once', { exact: true }).first();
    try {
      await onceOpt.waitFor({ state: 'visible', timeout: 30_000 });
      await onceOpt.click();
    } catch {
      await onceOptFallback.waitFor({ state: 'visible', timeout: 30_000 });
      await onceOptFallback.click();
    }
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

    // Step9: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(800);

    // Step10: Click Build-ins Subtab
    // Real locator: span[data-ember-action] with text "Built-ins"
    // Only visible after the canvas / sidebar has loaded
    const builtinsBtn = page.locator('span[data-ember-action]').filter({ hasText: /^Built-ins$/i });
    await builtinsBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await builtinsBtn.first().click();
    await page.waitForTimeout(600);

    // Step11: Click Logic Subtab
    // Click the Logic accordion in the Built-ins sidebar
    const logicSection = page.locator('span[data-ember-action]').filter({ hasText: /^Logic$/i })
                           .or(page.getByText('Logic', { exact: true }).first());
    await logicSection.first().waitFor({ state: 'visible', timeout: 20_000 });
    await logicSection.first().click();
    await page.waitForTimeout(600);

    // Step12: Verify "SetVariable" Present
    // Verify "setvariable" is visible in the panel
    await expect(page.getByText("setvariable", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step13: Verify "Decision" Present
    // Verify "decision" is visible in the panel
    await expect(page.getByText("decision", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step14: Verify "Delay" Present
    // Verify "delay" is visible in the panel
    await expect(page.getByText("delay", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step15: Verify "If else" Present
    // Verify "if else" is visible in the panel
    await expect(page.getByText("if else", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step16: Click "Subflow" Subtab
    await page.getByText('Subflow', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step17: Verify "Call a subflow" Present
    // Verify "call a subflow" is visible in the panel
    await expect(page.getByText("call a subflow", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step18: Click "Webhooks" Subtab
    await page.getByText('Webhooks', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step19: Verify "Send Webhook" Present
    // Verify "send webhook" is visible in the panel
    await expect(page.getByText("send webhook", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step20: Click "Notification" Subtab
    await page.getByText('Notification', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step21: Verify "Send Email" Present
    // Verify "send email" is visible in the panel
    await expect(page.getByText("send email", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Step22: Click "Custom Function" Subtab
    await page.getByText('Custom Function', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step23: Verify any 1 of custom function record available
    // TODO: implement — "Verify any 1 of custom function record available"
    await page.screenshot({ path: 'test-results/TC1_step23.png', fullPage: false });
    await page.waitForTimeout(500);

    // Step24: Click "Commands & Scripts" Subtab
    await page.getByText('Commands & Scripts', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step25: Verify "Execute Base script" Present
    // Verify "execute base script" is visible in the panel
    await expect(page.getByText("execute base script", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });
});
