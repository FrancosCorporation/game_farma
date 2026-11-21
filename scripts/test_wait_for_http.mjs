import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { waitForHttp } from './util/wait_for_http.mjs';

const server = createServer((_request, response) => {
  server.requests += 1;
  response.writeHead(server.requests < 3 ? 503 : 200);
  response.end();
});
server.requests = 0;
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const { port } = server.address();
  const status = await waitForHttp(`http://127.0.0.1:${port}/`, {
    timeoutMs: 2_000,
    intervalMs: 10,
    requestTimeoutMs: 250,
  });
  assert.equal(status, 200);
  assert.equal(server.requests, 3, 'readiness retries transient non-OK responses');
  await assert.rejects(
    waitForHttp(`http://127.0.0.1:${port}/`, { processRef: { exitCode: 1 } }),
    /server exited early with code 1/,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('✔ HTTP readiness retries transient startup responses and detects an exited managed server');
