// Inspeção dos chips vs. fatos do caso (diagnóstico do QA, temporário).
// Uso: node scripts/qa_chips.tmp.mjs [caseId]
import { CASES } from '../src/data/cases.js';
import { classify } from '../src/core/factGate.js';

const id = process.argv[2] || 'jose_gripe';
const c = CASES.find((x) => x.id === id);
console.log(`caso: ${id}\n`);
console.log('chips (perguntas guiadas) → domínios detectados:');
for (const ch of c.chips) {
  const doms = classify(ch.q);
  console.log(`  • "${ch.q}" → [${doms.join(', ') || 'NENHUM'}]`);
}
console.log('\nfatos do caso:');
for (const f of c.fatos) {
  console.log(`  tag=${f.tag} dominio=${f.dominio} nivel=${f.nivel} redFlag=${f.redFlag} valor=${f.valor}`);
}
