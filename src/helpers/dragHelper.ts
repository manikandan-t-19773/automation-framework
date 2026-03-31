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
  // Use case-insensitive text matching — UI labels may differ in casing
  // e.g. "Send Direct Message" vs "Send direct message"
  const src = page.locator('p.zf-module-label').filter({ hasText: new RegExp(`^${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

  // Wait for element to be in DOM first.
  await src.first().waitFor({ state: 'attached', timeout: 20_000 });

  // Scroll into view — sidebar list is overflow-clipped.
  await src.first().scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);

  // NOTE: Playwright's `state: 'visible'` fails for overflow-clipped containers
  // even after scrollIntoViewIfNeeded. Use boundingBox() to verify real dimensions.
  let box = await src.first().boundingBox();
  if (!box || box.width === 0) {
    // One more attempt: evaluate-based scroll to bring element into viewport
    await src.first().evaluate((el: Element) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
    await page.waitForTimeout(300);
    box = await src.first().boundingBox();
  }
  if (!box || box.width === 0) throw new Error(`dragModule: no bounding box for "${moduleName}"`);

  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Initial pickup — jQuery UI activates 'ui-droppable-active' on all valid drop zones
  await page.mouse.move(sx + 15, sy, { steps: 4 });
  await page.waitForTimeout(500); // let jQuery UI mark canvas droppables active

  // Dynamically detect the canvas drop zone using multiple strategies:
  // 0. Explicit: prefer #zf-builder-canvas (the Zoho Flow inner canvas element)
  // 1. CSS class: jQuery UI adds 'ui-droppable-active' during drag
  // 2. jQuery registry: $.ui.ddmanager.droppables stores registered zones
  // 3. Window-size-relative fallback if nothing found
  // NOTE: div.flowServices.bfs-inactive is EXCLUDED — dropping on it navigates
  //       away from the flow builder instead of opening the module config popup.
  type DropTarget = { x: number; y: number; detected: boolean };
  const target: DropTarget = await page.evaluate((fb: { x: number; y: number }) => {
    const SIDEBAR_WIDTH = 270;
    const iw = window.innerWidth;
    const ih = window.innerHeight;

    // Strategy 0: Prefer #zf-builder-canvas explicitly (always correct target)
    const preferredCanvas = document.getElementById('zf-builder-canvas');
    if (preferredCanvas) {
      const r = preferredCanvas.getBoundingClientRect();
      const ow = preferredCanvas.offsetWidth, oh = preferredCanvas.offsetHeight;
      console.log(`[dragHelper] zf-builder-canvas: r.width=${r.width} r.height=${r.height} r.x=${r.x} r.right=${r.right} offsetW=${ow} offsetH=${oh}`);
      // Use offsetWidth/offsetHeight as fallback for headless mode where getBoundingClientRect may differ
      const w = r.width > 0 ? r.width : ow;
      const h = r.height > 0 ? r.height : oh;
      if (w > 100 && h > 100 && r.right > SIDEBAR_WIDTH) {
        // If a hintTarget was recorded from a real session (within canvas bounds), use it —
        // it was set by the Playwright recorder at the exact position where the drop worked.
        if (fb && fb.x >= r.left && fb.x <= r.right && fb.y >= r.top && fb.y <= r.bottom) {
          return { x: fb.x, y: fb.y, detected: true };
        }
        // Drop at center-left of canvas (avoid toolbar overlay at top)
        const dropX = Math.round(Math.max(r.left + w * 0.5, SIDEBAR_WIDTH + 100));
        const dropY = Math.round(r.top + h * 0.5);
        return { x: dropX, y: dropY, detected: true };
      }
    } else {
      console.log('[dragHelper] zf-builder-canvas NOT FOUND in DOM');
    }

    const zones: Array<{ x: number; y: number; area: number }> = [];

    // Helper: skip bfs-inactive elements (div.flowServices) — they navigate away on drop
    const skipEl = (el: HTMLElement) => el.classList.contains('bfs-inactive') || el.id === 'flowServices';

    // Strategy 1: jQuery UI css class
    document.querySelectorAll<HTMLElement>('.ui-droppable-active').forEach(el => {
      if (skipEl(el)) return;
      const r = el.getBoundingClientRect();
      if (r.left > SIDEBAR_WIDTH && r.width > 60 && r.height > 30) {
        zones.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), area: r.width * r.height });
      }
    });

    // Strategy 2: jQuery UI ddmanager droppable registry
    try {
      const $ = (window as any).jQuery;
      if ($ && $.ui && $.ui.ddmanager) {
        const dd = $.ui.ddmanager.droppables['default'] || [];
        for (const d of dd) {
          const el = d.element && d.element[0];
          if (!el || skipEl(el as HTMLElement)) continue;
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.left > SIDEBAR_WIDTH && r.width > 60 && r.height > 30) {
            zones.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), area: r.width * r.height });
          }
        }
      }
    } catch (_) {/* ignore */}

    if (!zones.length) {
      // Strategy 3: window-size-relative fallback
      // Canvas starts after sidebar (~270px). Drop in the horizontal center of canvas at 40% height.
      const canvasX = Math.round(SIDEBAR_WIDTH + (iw - SIDEBAR_WIDTH) * 0.38);
      const canvasY = Math.round(ih * 0.42);
      console.log(`[dragHelper] window: ${iw}x${ih}, no droppable found, using (${canvasX},${canvasY})`);
      return { x: canvasX, y: canvasY, detected: false };
    }

    zones.sort((a, b) => b.area - a.area);
    return { x: zones[0].x, y: zones[0].y, detected: true };
  }, drop) as DropTarget;

  // Debug: log window size and element at target to help diagnose missed drops
  const _dbg = await page.evaluate(({ tx, ty }: { tx: number; ty: number }) => {
    const el = document.elementFromPoint(tx, ty);
    return {
      window: `${window.innerWidth}x${window.innerHeight}`,
      elemAt: el ? `${el.tagName.toLowerCase()}.${(el.className||'').replace(/\s+/g,' ').trim().slice(0,60)}` : 'null',
    };
  }, { tx: target.x, ty: target.y });
  console.log(`dragModule: "${moduleName}" window=${_dbg.window} target=(${target.x},${target.y}) elem=[${_dbg.elemAt}] dynamic:${target.detected}`);

  await page.mouse.move(target.x, target.y, { steps: 25 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log(`dragModule: "${moduleName}" → (${target.x}, ${target.y}) ✅`);
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
