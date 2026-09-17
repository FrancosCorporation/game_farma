// Verifica geometria dos olhos no runtime (three.js): node scripts/qa_eyes.mjs [modelo=ana_v2]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const model = process.argv[2] || 'ana_v2';
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
const page = await browser.newContext({ viewport: { width: 900, height: 760 } }).then(c => c.newPage());
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 150)));
await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=${model}`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
const info = await page.evaluate(() => {
  const { Box3, Vector3 } = window.__THREE;
  const out = [];
  window.__model.traverse(o => {
    if (o.isMesh) {
      const bb = new Box3().setFromObject(o);
      const size = bb.getSize(new Vector3());
      const c = bb.getCenter(new Vector3());
      out.push({ name: o.name, tris: o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3,
        center: [c.x, c.y, c.z].map(v => +v.toFixed(3)), size: [size.x, size.y, size.z].map(v => +v.toFixed(3)) });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
srv.close();