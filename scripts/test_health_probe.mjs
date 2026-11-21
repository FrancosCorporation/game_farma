import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { probeReadiness } from '../server/healthProbe.mjs';

let responseMode = 'ready';
const server = createServer((_request, response) => {
  if (responseMode === 'spa') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>FarmaCheck</title>');
    return;
  }
  if (responseMode === 'not-ready') {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'not_ready' }));
    return;
  }
  if (responseMode === 'wrong-json') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ status: 'ready' }));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;

try {
  assert.equal(await probeReadiness({ port }), true, 'valid JSON readiness passes');
  responseMode = 'spa';
  assert.equal(await probeReadiness({ port }), false, 'SPA fallback HTML with HTTP 200 is rejected');
  responseMode = 'not-ready';
  assert.equal(await probeReadiness({ port }), false, 'HTTP 503 is rejected');
  responseMode = 'wrong-json';
  assert.equal(await probeReadiness({ port }), false, 'liveness JSON is not sufficient for readiness');
  console.log('PASS health probe: accepts JSON ready only; rejects SPA 200, not-ready, and wrong JSON state');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
