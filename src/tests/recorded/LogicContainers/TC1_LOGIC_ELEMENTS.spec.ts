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
    // Real locator: input#createFlowButton (type=submit, NOT a <button>)
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    await page.waitForURL(/edit/, { timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Step5: Click Configure button in Schedule section
    // The Configure button appears on the canvas Scheduler trigger card
    const configBtn = page.locator('button').filter({ hasText: /^configure$/i }).first();
    await configBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await configBtn.click();
    await page.waitForTimeout(1000);

    // Step6: Click Frequency field and set Once
    // Frequency select — try native <select> first, then custom dropdown
    const freqSelect = page.locator('select[name*="freq" i], select[name*="repeat" i]').first();
    if (await freqSelect.count() > 0) {
      await freqSelect.selectOption({ label: 'Once' });
    } else {
      // custom Ember dropdown
      await page.locator('[class*="frequency"], [class*="repeat"]').first().click();
      await page.waitForTimeout(400);
      await page.getByText('Once', { exact: true }).first().click();
    }
    await page.waitForTimeout(400);

    // Step7: Click DateField and set 3Minutes later
    // Set schedule +3 minutes from now
    const now   = new Date(Date.now() + 3 * 60 * 1000);
    const yyyy  = now.getFullYear();
    const mm    = String(now.getMonth() + 1).padStart(2, '0');
    const dd    = String(now.getDate()).padStart(2, '0');
    const hh    = String(now.getHours()).padStart(2, '0');
    const mi    = String(now.getMinutes()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const timeStr = `${hh}:${mi}`;
    const dateInput = page.locator('input[type="date"], input[name*="date"]').first();
    if (await dateInput.count() > 0) {
      await dateInput.fill(dateStr);
    }
    const timeInput = page.locator('input[type="time"], input[name*="time"]').first();
    if (await timeInput.count() > 0) {
      await timeInput.fill(timeStr);
    }
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
