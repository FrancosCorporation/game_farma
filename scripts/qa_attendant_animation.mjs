// Confirma que os clips Idle dos dois personagens ambientais avançam no game.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://127.0.0.1:4181/';
const output = process.argv[3] || resolve(root, '.planning/2026-10-12-melhoria-integral/implementation/20261018_fc018_019_recheck/attendant_animation_qa.json');
const expectedModels = [
  { role: 'counter', url: 'models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb' },
  { role: 'gondola', url: 'models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb' },
];
const roles = expectedModels.map(({ role }) => role);
const sourceFiles = [
  'scripts/qa_attendant_animation.mjs', 'scripts/qa_pharmacy_props.mjs',
  'package.json', 'package-lock.json', 'src/app.js', 'src/scene/scene.js',
  'src/scene/qualitySettings.js', 'src/scene/pharmacy.js', 'src/scene/pharmacyProps.js',
  'src/scene/characterOrientation.js', 'src/scene/glbLoader.js',
];
const assetFiles = [
  'public/models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb',
  'public/models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb',
];
const hashFiles = (files) => files.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const sourceManifest = hashFiles(sourceFiles);
const assetManifest = hashFiles(assetFiles);
const assetForRuntimeUrl = (runtimeUrl) => {
  const relativePath = String(runtimeUrl || '').split('?')[0].replace(/^\/+/, '');
  return assetManifest.find((entry) => entry.path === `public/${relativePath}`) || null;
};
const startedAt = new Date();
let browser;
let report;

try {
  browser = await chromium.launch({ headless: true });
  const sampleMode = async (reducedMotion) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const assetResponseTasks = [];
    page.on('response', (response) => {
      const parsed = new URL(response.url());
      if (!parsed.pathname.endsWith('.glb')) return;
      assetResponseTasks.push((async () => {
        try {
          return {
            url: `${parsed.pathname.replace(/^\/+/, '')}${parsed.search}`,
            status: response.status(),
            sha256: createHash('sha256').update(await response.body()).digest('hex'),
          };
        } catch (error) {
          return { url: `${parsed.pathname.replace(/^\/+/, '')}${parsed.search}`, status: response.status(), error: error.message };
        }
      })());
    });
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
    await page.locator('#capa-iniciar').click();
    await page.waitForFunction(() => Boolean(window.__farmacheck?.scene), null, { timeout: 60000 });
    await page.waitForFunction((expectedRoles) => expectedRoles.every((role) => {
      const group = window.__farmacheck.scene.children.find((node) => node.name === `pharmacy:attendant:${role}`);
      return group?.userData.ambientCharacter.status === 'loaded'
        && group.userData.ambientCharacter.animation === 'Idle';
    }), roles, { timeout: 45000, polling: 200 });

    const capture = () => page.evaluate((expectedRoles) => expectedRoles.map((role) => {
      const group = window.__farmacheck.scene.children.find((node) => node.name === `pharmacy:attendant:${role}`);
      const model = group.children.find((node) => node.name === `model:${role}`);
      const bones = [];
      model.traverse((node) => {
        if (node.isBone) bones.push({
          name: node.name,
          pose: [...node.position.toArray(), ...node.quaternion.toArray()],
        });
      });
      return {
        role,
        modelId: group.userData.ambientCharacter.url,
        reducedMotion: group.userData.ambientCharacter.reducedMotion,
        bones,
      };
    }), roles);

    const before = await capture();
    await page.waitForTimeout(2500);
    const after = await capture();
    const results = before.map((entry, index) => {
      const later = new Map(after[index].bones.map((bone) => [bone.name, bone.pose]));
      let maxPoseDelta = 0;
      for (const bone of entry.bones) {
        const next = later.get(bone.name) || [];
        for (let component = 0; component < Math.min(bone.pose.length, next.length); component++) {
          maxPoseDelta = Math.max(maxPoseDelta, Math.abs(bone.pose[component] - next[component]));
        }
      }
      return {
        role: entry.role,
        modelId: entry.modelId,
        expectedUrl: expectedModels.find(({ role }) => role === entry.role)?.url,
        runtimeUrlMatchesExpected: entry.modelId === expectedModels.find(({ role }) => role === entry.role)?.url,
        expectedAssetSha256: assetForRuntimeUrl(entry.modelId)?.sha256 || null,
        expectedAssetHashed: Boolean(assetForRuntimeUrl(entry.modelId)),
        bones: entry.bones.length,
        reducedMotion: entry.reducedMotion,
        sampleIntervalMs: 2500,
        maxPoseDelta,
        expectedMotion: !reducedMotion,
        behaviorMatchesPreference: entry.bones.length === 65
          && entry.reducedMotion === reducedMotion
          && entry.modelId === expectedModels.find(({ role }) => role === entry.role)?.url
          && Boolean(assetForRuntimeUrl(entry.modelId))
          && (reducedMotion ? maxPoseDelta <= 1e-6 : maxPoseDelta > 1e-5),
      };
    });
    const modelResponses = await Promise.all(assetResponseTasks);
    for (const result of results) {
      const runtimeResponse = modelResponses.find((response) => response.url === result.modelId) || null;
      result.runtimeResponse = runtimeResponse;
      result.runtimeResponseMatchesManifest = Boolean(runtimeResponse && runtimeResponse.status === 200
        && result.expectedAssetSha256 && runtimeResponse.sha256 === result.expectedAssetSha256);
      result.behaviorMatchesPreference = result.behaviorMatchesPreference && result.runtimeResponseMatchesManifest;
    }
    await page.close();
    return { preference: reducedMotion ? 'reduce' : 'no-preference', results, modelResponses };
  };

  const modes = [await sampleMode(false), await sampleMode(true)];
  report = {
    schema: 'farmacheck.attendant-idle-runtime-qa.v2',
    url,
    status: 'running',
    startedAt: startedAt.toISOString(),
    sampleIntervalMs: 2500,
    result: modes.every((mode) => mode.results.every((result) => result.behaviorMatchesPreference)) ? 'PASS' : 'FAIL',
    modes,
    sourceManifest,
    assetManifest,
  };
  assert.equal(report.result, 'PASS', JSON.stringify(modes));
  report.status = 'passed';
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report ??= {
    schema: 'farmacheck.attendant-idle-runtime-qa.v2', url, status: 'failed',
    startedAt: startedAt.toISOString(), sampleIntervalMs: 2500, result: 'FAIL', modes: [],
    sourceManifest, assetManifest,
  };
  report.status = 'failed';
  report.failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (output && report) {
    const path = resolve(output);
    mkdirSync(dirname(path), { recursive: true });
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Evidence: ${path}`);
  }
}
