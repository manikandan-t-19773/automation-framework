import { test as setup } from '../fixtures/base';
import * as fs from 'fs';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Reuse existing session if auth file is present and non-empty (avoids
  // re-login on every run; delete playwright/.auth/user.json to force a fresh login)
  if (fs.existsSync(authFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      if (data.cookies?.length || data.origins?.length) {
        console.log('[auth] Valid session found – skipping login');
        return;
      }
    } catch { /* fall through to full login */ }
  }
  await page.goto(process.env.LOGIN_URL!);
  await page.waitForSelector('//*[@class="zgh-accounts"]//a[contains(text(),"Sign In")]');
  await page.click('//*[@class="zgh-accounts"]//a[contains(text(),"Sign In")]');
  await page.waitForSelector('//input[@id="login_id"]');
  await page.fill('//input[@id="login_id"]', process.env.TEST_EMAIL!);
  await page.click('//button[@id="nextbtn"]');
  await page.waitForSelector('//input[@id="password"]');
  await page.fill('//input[@id="password"]', process.env.TEST_PASSWORD!);
  await page.click('//button[@id="nextbtn"]');
  await page.waitForTimeout(5000); 
  await page.goto(process.env.LOGIN_URL!);
  
  await page.waitForSelector('//*[@id="explore-gallary"]');
  await page.context().storageState({ path: authFile });
});