import { t } from './i18n.js';

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
    text.textContent = fact.rotulo + (fact.valor ? '' : translate('sys.negado'));
    label.append(checkbox, text);
    list.appendChild(label);
  }
}
