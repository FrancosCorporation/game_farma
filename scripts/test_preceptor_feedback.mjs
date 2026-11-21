import assert from 'node:assert/strict';
import { generatePreceptorFeedback } from '../src/ai/preceptorFeedback.js';

const caseDef = { id: 'ana' };
const decision = { conduta: 'vender', mips: ['dipirona'] };
const result = { total: 82, anamnese: 20, redflags: 20, risco: 15, conduta: 18, comunicacao: 9 };
const logText = 'Paciente pediu dipirona.';
let captured;
let translatedOptions;
const llm = {
  ok: true,
  async chat(messages, options) {
    captured = { messages, options };
    return { text: '  Boa investigação.  ' };
  },
};
const feedback = await generatePreceptorFeedback({
  llm,
  caseDef,
  decision,
  result,
  logText,
  language: 'en',
  translate: async (text, options) => {
    assert.equal(text, 'Boa investigação.', 'remove espaços ao redor do retorno do provider');
    translatedOptions = options;
    return 'Good investigation.';
  },
});
assert.equal(feedback, 'Good investigation.');
assert.equal(captured.messages.length, 2);
assert.equal(captured.messages[1].content.includes('"nota":82'), true, 'envia a nota já calculada');
assert.equal(captured.messages[1].content.includes(logText), true);
assert.deepEqual(captured.options, { maxTokens: 320, temperature: 0.3 });
assert.deepEqual(translatedOptions, { llm, language: 'en', maxTokens: 400 });

for (const unavailable of [null, { ok: false }, { ok: true, async chat() { throw new Error('offline'); } }]) {
  const output = await generatePreceptorFeedback({
    llm: unavailable,
    caseDef,
    decision,
    result,
    logText,
    language: 'pt',
    translate: async () => { throw new Error('não deve traduzir'); },
  });
  assert.equal(output, '', 'ausência/falha mantém o debrief determinístico');
}

console.log('✔ preceptor feedback: score pré-calculado, tradução e fallback seguro');
