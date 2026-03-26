import { test, expect } from '../../fixtures/base';
import { FlowHelper } from '../../helpers/flowHelper';
import { DragHelper } from '../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC2: CreateSchedulerFlow
 * Create schedulerflow with slack app- send direct message action
 * Source: manualtestcasedoc/Settings_standalone.xlsx
 */
test.describe('[TC2] CreateSchedulerFlow', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow after each run to keep the workspace clean
    if (flowName) {
      const flow = new FlowHelper(page);
      await flow.deleteFlow(flowName);
    }
  });

  test('Create schedulerflow with slack app- send direct message action', async ({ page }) => {
    // Allow 2 minutes for all steps (each step waits up to 2 min).
    // Playwright's retries:2 config will restart from Step 1 on failure,
    // up to 2 times before saving trace for the debugging process.
    test.setTimeout(120_000);
    const flow = new FlowHelper(page);

    // Navigate to the start URL before running steps
    await page.goto("https://flow.localzoho.com/#/workspace/default/flows");
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Step1: Click My Flows Tab
    await page.getByRole('link', { name: /my flows/i }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(new RegExp("/workspace/default/flows"));

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(800);

    // Step3: Provide FlowName as "Schflow" in Flow Name field
    // Flow name input is input[name="displayName"] in the Create Flow dialog
    const flowNameInput = page.locator('input[name="displayName"]').first();
    await flowNameInput.waitFor({ state: 'visible', timeout: 120_000 });
    await flowNameInput.fill("Schflow");

    // Step4: Click Create Button
    // The Create button in Zoho Flow is an <input type="submit"> not a <button>
    const createBtn = page.locator('#createFlowButton, input[type="submit"][name="save"], input[type="submit"][value="Create"]').first();
    await createBtn.waitFor({ state: 'visible', timeout: 120_000 });
    // Capture current URL before clicking so waitForURL detects the NEW flow's /edit route
    const preCreateUrl = page.url();
    await createBtn.click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 120_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step5: Click Configure button in Schedule section
    // Use exact:true to avoid matching hidden sidebar labels like 'Schedule meeting'
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 120_000 });
    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
    // Schedule is 2nd Configure button: App(0), Schedule(1), Webhook(2)
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(2000);

    // Step6: Click Frequency field and set Once
    // 3 custom selects in dialog: customSelect_flows(1st), customSelect_scheduleBy/Frequency(2nd), customSelect_timeZone(3rd)
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 120_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await page.waitForTimeout(1000);
    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect_scheduleBy div, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();
    const onceOptFallback = page.getByText('Once', { exact: true }).first();
    try {
      await onceOpt.waitFor({ state: 'visible', timeout: 120_000 });
      await onceOpt.click();
    } catch {
      await onceOptFallback.waitFor({ state: 'visible', timeout: 120_000 });
      await onceOptFallback.click();
    }
    await page.waitForTimeout(500);

    // Step7: Click DateField and set 3Minutes later
    // Zoho Flow scheduler uses a textbox with aria-label "Start Date"
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    await dateBox.waitFor({ state: 'visible', timeout: 120_000 });
    // Build a date/time string 3 minutes in the future
    const fut = new Date(Date.now() + 3 * 60 * 1000);
    const p2  = (n: number) => String(n).padStart(2, '0');
    // Zoho Flow date picker accepts "MM/DD/YYYY HH:MM" style input
    const dateStr = `${p2(fut.getMonth()+1)}/${p2(fut.getDate())}/${fut.getFullYear()} ${p2(fut.getHours())}:${p2(fut.getMinutes())}`;
    await dateBox.click();
    await dateBox.fill(dateStr);
    await page.keyboard.press('Tab'); // confirm the date picker
    await page.waitForTimeout(800);

    // Step8: Click Apply button
    await page.getByRole('button', { name: /apply/i }).click();
    await page.waitForTimeout(500);

    // Step9: Click Done button
    await page.getByRole('button', { name: /done/i }).click();
    await page.waitForTimeout(800);

    // Step10: Click search icon from leftside to search app name
    // Zoho Flow builder sidebar search box — aria-label 'Search apps, actions, or logic'
    const searchInput = page.getByRole('textbox', { name: /search apps/i });
    await searchInput.waitFor({ state: 'visible', timeout: 120_000 });
    await searchInput.click();
    await page.waitForTimeout(500);

    // Step11: search appname as slack
    const appSearchBox = page.getByRole('textbox', { name: /search apps/i });
    await appSearchBox.waitFor({ state: 'visible', timeout: 120_000 });
    await appSearchBox.fill("Slack");
    await page.waitForTimeout(1000);

    // Step12: Drag and Drop the "Send Direct Message" action into "Schedule Once" Trigger
    // Drag "Send Direct Message" onto the canvas (bbox-based DragHelper)
    const actionPara = page.locator('p').filter({ hasText: /Send Direct Message/i }).first();
    await actionPara.waitFor({ state: 'visible', timeout: 120_000 });
    const dragHelperInst = new DragHelper(page);
    // Tag the <li> parent; use concat (not template literal) inside evaluate
    const srcTagged = await actionPara.evaluate(function(el) {
      var node: HTMLElement | null = el as HTMLElement;
      for (var i = 0; i < 10; i++) {
        if (!node) break;
        if (node.tagName === 'LI') {
          var uid = 'dnd-' + Math.random().toString(36).slice(2, 10);
          node.setAttribute('data-dnd', uid);
          return '[data-dnd="' + uid + '"]';
        }
        node = node.parentElement;
      }
      return '';
    });
    if (!srcTagged) throw new Error('Could not tag <li> ancestor for "Send Direct Message"');
    // Drop at canvas coordinates derived from the trigger node bbox + 220px below
    await dragHelperInst.dragAndDrop(srcTagged, '', { x: 715, y: 434 });

    // Step13: give input as test in message field
    await page.getByRole('textbox').filter({ hasText: '' }).first().fill('test');
    await page.waitForTimeout(300);

    // Step14: Select 1st option in To Field
    await page.locator('select, [role="combobox"], [role="listbox"]').first().click();
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(300);

    // Step15: Click Done button
    await page.getByRole('button', { name: /done/i }).click();
    await page.waitForTimeout(800);

    // Step16: Swith ON the flow
    // Expected Result (xlsx): "flow should not be SwitchedON"
    // Attempt to toggle the flow switch
    await page.evaluate(() => {
      const input = document.querySelector('input[name="switch"], input.switch-input') as HTMLElement | null;
      if (!input) throw new Error('Switch input not found');
      let el: HTMLElement | null = input.parentElement;
      while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;
      (el ?? input).click();
    });
    await page.waitForTimeout(1500);
    const flowToggle = page.locator('input[name="switch"], input.switch-input').first();
    await expect(flowToggle).not.toBeChecked({ timeout: 120_000 }); // Expected: "flow should not be SwitchedON"
  });
});
