import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';

export interface ElementInfo {
  tag: string;
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaRole?: string;
  dataTestId?: string;
  classes?: string;
  href?: string;
  value?: string;
  disabled?: boolean;
  selector: string;          // best unique selector
  cssSelector: string;       // full CSS path (fallback)
}

export interface FormInfo {
  id?: string;
  action?: string;
  method?: string;
  fields: {
    name?: string;
    id?: string;
    type: string;
    placeholder?: string;
    required: boolean;
    selector: string;
  }[];
}

export interface TableInfo {
  id?: string;
  headers: string[];
  rowCount: number;
  selector: string;
}

export interface HeadingInfo {
  level: number;   // 1-6
  text: string;
  id?: string;
}

export interface RegionInfo {
  role: string;
  label?: string;
  selector: string;
}

export interface DOMSnapshot {
  url: string;
  title: string;
  capturedAt: string;
  // Interactive elements
  buttons: ElementInfo[];
  links: ElementInfo[];
  inputs: ElementInfo[];
  selects: ElementInfo[];
  textareas: ElementInfo[];
  checkboxes: ElementInfo[];
  radios: ElementInfo[];
  // Structure
  headings: HeadingInfo[];
  forms: FormInfo[];
  tables: TableInfo[];
  regions: RegionInfo[];
  navigationLinks: { text: string; href: string }[];
  // Modals / overlays detected
  modals: { id?: string; selector: string; triggerText?: string }[];
  // All elements combined (for AI prompt)
  allInteractive: ElementInfo[];
}

/**
 * Build the best unique CSS/Playwright selector for an element.
 */
function buildSelector(el: Element): string {
  const e = el as HTMLElement & { name?: string; type?: string };
  if (e.id) return `#${CSS.escape(e.id)}`;
  const testId = el.getAttribute('data-testid') || el.getAttribute('data-qa') || el.getAttribute('data-cy');
  if (testId) return `[data-testid="${testId}"]`;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${ariaLabel.substring(0, 60)}"]`;
  if (e.name) return `[name="${e.name}"]`;
  return el.tagName.toLowerCase();
}

export async function crawlPage(url: string): Promise<DOMSnapshot> {
  const browser: Browser = await chromium.launch({ headless: true });

  const contextOptions: any = {};
  if (fs.existsSync('playwright/.auth/user.json')) {
    contextOptions.storageState = 'playwright/.auth/user.json';
  }

  const context: BrowserContext = await browser.newContext(contextOptions);
  const page: Page = await context.newPage();

  console.log(`  Navigating to ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  // Scroll to trigger lazy-loaded elements
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight / 2);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const title = await page.title();
  const capturedAt = new Date().toISOString();

  const snapshot = await page.evaluate(() => {
    // ---- helpers ----
    function isVisible(el: Element): boolean {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function buildSel(el: Element): string {
      const e = el as HTMLElement & { name?: string; type?: string };
      if (e.id) return `#${CSS.escape(e.id)}`;
      const tid = el.getAttribute('data-testid') || el.getAttribute('data-qa') || el.getAttribute('data-cy');
      if (tid) return `[data-testid="${tid}"]`;
      const aria = el.getAttribute('aria-label');
      if (aria) return `[aria-label="${aria.substring(0, 60).replace(/"/g, '\'')}"]`;
      if (e.name) return `[name="${e.name}"]`;
      return el.tagName.toLowerCase();
    }

    function buildCssSel(el: Element): string {
      // Walk up 3 levels max
      const parts: string[] = [];
      let cur: Element | null = el;
      for (let i = 0; i < 4 && cur; i++) {
        if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
        let part = cur.tagName.toLowerCase();
        const cls = Array.from(cur.classList).slice(0, 2).join('.');
        if (cls) part += `.${cls}`;
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function extractElement(el: Element): any {
      const e = el as HTMLElement & { name?: string; type?: string; placeholder?: string; href?: string; value?: string; disabled?: boolean };
      return {
        tag: el.tagName.toLowerCase(),
        type: e.type || undefined,
        text: e.innerText?.trim().substring(0, 80) || undefined,
        id: e.id || undefined,
        name: e.name || undefined,
        placeholder: e.placeholder || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        ariaRole: el.getAttribute('role') || undefined,
        dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-qa') || el.getAttribute('data-cy') || undefined,
        classes: Array.from(el.classList).slice(0, 5).join(' ') || undefined,
        href: e.href || el.getAttribute('href') || undefined,
        value: e.value || undefined,
        disabled: e.disabled || undefined,
        selector: buildSel(el),
        cssSelector: buildCssSel(el),
      };
    }

    // ---- buttons ----
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'))
      .filter(isVisible)
      .map(extractElement);

    // ---- links ----
    const seen = new Set<string>();
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter(isVisible)
      .map(extractElement)
      .filter(l => { const k = l.href || l.text; if (!k || seen.has(k)) return false; seen.add(k); return true; });

    // ---- inputs (excl. checkboxes/radios) ----
    const inputs = Array.from(document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])'))
      .filter(isVisible)
      .map(extractElement);

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter(isVisible)
      .map(extractElement);

    const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
      .filter(isVisible)
      .map(extractElement);

    // ---- selects ----
    const selects = Array.from(document.querySelectorAll('select'))
      .filter(isVisible)
      .map(extractElement);

    // ---- textareas ----
    const textareas = Array.from(document.querySelectorAll('textarea'))
      .filter(isVisible)
      .map(extractElement);

    // ---- headings ----
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(isVisible)
      .map(el => ({
        level: parseInt(el.tagName[1]),
        text: (el as HTMLElement).innerText.trim().substring(0, 100),
        id: el.id || undefined,
      }))
      .slice(0, 30);

    // ---- forms ----
    const forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map(f => ({
      id: f.id || undefined,
      action: f.getAttribute('action') || undefined,
      method: f.method || undefined,
      fields: Array.from(f.querySelectorAll('input,select,textarea'))
        .filter(isVisible)
        .map(i => {
          const inp = i as HTMLInputElement;
          return {
            name: inp.name || undefined,
            id: inp.id || undefined,
            type: inp.type || i.tagName.toLowerCase(),
            placeholder: inp.placeholder || undefined,
            required: inp.required || false,
            selector: buildSel(i),
          };
        })
        .slice(0, 20),
    }));

    // ---- tables ----
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).slice(0, 10).map(t => ({
      id: t.id || undefined,
      headers: Array.from(t.querySelectorAll('th')).map(th => (th as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 15),
      rowCount: t.querySelectorAll('tbody tr').length,
      selector: buildSel(t),
    }));

    // ---- regions / landmarks ----
    const regions = Array.from(document.querySelectorAll('[role="main"],[role="navigation"],[role="dialog"],[role="alert"],[role="tabpanel"],[role="tab"],[role="menu"],[role="menuitem"],[role="listbox"],[role="grid"],[role="toolbar"],[main],[nav],[header],[footer],[aside],[section]'))
      .filter(isVisible)
      .slice(0, 20)
      .map(el => ({
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || undefined,
        selector: buildSel(el),
      }));

    // ---- nav links ----
    const navLinks = Array.from(document.querySelectorAll('nav a, header a, [role="navigation"] a, .sidebar a, .menu a'))
      .filter(isVisible)
      .map(a => ({ text: (a as HTMLElement).innerText.trim().substring(0, 60), href: (a as HTMLAnchorElement).href }))
      .filter(l => l.text)
      .slice(0, 30);

    // ---- modals / dialogs ----
    const modals = Array.from(document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="dialog"],[class*="overlay"],[class*="popup"]'))
      .filter(isVisible)
      .slice(0, 10)
      .map(m => ({
        id: m.id || undefined,
        selector: buildSel(m),
      }));

    // ---- all interactive combined (deduped by selector) ----
    const allInteractive = [
      ...inputs, ...selects, ...textareas, ...checkboxes, ...radios,
      ...buttons, ...links.slice(0, 30),
    ].slice(0, 100);

    return { buttons, links, inputs, selects, textareas, checkboxes, radios, headings, forms, tables, regions, navigationLinks: navLinks, modals, allInteractive };
  });

  await browser.close();
  return { url, title, capturedAt, ...snapshot };
}