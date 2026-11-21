// Download the confirmed character's own binary FBX in T-pose, without logging its signed URL.
// Usage: node scripts/download_mixamo_skin.mjs expected-model-stem new-output.fbx
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';
const [stem, target] = process.argv.slice(2);
if (!stem || !/^[a-zA-Z0-9_-]+$/.test(stem) || !target?.endsWith('.fbx')) throw new Error('Supply safe model stem and new FBX path');
if (existsSync(target)) throw new Error('Preserve existing candidate; choose a new output');
const output = resolve(target), folder = output + '.downloads';
const signature = Buffer.from('Kaydara FBX Binary  \0');
if (existsSync(folder)) throw new Error('Download folder exists; inspect previous attempt');
mkdirSync(dirname(output), { recursive: true }); mkdirSync(folder);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const cdp = await browser.newBrowserCDPSession();
try {
  const page = await resolveMixamoTaskPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error('Task Mixamo tab not found');
  await page.bringToFront();
  await page.getByText(new RegExp(`^${stem}$`, 'i')).waitFor({ timeout: 10000 });
  if (!await page.getByText('Download Settings', { exact: true }).isVisible()) {
    if (await page.locator('.modal').count()) throw new Error('Confirm Review and Change Character before download');
    await page.getByText(/^download$/i).click();
  }
  const modal = page.locator('.modal');
  await modal.locator('select').filter({ has: page.locator('option', { hasText: 'FBX Binary(.fbx)' }) }).selectOption({ label: 'FBX Binary(.fbx)' });
  await modal.locator('select').filter({ has: page.locator('option', { hasText: 'T-pose' }) }).selectOption({ label: 'T-pose' });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: folder, eventsEnabled: true });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), modal.getByRole('button', { name: /^download$/i }).click()]);
  // The native original lives in folder under CDP override; saveAs may refer to another temp.
  const deadline = Date.now() + 120000;
  let file;
  while (Date.now() < deadline) {
    const files = readdirSync(folder).filter(f => !f.endsWith('.crdownload'));
    if (files.length === 1) {
      const candidate = join(folder, files[0]);
      if (readFileSync(candidate).subarray(0, signature.length).equals(signature)) { file = candidate; break; }
    }
    await page.waitForTimeout(500);
  }
  if (!file) throw new Error('No completed binary FBX; inspect download before retrying');
  copyFileSync(file, output);
  console.log(JSON.stringify({ state: 'downloaded-not-QA-approved', model: stem, output, bytes: readFileSync(output).length, filename: download.suggestedFilename() }));
} finally {
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  await browser.close();
}
