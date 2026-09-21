// Marcadores das posições de olho detectadas na TEXTURA (mais confiável que cor na render).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
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
const markers = await page.evaluate(async () => {
  document.querySelector('[data-cam="face"]').click();
  await new Promise(r => setTimeout(r, 250));
  const THREE = window.__THREE, camera = window.__camera;
  camera.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (pos) => { const p = new THREE.Vector3(...pos).project(camera); return [Math.round((p.x + 1) / 2 * W), Math.round((1 - p.y) / 2 * H)]; };
  // converter local (mesh, scale 0.86 + T 0.86 em y) para mundo GLB
  const S = 0.8599;
  const L = (x, y, z) => [x * S, y * S + 0.86, z * S];
  const pts = {
    'AMARELO_texR': L(0.047, 0.888, 0.128),
    'CIANO_texL': L(-0.037, 0.887, 0.155),
    'VERMELHO_raioR': L(0.062, 0.829, 0.112),
    'VERDE_raioL': L(-0.047, 0.888, 0.128),
  };
  return Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, proj(v)]));
});
await page.evaluate((mk) => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;';
  const colors = { 'AMARELO_texR': '#ffff00', 'CIANO_texL': '#00ffff', 'VERMELHO_raioR': '#ff0000', 'VERDE_raioL': '#00ff00' };
  for (const [k, [x, y]] of Object.entries(mk)) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;border:3px solid ${colors[k]};`;
    d.title = k; div.appendChild(d);
  }
  document.body.appendChild(div);
}, markers);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/opencode/eyecheck_tex.png' });
console.log('markers:', JSON.stringify(markers));
await browser.close(); srv.close();
