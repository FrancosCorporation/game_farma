// Marcadores sobre canvas com MESMA câmera renderizada. Uso: node scripts/qa_eyecheck.mjs <json>
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
const argJson = process.argv[2] || '';
const ptsIn = argJson ? JSON.parse(argJson) : {};
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
await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=ana`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(500);
const markers = await page.evaluate(async (ptsIn) => {
  document.querySelector('[data-cam="face"]').click();
  await new Promise(r => setTimeout(r, 250));
  const THREE = window.__THREE, camera = window.__camera;
  camera.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (pos) => { const p = new THREE.Vector3(...pos).project(camera); return [Math.round((p.x + 1) / 2 * W), Math.round((1 - p.y) / 2 * H)]; };
  return Object.fromEntries(Object.entries(ptsIn).map(([k, v]) => [k, proj(v)]));
}, ptsIn);
await page.evaluate((mk) => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;';
  const colors = ['#ff0000', '#00ff00', '#ffff00', '#00ffff', '#ff00ff', '#ff8c00', '#ffffff', '#00ff7f'];
  let i = 0;
  for (const [k, [x, y]] of Object.entries(mk)) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;border:3px solid ${colors[i++ % colors.length]};`;
    d.title = k; div.appendChild(d);
  }
  document.body.appendChild(div);
}, markers);
await page.waitForTimeout(300);
const out = process.argv[3] || '/tmp/opencode/eyecheck_pts.png';
await page.screenshot({ path: out });
console.log('markers:', JSON.stringify(markers));
await browser.close(); srv.close();
