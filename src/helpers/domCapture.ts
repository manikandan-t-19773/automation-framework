/**
 * domCapture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility to snapshot DOM elements page-by-page for debugging.
 *
 * Saves to  dom-snapshots/<label>/
 *   ├── dom.html          – full outer-HTML of the page / selector
 *   ├── screenshot.png    – visual reference
 *   ├── inputs.json       – every <input> / <textarea> with key attributes
 *   ├── buttons.json      – every <button> / <a role="button"> with text + attrs
 *   ├── modals.json       – every visible modal / popup
 *   └── elements.json     – combined selector index (name, id, class, aria, role)
 *
 * Usage from recorder:
 *   import { capturePageDOM, debugDump } from '../helpers/domCapture';
 *   await capturePageDOM(page, 'send-email-popup');          // named snapshot
 *   await debugDump(page, 17, 'Give input in To field', e); // on step failure
 */

import fs   from 'fs';
import path from 'path';
import { Page } from '@playwright/test';

const ROOT = path.resolve(__dirname, '../../dom-snapshots');

// ─── helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── core snapshot ───────────────────────────────────────────────────────────

/**
 * Capture and store a full DOM snapshot for the given page.
 * @param page      Playwright Page
 * @param label     subfolder name under dom-snapshots/ e.g. 'send-email-popup'
 * @param selector  optional CSS selector to capture only a subtree
 */
export async function capturePageDOM(
  page: Page,
  label: string,
  selector?: string,
): Promise<void> {
  const dir = path.join(ROOT, label);
  ensureDir(dir);

  console.log(`  📸  DOM snapshot → dom-snapshots/${label}/`);

  // ── 1. dom.html ──────────────────────────────────────────────────────────
  try {
    const html = selector
      ? await page.locator(selector).first().innerHTML().catch(() => page.content())
      : await page.content();
    fs.writeFileSync(path.join(dir, 'dom.html'), html, 'utf8');
  } catch { /* ignore */ }

  // ── 2. screenshot.png ────────────────────────────────────────────────────
  try {
    await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });
  } catch { /* ignore */ }

  // ── 3. inputs.json ───────────────────────────────────────────────────────
  try {
    const inputs = await page.evaluate(() => {
      const results: object[] = [];
      document.querySelectorAll('input, textarea, select').forEach(el => {
        const e = el as HTMLInputElement;
        const rect = e.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return; // skip hidden
        results.push({
          tag:         e.tagName.toLowerCase(),
          type:        e.type        || null,
          name:        e.name        || null,
          id:          e.id          || null,
          placeholder: e.placeholder || null,
          value:       e.value       || null,
          ariaLabel:   e.getAttribute('aria-label') || null,
          ariaPlaceholder: e.getAttribute('aria-placeholder') || null,
          className:   e.className   || null,
          disabled:    e.disabled,
          readOnly:    (e as HTMLInputElement).readOnly || false,
          visible:     rect.width > 0 && rect.height > 0,
          rect:        { top: Math.round(rect.top), left: Math.round(rect.left),
                         width: Math.round(rect.width), height: Math.round(rect.height) },
          cssSelector: buildSelector(e),
        });
      });
      function buildSelector(el: Element): string {
        const parts: string[] = [el.tagName.toLowerCase()];
        if ((el as HTMLElement).id) parts.push(`#${CSS.escape((el as HTMLElement).id)}`);
        const name = el.getAttribute('name');
        if (name) parts.push(`[name="${name}"]`);
        const type = el.getAttribute('type');
        if (type) parts.push(`[type="${type}"]`);
        return parts.join('');
      }
      return results;
    });
    writeJson(path.join(dir, 'inputs.json'), inputs);
  } catch { /* ignore */ }

  // ── 4. buttons.json ──────────────────────────────────────────────────────
  try {
    const buttons = await page.evaluate(() => {
      const results: object[] = [];
      const sel = 'button, [role="button"], a[href], input[type="submit"], input[type="button"]';
      document.querySelectorAll(sel).forEach(el => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        results.push({
          tag:       e.tagName.toLowerCase(),
          text:      (e.textContent || '').trim().slice(0, 80),
          id:        e.id || null,
          name:      e.getAttribute('name')       || null,
          type:      e.getAttribute('type')       || null,
          ariaLabel: e.getAttribute('aria-label') || null,
          title:     e.title || null,
          className: e.className || null,
          disabled:  (e as HTMLButtonElement).disabled,
          rect:      { top: Math.round(rect.top), left: Math.round(rect.left),
                       width: Math.round(rect.width), height: Math.round(rect.height) },
        });
      });
      return results;
    });
    writeJson(path.join(dir, 'buttons.json'), buttons);
  } catch { /* ignore */ }

  // ── 5. modals.json (visible overlays / popups) ───────────────────────────
  try {
    const modals = await page.evaluate(() => {
      const modalSel = [
        '.workflowModal', '.modal', '[class*="popup"]', '[class*="dialog"]',
        '[role="dialog"]', '[role="alertdialog"]',
        '.zf-action-popup', '.zf-popup', '.zf-modal',
      ].join(', ');
      const results: object[] = [];
      document.querySelectorAll(modalSel).forEach(el => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        if (rect.width === 0) return;
        results.push({
          tag:      e.tagName.toLowerCase(),
          id:       e.id || null,
          className: e.className || null,
          visible:  rect.width > 0,
          rect:     { top: Math.round(rect.top), left: Math.round(rect.left),
                      width: Math.round(rect.width), height: Math.round(rect.height) },
          innerHTML: e.innerHTML.slice(0, 2000),  // first 2000 chars
        });
      });
      return results;
    });
    writeJson(path.join(dir, 'modals.json'), modals);
  } catch { /* ignore */ }

  // ── 6. elements.json (general selector index) ────────────────────────────
  try {
    const elements = await page.evaluate(() => {
      const important = [
        '[data-testid]', '[aria-label]', '[name]', '[id]',
        'h1, h2, h3', '.tab, [role="tab"]',
        'p.zf-module-label',               // drag panel labels
        '.workflowModal *[name]',           // modal named inputs
        '.workflowModal button',            // modal buttons
      ].join(', ');
      const seen = new Set<string>();
      const results: object[] = [];
      document.querySelectorAll(important).forEach(el => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const key = `${e.tagName}|${e.id}|${e.getAttribute('name')}|${e.textContent?.trim().slice(0,30)}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({
          tag:         e.tagName.toLowerCase(),
          id:          e.id || null,
          name:        e.getAttribute('name')        || null,
          type:        e.getAttribute('type')        || null,
          ariaLabel:   e.getAttribute('aria-label')  || null,
          dataTestId:  e.getAttribute('data-testid') || null,
          role:        e.getAttribute('role')        || null,
          text:        (e.textContent || '').trim().slice(0, 60),
          className:   (e.className || '').slice(0, 80),
          rect:        { top: Math.round(rect.top), left: Math.round(rect.left),
                         width: Math.round(rect.width), height: Math.round(rect.height) },
        });
      });
      return results;
    });
    writeJson(path.join(dir, 'elements.json'), elements);
  } catch { /* ignore */ }

  console.log(`  ✅  Snapshot saved → dom-snapshots/${label}/`);
}

// ─── debug dump on step failure ───────────────────────────────────────────────

/**
 * Dump DOM + screenshot when a step fails.
 * Saved to  dom-snapshots/debug/step-{n}-{slug}/
 */
export async function debugDump(
  page: Page,
  stepNo: number | string,
  stepDesc: string,
  err?: unknown,
): Promise<void> {
  const slug = stepDesc.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = `debug/step-${String(stepNo).padStart(2,'0')}-${slug}-${ts}`;
  console.log(`  🔍  debugDump → dom-snapshots/${label}/`);
  if (err) console.log(`      Error: ${String(err).slice(0, 200)}`);
  await capturePageDOM(page, label);
  // Also write error.txt
  if (err) {
    const dir = path.join(ROOT, label);
    fs.writeFileSync(path.join(dir, 'error.txt'), String(err), 'utf8');
  }
}

// ─── visible popup snapshot ───────────────────────────────────────────────────

/**
 * Snapshot just the currently visible modal / popup.
 * Useful right after drag-drop opens a popup form.
 */
export async function captureModal(page: Page, label: string): Promise<void> {
  const modalSel =
    '.workflowModal:visible, [role="dialog"]:visible, .zf-action-popup:visible, .zf-popup:visible';
  const count = await page.locator(modalSel).count();
  if (count === 0) {
    // Fall back to full page capture
    await capturePageDOM(page, label);
    return;
  }
  await capturePageDOM(page, label, modalSel);
}
