// Open one candidate in an isolated task tab, upload it, and stop at Orient.
// Usage: node scripts/open_mixamo_candidate.mjs input.fbx task-tab-id new-evidence-dir
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { chromium } from 'playwright';

const [sourceArg, taskTabId, outputArg] = process.argv.slice(2);
if (!sourceArg?.toLowerCase().endsWith('.fbx') || !/^[a-zA-Z0-9_-]{3,80}$/.test(taskTabId || '') || !outputArg) {
  throw new Error('Supply an FBX path, a safe task tab ID, and a new evidence directory.');
}
const source = resolve(sourceArg);
const output = resolve(outputArg);
if (!existsSync(source)) throw new Error(`FBX not found: ${source}`);
if (existsSync(output)) throw new Error('Evidence directory exists; inspect and preserve the previous attempt.');
mkdirSync(output, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
try {
  const context = browser.contexts()[0];
  if (!context) throw new Error('Persistent task browser context unavailable.');
  const page = await context.newPage();
  await page.goto('https://www.mixamo.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((id) => { window.__farmaMixamoTaskTabId = id; }, taskTabId);
  const upload = page.getByRole('button', { name: /^upload character$/i });
  await upload.waitFor({ timeout: 45000 });
  await upload.click();
  const input = page.locator('input[type="file"]');
  await input.waitFor({ state: 'attached', timeout: 15000 });
  await input.setInputFiles(source);
  await page.getByText('Orient', { exact: true }).waitFor({ timeout: 90000 });
  const modal = page.locator('.modal').last();
  const visibleText = await modal.innerText();
  if (/previous character will not be saved/i.test(visibleText)) {
    throw new Error('Replacement warning appeared at upload; no confirmation was accepted.');
  }
  const overlay = await page.locator('.autorig-overlay').boundingBox();
  if (!overlay) throw new Error('Orient viewport was not available.');
  const sourceBytes = readFileSync(source);
  const orientationCapture = resolve(output, 'orient.png');
  await page.screenshot({ path: orientationCapture, clip: overlay, timeout: 15000 });
  const projectRelativeSource = relative(process.cwd(), source);
  const record = {
    source: projectRelativeSource.startsWith('..') ? source : projectRelativeSource,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    bytes: sourceBytes.length,
    taskTabId,
    origin: 'https://www.mixamo.com',
    path: new URL(page.url()).pathname,
    viewport: page.viewportSize(),
    stage: 'Orient',
    orientOverlay: overlay,
    orientationCapture,
    orientationReviewRequired: true,
    rigSubmissionAttempted: false,
  };
  writeFileSync(resolve(output, 'source.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ stage: 'Orient', taskTabId, sourceSha256: record.sha256, bytes: record.bytes, evidence: resolve(output, 'source.json') }));
} finally {
  await browser.close(); // Disconnect only; leave the persistent profile and tab open.
}
