// Browser QA scope: settings, graphics quality, persistence, progression, reduced motion and Cuidado Integral.
// It does not validate prop/model loading or TTS voice playback.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelForCaseId } from '../src/data/patientAssets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4181/';
const out = process.argv[3] || '/tmp/farma-new-version-qa';
const qaScope = {
  includes: [
    'desktop/mobile graphics defaults and quality presets',
    'settings and progress persistence',
    'phase availability and Carla Cuidado Integral flow',
    'reduced-motion preference',
    'TTS control disabled-state and persistence only',
  ],
  excludes: [
    'runtime loading or visual acceptance of pharmacy props and character models',
    'TTS audio generation, playback, voice quality or lip synchronization',
    'microphone/device and physical-handset checks',
  ],
  assetManifestMeaning: 'hash inventory for selected runtime assets; inclusion is not proof that browser loading or playback was verified',
};
mkdirSync(out, { recursive: true });
const startedAt = new Date();
const listSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  if (entry.isDirectory()) return listSourceFiles(path);
  return /\.(?:js|css)$/.test(entry.name) ? [relative(root, path)] : [];
});
const hashFiles = (files) => files.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const sourceManifest = hashFiles([
  'scripts/qa_new_version.mjs', 'package.json', 'package-lock.json', 'vite.config.js', 'index.html',
  ...listSourceFiles(resolve(root, 'src')),
]);
const assetFiles = [
  `public/models/${modelForCaseId('carla_dengue')}.glb`,
  'public/models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb',
  'public/models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb',
  'public/models/candidates/prop_balcao_v001.glb', 'public/models/candidates/prop_cpu_v002.glb',
  'public/models/candidates/prop_gondola_v002.glb', 'public/models/candidates/prop_mesa_v002.glb',
  'public/models/candidates/prop_pc_v002.glb', 'public/models/candidates/prop_vitrine_v002.glb',
];
const assetManifest = hashFiles([...new Set(assetFiles)]);
let browser;
const results = [];
let failure = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const coverReady = () => page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
    const startScene = async () => {
      await coverReady();
      await page.click('#capa-iniciar');
      await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 60000 });
    };
    const graphics = () => page.evaluate(() => { const g = window.__farmacheck.graphics; return { ...g.quality, pixelRatio: g.renderer.getPixelRatio(), composer: !!g.fx.composer }; });
    await page.goto(base);
    await startScene();
    let settings = await graphics();
    assert.equal(settings.mode, mobile ? 'low' : 'balanced');
    assert.equal(settings.maxFps, mobile ? 30 : 60);
    assert.equal(settings.pixelRatio, mobile ? 1 : 1.5);
    assert.equal(settings.composer, false);
    assert.equal(await page.locator('.phase-card').count(), 5);
    assert.equal(await page.locator('.phase-card:disabled').count(), 3);
    await page.selectOption('#cfg-quality', 'high');
    settings = await graphics();
    assert.equal(settings.mode, 'high');
    assert.equal(settings.maxFps, 60);
    assert.equal(settings.pixelRatio, 2);
    assert.equal(settings.postProcessing, true);
    assert.equal(settings.composer, true);
    await page.selectOption('#cfg-quality', 'low');
    settings = await graphics();
    assert.equal(settings.maxFps, 30);
    assert.equal(settings.shadows, false);
    assert.equal(settings.postProcessing, false);
    assert.equal(settings.pixelRatio, 1);
    await page.locator('#cfg-sfx-volume').fill('0');
    await page.evaluate(() => document.getElementById('cfg-sfx-volume').dispatchEvent(new Event('input', { bubbles: true })));
    await page.evaluate(() => document.getElementById('btn-tts').click());
    assert.equal(await page.locator('#btn-tts').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('farmacheck:sfx-volume')), '0');
    await page.evaluate(() => localStorage.setItem('farmacheck:progress', JSON.stringify({ pontos: 120 })));
    await page.reload();
    await startScene();
    assert.equal((await graphics()).mode, 'low');
    assert.equal((await graphics()).maxFps, 30);
    assert.equal(await page.locator('#cfg-sfx-volume').inputValue(), '0');
    assert.equal(await page.locator('#btn-tts').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.phase-card:disabled').count(), 0);
    await page.locator('.phase-card').nth(3).click();
    await page.click('#btn-iniciar');
    await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 180000, polling: 200 });
    assert.equal(await page.evaluate(() => window.__farmacheck.game.case.id), 'carla_dengue');
    await page.click('#btn-hud-pc');
    assert.equal(await page.locator('#bulario').isVisible(), true);
    await page.click('#btn-bulario-fechar');
    await page.click('#btn-hud-tlac');
    assert.equal(await page.locator('#tlac').isVisible(), true);
    await page.click('#btn-tlac-fechar');
    await page.screenshot({ path: join(out, `${mobile ? 'mobile' : 'desktop'}-cuidados.png`) });
    assert.deepEqual(errors, []);
    results.push({ scenario: mobile ? 'mobile' : 'desktop', status: 'PASS', settings: await graphics(), errors });
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: quality, persistence, audio-control state, phases and Cuidado Integral`);
    await context.close();
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
  await page.click('#capa-iniciar');
  await page.waitForFunction(() => window.__farmacheck?.graphics);
  assert.equal(await page.evaluate(() => window.__farmacheck.graphics.quality.reducedMotion), true);
  results.push({ scenario: 'reduced motion', status: 'PASS' });
  console.log('PASS reduced motion: respected by decorative effects');
  await context.close();
} catch (error) {
  failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  throw error;
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
  const finishedAt = new Date();
  const expectedResults = 3;
  const passed = results.length === expectedResults && results.every((result) => result.status === 'PASS');
  writeFileSync(join(out, 'qa-run.json'), `${JSON.stringify({
    schema: 'farmacheck.new-version-runtime-qa.v2',
    id: 'FC-040',
    url: base,
    status: failure ? 'failed' : passed ? 'passed' : 'incomplete',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scope: qaScope,
    scenarios: results,
    sourceManifest,
    assetManifest,
    failure,
  }, null, 2)}\n`);
  if (browser) await browser.close().catch(() => {});
}
