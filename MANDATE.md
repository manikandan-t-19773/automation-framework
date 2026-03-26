# Playwright Automation Framework — Mandate & Reference Guide

> **Project:** Zoho Flow UI Automation
> **Target:** https://flow.localzoho.com
> **Stack:** Playwright 1.58.2 · TypeScript · Chrome (system) · openpyxl
> **Last Updated:** 26 March 2026 (reliability layer, RetryFromStartError, 2-min timeouts)

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Setup & Prerequisites](#2-setup--prerequisites)
3. [Authentication](#3-authentication)
4. [Running Tests](#4-running-tests)
5. [Reliability Layer — Retry & Recovery](#5-reliability-layer--retry--recovery)
6. [Adding New Test Cases (xlsx Pipeline)](#6-adding-new-test-cases-xlsx-pipeline)
7. [xlsx Column Reference](#7-xlsx-column-reference)
8. [Step Description Keywords](#8-step-description-keywords)
9. [Helper Classes](#9-helper-classes)
10. [Key Selectors](#10-key-selectors)
11. [playwright.config.ts Reference](#11-playwrightconfigts-reference)
12. [Known Issues & Fixes Applied](#12-known-issues--fixes-applied)
13. [Reports](#13-reports)
14. [Coding Conventions](#14-coding-conventions)

---

## 1. Project Structure

```
automation-framework/
├── src/
│   ├── helpers/
│   │   ├── dragHelper.ts          # jQuery UI drag-and-drop (raw mouse events)
│   │   ├── flowHelper.ts          # ⭐ Shared flow-creation helper (all TCs use this)
│   │   ├── pageGuard.ts           # SSL/white-screen detection + RetryFromStartError
│   │   └── axeHelper.ts           # Accessibility helper
│   │
│   ├── fixtures/
│   │   └── base.ts                # ⭐ Custom test fixture — patches page.goto(), pre-test guard
│   │
│   ├── tests/
│   │   ├── recorded/
│   │   │   ├── TC1_SETTINGS_ELEMENTS.spec.ts          # FAILING correctly (History IS accessible)
│   │   │   ├── TC2_CreateSchedulerFlow.spec.ts        # ✅ PASSING
│   │   │   └── TC2_CreateSchedulerFlow_RECORDED.spec.ts  # reference only (codegen output)
│   │   ├── generated/             # AI-generated specs (22 pages — baseline coverage)
│   │   └── auth.setup.ts          # Skips login if playwright/.auth/user.json exists
│   │
│   ├── recorded/
│   │   ├── xlsx_to_spec.ts        # Converts parsed_testcases.json → spec files
│   │   ├── runner.ts              # JSON-based recording runner
│   │   └── templates/schema.json  # Recording schema
│   │
│   └── dom-snapshots/             # 22 aria DOM snapshots (one per page)
│
├── manualtestcasedoc/
│   ├── Settings_standalone.xlsx   # ⭐ SOURCE OF TRUTH — add new TCs here
│   ├── parse_xlsx.py              # xlsx → parsed_testcases.json
│   └── parsed_testcases.json      # intermediate JSON (auto-generated, do not edit)
│
├── playwright/.auth/
│   └── user.json                  # 31 cookies, 2 origins (auto-created by auth.setup.ts)
│
├── playwright-report/             # HTML report output (index.html + trace data)
├── test-results/                  # Raw trace.zip + video + screenshots per test
├── playwright.config.ts           # Main config (retries:2, 10-min timeout, 2-min step timeout)
├── MANDATE.md                     # This file
└── session-report/index.html      # One-time session summary HTML
```

---

## 2. Setup & Prerequisites

### Requirements

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | 20.x | Runtime |
| npm | 10.x | Package manager |
| Python | 3.x | xlsx parsing |
| openpyxl | latest | xlsx parsing library |
| Google Chrome (system) | any | mTLS / Zoho SSO |
| Playwright | 1.58.2 | Test framework |

### First-time install

```bash
npm install
pip3 install openpyxl
npx playwright install
```

### Environment

```bash
cp .env.example .env   # if exists — sets BASE_URL
```

The `playwright.config.ts` reads `process.env.BASE_URL` (defaults to `https://flow.localzoho.com`).

---

## 3. Authentication

Zoho Flow uses **mTLS + SSO** which requires the system Chrome instance (not Playwright's bundled Chromium).

### How it works

1. `src/tests/auth.setup.ts` runs before any test.
2. If `playwright/.auth/user.json` **already exists**, login is **skipped** (reuses session).
3. If the file is missing, auth.setup.ts performs the SSO login and saves cookies.
4. All test specs use `storageState: 'playwright/.auth/user.json'`.

### Reset auth

```bash
rm playwright/.auth/user.json
npx playwright test --project=setup   # re-authenticate only
```

### Critical config required for auth to work

```typescript
// playwright.config.ts
channel: 'chrome',                              // uses macOS keychain for mTLS
ignoreHTTPSErrors: true,                        // bypasses self-signed cert
launchOptions: { args: ['--ignore-certificate-errors'] }
```

> ⚠️ **Never** use the default chromium browser for this project — it cannot handle mTLS certificates.

---

## 4. Running Tests

### Run all recorded test cases

```bash
npx playwright test src/tests/recorded/ --reporter=html
```

### Run a specific test case

```bash
npx playwright test src/tests/recorded/TC1_SETTINGS_ELEMENTS.spec.ts
npx playwright test src/tests/recorded/TC2_CreateSchedulerFlow.spec.ts
```

### Run with visible browser (debug)

```bash
npx playwright test --headed
```

### Run with Playwright Inspector (step through)

```bash
PWDEBUG=1 npx playwright test src/tests/recorded/TC2_CreateSchedulerFlow.spec.ts
```

### Open results report

```bash
npx playwright show-report          # serves at http://localhost:9323
```

### Record a new test with codegen

```bash
npx playwright codegen \
  --channel chrome \
  --load-storage playwright/.auth/user.json \
  --save-storage playwright/.auth/user.json \
  --ignore-https-errors \
  -o src/tests/recorded/TC_NEW_RECORDED.spec.ts \
  "https://flow.localzoho.com/#/workspace/default/flows"
```

> ℹ️ Drag-and-drop is **not captured** by codegen. After recording, replace drag steps with `flow.dragActionToCanvas()`.

---

## 5. Reliability Layer — Retry & Recovery

This section explains how the framework automatically recovers from transient failures.

### Decision flow

```
Test step fails
       │
       ├─ Attempt 1 or 2? ──YES──► Playwright retries from Step 1 (full restart)
       │
       └─ Attempt 3 (all retries exhausted)?
                 │
                 └──► Test FAILED — trace + video + screenshot saved → debug manually
                      Run: npx playwright show-report
```

```
SSL error / white screen detected
       │
       ├─ PageGuard reloads once
       │       ├─ Recovered? ──YES──► continues normally
       │       └─ Still broken? ──► throws RetryFromStartError ──► Playwright restart
       │
       └─ base.ts beforeEach pre-checks page before every attempt (including retries)
```

### Timeout values — all set to 2 minutes

| Setting | Value | Scope |
|---|---|---|
| `test.setTimeout` | 600 000 ms (10 min) | Per entire test |
| `expect.timeout` | 120 000 ms (2 min) | Per assertion |
| `actionTimeout` | 120 000 ms (2 min) | Per click/fill/etc. |
| `navigationTimeout` | 120 000 ms (2 min) | Per page navigation |
| `waitFor` timeout | 120 000 ms (2 min) | Per element wait |

### RetryFromStartError (`src/helpers/pageGuard.ts`)

```typescript
export class RetryFromStartError extends Error {
  constructor(reason: string) {
    super(`[RETRY_FROM_START] ${reason}`);
    this.name = 'RetryFromStartError';
  }
}
```

- Thrown by `PageGuard.safeGoto()` after 3 reload attempts fail
- Thrown by `PageGuard.withGuard()` after 2 internal reload attempts fail
- Playwright treats any thrown error as a test failure and triggers the retry pathway

### Pre-test guard (`src/fixtures/base.ts`)

Before every test attempt (including retries), `beforeEach` runs:

```typescript
const preIssue = await guard.detectIssue().catch(() => 'DETECT_FAILED');
if (preIssue) {
  await page.reload();
  const afterReload = await guard.detectIssue().catch(() => 'DETECT_FAILED');
  if (afterReload) throw new RetryFromStartError(`pre-test guard: ${afterReload}`);
}
```

### `retries: 2` in playwright.config.ts

```
retries: 2  →  3 total attempts per test
```

Each retry runs the **complete test from Step 1** — no partial resume.

### What gets saved when a test fails all retries

- `test-results/<test>/trace.zip` — full DOM timeline, open with `npx playwright show-trace`
- `test-results/<test>/video.webm` — screen recording
- `test-results/<test>/screenshot.png` — final screenshot

---

## 6. Adding New Test Cases (xlsx Pipeline)

This is the standard workflow for all new test cases:

```
Settings_standalone.xlsx
        │
        ▼  (Step 1)
python3 manualtestcasedoc/parse_xlsx.py
        │  → manualtestcasedoc/parsed_testcases.json
        ▼  (Step 2)
npx ts-node src/recorded/xlsx_to_spec.ts
        │  → src/tests/recorded/TC<n>_<Name>.spec.ts
        ▼  (Step 3)
npx playwright test src/tests/recorded/TC<n>_*.spec.ts
```

### Step-by-step

1. Open `manualtestcasedoc/Settings_standalone.xlsx`
2. Add a **TestCase** row (Column D = `TestCase`):
   - Col A: next S.No (e.g. `3`)
   - Col B: Test Case Name (e.g. `CreateWebhookFlow`)
   - Col C: Test Case Description (e.g. `Create webhook triggered flow with Slack action`)
3. Add **TestStep** rows below (Column D = `TestStep`):
   - Col E: `Step1`, `Step2`, …
   - Col F: Step Description (see [Section 8](#8-step-description-keywords) for keywords)
   - Col G: Expected Result (what should be visible/true after this step — **drives assertions**)
4. Save the xlsx file
5. Run the pipeline:

```bash
python3 manualtestcasedoc/parse_xlsx.py
npx ts-node src/recorded/xlsx_to_spec.ts
npx playwright test src/tests/recorded/TC3_CreateWebhookFlow.spec.ts
```

### What gets auto-generated for flow-creation TCs

- `import { test, expect } from '../../fixtures/base'` (NOT from `@playwright/test`)
- `import { FlowHelper }` from the shared helper
- `let flowName = ''` variable scoped to the describe block
- `test.setTimeout(600_000)` at the top of the test body
- `test.afterEach` that calls `flow.deleteFlow(flowName)` to clean up
- Each step maps to a `flow.xxx()` method call (thin, readable code)

---

## 7. xlsx Column Reference

| Column | Letter | Parsed Field | Usage |
|---|---|---|---|
| S.No | A | `id` | TC number — prefixes file and describe block (`TC2`) |
| Test Case Name | B | `name` | `test.describe('[TC2] Name')` block title |
| Test Case Description | C | `description` | `test('description...')` test title |
| Type | D | *(internal)* | `TestCase` or `TestStep` — determines row type |
| Step | E | `step` | Label only (Step1, Step2…) |
| **Step Description** ⭐ | **F** | `description` | **Primary driver** — determines which Playwright action is generated |
| **Expected Result** ⭐ | **G** | `expected` | Used for assertions — fill this accurately for every step |
| Remarks | H | `remarks` | Stored in JSON, available for custom logic |
| Automation Status | I | `auto_status` | Stored, not yet used in generation |
| Locator | J | `locator` | Stored, available for override logic |

> ⭐ **Most important columns**: F (drives action generation) and G (drives assertions).
>
> **Assertion logic**: if Col G contains `should not be displayed` / `should not be visible` the assertion becomes `not.toBeVisible()`. If it contains `should be checked` it becomes assertion on `toBeChecked()`. If it contains `should not be checked` it becomes `not.toBeChecked()`. All other non-empty values become `toBeVisible()`.

---

## 8. Step Description Keywords

The generator (`xlsx_to_spec.ts`) reads Column F and pattern-matches on these keywords.
**Be consistent** — use these exact phrases.

### Flow creation keywords

| Column F text | Generated code |
|---|---|
| `click create flow` / `create a new flow` | `flow.createFlow('basename')` |
| `configure schedule` / `configure button` (schedule TC) | `flow.configureScheduleTrigger()` |
| `configure webhook` | `flow.configureWebhookTrigger()` |
| `search icon` / `click search` | triggers sidebar search click |
| `search slack` / `search appname` | `flow.searchSidebarApp('slack')` |
| `drag and drop` / `draganddrop` | `flow.dragActionToCanvas(actionName, triggerLabel)` |
| `choose connection` / `connection field` | `flow.pickDropdownItem('Choose Connection')` |
| `message field` | `flow.fillActionField('text', 'test')` |
| `to field` / `choose to` / `select 1st option` | `flow.pickDropdownItem('Choose To')` |
| `done button` / `click done button` | `flow.clickDone()` |
| `apply button` / `click apply button` | `flow.clickApply()` |
| `switch on` / `swith on` / `turn on` | `flow.toggleFlowOn()` |

### For drag-and-drop steps — quote action and trigger names

```
Column F:  drag and drop "Send direct message" on to "Schedule Once"
```

The generator extracts the quoted strings as `actionName` and `triggerLabel`.

### Settings navigation keywords (TC1 style)

| Column F text | Generated code |
|---|---|
| `click settings` / `settings menu` | `page.getByRole('link', { name: 'Settings' }).click()` |
| `history` | navigate to history page + assertURL |
| `connections` | navigate to connections page + assertURL |
| `members` | navigate to members/users page + assertURL |
| `billing` | navigate to billing page + assertURL |

---

## 9. Helper Classes

### `FlowHelper` — `src/helpers/flowHelper.ts`

**Central helper for all flow-creation test cases.** Fix selectors here once — all TCs pick it up.

```typescript
const flow = new FlowHelper(page);
```

| Method | Signature | What it does |
|---|---|---|
| `createFlow` | `(baseName?: string): Promise<string>` | Navigate → Create Flow dialog → fill name → Create → waitForURL. Returns flow name used. |
| `configureScheduleTrigger` | `(): Promise<void>` | Configure → Frequency=Once → Date=26 → –3 minutes → Apply → Done |
| `configureWebhookTrigger` | `(): Promise<void>` | Configure Webhook → Done |
| `configureAppTrigger` | `(app, event, connection?): Promise<void>` | Configure app-based trigger with event + connection selection |
| `searchSidebarApp` | `(appName: string): Promise<void>` | Types in the action sidebar search box |
| `getSidebarActionItem` | `(actionName: string): Promise<Locator>` | Returns inner action `<li>` (double-filter: has text + hasNot h4) |
| `dragActionToCanvas` | `(action, trigger, offsetY?): Promise<void>` | Stamps data-dnd → derives drop coords from trigger bbox → DragHelper |
| `pickDropdownItem` | `(placeholder, itemText?): Promise<void>` | Clicks dropdown → evaluate() walks DOM → clicks first/matched item |
| `fillActionField` | `(name, value): Promise<void>` | Fills `textarea[name]` or `input[name]` in action config panel |
| `clickDone` | `(): Promise<void>` | Clicks Done button |
| `clickApply` | `(): Promise<void>` | Clicks Apply button |
| `toggleFlowOn` | `(): Promise<void>` | evaluate() walks to cursor:pointer parent of hidden switch input → click |
| `deleteFlow` | `(flowName: string): Promise<void>` | Hover card → kebab → Delete → confirm (use in afterEach) |

### `DragHelper` — `src/helpers/dragHelper.ts`

**jQuery UI compatible drag** using raw `mouse.down → mouse.move → mouse.up`.

> ⚠️ Playwright's built-in `dragTo()` fires HTML5 DnD events which do **not** work with jQuery UI. Always use `DragHelper`.

```typescript
const drag = new DragHelper(page);

// With auto-computed target from element bbox
await drag.dragAndDrop('[data-dnd="src"]', '[data-dnd="tgt"]');

// With explicit absolute viewport coordinates (recommended for canvas drops)
await drag.dragAndDrop('[data-dnd="src"]', '', { x: dropX, y: dropY });
```

**Critical pattern for canvas drops:**

```typescript
// The "Drop here" zone is often outside the viewport — derive position from trigger bbox
const triggerBox = await page.getByRole('textbox', { name: 'Schedule Once' }).boundingBox();
const dropX = triggerBox!.x + triggerBox!.width / 2;
const dropY = triggerBox!.y + triggerBox!.height + 200;   // 200px below trigger bottom
await drag.dragAndDrop(srcSel, '', { x: dropX, y: dropY });
```

### `PageGuard` — `src/helpers/pageGuard.ts`

Detects and recovers from SSL errors and white-screen states.

```typescript
const guard = new PageGuard(page);

// Safe navigation with retry logic
await guard.safeGoto('https://flow.localzoho.com/#/...');

// Guard a block — retries on transient issues
await guard.withGuard(async () => {
  // your page interactions here
});

// Detect issue manually
const issue = await guard.detectIssue();  // null = OK; string = issue description
```

- `detectIssue()` checks for: empty body, `ERR_CERT_*`, `ERR_CONNECTION_*`, white screen
- `safeGoto()` → 3 reload attempts before throwing `RetryFromStartError`
- `withGuard()` → 2 reload attempts before throwing `RetryFromStartError`
- `RetryFromStartError` is caught by Playwright's retry mechanism and restarts the test from Step 1

### `base.ts` fixture — `src/fixtures/base.ts`

**All spec files MUST import from this fixture, not from `@playwright/test`.**

```typescript
import { test, expect } from '../../fixtures/base';
```

What the base fixture adds on top of vanilla Playwright:
- Patches `page.goto()` to use `PageGuard.safeGoto()` — SSL/white-screen safe
- `beforeEach`: runs pre-test guard check (reloads once if page is broken; throws `RetryFromStartError` if still broken after reload)
- `requestfailed` listener: logs network failures to console (visible in trace)

---

## 10. Key Selectors

These are the working selectors discovered during testing. Use these verbatim.

### Flows list page

```typescript
page.getByRole('button', { name: 'Create Flow' })
page.getByRole('textbox', { name: 'E.g. Zoho Desk to Zoho CRM' })  // flow name input
page.getByRole('button', { name: 'Create' })                         // submit dialog
```

### Flow builder — configure trigger

```typescript
// Schedule trigger Configure button (NOT the App configure button)
page.getByRole('listitem')
    .filter({ hasText: 'Schedule Triggers a one-time' })
    .locator('#continue')

page.getByRole('textbox', { name: 'Choose Frequency' })        // frequency dropdown
page.getByRole('listitem').filter({ hasText: 'Once' })          // pick Once
page.getByRole('textbox', { name: 'Start Date' })               // date picker
page.getByRole('button', { name: '26' })                        // pick day 26
'.minutes > .zf-relative > .zf-i-arrows > .zf-icon-down-arrow.zf-top'  // minutes ↓
page.getByRole('button', { name: 'Apply' })
page.getByRole('button', { name: 'Done' })
```

### Sidebar search

```typescript
page.getByRole('textbox', { name: 'Search apps, actions, or logic' })
```

### Sidebar action item (inner `<li>`, not outer app section)

```typescript
// Double filter: has the text AND has no <h4> (outer app section has <h4>; inner action li doesn't)
page.locator('li')
    .filter({ has: page.getByText('Send direct message', { exact: true }) })
    .filter({ hasNot: page.locator('h4') })
    .first()
```

### Canvas trigger node (for drag drop coordinate derivation)

```typescript
page.getByRole('textbox', { name: 'Schedule Once' })  // → use .boundingBox()
```

### Action config panel — Choose Connection dropdown

```typescript
// Ember dropdown — must use evaluate() to walk DOM
await page.evaluate(({ placeholder }) => {
  const input = [...document.querySelectorAll('input,[role="textbox"]')]
    .find((el: any) => el.placeholder === placeholder || el.getAttribute('aria-label') === placeholder);
  if (!input) return;
  const dropdown = (input as Element).closest('div')!.nextElementSibling;
  if (dropdown) (dropdown.querySelector('li,[role="listitem"]') as HTMLElement)?.click();
}, { placeholder: 'Choose Connection' });
```

### Action config panel — Choose To field

```typescript
page.getByRole('textbox', { name: /choose to/i })
// Then click via evaluate() same pattern as Choose Connection
```

### Toggle ON switch

```typescript
// Hidden <input type="checkbox"> — must click cursor:pointer parent
await page.evaluate(() => {
  const input = document.querySelector('input[name="switch"]') as HTMLElement;
  let el: HTMLElement | null = input?.parentElement ?? null;
  while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;
  (el ?? input)?.click();
});
```

### Settings page headings

```typescript
page.getByRole('heading', { name: 'GENERAL' })
page.getByRole('heading', { name: 'FLOW SETUP' })
page.getByRole('heading', { name: 'MONITORING' })
page.getByRole('heading', { name: 'AI' })
page.getByRole('heading', { name: 'SECURITY & COMPLIANCE' })
```

---

## 11. playwright.config.ts Reference

```typescript
export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  workers: 2,
  retries: 2,                               // 3 total attempts; each restarts from Step 1
  timeout: 600_000,                         // 10 min per test
  expect: { timeout: 120_000 },             // 2 min per assertion
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://flow.localzoho.com',
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    ignoreHTTPSErrors: true,
    actionTimeout: 120_000,                 // 2 min per click/fill/etc.
    navigationTimeout: 120_000,             // 2 min per navigation
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        channel: 'chrome',                  // ← REQUIRED for mTLS
        ignoreHTTPSErrors: true,
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',                  // ← REQUIRED for mTLS
        storageState: 'playwright/.auth/user.json',
        viewport: { width: 1280, height: 900 },  // ← 900px keeps canvas in viewport
        ignoreHTTPSErrors: true,
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
      dependencies: ['setup'],
    },
  ],
});
```

### Why `viewport: { width: 1280, height: 900 }`

The default `Desktop Chrome` viewport is `1280×720`. Zoho Flow's canvas drop zone renders at approximately `y = 720–740 px`, which is at or below the fold. Dropping onto an off-screen element silently fails. The `900px` height keeps the drop zone visible.

### Why `retries: 2`

Transient network failures, SSL renegotiations, and Zoho SPA initialization delays can cause otherwise-correct tests to fail. `retries: 2` gives 3 total attempts; each attempt restarts from Step 1 with a fresh page, which prevents partial-state issues.

---

## 12. Known Issues & Fixes Applied

| # | Issue | Root Cause | Fix Applied |
|---|---|---|---|
| 1 | `ERR_CERT_COMMON_NAME_INVALID` | Self-signed cert | `ignoreHTTPSErrors: true` |
| 2 | `ERR_BAD_SSL_CLIENT_AUTH_CERT` | mTLS client cert | `channel: 'chrome'` (macOS keychain) |
| 3 | Only 3 pages found by crawler | JS SPA — no URL change on nav | Click-based crawler in `run.ts` |
| 4 | Regex `//` comment bug | Literal `//` in regex | Replaced with `new RegExp()` |
| 5 | `modal-background` intercepting clicks | Overlay div blocks Configure | Added `waitForSelector` for overlay detach |
| 6 | Wrong Configure button clicked | App Configure matched instead of Schedule | `filter({ hasText:'Schedule Triggers a one-time' }).locator('#continue')` |
| 7 | Frequency dropdown not working | Custom Ember select component | `getByRole('textbox', { name:'Choose Frequency' })` |
| 8 | `waitForURL` crash | Passed URL object, not callback | `url => url.href.includes(flowName)` |
| 9 | Drag source matched wrong element | `filter({ hasText })` matched outer Slack `<li>` | Double filter: has text + hasNot `h4` |
| 10 | **Drop zone off-screen (key fix)** | "Drop here" span at `y ≥ viewport height` | Derive coords from trigger bbox: `triggerBox.y + height + 200` |
| 11 | Connection dropdown selected nav item | `getByRole('listitem').first()` hit nav | `evaluate()` walks DOM to adjacent dropdown |
| 12 | Toggle ON click failed | CSS-hidden `<input type=checkbox>` | `evaluate()` to cursor:pointer ancestor |
| 13 | Setup project mTLS error | Setup project missing `channel:'chrome'` | Added `channel:'chrome'` to setup project |
| 14 | TC2 `srcTagged` empty string crash | `dragActionToCanvas` called `DragHelper.dragAndDrop` with `targetLocator: ''` without `dropPosition` | Pass explicit `{ x: 715, y: 434 }` as `dropPosition` — never rely on `targetLocator` for canvas drops |
| 15 | TC2 Step 13 (Choose Connection) assertion wrong | Column G expected result was ignored | Assertion logic now reads Col G: `should not be checked` → `not.toBeChecked()` |
| 16 | TC2 Step 14 (Choose To) selector failed | `getByRole('listitem')` matched nav | Use `getByRole('textbox', { name: /choose to/i })` + evaluate click |
| 17 | TC2 Step 16 (Toggle) wrong assertion | Toggle asserted `toBeChecked()` but Col G says `should not be checked` | Fixed to `not.toBeChecked({ timeout: 120_000 })` |
| 18 | White screen / SSL on fast retry | No pre-test guard in prior framework | `base.ts` `beforeEach` detects + reloads; throws `RetryFromStartError` if still broken |
| 19 | Step timeout too short (8 s) | Default `waitFor` timeouts | All `waitFor` timeouts set to `120_000` ms |
| 20 | Test fails at step N then resumes at N+1 | Playwright default incremental retry | `retries: 2` — each retry restarts from Step 1 |
| 21 | TypeScript error in drag evaluate callback | `var node = el` implicit `any` | Typed as `var node: any = el` |
| 22 | Generated specs imported from `@playwright/test` | `xlsx_to_spec.ts` template used wrong import | Template updated to `import { test, expect } from '../../fixtures/base'` |

---

## 13. Reports

### Generate + view

```bash
npx playwright test src/tests/recorded/ --reporter=html
npx playwright show-report           # → http://localhost:9323
```

### View a trace file

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Export as zip (for sharing)

```bash
zip -r reports/playwright-report-$(date +%Y%m%d_%H%M%S).zip playwright-report/ test-results/
```

### To view on another machine

```bash
unzip playwright-report-20260326.zip
npx playwright show-report playwright-report/
```

### What's in the report

- **index.html** — interactive test results with pass/fail per step
- **data/*.zip** — per-test Playwright trace (step-by-step DOM timeline)
- **data/*.webm** — screen recording for each test
- **data/*.png** — final screenshot per test

---

## 14. Coding Conventions

### Spec file naming

```
TC<n>_<PascalCaseName>.spec.ts
```

Examples: `TC1_SETTINGS_ELEMENTS.spec.ts`, `TC3_CreateWebhookFlow.spec.ts`

### ALWAYS import from the base fixture

```typescript
// ✅ CORRECT — uses patched page.goto() + pre-test guard
import { test, expect } from '../../fixtures/base';

// ❌ WRONG — bypasses PageGuard, no SSL recovery, no pre-test check
import { test, expect } from '@playwright/test';
```

### Generated spec structure (flow TCs)

```typescript
import { test, expect } from '../../fixtures/base';
import { FlowHelper } from '../../helpers/flowHelper';

test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('[TC3] CreateWebhookFlow', () => {
  let flowName = '';

  test.afterEach(async ({ page }) => {
    if (flowName) {
      const flow = new FlowHelper(page);
      await flow.deleteFlow(flowName);
    }
  });

  test('Create webhook triggered flow with Slack action', async ({ page }) => {
    test.setTimeout(600_000);
    const flow = new FlowHelper(page);
    flowName = await flow.createFlow('webhookflow');
    await flow.configureWebhookTrigger();
    await flow.searchSidebarApp('slack');
    await flow.dragActionToCanvas('Send direct message', 'Webhook');
    await flow.pickDropdownItem('Choose Connection');
    await flow.fillActionField('text', 'test');
    await flow.pickDropdownItem('Choose To');
    await flow.clickDone();
    await flow.toggleFlowOn();
  });
});
```

### Do not

- ❌ Use `page.waitForTimeout()` — use `waitFor` with `timeout: 120_000` instead
- ❌ Use `page.locator('li').first()` for dropdowns — always scope to the adjacent container
- ❌ Use Playwright's `dragTo()` for Zoho Flow — it fires HTML5 DnD events, not jQuery UI events
- ❌ Commit `playwright/.auth/user.json` to git (contains session cookies — in `.gitignore`)
- ❌ Hard-code drop coordinates — derive from trigger node `boundingBox()` + offset
- ❌ Leave `targetLocator` as `''` in `DragHelper.dragAndDrop` — always pass `dropPosition` for canvas drops
- ❌ Import `test` / `expect` from `@playwright/test` in spec files

### Do

- ✅ Always import `test, expect` from `../../fixtures/base`
- ✅ Always call `test.setTimeout(600_000)` at the top of every test body
- ✅ Use `FlowHelper` for any flow-creation step
- ✅ Add new trigger/action types as methods to `FlowHelper`
- ✅ Derive canvas drop coordinates from trigger node `boundingBox()`
- ✅ Use `evaluate()` for interactions with hidden/custom Ember components
- ✅ Add `test.afterEach` with `flow.deleteFlow(flowName)` in all flow-creation TCs
- ✅ Fill Col G (Expected Result) accurately in xlsx — it directly drives assertion logic

---

*Maintained by the automation team. Update this file whenever new patterns, selectors, helpers, or reliability fixes are added.*
