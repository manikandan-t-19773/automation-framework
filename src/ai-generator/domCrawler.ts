import { chromium } from '@playwright/test';

export interface DOMSnapshot {
  url: string;
  title: string;
  elements: {
    tag: string;
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    placeholder?: string;
    selector: string;
  }[];
  forms: { fields: string[] }[];
  navigationLinks: { text: string; href: string }[];
}

export async function crawlPage(url: string): Promise<DOMSnapshot> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log(`Crawling: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  const title = await page.title();

  const snapshot = await page.evaluate(() => {
    const elements: any[] = [];
    const seen = new Set<string>();

    const selectors = ['a', 'button', 'input', 'select', 'textarea'];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el: any) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Build a unique key to avoid duplicates
        const key = `${el.tagName}|${el.id}|${el.name}|${el.innerText?.trim().substring(0, 30)}`;
        if (seen.has(key)) return;
        seen.add(key);

        // Pick the best selector
        let selector = sel;
        if (el.id) selector = `#${el.id}`;
        else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
        else if (el.name) selector = `[name="${el.name}"]`;

        elements.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          // Keep text short
          text: el.innerText?.trim().substring(0, 40) || undefined,
          id: el.id || undefined,
          name: el.name || undefined,
          placeholder: el.placeholder || undefined,
          selector,
        });
      });
    });

    // Limit to 40 most relevant elements
    const prioritized = [
      ...elements.filter(e => e.tag === 'input' || e.tag === 'select' || e.tag === 'textarea'),
      ...elements.filter(e => e.tag === 'button'),
      ...elements.filter(e => e.tag === 'a'),
    ].slice(0, 40);

    const forms = Array.from(document.querySelectorAll('form')).slice(0, 5).map((f: any) => ({
      fields: Array.from(f.querySelectorAll('input,select,textarea'))
        .map((i: any) => i.name || i.id || i.type)
        .filter(Boolean)
        .slice(0, 10),
    }));

    const navigationLinks = Array.from(
      document.querySelectorAll('nav a, header a')
    )
      .map((a: any) => ({ text: a.innerText.trim().substring(0, 40), href: a.href }))
      .filter(l => l.text && l.href)
      .slice(0, 15);  // max 15 nav links

    return { elements: prioritized, forms, navigationLinks };
  });

  await browser.close();
  return { url, title, ...snapshot };
}