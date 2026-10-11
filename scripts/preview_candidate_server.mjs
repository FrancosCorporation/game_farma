// Temporary, isolated viewer for one candidate GLB. It serves only the existing
// character preview page, its Three.js modules, and this one model — not the
// whole workspace or the active public model.
// Usage: node scripts/preview_candidate_server.mjs <candidate.glb> [host=127.0.0.1] [port=4181]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [candidateArg, host = '127.0.0.1', portArg = '4181'] = process.argv.slice(2);
if (!candidateArg || candidateArg === '--help') {
  console.log('Uso: node scripts/preview_candidate_server.mjs <candidate.glb> [host=127.0.0.1] [port=4181]');
  process.exit(candidateArg ? 0 : 2);
}
const candidate = resolve(candidateArg);
const port = Number(portArg);
if (!candidate.toLowerCase().endsWith('.glb')) throw new Error('a candidata precisa ser um arquivo .glb');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('porta inválida (use 1024–65535)');
const candidateStat = await stat(candidate);
if (!candidateStat.isFile()) throw new Error(`candidata não é arquivo: ${candidate}`);

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previewPage = join(root, 'public', 'char-preview.html');
const vendorRoot = resolve(root, 'public', 'vendor', 'three');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary',
};
const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed');
    return;
  }
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  try {
    if (pathname === '/' || pathname === '/char-preview.html') {
      const body = await readFile(previewPage);
      res.writeHead(200, { 'content-type': mime['.html'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (pathname === '/models/ana_walk_preview.glb') {
      const body = await readFile(candidate);
      res.writeHead(200, { 'content-type': mime['.glb'], 'content-length': body.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (pathname.startsWith('/vendor/three/')) {
      const file = resolve(vendorRoot, decodeURIComponent(pathname.slice('/vendor/three/'.length)));
      const rel = relative(vendorRoot, file);
      if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(file) === vendorRoot) {
        send(res, 403, 'Forbidden');
        return;
      }
      const body = await readFile(file);
      send(res, 200, req.method === 'HEAD' ? '' : body, mime[extname(file)] || 'application/octet-stream');
      return;
    }
    send(res, 404, 'Not Found');
  } catch (error) {
    send(res, error?.code === 'ENOENT' ? 404 : 500, error?.code === 'ENOENT' ? 'Not Found' : 'Preview error');
  }
});

server.listen(port, host, () => {
  console.log(`[preview] http://${host}:${port}/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full`);
  console.log(`[preview] serving candidate only: ${candidate} (${candidateStat.size} bytes)`);
  console.log('[preview] allowed routes: /char-preview.html, /models/ana_walk_preview.glb, /vendor/three/*');
});
