// Captures front/side/rear/side views of the loaded PC, TLAC kit and vitrine.
// The camera override is QA-only and is removed when the browser page closes.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4181/';
const output = resolve(process.argv[3] || '/tmp/farma-pharmacy-prop-angles');
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
  await page.locator('#capa-iniciar').click();
  await page.waitForFunction(() => Boolean(window.__farmacheck?.scene), null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('menu').hidden = true; });
  await page.waitForFunction(() => {
    const children = window.__farmacheck.scene.children;
    const keys = [
      'asset:models/candidates/prop_pc_v002',
      'asset:models/candidates/prop_cpu_v002',
      'asset:models/candidates/prop_mesa_v002',
      'asset:models/candidates/prop_vitrine_v002',
    ];
    return keys.every((prefix) => children.some((node) => node.name.startsWith(prefix)));
  }, null, { timeout: 45000, polling: 200 });

  const targets = await page.evaluate(() => {
    const { scene, camera, graphics } = window.__farmacheck;
    scene.updateMatrixWorld(true);
    const V = camera.position.constructor;
    const boundsFor = (meshes) => {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const mesh of meshes) {
        if (!mesh.isMesh) continue;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (!box) continue;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              const point = new V(x, y, z).applyMatrix4(mesh.matrixWorld).toArray();
              point.forEach((value, i) => {
                min[i] = Math.min(min[i], value);
                max[i] = Math.max(max[i], value);
              });
            }
          }
        }
      }
      return { min, max, center: min.map((value, i) => (value + max[i]) / 2), size: max.map((value, i) => value - min[i]) };
    };
    const meshesUnder = (root) => {
      const meshes = [];
      root?.traverse((node) => { if (node.isMesh && node.visible) meshes.push(node); });
      return meshes;
    };
    const pcRoots = scene.children.filter((node) =>
      node.name.startsWith('asset:models/candidates/prop_pc_v002')
      || node.name.startsWith('asset:models/candidates/prop_cpu_v002'));
    const pcMeshes = pcRoots.flatMap(meshesUnder);

    const allMeshes = [];
    scene.traverse((node) => { if (node.isMesh && node.visible) allMeshes.push(node); });
    const kitMeshes = allMeshes.filter((mesh) => {
      const point = mesh.getWorldPosition(new V());
      return point.x > 2.35 && point.x < 4.45
        && point.y > 0.15 && point.y < 2.6
        && point.z > 0.55 && point.z < 2.35;
    });
    const vitrine = scene.children.find((node) => node.name.startsWith('asset:models/candidates/prop_vitrine_v002'));
    const definitions = [
      { id: 'computador', meshes: pcMeshes, frontYaw: 0.5, distance: 1.95 },
      { id: 'kit', meshes: kitMeshes, frontYaw: -0.35, distance: 2.15 },
      { id: 'vitrine', meshes: meshesUnder(vitrine), frontYaw: -Math.PI / 2, distance: 3.2 },
    ];
    for (const definition of definitions) {
      for (const mesh of definition.meshes) mesh.userData.qaAngleTarget = definition.id;
    }
    const result = definitions.map((entry) => ({
      id: entry.id,
      ...boundsFor(entry.meshes),
      frontYaw: entry.frontYaw,
      distance: entry.distance,
      meshCount: entry.meshes.length,
    }));

    window.__pharmacyAngleCamera = null;
    graphics.addTicker(() => {
      const pose = window.__pharmacyAngleCamera;
      if (!pose) return;
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    });
    return result;
  });

  const views = [];
  for (const target of targets) {
    if (!target.meshCount || target.min.some((value) => !Number.isFinite(value))) {
      views.push({ target: target.id, ok: false, error: 'No visible target meshes found', meshCount: target.meshCount });
      continue;
    }
    for (const [angle, offset] of [['front', 0], ['right', Math.PI / 2], ['rear', Math.PI], ['left', 3 * Math.PI / 2]]) {
      const yaw = target.frontYaw + offset;
      const position = [
        target.center[0] + Math.sin(yaw) * target.distance,
        Math.max(1.55, target.center[1] + 0.28),
        target.center[2] + Math.cos(yaw) * target.distance,
      ];
      const pose = { position, target: target.center };
      await page.evaluate((next) => { window.__pharmacyAngleCamera = next; }, pose);
      await page.waitForTimeout(120);
      const projection = await page.evaluate((data) => {
        const { camera, scene } = window.__farmacheck;
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const V = camera.position.constructor;
        const canvas = document.querySelector('canvas');
        const points = [];
        for (const x of [data.min[0], data.max[0]]) {
          for (const y of [data.min[1], data.max[1]]) {
            for (const z of [data.min[2], data.max[2]]) {
              const p = new V(x, y, z).project(camera);
              points.push([(p.x + 1) * canvas.clientWidth / 2, (1 - p.y) * canvas.clientHeight / 2, p.z]);
            }
          }
        }
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
        const frame = { width: canvas.clientWidth, height: canvas.clientHeight };
        const inFront = points.every(([, , z]) => z >= -1 && z <= 1);
        const fullyInsideCanvas = bounds.left >= 0 && bounds.top >= 0
          && bounds.right <= frame.width && bounds.bottom <= frame.height;
        return { bounds, frame, inFront, fullyInsideCanvas };
      }, target);
      const basename = `prop-angle-${target.id}-${angle}`;
      await page.screenshot({ path: join(output, `${basename}.png`), timeout: 30000 });
      views.push({ target: target.id, angle, pose, ...projection, ok: projection.inFront && projection.fullyInsideCanvas });
    }
  }

  // A parede bloqueia a face traseira da vitrine no espaço de jogo. Capturá-la
  // isolada permite revisar a malha completa sem mover o asset no cenário.
  const vitrineTarget = targets.find((target) => target.id === 'vitrine');
  const isolatedViews = [];
  if (vitrineTarget?.meshCount) {
    await page.evaluate(() => {
      window.__farmacheck.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.qaOriginalVisible = node.visible;
        node.visible = node.userData.qaAngleTarget === 'vitrine';
      });
    });
    for (const [angle, offset] of [['front', 0], ['right', Math.PI / 2], ['rear', Math.PI], ['left', 3 * Math.PI / 2]]) {
      const yaw = vitrineTarget.frontYaw + offset;
      const position = [
        vitrineTarget.center[0] + Math.sin(yaw) * vitrineTarget.distance,
        Math.max(1.55, vitrineTarget.center[1] + 0.28),
        vitrineTarget.center[2] + Math.cos(yaw) * vitrineTarget.distance,
      ];
      const pose = { position, target: vitrineTarget.center };
      await page.evaluate((next) => { window.__pharmacyAngleCamera = next; }, pose);
      await page.waitForTimeout(120);
      const projection = await page.evaluate((data) => {
        const { camera, scene } = window.__farmacheck;
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const V = camera.position.constructor;
        const canvas = document.querySelector('canvas');
        const points = [];
        for (const x of [data.min[0], data.max[0]]) {
          for (const y of [data.min[1], data.max[1]]) {
            for (const z of [data.min[2], data.max[2]]) {
              const p = new V(x, y, z).project(camera);
              points.push([(p.x + 1) * canvas.clientWidth / 2, (1 - p.y) * canvas.clientHeight / 2, p.z]);
            }
          }
        }
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
        const frame = { width: canvas.clientWidth, height: canvas.clientHeight };
        const inFront = points.every(([, , z]) => z >= -1 && z <= 1);
        const fullyInsideCanvas = bounds.left >= 0 && bounds.top >= 0
          && bounds.right <= frame.width && bounds.bottom <= frame.height;
        return { bounds, frame, inFront, fullyInsideCanvas };
      }, vitrineTarget);
      const basename = `prop-angle-vitrine-isolated-${angle}`;
      await page.screenshot({ path: join(output, `${basename}.png`), timeout: 30000 });
      isolatedViews.push({ target: 'vitrine', angle, pose, ...projection, ok: projection.inFront && projection.fullyInsideCanvas });
    }
  }

  const report = {
    url,
    viewport: { width: 1280, height: 800 },
    targetBounds: targets,
    views,
    isolatedViews,
    pageErrors: errors,
    passed: views.length === 12 && views.every((view) => view.ok)
      && isolatedViews.length === 4 && isolatedViews.every((view) => view.ok) && errors.length === 0,
  };
  writeFileSync(join(output, 'prop_angle_review.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed: report.passed,
    views: views.map(({ target, angle, ok, bounds, frame, error }) => ({ target, angle, ok, bounds, frame, error })),
    isolatedViews: isolatedViews.map(({ target, angle, ok, bounds, frame }) => ({ target, angle, ok, bounds, frame })),
    targetBounds: targets.map(({ id, min, max, size, meshCount }) => ({ id, min, max, size, meshCount })),
    pageErrors: errors,
    output,
  }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
} finally {
  await browser.close();
}
