import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { auditProductionPublicAssets, collectProductionPublicAssetPlan } from './public_build_assets.mjs';

const root = process.cwd();
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist');
const result = await auditProductionPublicAssets({ root, outDir });
const plan = await collectProductionPublicAssetPlan({ root });
const dockerIgnore = await readFile(path.join(root, '.dockerignore'), 'utf8');
const dockerIgnoreLines = new Set(dockerIgnore.split(/\r?\n/).map((line) => line.trim()));

assert.equal(result.reviewModelHashesChecked, 14, 'the review build must retain all 14 hashed patient models');
assert.ok(result.candidateFilesCopied >= 14, 'the build must retain patient models and candidate pharmacy props');
assert.ok(dockerIgnoreLines.has('public/models/candidates/**'), 'Docker context must exclude source-only candidate models');
assert.ok(dockerIgnoreLines.has('!public/models/candidates/'), 'Docker context must retain the candidate model directory');
for (const relativePath of plan.candidateFiles) {
  assert.ok(dockerIgnoreLines.has('!public/' + relativePath), 'Docker context must retain required model ' + relativePath);
}
console.log('PASS public build assets: ' + result.candidateFilesCopied
  + ' candidate models retained; Docker ignore allowlist matches runtime references; all '
  + result.reviewModelHashesChecked + ' review model hashes match.');
