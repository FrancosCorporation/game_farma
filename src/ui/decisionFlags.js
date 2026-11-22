import { t } from './i18n.js';

function neutralOptionLabel(fact) {
  return fact.rotulo
    .replace(/:\s*(?:negad[oa]s?|denied|ruled out)\s*$/i, '')
    .replace(/\s*\((?:negad[oa]s?|denied|ruled out)\)\s*$/i, '');
}

/** Renderiza achados de risco já revelados, sem tomar posse do estado do atendimento. */
export function renderDecisionFlags(list, facts, revealed, translate = t, createElement = (tag) => document.createElement(tag)) {
  if (!list) return;
  list.innerHTML = '';

  for (const fact of facts) {
    if (!revealed.has(fact.tag) || !(fact.redFlag || fact.valor === false)) continue;

    const label = createElement('label');
    label.className = 'check-row';
    // Contrato usado pelos gates: uma resposta negativa investigada não é alerta positivo.
    label.dataset.tag = fact.tag;
    label.dataset.negado = String(!fact.valor);

    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = fact.tag;

    const text = createElement('span');
    // A opção pergunta pelo achado; a resposta conhecida fica só no estado do caso
    // para ser avaliada quando o estudante confirmar a conduta.
    text.textContent = neutralOptionLabel(fact);
    label.append(checkbox, text);
    list.appendChild(label);
  }
}
