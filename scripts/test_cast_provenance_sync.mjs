import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRefreshedLedger, refreshArtifactDigests } from './sync_cast_provenance.mjs';

const root = await mkdtemp(join(tmpdir(), 'farmacheck-provenance-sync-'));
const outside = await mkdtemp(join(tmpdir(), 'farmacheck-provenance-outside-'));
try {
  await mkdir(join(root, 'assets'));
  const payload = Buffer.from('candidate-v002-bytes');
  await writeFile(join(root, 'assets', 'candidate.glb'), payload);
  const expectedDigest = createHash('sha256').update(payload).digest('hex');
  const input = {
    'case.mesh': {
      path: 'assets/candidate.glb',
      bytes: 1,
      sha256: '0'.repeat(64),
      reviewNote: 'kept by sync',
    },
  };

  const result = await refreshArtifactDigests(input, root);
  assert.equal(result.changes.length, 1);
  assert.equal(result.artifacts['case.mesh'].bytes, payload.length);
  assert.equal(result.artifacts['case.mesh'].sha256, expectedDigest);
  assert.equal(result.artifacts['case.mesh'].reviewNote, 'kept by sync');
  assert.equal(input['case.mesh'].bytes, 1, 'sync does not mutate the caller ledger');

  const ledgerPath = join(root, 'ledger.json');
  const initialLedger = {
    updated: '2026-01-01',
    verification: { checkedAt: '2026-01-01T00:00:00.000Z', policy: 'preserve' },
    patients: [{ caseId: 'case-a', stages: { meshLod: { status: 'approved_candidate', artifacts: ['case.mesh'] } } }],
    artifacts: input,
  };
  await writeFile(ledgerPath, `${JSON.stringify(initialLedger, null, 2)}\n`);
  const written = await persistRefreshedLedger(
    ledgerPath,
    initialLedger,
    result.artifacts,
    new Date('2026-10-14T12:00:00.000Z'),
  );
  const restored = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.deepEqual(restored, written);
  assert.equal(restored.updated, '2026-10-14');
  assert.equal(restored.verification.policy, 'preserve');
  assert.deepEqual(restored.patients, initialLedger.patients, 'stage state and review remain unchanged');
  assert.equal(restored.artifacts['case.mesh'].sha256, expectedDigest);

  await assert.rejects(
    refreshArtifactDigests({ bad: { path: '../outside.bin', bytes: 1, sha256: '0'.repeat(64) } }, root),
    /escapa do repositório/,
  );
  await writeFile(join(outside, 'external.bin'), 'outside');
  await symlink(join(outside, 'external.bin'), join(root, 'assets', 'escape.bin'));
  await assert.rejects(
    refreshArtifactDigests({ bad: { path: 'assets/escape.bin', bytes: 1, sha256: '0'.repeat(64) } }, root),
    /caminho real escapa do repositório/,
  );
  await assert.rejects(
    refreshArtifactDigests({ missing: { path: 'assets/missing.glb', bytes: 1, sha256: '0'.repeat(64) } }, root),
    /arquivo não encontrado/,
  );

  const cliRoot = join(root, 'cli-fixture');
  await mkdir(join(cliRoot, 'scripts'), { recursive: true });
  await mkdir(join(cliRoot, 'docs'));
  await mkdir(join(cliRoot, 'assets'));
  const cliArtifact = Buffer.from('cli-refresh-v002');
  await writeFile(join(cliRoot, 'assets', 'mesh.glb'), cliArtifact);
  const cliLedger = {
    updated: '2026-01-01',
    verification: { checkedAt: '2026-01-01T00:00:00.000Z', policy: 'keep' },
    patients: [{ caseId: 'case-cli', stages: { meshLod: { status: 'candidate', artifacts: ['mesh'] } } }],
    artifacts: { mesh: { path: 'assets/mesh.glb', bytes: 1, sha256: '0'.repeat(64) } },
  };
  const cliLedgerPath = join(cliRoot, 'docs', 'elenco_proveniencia.json');
  await writeFile(cliLedgerPath, `${JSON.stringify(cliLedger, null, 2)}\n`);
  const scriptSource = join(dirname(fileURLToPath(import.meta.url)), 'sync_cast_provenance.mjs');
  const cliScript = join(cliRoot, 'scripts', 'sync_cast_provenance.mjs');
  await copyFile(scriptSource, cliScript);

  const dryRun = spawnSync(process.execPath, [cliScript, '--check'], { encoding: 'utf8' });
  assert.equal(dryRun.status, 1, 'check exits nonzero when a digest is stale');
  assert.match(dryRun.stderr, /DRIFT mesh/);
  assert.deepEqual(JSON.parse(await readFile(cliLedgerPath, 'utf8')), cliLedger, 'check mode does not write');
  const writeRun = spawnSync(process.execPath, [cliScript, '--write'], { encoding: 'utf8' });
  assert.equal(writeRun.status, 0, writeRun.stderr);
  const writtenLedger = JSON.parse(await readFile(cliLedgerPath, 'utf8'));
  assert.equal(writtenLedger.artifacts.mesh.bytes, cliArtifact.length);
  assert.equal(writtenLedger.artifacts.mesh.sha256, createHash('sha256').update(cliArtifact).digest('hex'));
  assert.equal(writtenLedger.verification.policy, 'keep');
  assert.deepEqual(writtenLedger.patients, cliLedger.patients, 'CLI write preserves stage state');
  assert.deepEqual(await readdir(join(cliRoot, 'docs')), ['elenco_proveniencia.json'], 'atomic update leaves no temp file');

  console.log('✔ cast provenance sync: check/write atômico, metadados, estado preservado e paths seguros');
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
