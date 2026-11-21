// Contract tests for the optional Free Shift case endpoint.
import assert from 'node:assert/strict';
import { CASES, fetchNextCase } from '../src/data/cases.js';
import { loadCaseServiceConfig, normalizeCaseServerURL, saveCaseServiceConfig } from '../src/core/caseService.js';
import { Game } from '../src/core/game.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

assert.equal(normalizeCaseServerURL('http://127.0.0.1:4174/'), 'http://127.0.0.1:4174');
assert.equal(normalizeCaseServerURL('javascript:alert(1)'), '');
assert.equal(normalizeCaseServerURL('https://user:pass@example.test'), '');
assert.equal(normalizeCaseServerURL('https://example.test/?token=secret'), '');
assert.equal(saveCaseServiceConfig({ baseUrl: 'http://127.0.0.1:4174/' }), true);
assert.deepEqual(loadCaseServiceConfig(), { baseUrl: 'http://127.0.0.1:4174' });

const originalFetch = globalThis.fetch;
try {
  const local = CASES.find((item) => item.id === 'marina_amoxicilina');
  let calledWithoutConfig = false;
  globalThis.fetch = async () => { calledWithoutConfig = true; throw new Error('network must stay unused'); };
  assert.equal(await fetchNextCase('', 10), null, 'empty service URL skips the request');
  assert.equal(calledWithoutConfig, false, 'unconfigured mode does not touch the network');

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:4174/cases/next');
    assert.equal(options.method, 'POST');
    return { ok: true, json: async () => ({
      id: 'marina_amoxicilina_s123456',
      seed: 123456,
      persona: { nome: '<script>untrusted</script>' },
      errosCriticos: [{ teste: 'not a function' }],
    }) };
  };
  const received = await fetchNextCase('http://127.0.0.1:4174/');
  assert.equal(received.id, 'marina_amoxicilina', 'randomized ID maps to canonical local ID');
  assert.equal(received.seed, 123456, 'a valid deterministic seed is retained');
  assert.equal(received.persona.nome, local.persona.nome, 'API cannot replace local case content');
  assert.equal(typeof received.errosCriticos[0].teste, 'function', 'local scoring callbacks survive JSON transport');

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'unknown_case', seed: 5 }) });
  assert.equal(await fetchNextCase('http://127.0.0.1:4174'), null, 'unknown case IDs fall back locally');

  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await fetchNextCase('http://127.0.0.1:4174'), null, 'server errors fall back locally');

  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  assert.equal(await fetchNextCase('http://127.0.0.1:4174', 10), null, 'request timeout falls back locally');

  saveCaseServiceConfig({ baseUrl: '' });
  let localSelection = null;
  let unexpectedRequests = 0;
  globalThis.fetch = async () => { unexpectedRequests++; throw new Error('local Free Shift must not use the network'); };
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    el: { debrief: { hidden: false } },
    debriefFocus: { close() {} },
    phaseDef: () => ({ id: 'livre' }),
    caseOrder: [],
    cases: [local],
    progress: { state: { porFase: { livre: { feitos: [] } } } },
    lastIdx: -1,
    startCase: async (caseDef) => { localSelection = caseDef; },
  });
  await game.nextPatient();
  assert.equal(localSelection.id, local.id, 'Free Shift selects a local case when no service is configured');
  assert.equal(unexpectedRequests, 0, 'local Free Shift fallback does not call the network');

  // O endpoint pode continuar servindo o catálogo completo enquanto o jogo
  // oferece apenas Mariana. Uma resposta antiga não reabre os demais casos.
  const mariana = CASES.find((item) => item.id === 'carla_dengue');
  saveCaseServiceConfig({ baseUrl: 'http://127.0.0.1:4174' });
  game.cases = [mariana];
  game.caseOrder = [mariana.id];
  localSelection = null;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: local.id, seed: 10 }) });
  await game.nextPatient();
  assert.equal(localSelection.id, mariana.id, 'Free Shift filters service responses through the active roster');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('✅ case-service QA: separate config, bounded request, canonical local rules, safe fallback');
