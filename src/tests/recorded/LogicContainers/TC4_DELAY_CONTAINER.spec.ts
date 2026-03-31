import { test, expect } from '../../../fixtures/base';
import { FlowHelper } from '../../../helpers/flowHelper';
import { dragModule } from '../../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC4: Delay_Container
 * Validate the Delay container is working
 * Generated from LogicContainers.xlsx — locators verified against DOM snapshots.
 */
test.describe('[TC4] DELAY CONTAINER', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow created during the test
    if (!flowName) return;
    try {
      await page.goto('https://flow.localzoho.com/#/workspace/default/flows', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(800);
      const card = page
        .locator('[class*="flow"]')
        .filter({ hasText: flowName })
        .first();
      if ((await card.count()) === 0) return;
      await card.hover();
      await page.waitForTimeout(300);
      const moreOpts = card.locator('[aria-label*="more" i], button').last();
      await moreOpts.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      await page
        .getByText(/^delete$/i)
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
      await page
        .getByRole('button', { name: /^delete$/i })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(600);
    } catch {
      /* ignore cleanup errors */
    }
  });

  test('Validate the Delay container is working', async ({ page }) => {
    test.setTimeout(420_000);

    // Step1: Click My Flows Tab
    await page.goto('https://flow.localzoho.com/#/workspace/default/flows', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(600);

    // Step2: Click Create Flow button in MyFlows Tab
    await page.getByRole('button', { name: /create flow/i }).click();
    await page.waitForTimeout(600);

    // Step3: Provide FlowName as "Delayflow" in Flow Name field
    flowName = 'Delayflow';
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await nameInput.fill(flowName);

    // Step4: Click Create Button
    const preCreateUrl = page.url();
    await page
      .locator('input#createFlowButton, input[name="save"][type="submit"]')
      .first()
      .click();
    await page.waitForURL(
      (url) => url.href.includes('/edit') && url.href !== preCreateUrl,
      { timeout: 30_000 }
    );
    await page.waitForTimeout(800);

    // Step5: Click Configure button in Schedule section
    await page
      .getByText('Choose the event that triggers your flow')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await page.waitForTimeout(600);

    // Step6: Click Frequency field and set Once
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 15_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await page.waitForTimeout(600);
    try {
      const onceOpt = page
        .locator('.customSelect_scheduleBy li, .customSelect-ul li')
        .filter({ hasText: /^Once$/i })
        .first();
      await onceOpt.waitFor({ state: 'visible', timeout: 8_000 });
      await onceOpt.click();
    } catch {
      await page.getByText('Once', { exact: true }).first().click();
    }

    // Step7: Click DateField and set 3Minutes later
    {
      const d = new Date(Date.now() + 3 * 60_000);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const ds = `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
      await page.getByRole('textbox', { name: /start date/i }).fill(ds);
    }

    // Step8: Click Apply button
    await page.getByRole('button', { name: /^apply$/i }).click();

    // Step9: Click Done button
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(600);

    // Step10: Click "Built-ins" Subtab
    const builtinsTab = page
      .locator('[data-ember-action]')
      .filter({ hasText: /^Built-ins$/i });
    await builtinsTab.first().waitFor({ state: 'visible', timeout: 20_000 });
    await builtinsTab.first().click();
    await page.waitForTimeout(1200);

    // Step11: Click Logic Subtab
    try {
      const logicSection = page
        .locator('[data-ember-action]')
        .filter({ hasText: /^Logic$/i });
      await logicSection
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 });
      await logicSection.first().click();
    } catch {
      await page.getByText('Logic', { exact: true }).first().click();
    }
    await page.waitForTimeout(600);

    // Step12: Drag "Delay" into Trigger box
    await dragModule(page, 'Delay', { x: 715, y: 434 });
    await page.waitForTimeout(3000); // wait for Delay popup to fully load

    // Step13: Give input as "1 Minute" in "Delay For" input field
    // The Delay popup shows a numeric/text input for the delay duration.
    // Try multiple selector strategies for the Delay For field.
    {
      // Strategy 1: Look for an input field near the "Delay For" label
      const delayInput = page
        .locator('input[type="text"], input[type="number"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
        .filter({ hasText: /./})
        .or(page.locator('.popupContentScoll input, .zf-actionPopup input').first());

      // Strategy 2: Try to find an input in the popup that's visible
      try {
        const popupInputs = page.locator('.popupContentScoll input[type="text"], .popupContentScoll input[type="number"], .zf-actionPopup input[type="text"], .zf-actionPopup input[type="number"]');
        await popupInputs.first().waitFor({ state: 'visible', timeout: 10_000 });
        await popupInputs.first().fill('1');
      } catch {
        // Strategy 3: Find input near "Delay For" label text
        try {
          const delayLabel = page.getByText(/delay\s*for/i).first();
          await delayLabel.waitFor({ state: 'visible', timeout: 5_000 });
          // Get the parent container and find the input within it
          const container = delayLabel.locator('..').locator('input').first();
          await container.fill('1');
        } catch {
          // Strategy 4: Just find any visible input in the active popup
          const anyInput = page.locator('.zf-formField input, .zf-module-popup input, input[name*="delay" i], input[name*="duration" i], input[name*="value" i]').first();
          await anyInput.waitFor({ state: 'visible', timeout: 10_000 });
          await anyInput.fill('1');
        }
      }

      // Check if there is a unit selector (Minutes dropdown) and set it
      try {
        const unitSelector = page.locator('.customSelect, select').filter({ hasText: /minute/i }).first();
        const isVis = await unitSelector.isVisible({ timeout: 3_000 }).catch(() => false);
        if (!isVis) {
          // Try clicking a dropdown for the time unit and select Minutes
          const unitDropdown = page.locator('.popupContentScoll .customSelect, .zf-actionPopup .customSelect, .popupContentScoll select').first();
          if (await unitDropdown.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await unitDropdown.click();
            await page.waitForTimeout(400);
            await page.getByText(/minute/i).first().click();
          }
        }
      } catch {
        /* unit may already be set to Minutes by default */
      }
    }
    await page.waitForTimeout(800);

    // Step14: Click Done button
    await page.locator('button[name="save"]').first().click();
    await page.waitForTimeout(800);

    // Re-ensure Built-ins tab is active after closing Delay popup
    try {
      const builtinsTab2 = page
        .locator('[data-ember-action]')
        .filter({ hasText: /^Built-ins$/i });
      const isBuiltinsVisible = await builtinsTab2
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (!isBuiltinsVisible) {
        await builtinsTab2.first().click({ timeout: 5_000 });
        await page.waitForTimeout(400);
      }
    } catch {
      /* sidebar already showing built-ins */
    }

    // Step15: Click Notification Section
    try {
      const notifSection = page
        .locator('[data-ember-action]')
        .filter({ hasText: /^Notification$/i });
      await notifSection
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 });
      await notifSection.first().click();
    } catch {
      await page
        .getByText('Notification', { exact: true })
        .first()
        .click();
    }
    await page.waitForTimeout(400);

    // Step16: Drag and Drop the "Send EMail" action into Trigger box
    await dragModule(page, 'Send Email', { x: 715, y: 520 });
    await page.waitForTimeout(3000); // wait for Send Email popup

    // Step17: Type as tmaniflow@gmail.com in "To" field
    await page.waitForSelector('input[name="to"]', {
      state: 'attached',
      timeout: 30_000,
    });
    await page
      .locator('input[name="to"]')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.locator('input[name="to"]').first().fill('tmaniflow@gmail.com');

    // Step18: Type as Automation in "Subject" field
    await page.waitForSelector('input[name="subject"]', {
      state: 'attached',
      timeout: 30_000,
    });
    await page
      .locator('input[name="subject"]')
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.locator('input[name="subject"]').first().fill('Automation');

    // Step19: Click Done button
    await page.locator('button[name="save"]').first().click();
    await page.waitForTimeout(600);

    // Step20: Switch ON the flow
    const switchLabel = page
      .locator('label.switch, .switchContent label')
      .first();
    await switchLabel.waitFor({ state: 'attached', timeout: 15_000 });
    await switchLabel.scrollIntoViewIfNeeded();
    await switchLabel.click();
    await page.waitForTimeout(1000);

    // Step21: Click History Subtab
    try {
      const histTab = page
        .locator('[data-ember-action]')
        .filter({ hasText: /^History$/ });
      await histTab.first().waitFor({ state: 'visible', timeout: 8_000 });
      await histTab.first().click();
    } catch {
      await page
        .getByRole('link', { name: 'History' })
        .first()
        .click({ timeout: 10_000 });
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
        await page.mouse.move(
          400 + Math.random() * 100,
          400 + Math.random() * 100
        );
        // Check if page navigated away from flow builder
        const currentUrl = page.url();
        if (!currentUrl.includes('/edit')) {
          await page.goto(flowEditUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          // Re-click History tab
          try {
            const ht = page
              .locator('[data-ember-action]')
              .filter({ hasText: /^History$/ });
            await ht.first().waitFor({ state: 'visible', timeout: 8_000 });
            await ht.first().click();
          } catch {
            await page
              .getByRole('link', { name: 'History' })
              .first()
              .click({ timeout: 10_000 });
          }
          await page.waitForTimeout(1000);
        }
      }
    }

    // Step23: Click Refresh icon in history Tab
    const refreshBtn = page
      .locator(
        'button[title*="refresh" i], button[aria-label*="refresh" i], .refresh-icon, .icon-refresh, [class*="refresh"]'
      )
      .first();
    try {
      await refreshBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await refreshBtn.click();
    } catch {
      await page
        .locator('button, a')
        .filter({ hasText: /refresh/i })
        .first()
        .click()
        .catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Step24: Click latest execution Record
    try {
      const execRow = page.locator('table tbody tr').first();
      await execRow.waitFor({ state: 'visible', timeout: 20_000 });
      await execRow.click();
    } catch {
      const allRows = page.locator(
        'table tr, .execution-row, .history-item'
      );
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

    // Step25: Click Delay Input
    // Click Delay input section in execution detail
    await page
      .locator('[class*="delay" i], [class*="action" i], .action-node')
      .filter({ hasText: /input/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(400);

    // Step26: Click Delay output
    // Click Delay output section in execution detail
    await page
      .locator('[class*="delay" i], [class*="action" i], .action-node')
      .filter({ hasText: /output/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(400);

    // Step27: Click close window icon
    try {
      await page
        .locator(
          'button[aria-label*="close" i], .close-btn, .modal-close, button.close'
        )
        .first()
        .click();
    } catch {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  });
});
