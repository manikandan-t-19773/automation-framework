import { crawlPage } from './domCrawler';
import { generateTests } from './testGenerator';
import { writeTestFile } from './outputWriter';

async function main() {
  // *** REPLACE THIS WITH YOUR ACTUAL WEBSITE URL ***
  const urls = [
    'https://flow.localzoho.com',
  ];

  for (const url of urls) {
    try {
      console.log(`\n--- Processing: ${url} ---`);
      const snapshot = await crawlPage(url);
      const testCode = await generateTests(snapshot);
      const fileName = url
        .replace(/https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') + '.spec.ts';
      writeTestFile(testCode, fileName);
      console.log(`Done: ${fileName}`);
    } catch (err) {
      console.error(`Failed for ${url}:`, err);
    }
  }

  console.log('\nAll test files generated! Run: npx playwright test');
}

main();