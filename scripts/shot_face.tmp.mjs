import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const model = process.argv[2] || 'ana';
const out = process.argv[3] || '/tmp/opencode/shot_face.png';
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 150)));
await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=${model}`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('[data-cam="face"]').click());
await page.waitForTimeout(800);
await page.screenshot({ path: out });
console.log('📸', out);
await browser.close(); srv.close();
