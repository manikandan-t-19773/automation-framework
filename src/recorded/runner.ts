/**
 * Recorded Test Runner
 * Usage:  npx ts-node src/recorded/runner.ts <path-to-recorded.json>
 *         npx ts-node src/recorded/runner.ts src/recorded/TC_001_create_flow.json
 *
 * Converts a recorded JSON test case into a Playwright spec and runs it.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  action: string;
  selector?: string;
  role?: string;
  name?: string;
  text?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  value?: string;
  key?: string;
  url?: string;
  timeout?: number;
  state?: string;
  path?: string;
  note?: string;
  // ── DragAndDrop specific ──────────────────────────────────────────────────
  source?: string;       // CSS selector for the draggable element
  target?: string;       // CSS selector for the drop target
  dropPosition?: { x: number; y: number }; // optional offset from target top-left
  waitTime?: number;     // ms to hold before releasing (default 3000)
}

interface RecordedTest {
  id: string;
  name: string;
  url: string;
  description?: string;
  tags?: string[];
  steps: Step[];
}

// ─── Locator builder ─────────────────────────────────────────────────────────

function buildLocator(step: Step): string {
  if (step.testId)      return `page.getByTestId(${JSON.stringify(step.testId)})`;
  if (step.label)       return `page.getByLabel(${JSON.stringify(step.label)})`;
  if (step.placeholder) return `page.getByPlaceholder(${JSON.stringify(step.placeholder)})`;
  if (step.role && step.name)
    return `page.getByRole(${JSON.stringify(step.role)}, { name: ${JSON.stringify(step.name)} })`;
  if (step.role)        return `page.getByRole(${JSON.stringify(step.role)})`;
  if (step.text)        return `page.getByText(${JSON.stringify(step.text)})`;
  if (step.selector)    return `page.locator(${JSON.stringify(step.selector)})`;
  return `page.locator('body')`;
}

// ─── Step → Playwright code ───────────────────────────────────────────────────

function stepToCode(step: Step, idx: number): string {
  const note = step.note ? `  // Step ${idx + 1}: ${step.note}\n` : `  // Step ${idx + 1}\n`;
  const loc  = buildLocator(step);
  const val  = JSON.stringify(step.value ?? '');
  const ms   = step.timeout ?? 5000;
  const url  = JSON.stringify(step.url ?? '');

  switch (step.action) {
    // ── Navigation ──────────────────────────────────────────────────────────
    case 'navigate':
      return `${note}  await page.goto(${url});`;
    case 'waitForLoadState':
      return `${note}  await page.waitForLoadState(${JSON.stringify(step.state ?? 'networkidle')});`;
    case 'waitForURL':
      return `${note}  await page.waitForURL(new RegExp(${JSON.stringify(escapeRegex(step.url ?? ''))}), { timeout: ${ms} });`;
    case 'waitForSelector':
      return `${note}  await ${loc}.waitFor({ state: 'visible', timeout: ${ms} });`;
    case 'waitForTimeout':
      return `${note}  await page.waitForTimeout(${ms});`;
    case 'scrollTo':
      return `${note}  await ${loc}.scrollIntoViewIfNeeded();`;

    // ── Interactions ─────────────────────────────────────────────────────────
    case 'click':
      return `${note}  await ${loc}.click();`;
    case 'fill':
      return `${note}  await ${loc}.fill(${val});`;
    case 'clear':
      return `${note}  await ${loc}.clear();`;
    case 'press':
      return `${note}  await ${loc}.press(${JSON.stringify(step.key ?? 'Enter')});`;
    case 'hover':
      return `${note}  await ${loc}.hover();`;
    case 'check':
      return `${note}  await ${loc}.check();`;
    case 'uncheck':
      return `${note}  await ${loc}.uncheck();`;
    case 'select':
      return `${note}  await ${loc}.selectOption(${val});`;
    case 'upload':
      return `${note}  await ${loc}.setInputFiles(${JSON.stringify(step.path ?? '')});`;

    // ── Assertions ───────────────────────────────────────────────────────────
    case 'assertVisible':
      return `${note}  await expect(${loc}).toBeVisible();`;
    case 'assertHidden':
      return `${note}  await expect(${loc}).toBeHidden();`;
    case 'assertEnabled':
      return `${note}  await expect(${loc}).toBeEnabled();`;
    case 'assertDisabled':
      return `${note}  await expect(${loc}).toBeDisabled();`;
    case 'assertText':
      return `${note}  await expect(${loc}).toHaveText(${val});`;
    case 'assertValue':
      return `${note}  await expect(${loc}).toHaveValue(${val});`;
    case 'assertCount':
      return `${note}  await expect(${loc}).toHaveCount(${Number(step.value ?? 1)});`;
    case 'assertURL':
      return `${note}  await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegex(step.url ?? ''))}));`;
    case 'assertTitle':
      return `${note}  await expect(page).toHaveTitle(new RegExp(${JSON.stringify(escapeRegex(step.value ?? ''))}, 'i'));`;

    // ── Misc ─────────────────────────────────────────────────────────────────
    case 'screenshot':
      return `${note}  await page.screenshot({ path: ${JSON.stringify(step.path ?? `test-results/screenshot-${idx}.png`)}, fullPage: true });`;

    // ── Drag and Drop — delegates to DragHelper ───────────────────────────
    case 'dragAndDrop': {
      const src = JSON.stringify(step.source ?? step.selector ?? 'body');
      const tgt = JSON.stringify(step.target ?? 'body');
      const dropPos = step.dropPosition
        ? `, { x: ${step.dropPosition.x}, y: ${step.dropPosition.y} }`
        : '';
      const wait = step.waitTime ? `, ${step.waitTime}` : '';
      return `${note}  await dragHelper.dragAndDrop(${src}, ${tgt}${dropPos}${wait});`;
    }

    default:
      return `${note}  // [SKIPPED] unknown action: ${step.action}`;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Generate spec file ───────────────────────────────────────────────────────

function generateSpec(recorded: RecordedTest): string {
  const tags = recorded.tags?.length
    ? `  // Tags: ${recorded.tags.join(', ')}\n`
    : '';
  const desc = recorded.description
    ? `  // ${recorded.description}\n`
    : '';

  const useDnd = recorded.steps.some(s => s.action === 'dragAndDrop');
  const dndImport = useDnd ? `import { DragHelper } from '../helpers/dragHelper';\n` : '';
  const dndInit   = useDnd ? `    const dragHelper = new DragHelper(page);\n\n` : '';

  const stepLines = recorded.steps
    .map((step, idx) => stepToCode(step, idx))
    .join('\n\n');

  return `import { test, expect } from '@playwright/test';
${dndImport}
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('[${recorded.id}] ${recorded.name}', () => {
${tags}${desc}
  test.beforeEach(async ({ page }) => {
    await page.goto(${JSON.stringify(recorded.url)});
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('${recorded.name}', async ({ page }) => {
${dndInit}${stepLines}
  });
});
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('\nUsage: npx ts-node src/recorded/runner.ts <path-to-recorded.json>\n');
    console.error('Example: npx ts-node src/recorded/runner.ts src/recorded/TC_001_create_flow.json\n');
    process.exit(1);
  }

  const absInput = path.resolve(inputFile);
  if (!fs.existsSync(absInput)) {
    console.error(`File not found: ${absInput}`);
    process.exit(1);
  }

  const recorded: RecordedTest = JSON.parse(fs.readFileSync(absInput, 'utf-8'));
  console.log(`\n✔ Loaded: [${recorded.id}] ${recorded.name}`);
  console.log(`  URL   : ${recorded.url}`);
  console.log(`  Steps : ${recorded.steps.length}`);

  // Write spec
  const outDir = path.resolve('src/tests/recorded');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${recorded.id}.spec.ts`);
  const spec = generateSpec(recorded);
  fs.writeFileSync(outFile, spec, 'utf-8');
  console.log(`✔ Spec written: ${outFile}\n`);
  console.log('─'.repeat(60));
  console.log(spec);
  console.log('─'.repeat(60));

  // Run via playwright
  const { execSync } = require('child_process');
  const specRelative = path.relative(process.cwd(), outFile);
  const cmd = `npx playwright test ${specRelative} --reporter=list`;
  console.log(`\n▶ Running: ${cmd}\n`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

main();
