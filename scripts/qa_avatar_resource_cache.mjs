// Browser stress check for the real avatar LRU, separate from CPU-only disposal tests.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { modelForCaseId } from '../src/data/patientAssets.js';

const base = process.argv[2] || 'http://127.0.0.1:4181/';
const caseIds = [
  'marina_amoxicilina', 'jose_gripe', 'clara_cefaleia', 'nelson_infarto',
  'paulo_dor_lombar', 'joao_queimacao', 'helena_avc', 'dona_rosa_hipotensao',
  'carlos_asma', 'bia_apendicite', 'carla_dengue', 'roberto_dispepsia',
  'catia_dermatite', 'ana_coriza',
];
const models = caseIds.map((caseId) => [
  caseId,
  modelForCaseId(caseId, { includeReviewCandidates: true }),
]);
assert.ok(models.every(([, modelId]) => typeof modelId === 'string' && modelId.length > 0),
  'every cache stress case must resolve to a model from the current case catalog');
const browser = await chromium.launch({ headless: true, channel: 'chrome',
  ...(process.env.QA_SOFTWARE === '1' ? { args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) });
const errors = [];
const samples = [];

async function settleAvatarTransition(page, expected = {}) {
  const maxSteps = 600;
  for (let step = 0; step < maxSteps; step++) {
    // Complete the real avatar transition through its update method. Headless
    // WebGL can throttle RAF heavily, so wall-clock animation timing is not a
    // stable gate for this resource-lifecycle check.
    await page.evaluate(() => {
      const avatar = window.__farmacheck?.game?.avatar;
      avatar?.update(30, performance.now() / 1000);
    });
    const state = await page.evaluate(() => {
      const game = window.__farmacheck?.game;
      return {
        caseId: game?.case?.id || null,
        state: game?.state || null,
        modelId: game?.avatar?.modelId || null,
        hasModel: !!game?.avatar?.getModel(),
        pending: window.__qaAvatarTransition || null,
        error: game?.lastAvatarError || null,
      };
    });
    if (state.pending?.error) throw new Error(`avatar transition rejected: ${state.pending.error}`);
    if (state.error) throw new Error(`avatar transition failed: ${state.error}`);
    const done = state.state === 'ANAMNESE'
      && state.hasModel
      && (!expected.caseId || state.caseId === expected.caseId)
      && (!expected.modelId || state.modelId === expected.modelId)
      && (!expected.waitForCompletion || state.pending?.done === true);
    if (done) return state;
    await page.waitForTimeout(25);
  }
  throw new Error(`avatar transition timed out: ${JSON.stringify(await page.evaluate(() => {
    const game = window.__farmacheck?.game;
    return { caseId: game?.case?.id, state: game?.state, modelId: game?.avatar?.modelId, lastAvatarError: game?.lastAvatarError, pending: window.__qaAvatarTransition };
  }))}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('farmacheck:quality', 'low'));
  const reviewUrl = new URL(base);
  reviewUrl.searchParams.set('candidateReview', '1');
  await page.goto(reviewUrl.toString());
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1');
  await page.click('#capa-iniciar');
  await page.click('#btn-iniciar');
  await page.waitForFunction(() => window.__farmacheck?.avatarCacheStats?.().modelIds.includes('ana_clasica'), null, { timeout: 90000 });
  // The expediente button starts the first patient. Wait for its walk-in to
  // finish before starting another case; overlapping walk() calls replace the
  // active tween and leave the prior startCase promise pending. Advance the
  // actual avatar update deterministically because the renderer throttles RAF.
  await page.waitForFunction(() => {
    const game = window.__farmacheck?.game;
    return game?.state === 'CHEGADA' && !!game.avatar?.getModel();
  }, null, { timeout: 30000 });
  await settleAvatarTransition(page);
  await page.waitForFunction(() => {
    const scene = window.__farmacheck?.scene;
    const fallbacks = scene?.children.filter((node) => node.name.startsWith('fallback:gondola:')) || [];
    const assets = scene?.children.filter((node) => node.name.startsWith('asset:gondola:')) || [];
    return fallbacks.length === 5
      && fallbacks.every((node) => node.userData.propLoad.status === 'loaded')
      && assets.length === 5;
  }, null, { timeout: 45000, polling: 200 });

  const persistentPropResources = await page.evaluate(() => {
    const scene = window.__farmacheck.scene;
    const gondolas = scene.children.filter((node) => node.name.startsWith('asset:gondola:'));
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const seen = new Set();
    const collect = (value) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      if (value.isTexture) { textures.add(value); return; }
      seen.add(value);
      for (const child of Array.isArray(value) ? value : Object.values(value)) collect(child);
    };
    for (const gondola of gondolas) gondola.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        collect(material);
      }
    });
    const disposed = { geometries: [], materials: [], textures: [] };
    for (const [kind, resources] of Object.entries({ geometries, materials, textures })) {
      for (const resource of resources) {
        resource.addEventListener?.('dispose', () => {
          if (!disposed[kind].includes(resource.uuid)) disposed[kind].push(resource.uuid);
        });
      }
    }
    window.__farmacheckAvatarCachePersistentProps = { disposed, gondolas: gondolas.map((node) => node.name) };
    return {
      gondolaCount: gondolas.length,
      geometryCount: geometries.size,
      materialCount: materials.size,
      textureCount: textures.size,
    };
  });
  assert.equal(persistentPropResources.gondolaCount, 5, 'loaded pharmacy gondolas must exist before avatar eviction');
  assert.ok(persistentPropResources.geometryCount > 0, 'loaded pharmacy geometry must be monitored');
  assert.ok(persistentPropResources.materialCount > 0, 'loaded pharmacy materials must be monitored');

  const rounds = 3;
  for (let round = 0; round < rounds; round++) {
    for (const [caseId, modelId] of models) {
      await page.evaluate((id) => {
        document.getElementById('menu').hidden = true;
        const game = window.__farmacheck.game;
        const caseDef = game.cases.find((item) => item.id === id);
        window.__qaAvatarTransition = { done: false, error: null };
        Promise.resolve(game.startCase(caseDef)).then(
          () => { window.__qaAvatarTransition.done = true; },
          (error) => { window.__qaAvatarTransition.error = String(error?.message || error); },
        );
      }, caseId);
      await settleAvatarTransition(page, { caseId, modelId, waitForCompletion: true });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

      const sample = await page.evaluate(() => ({
        cache: window.__farmacheck.avatarCacheStats(),
        renderer: { ...window.__farmacheck.renderer.info.memory },
        heapUsed: performance.memory?.usedJSHeapSize ?? null,
      }));
      assert.ok(sample.cache.size <= 2, `LRU exceeds two models: ${JSON.stringify(sample.cache)}`);
      assert.ok(sample.cache.modelIds.includes(modelId), `active model missing from LRU: ${modelId}`);
      assert.ok(Number.isFinite(sample.renderer.geometries) && sample.renderer.geometries > 0);
      assert.ok(Number.isFinite(sample.renderer.textures));
      samples.push({ round, caseId, modelId, ...sample });
      await page.evaluate(() => { window.__farmacheck.game.avatar.root.visible = false; });
    }
  }

  assert.deepEqual(errors, []);
  const persistentPropsAfterEviction = await page.evaluate(() => {
    const scene = window.__farmacheck.scene;
    const assets = scene.children.filter((node) => node.name.startsWith('asset:gondola:'));
    const batch = scene.children.find((node) => node.name === 'batch:gondola');
    const batchMeshes = [];
    batch?.traverse((node) => { if (node.isInstancedMesh) batchMeshes.push(node); });
    const hiddenAssets = assets.filter((node) => !node.visible);
    const visibleAssets = assets.filter((node) => node.visible);
    const watch = window.__farmacheckAvatarCachePersistentProps;
    const allMounted = assets.length === 5 && assets.every((node) => node.parent === scene);
    const batchedFrontSourcesRepresented = hiddenAssets.length === 2
      && hiddenAssets.every((node) => node.userData.batchCluster === 'front')
      && visibleAssets.length === 3
      && batch?.parent === scene
      && batch.visible
      && batch.userData.instances === hiddenAssets.length
      && batchMeshes.length === 2
      && batchMeshes.reduce((total, mesh) => total + mesh.count, 0) === 4;
    return {
      assetCount: assets.length,
      allMounted,
      visibleSourceAssets: visibleAssets.map((node) => node.name),
      batchedSourceAssets: hiddenAssets.map((node) => node.name),
      visibleBatch: batch ? {
        mounted: batch.parent === scene,
        visible: batch.visible,
        sourceCount: batch.userData.instances,
        instancedMeshes: batchMeshes.length,
        instanceCount: batchMeshes.reduce((total, mesh) => total + mesh.count, 0),
      } : null,
      allMountedAndRepresented: allMounted
        && (visibleAssets.length === assets.length || batchedFrontSourcesRepresented),
      disposedResources: watch?.disposed || null,
      watchedGondolas: watch?.gondolas || [],
    };
  });
  assert.equal(persistentPropsAfterEviction.allMountedAndRepresented, true,
    `all five pharmacy gondolas must remain mounted and visible directly or through the front batch after avatar cache evictions: ${JSON.stringify(persistentPropsAfterEviction)}`);
  assert.deepEqual(persistentPropsAfterEviction.disposedResources, { geometries: [], materials: [], textures: [] }, 'avatar eviction must not dispose persistent pharmacy resources');
  const report = {
    status: 'PASS',
    baseUrl: new URL(base).origin,
    runtime: {
      browser: 'Chrome headless via Playwright',
      viewport: '900x600',
      quality: 'low',
      candidateReview: true,
      transitionDriver: 'avatar.update(30, performance.now() / 1000)',
      note: 'Headless WebGL throttles RAF; deterministic transition updates isolate resource lifecycle and are not a motion-timing or device-performance benchmark.',
    },
    rounds,
    swaps: samples.length,
    modelIds: [...new Set(samples.map((sample) => sample.modelId))],
    maxCacheSize: Math.max(...samples.map((sample) => sample.cache.size)),
    maxRendererGeometries: Math.max(...samples.map((sample) => sample.renderer.geometries)),
    maxRendererTextures: Math.max(...samples.map((sample) => sample.renderer.textures)),
    heapMeasurementsAvailable: samples.some((sample) => sample.heapUsed !== null),
    persistentPropResources,
    persistentPropsAfterEviction,
    samples,
    pageErrors: errors,
  };
  const reportJson = JSON.stringify(report, null, 2);
  if (process.env.QA_REPORT_PATH) await writeFile(process.env.QA_REPORT_PATH, `${reportJson}\n`);
  console.log(reportJson);
} finally {
  await browser.close();
}
