// Rede real: servidor envia headers e um token, depois deixa o stream aberto.
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { LLMClient } from '../src/ai/llm.js';

const sockets = new Set();
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n');
  if (request.url.startsWith('/normal/')) {
    response.end('data: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\n');
  } else if (request.url.startsWith('/done-open/')) {
    response.write('data: [DONE]\n\n');
  }
});
server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const tokens = [];
  const normal = new LLMClient({ baseUrl: `${base}/normal` });
  const answer = await normal.chat([], { timeoutMs: 1000, onToken: (token) => tokens.push(token) });
  assert.equal(answer.text, 'Olá!');
  assert.deepEqual(tokens, ['Olá', '!']);
  console.log('PASS: stream normal e onToken preservados');

  const doneOpen = new LLMClient({ baseUrl: `${base}/done-open` });
  assert.equal((await doneOpen.chat([], { timeoutMs: 500 })).text, 'Olá');
  console.log('PASS: sinal DONE conclui resposta mesmo com conexão aberta');

  const stalled = new LLMClient({ baseUrl: `${base}/stalled` });
  const start = performance.now();
  await assert.rejects(stalled.chat([], { timeoutMs: 150 }), (error) => error.name === 'AbortError');
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 100 && elapsed < 1500, `timeout após ${elapsed}ms`);
  console.log(`PASS: stream travado após headers/token abortado em ${elapsed.toFixed(0)}ms`);
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}
