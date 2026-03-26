/**
 * FlowHelper — shared utilities for Zoho Flow builder test cases.
 *
 * All "Create Flow" test cases share the same setup steps:
 *   1. Navigate to /flows
 *   2. Click "Create Flow", fill name, click "Create"
 *   3. Configure a trigger (Schedule / Webhook / App-based)
 *   4. Search an app in the sidebar
 *   5. Drag-and-drop action onto canvas (using DragHelper)
 *   6. Fill action config (connection, params)
 *   7. Toggle flow ON
 *
 * Centralising these here means:
 *  - TC spec files stay thin (just call helper methods)
 *  - Selector fixes made once here propagate to ALL test cases
 *  - xlsx_to_spec.ts generated specs just call these methods
 */

import { Page, expect } from '@playwright/test';
import { DragHelper } from './dragHelper';

const BASE = 'https://flow.localzoho.com';

export class FlowHelper {
  readonly dragHelper: DragHelper;

  constructor(private page: Page) {
    this.dragHelper = new DragHelper(page);
  }

  // ── 1. Create a new flow ─────────────────────────────────────────────────
  /**
   * Navigate to the Flows list, click "Create Flow", fill the name, click "Create".
   * Returns the flow name that was used (incl. timestamp suffix).
   *
   * @param baseName  Prefix for the flow name (e.g. 'qaflow')
   */
  async createFlow(baseName = 'qaflow'): Promise<string> {
    const flowName = `${baseName}${Date.now()}`;
    await this.page.goto(`${BASE}/#/workspace/default/flows`);
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1500);

    await this.page.getByRole('button', { name: 'Create Flow' }).click();
    await this.page.waitForTimeout(800);
    await this.page.getByRole('textbox', { name: 'E.g. Zoho Desk to Zoho CRM' }).fill(flowName);
    await this.page.getByRole('button', { name: 'Create' }).click();

    await this.page.waitForURL(
      (url) => url.href.includes('/edit') && url.href.includes(flowName),
      { timeout: 30000 },
    );
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
    return flowName;
  }

  // ── 2. Configure triggers ─────────────────────────────────────────────────

  /**
   * Configure the Schedule trigger with Frequency = "Once" and a start date.
   * Clicks the "Configure" button on the Schedule card, picks frequency,
   * sets date (clicks day 26), adjusts minutes, clicks Apply → Done.
   */
  async configureScheduleTrigger(): Promise<void> {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: 'Schedule Triggers a one-time' })
      .locator('#continue')
      .click();
    await this.page.waitForTimeout(2000);

    await this.page.getByRole('textbox', { name: 'Choose Frequency' }).click();
    await this.page.getByRole('listitem').filter({ hasText: 'Once' }).click();

    await this.page.getByRole('textbox', { name: 'Start Date' }).click();
    await this.page.getByRole('button', { name: '26' }).click();
    // Decrement minutes 3×
    for (let i = 0; i < 3; i++) {
      await this.page
        .locator('.minutes > .zf-relative > .zf-i-arrows > .zf-icon-down-arrow.zf-top')
        .click();
    }

    await this.page.getByRole('button', { name: 'Apply' }).click();
    await this.page.getByRole('button', { name: 'Done' }).click();
    await this.page.waitForTimeout(800);
  }

  /**
   * Configure the Webhook trigger.
   * Clicks Configure on the Webhook card → clicks Done.
   */
  async configureWebhookTrigger(): Promise<void> {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: 'Webhook' })
      .locator('#continue')
      .click();
    await this.page.waitForTimeout(2000);
    await this.page.getByRole('button', { name: 'Done' }).click();
    await this.page.waitForTimeout(800);
  }

  /**
   * Configure an App-based trigger.
   * @param appName      App display name e.g. 'Zoho CRM'
   * @param eventName    Trigger event name e.g. 'New Contact'
   * @param connection   Connection name to pick (picks first match if omitted)
   */
  async configureAppTrigger(appName: string, eventName: string, connection?: string): Promise<void> {
    // Click the "App" Configure button (first one)
    await this.page
      .getByRole('listitem')
      .filter({ hasText: appName })
      .locator('#continue')
      .first()
      .click();
    await this.page.waitForTimeout(2000);

    // Pick event
    await this.page.getByRole('textbox', { name: 'Choose Event' }).click();
    await this.page.getByRole('listitem').filter({ hasText: eventName }).click();
    await this.page.waitForTimeout(500);

    // Pick connection
    await this._pickDropdownItem('Choose Connection', connection);
    await this.page.waitForTimeout(500);

    await this.page.getByRole('button', { name: 'Done' }).click();
    await this.page.waitForTimeout(800);
  }

  // ── 3. Search sidebar & drag action ──────────────────────────────────────

  /**
   * Search the action sidebar for an app by name.
   * @param appName  e.g. 'slack', 'Zoho CRM'
   */
  async searchSidebarApp(appName: string): Promise<void> {
    await this.page
      .getByRole('textbox', { name: 'Search apps, actions, or logic' })
      .fill(appName);
    await this.page.waitForTimeout(1200);
  }

  /**
   * Wait until the given action name is visible in the sidebar result list.
   * Returns a locator scoped to that inner action <li>.
   *
   * Uses double filter to avoid matching the outer app-section <li> that also
   * contains the action text but has an <h4> heading.
   *
   * @param actionName  e.g. 'Send direct message'
   */
  async getSidebarActionItem(actionName: string) {
    const item = this.page
      .locator('li')
      .filter({ has: this.page.getByText(actionName, { exact: true }) })
      .filter({ hasNot: this.page.locator('h4') })
      .first();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    return item;
  }

  /**
   * Drag a sidebar action onto the canvas under the trigger node.
   *
   * Drop coordinates are derived from the trigger node's bounding box so
   * the drop always lands within the canvas viewport regardless of resolution.
   *
   * @param actionName   e.g. 'Send direct message'
   * @param triggerLabel Accessible name of the trigger textbox e.g. 'Schedule Once'
   * @param dropOffsetY  Pixels below the trigger bottom to drop (default 200)
   */
  async dragActionToCanvas(
    actionName: string,
    triggerLabel: string,
    dropOffsetY = 200,
  ): Promise<void> {
    const srcEl = await this.getSidebarActionItem(actionName);

    // Stamp a stable CSS selector on the element
    const srcSel = await srcEl.evaluate((el: Element) => {
      el.setAttribute('data-dnd', 'dnd-src');
      return '[data-dnd="dnd-src"]';
    });

    // Derive drop position from the trigger node bbox
    const triggerBox = await this.page
      .getByRole('textbox', { name: triggerLabel })
      .boundingBox();
    if (!triggerBox) throw new Error(`Trigger bbox not found for: ${triggerLabel}`);

    const dropX = triggerBox.x + triggerBox.width / 2;
    const dropY = triggerBox.y + triggerBox.height + dropOffsetY;

    await this.dragHelper.dragAndDrop(srcSel, '', { x: dropX, y: dropY });
    await this.page.waitForTimeout(3000);
  }

  // ── 4. Action config panel helpers ───────────────────────────────────────

  /**
   * Pick the first (or named) item from a custom Zoho dropdown.
   * Works for both native <ul> and Ember <div role="list"> dropdowns.
   *
   * @param placeholder  The textbox placeholder text e.g. 'Choose Connection'
   * @param itemText     Partial text of the item to select (picks first if omitted)
   */
  async pickDropdownItem(placeholder: string, itemText?: string): Promise<void> {
    await this.page.getByRole('textbox', { name: placeholder }).click();
    await this.page.waitForTimeout(800);
    await this._pickDropdownItem(placeholder, itemText);
    await this.page.waitForTimeout(500);
  }

  /** Internal — finds the open dropdown adjacent to the given placeholder input */
  private async _pickDropdownItem(placeholder: string, itemText?: string): Promise<void> {
    await this.page.evaluate(
      ({ placeholder, itemText }: { placeholder: string; itemText?: string }) => {
        const inputs = Array.from(
          document.querySelectorAll('input, [role="textbox"]'),
        ) as HTMLElement[];
        const input = inputs.find(
          (el) =>
            (el as HTMLInputElement).placeholder === placeholder ||
            el.getAttribute('aria-label') === placeholder ||
            el.textContent?.trim() === placeholder,
        );
        if (!input) throw new Error(`Dropdown input not found: ${placeholder}`);
        const container = input.closest('div');
        if (!container) throw new Error(`Container not found for: ${placeholder}`);
        const dropdown = container.nextElementSibling as HTMLElement;
        if (!dropdown) throw new Error(`Dropdown not found for: ${placeholder}`);
        const items = Array.from(
          dropdown.querySelectorAll('li, [role="listitem"]'),
        ) as HTMLElement[];
        if (!items.length) throw new Error(`No items in dropdown for: ${placeholder}`);
        const target = itemText
          ? items.find((el) => el.textContent?.includes(itemText)) ?? items[0]
          : items[0];
        target.click();
      },
      { placeholder, itemText },
    );
  }

  /**
   * Fill a textarea/textbox inside the action config panel.
   * @param name   Accessible name or placeholder of the field
   * @param value  Text to fill
   */
  async fillActionField(name: string, value: string): Promise<void> {
    const field = this.page.locator(`textarea[name="${name}"], input[name="${name}"]`).first();
    if ((await field.count()) > 0) {
      await field.fill(value);
    } else {
      await this.page.getByRole('textbox', { name }).fill(value);
    }
    await this.page.waitForTimeout(300);
  }

  // ── 5. Click Done / Apply ─────────────────────────────────────────────────
  async clickDone(): Promise<void> {
    await this.page.getByRole('button', { name: 'Done' }).click();
    await this.page.waitForTimeout(800);
  }

  async clickApply(): Promise<void> {
    await this.page.getByRole('button', { name: 'Apply' }).click();
    await this.page.waitForTimeout(500);
  }

  // ── 6. Toggle flow ON ─────────────────────────────────────────────────────
  /**
   * Turn the flow live by clicking the ON/OFF toggle switch.
   * The input is a hidden CSS switch — walks up to the cursor:pointer parent.
   */
  async toggleFlowOn(): Promise<void> {
    await this.page.evaluate(() => {
      const input = document.querySelector(
        'input[name="switch"], input.switch-input',
      ) as HTMLElement | null;
      if (!input) throw new Error('Switch input not found');
      let el: HTMLElement | null = input.parentElement;
      while (el && window.getComputedStyle(el).cursor !== 'pointer') {
        el = el.parentElement;
      }
      (el ?? input).click();
    });
    await this.page.waitForTimeout(1500);
  }

  // ── 7. Teardown — delete the flow after the test ─────────────────────────
  /**
   * Navigate back to the flows list and delete the flow by name.
   * Call this in afterEach to clean up flows created during tests.
   *
   * @param flowName  Exact flow name returned by createFlow()
   */
  async deleteFlow(flowName: string): Promise<void> {
    try {
      await this.page.goto(`${BASE}/#/workspace/default/flows`);
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(1000);
      // Hover the flow card to reveal the kebab menu
      const card = this.page.locator('[class*="flow-card"], [class*="flowcard"]')
        .filter({ hasText: flowName })
        .first();
      if ((await card.count()) === 0) return; // already gone
      await card.hover();
      await this.page.waitForTimeout(300);
      // Click the "…" / kebab / more-options button
      await card.locator('[class*="more"], [class*="kebab"], button[aria-label*="more"]').first().click();
      await this.page.waitForTimeout(400);
      // Click "Delete" in the context menu
      await this.page.getByRole('menuitem', { name: /delete/i }).click();
      // Confirm deletion dialog if it appears
      const confirmBtn = this.page.getByRole('button', { name: /delete|confirm|yes/i });
      if (await confirmBtn.isVisible({ timeout: 3000 })) await confirmBtn.click();
      await this.page.waitForTimeout(800);
    } catch {
      // Non-fatal — teardown best-effort
    }
  }
}
