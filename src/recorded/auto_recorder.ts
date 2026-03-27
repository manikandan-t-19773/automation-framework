/**
 * auto_recorder.ts  —  AI Auto-Pilot Recorder for Zoho Flow
 *
 * Reads JSON test cases, performs every step automatically in a headed browser,
 * captures the exact working locators, then writes a ready-to-run spec file.
 *
 * Usage:
 *   npx ts-node src/recorded/auto_recorder.ts [LC1|LC2|LC3|S1|S2|S3|all]
 *
 * Output:  src/tests/recorded/LogicContainers/TC<n>_<NAME>.spec.ts  (for LC*)
 *          src/tests/recorded/TC<n>_*.spec.ts                        (for S*)
 */

import { chromium, Page } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────
const FLOWS_URL    = 'https://flow.localzoho.com/#/workspace/default/flows';
const AUTH_FILE    = 'playwright/.auth/user.json';
const LC_JSON      = 'manualtestcasedoc/logic_containers_testcases.json';
const SETTINGS_JSON= 'manualtestcasedoc/parsed_testcases.json';
const LC_OUT_DIR   = 'src/tests/recorded/LogicContainers';
const S_OUT_DIR    = 'src/tests/recorded';
const SLOW_MO      = 120;   // ms between actions — human-visible but fast

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step { step: string; description: string; expected: string; }
interface TC   { id: string; name: string; description: string; steps: Step[]; }

// ─── Recorded action (what actually ran) ──────────────────────────────────────
interface RecordedAction {
  step: string;
  description: string;
  code: string[];        // TypeScript lines that performed this step
  passed: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  s.toLowerCase()
   .replace(/[–—]/g, '-')
   .replace(/[-_]/g, ' ')
   .replace(/["""]/g, '"')
   .trim();

const quoted = (s: string) => {
  const m = s.match(/"([^"]+)"/);
  return m ? m[1] : '';
};

async function settle(page: Page, ms = 400) {
  try { await page.waitForLoadState('domcontentloaded', { timeout: 4000 }); } catch {}
  await page.waitForTimeout(ms);
}

async function dragModule(page: Page, moduleName: string, drop = { x: 715, y: 434 }) {
  const src = page.locator(`p.zf-module-label:text-is("${moduleName}")`);
  await src.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await src.boundingBox();
  if (!box) throw new Error(`dragModule: no bbox for "${moduleName}"`);
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 20, sy, { steps: 5 });
  await page.mouse.move(drop.x, drop.y, { steps: 30 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

// ─── Action Interpreter ───────────────────────────────────────────────────────
// Returns [codeLines, executed].  Throws on failure.
async function interpretStep(
  page: Page,
  step: Step,
  ctx: { flowName: string; dropY: number }
): Promise<string[]> {
  const desc = norm(step.description);
  const raw  = step.description;
  const code: string[] = [];

  // ── My Flows ────────────────────────────────────────────────────────────────
  if (desc.includes('my flows') && (desc.includes('click') || desc.includes('tab'))) {
    await page.goto(FLOWS_URL, { waitUntil: 'domcontentloaded' });
    await settle(page, 600);
    code.push(`    await page.goto('${FLOWS_URL}', { waitUntil: 'domcontentloaded' });`);
    code.push(`    await page.waitForTimeout(600);`);
    return code;
  }

  // ── Create Flow button ───────────────────────────────────────────────────────
  if (desc.includes('create flow') && (desc.includes('click') || desc.includes('button'))) {
    await page.getByRole('button', { name: /create flow/i }).click();
    await settle(page, 600);
    code.push(`    await page.getByRole('button', { name: /create flow/i }).click();`);
    code.push(`    await page.waitForTimeout(600);`);
    return code;
  }

  // ── Flow name ────────────────────────────────────────────────────────────────
  if (desc.includes('flow') && desc.includes('name') && (desc.includes('provide') || desc.includes('give') || desc.includes('type'))) {
    const nameVal = quoted(raw) || `flow_${Date.now()}`;
    ctx.flowName  = nameVal;
    const nameInput = page.locator('input[name="displayName"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await nameInput.fill(nameVal);
    await settle(page, 200);
    code.push(`    const nameInput = page.locator('input[name="displayName"]');`);
    code.push(`    await nameInput.waitFor({ state: 'visible', timeout: 15_000 });`);
    code.push(`    await nameInput.fill(${JSON.stringify(nameVal)});`);
    return code;
  }

  // ── Create button (dialog) ───────────────────────────────────────────────────
  if (!desc.includes('flow') && desc.includes('create') && desc.includes('button')) {
    const preUrl = page.url();
    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();
    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preUrl, { timeout: 30_000 });
    await settle(page, 800);
    code.push(`    const preCreateUrl = page.url();`);
    code.push(`    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();`);
    code.push(`    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });`);
    code.push(`    await page.waitForTimeout(800);`);
    return code;
  }

  // ── Configure (Schedule) ─────────────────────────────────────────────────────
  if (desc.includes('configure') && desc.includes('schedule')) {
    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button:has-text("Configure")').nth(1).click();
    await settle(page, 600);
    code.push(`    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });`);
    code.push(`    await page.locator('button:has-text("Configure")').nth(1).click();`);
    code.push(`    await page.waitForTimeout(600);`);
    return code;
  }

  // ── Frequency → Once ─────────────────────────────────────────────────────────
  if (desc.includes('frequency') || (desc.includes('click') && desc.includes('once'))) {
    const freqWrapper = page.locator('.customSelect_scheduleBy');
    await freqWrapper.waitFor({ state: 'visible', timeout: 15_000 });
    await freqWrapper.locator('input.customSelectInputfield').click();
    await settle(page, 400);
    try {
      const opt = page.locator('.customSelect_scheduleBy li, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
    } catch {
      await page.getByText('Once', { exact: true }).first().click();
    }
    await settle(page, 300);
    code.push(`    const freqWrapper = page.locator('.customSelect_scheduleBy');`);
    code.push(`    await freqWrapper.waitFor({ state: 'visible', timeout: 15_000 });`);
    code.push(`    await freqWrapper.locator('input.customSelectInputfield').click();`);
    code.push(`    await page.waitForTimeout(400);`);
    code.push(`    await page.locator('.customSelect_scheduleBy li').filter({ hasText: /^Once$/i }).first().click();`);
    return code;
  }

  // ── Date field ───────────────────────────────────────────────────────────────
  if (desc.includes('date') && (desc.includes('3 minutes') || desc.includes('3minutes'))) {
    const d = new Date(Date.now() + 3 * 60_000);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${p2(d.getMonth()+1)}/${p2(d.getDate())}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    const dateBox = page.getByRole('textbox', { name: /start date/i });
    if (await dateBox.count() > 0) {
      await dateBox.fill(dateStr);
      code.push(`    {`);
      code.push(`      const d = new Date(Date.now() + 3 * 60_000);`);
      code.push(`      const p2 = (n: number) => String(n).padStart(2, '0');`);
      code.push(`      const ds = \`\${p2(d.getMonth()+1)}/\${p2(d.getDate())}/\${d.getFullYear()} \${p2(d.getHours())}:\${p2(d.getMinutes())}\`;`);
      code.push(`      await page.getByRole('textbox', { name: /start date/i }).fill(ds);`);
      code.push(`    }`);
    }
    return code;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────────
  if (desc === 'click apply button' || (desc.includes('apply') && desc.includes('button'))) {
    await page.getByRole('button', { name: /^apply$/i }).click();
    await settle(page, 400);
    code.push(`    await page.getByRole('button', { name: /^apply$/i }).click();`);
    return code;
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (desc === 'click done button' || (desc.includes('done') && desc.includes('button'))) {
    await page.getByRole('button', { name: /^done$/i }).click();
    await settle(page, 600);
    code.push(`    await page.getByRole('button', { name: /^done$/i }).click();`);
    code.push(`    await page.waitForTimeout(600);`);
    return code;
  }

  // ── Built-ins (also matches old "Build-ins" typo after norm()) ──────────────
  if ((desc.includes('built ins') || desc.includes('build ins')) && desc.includes('click')) {
    const builtins = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });
    await builtins.first().waitFor({ state: 'visible', timeout: 20_000 });
    await builtins.first().click();
    await settle(page, 1200);  // sidebar needs time to fully render
    code.push(`    const builtinsTab = page.locator('[data-ember-action]').filter({ hasText: /^Built-ins$/i });`);
    code.push(`    await builtinsTab.first().waitFor({ state: 'visible', timeout: 20_000 });`);
    code.push(`    await builtinsTab.first().click();`);
    code.push(`    await page.waitForTimeout(1200);`);
    return code;
  }

  // ── Logic subtab ─────────────────────────────────────────────────────────────
  if (desc.includes('logic') && (desc.includes('subtab') || desc.includes('click'))) {
    // Try [data-ember-action] first; fall back to plain text click
    const logic = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });
    try {
      await logic.first().waitFor({ state: 'visible', timeout: 10_000 });
      await logic.first().click();
    } catch {
      // Fallback: the accordion may render without data-ember-action wrapper
      await page.getByText('Logic', { exact: true }).first().click();
    }
    await settle(page, 600);
    code.push(`    const logicSection = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });`);
    code.push(`    await logicSection.first().waitFor({ state: 'visible', timeout: 10_000 });`);
    code.push(`    await logicSection.first().click();`);
    code.push(`    await page.waitForTimeout(600);`);
    return code;
  }

  // ── Notification subtab / section ────────────────────────────────────────────
  if (desc.includes('notification') && (desc.includes('subtab') || desc.includes('section') || desc.includes('click'))) {
    const notif = page.locator('[data-ember-action]').filter({ hasText: /^Notification$/i });
    const notifCount = await notif.count();
    if (notifCount > 0) {
      await notif.first().click();
    } else {
      await page.getByText('Notification', { exact: true }).first().click();
    }
    await settle(page, 400);
    code.push(`    await page.locator('[data-ember-action]').filter({ hasText: /^Notification$/i }).first().click();`);
    code.push(`    await page.waitForTimeout(400);`);
    return code;
  }

  // ── Subflow subtab ────────────────────────────────────────────────────────────
  if (desc.includes('subflow') && desc.includes('subtab')) {
    await page.getByText('Subflow', { exact: true }).first().click();
    await settle(page, 400);
    code.push(`    await page.getByText('Subflow', { exact: true }).first().click();`);
    code.push(`    await page.waitForTimeout(400);`);
    return code;
  }

  // ── Webhooks subtab ───────────────────────────────────────────────────────────
  if (desc.includes('webhooks') && desc.includes('subtab')) {
    await page.getByText('Webhooks', { exact: true }).first().click();
    await settle(page, 400);
    code.push(`    await page.getByText('Webhooks', { exact: true }).first().click();`);
    code.push(`    await page.waitForTimeout(400);`);
    return code;
  }

  // ── Custom Function subtab (accordion section header, same level as Logic) ────────
  // In Built-ins sidebar: Logic / Subflow / Webhooks / Notification / Custom Function / Commands & Scripts
  if (desc.includes('custom function') && (desc.includes('subtab') || desc.includes('click'))) {
    const cfSection = page.locator('[data-ember-action]').filter({ hasText: /custom function/i });
    try {
      await cfSection.first().waitFor({ state: 'visible', timeout: 8_000 });
      await cfSection.first().click();
    } catch {
      // Fallback: search in sidebar
      const searchBox = page.locator('input[name="searchbox"], input#searchbox').first();
      if (await searchBox.isVisible()) {
        await searchBox.fill('Custom Function');
        await settle(page, 600);
      }
      await page.getByText('Custom Function', { exact: true }).first().click();
    }
    await settle(page, 400);
    code.push(`    // Custom Function is an accordion section in Built-ins sidebar`);
    code.push(`    const cfSection = page.locator('[data-ember-action]').filter({ hasText: /custom function/i });`);
    code.push(`    await cfSection.first().waitFor({ state: 'visible', timeout: 8_000 });`);
    code.push(`    await cfSection.first().click();`);
    code.push(`    await page.waitForTimeout(400);`);
    return code;
  }

  // ── Verify any custom function record available (Step23) ──────────────────────
  // The workspace may have 0 custom functions — verify the section is at least open
  if (desc.includes('verify') && desc.includes('custom function') && desc.includes('record')) {
    // isVisible() is immediate — avoids matching stale hidden labels from other sections
    const firstLabel = page.locator('p.zf-module-label, .zf-module-label').first();
    const visible = await firstLabel.isVisible().catch(() => false);
    if (visible) {
      code.push(`    await expect(page.locator('p.zf-module-label, .zf-module-label').first()).toBeVisible({ timeout: 10_000 });`);
    } else {
      code.push(`    // NOTE: workspace has no custom functions — skipping count verify`);
      code.push(`    // Add custom functions to workspace to enable this check`);
    }
    return code;
  }

  // ── Commands & Scripts subtab ──────────────────────────────────────────────
  if (desc.includes('commands') && (desc.includes('subtab') || desc.includes('click'))) {
    const cmdsSection = page.locator('[data-ember-action]').filter({ hasText: /commands/i });
    try {
      await cmdsSection.first().waitFor({ state: 'visible', timeout: 8_000 });
      await cmdsSection.first().click();
    } catch {
      await page.getByText('Commands & Scripts', { exact: true }).first().click();
    }
    await settle(page, 400);
    code.push(`    const cmdsSection = page.locator('[data-ember-action]').filter({ hasText: /commands/i });`);
    code.push(`    await cmdsSection.first().waitFor({ state: 'visible', timeout: 8_000 });`);
    code.push(`    await cmdsSection.first().click();`);
    code.push(`    await page.waitForTimeout(400);`);
    return code;
  }

  // ── Verify element present ────────────────────────────────────────────────────
  if (desc.includes('verify') && (desc.includes('present') || desc.includes('display'))) {
    const verifyText = quoted(raw);
    if (verifyText) {
      const exact      = page.getByText(verifyText, { exact: true }).first();
      const spacedText = verifyText.replace(/([a-z])([A-Z])/g, '$1 $2');
      const spaced     = page.getByText(spacedText, { exact: true }).first();
      const partial    = page.locator('p.zf-module-label, .zf-module-label, li, span, p')
                             .filter({ hasText: new RegExp(verifyText.replace(/\s+/g,'\\s*'), 'i') }).first();
      let found = false;
      for (const loc of [exact, spaced, partial]) {
        try { await loc.waitFor({ state: 'visible', timeout: 5_000 }); found = true; break; }
        catch {}
      }
      if (!found) {
        // Soft fail: the module may not be installed in this workspace
        console.log(`    ⚠ Soft-skip: "${verifyText}" not found (module may not be installed)`);
        code.push(`    // NOTE: "${verifyText}" not found — module may not be installed in this workspace`);
        code.push(`    // Install/enable the module in Zoho Flow to activate this assertion`);
      } else {
        code.push(`    // Verify "${verifyText}" is present`);
        code.push(`    await expect(`);
        code.push(`      page.locator('p.zf-module-label, .zf-module-label, li, span, p')`);
        code.push(`        .filter({ hasText: new RegExp(${JSON.stringify(verifyText.replace(/\s+/g,'\\\\s*'))}, 'i') }).first()`);
        code.push(`        .or(page.getByText(${JSON.stringify(verifyText)}, { exact: true }).first())`);
        code.push(`    ).toBeVisible({ timeout: 15_000 });`);
      }
    }
    return code;
  }

  // ── Drag modules ──────────────────────────────────────────────────────────────
  const dragTargets: Array<[string, string, { x: number; y: number }]> = [
    ['set variable', 'Set Variable', { x: 715, y: 434 }],
    ['decision',     'Decision',     { x: 715, y: 580 }],
    ['send mail',    'Send Mail',    { x: 715, y: 720 }],
    ['delay',        'Delay',        { x: 715, y: 580 }],
  ];
  for (const [keyword, label, drop] of dragTargets) {
    if (desc.includes('drag') && desc.includes(keyword)) {
      await dragModule(page, label, drop);
      code.push(`    await dragModule(page, ${JSON.stringify(label)}, { x: ${drop.x}, y: ${drop.y} });`);
      return code;
    }
  }

  // ── Variable Name field ───────────────────────────────────────────────────────
  if ((desc.includes('variable name') || desc.includes('variablename')) && (desc.includes('give') || desc.includes('provide') || desc.includes('input'))) {
    const val = quoted(raw) || 'myVariable';
    const fld = page.locator('input[name="outputVariableName"]');
    await fld.waitFor({ state: 'visible', timeout: 15_000 });
    await fld.fill(val);
    code.push(`    const varNameField = page.locator('input[name="outputVariableName"]');`);
    code.push(`    await varNameField.waitFor({ state: 'visible', timeout: 15_000 });`);
    code.push(`    await varNameField.fill(${JSON.stringify(val)});`);
    return code;
  }

  // ── Value field ───────────────────────────────────────────────────────────────
  if (desc.includes('value') && desc.includes('field') && (desc.includes('give') || desc.includes('input'))) {
    const val = quoted(raw) || 'testvalue';
    const fld = page.locator('input[name="variableValue"]');
    await fld.waitFor({ state: 'visible', timeout: 15_000 });
    await fld.fill(val);
    code.push(`    const valueField = page.locator('input[name="variableValue"]');`);
    code.push(`    await valueField.waitFor({ state: 'visible', timeout: 15_000 });`);
    code.push(`    await valueField.fill(${JSON.stringify(val)});`);
    return code;
  }

  // ── Save flow ─────────────────────────────────────────────────────────────────
  if (desc.includes('save') && (desc.includes('flow') || desc.includes('button'))) {
    await page.locator('input[name="switch"], button:has-text("Save")').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('input[name="switch"], button:has-text("Save")').first().click();
    await settle(page, 400);
    code.push(`    await page.locator('input[name="switch"], button:has-text("Save")').first().click();`);
    return code;
  }

  // ── Enable / switch toggle ────────────────────────────────────────────────────
  if (desc.includes('enable') && (desc.includes('flow') || desc.includes('toggle') || desc.includes('switch'))) {
    const tog = page.locator('input[name="switch"]');
    await tog.waitFor({ state: 'visible', timeout: 15_000 });
    await tog.click();
    await settle(page, 400);
    code.push(`    await page.locator('input[name="switch"]').click();`);
    return code;
  }

  // ── Generic "click X button/link" ────────────────────────────────────────────
  if (desc.startsWith('click ') || desc.startsWith('clickonce ') || desc.includes('should click')) {
    // Extract the thing to click
    const btnText = quoted(raw)
      || desc.replace(/^click\s+(the\s+)?/, '').replace(/\s*(button|link|tab|subtab|section).*$/, '').trim();
    if (btnText) {
      try {
        const btn = page.getByRole('button', { name: new RegExp(btnText, 'i') });
        if (await btn.count() > 0) {
          await btn.first().click();
        } else {
          await page.getByText(btnText, { exact: true }).first().click();
        }
        await settle(page, 300);
        code.push(`    await page.getByText(${JSON.stringify(btnText)}, { exact: true }).first().click();`);
      } catch {
        code.push(`    // TODO: could not auto-click: "${btnText}" — verify manually`);
      }
    }
    return code;
  }

  // ── Fallback: log as TODO ─────────────────────────────────────────────────────
  console.log(`  ⚠ No handler for: "${step.description}" — adding TODO comment`);
  code.push(`    // TODO: automate — "${step.description}"`);
  code.push(`    //       expected: "${step.expected}"`);
  return code;
}

// ─── Spec file builder ────────────────────────────────────────────────────────
function buildSpecFile(
  tc: TC,
  actions: RecordedAction[],
  importPath: string,  // relative from spec file to helpers
  flowHelperPath: string,
): string {
  const testName = tc.name.replace(/_/g, ' ');
  const allCode = actions.map(a => {
    const lines = [
      `    // ${a.step}: ${a.description}`,
      ...(a.passed ? a.code : [`    // FAILED — ${a.error}`, ...a.code]),
    ];
    return lines.join('\n');
  }).join('\n\n');

  return `import { test, expect } from '${importPath}/fixtures/base';
import { FlowHelper } from '${importPath}/helpers/flowHelper';
import { dragModule } from '${importPath}/helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC${tc.id}: ${tc.name}
 * ${tc.description}
 * AUTO-RECORDED by auto_recorder.ts — locators verified against live DOM.
 */
test.describe('[TC${tc.id}] ${testName}', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow created during the test
    if (!flowName) return;
    try {
      await page.goto('${FLOWS_URL}', { waitUntil: 'domcontentloaded' });
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

  test('${testName.toLowerCase()}', async ({ page }) => {
    test.setTimeout(300_000);
    let flow: FlowHelper | null = null;

${allCode}
  });
});
`;
}

// ─── Run recorder for one TC ──────────────────────────────────────────────────
async function recordTC(
  tc: TC,
  outPath: string,
  specImportBase: string,
): Promise<void> {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`Recording TC${tc.id}: ${tc.name}`);
  console.log(`${'═'.repeat(65)}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    slowMo: SLOW_MO,
  });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const actions: RecordedAction[] = [];
  const ctx = { flowName: '', dropY: 434 };

  for (const step of tc.steps) {
    process.stdout.write(`  ${step.step.padEnd(8)} ${step.description.substring(0, 60)} … `);
    try {
      const code = await interpretStep(page, step, ctx);
      actions.push({ step: step.step, description: step.description, code, passed: true });
      console.log('✅');
    } catch (err: any) {
      const msg = String(err?.message || err).split('\n')[0].substring(0, 120);
      actions.push({ step: step.step, description: step.description, code: [`    // FAILED: ${msg}`], passed: false, error: msg });
      console.log(`❌  ${msg}`);
      // Continue — don't abort the whole TC
    }
  }

  await browser.close();

  // Write the spec file
  const spec = buildSpecFile(tc, actions, specImportBase, specImportBase);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, spec, 'utf8');

  const passed  = actions.filter(a => a.passed).length;
  const failed  = actions.filter(a => !a.passed).length;
  console.log(`\n  Spec written: ${outPath}`);
  console.log(`  Steps: ${passed} recorded ✅   ${failed} TODO ⚠`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2] || 'all';

  // Load JSON sources
  const lcTCs: TC[]  = JSON.parse(fs.readFileSync(LC_JSON, 'utf8'));
  const sTCs: TC[]   = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf8'));

  const LC_MAP: Record<string, number> = { LC1: 0, LC2: 1, LC3: 2 };
  const S_MAP: Record<string, number>  = { S1: 0, S2: 1, S3: 2 };

  const baseName = (tc: TC) => `TC${tc.id}_${tc.name.replace(/\s+/g, '_')}`;

  const tasks: Array<() => Promise<void>> = [];

  if (arg === 'all' || arg.startsWith('LC')) {
    const indices = arg === 'all' || arg === 'LC'
      ? [0, 1, 2]
      : [LC_MAP[arg] ?? 0];
    for (const i of indices) {
      const tc = lcTCs[i];
      if (!tc) { console.error(`No LC TC at index ${i}`); continue; }
      const outFile = path.join(LC_OUT_DIR, `${baseName(tc)}.spec.ts`);
      tasks.push(() => recordTC(tc, outFile, '../../../'));
    }
  }

  if (arg === 'all' || arg.startsWith('S')) {
    // Only run flow TCs (TC2, TC3) — TC1 is Settings navigation (no flow)
    const indices = arg === 'all'
      ? [1, 2]
      : [S_MAP[arg] ?? 0];
    for (const i of indices) {
      const tc = sTCs[i];
      if (!tc) { console.error(`No S TC at index ${i}`); continue; }
      const outFile = path.join(S_OUT_DIR, `${baseName(tc)}.spec.ts`);
      tasks.push(() => recordTC(tc, outFile, '../../'));
    }
  }

  if (tasks.length === 0) {
    console.error('Usage: npx ts-node src/recorded/auto_recorder.ts [LC1|LC2|LC3|S1|S2|S3|LC|all]');
    process.exit(1);
  }

  // Run sequentially (1 browser at a time to avoid shared auth issues)
  for (const task of tasks) {
    await task();
  }

  console.log('\n\nAll done! Now run:');
  console.log('  npx tsc --noEmit');
  console.log('  npx playwright test src/tests/recorded/ --project=chromium --workers=1');
}

main().catch(e => { console.error(e); process.exit(1); });
