import { test, expect } from '../../fixtures/base';
import { FlowHelper } from '../../helpers/flowHelper';
import { dragModule } from '../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC3: CreateFlowSendMail
 * Create schedulerflow with SendMail action
 * Source: manualtestcasedoc/Settings_standalone.xlsx
 */
test.describe('[TC3] CreateFlowSendMail', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow after each run to keep the workspace clean
    if (flowName) {
      const flow = new FlowHelper(page);
      await flow.deleteFlow(flowName);
    }
  });

  test('Create schedulerflow with SendMail action', async ({ page }) => {
    // Allow 2 minutes for all steps (each step waits up to 2 min).
    // Playwright's retries:2 config will restart from Step 1 on failure,
    // up to 2 times before saving trace for the debugging process.
    test.setTimeout(300_000);
    const flow = new FlowHelper(page);

    // Navigate to the start URL before running steps
    await page.goto("https://flow.localzoho.com/#/workspace/default/flows");
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    // Step1: Click My Flows Tab
    await page.getByRole('link', { name: /my flows/i }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(new RegExp("/workspace/default/flows"));

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(200);

    // Step3: Provide FlowName as "sendmailflow" in Flow Name field
    // Flow name input is input[name="displayName"] in the Create Flow dialog
    const flowNameInput = page.locator('input[name="displayName"]').first();
    await flowNameInput.waitFor({ state: 'visible', timeout: 30_000 });
    await flowNameInput.fill("sendmailflow");

    // Step4: Click Create Button
    // The Create button in Zoho Flow is an <input type="submit"> not a <button>
    const createBtn = page.locator('#createFlowButton, input[type="submit"][name="save"], input[type="submit"][value="Create"]').first();
    await createBtn.waitFor({ state: 'visible', timeout: 30_000 });
    // Capture current URL before clicking so waitForURL detects the NEW flow's /edit route
    const preCreateUrl = page.url();
    await createBtn.click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    // Step5: Click Configure button in Schedule section
    // Use exact:true to avoid matching hidden sidebar labels like 'Schedule meeting'
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    // Schedule is 2nd Configure button: App(0), Schedule(1), Webhook(2)
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(400);

    // Step6: Click Frequency field and set Once
    // 3 custom selects in dialog: customSelect_flows(1st), customSelect_scheduleBy/Frequency(2nd), customSelect_timeZone(3rd)
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
    // Zoho Flow scheduler uses a textbox with aria-label "Start Date"
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    await dateBox.waitFor({ state: 'visible', timeout: 30_000 });
    // Build a date/time string 3 minutes in the future
    const fut = new Date(Date.now() + 3 * 60 * 1000);
    const p2  = (n: number) => String(n).padStart(2, '0');
    // Zoho Flow date picker accepts "MM/DD/YYYY HH:MM" style input
    const dateStr = `${p2(fut.getMonth()+1)}/${p2(fut.getDate())}/${fut.getFullYear()} ${p2(fut.getHours())}:${p2(fut.getMinutes())}`;
    await dateBox.click();
    await dateBox.fill(dateStr);
    await page.keyboard.press('Tab'); // confirm the date picker
    await page.waitForTimeout(200);

    // Step8: Click Apply button
    await page.getByRole('button', { name: /apply/i }).click();
    await page.waitForTimeout(200);

    // Step9: Click Done button
    await page.getByRole('button', { name: /done/i }).click();
    await page.waitForTimeout(200);

    // Step10: Click Build-ins Subtab
    // Open the sidebar app panel (same as clicking the search icon)
    const builtinsSearch = page.getByRole('textbox', { name: /search apps/i });
    await builtinsSearch.waitFor({ state: 'visible', timeout: 30_000 });
    await builtinsSearch.click();
    await page.waitForTimeout(200);
    // Switch to the Built-ins tab
    await page.getByRole('tab', { name: /built.?ins/i })
      .or(page.getByText('Built-ins', { exact: true })).first().click();
    await page.waitForTimeout(200);

    // Step11: Click Notification Section
    // Expand the Notification accordion in the Built-ins sidebar
    await page.getByText('Notification', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Step12: Drag and Drop the "Send Mail" action into Trigger box
    // dragModule: proven selector p.zf-module-label:text-is("Send Mail")
    await dragModule(page, 'Send Mail', { x: 715, y: 434 });

    // Step13: Give input as tmaniflow@gmail.com in "To" field
    // Fill "to" via getByRole — pierces shadow DOM in Zoho Flow editor
    const toField = page.getByRole('textbox', { name: /^to\b/i });
    await toField.waitFor({ state: 'visible', timeout: 60_000 });
    await toField.fill("tmaniflow@gmail.com");
    await page.waitForTimeout(300);

    // Step14: Give input as Automation in "Subject" field
    // Fill "subject" via getByRole — pierces shadow DOM in Zoho Flow editor
    const subjectField = page.getByRole('textbox', { name: /^subject\b/i });
    await subjectField.waitFor({ state: 'visible', timeout: 60_000 });
    await subjectField.fill("Automation");
    await page.waitForTimeout(300);

    // Step15: Click Done button
    await page.getByRole('button', { name: /done/i }).click();
    await page.waitForTimeout(200);

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
    await page.waitForTimeout(300);
    const flowToggle = page.locator('input[name="switch"], input.switch-input').first();
    await expect(flowToggle).not.toBeChecked({ timeout: 30_000 }); // Expected: "flow should not be SwitchedON"
  });
});
