import { DOMSnapshot, ElementInfo } from './domCrawler';

/** Build a compact human-readable summary of a DOMSnapshot to feed into the LLM */
function buildSnapshotSummary(s: DOMSnapshot): string {
  const lines: string[] = [];

  lines.push('URL: ' + s.url);
  lines.push('Title: ' + s.title);

  if (s.headings.length) {
    lines.push('\n=== Headings ===');
    s.headings.forEach(h =>
      lines.push('  H' + h.level + ': "' + h.text + '"' + (h.id ? ' (id=' + h.id + ')' : ''))
    );
  }

  if (s.navigationLinks.length) {
    lines.push('\n=== Navigation links ===');
    s.navigationLinks.slice(0, 20).forEach(l =>
      lines.push('  "' + l.text + '" -> ' + l.href)
    );
  }

  const fmtEl = (e: ElementInfo): string => {
    let out = '  <' + e.tag;
    if (e.type) out += ' type="' + e.type + '"';
    if (e.id) out += ' id="' + e.id + '"';
    if (e.name) out += ' name="' + e.name + '"';
    if (e.ariaLabel) out += ' aria-label="' + e.ariaLabel + '"';
    if (e.placeholder) out += ' placeholder="' + e.placeholder + '"';
    if (e.text) out += ' text="' + e.text.substring(0, 60) + '"';
    if (e.disabled) out += ' disabled';
    out += '> selector: ' + e.selector;
    return out;
  };

  if (s.inputs.length || s.selects.length || s.textareas.length || s.checkboxes.length || s.radios.length) {
    lines.push('\n=== Form fields ===');
    [...s.inputs, ...s.selects, ...s.textareas].forEach(e => lines.push(fmtEl(e)));
    if (s.checkboxes.length)
      lines.push('  ' + s.checkboxes.length + ' checkbox(es) - first: ' + (s.checkboxes[0] ? s.checkboxes[0].selector : ''));
    if (s.radios.length)
      lines.push('  ' + s.radios.length + ' radio(s) - first: ' + (s.radios[0] ? s.radios[0].selector : ''));
  }

  if (s.buttons.length) {
    lines.push('\n=== Buttons ===');
    s.buttons.slice(0, 20).forEach(e => lines.push(fmtEl(e)));
  }

  if (s.links.length) {
    lines.push('\n=== Links (sample) ===');
    s.links.slice(0, 15).forEach(e => lines.push(fmtEl(e)));
  }

  if (s.forms.length) {
    lines.push('\n=== Forms ===');
    s.forms.forEach((f, i) =>
      lines.push(
        '  Form ' + (i + 1) + (f.id ? ' #' + f.id : '') +
        ' - fields: ' + f.fields.map((ff: any) => ff.selector).join(', ')
      )
    );
  }

  if (s.tables.length) {
    lines.push('\n=== Tables ===');
    s.tables.forEach((t: any) =>
      lines.push('  table' + (t.id ? ' #' + t.id : '') +
        ' headers=[' + t.headers.join(', ') + '] rows=' + t.rowCount + ' selector=' + t.selector)
    );
  }

  if (s.regions.length) {
    lines.push('\n=== Regions / Landmarks ===');
    s.regions.slice(0, 15).forEach((r: any) =>
      lines.push('  [' + r.role + ']' + (r.label ? ' "' + r.label + '"' : '') + ' ' + r.selector)
    );
  }

  if (s.modals.length) {
    lines.push('\n=== Visible modals / dialogs ===');
    s.modals.forEach((m: any) =>
      lines.push('  ' + m.selector + (m.id ? ' #' + m.id : '') + (m.triggerText ? ' trigger="' + m.triggerText + '"' : ''))
    );
  }

  return lines.join('\n');
}

export async function generateTests(snapshot: DOMSnapshot): Promise<string> {
  const summary = buildSnapshotSummary(snapshot);

  // Human-readable describe name from URL hash or page title
  const hashPart  = snapshot.url.split('#/')[1] || '';
  const routeName = hashPart
    ? hashPart.split('/').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
    : snapshot.title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim() || 'Page';

  const prompt = [
    'You are a senior Playwright automation engineer. Generate ONLY valid, runnable',
    'TypeScript test code. No prose, no markdown fences, no explanations.',
    '',
    '=== PAGE SNAPSHOT (use ALL details below to write targeted tests) ===',
    summary,
    '=== END SNAPSHOT ===',
    '',
    'STRICT RULES:',
    "1. Imports: only from '@playwright/test'. Use: import { test, expect } from '@playwright/test';",
    "2. ONE test.use({ storageState: 'playwright/.auth/user.json' }); at the top level (outside describe).",
    "3. ONE test.describe('" + routeName + "', () => { ... }) wrapping everything.",
    "4. ONE test.beforeEach: await page.goto('" + snapshot.url + "'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);",
    '5. Generate EXACTLY 12-15 individual test() cases. Each test name MUST start with one of:',
    '   [LOAD]        - page loads, URL contains expected hash/path.',
    '   [TITLE]       - page.title() contains keyword.',
    '   [HEADING]     - H1/H2/H3 heading is visible (getByRole heading).',
    '   [NAV]         - sidebar/nav link visible; click one and verify URL.',
    '   [BUTTON]      - button visible and enabled; use actual button text from snapshot.',
    '   [FORM-FIELD]  - input/textarea visible with correct placeholder or aria-label.',
    '   [SELECT]      - dropdown visible; interact with it.',
    '   [CHECKBOX]    - checkbox visible; toggle it.',
    '   [TABLE]       - table renders with expected header text.',
    '   [SEARCH]      - fill search input, press Enter, assert result area loads.',
    '   [MODAL]       - click trigger button, assert dialog/modal becomes visible.',
    '   [REGION]      - landmark (nav/main/header) present in DOM.',
    '   [INTERACTION] - fill a form field + click + assert outcome.',
    '   [ACCESSIBILITY]- getByRole with a pattern to verify ARIA semantics.',
    '6. Use selectors EXACTLY from the snapshot (id, data-testid, aria-label).',
    '   page.locator(selector)         → for id / testid / css selectors',
    '   page.getByRole(...)            → for semantic roles',
    '   page.getByPlaceholder(...)     → for input placeholders',
    '   page.getByText(...)            → for visible text matching',
    '7. Assertions: toBeVisible(), toBeEnabled(), toContain(), toMatch(regex).',
    '8. After any navigation click: await page.waitForLoadState("networkidle");',
    '9. Each test MUST be fully independent — no shared state.',
    '10. NEVER test login/logout/signup. NEVER reference elements absent from snapshot.',
    '',
    'START output IMMEDIATELY with the import — no preamble, no ``` fences:',
    '',
    "import { test, expect } from '@playwright/test';",
    '',
    "test.use({ storageState: 'playwright/.auth/user.json' });",
    '',
    "test.describe('" + routeName + "', () => {",
    '  test.beforeEach(async ({ page }) => {',
    "    await page.goto('" + snapshot.url + "');",
    "    await page.waitForLoadState('networkidle');",
    '    await page.waitForTimeout(1500);',
    '  });',
    '',
    "  test('[LOAD] page loads successfully', async ({ page }) => {",
    (hashPart
      ? "    await expect(page).toHaveURL(/" + hashPart.split('/')[0] + "/i);"
      : "    await expect(page).toHaveURL(/flow\\.localzoho\\.com/i);"),
    '  });',
    '  // ... write the remaining 11-14 tests based on the snapshot above',
    '});',
  ].join('\n');

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:14b',
        prompt,
        stream: false,
        options: { temperature: 0.1, num_ctx: 8192 },
      }),
    });

    if (!response.ok) throw new Error('Ollama HTTP error ' + response.status);

    const data = await response.json();
    let code: string = data.response || '';

    if (!code) throw new Error('Empty response from Ollama.');

    // Strip accidental markdown fences
    code = code.replace(/```(?:typescript|ts)?\n?/g, '').replace(/```\n?/g, '');

    // Remove <think>...</think> reasoning blocks (qwen3 model)
    code = code.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Ensure we start at the import line
    const importIdx = code.indexOf('import');
    if (importIdx > 0) code = code.substring(importIdx);

    // Trim after the last closing });
    const lastBrace = code.lastIndexOf('});');
    if (lastBrace > 0) code = code.substring(0, lastBrace + 3);

    return code.trim();
  } catch (error) {
    console.error('Ollama generation error:', error);
    throw error;
  }
}
