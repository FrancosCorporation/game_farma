import assert from 'node:assert/strict';
import { LLMClient } from '../src/ai/llm.js';
import { generatePatientReply } from '../src/ai/patientReply.js';

const realFetch = globalThis.fetch;
const realNow = Date.now;
let now = 10000;
let online = false;
let probes = 0;
let primaryChats = 0;
let fallbackCalls = 0;
Date.now = () => now;
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/models')) {
    probes++;
    return new Response('[]', { status: online ? 200 : 503 });
  }
  if (String(url) === 'http://fallback.test') {
    fallbackCalls++;
    return new Response('{"error":"not configured"}', { status: 503 });
  }
  primaryChats++;
  if (!online) throw new TypeError('connection refused');
  return new Response(
    'data: {"choices":[{"delta":{"content":"Hoje estou me sentindo melhor."}}]}\n\ndata: [DONE]\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
};

try {
  const llm = new LLMClient({ baseUrl: 'http://llm.test/v1', fallbackUrl: 'http://fallback.test', retryMs: 5000 });
  assert.equal(await llm.probe(), false);
  const input = {
    llm,
    caseDef: { persona: { falaForaDominio: 'Só vim buscar o que pedi.', falaRepetida: 'Ainda não sei.' } },
    knowledge: { turnsWithoutNews: 0, recent: () => [] },
    newFacts: [],
    evasions: [],
    language: 'pt',
  };
  const offlineReply = await generatePatientReply(input);
  assert.equal(offlineReply, 'Só vim buscar o que pedi.');
  assert.equal(probes, 1, 'não sonda repetidamente durante o intervalo de espera');
  assert.equal(primaryChats, 0, 'não tenta geração no llama.cpp enquanto sabe que está offline');
  assert.equal(fallbackCalls, 1, 'tenta o modelo NVIDIA atrás do endpoint do game');

  now += 5001;
  online = true;
  const recoveredReply = await generatePatientReply(input);
  assert.equal(recoveredReply, 'Hoje estou me sentindo melhor.');
  assert.equal(probes, 2, 'sonda novamente depois do intervalo');
  assert.equal(primaryChats, 1, 'retoma a geração quando o serviço volta');
  assert.equal(llm.ok, true);

  online = false;
  await assert.rejects(() => llm.chat([{ role: 'user', content: 'teste' }]), /connection refused/);
  assert.equal(llm.ok, false, 'marca falha de geração como indisponibilidade');
  const primaryRequestsBeforeCooldown = probes + primaryChats;
  const fallbackRequestsBeforeCooldown = fallbackCalls;
  await assert.rejects(() => llm.chat([{ role: 'user', content: 'teste' }]), /temporariamente indisponível/);
  assert.equal(probes + primaryChats, primaryRequestsBeforeCooldown, 'não insiste no llama.cpp durante o intervalo');
  assert.equal(fallbackCalls, fallbackRequestsBeforeCooldown + 1, 'continua tentando o fallback configurado');

  const optedOut = new LLMClient({ primaryEnabled: false, fallbackEnabled: false });
  const requestsBeforeOptOut = probes + primaryChats + fallbackCalls;
  await assert.rejects(() => optedOut.chat([{ role: 'user', content: 'teste' }]), /primário desativado/);
  assert.equal(probes + primaryChats + fallbackCalls, requestsBeforeOptOut, 'modo sem IA não consulta endpoint local nem remoto');
  console.log('✔ LLM availability: offline fallback, retry interval and automatic recovery');
} finally {
  globalThis.fetch = realFetch;
  Date.now = realNow;
}
