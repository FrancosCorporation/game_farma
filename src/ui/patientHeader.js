import { t } from './i18n.js';

/** Renderiza a identificação do paciente e a posição da fila sem possuir o estado do caso. */
export function renderPatientHeader(elements, { caseDef, phase, progress, translate = t }) {
  if (!caseDef) return;

  const name = caseDef.persona.nome;
  const age = caseDef.persona.idade;
  if (elements?.['chat-nome']) {
    elements['chat-nome'].textContent = `${name}, ${age}${translate('chat.anos')}`;
  }
  if (elements?.['chat-avatar']) {
    elements['chat-avatar'].textContent = name.replace(/^(Dona?|Seu|Mr\.?|Mrs\.?)\s*/i, '')[0] || '?';
  }
  if (elements?.['hud-paciente']) {
    elements['hud-paciente'].textContent = `${translate('chat.cliente')} ${name}`;
  }

  const queue = elements?.['hud-fila'];
  if (!queue) return;
  if (phase?.casos?.length) {
    const completed = progress?.state?.porFase?.[phase.id]?.feitos?.length || 0;
    const position = Math.min(phase.casos.length, completed + 1);
    queue.textContent = `${translate('hud.fila')} ${position}/${phase.casos.length}`;
    queue.hidden = false;
  } else {
    queue.hidden = true;
  }
}

/** Atualiza o contador sem acoplar a apresentação ao turno da partida. */
export function renderTurnCounter(element, turn, maxTurns) {
  if (!element) return;
  element.textContent = `${turn}/${maxTurns}`;
}
