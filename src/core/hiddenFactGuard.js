import { norm } from './factGate.js';

export function containsHiddenFact(text, facts, revealed) {
  const normalized = norm(text);
  return facts.some((fact) =>
    fact.segredo &&
    !revealed.has(fact.tag) &&
    new RegExp(fact.segredo, 'i').test(normalized)
  );
}
