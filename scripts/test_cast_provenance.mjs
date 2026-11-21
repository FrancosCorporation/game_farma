// Verify the per-stage cast provenance ledger against current files and game manifests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { CASES } from '../src/data/cases.js';
import { BOOT_MODEL, CASE_MODELS, REVIEW_CANDIDATE_MODELS, modelForCaseId } from '../src/data/patientAssets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const plan = JSON.parse(readFileSync(resolve(root, 'docs/elenco_planejado.json'), 'utf8'));
const gallery = JSON.parse(readFileSync(resolve(publicRoot, 'patient-review.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(resolve(root, 'docs/elenco_proveniencia.json'), 'utf8'));
const verificationMode = process.env.CAST_PROVENANCE_MODE ?? 'workspace';
const checkoutOptionalRoots = ledger.verification.checkoutOptionalRoots;
assert.ok(['workspace', 'checkout'].includes(verificationMode), 'CAST_PROVENANCE_MODE is workspace or checkout');
assert.deepEqual(checkoutOptionalRoots, [
  'ana_work',
  '.planning/2026-10-12-melhoria-integral/implementation',
  'public/models/candidates'
], 'checkout mode only skips the documented workspace-evidence roots');
assert.ok(typeof ledger.verification.checkoutPolicy === 'string' && ledger.verification.checkoutPolicy.length > 0,
  'checkout policy explains which local evidence can be unavailable');

function isCheckoutOptional(relativePath) {
  return checkoutOptionalRoots.some((rootPath) => relativePath === rootPath || relativePath.startsWith(`${rootPath}/`));
}

const stageNames = [
  'reference', 'referenceWorkflow', 'source3D', 'meshLod', 'rig',
  'walkIdle', 'technicalQA', 'visualReview', 'runtimeIntegration', 'publication'
];
const noEvidenceStatuses = new Set([
  'not_recorded', 'not_started', 'not_integrated', 'not_published', 'historical_workflow_not_normalized'
]);
const evidencePatterns = {
  reference: /\.(?:png|jpe?g|webp)$/i,
  referenceWorkflow: /\.(?:json|png|jpe?g|webp)$/i,
  source3D: /\.(?:glb|gltf|fbx)$/i,
  meshLod: /\.(?:glb|gltf)$/i,
  rig: /\.(?:fbx|glb|gltf)$/i,
  walkIdle: /\.glb$/i,
  technicalQA: /\.(?:json|log|png|jpe?g|webp|glb|gltf|fbx)$/i,
  visualReview: /\.(?:json|log|png|jpe?g|webp)$/i,
  runtimeIntegration: /\.(?:json|log|js|mjs|glb|gltf)$/i,
  publication: /\.glb$/i,
};
const evidenceStatusTokens = new Set([
  'approved', 'approval', 'candidate', 'current', 'integrated', 'pass', 'prepared', 'production',
  'published', 'reviewed', 'selected', 'verified'
]);

function assertStageEvidenceContract(stageName, stage, artifacts, label) {
  const status = stage.status;
  const ids = stage.artifacts;
  if (noEvidenceStatuses.has(status)) {
    assert.equal(ids.length, 0, `${label} ${status} stage cannot claim evidence artifacts`);
    return;
  }

  const statusTokens = status.split('_');
  // Historical approvals explain prior state, but are not current QA claims.
  if (statusTokens.includes('historical')) return;
  const signalsEvidence = statusTokens.some((token) => evidenceStatusTokens.has(token));
  if (!signalsEvidence) return;

  assert.ok(ids.length > 0, `${label} ${stageName} status ${status} requires evidence artifacts`);
  const pattern = evidencePatterns[stageName];
  assert.ok(pattern, `${stageName} has a declared evidence type policy`);
  assert.ok(ids.some((id) => pattern.test(artifacts[id]?.path ?? '')),
    `${label} ${stageName} status ${status} requires a matching evidence artifact`);
}

function assertCandidatePipelineCoherence(patient) {
  const { meshLod, rig, walkIdle, runtimeIntegration, publication } = patient.stages;
  if (runtimeIntegration.status !== 'local_candidate_runtime_qa_pass') return;

  assert.match(walkIdle.status, /structural_gate_pass/,
    `${patient.caseId} local runtime candidate must have a passing Walk/Idle gate`);
  assert.doesNotMatch(`${meshLod.status}_${rig.status}`, /(?:^|_)(?:rig_pending|outside_runtime|not_rigged)(?:_|$)/,
    `${patient.caseId} local runtime candidate cannot retain a pending/outside/unrigged mesh or rig status`);
  assert.notEqual(publication.status, 'live',
    `${patient.caseId} local review integration cannot imply production publication`);
}

assert.doesNotThrow(() => assertStageEvidenceContract('walkIdle', {
  status: 'structural_gate_pass', artifacts: ['walk']
}, { walk: { path: 'public/models/candidates/patient_walk.glb' } }, 'fixture'),
'a passing Walk stage accepts GLB evidence');
assert.throws(() => assertStageEvidenceContract('walkIdle', {
  status: 'structural_gate_pass', artifacts: []
}, {}, 'fixture'), /requires evidence artifacts/,
'a passing Walk status cannot exist without evidence');
assert.throws(() => assertStageEvidenceContract('walkIdle', {
  status: 'structural_gate_pass', artifacts: ['wrong-type']
}, { 'wrong-type': { path: 'docs/review.json' } }, 'fixture'), /requires a matching evidence artifact/,
'a passing Walk status requires a GLB, not an unrelated artifact');
assert.throws(() => assertStageEvidenceContract('runtimeIntegration', {
  status: 'not_integrated', artifacts: ['unexpected']
}, { unexpected: { path: 'public/models/patient.glb' } }, 'fixture'), /cannot claim evidence artifacts/,
'a not-integrated stage cannot carry promotion evidence');
assert.doesNotThrow(() => assertStageEvidenceContract('visualReview', {
  status: 'historical_approval_recorded', artifacts: []
}, {}, 'fixture'), 'historical approval is not treated as current visual QA');
assert.doesNotThrow(() => assertCandidatePipelineCoherence({ caseId: 'fixture', stages: {
  meshLod: { status: 'current_static_lod_v002' },
  rig: { status: 'candidate_rig_verified' },
  walkIdle: { status: 'structural_gate_pass' },
  runtimeIntegration: { status: 'local_candidate_runtime_qa_pass' },
  publication: { status: 'not_published' },
} }), 'local candidate integration may pass while publication stays pending');
assert.throws(() => assertCandidatePipelineCoherence({ caseId: 'fixture', stages: {
  meshLod: { status: 'current_static_lod_rig_pending' },
  rig: { status: 'candidate_rig_verified' },
  walkIdle: { status: 'structural_gate_pass' },
  runtimeIntegration: { status: 'local_candidate_runtime_qa_pass' },
  publication: { status: 'not_published' },
} }), /cannot retain a pending\/outside\/unrigged/,
'local runtime integration cannot coexist with an explicitly pending rig status');

const expectedWalkGates = {
  ana_coriza: { result: 'PASS', joints: 65, triangles: 149989, profile: 'mixamo-standard-65' },
  marina_amoxicilina: { result: 'PASS', joints: 33, triangles: 29999, profile: 'mixamo-index-33' },
  jose_gripe: { result: 'PASS', joints: 65, triangles: 29997, profile: 'mixamo-standard-65' },
  clara_cefaleia: { result: 'PASS', joints: 57, triangles: 30000, profile: 'mixamo-no-pinky-57' },
  nelson_infarto: { result: 'PASS', joints: 65, triangles: 28838, profile: 'mixamo-standard-65' },
  paulo_dor_lombar: { result: 'PASS', joints: 65, triangles: 28817, profile: 'mixamo-standard-65' },
  joao_queimacao: { result: 'PASS', joints: 57, triangles: 29292, profile: 'mixamo-no-pinky-57' },
  helena_avc: { result: 'PASS', joints: 57, triangles: 28623, profile: 'mixamo-no-pinky-57' },
  dona_rosa_hipotensao: { result: 'PASS', joints: 57, triangles: 29058, profile: 'mixamo-no-pinky-57' },
  carlos_asma: { result: 'PASS', joints: 33, triangles: 87744, profile: 'mixamo-index-33' },
  bia_apendicite: { result: 'PASS', joints: 65, triangles: 29350, profile: 'mixamo-standard-65' },
  carla_dengue: { result: 'PASS', joints: 65, triangles: 26296, profile: 'mixamo-standard-65' },
  roberto_dispepsia: { result: 'PASS', joints: 65, triangles: 29255, profile: 'mixamo-standard-65' },
  catia_dermatite: { result: 'PASS', joints: 65, triangles: 29244, profile: 'mixamo-standard-65' },
};

assert.equal(ledger.schema, 'farmacheck.cast-provenance.v1', 'provenance ledger schema');
assert.equal(plan.provenanceLedger, 'docs/elenco_proveniencia.json', 'planning roster links this provenance ledger');
assert.equal(ledger.patients.length, CASES.length, 'provenance covers all canonical cases');
assert.equal(plan.patientCount, CASES.length, 'planning roster count matches cases');
assert.equal(gallery.patients.length, CASES.length, 'review gallery count matches cases');
assert.equal(ledger.additionalCast.backgroundAttendants.count, plan.backgroundAttendants.count,
  'additional attendant count remains separate from patient identities');
const attendantProvenance = ledger.additionalCast.backgroundAttendants;
assert.equal(attendantProvenance.status, 'candidate_assets_locally_integrated_outside_patient_roster_acceptance_pending');
assert.equal(attendantProvenance.patientRoster, false, 'background attendants stay outside the 14 canonical patients');
assert.equal(attendantProvenance.integrated, true, 'attendant candidates are integrated in the local game runtime');
assert.equal(attendantProvenance.published, false, 'attendant candidates are not published');
assert.equal(attendantProvenance.runtimeQA.status, 'pass_4_of_4_desktop_mobile_active_and_fallback');
assert.ok(attendantProvenance.sharedEvidenceArtifactIds.includes(attendantProvenance.runtimeQA.animationEvidenceArtifactId),
  'ambient Idle animation QA is tracked as shared evidence');
assert.equal(plan.backgroundAttendants.status, 'candidate_assets_locally_integrated_acceptance_pending');
assert.equal(plan.backgroundAttendants.roleScope, 'noninteractive_background_ambience');
assert.equal(plan.backgroundAttendants.integrated, true);
assert.equal(plan.backgroundAttendants.published, false);
assert.match(plan.backgroundAttendants.positionStatus, /unresolved/);
assert.equal(plan.backgroundAttendants.runtimeQA.evidenceArtifactId, attendantProvenance.runtimeQA.evidenceArtifactId);
assert.deepEqual(
  attendantProvenance.candidateRecords.map(({ id }) => id).sort(),
  ['atendente_balcon', 'atendente_gondola'],
  'the two separate attendant candidates are explicitly tracked',
);
assert.deepEqual(
  plan.backgroundAttendants.records.map(({ id }) => id).sort(),
  attendantProvenance.candidateRecords.map(({ id }) => id).sort(),
  'planning and provenance list the same off-roster attendants',
);

const planById = new Map(plan.patients.map((patient) => [patient.caseId, patient]));
const galleryById = new Map(gallery.patients.map((patient) => [patient.id, patient]));
const ledgerById = new Map(ledger.patients.map((patient) => [patient.caseId, patient]));
const caseIds = CASES.map((item) => item.id).sort();
assert.deepEqual([...planById.keys()].sort(), caseIds, 'plan has every canonical case once');
assert.deepEqual([...galleryById.keys()].sort(), caseIds, 'gallery has every canonical case once');
assert.deepEqual([...ledgerById.keys()].sort(), caseIds, 'provenance has every canonical case once');

const checkedArtifactIds = new Set();
const unavailableLocalArtifactIds = new Set();
let verifiedArtifactCount = 0;
const normalRuntimeArtifactId = 'animated-cast.normal-runtime.qa.20261016-patient-feedback-review';
for (const record of attendantProvenance.candidateRecords) {
  const plannedRecord = plan.backgroundAttendants.records.find(({ id }) => id === record.id);
  assert.ok(plannedRecord, `${record.id} has a planning record`);
  assert.equal(record.roleStatus, 'provisional_from_candidate_asset; official scope says non-interactive background ambience');
  assert.equal(plannedRecord.roleStatus, record.roleStatus);
  assert.match(record.identityStatus, /not accepted|acceptance unresolved/);
  assert.equal(plannedRecord.identityStatus, record.identityStatus);
  assert.match(record.positionStatus, /unresolved/);
  assert.equal(record.integrated, true, `${record.id} is active in the local ambient scene`);
  assert.equal(record.published, false);
  assert.equal(record.runtimeIntegrationEvidenceArtifactId, attendantProvenance.runtimeQA.evidenceArtifactId);
  assert.equal(plannedRecord.runtimeIntegrationEvidenceArtifactId, record.runtimeIntegrationEvidenceArtifactId);
  assert.equal(record.animationRuntimeEvidenceArtifactId, attendantProvenance.runtimeQA.animationEvidenceArtifactId);
  assert.equal(plannedRecord.animationRuntimeEvidenceArtifactId, record.animationRuntimeEvidenceArtifactId);
  assert.deepEqual(plannedRecord.artifactIds, record.artifactIds, `${record.id} planning evidence links match provenance`);
  assert.ok(record.artifactIds.length >= 6, `${record.id} records reference/source/mesh/FBX/runtime/QA evidence`);
  for (const artifactId of record.artifactIds) {
    assert.ok(ledger.artifacts[artifactId], `${record.id} references registered artifact ${artifactId}`);
    checkedArtifactIds.add(artifactId);
  }
}
for (const artifactId of attendantProvenance.sharedEvidenceArtifactIds) {
  assert.ok(ledger.artifacts[artifactId], `attendant evidence includes registered shared artifact ${artifactId}`);
  assert.ok(plan.backgroundAttendants.sharedEvidenceArtifactIds.includes(artifactId));
  checkedArtifactIds.add(artifactId);
}
for (const [artifactId, artifact] of Object.entries(ledger.artifacts)) {
  assert.equal(typeof artifact.path, 'string', `${artifactId} has a path`);
  assert.ok(!artifact.path.startsWith('/') && !artifact.path.includes('\\'), `${artifactId} path is repository-relative`);
  const absolutePath = resolve(root, artifact.path);
  assert.ok(absolutePath.startsWith(`${root}${sep}`), `${artifactId} stays in repository`);
  assert.ok(Number.isInteger(artifact.bytes) && artifact.bytes > 0, `${artifactId} has a positive recorded byte length`);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/, `${artifactId} has a SHA-256 digest`);
  if (!existsSync(absolutePath)) {
    assert.ok(verificationMode === 'checkout' && isCheckoutOptional(artifact.path),
      `${artifactId} is missing outside documented checkout-optional roots: ${artifact.path}`);
    unavailableLocalArtifactIds.add(artifactId);
    continue;
  }
  const realPath = realpathSync(absolutePath);
  assert.ok(realPath.startsWith(`${realpathSync(root)}${sep}`), `${artifactId} real path stays in repository`);
  assert.ok(statSync(realPath).isFile(), `${artifactId} is a file`);
  const bytes = readFileSync(realPath);
  assert.equal(artifact.bytes, bytes.length, `${artifactId} byte length matches`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, `${artifactId} hash matches`);
  verifiedArtifactCount += 1;
}

for (const caseId of caseIds) {
  const patient = ledgerById.get(caseId);
  const planned = planById.get(caseId);
  const reviewed = galleryById.get(caseId);
  assert.equal(patient.planStatus, planned.status, `${caseId} planning status is synchronized`);
  assert.equal(patient.galleryStatus, reviewed.status, `${caseId} gallery status is synchronized`);
  assert.deepEqual(Object.keys(patient.stages).sort(), [...stageNames].sort(), `${caseId} records all pipeline stages`);
  assert.ok(patient.stages.runtimeIntegration.artifacts.includes(normalRuntimeArtifactId),
    `${caseId} runtime integration references the normal source-build QA`);
  assert.equal(planned.sourceBuildModel, CASE_MODELS[caseId] || BOOT_MODEL,
    `${caseId} archived source-build model matches the canonical cast`);
  assert.equal(planned.sourceBuildQA?.modelId, planned.sourceBuildModel,
    `${caseId} source-build QA model matches its planned mapping`);
  assert.equal(planned.sourceBuildQA?.status, 'PASS',
    `${caseId} normal source-build QA passed`);
  assert.equal(planned.sourceBuildQA?.evidence, ledger.artifacts[normalRuntimeArtifactId]?.path,
    `${caseId} source-build QA points to a registered provenance artifact`);

  for (const [stageName, stage] of Object.entries(patient.stages)) {
    assert.equal(typeof stage.status, 'string', `${caseId}.${stageName} has an explicit state`);
    assert.ok(stage.note?.length > 0, `${caseId}.${stageName} explains its state`);
    assert.ok(Array.isArray(stage.artifacts), `${caseId}.${stageName} has an artifact list`);
    for (const artifactId of stage.artifacts) {
      assert.ok(ledger.artifacts[artifactId], `${caseId}.${stageName} references known artifact ${artifactId}`);
      checkedArtifactIds.add(artifactId);
    }
    assertStageEvidenceContract(stageName, stage, ledger.artifacts, caseId);
  }
  assertCandidatePipelineCoherence(patient);

  const publication = patient.stages.publication;
  if (reviewed.status === 'live') {
    assert.equal(publication.status, 'live', `${caseId} live gallery state has live provenance`);
    assert.equal(planned.status, 'aprovado_publicado', `${caseId} live gallery state is approved in plan`);
    assert.equal(publication.artifacts.length, 1, `${caseId} publication identifies one current model`);
    const artifact = ledger.artifacts[publication.artifacts[0]];
    const publicModelPath = `public/models/${reviewed.model}.glb`;
    assert.equal(artifact.path, publicModelPath, `${caseId} publication path matches gallery`);
    assert.equal(artifact.sha256, gallery.modelSha256[publicModelPath.slice('public/'.length)],
      `${caseId} publication hash matches gallery digest`);
    assert.equal(modelForCaseId(caseId), caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : reviewed.model, `${caseId} runtime selects the published model`);
  } else {
    assert.notEqual(publication.status, 'live', `${caseId} non-live state cannot claim publication`);
    assert.equal(planned.approvedAsset, null, `${caseId} non-live roster has no approved public asset`);
  }

  if (reviewed.status === 'candidate') {
    assert.equal(publication.status, 'candidate_not_published', `${caseId} candidate stays unpublished`);
    assert.equal(planned.activeModelToday, BOOT_MODEL, `${caseId} candidate does not replace production`);
    assert.equal(modelForCaseId(caseId), caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : reviewed.model, `${caseId} source build selects the local candidate by default`);
    assert.equal(modelForCaseId(caseId, { includeReviewCandidates: true }), reviewed.model,
      `${caseId} candidate is available in explicit local review mode`);
    assert.equal(REVIEW_CANDIDATE_MODELS[caseId], reviewed.model,
      `${caseId} review map agrees with the gallery`);
    assert.equal(planned.localIntegrationQA?.productionPublished, false,
      `${caseId} local integration QA does not imply production publication`);
  }
  if (reviewed.status === 'animated-review') {
    assert.notEqual(publication.status, 'live', `${caseId} animated candidate stays unpublished`);
    assert.equal(planned.activeModelToday, BOOT_MODEL, `${caseId} deployed production remains on its current model`);
    assert.equal(modelForCaseId(caseId), caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : reviewed.model, `${caseId} source build selects its animated candidate by default`);
    assert.equal(modelForCaseId(caseId, { includeReviewCandidates: true }), reviewed.model,
      `${caseId} review route agrees with the default source build candidate`);
    assert.equal(REVIEW_CANDIDATE_MODELS[caseId], reviewed.model,
      `${caseId} review map agrees with the gallery`);
    assert.equal(planned.localIntegrationQA?.productionPublished, false,
      `${caseId} candidate runtime mapping is not reported as a production publication`);
  }
  if (reviewed.status === 'planned') {
    assert.equal(patient.stages.source3D.status, 'not_started', `${caseId} planned case has no generated 3D source`);
    assert.equal(patient.stages.meshLod.status, 'not_started', `${caseId} planned case has no mesh/LOD`);
    assert.equal(patient.stages.rig.status, 'not_started', `${caseId} planned case has no rig`);
    assert.equal(patient.stages.walkIdle.status, 'not_started', `${caseId} planned case has no clips`);
    assert.equal(reviewed.model, null, `${caseId} planned gallery record has no model`);
  }
  if (!Object.hasOwn(CASE_MODELS, caseId) && reviewed.status !== 'live') {
    assert.equal(modelForCaseId(caseId), BOOT_MODEL, `${caseId} without a local override uses default avatar`);
  }
}

assert.deepEqual([...checkedArtifactIds].sort(), Object.keys(ledger.artifacts).sort(),
  'every registered artifact is referenced by at least one stage');

let gatePass = 0;
let expectedStaticFailures = 0;
let skippedStaticGates = 0;
let skippedCandidateGates = 0;
for (const patient of ledger.patients) {
  const walk = patient.stages.walkIdle;
  const candidateWalkPass = walk.status === 'structural_gate_pass'
    || walk.status.endsWith('_structural_gate_pass');
  const expectedStaticGate = walk.status === 'not_present_static_gate_expected_fail';
  if (!candidateWalkPass && !expectedStaticGate) continue;
  const plannedCandidatePath = planById.get(patient.caseId)?.runtimeCandidate;
  const modelId = walk.artifacts.find((artifactId) => ledger.artifacts[artifactId]?.path === plannedCandidatePath)
    || walk.artifacts.find((artifactId) => ledger.artifacts[artifactId]?.path.endsWith('.glb'));
  assert.ok(modelId, `${patient.caseId} walk gate has a GLB evidence artifact`);
  const expected = expectedWalkGates[patient.caseId];
  assert.ok(expected, `${patient.caseId} has an explicit walk-gate baseline`);
  if (unavailableLocalArtifactIds.has(modelId)) {
    assert.equal(verificationMode, 'checkout', `${patient.caseId} gate is unavailable only in checkout mode`);
    assert.ok(isCheckoutOptional(ledger.artifacts[modelId].path), `${patient.caseId} missing candidate is an explicitly optional local asset`);
    if (candidateWalkPass) {
      assert.equal(expected.result, 'PASS', `${patient.caseId} unavailable candidate has a passing local baseline`);
      skippedCandidateGates += 1;
    } else {
      assert.equal(walk.status, 'not_present_static_gate_expected_fail', `${patient.caseId} unavailable gate is recorded as a static mesh`);
      assert.equal(expected.result, 'FAIL', `${patient.caseId} unavailable gate has an expected static-mesh baseline`);
      skippedStaticGates += 1;
    }
    continue;
  }
  const gate = spawnSync(process.execPath, [resolve(root, 'scripts/gate_character_walk.mjs'), resolve(root, ledger.artifacts[modelId].path)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30000
  });
  assert.equal(gate.error, undefined, `${patient.caseId} walk gate starts and completes`);
  const result = JSON.parse(gate.stdout);
  assert.equal(result.result, expected.result, `${patient.caseId} walk-gate result is unchanged`);
  assert.equal(result.joints, expected.joints, `${patient.caseId} joint profile is unchanged`);
  assert.equal(result.triangles, expected.triangles, `${patient.caseId} triangle count is unchanged`);
  if (expected.profile) assert.equal(result.skeletonProfile, expected.profile, `${patient.caseId} skeleton profile is explicit`);
  if (candidateWalkPass) {
    assert.equal(gate.status, 0, `${patient.caseId} structural walk gate exits successfully`);
    assert.equal(result.result, 'PASS', `${patient.caseId} structural walk gate passes`);
    assert.ok(result.skins > 0 && result.joints > 0 && result.walk && result.idle,
      `${patient.caseId} has a skin, skeleton, Walk and Idle`);
    gatePass += 1;
  } else {
    assert.equal(gate.status, 1, `${patient.caseId} static candidate fails the walk gate`);
    assert.equal(result.result, 'FAIL', `${patient.caseId} failure is explicit`);
    assert.equal(result.skins, 0, `${patient.caseId} static candidate has no rig skin`);
    assert.equal(result.joints, 0, `${patient.caseId} static candidate has no joints`);
    assert.ok(result.failures.includes('clip Walk ausente') && result.failures.includes('clip Idle ausente'),
      `${patient.caseId} static candidate is not recorded as animated`);
    expectedStaticFailures += 1;
  }
}

assert.equal(gatePass + skippedCandidateGates, 14, 'fourteen current animated candidates pass locally or have an explicit checkout-only candidate skip');
assert.equal(expectedStaticFailures + skippedStaticGates, 0, 'no current animated candidate is treated as a static mesh');
if (verificationMode === 'workspace') {
  assert.equal(skippedStaticGates, 0, 'full workspace mode does not skip static-mesh gates');
  assert.equal(skippedCandidateGates, 0, 'full workspace mode verifies every local candidate gate');
}

await MeshoptDecoder.ready;
const staticIo = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let staticMeshPass = 0;
let skippedStaticMeshes = 0;
for (const patient of gallery.patients.filter((entry) => entry.status === 'mesh')) {
  const relativePath = `public/models/${patient.model}.glb`;
  const artifactId = Object.entries(ledger.artifacts).find(([, artifact]) => artifact.path === relativePath)?.[0];
  assert.ok(artifactId, `${patient.id} static gallery model is recorded in provenance`);
  if (unavailableLocalArtifactIds.has(artifactId)) {
    skippedStaticMeshes++;
    continue;
  }
  const doc = await staticIo.read(resolve(root, relativePath));
  const asset = doc.getRoot();
  assert.equal(asset.listSkins().length, 0, `${patient.id} mesh review asset remains static`);
  assert.equal(asset.listAnimations().length, 0, `${patient.id} mesh review asset does not claim clips`);
  const bounds = getBounds(asset.getDefaultScene() || asset.listScenes()[0]);
  const height = bounds.max[1] - bounds.min[1];
  assert.ok(Number.isFinite(height) && Math.abs(height - 1.72) <= 0.02,
    `${patient.id} static mesh height is normalized to 1.72m`);
  let triangles = 0;
  for (const mesh of asset.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    assert.equal(primitive.getMode() ?? Primitive.Mode.TRIANGLES, Primitive.Mode.TRIANGLES,
      `${patient.id} uses triangle primitives`);
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    assert.ok(position && indices, `${patient.id} static primitive has indexed positions`);
    assert.equal(indices.getCount() % 3, 0, `${patient.id} triangle index count is divisible by three`);
    const referenced = new Uint8Array(position.getCount());
    const seen = new Set();
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let i = 0; i < indices.getCount(); i += 3) {
      const ids = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
      assert.equal(ids.length, 3, `${patient.id} triangle has three indices`);
      assert.ok(ids.every((id) => Number.isInteger(id) && id >= 0 && id < position.getCount()),
        `${patient.id} triangle indices stay in range`);
      assert.equal(new Set(ids).size, 3, `${patient.id} has no repeated-index triangle`);
      const key = [...ids].sort((x, y) => x - y).join(':');
      assert.ok(!seen.has(key), `${patient.id} has no duplicate triangle`);
      seen.add(key);
      ids.forEach((id) => { referenced[id] = 1; });
      position.getElement(ids[0], a); position.getElement(ids[1], b); position.getElement(ids[2], c);
      const ab = b.map((value, axis) => value - a[axis]);
      const ac = c.map((value, axis) => value - a[axis]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      assert.ok(cross.reduce((sum, value) => sum + value * value, 0) > 1e-20,
        `${patient.id} has no zero-area triangle`);
      triangles++;
    }
    assert.equal(referenced.some((value) => value === 0), false, `${patient.id} has no unreferenced position`);
  }
  assert.ok(triangles > 0 && triangles <= 50000, `${patient.id} mesh triangle budget (${triangles})`);
  staticMeshPass++;
}
assert.equal(staticMeshPass + skippedStaticMeshes, gallery.patients.filter((entry) => entry.status === 'mesh').length,
  'every static mesh review candidate is checked or explicitly unavailable in checkout mode');
console.log(`✅ cast provenance QA (${verificationMode}): ${caseIds.length} cases, ${stageNames.length} stages, ${verifiedArtifactCount}/${Object.keys(ledger.artifacts).length} artifact hashes verified; ${unavailableLocalArtifactIds.size} local artifacts unavailable; ${gatePass} Walk gates pass, ${skippedCandidateGates} candidate gates unavailable in checkout, ${expectedStaticFailures} static-mesh failures checked, ${skippedStaticGates} static-mesh gates unavailable, ${staticMeshPass} static mesh topology/scale gates pass, ${skippedStaticMeshes} static mesh candidates unavailable in checkout`);
