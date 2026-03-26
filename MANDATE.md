# Playwright Automation Framework — Mandate & Reference Guide

> **Project:** Zoho Flow UI Automation  
> **Target:** https://flow.localzoho.com  
> **Stack:** Playwright 1.58.2 · TypeScript · Chrome (system) · openpyxl  
> **Last Updated:** 26 March 2026

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Setup & Prerequisites](#2-setup--prerequisites)
3. [Authentication](#3-authentication)
4. [Running Tests](#4-running-tests)
5. [Adding New Test Cases (xlsx Pipeline)](#5-adding-new-test-cases-xlsx-pipeline)
6. [xlsx Column Reference](#6-xlsx-column-reference)
7. [Step Description Keywords](#7-step-description-keywords)
8. [Helper Classes](#8-helper-classes)
9. [Key Selectors](#9-key-selectors)
10. [playwright.config.ts Reference](#10-playwrightconfigts-reference)
11. [Known Issues & Fixes Applied](#11-known-issues--fixes-applied)
12. [Reports](#12-reports)
13. [Coding Conventions](#13-coding-conventions)

---

## 1. Project Structure

```
automation-framework/
├── src/
│   ├── helpers/
│   │   ├── dragHelper.ts          # jQuery UI drag-and-drop (raw mouse events)
│   │   ├── flowHelper.ts          # ⭐ Shared flow-creation helper (all TCs use this)
│   │   └── axeHelper.ts           # Accessibility helper
│   │
│   ├── tests/
│   │   ├── recorded/
│   │   │   ├── TC1_SETTINGS_ELEMENTS.spec.ts          # ✅ PASSING
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
├── playwright.config.ts           # Main config
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
npx playwright test src/tests/recorded/ --reporter=html --timeout=120000
```

### Run a specific test case

```bash
npx playwright test src/tests/recorded/TC1_SETTINGS_ELEMENTS.spec.ts
npx playwright test src/tests/recorded/TC2_CreateSchedulerFlow.spec.ts
```

### Run with visible browser (debug)

```bash
npx playwright test --headed --timeout=120000
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

## 5. Adding New Test Cases (xlsx Pipeline)

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
   - Col F: Step Description (see [Section 7](#7-step-description-keywords) for keywords)
   - Col G: Expected Result (what should be visible/true after this step)
4. Save the xlsx file
5. Run the pipeline:

```bash
python3 manualtestcasedoc/parse_xlsx.py
npx ts-node src/recorded/xlsx_to_spec.ts
npx playwright test src/tests/recorded/TC3_CreateWebhookFlow.spec.ts
```

### What gets auto-generated for flow-creation TCs

- `import { FlowHelper }` from the shared helper
- `let flowName = ''` variable scoped to the describe block
- `test.afterEach` that calls `flow.deleteFlow(flowName)` to clean up
- Each step maps to a `flow.xxx()` method call (thin, readable code)

---

## 6. xlsx Column Reference

| Column | Letter | Parsed Field | Usage |
|---|---|---|---|
| S.No | A | `id` | TC number — prefixes file and describe block (`TC2`) |
| Test Case Name | B | `name` | `test.describe('[TC2] Name')` block title |
| Test Case Description | C | `description` | `test('description...')` test title |
| Type | D | *(internal)* | `TestCase` or `TestStep` — determines row type |
| Step | E | `step` | Label only (Step1, Step2…) |
| **Step Description** ⭐ | **F** | `description` | **Primary driver** — determines which Playwright action is generated |
| **Expected Result** ⭐ | **G** | `expected` | Used for assertions. Fill accurately for all steps. |
| Remarks | H | `remarks` | Stored in JSON, available for custom logic |
| Automation Status | I | `auto_status` | Stored, not yet used in generation |
| Locator | J | `locator` | Stored, available for override logic |

> ⭐ **Most important columns**: F (drives action generation) and G (drives assertions).

---

## 7. Step Description Keywords

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

## 8. Helper Classes

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
const dropX = triggerBox.x + triggerBox.width / 2;
const dropY = triggerBox.y + triggerBox.height + 200;   // 200px below trigger bottom
await drag.dragAndDrop(srcSel, '', { x: dropX, y: dropY });
```

---

## 9. Key Selectors

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

### Action config panel dropdowns

```typescript
// Both 'Choose Connection' and 'Choose To' use evaluate() pattern
// (Ember dropdown is a div[role=list], not a native <ul>)
await page.evaluate(({ placeholder }) => {
  const input = [...document.querySelectorAll('input,[role="textbox"]')]
    .find(el => el.placeholder === placeholder || el.getAttribute('aria-label') === placeholder);
  const dropdown = input.closest('div').nextElementSibling;
  dropdown.querySelector('li,[role="listitem"]').click();
}, { placeholder: 'Choose Connection' });
```

### Toggle ON switch

```typescript
// Hidden <input type="checkbox"> — must click cursor:pointer parent
await page.evaluate(() => {
  const input = document.querySelector('input[name="switch"]');
  let el = input.parentElement;
  while (el && window.getComputedStyle(el).cursor !== 'pointer') el = el.parentElement;
  (el ?? input).click();
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

## 10. playwright.config.ts Reference

```typescript
export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  workers: 2,
  retries: 1,
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
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        channel: 'chrome',                               // ← REQUIRED for mTLS
        ignoreHTTPSErrors: true,
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',                               // ← REQUIRED for mTLS
        storageState: 'playwright/.auth/user.json',
        viewport: { width: 1280, height: 900 },          // ← 900px keeps canvas in viewport
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

---

## 11. Known Issues & Fixes Applied

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
| 13 | Setup mTLS error | Setup project missing `channel:'chrome'` | Added `channel:'chrome'` to setup project |

---

## 12. Reports

### Generate + view

```bash
npx playwright test src/tests/recorded/ --reporter=html
npx playwright show-report           # → http://localhost:9323
```

### Export as zip (for sharing)

```bash
zip -r ~/Desktop/playwright-report-$(date +%Y%m%d).zip playwright-report/ test-results/
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

## 13. Coding Conventions

### Spec file naming

```
TC<n>_<PascalCaseName>.spec.ts
```
Examples: `TC1_SETTINGS_ELEMENTS.spec.ts`, `TC3_CreateWebhookFlow.spec.ts`

### Generated spec structure (flow TCs)

```typescript
import { test, expect } from '@playwright/test';
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

- ❌ Hard-code `page.waitForTimeout()` values > 3000 ms unless there's a specific known delay
- ❌ Use `page.locator('li').first()` for dropdowns — always scope to the adjacent container
- ❌ Use Playwright's `dragTo()` for Zoho Flow — it fires HTML5 DnD events, not jQuery UI events
- ❌ Commit `playwright/.auth/user.json` to git (contains session cookies)

### Do

- ✅ Always use `FlowHelper` for any flow-creation step
- ✅ Add new trigger/action types as methods to `FlowHelper`
- ✅ Derive canvas drop coordinates from trigger node `boundingBox()`
- ✅ Use `evaluate()` for interactions with hidden/custom Ember components
- ✅ Add `test.afterEach` with `flow.deleteFlow(flowName)` in all flow-creation TCs

---

*Maintained by the automation team. Update this file whenever new patterns, selectors, or helpers are added.*
