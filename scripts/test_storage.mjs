// Regression checks for corrupt, legacy, and unavailable browser storage.
import assert from 'node:assert/strict';
import { createProgressStore, loadProgress, PROGRESS_SCHEMA_VERSION } from '../src/core/progression.js';
import { hasLLMConfig, loadLLMConfig, saveLLMConfig } from '../src/ai/llm.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
const key = 'farmacheck:progress';

for (const raw of ['{broken', '42', '"text"', 'null', '[]']) {
  localStorage.setItem(key, raw);
  const state = createProgressStore().state;
  assert.equal(state.pontos, 0, `invalid save ${raw} recovers points`);
  assert.deepEqual(state.porFase, {}, `invalid save ${raw} recovers phase progress`);
  assert.deepEqual(state.porCaso, {}, `invalid save ${raw} recovers case progress`);
  assert.deepEqual(state.historico, [], `invalid save ${raw} recovers history`);
}

localStorage.setItem(key, JSON.stringify({
  pontos: 321,
  ultimaFase: 'plantao',
  porFase: { plantao: { feitos: ['carla_dengue'], estrelas: { carla_dengue: 3 } } },
  porCaso: { carla_dengue: 88 },
  combo: 4,
  semReprovar: 5,
  tresEstrelas: 2,
  badges: { combo3: 1234 },
  historico: [{ casoId: 'carla_dengue', nota: 88, stars: 3, faseId: 'plantao', t: 1234 }],
}));
const valid = loadProgress();
assert.equal(valid.schemaVersion, PROGRESS_SCHEMA_VERSION, 'legacy saves migrate to the current schema');
assert.equal(valid.pontos, 321, 'valid points are preserved');
assert.equal(valid.porFase.plantao.estrelas.carla_dengue, 3, 'valid stars are preserved');
assert.equal(valid.porCaso.carla_dengue, 88, 'valid case score is preserved');
assert.equal(valid.historico.length, 1, 'valid history is preserved');
createProgressStore().registerResult({ faseId: 'plantao', casoId: 'carla_dengue', nota: 88, stars: 3 });
assert.equal(JSON.parse(localStorage.getItem(key)).schemaVersion, PROGRESS_SCHEMA_VERSION, 'next save persists migrated schema version');

localStorage.setItem(key, JSON.stringify({
  porFase: {
    aprendiz: {
      feitos: ['carla_dengue', 'helena_avc', 'removed_case'],
      estrelas: { carla_dengue: 2, helena_avc: 3, orphan_case: 1 },
    },
    livre: { feitos: ['external_case_1'], estrelas: { external_case_1: 2 } },
  },
}));
const repairedPhaseCases = loadProgress().porFase;
assert.deepEqual(repairedPhaseCases.aprendiz.feitos, ['carla_dengue'], 'fixed-phase progress excludes unrelated/removed cases');
assert.deepEqual(repairedPhaseCases.aprendiz.estrelas, { carla_dengue: 2 }, 'stars remain attached to completed cases in their phase');
assert.deepEqual(repairedPhaseCases.livre.feitos, ['external_case_1'], 'free-shift case IDs remain extensible');

const futureSave = JSON.stringify({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1, pontos: 900, porFase: {} });
localStorage.setItem(key, futureSave);
const futureStore = createProgressStore();
futureStore.registerResult({ faseId: 'plantao', casoId: 'clara_cefaleia', nota: 80, stars: 2 });
assert.equal(localStorage.getItem(key), futureSave, 'unknown future schema is not overwritten implicitly');
futureStore.reset();
assert.equal(JSON.parse(localStorage.getItem(key)).schemaVersion, PROGRESS_SCHEMA_VERSION, 'explicit reset can replace unsupported schema');

const llmKey = 'farmacheck:llm';
for (const raw of ['{broken', '42', '[]', '{"baseUrl":42,"model":[]}']) {
  localStorage.setItem(llmKey, raw);
  assert.equal(loadLLMConfig().baseUrl, 'http://127.0.0.1:8081/v1', `invalid LLM config ${raw} falls back`);
  assert.equal(hasLLMConfig(), false, `invalid LLM config ${raw} does not enable probing`);
}
assert.equal(saveLLMConfig({ baseUrl: 'https://llm.example/v1/', model: 'test-model' }), true);
assert.deepEqual(loadLLMConfig(), { baseUrl: 'https://llm.example/v1', model: 'test-model' });
assert.equal(hasLLMConfig(), true, 'valid endpoint opts in to probing');
assert.equal(saveLLMConfig({ baseUrl: 'javascript:alert(1)', model: 'x'.repeat(121) }), true);
assert.equal(hasLLMConfig(), false, 'invalid endpoint is not persisted as an opt-in');

localStorage.setItem(key, JSON.stringify({ pontos: '42', porFase: [], porCaso: [], historico: {}, badges: [], combo: -4 }));
const repaired = createProgressStore().state;
assert.equal(repaired.pontos, 0, 'string points do not become a numeric score');
assert.equal(repaired.combo, 0, 'negative combo is clamped');
assert.deepEqual(repaired.porFase, {}, 'array-shaped phase progress is replaced safely');
assert.deepEqual(repaired.badges, {}, 'array-shaped badges are replaced safely');

const previousStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() { throw new Error('storage blocked'); },
});
const blocked = createProgressStore();
assert.doesNotThrow(() => blocked.registerResult({ faseId: 'aprendiz', casoId: 'marina_amoxicilina', nota: 80, stars: 2 }));
assert.equal(loadLLMConfig().baseUrl, 'http://127.0.0.1:8081/v1', 'blocked LLM storage falls back');
assert.equal(hasLLMConfig(), false, 'blocked LLM storage does not opt in');
assert.equal(saveLLMConfig({ baseUrl: 'https://llm.example/v1' }), false, 'blocked LLM writes are reported without throwing');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: previousStorage });

globalThis.localStorage = { getItem: () => null, setItem() { throw new Error('quota exceeded'); } };
const full = createProgressStore();
assert.doesNotThrow(() => full.registerResult({ faseId: 'aprendiz', casoId: 'marina_amoxicilina', nota: 80, stars: 2 }));

console.log('✅ storage QA: corrupt saves recover; valid progress survives; blocked/quota storage does not crash');
