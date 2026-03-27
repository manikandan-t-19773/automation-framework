/**
 * logic_containers_to_spec.ts
 *
 * Reads  manualtestcasedoc/logic_containers_testcases.json
 * Writes src/tests/recorded/LogicContainers/TC<n>_<NAME>.spec.ts
 *
 * Run:  npx ts-node src/recorded/logic_containers_to_spec.ts
 */
import * as fs   from 'fs';
import * as path from 'path';

// ─── URL constants ────────────────────────────────────────────────────────────
const FLOWS_URL = 'https://flow.localzoho.com/#/workspace/default/flows';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManualStep {
  step: string;
  description: string;
  expected: string;
  remarks: string;
  locator: string;
}
interface ManualTC {
  id: string;
  name: string;
  description: string;
  url: string;
  auto_status: string;
  steps: ManualStep[];
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[-_]/g, ' ')
    .replace(/["""]/g, '"')
    .trim();
}

/** Extract the first double-quoted token from a description */
function quoted(desc: string): string {
  const m = desc.match(/"([^"]+)"/);
  return m ? m[1] : '';
}

// ─── Step → Playwright code ───────────────────────────────────────────────────
function stepToCode(step: ManualStep, tcId: string, ctxRef: { flowName: string }): string[] {
  const raw  = step.description.replace(/^[-–—]+\s*/, '');
  const desc = normalise(raw);

  const lines: string[] = [`    // ${step.step}: ${raw}`];

  // ── My Flows Tab ────────────────────────────────────────────────────────────
  if (desc.includes('my flows tab') || desc.includes('click my flows')) {
    lines.push(
      `    await page.getByRole('link', { name: /my flows/i }).click();`,
      `    await page.waitForLoadState('domcontentloaded');`,
      `    await page.waitForTimeout(200);`,
      `    await expect(page).toHaveURL(new RegExp('/workspace/default/flows'));`
    );
    return lines;
  }

  // ── Create Flow button ──────────────────────────────────────────────────────
  if (desc.includes('create flow button') || desc.includes('click create flow')) {
    lines.push(
      `    await page.getByRole('button', { name: /create flow/i }).click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Fill flow name ───────────────────────────────────────────────────────────
  const nameMatch = desc.match(/(?:provide|fill|type|enter)\s+flowname\s+as\s+"([^"]+)"/i);
  if (nameMatch) {
    const fn = nameMatch[1];
    ctxRef.flowName = fn;
    lines.push(
      `    flowName = '${fn}';`,
      `    // Real locator from DOM: input[name="displayName"]`,
      `    const nameInput = page.locator('input[name="displayName"]');`,
      `    await nameInput.waitFor({ state: 'visible', timeout: 20_000 });`,
      `    await nameInput.fill('${fn}');`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Click Create button ──────────────────────────────────────────────────────
  if ((desc.includes('click create') || desc.includes('click the create'))
      && (desc.includes('btn') || desc.includes('button'))) {
    lines.push(
      `    // Proven locator: input#createFlowButton (type=submit) — store pre-URL for hash-router`,
      `    const preCreateUrl = page.url();`,
      `    await page.locator('input#createFlowButton, input[name="save"][type="submit"]').first().click();`,
      `    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });`,
      `    await page.waitForLoadState('domcontentloaded');`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Configure / Schedule section ────────────────────────────────────────────
  if (desc.includes('configure button') || (desc.includes('configure') && desc.includes('schedule'))) {
    lines.push(
      `    // Wait for trigger-chooser text, then click the Schedule Configure button (index 1)`,
      `    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await page.locator('button:has-text("Configure")').nth(1).click();`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Frequency → Once ────────────────────────────────────────────────────────
  if (desc.includes('frequency') && desc.includes('once')) {
    lines.push(
      `    // Proven locators from TC2: .customSelect_scheduleBy input.customSelectInputfield`,
      `    const freqWrapper = page.locator('.customSelect_scheduleBy');`,
      `    await freqWrapper.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await freqWrapper.locator('input.customSelectInputfield').click();`,
      `    await page.waitForTimeout(200);`,
      `    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect_scheduleBy div, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();`,
      `    const onceOptFallback = page.getByText('Once', { exact: true }).first();`,
      `    try {`,
      `      await onceOpt.waitFor({ state: 'visible', timeout: 30_000 });`,
      `      await onceOpt.click();`,
      `    } catch {`,
      `      await onceOptFallback.waitFor({ state: 'visible', timeout: 30_000 });`,
      `      await onceOptFallback.click();`,
      `    }`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Date field → +3 minutes ─────────────────────────────────────────────────
  if (desc.includes('datefield') || (desc.includes('date') && desc.includes('3 min'))) {
    lines.push(
      `    // Proven locator from TC2: getByRole('textbox', { name: /start date/i })`,
      `    const dateBox = page.getByRole('textbox', { name: /start date/i });`,
      `    await dateBox.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    const future = new Date(Date.now() + 3 * 60_000);`,
      `    const pad = (n: number) => String(n).padStart(2, '0');`,
      `    const month   = pad(future.getMonth() + 1);`,
      `    const day     = pad(future.getDate());`,
      `    const year    = future.getFullYear();`,
      `    const hours   = pad(future.getHours());`,
      `    const minutes = pad(future.getMinutes());`,
      `    await dateBox.fill('');`,
      `    await dateBox.type(\`\${month}/\${day}/\${year} \${hours}:\${minutes}\`);`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Apply button ─────────────────────────────────────────────────────────────
  if (desc.includes('click apply') || desc === 'apply') {
    lines.push(
      `    await page.getByRole('button', { name: /apply/i }).click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Done button ──────────────────────────────────────────────────────────────
  if (desc.includes('click done') || desc === 'done button') {
    lines.push(
      `    await page.getByRole('button', { name: /^done$/i }).click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Build-ins Subtab ─────────────────────────────────────────────────────────
  if (desc.includes('build ins') || desc.includes('built ins') || desc.includes('builtins')) {
    lines.push(
      `    // Real locator: span[data-ember-action] with text "Built-ins"`,
      `    // Only visible after the canvas / sidebar has loaded`,
      `    const builtinsBtn = page.locator('span[data-ember-action]').filter({ hasText: /^Built-ins$/i });`,
      `    await builtinsBtn.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await builtinsBtn.first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Logic Subtab ─────────────────────────────────────────────────────────────
  if (desc.includes('logic subtab') || (desc.includes('click') && desc.includes('logic'))) {
    lines.push(
      `    // Click the Logic accordion in the Built-ins sidebar`,
      `    // Real DOM: [data-ember-action] (not span-specific) confirmed from live discovery`,
      `    const logicSection = page.locator('[data-ember-action]').filter({ hasText: /^Logic$/i });`,
      `    await logicSection.first().waitFor({ state: 'visible', timeout: 20_000 });`,
      `    await logicSection.first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Subflow Subtab ───────────────────────────────────────────────────────────
  if (desc.includes('subflow subtab') || (desc.includes('click') && desc.includes('"subflow"'))) {
    lines.push(
      `    await page.getByText('Subflow', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Webhooks Subtab ──────────────────────────────────────────────────────────
  if (desc.includes('webhooks subtab') || (desc.includes('click') && desc.includes('"webhooks"'))) {
    lines.push(
      `    await page.getByText('Webhooks', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Notification Subtab ──────────────────────────────────────────────────────
  // "Click Notification Subtab" (TC1 Step20) — tab click, not the drag target section
  if (desc.includes('notification subtab') || desc.includes('"notification" subtab')) {
    lines.push(
      `    await page.getByText('Notification', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Notification Section (drag target, TC2 Step15, TC3 Step22) ───────────────
  if (desc === 'click notification section' || desc.includes('notification section')) {
    lines.push(
      `    await page.getByText('Notification', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Custom Function Subtab ────────────────────────────────────────────────────
  // DOM: input[value="Custom Function"] exists but has null bbox → must scroll + force
  if (desc.includes('custom function subtab') || (desc.includes('click') && desc.includes('"custom function"'))) {
    lines.push(
      `    // Custom Function item is in Developer Tools section of Built-ins, may be off-screen`,
      `    // Use scrollIntoViewIfNeeded + force:true because it renders as input[type=submit]`,
      `    const cfItem = page.locator('input[value="Custom Function"]').first();`,
      `    const cfItemCount = await cfItem.count();`,
      `    if (cfItemCount > 0) {`,
      `      await cfItem.scrollIntoViewIfNeeded();`,
      `      await cfItem.click({ force: true });`,
      `    } else {`,
      `      // Fallback: search in sidebar searchbox`,
      `      await page.locator('input[name="searchbox"]').fill('Custom Function');`,
      `      await page.waitForTimeout(200);`,
      `      await page.locator('p.zf-module-label:text-is("Custom Function"), .zf-module-label:has-text("Custom Function")').first().click({ force: true });`,
      `    }`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Commands & Scripts Subtab ─────────────────────────────────────────────────
  if (desc.includes('commands') && desc.includes('scripts') && desc.includes('subtab')) {
    lines.push(
      `    await page.getByText('Commands & Scripts', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Verify element present ────────────────────────────────────────────────────
  if (desc.startsWith('verify') && (desc.includes('present') || desc.includes('displayed'))) {
    // Use raw (not lowercased desc) to preserve original text like "SetVariable"
    const elem = quoted(raw);
    const stepSlugV = normalise(step.step || 'step').replace(/\s+/g, '_');
    if (elem) {
      // camelCase → spaced version for UI label (e.g. "SetVariable" → "Set Variable")
      const elemSpaced = elem.replace(/([a-z])([A-Z])/g, '$1 $2');
      const veVar = `verifyEl_${stepSlugV}`;
      lines.push(
        `    // Verify element — check both camelCase form and spaced form`,
        `    const ${veVar} = page.getByText(${JSON.stringify(elemSpaced)}, { exact: true }).first()`,
        `                           .or(page.getByText(${JSON.stringify(elem)}, { exact: false }).first());`,
        `    await expect(${veVar}).toBeVisible({ timeout: 20_000 });`
      );
    } else if (desc.includes('custom function')) {
      lines.push(
        `    const cfItems = page.locator('[class*="action-item"], [class*="list-item"], li').filter({ hasText: /function|custom/i });`,
        `    await expect(cfItems.first()).toBeVisible({ timeout: 20_000 });`
      );
    } else {
      lines.push(`    // TODO: manual verification — "${raw}"`);
    }
    return lines;
  }

  // ── Drag "Set Variable" into Trigger box ──────────────────────────────────────
  if (desc.includes('drag') && desc.includes('set variable') && !desc.includes('drag and drop')) {
    lines.push(
      `    // dragModule: proven selector p.zf-module-label:text-is("Set Variable")`,
      `    await dragModule(page, 'Set Variable', { x: 715, y: 434 });`
    );
    return lines;
  }

  // ── Drag "Decision" into SetVariable action ───────────────────────────────────
  if (desc.includes('drag and drop') && desc.includes('decision') && (desc.includes('setvariable') || desc.includes('set variable'))) {
    lines.push(
      `    // dragModule: Decision below Set Variable on canvas`,
      `    await dragModule(page, 'Decision', { x: 715, y: 580 });`
    );
    return lines;
  }

  // ── Drag "Send Mail" → Decision Direct connection (TC3) ───────────────────────
  if (desc.includes('drag and drop') && desc.includes('send mail') && desc.includes('decision')) {
    lines.push(
      `    // dragModule: Send Mail into Decision branch area`,
      `    await dragModule(page, 'Send Mail', { x: 715, y: 720 });`
    );
    return lines;
  }

  // ── Drag "Send Mail" → Trigger box (TC2, 2nd action after Set Variable) ────────
  if (desc.includes('drag and drop') && desc.includes('send mail') && desc.includes('trigger')) {
    lines.push(
      `    // dragModule: Send Mail below Set Variable`,
      `    await dragModule(page, 'Send Mail', { x: 715, y: 580 });`
    );
    return lines;
  }

  // ── Give input in "Value" field (TC2/TC3) ─────────────────────────────────────
  if ((desc.includes('value') && desc.includes('field'))
      && (desc.includes('give') || desc.includes('input'))) {
    const valMatch = desc.match(/^give\s+"([^"]+)"\s+input/i)
                  || desc.match(/^give\s+as\s+"([^"]+)"\s+value/i);
    const fillValue = valMatch ? valMatch[1] : 'testvalue';
    const stepSlug2 = normalise(step.step || 'step').replace(/\s+/g, '_');
    const vfVar = `valueField_${stepSlug2}`;
    lines.push(
      `    // Value field — real DOM selector confirmed: input[name="variableValue"]`,
      `    const ${vfVar} = page.locator('input[name="variableValue"]');`,
      `    await ${vfVar}.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await ${vfVar}.fill(${JSON.stringify(fillValue)});`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Give "qa" value in input field (Decision condition) ──────────────────────
  if (desc.includes('give as') && desc.includes('value in input field')) {
    const qa = quoted(desc) || 'qa';
    lines.push(
      `    // Fill the condition value field in the Decision config`,
      `    const condInput = page.getByRole('textbox').last();`,
      `    await condInput.waitFor({ state: 'visible', timeout: 20_000 });`,
      `    await condInput.fill(${JSON.stringify(qa)});`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Fill "To" field ───────────────────────────────────────────────────────────
  if (desc.includes('"to" field') || desc.includes('give input') && desc.includes('"to"')) {
    const val = quoted(desc.split('"to"')[0]) || 'tmaniflow@gmail.com';
    // The value is the part before "in "to" field"
    const toMatch = raw.match(/input as\s+(\S+)/i);
    const toVal = toMatch ? toMatch[1] : 'tmaniflow@gmail.com';
    lines.push(
      `    // Fill To field`,
      `    await flow.pickDropdownItem('Choose To');`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Fill "Subject" field ──────────────────────────────────────────────────────
  if (desc.includes('"subject" field') || (desc.includes('give input') && desc.includes('"subject"'))) {
    const subMatch = raw.match(/input as\s+(\S+)\s+in/i);
    const subVal = subMatch ? subMatch[1] : 'Automation';
    lines.push(
      `    // Fill Subject field via getByRole (pierces shadow DOM)`,
      `    const subjectField = page.getByRole('textbox', { name: /subject/i });`,
      `    await subjectField.waitFor({ state: 'visible', timeout: 60_000 });`,
      `    await subjectField.fill(${JSON.stringify(subVal)});`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── 1st Choose option (Decision condition field selector) ─────────────────────
  if (desc.includes('1st choose option') || desc.includes('click 1st choose')) {
    lines.push(
      `    // Click the 1st "Choose" dropdown in the Decision condition panel`,
      `    const choose1 = page.getByRole('combobox').first()`,
      `                        .or(page.locator('[placeholder*="Choose" i]').first());`,
      `    await choose1.first().waitFor({ state: 'visible', timeout: 20_000 });`,
      `    await choose1.first().click();`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Select "Set Variable" option ──────────────────────────────────────────────
  if (desc.includes('select') && desc.includes('"set variable"')) {
    lines.push(
      `    // Select "Set Variable" from the dropdown options`,
      `    await page.getByText('Set Variable', { exact: true }).first().click();`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── 2nd Choose option ─────────────────────────────────────────────────────────
  if (desc.includes('2nd choose option') || desc.includes('click 2nd choose')) {
    lines.push(
      `    // Click the 2nd "Choose" dropdown (operator selector)`,
      `    const choose2 = page.getByRole('combobox').nth(1)`,
      `                        .or(page.locator('[placeholder*="Choose" i]').nth(1));`,
      `    await choose2.first().waitFor({ state: 'visible', timeout: 20_000 });`,
      `    await choose2.first().click();`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Select starts with ────────────────────────────────────────────────────────
  if (desc.includes('select') && desc.includes('starts with')) {
    lines.push(
      `    // Select "starts with" operator`,
      `    await page.getByText('starts with', { exact: false }).first().click();`,
      `    await page.waitForTimeout(400);`
    );
    return lines;
  }

  // ── Switch ON flow ────────────────────────────────────────────────────────────
  if (desc.includes('switch on') || desc.includes('swith on') || desc.includes('turn on')) {
    const expLow = step.expected.toLowerCase();
    const expectNegative = expLow.includes('should not') || expLow.includes('not be switched') || expLow.includes('not switchedon');
    const assert = expectNegative
      ? `    await expect(flowToggle).not.toBeChecked({ timeout: 30_000 }); // Expected: "${step.expected}"`
      : `    await expect(flowToggle).toBeChecked({ timeout: 30_000 });     // Expected: "${step.expected}"`;
    lines.push(
      `    // Expected Result (xlsx): "${step.expected}"`,
      `    // Real locator: input[name="switch"] — confirmed from live DOM discovery`,
      `    const flowToggle = page.locator('input[name="switch"]').first();`,
      `    await flowToggle.waitFor({ state: 'attached', timeout: 20_000 });`,
      `    await page.evaluate(() => {`,
      `      const inp = document.querySelector('input[name="switch"]') as HTMLElement | null;`,
      `      if (!inp) throw new Error('Switch input[name="switch"] not found');`,
      `      let el: HTMLElement | null = inp.parentElement;`,
      `      while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;`,
      `      (el ?? inp).click();`,
      `    });`,
      `    await page.waitForTimeout(300);`,
      assert
    );
    return lines;
  }

  // ── History Subtab ────────────────────────────────────────────────────────────
  if (desc.includes('history subtab') || (desc.includes('click') && desc.includes('history'))) {
    lines.push(
      `    // Click History tab in the flow editor`,
      `    await page.getByRole('tab', { name: /history/i }).first()`,
      `              .or(page.getByText('History', { exact: true }).first()).click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Wait for scheduler trigger ────────────────────────────────────────────────
  if (desc.includes('wait until') && (desc.includes('trigger') || desc.includes('scheduler'))) {
    lines.push(
      `    // Wait for the scheduled trigger to fire (+3 min set above, wait 4 min to be safe)`,
      `    console.log('Waiting 4 minutes for scheduler trigger...');`,
      `    await page.waitForTimeout(4 * 60_000);`,
      `    console.log('Wait complete.');`
    );
    return lines;
  }

  // ── Refresh icon in history tab ────────────────────────────────────────────────
  if (desc.includes('refresh icon') || (desc.includes('click refresh') && desc.includes('history'))) {
    lines.push(
      `    // Click the Refresh button in the History tab`,
      `    const refreshBtn = page.locator('[aria-label*="refresh" i], [title*="refresh" i], button[class*="refresh"]').first();`,
      `    if (await refreshBtn.count() > 0) {`,
      `      await refreshBtn.click();`,
      `    } else {`,
      `      await page.locator('button').filter({ hasText: /refresh/i }).first().click();`,
      `    }`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Latest execution record ────────────────────────────────────────────────────
  if (desc.includes('latest execution') || desc.includes('click latest execution')) {
    lines.push(
      `    // Click the most-recent execution record in the History list`,
      `    const execRow = page.locator('table tbody tr, [class*="execution-row"], [class*="history-item"]').first();`,
      `    await execRow.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await execRow.click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── SetVariable Input ─────────────────────────────────────────────────────────
  if (desc.includes('setvariable input')) {
    lines.push(
      `    // Click the Input section of the Set Variable execution detail`,
      `    await page.getByText('Input', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── SetVariable Output ────────────────────────────────────────────────────────
  if (desc.includes('setvariable output')) {
    lines.push(
      `    // Click the Output section of the Set Variable execution detail`,
      `    await page.getByText('Output', { exact: true }).first().click();`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Close window icon ─────────────────────────────────────────────────────────
  if (desc.includes('close window icon') || desc.includes('click close window')) {
    lines.push(
      `    // Close the execution detail modal/panel`,
      `    const closeBtn = page.locator('[aria-label*="close" i], [class*="close-btn"], [class*="close-icon"], [class*="modal"] button:last-child').first();`,
      `    if (await closeBtn.count() > 0) {`,
      `      await closeBtn.click();`,
      `    } else {`,
      `      await page.keyboard.press('Escape');`,
      `    }`,
      `    await page.waitForTimeout(200);`
    );
    return lines;
  }

  // ── Fallback: screenshot ──────────────────────────────────────────────────────
  const stepSlug = normalise(step.step || 'step').replace(/\s+/g, '_');
  lines.push(
    `    // TODO: implement — "${raw}"`,
    `    await page.screenshot({ path: 'test-results/${tcId}_${stepSlug}.png', fullPage: false });`,
    `    await page.waitForTimeout(200);`
  );
  return lines;
}

// ─── Spec file generation ─────────────────────────────────────────────────────
function generateSpec(tc: ManualTC): string {
  const ctxRef = { flowName: '' };

  const stepLines = tc.steps
    .map(s => stepToCode(s, `TC${tc.id}`, ctxRef).join('\n'))
    .join('\n\n');

  return `import { test, expect } from '../../../fixtures/base';
import { FlowHelper } from '../../../helpers/flowHelper';
import { dragModule } from '../../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC${tc.id}: ${tc.name}
 * ${tc.description}
 * Source: manualtestcasedoc/LogicContainers.xlsx
 */
test.describe('[LC_TC${tc.id}] ${tc.name}', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    if (flowName) {
      try {
        const flow = new FlowHelper(page);
        await flow.deleteFlow(flowName);
      } catch (_) { /* best-effort cleanup */ }
    }
  });

  test('${tc.description}', async ({ page }) => {
    test.setTimeout(300_000); // 25 min ceiling (scheduler wait = 4 min)
    const flow = new FlowHelper(page);

    await page.goto('${FLOWS_URL}');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

${stepLines}
  });
});
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const inputFile = path.resolve('manualtestcasedoc/logic_containers_testcases.json');
  const specDir   = path.resolve('src/tests/recorded/LogicContainers');

  fs.mkdirSync(specDir, { recursive: true });

  const testcases: ManualTC[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  console.log(`\nGenerating ${testcases.length} LogicContainers spec(s) into ${specDir}\n`);

  for (const tc of testcases) {
    const fileName = `TC${tc.id}_${tc.name}.spec.ts`;
    const filePath = path.join(specDir, fileName);
    const code     = generateSpec(tc);
    fs.writeFileSync(filePath, code, 'utf-8');
    console.log(`  ✔ ${fileName}  (${tc.steps.length} steps)`);
  }

  console.log('\nDone.\n');
}

main();
