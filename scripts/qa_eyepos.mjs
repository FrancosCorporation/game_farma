// Detecta a posição exata dos olhos pintados no runtime (three.js):
// renderiza o rosto, acha clusters escuros (íris/pupila), raytraceia para o mesh.
// Uso: node scripts/qa_eyepos.mjs [modelo=ana]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const model = process.argv[2] || 'ana';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
const root = process.cwd();
const srv = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let p = join(root, rel === '/' ? 'index.html' : rel.slice(1));
  if (!existsSync(p) && existsSync(join(root, 'public', rel.slice(1)))) p = join(root, 'public', rel.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 800, height: 700 } }).then(c => c.newPage());
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 150)));
await page.goto(`http://127.0.0.1:${port}/char-preview.html?m=${model}`, { waitUntil: 'load', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.waitForTimeout(500);
const eyes = await page.evaluate(() => {
  const THREE = window.__THREE;
  const renderer = window.__renderer, camera = window.__camera, scene = window.__scene;
  const W = 640, H = 480;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.position.set(0.05, 1.60, 0.55);
  camera.lookAt(0.05, 1.60, 0);
  camera.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(W, H);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  rt.dispose();
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (buf[i * 4] * 0.299 + buf[i * 4 + 1] * 0.587 + buf[i * 4 + 2] * 0.114) / 255;
  // clusters de pixels escuros na faixa central (íris/pupila)
  const clusters = [];
  for (let y = Math.floor(H * 0.30); y < H * 0.70; y += 2) {
    for (let x = Math.floor(W * 0.25); x < W * 0.75; x += 2) {
      const i = y * W + x;
      if (lum[i] < 0.42) {
        let found = false;
        for (const c of clusters) {
          if (Math.abs(c.cx - x) < 70 && Math.abs(c.cy - y) < 55) {
            c.cx = (c.cx * c.n + x) / (c.n + 1); c.cy = (c.cy * c.n + y) / (c.n + 1); c.n++; found = true; break;
          }
        }
        if (!found) clusters.push({ cx: x, cy: y, n: 1 });
      }
    }
  }
  clusters.sort((a, b) => b.n - a.n);
  const raycaster = new THREE.Raycaster();
  const out = [];
  for (const c of clusters.slice(0, 8)) {
    if (c.n < 30) continue;
    const ndc = new THREE.Vector2(c.cx / W * 2 - 1, -(c.cy / H * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(window.__model, true);
    if (!hits.length) continue;
    const h = hits[0];
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const p = h.point.clone();
    // raio em mundo correspondente a ~18px de tela na profundidade do hit
    const ndc2 = new THREE.Vector2((c.cx + 18) / W * 2 - 1, -(c.cy / H * 2 - 1));
    const ray2 = new THREE.Raycaster();
    ray2.setFromCamera(ndc2, camera);
    const dir = ray2.ray.direction.clone().normalize();
    const d0 = camera.position.distanceTo(p);
    const p2 = camera.position.clone().add(dir.multiplyScalar(d0));
    out.push({ n: c.n, pos: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)],
      normal: [+normal.x.toFixed(4), +normal.y.toFixed(4), +normal.z.toFixed(4)],
      irisR: +p.distanceTo(p2).toFixed(4) });
  }
  return out;
});
console.log('EYEPOS:', JSON.stringify(eyes));
await browser.close();
srv.close();