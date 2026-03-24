import * as fs from 'fs';
import * as path from 'path';

export function writeTestFile(testCode: string, fileName: string): void {
  const outputDir = path.join(process.cwd(), 'src', 'tests', 'generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, testCode, 'utf-8');
  console.log(`Test file written: ${filePath}`);
}