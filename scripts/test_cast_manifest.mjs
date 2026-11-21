// CPU-only consistency checks for the case roster, review gallery and runtime assets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve, sep } from 'node:path';
import { CASES } from '../src/data/cases.js';
import { BOOT_MODEL, CASE_MODELS, REVIEW_CANDIDATE_MODELS, modelForCaseId } from '../src/data/patientAssets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const planned = JSON.parse(readFileSync(resolve(root, 'docs/elenco_planejado.json'), 'utf8'));
const review = JSON.parse(readFileSync(resolve(publicRoot, 'patient-review.json'), 'utf8'));
const sourceBuildEvidencePath = '.planning/2026-10-12-melhoria-integral/implementation/20261016_patient_feedback_review/normal_runtime_14.json';
const sourceBuildEvidence = JSON.parse(readFileSync(resolve(root, sourceBuildEvidencePath), 'utf8'));
const sourceBuildByCase = new Map(sourceBuildEvidence.candidateRuntime.map((entry) => [entry.caseId, entry]));

function uniqueBy(items, key, label) {
  const values = items.map((item) => item[key]);
  assert.ok(values.every((value) => typeof value === 'string' && value.length > 0), `${label} has non-empty ${key}`);
  assert.equal(new Set(values).size, values.length, `${label} has unique ${key}`);
}

function containedPath(base, relativePath, label) {
  assert.equal(typeof relativePath, 'string', `${label} path is a string`);
  assert.ok(relativePath.length > 0 && !relativePath.includes('\0'), `${label} path is non-empty and valid`);
  const path = resolve(base, relativePath);
  assert.ok(path === base || path.startsWith(`${base}${sep}`), `${label} stays inside its root`);
  return path;
}

function existingFile(base, relativePath, label, expectedExtension) {
  const path = containedPath(base, relativePath, label);
  assert.ok(existsSync(path), `${label} exists: ${relativePath}`);
  if (expectedExtension) assert.equal(extname(path).toLowerCase(), expectedExtension, `${label} file extension`);
  return path;
}

function galleryModelPath(model, label) {
  assert.equal(typeof model, 'string', `${label} has a model path`);
  assert.ok(model.length > 0, `${label} model path is non-empty`);
  return existingFile(publicRoot, `models/${model}.glb`, label, '.glb');
}

assert.equal(planned.schema, 'farmacheck.elenco-planejado.v2', 'planning roster schema');
assert.equal(planned.provenanceLedger, 'docs/elenco_proveniencia.json', 'planning roster links the provenance ledger');
existingFile(root, planned.provenanceLedger, 'provenance ledger');
assert.equal(review.schema, 1, 'public review roster schema');
assert.equal(planned.patientCount, planned.patients.length, 'planning roster patientCount');
assert.equal(review.patients.length, planned.patientCount, 'review and planning roster counts');
assert.equal(planned.patients.length, CASES.length, 'planning roster matches case catalog count');
uniqueBy(CASES, 'id', 'case catalog');
uniqueBy(planned.patients, 'caseId', 'planning roster');
uniqueBy(review.patients, 'id', 'review roster');

const expectedModelPaths = review.patients
  .filter((patient) => typeof patient.model === 'string')
  .map((patient) => `models/${patient.model}.glb`)
  .sort();
assert.ok(review.modelSha256 && typeof review.modelSha256 === 'object', 'review roster has asset hashes');
assert.deepEqual(Object.keys(review.modelSha256).sort(), expectedModelPaths,
  'model hash inventory covers every review model and contains no unreferenced file');
for (const relativePath of expectedModelPaths) {
  const path = existingFile(publicRoot, relativePath, `hashed model ${relativePath}`, '.glb');
  const expectedHash = review.modelSha256[relativePath];
  assert.match(expectedHash, /^[a-f0-9]{64}$/, `${relativePath} has a SHA-256 digest`);
  const actualHash = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(actualHash, expectedHash, `${relativePath} matches the recorded SHA-256`);
}

const caseIds = new Set(CASES.map((item) => item.id));
const plannedById = new Map(planned.patients.map((item) => [item.caseId, item]));
const reviewById = new Map(review.patients.map((item) => [item.id, item]));
assert.deepEqual([...plannedById.keys()].sort(), [...caseIds].sort(), 'planning roster covers every canonical case exactly once');
assert.deepEqual([...reviewById.keys()].sort(), [...caseIds].sort(), 'review roster covers every canonical case exactly once');

const publishedPlans = planned.patients.filter((patient) => patient.status === 'aprovado_publicado');
assert.equal(planned.patientsToGenerate, planned.patients.length - publishedPlans.length,
  'patientsToGenerate counts cases without an approved published model');
assert.equal(publishedPlans.length, review.patients.filter((patient) => patient.status === 'live').length,
  'planning publication count matches gallery live count');
existingFile(publicRoot, `models/${BOOT_MODEL}.glb`, 'boot avatar', '.glb');

for (const patient of planned.patients) {
  const gallery = reviewById.get(patient.caseId);
  assert.ok(gallery, `${patient.caseId} is in the review roster`);
  const sourceBuild = sourceBuildByCase.get(patient.caseId);
  assert.ok(sourceBuild, `${patient.caseId} has normal source-build runtime evidence`);
  assert.equal(sourceBuild.status, 'PASS', `${patient.caseId} normal source-build runtime passed`);
  assert.equal(patient.sourceBuildModel, sourceBuild.modelId,
    `${patient.caseId} planning roster matches the archived source-build report`);
  assert.equal(patient.sourceBuildQA?.evidence, sourceBuildEvidencePath,
    `${patient.caseId} source-build QA points to the shared Chromium report`);
  assert.equal(patient.sourceBuildQA?.modelId, sourceBuild.modelId,
    `${patient.caseId} source-build QA model matches its runtime report`);
  assert.equal(patient.sourceBuildQA?.status, 'PASS',
    `${patient.caseId} has a passing source-build QA record`);
  assert.equal(patient.sourceBuildQA?.productionContainerUnchanged, true,
    `${patient.caseId} source-build QA records production as unchanged`);
  assert.equal(patient.sourceBuildQA?.deploy, false,
    `${patient.caseId} source-build QA does not claim a deployment`);
  assert.ok(['live', 'candidate', 'animated-review', 'mesh', 'reference', 'planned'].includes(gallery.status),
    `${patient.caseId} has a recognized gallery state`);

  const productionModel = patient.activeModelToday || BOOT_MODEL;
  existingFile(publicRoot, `models/${productionModel}.glb`, `${patient.caseId} active production model`, '.glb');

  if (patient.approvedAsset) {
    assert.ok(patient.approvedAsset.startsWith('public/'), `${patient.caseId} approved asset is explicitly public`);
    const approvedPath = existingFile(root, patient.approvedAsset, `${patient.caseId} approved asset`, '.glb');
    assert.equal(gallery.status, 'live', `${patient.caseId} approved asset is marked live in gallery`);
    assert.equal(galleryModelPath(gallery.model, `${patient.caseId} gallery model`), approvedPath,
      `${patient.caseId} gallery and approved asset identify the same GLB`);
  } else {
    assert.notEqual(gallery.status, 'live', `${patient.caseId} cannot be live without an approved asset`);
  }

  if (patient.runtimeCandidate) {
    const candidatePath = patient.runtimeCandidate.startsWith('public/')
      ? existingFile(root, patient.runtimeCandidate, `${patient.caseId} runtime candidate`, '.glb')
      : existingFile(publicRoot, patient.runtimeCandidate, `${patient.caseId} runtime candidate`, '.glb');
    if (['candidate', 'animated-review'].includes(gallery.status) && gallery.model) {
      assert.equal(galleryModelPath(gallery.model, `${patient.caseId} gallery candidate`), candidatePath,
        `${patient.caseId} gallery model matches recorded runtime candidate`);
    }
    if (gallery.status === 'mesh') {
      const staticPath = patient.staticReview?.mesh || patient.meshCandidate;
      assert.ok(staticPath, `${patient.caseId} static gallery mesh has an explicit source record`);
      assert.equal(existingFile(root, staticPath, `${patient.caseId} static gallery mesh`, '.glb'),
        galleryModelPath(gallery.model, `${patient.caseId} static gallery model`),
        `${patient.caseId} static gallery keeps its mesh while runtime candidate remains separate`);
      assert.notEqual(candidatePath, galleryModelPath(gallery.model, `${patient.caseId} static gallery model`),
        `${patient.caseId} animated review asset is not mislabeled as the static gallery mesh`);
    }
  }

  if (gallery.status === 'live') {
    assert.equal(patient.status, 'aprovado_publicado', `${patient.caseId} live status is backed by planning approval`);
    assert.equal(modelForCaseId(patient.caseId), patient.caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : gallery.model, `${patient.caseId} runtime selects its live model`);
  } else if (gallery.status === 'candidate') {
    assert.equal(patient.approvedAsset, null, `${patient.caseId} candidate is not marked published`);
    assert.equal(patient.activeModelToday, BOOT_MODEL, `${patient.caseId} candidate does not replace today's production model`);
    assert.equal(modelForCaseId(patient.caseId), patient.caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : gallery.model, `${patient.caseId} source build selects its local candidate by default`);
    assert.equal(modelForCaseId(patient.caseId, { includeReviewCandidates: true }), gallery.model,
      `${patient.caseId} local review candidate matches gallery`);
    assert.equal(patient.localIntegrationQA?.productionPublished, false,
      `${patient.caseId} local integration is not represented as production publication`);
    assert.equal(patient.localIntegrationQA?.directCandidateRoute?.status, 'contract_pass',
      `${patient.caseId} can be selected directly by a local reviewer`);
    if (patient.candidatePath?.startsWith('public/')) {
      assert.equal(existingFile(root, patient.candidatePath, `${patient.caseId} staged public candidate`, '.glb'),
        galleryModelPath(gallery.model, `${patient.caseId} gallery candidate file`));
    }
  } else if (gallery.status === 'animated-review') {
    assert.equal(patient.approvedAsset, null, `${patient.caseId} animated review candidate is not published`);
    assert.equal(patient.activeModelToday, BOOT_MODEL, `${patient.caseId} animated review does not replace today's production model`);
    assert.ok(patient.candidatePath?.startsWith('public/models/candidates/'), `${patient.caseId} staged animation candidate has a local candidate path`);
    assert.equal(existingFile(root, patient.candidatePath, `${patient.caseId} staged animation candidate`, '.glb'),
      galleryModelPath(gallery.model, `${patient.caseId} animated review model`));
    assert.equal(patient.runtimeCandidate, patient.candidatePath, `${patient.caseId} local runtime candidate matches its staged model`);
    assert.equal(modelForCaseId(patient.caseId), patient.caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : gallery.model, `${patient.caseId} source build selects its animated candidate by default`);
    assert.equal(modelForCaseId(patient.caseId, { includeReviewCandidates: true }), gallery.model,
      `${patient.caseId} candidate is available in explicit local review mode`);
    assert.equal(REVIEW_CANDIDATE_MODELS[patient.caseId], gallery.model,
      `${patient.caseId} candidate review map agrees with the gallery`);
    assert.equal(patient.localIntegrationQA?.productionPublished, false,
      `${patient.caseId} local runtime QA does not imply production publication`);
    assert.equal(patient.localIntegrationQA?.directCandidateRoute?.status, 'contract_pass',
      `${patient.caseId} can be selected directly by a local reviewer`);
  } else if (gallery.status === 'reference') {
    assert.ok(gallery.model === null || gallery.model === undefined, `${patient.caseId} reference-only gallery record has no model`);
    assert.ok(gallery.references.length > 0, `${patient.caseId} reference state contains an image`);
  } else if (gallery.status === 'planned') {
    assert.ok(gallery.model === null || gallery.model === undefined, `${patient.caseId} planned gallery record has no model`);
    assert.equal(gallery.references.length, 0, `${patient.caseId} planned state has no fabricated reference`);
  }

  for (const reference of gallery.references) {
    existingFile(publicRoot, reference, `${patient.caseId} gallery reference`);
  }
}

for (const [caseId, model] of Object.entries(CASE_MODELS)) {
  const gallery = reviewById.get(caseId);
  assert.ok(gallery, `${caseId} runtime override exists in review roster`);
  assert.ok(['live', 'candidate', 'animated-review'].includes(gallery.status), `${caseId} runtime override is not an unreviewed reference`);
  assert.equal(gallery.model, model, `${caseId} runtime override and gallery model agree`);
  galleryModelPath(model, `${caseId} runtime override`);
}

const expectedReviewCandidates = Object.fromEntries(planned.patients
  .filter((patient) => patient.runtimeCandidate && !patient.approvedAsset)
  .map((patient) => [patient.caseId, patient.runtimeCandidate
    .replace(/^public\/models\//, '')
    .replace(/\.glb$/, '')]));
assert.deepEqual(REVIEW_CANDIDATE_MODELS, expectedReviewCandidates,
  'local review map covers exactly the recorded unpublished runtime candidates');
for (const [caseId, model] of Object.entries(REVIEW_CANDIDATE_MODELS)) {
  const patient = plannedById.get(caseId);
  const gallery = reviewById.get(caseId);
  assert.ok(patient && gallery, `${caseId} runtime candidate has a plan and gallery record`);
  assert.equal(patient.approvedAsset, null, `${caseId} local candidate remains unpublished`);
  assert.equal(patient.activeModelToday, BOOT_MODEL, `${caseId} local candidate leaves normal avatar unchanged`);
  assert.equal(modelForCaseId(caseId), caseId === 'carla_dengue' ? 'candidates/marina_patient_v001' : model, `${caseId} candidate is selected in the normal source build`);
  assert.equal(modelForCaseId(caseId, { includeReviewCandidates: true }), model,
    `${caseId} review mode selects its recorded animated runtime candidate`);
  assert.equal(patient.localIntegrationQA?.productionPublished, false,
    `${caseId} review integration is not reported as production publication`);
  if (['candidate', 'animated-review'].includes(gallery.status)) {
    assert.equal(gallery.model, model, `${caseId} animated gallery state agrees with the runtime review map`);
  }
}

for (const caseDef of CASES) {
  if (!Object.hasOwn(CASE_MODELS, caseDef.id)) {
    assert.equal(modelForCaseId(caseDef.id), BOOT_MODEL, `${caseDef.id} uses the explicit default avatar`);
  }
}

console.log(`✅ cast manifest QA: ${CASES.length} canonical cases; ${publishedPlans.length} published, ${Object.keys(CASE_MODELS).length} local overrides; referenced assets and ${expectedModelPaths.length} GLB SHA-256 digests match; candidate/live states agree`);
