import { Page } from '@playwright/test';

/**
 * DragHelper — reusable drag-and-drop utility for Zoho Flow.
 *
 * Uses raw mouse events (mousedown → mousemove → mouseup) which work with
 * jQuery UI Draggable/Droppable used by Zoho Flow's builder canvas.
 * The Playwright `.dragTo()` API fires HTML5 DnD events which are NOT the same.
 *
 * ─── RECOMMENDED USAGE IN CODEGEN-RECORDED SPECS ──────────────────────────
 *
 *   import { dragModule } from '../../helpers/dragHelper';
 *
 *   // Drag "Set Variable" from the Logic panel onto the canvas:
 *   await dragModule(page, 'Set Variable', { x: 715, y: 434 });
 *
 *   // Drop coordinates: use x=715, y=434 as the default canvas target.
 *   // Re-run with a slightly lower y (e.g. 480, 520) if a second/third
 *   // node needs to land below the first one.
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

// ── Standalone helper (use this in codegen-recorded specs) ──────────────────
/**
 * Drag a sidebar module by its visible label onto the Zoho Flow canvas.
 *
 * Proven selector: `p.zf-module-label:text-is("<moduleName>")` — unique per
 * module because the sidebar only renders one entry per module at a time.
 *
 * @param page        Playwright Page
 * @param moduleName  Exact label text e.g. "Set Variable", "Send Mail", "Decision"
 * @param drop        Canvas drop target {x, y} in viewport pixels.
 *                    Default safe zone: { x: 715, y: 434 }
 */
export async function dragModule(
  page: Page,
  moduleName: string,
  drop: { x: number; y: number } = { x: 715, y: 434 }
): Promise<void> {
  const src = page.locator(`p.zf-module-label:text-is("${moduleName}")`);
  await src.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await src.boundingBox();
  if (!box) throw new Error(`dragModule: no bounding box for "${moduleName}"`);

  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Slow glide in two legs: first pick up, then land
  await page.mouse.move(sx + 20, sy, { steps: 5 });
  await page.mouse.move(drop.x, drop.y, { steps: 30 });
  await page.waitForTimeout(400);   // brief hover for drop-zone highlight
  await page.mouse.up();
  await page.waitForTimeout(600);   // let action panel open
  console.log(`dragModule: "${moduleName}" → (${drop.x}, ${drop.y}) ✅`);
}

// ── Class-based wrapper (used by the generator / older specs) ────────────────
export class DragHelper {
  constructor(private page: Page) {}

  /**
   * Drag any sidebar module by name onto the canvas.
   * Thin wrapper around the standalone `dragModule` helper.
   */
  async dragModule(
    moduleName: string,
    drop: { x: number; y: number } = { x: 715, y: 434 }
  ): Promise<void> {
    await dragModule(this.page, moduleName, drop);
  }

  /**
   * Generic drag by CSS selectors — fallback for non-module drags.
   * Prefer `dragModule()` for sidebar → canvas drags.
   */
  async dragAndDrop(
    sourceLocator: string,
    targetLocator: string = '',
    dropPosition?: { x: number; y: number }
  ): Promise<void> {
    const source = this.page.locator(sourceLocator);
    await source.scrollIntoViewIfNeeded();
    await source.waitFor({ state: 'visible', timeout: 10_000 });
    const sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error(`dragAndDrop: no bbox for "${sourceLocator}"`);

    let dropX: number, dropY: number;

    if (dropPosition) {
      dropX = dropPosition.x;
      dropY = dropPosition.y;
    } else {
      const target = this.page.locator(targetLocator);
      await target.waitFor({ state: 'visible', timeout: 10_000 });
      const tb = await target.boundingBox();
      if (!tb) throw new Error(`dragAndDrop: no bbox for target "${targetLocator}"`);
      dropX = tb.x + tb.width / 2;
      dropY = tb.y + tb.height / 2;
    }

    const sx = sourceBox.x + sourceBox.width / 2;
    const sy = sourceBox.y + sourceBox.height / 2;

    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    await this.page.mouse.move(sx + 20, sy, { steps: 5 });
    await this.page.mouse.move(dropX, dropY, { steps: 30 });
    await this.page.waitForTimeout(400);
    await this.page.mouse.up();
    await this.page.waitForTimeout(600);
    console.log(`dragAndDrop: (${Math.round(sx)},${Math.round(sy)}) → (${Math.round(dropX)},${Math.round(dropY)}) ✅`);
  }
}
