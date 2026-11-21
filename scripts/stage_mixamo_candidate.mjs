// Stage an authorized FBX and reviewed coordinates; stops before rig submission.
// Usage: node scripts/stage_mixamo_candidate.mjs input.fbx targets.json new-dir expected-placement.json
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';
const [source, config, folder, framePath] = process.argv.slice(2);
if (!source || !config || !folder || !framePath || !source.endsWith('.fbx')) throw new Error('Supply FBX, targets, new folder and reviewed frame');
if (existsSync(folder)) throw new Error('Preserve partial staging; inspect before another upload');
const frame = JSON.parse(readFileSync(framePath, 'utf8')).overlay;
if (!frame || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(frame[k])) || frame.width <= 0 || frame.height <= 0) throw new Error('Missing finite reviewed overlay');
mkdirSync(folder, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
try {
  const page = await resolveMixamoTaskPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error('Task Mixamo session unavailable');
  await page.bringToFront();
  if (await page.locator('.modal').count()) throw new Error('Inspect current dialog before replacing the character');
  await page.getByRole('button', { name: /^upload character$/i }).click();
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  await page.locator('input[type=file]').setInputFiles(source);
  await page.getByText('Orient', { exact: true }).waitFor({ timeout: 90000 });
  await page.screenshot({ path: join(folder, 'orient.png'), timeout: 15000 });
  await page.locator('.modal').getByRole('button', { name: /^next$/i }).click();
  await page.getByText('Place markers', { exact: true }).waitFor();
  const overlay = await page.locator('.autorig-overlay').boundingBox();
  if (!overlay || ['x', 'y', 'width', 'height'].some(k => Math.abs(overlay[k] - frame[k]) > 2)) throw new Error('Frame changed; source needs new anatomical coordinates');
  writeFileSync(join(folder, 'source.json'), JSON.stringify({ source: resolve(source), sha256: createHash('sha256').update(readFileSync(source)).digest('hex'), overlay, reviewed: false }, null, 2));
} finally { await browser.close(); }
const result = spawnSync(process.execPath, [new URL('./place_mixamo_markers.mjs', import.meta.url).pathname, resolve(config), 'http://127.0.0.1:9222', resolve(folder)], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Marker placement failed; preserve current stage');
console.log('Staged with reviewed frame; inspect Orient and all centers before marking reviewed/Next.');
