// Exercita os GLBs ativos da farmácia, o compartilhamento e o fallback de rede.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://127.0.0.1:4181/';
const output = process.argv[3] || '/tmp/farma-props';
const viewports = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
];
const activeProps = [
  { path: 'models/candidates/prop_balcao_v001', url: 'models/candidates/prop_balcao_v001.glb?v=1' },
  { path: 'models/candidates/prop_pc_v002', url: 'models/candidates/prop_pc_v002.glb?v=2' },
  { path: 'models/candidates/prop_cpu_v002', url: 'models/candidates/prop_cpu_v002.glb?v=2' },
  { path: 'models/candidates/prop_mesa_v002', url: 'models/candidates/prop_mesa_v002.glb?v=2' },
  { path: 'models/candidates/prop_vitrine_v002', url: 'models/candidates/prop_vitrine_v002.glb?v=2' },
];
const expectedGondolaUrl = 'models/candidates/prop_gondola_v002.glb?v=2';
const activeAttendants = [
  { role: 'counter', url: 'models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb' },
  { role: 'gondola', url: 'models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb' },
];
const sourceFiles = [
  'scripts/qa_pharmacy_props.mjs', 'scripts/qa_attendant_animation.mjs',
  'package.json', 'package-lock.json', 'src/app.js', 'src/scene/scene.js',
  'src/scene/qualitySettings.js', 'src/scene/pharmacy.js', 'src/scene/pharmacyProps.js',
  'src/scene/characterOrientation.js', 'src/scene/glbLoader.js',
  'src/scene/pov.js',
];
const assetFiles = [
  ...activeProps.map(({ path }) => `public/${path}.glb`),
  'public/models/candidates/prop_gondola_v002.glb',
  ...activeAttendants.map((attendant) => `public/${attendant.url}`),
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
mkdirSync(output, { recursive: true });
let browser;
const results = [];
let failure = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) for (const fallback of [false, true]) {
    const { id, width, height, ...device } = viewport;
    const page = await browser.newPage({ viewport: { width, height }, ...device });
    const errors = [];
    const assetResponseTasks = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      const parsed = new URL(response.url());
      const modelPathIndex = parsed.pathname.lastIndexOf('/models/');
      if (modelPathIndex < 0 || !parsed.pathname.endsWith('.glb')) return;
      const runtimePath = `${parsed.pathname.slice(modelPathIndex + 1)}${parsed.search}`;
      assetResponseTasks.push((async () => {
        try {
          return {
            url: runtimePath,
            status: response.status(),
            sha256: createHash('sha256').update(await response.body()).digest('hex'),
          };
        } catch (error) {
          return { url: runtimePath, status: response.status(), error: error.message };
        }
      })());
    });
    if (fallback) await page.route('**/models/candidates/prop_*.glb*', (route) => route.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
    await page.locator('#capa-iniciar').click();
    await page.waitForFunction(() => Boolean(window.__farmacheck?.scene), null, { timeout: 60000, polling: 200 });
    await page.waitForFunction(({ fallback, activeProps, activeAttendants }) => {
      const children = window.__farmacheck.scene.children;
      const propsSettled = activeProps.every(({ path }) => {
        const asset = children.find((n) => n.name.startsWith(`asset:${path}`));
        const placeholder = children.find((n) => n.name.startsWith(`fallback:${path}`));
        return fallback ? placeholder?.userData.propLoad.status === 'fallback'
          : asset && placeholder?.userData.propLoad.status === 'loaded';
      });
      const gondolasSettled = children.filter((n) => n.name.startsWith('fallback:gondola:'))
        .every((n) => n.userData.propLoad.status === (fallback ? 'fallback' : 'loaded'));
      const attendantsSettled = activeAttendants.every((attendant) => {
        const group = children.find((n) => n.name === `pharmacy:attendant:${attendant.role}`);
        return group?.userData.ambientCharacter.status === 'loaded';
      });
      return propsSettled && gondolasSettled && attendantsSettled;
    }, { fallback, activeProps, activeAttendants, expectedGondolaUrl }, { timeout: 45000, polling: 200 });
    const report = await page.evaluate(({ fallback, activeProps, activeAttendants, expectedGondolaUrl }) => {
      const children = window.__farmacheck.scene.children;
      const placeholders = children.filter((n) => n.name.startsWith('fallback:gondola:'));
      const assets = children.filter((n) => n.name.startsWith('asset:gondola:'));
      const geometries = [];
      const materials = [];
      for (const asset of assets) asset.traverse((node) => {
        if (!node.isMesh) return;
        geometries.push(node.geometry.uuid);
        materials.push(node.material.uuid);
      });
      const correctFallback = placeholders.length === 5 && placeholders.every((n) => {
        const productBatches = n.children.filter((child) => child.isInstancedMesh && child.name.startsWith('gondola:fallback-products:'));
        return n.visible === fallback
          && n.userData.propLoad.status === (fallback ? 'fallback' : 'loaded')
          && n.children.filter((child) => child.isMesh).length >= 18
          && productBatches.length === 10
          && productBatches.reduce((total, batch) => total + batch.count, 0) === 40
          && productBatches.every((batch) => !batch.castShadow && batch.receiveShadow);
      });
      const shared = fallback || (assets.length === 5 && new Set(geometries).size * 5 === geometries.length && new Set(materials).size <= 2);
      const activeAssetReport = activeProps.map(({ path, url: expectedUrl }) => {
        const asset = children.find((n) => n.name.startsWith(`asset:${path}`));
        const placeholder = children.find((n) => n.name.startsWith(`fallback:${path}`));
        let assetMeshes = 0;
        let fallbackMeshes = 0;
        asset?.traverse((node) => { if (node.isMesh) assetMeshes += 1; });
        placeholder?.traverse((node) => { if (node.isMesh) fallbackMeshes += 1; });
        const expectedStatus = fallback ? 'fallback' : 'loaded';
        return {
          path,
          expectedUrl,
          runtimeUrl: placeholder?.userData.propLoad.url,
          loadedAssetUrl: asset?.name.startsWith('asset:') ? asset.name.slice('asset:'.length) : null,
          status: placeholder?.userData.propLoad.status,
          assetVisible: Boolean(asset?.visible),
          placeholderVisible: Boolean(placeholder?.visible),
          assetMeshes,
          fallbackMeshes,
          ok: placeholder?.userData.propLoad.status === expectedStatus
            && placeholder?.userData.propLoad.url === expectedUrl
            && (fallback ? placeholder.visible && fallbackMeshes > 0 : asset?.visible && assetMeshes > 0 && !placeholder.visible),
        };
      });
      const attendantReport = activeAttendants.map(({ role, url }) => {
        const group = children.find((n) => n.name === `pharmacy:attendant:${role}`);
        const character = group?.userData.ambientCharacter;
        const model = group?.children.find((node) => node.name === `model:${role}`);
        return {
          role,
          expectedUrl: url,
          runtimeUrl: character?.url,
          status: character?.status,
          animation: character?.animation,
          height: character?.height,
          dimensions: character?.dimensions,
          axisCorrection: character?.axisCorrection,
          skinnedMeshes: character?.skinnedMeshes,
          position: group?.position.toArray(),
          reducedMotion: character?.reducedMotion,
          modelVisible: Boolean(model?.visible),
          ok: character?.status === 'loaded' && character.animation === 'Idle'
            && character.url === url
            && character.skinnedMeshes === 1 && Math.abs(character.height - 1.72) < 0.001
            && ['y-up', 'z-up'].includes(character.axisCorrection)
            && Array.isArray(character.dimensions) && character.dimensions.length === 3
            && character.dimensions[0] <= 1 && character.dimensions[2] <= 1
            && Boolean(model?.visible),
        };
      });
      const gondolaReport = placeholders.map((placeholder) => {
        const suffix = placeholder.name.slice('fallback:gondola:'.length);
        const loadedAsset = children.find((node) => node.name === `asset:gondola:${suffix}`);
        return {
          sceneNode: placeholder.name,
          expectedUrl: expectedGondolaUrl,
          runtimeUrl: placeholder.userData.propLoad.url,
          loadedAssetNodeName: loadedAsset?.name || null,
          status: placeholder.userData.propLoad.status,
          loadedModelPresent: Boolean(loadedAsset),
          ok: placeholder.userData.propLoad.url === expectedGondolaUrl
            && placeholder.userData.propLoad.status === (fallback ? 'fallback' : 'loaded')
            && (fallback ? !loadedAsset : Boolean(loadedAsset)),
        };
      });
      const gondolaBatch = children.find((node) => node.name === 'batch:gondola');
      const gondolaInstances = [];
      gondolaBatch?.traverse((node) => { if (node.isInstancedMesh) gondolaInstances.push(node); });
      const gondolaBatchReport = {
        present: Boolean(gondolaBatch),
        instancedMeshes: gondolaInstances.length,
        instances: gondolaInstances.reduce((total, mesh) => total + mesh.count, 0),
        hiddenSourceAssets: assets.filter((asset) => !asset.visible).length,
        ok: fallback
          ? !gondolaBatch && assets.length === 0
          : gondolaInstances.length === 2 && gondolaInstances.reduce((total, mesh) => total + mesh.count, 0) === 4
            && assets.length === 5 && assets.filter((asset) => !asset.visible).length === 2,
      };
      const counter = children.find((n) => n.name.startsWith(`${fallback ? 'fallback' : 'asset'}:models/candidates/prop_balcao_v001`));
      const minimum = [Infinity, Infinity, Infinity];
      const maximum = [-Infinity, -Infinity, -Infinity];
      counter.updateMatrixWorld(true);
      counter.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = window.__farmacheck.camera.position.clone().set(x, y, z).applyMatrix4(node.matrixWorld).toArray();
          point.forEach((value, i) => { minimum[i] = Math.min(minimum[i], value); maximum[i] = Math.max(maximum[i], value); });
        }
      });
      const size = maximum.map((value, i) => value - minimum[i]);
      const counterFits = [4.8, 1.06, 0.95].every((value, i) => Math.abs(size[i] - value) < 0.003) && Math.abs(minimum[1]) < 0.003;
      return {
        fallback,
        correctFallback,
        shared,
        counterFits,
        counterBounds: { minimum, maximum, size },
        activeAssets: activeAssetReport,
        activeAssetsOk: activeAssetReport.length === activeProps.length && activeAssetReport.every((asset) => asset.ok),
        attendants: attendantReport,
        attendantsOk: attendantReport.length === activeAttendants.length && attendantReport.every((attendant) => attendant.ok),
        gondolas: gondolaReport,
        gondolasOk: gondolaReport.length === 5 && gondolaReport.every((gondola) => gondola.ok),
        gondolaBatch: gondolaBatchReport,
        gondolaBatchOk: gondolaBatchReport.ok,
        assetCount: assets.length,
        geometryCount: new Set(geometries).size,
        materialCount: new Set(materials).size,
      };
    }, { fallback, activeProps, activeAttendants, expectedGondolaUrl });
    for (const asset of report.activeAssets) {
      const manifestEntry = assetForRuntimeUrl(asset.expectedUrl);
      asset.expectedAssetSha256 = manifestEntry?.sha256 || null;
      asset.runtimeUrlMatchesExpected = asset.runtimeUrl === asset.expectedUrl;
      asset.loadedAssetMatchesExpected = fallback
        ? asset.loadedAssetUrl === null
        : asset.loadedAssetUrl === asset.expectedUrl;
      asset.expectedAssetHashed = Boolean(manifestEntry);
      asset.ok = asset.ok && asset.expectedAssetHashed && asset.runtimeUrlMatchesExpected && asset.loadedAssetMatchesExpected;
    }
    for (const attendant of report.attendants) {
      const manifestEntry = assetForRuntimeUrl(attendant.expectedUrl);
      attendant.expectedAssetSha256 = manifestEntry?.sha256 || null;
      attendant.runtimeUrlMatchesExpected = attendant.runtimeUrl === attendant.expectedUrl;
      attendant.expectedAssetHashed = Boolean(manifestEntry);
      attendant.ok = attendant.ok && attendant.expectedAssetHashed && attendant.runtimeUrlMatchesExpected;
    }
    for (const gondola of report.gondolas) {
      const manifestEntry = assetForRuntimeUrl(gondola.expectedUrl);
      gondola.expectedAssetSha256 = manifestEntry?.sha256 || null;
      gondola.runtimeUrlMatchesExpected = gondola.runtimeUrl === gondola.expectedUrl;
      gondola.expectedAssetHashed = Boolean(manifestEntry);
      gondola.ok = gondola.ok && gondola.expectedAssetHashed && gondola.runtimeUrlMatchesExpected;
    }
    report.modelResponses = await Promise.all(assetResponseTasks);
    const responseForUrl = (runtimeUrl) => report.modelResponses.find((response) => response.url === runtimeUrl) || null;
    const responseMatchesManifest = (runtimeUrl) => {
      const response = responseForUrl(runtimeUrl);
      const manifestEntry = assetForRuntimeUrl(runtimeUrl);
      return Boolean(response && response.status === 200 && manifestEntry && response.sha256 === manifestEntry.sha256);
    };
    for (const asset of report.activeAssets) {
      asset.runtimeResponse = responseForUrl(asset.runtimeUrl);
      asset.runtimeResponseMatchesManifest = responseMatchesManifest(asset.runtimeUrl);
      const responseStateMatches = fallback ? !asset.runtimeResponse : asset.runtimeResponseMatchesManifest;
      asset.ok = asset.ok && responseStateMatches;
    }
    for (const attendant of report.attendants) {
      attendant.runtimeResponse = responseForUrl(attendant.runtimeUrl);
      attendant.runtimeResponseMatchesManifest = responseMatchesManifest(attendant.runtimeUrl);
      attendant.ok = attendant.ok && attendant.runtimeResponseMatchesManifest;
    }
    for (const gondola of report.gondolas) {
      gondola.runtimeResponse = responseForUrl(gondola.runtimeUrl);
      gondola.runtimeResponseMatchesManifest = responseMatchesManifest(gondola.runtimeUrl);
      const responseStateMatches = fallback ? !gondola.runtimeResponse : gondola.runtimeResponseMatchesManifest;
      gondola.ok = gondola.ok && responseStateMatches;
    }
    report.activeAssetsOk = report.activeAssets.length === activeProps.length && report.activeAssets.every((asset) => asset.ok);
    report.attendantsOk = report.attendants.length === activeAttendants.length && report.attendants.every((attendant) => attendant.ok);
    report.gondolasOk = report.gondolas.length === 5 && report.gondolas.every((gondola) => gondola.ok);
    report.viewport = viewport.id;
    report.errors = errors;
    await page.evaluate(() => document.getElementById('capa-iniciar').click());
    await page.evaluate(() => { document.getElementById('menu').hidden = true; });
    const prefix = viewport.id === 'desktop' ? (fallback ? 'fallback' : 'loaded') : `${fallback ? 'fallback' : 'loaded'}-${viewport.id}`;
    await page.screenshot({ path: join(output, `${prefix}.png`) });
    const cameraZones = [];
    for (const zone of ['paciente', 'computador', 'mesa']) {
      await page.evaluate((name) => {
        window.__farmacheck.pov.irPara(name, { instantaneo: name !== 'computador' });
      }, zone);
      if (zone === 'computador') {
        // The full pharmacy scene can render slowly under headless SwiftShader;
        // POV time advances on rendered frames, so allow the 0.9 s tween to finish.
        await page.waitForFunction(() => !window.__farmacheck.pov.navegando(), null, { timeout: 45000 });
      }
      const cameraReport = await page.evaluate((name) => {
        const hooks = window.__farmacheck;
        hooks.scene.updateMatrixWorld(true);
        hooks.camera.updateMatrixWorld(true);
        const targetYaw = name === 'computador'
          ? (matchMedia('(max-width: 600px)').matches ? 0.71 : 0.62)
          : name === 'mesa' ? -0.76 : 0;
        const result = {
          name,
          position: hooks.camera.position.toArray(),
          yaw: hooks.camera.rotation.y,
          transitionSettled: !hooks.pov.navegando() && Number.isFinite(hooks.camera.rotation.y)
            && Math.abs(hooks.camera.rotation.y - targetYaw) < 0.001,
        };
        if (name === 'computador') {
          let screen = null;
          hooks.scene.traverse((node) => { if (node.name === 'pharmacy:crm-screen') screen = node; });
          const canvas = document.querySelector('canvas');
          if (!screen || !canvas) return { ...result, crmScreen: { found: Boolean(screen), visible: false } };
          const width = screen.geometry.parameters.width;
          const height = screen.geometry.parameters.height;
          const V = hooks.camera.position.constructor;
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
            const point = new V(x * width / 2, y * height / 2, 0)
              .applyMatrix4(screen.matrixWorld)
              .project(hooks.camera);
            return [(point.x + 1) * canvas.clientWidth / 2, (1 - point.y) * canvas.clientHeight / 2];
          });
          const xs = corners.map(([x]) => x);
          const ys = corners.map(([, y]) => y);
          const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
          return {
            ...result,
            crmScreen: {
              found: true,
              visible: screen.visible,
              canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
              bounds,
              fullyInsideCanvas: bounds.left >= 0 && bounds.top >= 0
                && bounds.right <= canvas.clientWidth && bounds.bottom <= canvas.clientHeight,
            },
          };
        }
        return result;
      }, zone);
      cameraZones.push(cameraReport);
      await page.waitForTimeout(100);
      await page.screenshot({ path: join(output, `${prefix}-${zone}.png`), timeout: 30000 });
    }
    report.cameraZones = cameraZones;
    report.crmScreenInsideCanvas = cameraZones.find((entry) => entry.name === 'computador')?.crmScreen?.fullyInsideCanvas === true;
    report.cameraZonesOk = cameraZones.length === 3 && cameraZones.every((entry) => entry.transitionSettled);
    report.ok = report.correctFallback && report.shared && report.counterFits && report.activeAssetsOk && report.attendantsOk && report.gondolasOk && report.gondolaBatchOk
      && report.crmScreenInsideCanvas && report.cameraZonesOk && errors.length === 0;
    console.log(`${report.ok ? 'PASS' : 'FAIL'} ${viewport.id} — ${fallback ? 'fallback completo de props' : 'GLBs ativos e recursos compartilhados'}`, report);
    results.push(report);
    await page.close();
  }
} catch (error) {
  failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  throw error;
} finally {
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
  const expectedResults = viewports.length * 2;
  const passed = results.length === expectedResults && results.every((result) => result.ok);
  const finishedAt = new Date();
  writeFileSync(join(output, 'qa-run.json'), `${JSON.stringify({
    schema: 'farmacheck.pharmacy-props-runtime-qa.v2',
    id: 'FC-018/019',
    url,
    status: failure ? 'failed' : passed ? 'passed' : 'incomplete',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scenarios: results,
    sourceManifest,
    assetManifest,
    failure,
  }, null, 2)}\n`);
  if (browser) await browser.close().catch(() => {});
}
const expectedResults = viewports.length * 2;
console.log(`\nQA props: ${results.filter((result) => result.ok).length}/${expectedResults} PASS`);
process.exitCode = results.length !== expectedResults || results.some((r) => !r.ok) ? 1 : 0;
