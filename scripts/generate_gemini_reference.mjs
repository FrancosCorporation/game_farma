// One new fictional reference in the existing authorized Gemini browser session.
// Usage: node scripts/generate_gemini_reference.mjs case_id ana_work/.../output_stem
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
const [caseId, stemArg] = process.argv.slice(2);
if (!caseId || !stemArg) throw new Error('Supply case_id and a new output stem');
const root = resolve('.'), stem = resolve(stemArg);
if (!stem.startsWith(join(root, 'ana_work') + '/')) throw new Error('Use a task directory under ana_work');
const patient = JSON.parse(readFileSync('docs/elenco_planejado.json')).patients.find(p => p.caseId === caseId);
if (!patient || patient.status === 'aprovado_publicado') throw new Error('Unknown or already published character');
if (['jpg','png','webp'].some(ext => existsSync(stem + '.' + ext)) || existsSync(stem + '.submitted.json')) {
  throw new Error('Existing reference/submission: inspect the current browser job instead of generating twice');
}
const workflow = JSON.parse(readFileSync(`ana_work/cast_c1_20261012/${caseId}.workflow.json`));
const prompt = workflow['6'].inputs.text +
  ' Both palms face the camera directly, with thumbs pointing outward and all five fingers visibly separated on both hands. No side-on hands or overlapping fingers. Avoid: ' +
  workflow['7'].inputs.text + '. Generate one new vertical 9:16 full-body reference.';
mkdirSync(dirname(stem), { recursive: true });
writeFileSync(stem + '.prompt.txt', prompt);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
let session;
try {
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().startsWith('https://gemini.google.com/'));
  if (!page) throw new Error('Open the authorized Gemini account/session first');
  await page.bringToFront();
  await page.goto('https://gemini.google.com/u/1/images', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.locator('[contenteditable=true][role=textbox]');
  await input.waitFor({ state: 'visible' });
  await page.locator('button').filter({ hasText: /Proporção|9:16/ }).last()
    .waitFor({ state: 'visible', timeout: 30000 });
  const ratio = page.locator('button').filter({ hasText: 'Proporção' });
  if (await ratio.count()) { await ratio.last().click(); await page.getByText('9:16', { exact: true }).click(); }
  else if (!await page.locator('button').filter({ hasText: '9:16' }).count()) throw new Error('Aspect-ratio control changed');
  if (await page.getByRole('dialog').filter({ hasText: /pagamento|cartão|créditos/i }).count()) {
    throw new Error('Payment dialog; no submission');
  }
  await input.fill(prompt);
  await input.press('Enter');
  writeFileSync(stem + '.submitted.json', JSON.stringify({ caseId, submittedAt: new Date().toISOString(), provider: 'Gemini web, existing account, no upgrade clicked' }));
  console.log('Reference submitted once:', caseId);
  const image = page.locator('generated-image').last();
  await image.waitFor({ state: 'visible', timeout: 180000 });
  await page.bringToFront();
  await image.hover();
  const downloadDir = stem + '.downloads';
  mkdirSync(downloadDir, { recursive: true });
  const prior = new Set(readdirSync(downloadDir));
  session = await browser.newBrowserCDPSession();
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Baixar imagem no tamanho original', exact: true }).last().click();
  await pending; // Browser override saves the real file; Playwright saveAs uses a different temporary path.
  let saved = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const files = readdirSync(downloadDir).filter(n => !prior.has(n) && !n.endsWith('.crdownload'));
    if (!files.length) continue;
    const data = readFileSync(join(downloadDir, files[0]));
    const extension = data.subarray(0,4).equals(Buffer.from([137,80,78,71])) ? 'png' :
      data[0] === 255 && data[1] === 216 ? 'jpg' : data.subarray(0,4).toString() === 'RIFF' ? 'webp' : null;
    if (!extension || data.length < 10000) throw new Error('Unexpected or incomplete image file');
    writeFileSync(stem + '.' + extension, data);
    console.log('Original saved:', stem + '.' + extension, 'bytes:', data.length);
    saved = true; break;
  }
  if (!saved) throw new Error('Download still pending: retain the browser job; do not resubmit');
} finally {
  if (session) await session.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
  await browser.close(); // Disconnect CDP; keep the dedicated host window/session alive.
}
