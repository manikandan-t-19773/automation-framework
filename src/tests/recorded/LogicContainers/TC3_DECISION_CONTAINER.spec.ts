import { test, expect } from '../../../fixtures/base';
import { FlowHelper } from '../../../helpers/flowHelper';
import { DragHelper } from '../../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC3: DECISION_CONTAINER
 * Validate the  condition in the decision container are working
 * Source: manualtestcasedoc/LogicContainers.xlsx
 */
test.describe('[LC_TC3] DECISION_CONTAINER', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    if (flowName) {
      try {
        const flow = new FlowHelper(page);
        await flow.deleteFlow(flowName);
      } catch (_) { /* best-effort cleanup */ }
    }
  });

  test('Validate the  condition in the decision container are working', async ({ page }) => {
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

    // Step12: Drag "Set Variable" into Trigger box
    // Drag "Set Variable" from sidebar to canvas (1st action slot)
    {
      const dragHelper = new DragHelper(page);
      // DragHelper.dragAndDrop(sourceCSS, targetCSS, dropPosition)
      await dragHelper.dragAndDrop(
        'p:has-text("Set Variable"), span:has-text("Set Variable"), li:has-text("Set Variable")',
        '',
        { x: 715, y: 434 }
      );
      console.log('Dragged Set Variable to canvas (715, 434)');
      await page.waitForTimeout(1200);
    }

    // Step13: Give "qatest" input in "Value" field
    // Fill the Value field in the action config panel
    const valueField_step13 = page.getByRole('textbox', { name: /^value$/i }).or(page.locator('input[placeholder*="value" i], textarea[placeholder*="value" i]').first());
    await valueField_step13.first().waitFor({ state: 'visible', timeout: 30_000 });
    await valueField_step13.first().fill("qatest");
    await page.waitForTimeout(300);

    // Step14: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(800);

    // Step15: Drag and Drop the "Decision" box into SetVariable action
    // Drag "Decision" from sidebar to canvas (2nd action slot, below Set Variable)
    {
      const dragHelper = new DragHelper(page);
      await dragHelper.dragAndDrop(
        'p:has-text("Decision"), span:has-text("Decision"), li:has-text("Decision")',
        '',
        { x: 715, y: 580 }
      );
      console.log('Dragged Decision to canvas (715, 580)');
      await page.waitForTimeout(1200);
    }

    // Step16: Click 1st Choose option
    // Click the 1st "Choose" dropdown in the Decision condition panel
    const choose1 = page.getByRole('combobox').first()
                        .or(page.locator('[placeholder*="Choose" i]').first());
    await choose1.first().waitFor({ state: 'visible', timeout: 20_000 });
    await choose1.first().click();
    await page.waitForTimeout(400);

    // Step17: Select "Set Variable" option
    // Select "Set Variable" from the dropdown options
    await page.getByText('Set Variable', { exact: true }).first().click();
    await page.waitForTimeout(400);

    // Step18: Click 2nd Choose Option
    // Click the 2nd "Choose" dropdown (operator selector)
    const choose2 = page.getByRole('combobox').nth(1)
                        .or(page.locator('[placeholder*="Choose" i]').nth(1));
    await choose2.first().waitFor({ state: 'visible', timeout: 20_000 });
    await choose2.first().click();
    await page.waitForTimeout(400);

    // Step19: Select starts with
    // Select "starts with" operator
    await page.getByText('starts with', { exact: false }).first().click();
    await page.waitForTimeout(400);

    // Step20: Give as "qa" value in input field
    // Fill the Value field in the action config panel
    const valueField_step20 = page.getByRole('textbox', { name: /^value$/i }).or(page.locator('input[placeholder*="value" i], textarea[placeholder*="value" i]').first());
    await valueField_step20.first().waitFor({ state: 'visible', timeout: 30_000 });
    await valueField_step20.first().fill("qa");
    await page.waitForTimeout(300);

    // Step21: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(800);

    // Step22: Click Notification Section
    await page.getByText('Notification', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step23: Drag and Drop the "Send Mail" action into the "Decision" action Direct connection
    // Drag "Send Mail" from sidebar into Decision's direct/true connection
    {
      const dragHelper = new DragHelper(page);
      await dragHelper.dragAndDrop(
        'p:has-text("Send Mail"), span:has-text("Send Mail"), li:has-text("Send Mail")',
        '',
        { x: 715, y: 720 }
      );
      console.log('Dragged Send Mail into Decision direct connection (715, 720)');
      await page.waitForTimeout(1200);
    }

    // Step24: Give input as tmaniflow@gmail.com in "To" field
    // Fill To field
    await flow.pickDropdownItem('Choose To');
    await page.waitForTimeout(300);

    // Step25: Give input as Automation in "Subject" field
    // Fill Subject field via getByRole (pierces shadow DOM)
    const subjectField = page.getByRole('textbox', { name: /subject/i });
    await subjectField.waitFor({ state: 'visible', timeout: 60_000 });
    await subjectField.fill("Automation");
    await page.waitForTimeout(300);

    // Step26: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(800);

    // Step27: Swith ON the flow
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
    await page.waitForTimeout(1500);
    await expect(flowToggle).toBeChecked({ timeout: 30_000 });     // Expected: "flow should be SwitchedON"

    // Step28: Click History Subtab
    // Click History tab in the flow editor
    await page.getByRole('tab', { name: /history/i }).first()
              .or(page.getByText('History', { exact: true }).first()).click();
    await page.waitForTimeout(1000);

    // Step29: Wait until set the trigger scheduler Time
    // Wait for the scheduled trigger to fire (+3 min set above, wait 4 min to be safe)
    console.log('Waiting 4 minutes for scheduler trigger...');
    await page.waitForTimeout(4 * 60_000);
    console.log('Wait complete.');

    // Step30: Click Refresh icon in history Tab
    // Click History tab in the flow editor
    await page.getByRole('tab', { name: /history/i }).first()
              .or(page.getByText('History', { exact: true }).first()).click();
    await page.waitForTimeout(1000);

    // Step31: Click latest execution Record
    // Click the most-recent execution record in the History list
    const execRow = page.locator('table tbody tr, [class*="execution-row"], [class*="history-item"]').first();
    await execRow.waitFor({ state: 'visible', timeout: 30_000 });
    await execRow.click();
    await page.waitForTimeout(1000);

    // Step32: Click Setvariable Input
    // Click the Input section of the Set Variable execution detail
    await page.getByText('Input', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step33: Click Setvariable output
    // Click the Output section of the Set Variable execution detail
    await page.getByText('Output', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // Step34: Click close window icon
    // Close the execution detail modal/panel
    const closeBtn = page.locator('[aria-label*="close" i], [class*="close-btn"], [class*="close-icon"], [class*="modal"] button:last-child').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(600);
  });
});
