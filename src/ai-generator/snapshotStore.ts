import * as fs from 'fs';
import * as path from 'path';
import { DOMSnapshot } from './domCrawler';

const SNAPSHOT_DIR = path.join(process.cwd(), 'src', 'dom-snapshots');

export function ensureSnapshotDir(): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

export function urlToSlug(url: string): string {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function saveSnapshot(snapshot: DOMSnapshot): string {
  ensureSnapshotDir();
  const slug = urlToSlug(snapshot.url);
  const filePath = path.join(SNAPSHOT_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`  Snapshot saved: ${filePath}`);
  return filePath;
}

export function loadSnapshot(slug: string): DOMSnapshot | null {
  const filePath = path.join(SNAPSHOT_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DOMSnapshot;
}

export function listSnapshots(): string[] {
  ensureSnapshotDir();
  return fs
    .readdirSync(SNAPSHOT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(SNAPSHOT_DIR, f));
}

export function loadAllSnapshots(): DOMSnapshot[] {
  return listSnapshots()
    .map(fp => JSON.parse(fs.readFileSync(fp, 'utf-8')) as DOMSnapshot)
    .filter(Boolean);
}
