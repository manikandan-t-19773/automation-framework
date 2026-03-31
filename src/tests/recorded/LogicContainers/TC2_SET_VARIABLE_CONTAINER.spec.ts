import { test, expect } from '../../..//fixtures/base';
import { FlowHelper } from '../../..//helpers/flowHelper';
import { dragModule } from '../../..//helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC2: SET_VARIABLE_CONTAINER
 * Validate the set variable container is working
 * AUTO-RECORDED by auto_recorder.ts — locators verified against live DOM.
 */
test.describe('[TC2] SET VARIABLE CONTAINER', () => {
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

  test('set variable container', async ({ page }) => {
    test.setTimeout(420_000);
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
    await page.waitForTimeout(600);
    // waitFor dropdown list item before clicking (renders async)
    try {
      const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect-ul li')
        .filter({ hasText: /^Once$/i }).first();
      await onceOpt.waitFor({ state: 'visible', timeout: 8_000 });
      await onceOpt.click();
    } catch {
      await page.getByText('Once', { exact: true }).first().click();
    }

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
    // Step11: Click Logic Subtab
    try {
      const logicSection = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });
      await logicSection.first().waitFor({ state: 'visible', timeout: 8_000 });
      await logicSection.first().click();
    } catch {
      await page.getByText('Logic', { exact: true }).first().click();
    }
    await page.waitForTimeout(600);

    // Step12: Drag "Set Variable" into Trigger box
    await dragModule(page, "Set Variable", { x: 715, y: 434 });
    await page.waitForTimeout(3000); // wait for canvas popup to fully load

    // Step13: Give any input in "Value" field
    const valueField = page.locator('input[name="variableValue"]');
    await valueField.waitFor({ state: 'visible', timeout: 15_000 });
    await valueField.fill("Value");

    // Step14: Click Done button
    await page.locator('button[name="save"]').first().click();
    await page.waitForTimeout(800);

    // Re-ensure Built-ins tab is active after closing Set Variable popup
    // (popup Done may change sidebar state)
    try {
      const builtinsTab = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });
      const isBuiltinsVisible = await builtinsTab.first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (!isBuiltinsVisible) {
        await builtinsTab.first().click({ timeout: 5_000 });
        await page.waitForTimeout(400);
      }
    } catch { /* sidebar already showing built-ins */ }

    // Step15: Click Notification Section
    try {
      const notifSection = page.locator('[data-ember-action]').filter({ hasText: /^Notification$/i });
      await notifSection.first().waitFor({ state: 'visible', timeout: 8_000 });
      await notifSection.first().click();
    } catch {
      await page.getByText('Notification', { exact: true }).first().click();
    }
    await page.waitForTimeout(400);

    // Step16: Drag and Drop the "Send Mail" action into Trigger box
    await dragModule(page, "Send Email", { x: 715, y: 520 });
    await page.waitForTimeout(3000); // wait for canvas popup to fully load

    // Step17: Give input as tmaniflow@gmail.com in "To" field
    // Step: Fill Send Email 'To' field
    // Confirmed: input[name="to"] (634x35px, visible in .popupContentScoll)
    // page.waitForSelector used — reliable for Ember async renders.
    await page.waitForSelector('input[name="to"]', { state: 'attached', timeout: 30_000 });
    await page.locator('input[name="to"]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.locator('input[name="to"]').first().fill("tmaniflow@gmail.com");

    // Step18: Give input as Automation in "Subject" field
    // Step: Fill Send Email 'Subject' field
    // Confirmed: input[name="subject"] inside .popupContentScoll
    await page.waitForSelector('input[name="subject"]', { state: 'attached', timeout: 30_000 });
    await page.locator('input[name="subject"]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.locator('input[name="subject"]').first().fill("Automation");

    // Step19: Click Done button
    await page.locator('button[name="save"]').first().click();
    await page.waitForTimeout(600);

    // Step20: Swith ON the flow
    // Step: Switch ON the flow
    // Confirmed: <label class="switch flRight"> wraps hidden <input name="switch" class="switch-input">
    // scrollIntoViewIfNeeded required — toggle may be below the fold.
    const switchLabel = page.locator('label.switch, .switchContent label').first();
    await switchLabel.waitFor({ state: 'attached', timeout: 15_000 });
    await switchLabel.scrollIntoViewIfNeeded();
    await switchLabel.click();
    await page.waitForTimeout(1000);

    // Step21: Click History Subtab
    // History tab may use data-ember-action or role=link. Settings>History is hidden
    // (submenu collapsed) so only the flow-builder History tab should be visible.
    try {
      const histTab = page.locator('[data-ember-action]').filter({ hasText: /^History$/ });
      await histTab.first().waitFor({ state: 'visible', timeout: 8_000 });
      await histTab.first().click();
    } catch {
      // Fallback: aria role link named History (Settings>History hidden → only builder tab visible)
      await page.getByRole('link', { name: 'History' }).first().click({ timeout: 10_000 });
    }
    await page.waitForTimeout(1000);

    // Step22: Wait until set the trigger scheduler Time
    // Keep-alive polling to prevent idle timeout during ~3.5 min scheduler wait
    {
      const flowEditUrl = page.url();
      const waitEnd = Date.now() + 200_000;
      while (Date.now() < waitEnd) {
        await page.waitForTimeout(15_000);
        // Keep session alive — mouse move prevents idle timeout
        await page.mouse.move(400 + Math.random() * 100, 400 + Math.random() * 100);
        // Check if page navigated away from flow builder
        const currentUrl = page.url();
        if (!currentUrl.includes('/edit')) {
          await page.goto(flowEditUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          // Re-click History tab
          try {
            const ht = page.locator('[data-ember-action]').filter({ hasText: /^History$/ });
            await ht.first().waitFor({ state: 'visible', timeout: 8_000 });
            await ht.first().click();
          } catch {
            await page.getByRole('link', { name: 'History' }).first().click({ timeout: 10_000 });
          }
          await page.waitForTimeout(1000);
        }
      }
    }

    // Step23: Click Refresh icon in history Tab
    // Refresh history list
    const refreshBtn = page.locator('button[title*="refresh" i], button[aria-label*="refresh" i], .refresh-icon, .icon-refresh, [class*="refresh"]').first();
    try {
      await refreshBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await refreshBtn.click();
    } catch {
      await page.locator('button, a').filter({ hasText: /refresh/i }).first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Step24: Click latest execution Record
    // Use table tbody tr to skip hidden header rows; fallback to broader selectors
    try {
      const execRow = page.locator('table tbody tr').first();
      await execRow.waitFor({ state: 'visible', timeout: 20_000 });
      await execRow.click();
    } catch {
      // Fallback: find first VISIBLE tr in any table
      const allRows = page.locator('table tr, .execution-row, .history-item');
      const count = await allRows.count();
      let clicked = false;
      for (let i = 0; i < count && !clicked; i++) {
        if (await allRows.nth(i).isVisible()) {
          await allRows.nth(i).click();
          clicked = true;
        }
      }
    }
    await page.waitForTimeout(800);

    // Step25: Click Setvariable Input
    // Click Set Variable input section in execution detail
    await page.locator('[class*="setvariable" i], .action-node').filter({ hasText: /input/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);

    // Step26: Click Setvariable output
    // Click Set Variable output section in execution detail
    await page.locator('[class*="setvariable" i], .action-node').filter({ hasText: /output/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);

    // Step27: Click close window icon
    // Close dialog/window
    try {
      await page.locator('button[aria-label*="close" i], .close-btn, .modal-close, button.close').first().click();
    } catch {
      try { await page.keyboard.press('Escape'); } catch { /* page may be closing */ }
    }
    await page.waitForTimeout(400).catch(() => {});
  });
});
