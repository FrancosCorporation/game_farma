// Mede a superfície frontal do rosto (pálpebra) no runtime three.js — node scripts/qa_lid.mjs
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
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 120)));
await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=ana`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(500);
const lid = await page.evaluate(() => {
  // posições em espaço local do modelo (o viewer normaliza mas não gira)
  let body = null;
  window.__model.traverse(o => { if (o.isMesh && !o.name.startsWith('Eye') && !body) body = o; });
  const pos = body.geometry.attributes.position;
  const out = {};
  const v = new window.__THREE.Vector3();
  const scan = (ex) => {
    let pts = [];
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      body.localToWorld(v);
      const x = v.x, y = v.y, z = v.z;
      if (y < 1.585 || y > 1.615 || Math.abs(x - ex) > 0.03) continue;
      if (z > 0.110) pts.push([x, y, z]);
    }
    if (!pts.length) return best;
    // agrupa por janela em x
    const wins = {};
    for (const [x, y, z] of pts) {
      const k = Math.round(x * 40) / 40; // janela de 2.5cm
      (wins[k] = wins[k] || []).push([x, y, z]);
    }
    let bestWin = null, bestZ = -1;
    for (const k in wins) {
      const maxZ = Math.max(...wins[k].map(p => p[2]));
      if (maxZ > bestZ) { bestZ = maxZ; bestWin = wins[k]; }
    }
    const cx = bestWin.reduce((a, p) => a + p[0], 0) / bestWin.length;
    const cy = bestWin.reduce((a, p) => a + p[1], 0) / bestWin.length;
    return { z: bestZ, cx, cy, cnt: bestWin.length };
  };
  out.L = scan(-0.05);
  out.R = scan(0.05);
  return out;
});
console.log('LID RUNTIME:', JSON.stringify(lid));
await browser.close();
srv.close();