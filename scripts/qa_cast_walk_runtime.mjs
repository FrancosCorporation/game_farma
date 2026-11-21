// Detailed in-game walk/contact QA for every model listed in the review roster.
// Starts a private Vite server by default; set QA_URL to reuse an existing one.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForHttp } from './util/wait_for_http.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(process.env.CAST_WALK_QA_OUTPUT || '.planning/2026-10-12-melhoria-integral/implementation/20261016_cast_walk_runtime');
const timeoutMs = Number(process.env.CAST_WALK_QA_TIMEOUT_MS || 300_000);
const manifestPath = resolve(root, 'public/patient-review.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const requestedPatientIds = new Set((process.env.CAST_WALK_QA_PATIENT_IDS || '')
  .split(',').map((id) => id.trim()).filter(Boolean));
const patients = manifest.patients.filter((patient) => patient.model
  && (!requestedPatientIds.size || requestedPatientIds.has(patient.id)));
const report = {
  schema: 1,
  startedAt: new Date().toISOString(),
  outputDir,
  source: 'public/patient-review.json',
  server: null,
  patients: [],
};

if (requestedPatientIds.size) {
  const selectedIds = new Set(patients.map((patient) => patient.id));
  assert.deepEqual([...selectedIds].sort(), [...requestedPatientIds].sort(),
    'every requested runtime-QA patient must exist in the review roster');
} else {
  assert.equal(patients.length, 14, 'expected all 14 roster characters with a model');
}
mkdirSync(outputDir, { recursive: true });

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const { port } = server.address();
  await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return port;
}

let vite = null;
let baseUrl = process.env.QA_URL;
try {
  if (!baseUrl) {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}/`;
    vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let viteStderr = '';
    vite.stderr.setEncoding('utf8');
    vite.stderr.on('data', (chunk) => { viteStderr = `${viteStderr}${chunk}`.slice(-8000); });
    try {
      await waitForHttp(baseUrl, { processRef: vite });
    } catch (error) {
      throw new Error(`${error.message}${viteStderr ? `\n${viteStderr}` : ''}`);
    }
    report.server = { managed: true, url: baseUrl };
  } else {
    await waitForHttp(baseUrl);
    report.server = { managed: false, url: baseUrl };
  }

  console.log(`Walk/contact runtime QA — ${patients.length} characters${requestedPatientIds.size ? ` [${[...requestedPatientIds].join(', ')}]` : ''} at ${baseUrl}`);
  for (const [index, patient] of patients.entries()) {
    const relativeModel = `models/${patient.model}.glb`;
    const candidatePath = resolve(root, 'public', relativeModel);
    const slug = patient.id.replace(/[^a-z0-9_-]+/gi, '_');
    const caseDir = join(outputDir, slug);
    mkdirSync(caseDir, { recursive: true });
    const childReport = join(caseDir, 'report.json');
    const logPath = join(caseDir, 'run.log');
    const started = Date.now();
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/qa_character_walk.mjs'), baseUrl, candidatePath], {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 12 * 1024 * 1024,
      env: {
        ...process.env,
        WALK_QA_OUTPUT_DIR: caseDir,
        WALK_QA_REPORT_PATH: childReport,
        WALK_QA_TRACE: join(caseDir, 'trace.json'),
      },
    });
    const elapsedSeconds = +((Date.now() - started) / 1000).toFixed(1);
    const log = `${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`;
    writeFileSync(logPath, log);
    let child = null;
    try { child = JSON.parse(readFileSync(childReport, 'utf8')); } catch {}
    const status = result.status === 0 && child?.result === 'PASS' ? 'PASS' : 'FAIL';
    const row = {
      caseId: patient.id,
      name: patient.name,
      model: patient.model,
      galleryStatus: patient.status,
      status,
      elapsedSeconds,
      report: join(slug, 'report.json'),
      log: join(slug, 'run.log'),
      screenshots: ['ntr_entry_walk.png', 'ntr_idle.png', 'ntr_walk.png'].map((file) => join(slug, file)),
      failures: child?.failures || (status === 'FAIL' ? [result.error?.message || `runtime QA exited ${result.status ?? 'without a status'}`] : []),
      metrics: child ? {
        bones: child.bones,
        arrivalMeters: child.entry?.distance,
        arrivalSamples: child.entry?.samples,
        strideMaxMeters: child.walk?.strideMax,
        maxSupportGapMeters: child.walk?.maxSupportGap,
        deepestSolePenetrationMeters: child.walk?.deepestSolePenetration,
        bothFeetElevatedPercent: child.walk?.bothFeetElevatedPercent,
        supportDriftMeters: Object.fromEntries(Object.entries(child.walk?.supportDrift || {}).map(([side, value]) => [side, value.maxHorizontalSpanMeters])),
      } : null,
    };
    report.patients.push(row);
    writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify({ ...report, updatedAt: new Date().toISOString() }, null, 2)}\n`);
    console.log(`${status} ${String(index + 1).padStart(2, '0')}/${patients.length} ${patient.name} (${patient.id}) — ${elapsedSeconds}s${row.failures.length ? ` — ${row.failures.join('; ')}` : ''}`);
  }
} catch (error) {
  report.infrastructureFailure = error.message;
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => vite.once('exit', resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ]);
    if (vite.exitCode === null) vite.kill('SIGKILL');
  }
  report.finishedAt = new Date().toISOString();
  report.passCount = report.patients.filter((patient) => patient.status === 'PASS').length;
  report.failCount = report.patients.filter((patient) => patient.status === 'FAIL').length;
  writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}

if (report.infrastructureFailure || report.failCount > 0) process.exitCode = 1;
