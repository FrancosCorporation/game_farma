// Verify normal fallback, local review-mode model selection, skeleton loading,
// arrival Walk motion, and same-case retry after a failed candidate download.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelForCaseId } from '../src/data/patientAssets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4181/';
const qaOutput = process.env.QA_OUTPUT || resolve(root, '.planning/2026-10-12-melhoria-integral/implementation/20261018_fc027_runtime_qa/case_models_qa.json');
const startedAt = new Date();
const viewport = {
  width: Number(process.env.QA_WIDTH || 900),
  height: Number(process.env.QA_HEIGHT || 600),
};
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)
  || viewport.width < 320 || viewport.width > 4096
  || viewport.height < 480 || viewport.height > 4096) {
  throw new Error('QA_WIDTH/QA_HEIGHT must be integers in 320–4096 × 480–4096.');
}
const mobile = process.env.QA_MOBILE === '1';
const reviewUrl = new URL(base);
reviewUrl.searchParams.set('candidateReview', '1');
const newReviewPage = () => browser.newPage({
  viewport,
  ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
});
const failures = [];
const report = {
  schema: 'farmacheck.case-models-runtime-qa.v2',
  status: 'running',
  startedAt: startedAt.toISOString(),
  mode: 'local Vite development; per-case animated mappings enabled in the normal build',
  viewport: { ...viewport, mobile },
  speechMouth: {
    status: 'unavailable-with-current-models',
    expectedBehavior: 'No facial overlay is created until a patient model with a facial rig is integrated.',
  },
  defaultMode: null,
  directCandidateRoute: null,
  candidateRuntime: [],
  networkFailureRetry: null,
  progress: [],
  failures,
};
const markProgress = (step, detail = undefined) => report.progress.push({
  step,
  ...(detail === undefined ? {} : { detail }),
  at: new Date().toISOString(),
});
const candidates = [
  ['clara_cefaleia', 'candidates/clara_cefaleia_walk_v001', 57],
  ['nelson_infarto', 'candidates/nelson_infarto_walkidle_gait_candidate_v001', 65],
  ['paulo_dor_lombar', 'candidates/paulo_dor_lombar_walkidle_gait_candidate_v001', 65],
  ['joao_queimacao', 'candidates/joao_queimacao_walkidle_gait_candidate_v007', 57],
  ['helena_avc', 'candidates/helena_avc_walkidle_gait_candidate_v001', 57],
  ['dona_rosa_hipotensao', 'candidates/rosa_hipotensao_walkidle_gait_candidate_v001', 57],
  ['carlos_asma', 'candidates/carlos_asma_mixamo_prepared_v010_lod100k_bindframe', 33],
  ['bia_apendicite', 'candidates/bia_apendicite_voxel_mixamo_walkidle_candidate_v023_arm_rebase_v001', 65],
  ['carla_dengue', 'candidates/carla_dengue_voxel_mixamo_walkidle_candidate_v009_arm_rebase_v003', 65],
  ['roberto_dispepsia', 'candidates/roberto_dispepsia_voxel_mixamo_walkidle_candidate_v006_arm_rebase_v001', 65],
  ['catia_dermatite', 'candidates/catia_dermatite_voxel_mixamo_walkidle_candidate_v004_arm_rebase_v001', 65],
];
const approved = [
  ['marina_amoxicilina', 'candidates/marina_patient_v001', 33],
  ['jose_gripe', 'candidates/jose_patient_v002', 65],
];
const boot = ['ana_coriza', 'ana_clasica', 65];
const allTestCases = [...approved, ...candidates, boot];
const sourceFiles = [
  'scripts/qa_case_models.mjs', 'package.json', 'package-lock.json', 'index.html',
  'src/main.js', 'src/app.js',
  'src/scene/scene.js', 'src/scene/qualitySettings.js', 'src/scene/patient.js',
  'src/scene/avatarLifecycle.js', 'src/scene/characterOrientation.js', 'src/scene/glbLoader.js',
  'src/scene/mouthAnimation.js', 'src/data/patientAssets.js', 'src/data/cases.js',
  'src/core/game.js', 'src/audio/tts.js', 'src/audio/sfx.js',
];
const assetFiles = [...new Set(allTestCases.map(([, model]) => `public/models/${model}.glb`))];
const hashFiles = (files) => files.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
report.sourceManifest = hashFiles(sourceFiles);
report.assetManifest = hashFiles(assetFiles);
let browser = null;
const prepare = async (page, url) => {
  page.on('pageerror', (error) => failures.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('farmacheck:quality', 'low');
  });
  markProgress('init-script-installed', url);
  await page.goto(url);
  markProgress('page-navigated', url);
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1');
  await page.click('#capa-iniciar');
  await page.waitForFunction(() => window.__farmacheck?.game.avatar?.modelId === 'ana_clasica', null, { timeout: 90000 });
};
try {
  markProgress('chromium-launch-started');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  markProgress('chromium-launched');
  // Normal runtime must continue to use approved assets/defaults.
  const standard = await newReviewPage();
  await prepare(standard, base);
  assert.equal(await standard.evaluate(() => window.__farmacheck.candidateReviewMode), false);
  const candidateMap = candidates.map(([caseId]) => ({
      caseId,
      normal: modelForCaseId(caseId),
      review: modelForCaseId(caseId, { includeReviewCandidates: true }),
    }));
  assert.ok(candidateMap.every((item) => item.normal === item.review && item.review !== 'ana_clasica'),
    'normal build maps every animated candidate to its case');
  await standard.evaluate(async (caseId) => {
    const game = window.__farmacheck.game;
    document.getElementById('menu').hidden = true;
    await game.startCase(game.cases.find((item) => item.id === caseId));
  }, 'carlos_asma');
  assert.equal(await standard.evaluate(() => window.__farmacheck.game.avatar.modelId),
    'candidates/carlos_asma_mixamo_prepared_v010_lod100k_bindframe');
  report.defaultMode = { status: 'PASS', candidateReviewMode: false, candidateModelsInNormalBuild: candidateMap.length };
  markProgress('normal-runtime-passed');
  console.log('PASS normal build: case selects its animated candidate without review query');
  await standard.close();

  // Local reviewers can open a specific candidate without unlocking game phases.
  const directReviewUrl = new URL(reviewUrl);
  directReviewUrl.searchParams.set('candidateCase', 'clara_cefaleia');
  const directReview = await newReviewPage();
  await prepare(directReview, directReviewUrl.href);
  await directReview.click('#btn-iniciar');
  await directReview.waitForFunction(() => {
    const game = window.__farmacheck?.game;
    return game?.case?.id === 'clara_cefaleia'
      && game.avatar.modelId === 'candidates/clara_cefaleia_walk_v001'
      && ['CHEGADA', 'ANAMNESE'].includes(game.state)
      && !!game.avatar.getModel();
  }, null, { timeout: 90000, polling: 100 });
  report.directCandidateRoute = {
    status: 'PASS',
    caseId: await directReview.evaluate(() => window.__farmacheck.game.case.id),
    modelId: await directReview.evaluate(() => window.__farmacheck.game.avatar.modelId),
    stateAtSelection: await directReview.evaluate(() => window.__farmacheck.game.state),
  };
  markProgress('direct-candidate-route-passed');
  assert.equal(await directReview.evaluate(() => window.__farmacheck.candidateReviewMode), true);
  console.log('PASS direct review URL: Clara starts without phase unlocks');
  await directReview.close();

  // The normal checkout build loads all per-case GLBs in the real game.
  const page = await newReviewPage();
  await prepare(page, base);
  assert.equal(await page.evaluate(() => window.__farmacheck.candidateReviewMode), false);
  for (const [caseId, model, joints] of [...approved, ...candidates, boot]) {
    report.currentCase = { caseId, expectedModelId: model, expectedBones: joints, status: 'running' };
    markProgress('case-runtime-started', { caseId, expectedModelId: model });
    const result = await page.evaluate(async ({ caseId, model }) => {
      const game = window.__farmacheck.game;
      let previous = null;
      let movementMeters = 0;
      let movementSamples = 0;
      document.getElementById('menu').hidden = true;
      const start = game.startCase(game.cases.find((item) => item.id === caseId));
      const deadline = performance.now() + 90000;
      let step = 0;
      while ((game.case?.id !== caseId || game.state !== 'ANAMNESE')
        && performance.now() < deadline) {
        const avatar = game.avatar;
        if (game.case?.id === caseId && avatar?.modelId === model && avatar.getModel()) {
          // Headless WebGL throttles RAF. Advance the same avatar update path
          // at 60 Hz so arrival and its trajectory samples stay deterministic.
          avatar.update(1 / 60, ++step / 60);
          const { x, z } = avatar.root.position;
          if (previous) movementMeters += Math.hypot(x - previous.x, z - previous.z);
          previous = { x, z };
          movementSamples += 1;
          await Promise.resolve();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      if (game.case?.id !== caseId || game.state !== 'ANAMNESE') {
        throw new Error(`${caseId} arrival did not finish before the runtime check deadline`);
      }
      await start;
      let bones = 0;
      game.avatar.getModel().traverse((node) => {
        if (node.isSkinnedMesh) bones = Math.max(bones, node.skeleton.bones.length);
      });
      const avatar = game.avatar;
      const speechMouth = avatar.getSpeechMouthDiagnostics?.() ?? { status: 'missing-api' };
      const mouthOverlayBeforeSpeech = avatar.root.getObjectByName('avatar:speech-mouth-aperture');
      avatar.speakStart('boca abre agora');
      avatar.speakProgress(0.1, 1);
      avatar.update(1 / 60, 1);
      const mouthOverlayDuringSpeech = avatar.root.getObjectByName('avatar:speech-mouth-aperture');
      avatar.speakEnd();
      const mouthOverlayAfterSpeech = avatar.root.getObjectByName('avatar:speech-mouth-aperture');
      return {
        caseId,
        modelId: game.avatar.modelId,
        state: game.state,
        bones,
        speechMouth,
        mouthOverlayBeforeSpeech: Boolean(mouthOverlayBeforeSpeech),
        mouthOverlayDuringSpeech: Boolean(mouthOverlayDuringSpeech),
        mouthOverlayAfterSpeech: Boolean(mouthOverlayAfterSpeech),
        movementMeters,
        movementSamples,
      };
    }, { caseId, model });
    report.currentCase.runtimeModelId = result.modelId;
    report.currentCase.status = 'observed';
    markProgress('case-runtime-observed', { caseId, modelId: result.modelId, state: result.state });
    assert.equal(result.modelId, model, `${caseId} selects the reviewed candidate`);
    assert.equal(result.state, 'ANAMNESE', `${caseId} finishes arrival before accepting chat`);
    assert.equal(result.bones, joints, `${caseId} loads its expected skin/skeleton`);
    assert.equal(result.speechMouth.status, 'unavailable', `${caseId} does not claim facial animation without a facial rig`);
    assert.equal(result.mouthOverlayBeforeSpeech, false, `${caseId} has no floating mouth before speech`);
    assert.equal(result.mouthOverlayDuringSpeech, false, `${caseId} has no floating mouth during speech`);
    assert.equal(result.mouthOverlayAfterSpeech, false, `${caseId} has no floating mouth after speech`);
    assert.ok(result.movementMeters >= 5.5, `${caseId} completes the arrival movement (${result.movementMeters.toFixed(2)} m)`);
    assert.ok(result.movementSamples >= 10, `${caseId} has movement samples across the arrival Walk`);
    report.candidateRuntime.push({ ...result, status: 'PASS' });
    report.currentCase.status = 'PASS';
    markProgress('case-runtime-passed', caseId);
    console.log(`PASS case/model/Walk/no-floating-mouth ${caseId} ${model} ${joints} joints ${result.movementMeters.toFixed(2)} m`);
    await page.evaluate(() => { window.__farmacheck.game.avatar.root.visible = false; });
  }
  assert.deepEqual(failures, []);
  await page.close();

  // A forced network failure must show an error, avoid a wrong avatar, and retry this case.
  const fail = await newReviewPage();
  await fail.route('**/models/candidates/jose_patient_v002.glb*', (route) => route.abort());
  await prepare(fail, base);
  await fail.evaluate(async () => {
    const game = window.__farmacheck.game;
    document.getElementById('menu').hidden = true;
    await game.startCase(game.cases.find((item) => item.id === 'jose_gripe'));
  });
  assert.equal(await fail.locator('#patient-load-error').isVisible(), true);
  assert.equal(await fail.locator('#menu').isVisible(), true);
  assert.notEqual(await fail.evaluate(() => window.__farmacheck.game.case?.id), 'jose_gripe');
  await fail.unroute('**/models/candidates/jose_patient_v002.glb*');
  await fail.click('#btn-iniciar');
  await fail.waitForFunction(() => {
    const game = window.__farmacheck?.game;
    return game?.case?.id === 'jose_gripe'
      && game.avatar.modelId === 'candidates/jose_patient_v002'
      && !!game.avatar.getModel();
  }, null, { timeout: 90000 });
  assert.equal(await fail.locator('#patient-load-error').isVisible(), false);
  assert.deepEqual(failures, []);
  report.networkFailureRetry = { status: 'PASS', caseId: 'jose_gripe', modelId: 'candidates/jose_patient_v002' };
  markProgress('network-failure-retry-passed');
  console.log('PASS failed load: visible error, no wrong case, retry same José');
  await fail.close();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  if (report.currentCase && report.currentCase.status !== 'PASS') {
    report.currentCase.status = 'FAIL';
    report.currentCase.failure = report.failure;
  }
  if (!failures.includes(report.failure.message)) failures.push(report.failure.message);
  markProgress('failed', report.failure);
  throw error;
} finally {
  try {
    await browser?.close();
  } catch (error) {
    const message = `Chromium close: ${error?.message || error}`;
    if (!failures.includes(message)) failures.push(message);
    report.status = 'failed';
    report.failure ||= { name: error?.name || 'Error', message };
  }
  markProgress(report.status === 'passed' ? 'finished' : 'finished-with-failure');
  report.failures = [...failures];
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  const outputPath = resolve(qaOutput);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${outputPath}`);
}
