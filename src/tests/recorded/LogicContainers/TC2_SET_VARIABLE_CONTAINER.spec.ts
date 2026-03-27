import { test, expect } from '../../../fixtures/base';
import { FlowHelper } from '../../../helpers/flowHelper';
import { dragModule } from '../../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC2: SET_VARIABLE_CONTAINER
 * Validate the set variable container is working
 * Source: manualtestcasedoc/LogicContainers.xlsx
 */
test.describe('[LC_TC2] SET_VARIABLE_CONTAINER', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    if (flowName) {
      try {
        const flow = new FlowHelper(page);
        await flow.deleteFlow(flowName);
      } catch (_) { /* best-effort cleanup */ }
    }
  });

  test('Validate the set variable container is working', async ({ page }) => {
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

    // Step10: Click Built-ins Subtab
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

    // Step12: Drag "Set Variable" into Trigger box
    // dragModule: proven selector p.zf-module-label:text-is("Set Variable")
    await dragModule(page, 'Set Variable', { x: 715, y: 434 });

    // Step13: Give any input in "Value" field
    // Value field — real DOM selector confirmed: input[name="variableValue"]
    const valueField_step13 = page.locator('input[name="variableValue"]');
    await valueField_step13.waitFor({ state: 'visible', timeout: 30_000 });
    await valueField_step13.fill("testvalue");
    await page.waitForTimeout(300);

    // Step14: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(200);

    // Step15: Click Notification Section
    await page.getByText('Notification', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step16: Drag and Drop the "Send Mail" action into Trigger box
    // dragModule: Send Mail below Set Variable
    await dragModule(page, 'Send Mail', { x: 715, y: 580 });

    // Step17: Give input as tmaniflow@gmail.com in "To" field
    // Fill To field
    await flow.pickDropdownItem('Choose To');
    await page.waitForTimeout(300);

    // Step18: Give input as Automation in "Subject" field
    // Fill Subject field via getByRole (pierces shadow DOM)
    const subjectField = page.getByRole('textbox', { name: /subject/i });
    await subjectField.waitFor({ state: 'visible', timeout: 60_000 });
    await subjectField.fill("Automation");
    await page.waitForTimeout(300);

    // Step19: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(200);

    // Step20: Swith ON the flow
    // Expected Result (xlsx): "flow should be SwitchedON"
    // Real locator: input[name="switch"] — confirmed from live DOM discovery
    const flowToggle = page.locator('input[name="switch"]').first();
    await flowToggle.waitFor({ state: 'attached', timeout: 20_000 });
    await page.evaluate(() => {
      const inp = document.querySelector('input[name="switch"]') as HTMLElement | null;
      if (!inp) throw new Error('Switch input[name="switch"] not found');
      let el: HTMLElement | null = inp.parentElement;
      while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;
      (el ?? inp).click();
    });
    await page.waitForTimeout(300);
    await expect(flowToggle).toBeChecked({ timeout: 30_000 });     // Expected: "flow should be SwitchedON"

    // Step21: Click History Subtab
    // Click History tab in the flow editor
    await page.getByRole('tab', { name: /history/i }).first()
              .or(page.getByText('History', { exact: true }).first()).click();
    await page.waitForTimeout(200);

    // Step22: Wait until set the trigger scheduler Time
    // Wait for the scheduled trigger to fire (+3 min set above, wait 4 min to be safe)
    console.log('Waiting 4 minutes for scheduler trigger...');
    await page.waitForTimeout(4 * 60_000);
    console.log('Wait complete.');

    // Step23: Click Refresh icon in history Tab
    // Click History tab in the flow editor
    await page.getByRole('tab', { name: /history/i }).first()
              .or(page.getByText('History', { exact: true }).first()).click();
    await page.waitForTimeout(200);

    // Step24: Click latest execution Record
    // Click the most-recent execution record in the History list
    const execRow = page.locator('table tbody tr, [class*="execution-row"], [class*="history-item"]').first();
    await execRow.waitFor({ state: 'visible', timeout: 30_000 });
    await execRow.click();
    await page.waitForTimeout(200);

    // Step25: Click Setvariable Input
    // Click the Input section of the Set Variable execution detail
    await page.getByText('Input', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step26: Click Setvariable output
    // Click the Output section of the Set Variable execution detail
    await page.getByText('Output', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step27: Click close window icon
    // Close the execution detail modal/panel
    const closeBtn = page.locator('[aria-label*="close" i], [class*="close-btn"], [class*="close-icon"], [class*="modal"] button:last-child').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(200);
  });
});
