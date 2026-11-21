import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const deploy = join(root, 'scripts/deploy.sh');
const deploySource = await readFile(deploy, 'utf8');
const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');
const temp = await mkdtemp(join(tmpdir(), 'farmacheck-deploy-contract-'));
const fakeBin = join(temp, 'bin');
const dockerLog = join(temp, 'docker-called.log');
await mkdir(fakeBin);
const fakeDocker = join(fakeBin, 'docker');
await writeFile(fakeDocker, '#!/bin/sh\nprintf called >> "$FAKE_DOCKER_LOG"\nexit 97\n');
await chmod(fakeDocker, 0o755);

const baseEnv = {
  ...process.env,
  PATH: `${fakeBin}:${process.env.PATH}`,
  FAKE_DOCKER_LOG: dockerLog,
  GAME_FARMA_RELEASE_ID: 'contract-tests',
};
function run(args, overrides = {}) {
  return spawnSync('bash', [deploy, ...args], {
    cwd: root,
    env: { ...baseEnv, ...overrides },
    encoding: 'utf8',
    timeout: 5000,
  });
}

try {
  assert.match(dockerfile, /CMD \["node", "server\/healthProbe\.mjs"\]/,
    'Docker HEALTHCHECK must run the strict JSON readiness probe');
  assert.match(deploySource, /docker exec "\$container_name" node server\/healthProbe\.mjs/,
    'staged/replacement images must pass the same strict readiness contract');
  assert.match(deploySource, /wait_legacy_rollback_smoke/,
    'rollback to a pre-probe image uses an explicitly named legacy page smoke');
  assert.match(deploySource, /RESTORED_IMAGE_ID.*PREVIOUS_IMAGE_ID/s,
    'rollback must restore the exact previous image ID');
  assert.match(deploySource, /grep --fixed-strings '<title>FarmaCheck'/,
    'public verification must inspect FarmaCheck page content, not HTTP 200 alone');

  const dryRun = run(['--dry-run']);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /nenhuma alteração executada/);

  const productionBlocked = run(['--apply']);
  assert.equal(productionBlocked.status, 2);
  assert.match(productionBlocked.stderr, /CONFIRM_GAME_FARMA_PRODUCTION=YES/);

  const productionCannotSkipBuild = run(['--apply'], {
    CONFIRM_GAME_FARMA_PRODUCTION: 'YES',
    GAME_FARMA_SKIP_BUILD: 'YES',
  });
  assert.equal(productionCannotSkipBuild.status, 2);
  assert.match(productionCannotSkipBuild.stderr, /só pode ser usado em --sandbox/);

  const productionLocalHealth = run(['--apply'], {
    CONFIRM_GAME_FARMA_PRODUCTION: 'YES',
    PUB_URL: 'http://127.0.0.1:4174/',
  });
  assert.equal(productionLocalHealth.status, 2);
  assert.match(productionLocalHealth.stderr, /URL de health de produção não pode apontar para loopback/);

  const sandboxBase = {
    CONFIRM_GAME_FARMA_SANDBOX: 'YES',
    GAME_FARMA_CONTAINER_NAME: 'game_farma_test_contract',
    GAME_FARMA_IMAGE_REPO: 'game_farma_test_contract',
    GAME_FARMA_NETWORK: 'game_farma_test_contract',
    PUB_URL: 'http://127.0.0.1:49100/',
  };
  const sandboxUnconfirmed = run(['--sandbox'], { ...sandboxBase, CONFIRM_GAME_FARMA_SANDBOX: '' });
  assert.equal(sandboxUnconfirmed.status, 2);
  assert.match(sandboxUnconfirmed.stderr, /CONFIRM_GAME_FARMA_SANDBOX=YES/);

  const sandboxProductionNames = run(['--sandbox'], {
    ...sandboxBase,
    GAME_FARMA_CONTAINER_NAME: 'game_farma',
  });
  assert.equal(sandboxProductionNames.status, 2);
  assert.match(sandboxProductionNames.stderr, /game_farma_test_/);

  const sandboxRemoteUrl = run(['--sandbox'], {
    ...sandboxBase,
    PUB_URL: 'http://127.0.0.1.attacker.example:49100/',
  });
  assert.equal(sandboxRemoteUrl.status, 2);
  assert.match(sandboxRemoteUrl.stderr, /PUB_URL deve usar/);

  const sandboxInvalidPort = run(['--sandbox'], {
    ...sandboxBase,
    PUB_URL: 'http://localhost:65536/',
  });
  assert.equal(sandboxInvalidPort.status, 2);
  assert.match(sandboxInvalidPort.stderr, /porta de PUB_URL/);

  const guardedCalls = [dryRun, productionBlocked, productionCannotSkipBuild, productionLocalHealth, sandboxUnconfirmed, sandboxProductionNames, sandboxRemoteUrl, sandboxInvalidPort];
  assert.ok(guardedCalls.every((result) => result.status !== 97), 'invalid or read-only modes never invoke Docker');
  await assert.rejects(readFile(dockerLog), { code: 'ENOENT' }, 'all guarded paths remain Docker-free');

  const validSandboxReachesDocker = run(['--sandbox'], sandboxBase);
  assert.equal(validSandboxReachesDocker.status, 2, validSandboxReachesDocker.stderr);
  assert.match(validSandboxReachesDocker.stderr, /Container game_farma_test_contract não existe/);
  assert.match(await readFile(dockerLog, 'utf8'), /called/);

  console.log('✅ deploy contract: dry-run is read-only; production apply requires confirmation and rejects loopback health URLs; sandbox rejects unsafe names, URLs, ports, and confirmations before Docker.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
