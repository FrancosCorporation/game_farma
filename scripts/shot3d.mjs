// Screenshot driver para o preview 3D (visual QA dos personagens .glb)
// Uso: node scripts/shot3d.mjs "paciente,carla_dengue,nelson_infarto" /tmp/out.png [--pose mao_no_peito]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const models = process.argv[2] || 'paciente';
const out = process.argv[3] || '/tmp/shot3d.png';
const poseIdx = process.argv.indexOf('--pose');
const pose = poseIdx > -1 ? process.argv[poseIdx + 1] : '';
const waitMs = Number(process.argv.find((a) => a.startsWith('--wait='))?.split('=')[1] || 2500);
const camParam = process.argv.find((a) => a.startsWith('--cam='))?.split('=')[1] || '';
const faceParam = process.argv.find((a) => a.startsWith('--face='))?.slice(7) || '';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css' };
const root = process.cwd();
const srv = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let p = join(root, rel === '/' ? 'test-avatar3d.html' : rel.slice(1));
  // espelha o Vite: arquivos estáticos de public/ são servidos na raiz
  if (!existsSync(p) && existsSync(join(root, 'public', rel.slice(1)))) p = join(root, 'public', rel.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.1', r));
const port = srv.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 150)); });
const glbs = [];
page.on('response', (r) => { if (r.url().includes('.glb')) glbs.push(`${r.status()} ${r.url().split('/').pop()}`); });

await page.goto(`http://127.0.0.1:${port}/test-avatar3d.html?m=${encodeURIComponent(models)}${pose ? `&pose=${pose}` : ''}${camParam ? `&cam=${camParam}` : ''}${process.env.DEBUGMATS ? '&debugmats=1' : ''}`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 20000 }).catch(() => errs.push('TIMEOUT: __ready'));
if (pose) {
  await page.evaluate((p) => window.__setPose(p), pose);
  await page.waitForTimeout(600);
}
if (faceParam) {
  await page.evaluate((f) => window.__face(JSON.parse(f)), faceParam);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });
// stats de pixel por região (QA cega): diversidade de cor, simetria, presença de tons
const stats = await page.evaluate(() => {
  const c = document.getElementById('c');
  const g = document.createElement('canvas');
  g.width = c.width; g.height = c.height;
  const x = g.getContext('2d');
  x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, g.width, g.height).data;
  const W = g.width, H = g.height;
  const colors = new Set();
  let lum = 0, lit = 0, n = 0;
  const band = (y0, y1) => {
    let r = 0, gg = 0, b = 0, nn = 0, litB = 0;
    for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++)
      for (let px = Math.floor(W * 0.43); px < Math.floor(W * 0.57); px += 2) {
        const i = (y * W + px) * 4;
        const L = (d[i] + d[i + 1] + d[i + 2]) / 3;
        r += d[i]; gg += d[i + 1]; b += d[i + 2]; nn++;
        if (L > 70) { litB++; colors.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); }
        lum += L; n++;
      }
    return [Math.round(r / nn), Math.round(gg / nn), Math.round(b / nn), nn, litB];
  };
  const head = band(0.30, 0.42);
  const body = band(0.42, 0.60);
  const feet = band(0.62, 0.74);
  return {
    headRGB: head.slice(0, 3), bodyRGB: body.slice(0, 3), feetRGB: feet.slice(0, 3),
    coresUnicas: colors.size,
    pctLitHead: Math.round((head[4] / head[3]) * 100),
    pctLitBody: Math.round((body[4] / body[3]) * 100),
    lumMedia: Math.round(lum / n),
  };
});
console.log('📸', out, '| GLBs:', glbs.join(', ') || 'nenhum', '| erros:', errs.length ? errs.join(' | ') : 'NENHUM');
console.log('   stats:', JSON.stringify(stats));
await browser.close();
srv.close();
process.exit(errs.length ? 1 : 0);
