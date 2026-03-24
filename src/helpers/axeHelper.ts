import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function runAccessibilityCheck(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  return results;
}