// Download one selected Mixamo action from the authenticated task browser.
// Usage: node scripts/download_mixamo_action.mjs CHARACTER_STEM ACTION_NAME output.fbx
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';

const [stem, actionName, target, variant] = process.argv.slice(2);
if (!stem || !/^[a-zA-Z0-9_-]+$/.test(stem) || !actionName || !target?.endsWith('.fbx')) {
  throw new Error('Supply a safe character stem, selected action name and new FBX output path [--in-place]');
}
if (variant && variant !== '--in-place') throw new Error(`Unknown action variant: ${variant}`);
const inPlace = variant === '--in-place';
const output = resolve(target);
const folder = output + '.downloads';
const signature = Buffer.from('Kaydara FBX Binary  \0');
if (existsSync(output) || existsSync(folder)) throw new Error('Output or download folder exists; inspect previous attempt');
mkdirSync(dirname(output), { recursive: true });
mkdirSync(folder);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const cdp = await browser.newBrowserCDPSession();
try {
  const page = await resolveMixamoTaskPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error('Task Mixamo tab not found');
  await page.bringToFront();
  const heading = `${actionName} ON ${stem}`;
  await page.getByText(new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).waitFor({ timeout: 10000 });
  if (inPlace) {
    const allCheckboxes = page.locator('input[type="checkbox"]');
    const controls = await allCheckboxes.evaluateAll((items) => items.map((element, index) => ({
      index,
      label: [element.parentElement?.innerText, element.parentElement?.parentElement?.innerText].filter(Boolean).join(' '),
    })));
    const inPlaceIndex = controls.find((control) => /\bIn Place\b/.test(control.label))?.index;
    if (inPlaceIndex === undefined) throw new Error('Mixamo In Place control not found for the selected action');
    const inPlaceInput = allCheckboxes.nth(inPlaceIndex);
    await inPlaceInput.check();
    if (!await inPlaceInput.isChecked()) throw new Error('Mixamo did not enable In Place');
  }
  if (!await page.getByText('Download Settings', { exact: true }).isVisible()) {
    if (await page.locator('.modal').count()) throw new Error('Unexpected modal is open');
    await page.getByText(/^download$/i).first().click();
  }

  const modal = page.locator('.modal');
  const selects = modal.locator('select');
  await selects.nth(0).selectOption('fbx7_2019');
  await selects.nth(1).selectOption('true'); // Preserve this rig's skin and bind for exact compatibility checks.
  await selects.nth(2).selectOption('30');
  await selects.nth(3).selectOption('0');
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: folder, eventsEnabled: true });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    modal.getByRole('button', { name: /^download$/i }).click(),
  ]);
  const deadline = Date.now() + 120000;
  let file;
  while (Date.now() < deadline) {
    const files = readdirSync(folder).filter((name) => !name.endsWith('.crdownload'));
    if (files.length === 1) {
      const candidate = join(folder, files[0]);
      const data = readFileSync(candidate);
      if (data.subarray(0, signature.length).equals(signature) && data.length > 1024) { file = candidate; break; }
    }
    await page.waitForTimeout(500);
  }
  if (!file) throw new Error('No completed binary FBX; inspect saved download before retrying');
  copyFileSync(file, output);
  console.log(JSON.stringify({
    state: 'downloaded-not-QA-approved', character: stem, action: actionName,
    format: 'FBX Binary', skin: 'With Skin', fps: 30, keyframeReduction: 'none', inPlace,
    output, bytes: readFileSync(output).length, filename: download.suggestedFilename(),
  }));
} finally {
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  await browser.close();
}
