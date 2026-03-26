#!/bin/bash
cd /Users/mani-19773/automation-framework
npx playwright codegen --load-storage=playwright/.auth/user.json --save-storage=playwright/.auth/user.json --output=src/tests/recorded/TC2_CreateSchedulerFlow_RECORDED.spec.ts --ignore-https-errors --browser=chrome "https://flow.localzoho.com/#/workspace/default/flows"
