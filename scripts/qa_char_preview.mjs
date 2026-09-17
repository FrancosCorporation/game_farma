// QA de robustez/performance do char-preview.html (CI-ready).
// Uso: node scripts/qa_char_preview.mjs [modelo=ana] [minFps=1]
// - Sobe um servidor estático local, abre a página em Chromium headless, espera window.__ready,
//   amostra FPS do HUD por 4s e valida BUDGETS do GLB (tris <= 300k, <= 8 MB, uv0).
// NOTE: headless usa SwiftShader (software) — FPS ~2 é normal aqui; o piso é só sanidade de render.
// O gate real de performance são os budgets do GLB (ambiente-independentes).
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const model = process.argv[2] || 'ana';
const minFps = Number(process.argv[3] || 1);
const MAX_TRIS = 300000;
const MAX_MB = 8;

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
await new Promise((r) => srv.listen(0, '127.0.1', r));
const port = srv.address().port;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 150)); });

await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=${encodeURIComponent(model)}`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => errs.push('TIMEOUT: __ready'));

const fps = await page.evaluate(async () => {
  const read = () => { const m = document.getElementById('hud').textContent.match(/(\d+) fps/); return m ? parseInt(m[1]) : null; };
  const seen = []; const t0 = performance.now();
  while (performance.now() - t0 < 4000) {
    await new Promise((r) => setTimeout(r, 500));
    const v = read(); if (v !== null) seen.push(v);
  }
  return seen.length ? Math.round(seen.reduce((a, b) => a + b, 0) / seen.length) : null;
});

await page.screenshot({ path: '/tmp/opencode/qa_char_preview.png' });

let a11y = [];
try {
  const results = await new AxeBuilder({ page }).analyze();
  a11y = results.violations.map((v) => v.id);
  if (a11y.length) errs.push('A11Y: ' + a11y.join(','));
} catch (e) {
  console.log('aviso: axe-core falhou:', String(e.message).slice(0, 120));
}

const glbPath = join(root, 'public', 'models', `${model}.glb`);
const sizeMb = existsSync(glbPath) ? statSync(glbPath).size / (1024 * 1024) : 0;
let info = null;
try {
  info = JSON.parse(execFileSync('node', ['scripts/comfy/glb_info.mjs', glbPath], { encoding: 'utf8' }));
} catch (e) {
  errs.push('GLB_INFO falhou: ' + String(e.message).slice(0, 120));
}
const budgetsOk = !!info && info.tris <= MAX_TRIS && sizeMb <= MAX_MB && info.uv0 === true;

console.log('📸 /tmp/opencode/qa_char_preview.png | modelo:', model,
  '| fps médio (swiftshader):', fps, '| erros:', errs.length ? errs.join(' | ') : 'NENHUM');
console.log(`📦 budgets: tris=${info ? info.tris : '?'} (<=${MAX_TRIS}) | ${sizeMb.toFixed(2)} MB (<=${MAX_MB}) | uv0=${info ? info.uv0 : '?'}`);

await browser.close();
srv.close();

const ok = errs.length === 0 && fps !== null && fps >= minFps && budgetsOk;
console.log(ok ? `✅ GATE OK (carregou, sem erros, fps ${fps} >= ${minFps}, budgets ok)`
              : `❌ GATE FALHOU (fps=${fps}, min=${minFps}, erros=${errs.length}, budgets=${budgetsOk})`);
process.exit(ok ? 0 : 1);
