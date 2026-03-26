import { Page } from '@playwright/test';

/**
 * DragHelper — reusable drag-and-drop utility for Zoho Flow.
 *
 * Uses raw mouse events (mousedown → mousemove → mouseup) which work with
 * jQuery UI Draggable/Droppable (the mechanism used by Zoho Flow's builder).
 * The `dragTo` Playwright API fires HTML5 DnD events which are NOT the same
 * as jQuery UI's pointer-event based drag.
 *
 * IMPORTANT: always pass absolute viewport coordinates via `dropPosition` for
 * canvas drag targets — their DOM bounding boxes are often outside the fold and
 * unreliable. Derive drop coordinates from the trigger bounding box instead.
 */
export class DragHelper {
  constructor(private page: Page) {}

  /**
   * Drag an element identified by `sourceLocator` and drop it at
   * `dropPosition` (absolute viewport x/y).
   *
   * @param sourceLocator  CSS selector for the draggable element
   * @param targetLocator  CSS selector for the drop target (used only when
   *                       `dropPosition` is omitted — less reliable for canvas)
   * @param dropPosition   Explicit {x, y} viewport coordinates to drop at.
   *                       Recommended for Zoho Flow canvas targets.
   * @param waitTime       ms to hold mouse at drop position before release (default 3000)
   */
  async dragAndDrop(
    sourceLocator: string,
    targetLocator: string = '',
    dropPosition?: { x: number; y: number },
    waitTime: number = 3000
  ): Promise<void> {
    console.log('🔄 Performing drag and drop...');

    const source = this.page.locator(sourceLocator);
    await source.scrollIntoViewIfNeeded();
    await source.waitFor({ state: 'visible', timeout: 10000 });

    const sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error(`Cannot get bounding box for source: ${sourceLocator}`);

    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;

    let dropX: number;
    let dropY: number;

    if (dropPosition) {
      dropX = dropPosition.x;
      dropY = dropPosition.y;
    } else {
      // Fall back to target bounding box centre — only reliable when target is in-viewport
      const target = this.page.locator(targetLocator);
      await target.scrollIntoViewIfNeeded();
      await target.waitFor({ state: 'visible', timeout: 10000 });
      const targetBox = await target.boundingBox();
      if (!targetBox) throw new Error(`Cannot get bounding box for target: ${targetLocator}`);
      dropX = targetBox.x + targetBox.width / 2;
      dropY = targetBox.y + targetBox.height / 2;
    }

    console.log(`Dragging from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(dropX)}, ${Math.round(dropY)})`);

    // ── jQuery UI compatible drag sequence ────────────────────────────────
    await this.page.mouse.move(startX, startY);
    await this.page.waitForTimeout(500);   // let any hover handler fire
    await this.page.mouse.down();
    await this.page.waitForTimeout(1000);  // hold to trigger drag start
    await this.page.mouse.move(dropX, dropY, { steps: 30 }); // slow glide
    await this.page.waitForTimeout(waitTime);  // hover over drop zone
    await this.page.mouse.up();
    await this.page.waitForTimeout(2000);  // let app process

    console.log('✅ Drag and drop completed');
  }
}
