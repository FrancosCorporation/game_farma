import { buildActorSystemPrompt, isExamQuestion, templateReply } from './prompts.js';
import { translatePortugueseToEnglish } from './replyLanguage.js';
import { warningSignsFromQuestion } from '../core/factGate.js';

// O caso do documento não contém antibiótico nem conselho/diagnóstico da
// paciente. Uma geração que introduza esses temas volta à resposta do roteiro.
const forbiddenMarianaReply = (text) => /(amoxicilina|amoxicillin|antibiotico|antibiotic|dengue|arbovirose|\bns1\b|paracetamol|ibuprofeno|corticoide|anti.inflamatorio|\baas\b)/i
  .test((text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

/** Generate one patient response without taking ownership of game/UI state. */
export async function generatePatientReply({
  llm,
  caseDef,
  knowledge,
  newFacts,
  evasions,
  history = [],
  language,
  isCurrentInteraction = () => true,
  onStream = () => {},
  isHiddenFact = () => false,
  translate = translatePortugueseToEnglish,
}) {
  const question = [...history].reverse().find((message) => message.role === 'user')?.content || '';
  if (caseDef.id === 'carla_dengue' && (/(vacin|imuniz).*(dengue)|(dengue).*(vacin|imuniz)/i.test(question.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    || /articula|\bjuntas?\b|\bjoints?\b/i.test(question.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
    return isCurrentInteraction() ? templateReply(caseDef, knowledge, newFacts, evasions, question) : '';
  }
  if (caseDef.id === 'carla_dengue' && warningSignsFromQuestion(question).length) {
    return isCurrentInteraction() ? templateReply(caseDef, knowledge, newFacts, evasions, question) : '';
  }
  if (caseDef.undocumentedWarningSigns && warningSignsFromQuestion(question).length) {
    return isCurrentInteraction() ? templateReply(caseDef, knowledge, newFacts, evasions, question) : '';
  }
  // Sem dado sobre exames no caso, responder sem criar um resultado ou deixar
  // o modelo retomar o pedido de medicamento no lugar da pergunta.
  if (!newFacts.length && !evasions.length && isExamQuestion(question)) {
    return isCurrentInteraction() ? templateReply(caseDef, knowledge, newFacts, evasions, question) : '';
  }
  let output = '';
  try {
    if (!llm) throw new Error('llm indisponível');
    const system = buildActorSystemPrompt(caseDef, knowledge, newFacts, evasions);
    const messages = [{ role: 'system', content: system }, ...history.slice(-9)];
    const { text } = await llm.chat(messages, {
      // O jogo tem resposta offline; uma geração travada não deve prender o atendimento.
      timeoutMs: 12000,
      onToken: (_token, full) => {
        if (!isCurrentInteraction()) return;
        output = full;
        onStream(full);
      },
    });
    if (!isCurrentInteraction()) return '';
    output = await translate(text, { llm, language, maxTokens: 160 });
  } catch {
    output = '';
  }

  if (!isCurrentInteraction()) return '';
  if (!output.trim() || isHiddenFact(output)
    || (caseDef.id === 'carla_dengue' && forbiddenMarianaReply(output))) {
    output = templateReply(caseDef, knowledge, newFacts, evasions, question);
  }
  return output;
}
