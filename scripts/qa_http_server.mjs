// Isolated regression checks for URI errors, static 404s, and SPA navigation.
// Usage: npm run qa:http-server (requires the current dist/ build).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function getFreePort() {
  const probe = createServer();
  await new Promise((ok, fail) => {
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', ok);
  });
  const port = probe.address().port;
  await new Promise((ok, fail) => probe.close((error) => error ? fail(error) : ok()));
  return port;
}
const port = await getFreePort();

const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, NVIDIA_API_KEY: '', HOST: '127.0.0.1', PORT: String(port), FARMA_DIST_DIR: resolve(root, 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
let noBuildChild;
let noBuildDir;

async function stopChild(processChild) {
  if (!processChild || processChild.exitCode !== null || processChild.signalCode !== null) return;
  await new Promise((ok) => {
    processChild.once('close', ok);
    processChild.kill('SIGTERM');
  });
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${base}/`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'isolated server starts and serves the root page');

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200, 'liveness endpoint responds while server is running');
  assert.deepEqual(await health.json(), { status: 'ok' });
  const readiness = await fetch(`${base}/readyz`);
  assert.equal(readiness.status, 200, 'readiness endpoint confirms built entry point exists');
  assert.deepEqual(await readiness.json(), { status: 'ready' });
  const healthWrongMethod = await fetch(`${base}/healthz`, { method: 'POST' });
  assert.equal(healthWrongMethod.status, 405, 'health endpoints reject mutation methods');
  const nvidiaFallbackDisabled = await fetch(`${base}/api/llm/fallback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  assert.equal(nvidiaFallbackDisabled.status, 503, 'NVIDIA fallback fails closed when no server-side key is configured');
  const nvidiaFallbackWrongOrigin = await fetch(`${base}/api/llm/fallback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  assert.equal(nvidiaFallbackWrongOrigin.status, 403, 'NVIDIA fallback rejects cross-origin browser requests');

  const malformed = await fetch(`${base}/%ZZ`);
  assert.equal(malformed.status, 400, 'malformed percent-encoding returns HTTP 400');
  assert.equal(child.exitCode, null, 'malformed URI does not terminate the server');

  const privateMarker = 'DO_NOT_LOG_QUERY_SECRET_7fa2';
  const missingGlb = await fetch(`${base}/models/not-present.glb?token=${privateMarker}`);
  assert.equal(missingGlb.status, 404, 'missing GLB is not a successful SPA response');
  assert.match(missingGlb.headers.get('content-type') || '', /^text\/plain/);
  assert.doesNotMatch(await missingGlb.text(), /<html|<!doctype/i);

  const spa = await fetch(`${base}/client/route`, { headers: { Accept: 'text/html' } });
  assert.equal(spa.status, 200, 'extensionless browser navigation retains SPA fallback');
  assert.match(await spa.text(), /<!doctype html/i);

  const traversal = await fetch(`${base}/%2e%2e%2fpackage.json`);
  assert.notEqual(traversal.status, 200, 'encoded traversal cannot read outside dist');

  const apiWrongMethod = await fetch(`${base}/api/case/next`);
  assert.equal(apiWrongMethod.status, 405, 'case API rejects the wrong HTTP method');
  const api = await fetch(`${base}/api/case/next`, { method: 'POST' });
  assert.equal(api.status, 200, 'valid case API request remains available after bad input');
  const caseDto = await api.json();
  assert.equal(typeof caseDto.id, 'string');
  assert.equal(caseDto.id.includes('_s'), false, 'API returns the canonical case ID');
  assert.equal(Number.isSafeInteger(caseDto.seed), true, 'API returns a bounded integer seed');
  assert.deepEqual(Object.keys(caseDto).sort(), ['id', 'seed'], 'API exposes only the minimal case DTO');
  assert.equal(child.exitCode, null, 'server remains live after all probes');

  const accessLogs = stdout.split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === 'http_access');
  assert.ok(accessLogs.some((entry) => entry.route === 'healthz' && entry.status === 200));
  assert.ok(accessLogs.some((entry) => entry.route === 'readyz' && entry.status === 200));
  assert.ok(accessLogs.some((entry) => entry.route === 'static:glb' && entry.status === 404));
  assert.ok(accessLogs.some((entry) => entry.route === 'spa-fallback' && entry.status === 200));
  assert.ok(accessLogs.every((entry) => typeof entry.duration_ms === 'number' && entry.duration_ms >= 0));
  assert.ok(accessLogs.every((entry) => Object.keys(entry).sort().join(',') === 'duration_ms,event,method,route,status'));
  assert.doesNotMatch(stdout + stderr, new RegExp(privateMarker));
  assert.doesNotMatch(stdout + stderr, /not-present\.glb|%ZZ|package\.json/);

  noBuildDir = await mkdtemp(join(tmpdir(), 'farmacheck-empty-dist-'));
  const noBuildPort = await getFreePort();
  noBuildChild = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(noBuildPort), FARMA_DIST_DIR: noBuildDir },
    stdio: 'ignore',
  });
  let noBuildReady = false;
  for (let i = 0; i < 100; i++) {
    if (noBuildChild.exitCode !== null) throw new Error(`no-build server exited early (${noBuildChild.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${noBuildPort}/healthz`);
      if (response.status === 200) { noBuildReady = true; break; }
    } catch { /* server is still starting */ }
    await wait(50);
  }
  assert.equal(noBuildReady, true, 'server process starts even when the build directory is absent');
  const notReady = await fetch(`http://127.0.0.1:${noBuildPort}/readyz`);
  assert.equal(notReady.status, 503, 'readiness returns HTTP 503 when dist/index.html is absent');
  assert.deepEqual(await notReady.json(), { status: 'not_ready' });
  assert.equal(noBuildChild.exitCode, null, 'missing build does not terminate the live server');
  console.log('✅ HTTP server QA: health/readiness (200/503), privacy-safe access logs, malformed URI, traversal, static 404, SPA navigation, and API PASS');
} finally {
  await Promise.all([stopChild(child), stopChild(noBuildChild)]);
  if (noBuildDir) await rm(noBuildDir, { recursive: true, force: true });
}
