// One authorized fictional reference, one submission; no retry submissions or paid flow.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const [reference, output, mode] = process.argv.slice(2);
if (!reference || !output) throw new Error('Usage: reference.png candidate.glb');
mkdirSync(dirname(output), { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().startsWith('https://3d.hunyuan.tencent.com/'));
if (!page) throw new Error('Task browser has no Tencent page');
const shots = `${output}.shots`;
mkdirSync(shots, { recursive: true });
const glbs = [];
const capture = (response) => { if (/\.glb(?:\?|$)/i.test(response.url())) glbs.push(response.url()); };
page.on('response', capture);
try {
  await page.bringToFront();
  if (!await page.locator('input[type=file]').count()) {
    await page.goto('https://3d.hunyuan.tencent.com/', { waitUntil: 'domcontentloaded' });
    await page.getByText('立即开始', { exact: true }).first().click();
  }
  const state = await page.locator('body').innerText();
  if (mode !== '--resume' && /生成中|排队中/.test(state)) throw new Error('Existing generation in progress; preserve it');
  if (mode !== '--resume') {
    const oldDownload = page.getByText('下载', { exact: true }).filter({ visible: true });
    if (await oldDownload.count()) throw new Error('Previous model still visible: open a fresh editor before submitting');
  }
  const quota = await page.locator('.remain-count').first().innerText().catch(() => '');
  if (!/^\d+$/.test(quota.trim()) || Number(quota) <= 0) throw new Error('Free quota unavailable');
  console.log('Quota before:', Number(quota));
  if (mode !== '--resume') {
  await page.locator('input[type=file]').first().setInputFiles(reference);
  await page.waitForFunction(() => document.querySelector('.uploadBox.isSuccess, .uploadBox .isSuccess, [class*="successImageBg"]'), null, { timeout: 30000 });
  await page.getByText('500k', { exact: true }).filter({ visible: true }).last().click();
  await page.screenshot({ path: `${shots}/uploaded.png` });
  const generation = page.getByText('立即生成', { exact: true })
    .filter({ visible: true }).locator('xpath=ancestor::button[1]');
  glbs.length = 0; // Fresh editor only: responses after this submission belong to this job.
  await page.bringToFront();
  await generation.last().click();
  console.log('Submission sent once');
  await page.waitForTimeout(12000);
  const accepted = await page.locator('body').innerText();
  const after = await page.locator('.remain-count').first().innerText().catch(() => quota);
  if (Number(after) === Number(quota) && !/生成中|排队中/.test(accepted)) throw new Error('Submission not accepted; no running job observed');
  } else console.log('Recovering existing job; no submission');
  let finished = false;
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(10000);
    const text = await page.locator('body').innerText();
    if (/验证码|滑块|拖动验证|支付|购买|次数已达到上限|生成失败/.test(text)) {
      await page.screenshot({ path: `${shots}/blocked.png` });
      throw new Error('Verification, payment, quota or generation failure shown; no bypass/retry');
    }
    const download = page.getByText('下载', { exact: true });
    if (await download.count() && await download.last().isVisible() && !/生成中|排队中/.test(text)) {
      finished = true;
      await page.screenshot({ path: `${shots}/generated.png` });
      await page.bringToFront();
      await download.last().click();
      break;
    }
    if (i % 6 === 0) console.log('Waiting:', i * 10, 'seconds', /排队中/.test(text) ? 'queued' : 'processing');
  }
  if (!finished) throw new Error('No completion within 8 minutes; preserve job for later recovery');
  await page.waitForTimeout(6000);
  if (!glbs.length) throw new Error('Download URL not captured; preserve completed candidate in browser');
  const response = await fetch(glbs.at(-1));
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.subarray(0, 4).toString() !== 'glTF') throw new Error('Download is not a GLB');
  writeFileSync(output, data);
  console.log('Candidate saved:', output, 'bytes:', data.length);
} finally {
  page.off('response', capture);
  await browser.close(); // Disconnect CDP; keeps task-owned host browser open.
}
