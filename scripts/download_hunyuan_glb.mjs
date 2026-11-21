// Download an already-completed Tencent Hunyuan model through its visible UI.
// Usage: node scripts/download_hunyuan_glb.mjs <visible-credit-count> <label> <new-output.glb>
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, resolve, join } from 'node:path';

const [creditArg, label, targetArg] = process.argv.slice(2);
if (!/^\d+$/.test(creditArg || '') || !/^[a-zA-Z0-9_-]+$/.test(label || '') || !targetArg?.endsWith('.glb')) {
  throw new Error('Usage: node scripts/download_hunyuan_glb.mjs <visible-credit-count> <label> <new-output.glb>');
}
const expectedCredit = Number(creditArg);
const target = resolve(targetArg);
if (existsSync(target)) throw new Error(`Output exists; preserve candidate: ${target}`);
const downloadDir = target + '.downloads';
if (existsSync(downloadDir)) throw new Error(`Download directory exists; inspect before retrying: ${downloadDir}`);
mkdirSync(dirname(target), { recursive: true });
mkdirSync(downloadDir);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const cdp = await browser.newBrowserCDPSession();
try {
  const matches = [];
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    let url;
    try { url = new URL(page.url()); } catch { continue; }
    if (url.hostname !== '3d.hunyuan.tencent.com') continue;
    const credits = (await page.locator('.remain-count').allTextContents()).map(x => x.trim()).filter(x => /^\d+$/.test(x));
    const buttons = await page.locator('button').evaluateAll(elements => elements.map((element, index) => ({
      index,
      text: (element.innerText || '').trim(),
      visible: !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
    })));
    const downloadButton = buttons.find(button => button.visible && /^(下载|download)$/i.test(button.text));
    if (credits.includes(String(expectedCredit)) && downloadButton) matches.push({ page, downloadButton });
  }
  if (matches.length !== 1) throw new Error(`Expected one completed UI for balance ${expectedCredit}; found ${matches.length}`);
  const { page, downloadButton } = matches[0];
  await page.bringToFront();
  let glb = page.getByText('GLB', { exact: true }).last();
  if (!await glb.isVisible().catch(() => false)) {
    await page.locator('button').nth(downloadButton.index).click();
    await glb.waitFor({ state: 'visible', timeout: 10000 });
  }
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    glb.click(),
  ]);
  const deadline = Date.now() + 120000;
  let downloaded;
  while (Date.now() < deadline) {
    const files = readdirSync(downloadDir).filter(name => !name.endsWith('.crdownload'));
    if (files.length === 1) {
      const candidate = join(downloadDir, files[0]);
      if (statSync(candidate).size >= 20 && readFileSync(candidate).subarray(0, 4).toString('ascii') === 'glTF') {
        downloaded = candidate;
        break;
      }
    }
    await page.waitForTimeout(500);
  }
  if (!downloaded) throw new Error('Completed binary GLB not found; inspect the preserved downloads folder before retrying');
  copyFileSync(downloaded, target);
  const bytes = readFileSync(target);
  console.log(JSON.stringify({ label, expectedCredit, state: 'downloaded-candidate-not-QA-approved', output: target,
    suggestedFilename: basename(download.suggestedFilename()), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') }));
} finally {
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  await browser.close();
}
