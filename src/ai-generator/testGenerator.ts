import { DOMSnapshot } from './domCrawler';

export async function generateTests(snapshot: DOMSnapshot): Promise<string> {
  const prompt = `You are a code generator. Generate ONLY valid TypeScript code. No explanations, no markdown, no comments outside the code.

Create Playwright test file for: ${snapshot.url}

Available page data:
${JSON.stringify(snapshot, null, 2)}

Generate tests following this exact structure:

import { test, expect } from '@playwright/test';

test.describe('${snapshot.url}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${snapshot.url}');
  });

  test('should load the page', async ({ page }) => {
    await expect(page).toHaveURL('${snapshot.url}');
  });

  // Add more tests here based on the available page data above
});

Output ONLY the TypeScript code above.`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'codellama',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.2,
        }
      })
    });

    const data = await response.json();
    let code = data.response;
    
    // Remove markdown code fences
    code = code.replace(/```(?:typescript|ts)?\n?/g, '').replace(/```\n?/g, '');
    
    // Extract only the import to the last closing brace
    const importIndex = code.indexOf('import');
    if (importIndex > 0) {
      code = code.substring(importIndex);
    }
    
    // Find last }); at root level
    const lastBrace = code.lastIndexOf('});');
    if (lastBrace > 0) {
      code = code.substring(0, lastBrace + 3);
    }
    
    return code.trim();
  } catch (error) {
    console.error('Ollama generation error:', error);
    throw error;
  }
}