// Full deploy/rollback exercise using only uniquely named temporary Docker resources.
// Usage: npm run qa:deploy-sandbox (does not target the production container/network).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

const suffix = `${process.pid}_${Date.now().toString(36)}`;
const prefix = `game_farma_test_${suffix}`;
const network = prefix;
const container = prefix;
const proxy = `${prefix}_proxy`;
const imageRepo = prefix;
const fixtureTag = `${imageRepo}:fixture`;
const candidateFixtureTag = `${imageRepo}:candidate-fixture`;
const marker = `ROLLBACK_FIXTURE_${suffix}`;
const candidateMarker = `CANDIDATE_FIXTURE_${suffix}`;
const useFixtureCandidate = process.env.GAME_FARMA_QA_CANDIDATE_FIXTURE === 'YES';
const prebuiltCandidateImage = process.env.GAME_FARMA_QA_CANDIDATE_IMAGE || '';
if (useFixtureCandidate && prebuiltCandidateImage) {
  throw new Error('Escolha GAME_FARMA_QA_CANDIDATE_FIXTURE ou GAME_FARMA_QA_CANDIDATE_IMAGE, não ambos.');
}
const usePrebuiltCandidate = useFixtureCandidate || Boolean(prebuiltCandidateImage);
const releaseSuccess = `qa-${suffix}-success`;
const releaseRollback = `qa-${suffix}-rollback`;
const tagsToRemove = [
  fixtureTag,
  candidateFixtureTag,
  `${imageRepo}:release-${releaseSuccess}`,
  `${imageRepo}:rollback-${releaseSuccess}`,
  `${imageRepo}:latest`,
  `${imageRepo}:release-${releaseRollback}`,
  `${imageRepo}:rollback-${releaseRollback}`,
];
const temp = await mkdtemp(join(tmpdir(), 'farmacheck-deploy-sandbox-'));
let publicPort;
let networkCreated = false;
const createdContainers = new Set();

function run(command, args, { env = process.env, timeout = 120000, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} saiu com ${result.status ?? result.signal}:\n${output}`);
  }
  return { status: result.status, output };
}

function docker(args, options) {
  return run('docker', args, options);
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPublicHealth(expectedStatus, expectedMarker = '') {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${publicPort}/`, { signal: AbortSignal.timeout(1500) });
      const body = await response.text();
      lastStatus = response.status;
      if (response.status === expectedStatus && (!expectedMarker || body.includes(expectedMarker))) return;
    } catch { /* proxy is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`proxy não atingiu HTTP ${expectedStatus}; último status=${lastStatus}`);
}

function startFixture() {
  docker(['run', '--detach', '--name', container, '--network', network,
    '-e', 'PORT=4174', '-e', `FIXTURE_MARKER=${marker}`, fixtureTag]);
  createdContainers.add(container);
}

function startProxy(expectedMarker = '') {
  const proxyServer = [
    "const http=require('node:http');",
    "const target=process.env.TARGET;",
    "const marker=process.env.EXPECT_MARKER||'';",
    "http.createServer(async(_req,res)=>{try{const upstream=await fetch('http://'+target+':4174/');const body=await upstream.text();const healthy=upstream.ok&&(!marker||body.includes(marker));res.writeHead(healthy?200:503,{'content-type':'text/plain'});res.end(body)}catch{res.writeHead(503);res.end('upstream unavailable')}}).listen(8080,'0.0.0.0');",
  ].join('');
  docker(['run', '--detach', '--name', proxy, '--network', network,
    '--publish', `127.0.0.1:${publicPort}:8080`,
    '-e', `TARGET=${container}`, '-e', `EXPECT_MARKER=${expectedMarker}`,
    'node:20.19-alpine', 'node', '-e', proxyServer]);
  createdContainers.add(proxy);
}

function deploy(releaseId, usePrebuiltSandboxImage = false) {
  const result = run('bash', ['scripts/deploy.sh', '--sandbox'], {
    timeout: 900000,
    env: {
      ...process.env,
      CONFIRM_GAME_FARMA_SANDBOX: 'YES',
      GAME_FARMA_CONTAINER_NAME: container,
      GAME_FARMA_IMAGE_REPO: imageRepo,
      GAME_FARMA_NETWORK: network,
      GAME_FARMA_RELEASE_ID: releaseId,
      GAME_FARMA_HEALTH_ATTEMPTS: '4',
      GAME_FARMA_HEALTH_INTERVAL: '1',
      GAME_FARMA_PORT: '4174',
      GAME_FARMA_SKIP_BUILD: usePrebuiltSandboxImage ? 'YES' : '',
      PUB_URL: `http://127.0.0.1:${publicPort}/`,
    },
    allowFailure: true,
  });
  return result;
}

try {
  docker(['image', 'inspect', 'node:20.19-alpine']);
  publicPort = await getFreePort();

  const fixtureDir = join(temp, 'fixture');
  const fixtureProgram = `const http=require('node:http');const marker=${JSON.stringify(marker)};http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body>'+marker+'</body></html>')}).listen(Number(process.env.PORT||4174),'0.0.0.0')`;
  const fixtureDockerfile = `FROM node:20.19-alpine\nENV PORT=4174\nCMD ${JSON.stringify(['node', '-e', fixtureProgram])}\n`;
  await mkdir(fixtureDir);
  await writeFile(join(fixtureDir, 'Dockerfile'), fixtureDockerfile);
  docker(['build', '--tag', fixtureTag, fixtureDir], { timeout: 900000 });
  if (useFixtureCandidate) {
    const candidateDir = join(temp, 'candidate-fixture');
    const candidateProgram = `const http=require('node:http');const marker=${JSON.stringify(candidateMarker)};http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body>'+marker+'</body></html>')}).listen(Number(process.env.PORT||4174),'0.0.0.0')`;
    await mkdir(candidateDir);
    await writeFile(join(candidateDir, 'Dockerfile'), `FROM node:20.19-alpine\nENV PORT=4174\nCMD ${JSON.stringify(['node', '-e', candidateProgram])}\n`);
    docker(['build', '--tag', candidateFixtureTag, candidateDir], { timeout: 900000 });
    docker(['tag', candidateFixtureTag, `${imageRepo}:release-${releaseSuccess}`]);
  } else if (prebuiltCandidateImage) {
    docker(['image', 'inspect', prebuiltCandidateImage]);
    docker(['tag', prebuiltCandidateImage, `${imageRepo}:release-${releaseSuccess}`]);
  }
  docker(['network', 'create', network]);
  networkCreated = true;

  startFixture();
  startProxy();
  await waitForPublicHealth(200);
  const success = deploy(releaseSuccess, usePrebuiltCandidate);
  assert.equal(success.status, 0, success.output);
  assert.match(success.output, /Deploy saudável/);
  await waitForPublicHealth(200);
  const deployedImage = docker(['container', 'inspect', '--format', '{{.Image}}', container]).output.trim();
  const expectedReleaseImage = docker(['image', 'inspect', '--format', '{{.Id}}', `${imageRepo}:release-${releaseSuccess}`]).output.trim();
  assert.equal(deployedImage, expectedReleaseImage, 'success path leaves the versioned candidate running');

  docker(['rm', '--force', proxy]);
  createdContainers.delete(proxy);
  docker(['rm', '--force', container]);
  createdContainers.delete(container);
  docker(['tag', deployedImage, `${imageRepo}:release-${releaseRollback}`]);
  startFixture();
  startProxy(marker);
  await waitForPublicHealth(200, marker);

  const rollback = deploy(releaseRollback, true);
  assert.equal(rollback.status, 1, rollback.output);
  assert.match(rollback.output, /Rollback saudável restaurado/);
  await waitForPublicHealth(200, marker);
  const restoredImage = docker(['container', 'inspect', '--format', '{{.Image}}', container]).output.trim();
  const fixtureImage = docker(['image', 'inspect', '--format', '{{.Id}}', fixtureTag]).output.trim();
  assert.equal(restoredImage, fixtureImage, 'rollback restores the exact pre-deploy image ID');
  const latestImage = docker(['image', 'inspect', '--format', '{{.Id}}', `${imageRepo}:latest`]).output.trim();
  assert.equal(latestImage, fixtureImage, 'latest points back to the restored image after rollback');

  const candidateDescription = useFixtureCandidate
    ? 'prebuilt isolated fixture candidate'
    : prebuiltCandidateImage
      ? `prebuilt app image ${prebuiltCandidateImage}`
      : 'repository candidate build';
  console.log(`✅ deploy sandbox: ${candidateDescription}, isolated canary, container replacement, public-health success, failed candidate detection, and exact-image rollback all PASS. Production resources were not targeted.`);
} finally {
  for (const name of createdContainers) {
    try { docker(['rm', '--force', name], { allowFailure: true }); } catch { /* preserve the original failure */ }
  }
  if (networkCreated) {
    try { docker(['network', 'rm', network], { allowFailure: true }); } catch { /* preserve the original failure */ }
  }
  for (const tag of tagsToRemove) {
    try { docker(['image', 'rm', '--force', tag], { allowFailure: true }); } catch { /* preserve the original failure */ }
  }
  await rm(temp, { recursive: true, force: true });
}
