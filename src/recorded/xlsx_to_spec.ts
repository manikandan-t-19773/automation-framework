/**
 * xlsx_to_spec.ts
 * Reads manualtestcasedoc/parsed_testcases.json and generates:
 *  - src/recorded/<id>.json         (recorded test JSON per TC)
 *  - src/tests/recorded/<id>.spec.ts (Playwright spec per TC)
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── URL map built from DOM snapshots ────────────────────────────────────────
const URL_BASE = 'https://flow.localzoho.com';
const PAGE_URLS: Record<string, string> = {
  settings:           `${URL_BASE}/#/settings`,
  history:            `${URL_BASE}/#/settings/history`,
  connections:        `${URL_BASE}/#/settings/connections`,
  members:            `${URL_BASE}/#/settings/users`,
  support:            `${URL_BASE}/#/settings/support`,
  billing:            `${URL_BASE}/#/settings/billing`,
  agents:             `${URL_BASE}/#/settings/agents`,
  'custom-function':  `${URL_BASE}/#/settings/custom-function`,
  'email-template':   `${URL_BASE}/#/settings/email-template`,
  'audit-trail':      `${URL_BASE}/#/settings/audit-trail`,
  flows:              `${URL_BASE}/#/workspace/default/flows`,
  dashboard:          `${URL_BASE}/#/dashboard`,
};

// ─── Settings nav-item text → URL hash ───────────────────────────────────────
const NAV_TEXT_TO_HASH: Record<string, string> = {
  'history':           '/settings/history',
  'connection':        '/settings/connections',
  'connections':       '/settings/connections',
  'members':           '/settings/users',
  'publish details':   '/settings/billing',
  'audit trail':       '/settings/audit-trail',
  'support access':    '/settings/support',
  'billing':           '/settings/billing',
  'on-prem agents':    '/settings/agents',
  'custom functions':  '/settings/custom-function',
  'email templates':   '/settings/email-template',
};

const NAV_TEXT_TO_LINK_TEXT: Record<string, string> = {
  'history':          'History',
  'connection':       'Connections',
  'connections':      'Connections',
  'members':          'Members',
  'publish details':  'Billing & Usage',
  'audit trail':      'Audit Trail',
  'support access':   'Support Access',
  'billing':          'Billing & Usage',
};

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Natural-language → Playwright code ──────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[-_]/g, ' ').trim();
}

function stepToPlaywright(step: ManualStep, tcId: string): string[] {
  const desc = normalise(step.description.replace(/^-+\s*/, ''));
  const lines: string[] = [`    // ${step.step}: ${step.description.replace(/^-+\s*/, '')}`];

  // ── My Flows Tab ─────────────────────────────────────────────────────────
  if (desc.includes('my flows tab') || desc.includes('click my flows')) {
    lines.push(
      `    await page.getByRole('link', { name: /my flows/i }).click();`,
      `    await page.waitForLoadState('networkidle');`,
      `    await page.waitForTimeout(800);`,
      `    await expect(page).toHaveURL(new RegExp("/workspace/default/flows"));`
    );
    return lines;
  }

  // ── Settings menu navigation ──────────────────────────────────────────────
  if (desc === 'click on the settings menu' || desc === 'click settings') {
    lines.push(
      `    await page.getByRole('link', { name: 'Settings' }).click();`,
      `    await page.waitForLoadState('networkidle');`,
      `    await page.waitForTimeout(800);`,
      `    await expect(page.getByRole('heading', { name: 'GENERAL' })).toBeVisible();`,
      `    await expect(page.getByRole('heading', { name: 'FLOW SETUP' })).toBeVisible();`,
      `    await expect(page.getByRole('heading', { name: 'MONITORING' })).toBeVisible();`,
      `    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible();`,
      `    await expect(page.getByRole('heading', { name: 'SECURITY & COMPLIANCE' })).toBeVisible();`
    );
    return lines;
  }

  // ── Click on nav menu link ────────────────────────────────────────────────
  for (const [key, hash] of Object.entries(NAV_TEXT_TO_HASH)) {
    if (desc.includes(key)) {
      const linkText = NAV_TEXT_TO_LINK_TEXT[key] ?? key;
      lines.push(
        `    await page.getByRole('link', { name: ${JSON.stringify(linkText)} }).click();`,
        `    await page.waitForLoadState('networkidle');`,
        `    await page.waitForTimeout(800);`
      );
      // Drive the URL assertion from the Expected Result column
      if (step.expected.toLowerCase().includes('should not be displayed')) {
        // Negative assertion: page / section must NOT be reached
        lines.push(
          `    // Expected Result: "${step.expected}" — page must NOT be displayed`,
          `    await expect(page).not.toHaveURL(new RegExp(${JSON.stringify(escapeRegex(hash))}));`
        );
      } else {
        // Positive assertion: URL must match the section hash
        lines.push(`    await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegex(hash))}));`);
      }
      return lines;
    }
  }

  // ── Click Create Flow ─────────────────────────────────────────────────────
  if (desc.includes('click create flow') || desc.includes('create flow button')) {
    lines.push(
      `    await page.getByRole('button', { name: /create flow/i }).click();`,
      `    await page.waitForTimeout(800);`
    );
    return lines;
  }

  // ── Fill flow name ────────────────────────────────────────────────────────
  const nameMatch = desc.match(/(?:provide|fill|type|enter)\s+flowname\s+as\s+"?([^"]+)"?/i)
    ?? desc.match(/flowname.*?"([^"]+)"/i)
    ?? desc.match(/flow name.*?"([^"]+)"/i);
  if (nameMatch) {
    const flowName = step.description.match(/"([^"]+)"/)?.[1] ?? nameMatch[1];
    lines.push(
      `    // Flow name input is input[name="displayName"] in the Create Flow dialog`,
      `    const flowNameInput = page.locator('input[name="displayName"]').first();`,
      `    await flowNameInput.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await flowNameInput.fill(${JSON.stringify(flowName)});`
    );
    return lines;
  }

  // ── Click Create button ───────────────────────────────────────────────────
  if (desc === 'click create button' || desc === 'click the create button') {
    lines.push(
      `    // The Create button in Zoho Flow is an <input type="submit"> not a <button>`,
      `    const createBtn = page.locator('#createFlowButton, input[type="submit"][name="save"], input[type="submit"][value="Create"]').first();`,
      `    await createBtn.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    // Capture current URL before clicking so waitForURL detects the NEW flow's /edit route`,
      `    const preCreateUrl = page.url();`,
      `    await createBtn.click();`,
      `    await page.waitForURL(url => url.href.includes('/edit') && url.href !== preCreateUrl, { timeout: 30_000 });`,
      `    await page.waitForLoadState('networkidle');`,
      `    await page.waitForTimeout(2000);`
    );
    return lines;
  }

  // ── Click Configure button ────────────────────────────────────────────────
  if (desc.includes('configure button') || desc.includes('click configure')) {
    lines.push(
      `    // Use exact:true to avoid matching hidden sidebar labels like 'Schedule meeting'`,
      `    await page.getByText('Choose the event that triggers your flow').waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await page.getByText('Schedule', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });`,
      `    // Schedule is 2nd Configure button: App(0), Schedule(1), Webhook(2)`,
      `    await page.locator('button:has-text("Configure")').nth(1).click();`,
      `    await page.waitForTimeout(2000);`
    );
    return lines;
  }

  // ── Frequency → Once ─────────────────────────────────────────────────────
  if (desc.includes('frequency') && desc.includes('once')) {
    lines.push(
      `    // 3 custom selects in dialog: customSelect_flows(1st), customSelect_scheduleBy/Frequency(2nd), customSelect_timeZone(3rd)`,
      `    const freqWrapper = page.locator('.customSelect_scheduleBy');`,
      `    await freqWrapper.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await freqWrapper.locator('input.customSelectInputfield').click();`,
      `    await page.waitForTimeout(1000);`,
      `    const onceOpt = page.locator('.customSelect_scheduleBy li, .customSelect_scheduleBy div, .customSelect-ul li').filter({ hasText: /^Once$/i }).first();`,
      `    const onceOptFallback = page.getByText('Once', { exact: true }).first();`,
      `    try {`,
      `      await onceOpt.waitFor({ state: 'visible', timeout: 30_000 });`,
      `      await onceOpt.click();`,
      `    } catch {`,
      `      await onceOptFallback.waitFor({ state: 'visible', timeout: 30_000 });`,
      `      await onceOptFallback.click();`,
      `    }`,
      `    await page.waitForTimeout(500);`
    );
    return lines;
  }

  // ── Date field ────────────────────────────────────────────────────────────
  if (desc.includes('datefield') || desc.includes('date field')) {
    lines.push(
      `    // Zoho Flow scheduler uses a textbox with aria-label "Start Date"`,
      `    const dateBox = page.getByRole('textbox', { name: /start date/i });`,
      `    await dateBox.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    // Build a date/time string 3 minutes in the future`,
      `    const fut = new Date(Date.now() + 3 * 60 * 1000);`,
      `    const p2  = (n: number) => String(n).padStart(2, '0');`,
      `    // Zoho Flow date picker accepts "MM/DD/YYYY HH:MM" style input`,
      `    const dateStr = \`\${p2(fut.getMonth()+1)}/\${p2(fut.getDate())}/\${fut.getFullYear()} \${p2(fut.getHours())}:\${p2(fut.getMinutes())}\`;`,
      `    await dateBox.click();`,
      `    await dateBox.fill(dateStr);`,
      `    await page.keyboard.press('Tab'); // confirm the date picker`,
      `    await page.waitForTimeout(800);`
    );
    return lines;
  }

  // ── Apply button ──────────────────────────────────────────────────────────
  if (desc.includes('apply button') || desc === 'click apply button') {
    lines.push(
      `    await page.getByRole('button', { name: /apply/i }).click();`,
      `    await page.waitForTimeout(500);`
    );
    return lines;
  }

  // ── Done button ───────────────────────────────────────────────────────────
  if ((desc.includes('done button') || desc === 'click done button') && !desc.includes('search')) {
    lines.push(
      `    await page.getByRole('button', { name: /done/i }).click();`,
      `    await page.waitForTimeout(800);`
    );
    return lines;
  }

  // ── Build-ins subtab ────────────────────────────────────────────────────
  // normalise() converts 'Build-ins' → 'build ins'
  // Open the sidebar search panel first (same action as TC2's "click search icon" step),
  // then switch to the Built-ins tab.
  if (desc.includes('build ins') || desc.includes('builtins') || desc.includes('built ins')) {
    lines.push(
      `    // Open the sidebar app panel (same as clicking the search icon)`,
      `    const builtinsSearch = page.getByRole('textbox', { name: /search apps/i });`,
      `    await builtinsSearch.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await builtinsSearch.click();`,
      `    await page.waitForTimeout(500);`,
      `    // Switch to the Built-ins tab`,
      `    await page.getByRole('tab', { name: /built.?ins/i })`,
      `      .or(page.getByText('Built-ins', { exact: true })).first().click();`,
      `    await page.waitForTimeout(800);`
    );
    return lines;
  }

  // ── Notification section ──────────────────────────────────────────────────
  if (desc.includes('notification section') || desc.includes('click notification')) {
    lines.push(
      `    // Expand the Notification accordion in the Built-ins sidebar`,
      `    await page.getByText('Notification', { exact: true }).first().click();`,
      `    await page.waitForTimeout(800);`
    );
    return lines;
  }

  // ── Generic fill: "give input as <value> in \"<field>\" field" ───────────────
  // Handles To / Subject / any named text field in an action config panel.
  // Extract from original description to preserve case/email/special chars.
  // Skip if it's the Slack message field — that needs connection selection first.
  const giveInputRaw = step.description.match(
    /give input as (.+?) in ["\u2019']([^"\u2019']+)["\u2019']\s*field/i
  ) ?? step.description.match(/give input as ([^\s]+) in (\w+)\s*field/i);
  if (giveInputRaw && !desc.includes('message field')) {
    const fillValue  = giveInputRaw[1].trim();
    const fieldLabel = giveInputRaw[2].trim().toLowerCase();
    const varName    = fieldLabel.replace(/\s+/g, '_') + 'Field';
    lines.push(
      `    // Fill "${fieldLabel}" via getByRole — pierces shadow DOM in Zoho Flow editor`,
      `    const ${varName} = page.getByRole('textbox', { name: /^${fieldLabel}\\b/i });`,
      `    await ${varName}.waitFor({ state: 'visible', timeout: 60_000 });`,
      `    await ${varName}.fill(${JSON.stringify(fillValue)});`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Search icon / search box ──────────────────────────────────────────────
  if (desc.includes('search icon') || desc.includes('click search')) {
    lines.push(
      `    // Zoho Flow builder sidebar search box — aria-label 'Search apps, actions, or logic'`,
      `    const searchInput = page.getByRole('textbox', { name: /search apps/i });`,
      `    await searchInput.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await searchInput.click();`,
      `    await page.waitForTimeout(500);`
    );
    return lines;
  }

  // ── Search app name ───────────────────────────────────────────────────────
  if (desc.includes('search') && (desc.includes('appname') || desc.includes('app name') || desc.includes('slack'))) {
    const appName = desc.includes('slack') ? 'Slack' : (step.description.match(/"([^"]+)"/)?.[1] ?? 'app');
    lines.push(
      `    const appSearchBox = page.getByRole('textbox', { name: /search apps/i });`,
      `    await appSearchBox.waitFor({ state: 'visible', timeout: 30_000 });`,
      `    await appSearchBox.fill(${JSON.stringify(appName)});`,
      `    await page.waitForTimeout(1000);`
    );
    return lines;
  }

  // ── Drag and Drop — uses DragHelper (src/helpers/dragHelper.ts) ──────────
  if (desc.includes('drag and drop') || desc.includes('draganddrop')) {
    const actionMatch = step.description.match(/"([^"]+)"/g);
    const actionName  = actionMatch?.[0]?.replace(/"/g, '') ?? 'Send Direct Message';
    const safeRe      = actionName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    lines.push(
      `    // Drag "${actionName}" onto the canvas (bbox-based DragHelper)`,
      `    // Try p, span, and li tags — Built-ins may use a different DOM structure`,
      `    const actionPara = page.locator('p, span, li').filter({ hasText: /${safeRe}/i }).first();`,
      `    // Fallback: if action not visible from sidebar navigation, search for it directly`,
      `    try {`,
      `      await actionPara.waitFor({ state: 'visible', timeout: 10_000 });`,
      `    } catch {`,
      `      const appSrch = page.getByRole('textbox', { name: /search apps/i });`,
      `      if (await appSrch.isVisible()) {`,
      `        await appSrch.fill(${JSON.stringify(actionName)});`,
      `        await page.waitForTimeout(1000);`,
      `      }`,
      `      await actionPara.waitFor({ state: 'visible', timeout: 20_000 });`,
      `    }`,
      `    const dragHelperInst = new DragHelper(page);`,
      `    // Tag the <li> parent; use concat (not template literal) inside evaluate`,
      `    const srcTagged = await actionPara.evaluate(function(el) {`,
      `      var node: HTMLElement | null = el as HTMLElement;`,
      `      for (var i = 0; i < 10; i++) {`,
      `        if (!node) break;`,
      `        if (node.tagName === 'LI') {`,
      `          var uid = 'dnd-' + Math.random().toString(36).slice(2, 10);`,
      `          node.setAttribute('data-dnd', uid);`,
      `          return '[data-dnd="' + uid + '"]';`,
      `        }`,
      `        node = node.parentElement;`,
      `      }`,
      `      return '';`,
      `    });`,
      `    if (!srcTagged) throw new Error('Could not tag <li> ancestor for "${actionName}"');`,
      `    // Drop at canvas coordinates derived from the trigger node bbox + 220px below`,
      `    await dragHelperInst.dragAndDrop(srcTagged, '', { x: 715, y: 434 });`,
      `    // Give the action config panel 2 s to render after the drop`,
      `    await page.waitForTimeout(2000);`
    );
    return lines;
  }

  // ── Fill message field (Slack / action panel) ─────────────────────────────
  // Connection must be chosen first to unlock the text fields.
  // flow.fillActionField falls back to getByRole('textbox',{name}) which pierces shadow DOM.
  if (desc.includes('message field') || (desc.includes('input') && desc.includes('test'))) {
    lines.push(
      `    // Connection must be selected first — it unlocks the message/To fields`,
      `    await flow.pickDropdownItem('Choose Connection');`,
      `    // fillActionField falls back to getByRole which pierces shadow DOM`,
      `    await flow.fillActionField('text', 'test');`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Select first option in To field ──────────────────────────────────────
  if (desc.includes('to field') || desc.includes('select 1st option')) {
    lines.push(
      `    await flow.pickDropdownItem('Choose To');`,
      `    await page.waitForTimeout(300);`
    );
    return lines;
  }

  // ── Switch ON flow ────────────────────────────────────────────────────────
  if (desc.includes('switch on') || desc.includes('swith on') || desc.includes('turn on')) {
    // Derive the assertion from the Expected Result column (xlsx col G)
    const expLow = step.expected.toLowerCase();
    // "flow should not be SwitchedON" → assert NOT checked
    // "flow should be SwitchedON"     → assert checked
    const expectNegative = expLow.includes('should not') ||
                           expLow.includes('not be switched') ||
                           expLow.includes('not switchedon');
    const toggleAssertion = expectNegative
      ? `    await expect(flowToggle).not.toBeChecked({ timeout: 30_000 }); // Expected: "${step.expected}"`
      : `    await expect(flowToggle).toBeChecked({ timeout: 30_000 });     // Expected: "${step.expected}"`;
    lines.push(
      `    // Expected Result (xlsx): "${step.expected}"`,
      `    // Attempt to toggle the flow switch`,
      `    await page.evaluate(() => {`,
      `      const input = document.querySelector('input[name="switch"], input.switch-input') as HTMLElement | null;`,
      `      if (!input) throw new Error('Switch input not found');`,
      `      let el: HTMLElement | null = input.parentElement;`,
      `      while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;`,
      `      (el ?? input).click();`,
      `    });`,
      `    await page.waitForTimeout(1500);`,
      `    const flowToggle = page.locator('input[name="switch"], input.switch-input').first();`,
      toggleAssertion
    );
    return lines;
  }

  // ── Fallback: screenshot the state for manual review ─────────────────────
  lines.push(
    `    // TODO: manual step — "${step.description}"`,
    `    await page.screenshot({ path: 'test-results/${tcId}_${normalise(step.step).replace(/\s+/g,'_')}.png', fullPage: false });`,
    `    await page.waitForTimeout(500);`
  );
  return lines;
}

// ─── Detect flow-creation TCs ────────────────────────────────────────────────
/** A TC is a "flow creation" TC when any step mentions creating/building a flow */
function isFlowCreationTC(tc: ManualTC): boolean {
  return !tc.name.toLowerCase().includes('settings') && tc.steps.some(s => {
    const d = normalise(s.description);
    return (
      d.includes('create flow') ||
      d.includes('drag and drop') ||
      d.includes('draganddrop') ||
      d.includes('switch on') ||
      d.includes('swith on')
    );
  });
}

function generateSpec(tc: ManualTC): string {
  const isSettings = tc.name.toLowerCase().includes('settings');
  const isFlow     = isFlowCreationTC(tc);
  const startUrl   = isSettings ? PAGE_URLS.settings : PAGE_URLS.flows;

  const stepLines = tc.steps
    .map(s => stepToPlaywright(s, `TC${tc.id}`).join('\n'))
    .join('\n\n');

  if (isFlow) {
    // ── Flow-creation TC: uses FlowHelper + DragHelper + afterEach teardown ──
    return `import { test, expect } from '../../fixtures/base';
import { FlowHelper } from '../../helpers/flowHelper';
import { DragHelper } from '../../helpers/dragHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC${tc.id}: ${tc.name}
 * ${tc.description}
 * Source: manualtestcasedoc/Settings_standalone.xlsx
 */
test.describe('[TC${tc.id}] ${tc.name}', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    // Delete the test flow after each run to keep the workspace clean
    if (flowName) {
      const flow = new FlowHelper(page);
      await flow.deleteFlow(flowName);
    }
  });

  test('${tc.description}', async ({ page }) => {
    // Allow 2 minutes for all steps (each step waits up to 2 min).
    // Playwright's retries:2 config will restart from Step 1 on failure,
    // up to 2 times before saving trace for the debugging process.
    test.setTimeout(1_500_000);
    const flow = new FlowHelper(page);

    // Navigate to the start URL before running steps
    await page.goto(${JSON.stringify(startUrl)});
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

${stepLines}
  });
});
`;
  }

  // ── Non-flow TC (Settings, etc.): plain spec, no FlowHelper ────────────────
  return `import { test, expect } from '../../fixtures/base';

test.use({ storageState: 'playwright/.auth/user.json' });

/**
 * TC${tc.id}: ${tc.name}
 * ${tc.description}
 * Source: manualtestcasedoc/Settings_standalone.xlsx
 */
test.describe('[TC${tc.id}] ${tc.name}', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(${JSON.stringify(startUrl)});
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('${tc.description}', async ({ page }) => {
    // Allow 2 min; retries:2 in playwright.config.ts restarts from Step 1
    // on failure. After 2 retries the trace is saved for the debugging process.
    test.setTimeout(1_500_000);
${stepLines}
  });
});
`;
}

// ─── Generate a recorded JSON from one test case ─────────────────────────────
function generateRecordedJson(tc: ManualTC): object {
  const startUrl = tc.name.toLowerCase().includes('settings')
    ? PAGE_URLS.settings
    : PAGE_URLS.flows;

  const steps: object[] = [{ action: 'waitForLoadState', state: 'networkidle', note: 'Page fully loaded' }];

  for (const s of tc.steps) {
    const desc = normalise(s.description.replace(/^-+\s*/, '').replace(/\|.*/g, '').trim());

    if (desc.includes('my flows tab') || desc.includes('click my flows')) {
      steps.push({ action: 'click', role: 'link', name: 'My Flows', note: s.description.split('|')[0].trim() });
      steps.push({ action: 'waitForLoadState', state: 'networkidle' });
      steps.push({ action: 'assertURL', url: '/workspace/default/flows', note: 'My Flows tab loaded' });
      continue;
    }

    if (desc === 'click on the settings menu' || desc === 'click settings') {
      steps.push({ action: 'click', role: 'link', name: 'Settings', note: s.description });
      steps.push({ action: 'waitForLoadState', state: 'networkidle' });
      steps.push({ action: 'assertVisible', role: 'heading', name: 'GENERAL', note: 'Settings menu has GENERAL' });
      steps.push({ action: 'assertVisible', role: 'heading', name: 'FLOW SETUP', note: 'Settings menu has FLOW SETUP' });
      steps.push({ action: 'assertVisible', role: 'heading', name: 'MONITORING', note: 'Settings menu has MONITORING' });
      steps.push({ action: 'assertVisible', role: 'heading', name: 'AI', note: 'Settings menu has AI' });
      steps.push({ action: 'assertVisible', role: 'heading', name: 'SECURITY & COMPLIANCE', note: 'Settings menu has SECURITY & COMPLIANCE' });
      continue;
    }

    for (const [key, hash] of Object.entries(NAV_TEXT_TO_HASH)) {
      if (desc.includes(key)) {
        const linkText = NAV_TEXT_TO_LINK_TEXT[key] ?? key;
        steps.push({ action: 'click', role: 'link', name: linkText, note: s.description });
        steps.push({ action: 'waitForLoadState', state: 'networkidle' });
        if (!s.expected.toLowerCase().includes('should not')) {
          steps.push({ action: 'assertURL', url: hash, note: s.expected });
        }
        break;
      }
    }
  }

  return {
    id: `TC_${tc.id.padStart(3, '0')}`,
    name: tc.name,
    url: startUrl,
    description: tc.description,
    tags: ['settings', 'regression'],
    steps
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const inputFile = path.resolve('manualtestcasedoc/parsed_testcases.json');
  const testcases: ManualTC[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  const recordedDir = path.resolve('src/recorded');
  const specDir     = path.resolve('src/tests/recorded');
  fs.mkdirSync(recordedDir, { recursive: true });
  fs.mkdirSync(specDir,     { recursive: true });

  console.log(`\nGenerating from ${testcases.length} test cases in xlsx...\n`);

  for (const tc of testcases) {
    const fileId = `TC_${tc.id.padStart(3, '0')}_${tc.name}`;

    // Recorded JSON
    const recJson  = generateRecordedJson(tc);
    const recFile  = path.join(recordedDir, `${fileId}.json`);
    fs.writeFileSync(recFile, JSON.stringify(recJson, null, 2), 'utf-8');
    console.log(`  ✔ Recorded JSON : ${recFile}`);

    // Playwright spec
    const specCode = generateSpec(tc);
    const specFile = path.join(specDir, `TC${tc.id}_${tc.name}.spec.ts`);
    fs.writeFileSync(specFile, specCode, 'utf-8');
    console.log(`  ✔ Spec          : ${specFile}`);
  }

  console.log('\nDone. Run: npx playwright test src/tests/recorded/ --reporter=list\n');
}

main();
