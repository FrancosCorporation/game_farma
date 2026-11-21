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
const testTravel = process.env.PREVIEW_QA_TRAVEL === '1';
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
  await page.goto(`http://127.0.0.1:${server.address().port}/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full${testTravel ? '&travel=1' : ''}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__groundFixData), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const travelAudit = testTravel ? await page.evaluate(() => {
    // Pause rAF playback, then step clip and root together deterministically.
    window.__playing = false;
    const start = { rootZ: window.__model.position.z, cameraZ: window.__camera.position.z,
      targetZ: window.__controls.target.z, time: window.__mixer.time, distance: window.__previewTravel.distance };
    for (let i = 0; i < 120; i++) {
      window.__playing = true; window.__advancePreview(1 / 60); window.__playing = false;
    }
    window.__model.updateMatrixWorld(true);
    window.__controls.update(); window.__renderer.render(window.__scene, window.__camera);
    const travel = window.__previewTravel;
    const displacement = window.__model.position.z - start.rootZ;
    return { ...travel, simulatedSeconds: 2, displacement, expectedDisplacement: travel.speed * 2,
      cameraFollowError: Math.abs(window.__camera.position.z - start.cameraZ - displacement),
      targetFollowError: Math.abs(window.__controls.target.z - start.targetZ - displacement),
      clipTimeError: Math.abs(window.__mixer.time - start.time - 2) };
  }) : null;
  await page.screenshot({ path: screenshot });
  const data = await page.evaluate(() => {
    const key = window.__scene.children.find(o => o.isDirectionalLight && o.castShadow);
    const meshes = []; window.__model.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { ready: window.__ready, animation: window.__anim, groundFix: window.__groundFixData,
      shadows: { bias: key?.shadow.bias, normalBias: key?.shadow.normalBias,
        near: key?.shadow.camera.near, far: key?.shadow.camera.far,
        characterCastsAndReceives: meshes.length > 0 && meshes.every(o => o.castShadow && o.receiveShadow) } };
  });
  console.log(JSON.stringify({ candidate, screenshot, ...data, travelAudit, console: logs, browserErrors: errors }, null, 2));
  const failures = [];
  if (!data.ready || data.animation !== 'Walk') failures.push('preview não carregou o Walk');
  if (data.groundFix?.status !== 'pass') failures.push('ground-fix não passou');
  if (data.groundFix?.phaseSamples < 2) failures.push('ground-fix não amostrou o ciclo');
  if (Math.abs((data.groundFix?.predictedMinYAfter ?? Infinity) - (data.groundFix?.clearance ?? -Infinity)) > 1e-5) failures.push('folga do piso não corresponde ao mínimo previsto');
  if (errors.length) failures.push('erros no navegador');
  if (testTravel && (!travelAudit?.enabled || !(travelAudit.speed > 0) ||
    Math.abs(travelAudit.displacement - travelAudit.expectedDisplacement) > 1e-6 ||
    travelAudit.cameraFollowError > 1e-6 || travelAudit.targetFollowError > 1e-6 || travelAudit.clipTimeError > 1e-6)) failures.push('avanço, câmera ou tempo da caminhada incoerentes');
  if (data.shadows?.bias !== -0.0001 || data.shadows?.normalBias !== 0.005 || data.shadows?.near !== 0.5 || data.shadows?.far !== 20 || !data.shadows?.characterCastsAndReceives) failures.push('calibração de sombra ausente ou sombras da personagem desativadas');
  console.log(failures.length ? `❌ preview ground QA: ${failures.join('; ')}` : '✅ preview ground QA: Walk e calibração pelo ciclo completo OK');
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
