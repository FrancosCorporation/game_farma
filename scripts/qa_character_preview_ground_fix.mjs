#!/usr/bin/env node
// Local browser QA for the public character-preview page and its cycle-wide floor calibration.
// Usage: node scripts/qa_character_preview_ground_fix.mjs [candidate.glb] [screenshot.png]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const candidate = resolve(process.argv[2] || join(root, 'public/models/ana_walk_preview.glb'));
const screenshot = resolve(process.argv[3] || '/tmp/ana_preview_ground_fix.png');
await stat(candidate);
const previewPage = join(root, 'public/char-preview.html');
const vendorRoot = resolve(root, 'public/vendor/three');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  try {
    if (pathname === '/' || pathname === '/char-preview.html') {
      const body = await readFile(previewPage);
      res.writeHead(200, { 'content-type': mime['.html'], 'cache-control': 'no-store' });
      res.end(body);
    } else if (pathname === '/models/ana_walk_preview.glb') {
      const body = await readFile(candidate);
      res.writeHead(200, { 'content-type': mime['.glb'], 'content-length': body.length, 'cache-control': 'no-store' });
      res.end(body);
    } else if (pathname.startsWith('/vendor/three/')) {
      const file = resolve(vendorRoot, decodeURIComponent(pathname.slice('/vendor/three/'.length)));
      const rel = relative(vendorRoot, file);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } else {
      res.writeHead(404); res.end('Not found');
    }
  } catch (error) {
    res.writeHead(error?.code === 'ENOENT' ? 404 : 500); res.end('Preview QA server error');
  }
});

await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  const logs = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.text().includes('[ground-fix]')) logs.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__groundFixData), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshot });
  const data = await page.evaluate(() => ({ ready: window.__ready, animation: window.__anim, groundFix: window.__groundFixData }));
  console.log(JSON.stringify({ candidate, screenshot, ...data, console: logs, browserErrors: errors }, null, 2));
  const failures = [];
  if (!data.ready || data.animation !== 'Walk') failures.push('preview não carregou o Walk');
  if (data.groundFix?.status !== 'pass') failures.push('ground-fix não passou');
  if (data.groundFix?.phaseSamples < 2) failures.push('ground-fix não amostrou o ciclo');
  if (Math.abs((data.groundFix?.predictedMinYAfter ?? Infinity) - (data.groundFix?.clearance ?? -Infinity)) > 1e-5) failures.push('folga do piso não corresponde ao mínimo previsto');
  if (errors.length) failures.push('erros no navegador');
  console.log(failures.length ? `❌ preview ground QA: ${failures.join('; ')}` : '✅ preview ground QA: Walk e calibração pelo ciclo completo OK');
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
