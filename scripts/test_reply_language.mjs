import assert from 'node:assert/strict';
import { translatePortugueseToEnglish } from '../src/ai/replyLanguage.js';

const portuguese = 'Eu nao quero tomar remedio agora';
const english = 'I would rather wait and drink some water.';
let calls = 0;
const llm = {
  ok: true,
  async chat(messages, options) {
    calls++;
    assert.equal(messages[1].content, portuguese);
    return { text: english };
  },
};

assert.equal(await translatePortugueseToEnglish(portuguese, { llm, language: 'pt' }), portuguese);
assert.equal(await translatePortugueseToEnglish(english, { llm, language: 'en' }), english);
assert.equal(calls, 0, 'skip translation unless EN UI receives PT text');
assert.equal(await translatePortugueseToEnglish(portuguese, { llm, language: 'en' }), english);
assert.equal(calls, 1);

const customBudget = {
  ok: true,
  async chat(_messages, options) {
    assert.deepEqual(options, { maxTokens: 400, temperature: 0.2 });
    return { text: english };
  },
};
assert.equal(await translatePortugueseToEnglish(portuguese, { llm: customBudget, language: 'en', maxTokens: 400 }), english);

const stillPortuguese = { ok: true, async chat() { return { text: 'Eu estou muito bem mas nao quero' }; } };
assert.equal(await translatePortugueseToEnglish(portuguese, { llm: stillPortuguese, language: 'en' }), '', 'reject output still detected as Portuguese');
assert.equal(await translatePortugueseToEnglish(portuguese, { llm: { ok: false }, language: 'en' }), '', 'missing/failed LLM uses deterministic fallback');
assert.equal(await translatePortugueseToEnglish(portuguese, { llm: { ok: true, async chat() { throw new Error('offline'); } }, language: 'en' }), '', 'provider failure uses deterministic fallback');

console.log('✔ reply language: bilingual pass-through, EN translation and safe fallback');
