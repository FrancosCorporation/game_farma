// QA close-ups (olhos/mãos) para decisão de polimento: node scripts/qa_closeups.mjs [modelo=ana]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const model = process.argv[2] || 'ana';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
const root = process.cwd();
const srv = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let p = join(root, rel === '/' ? 'index.html' : rel.slice(1));
  if (!existsSync(p) && existsSync(join(root, 'public', rel.slice(1)))) p = join(root, 'public', rel.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const views = [["v2_full",{"cx":0,"cy":1,"cz":3.2,"tx":0,"ty":0.9,"tz":0}],["v2_eyes",{"cx":0,"cy":1.6,"cz":0.24,"tx":0,"ty":1.6,"tz":0.05}],["v2_handL",{"cx":0.45,"cy":1,"cz":0.42,"tx":0.26,"ty":0.93,"tz":0.08}]];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 120)));

for (const [name, v] of views) {
  const q = new URLSearchParams({ m: model, cam: 'free', ...v });
  await page.goto(`http://127.0.0.1:${port}/char-preview.html?${q}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `/tmp/opencode/cu_${name}.png` });
  console.log('shot', name);
}
await browser.close();
srv.close();
console.log('OK: /tmp/opencode/cu_*.png');
