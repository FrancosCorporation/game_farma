import assert from 'node:assert/strict';
import { createChatBubble, createSystemMessage } from '../src/ui/chatMessages.js';

const originalDocument = globalThis.document;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'div');
    return { tagName: tag.toUpperCase(), className: '', textContent: '' };
  },
};

try {
  const patient = createChatBubble('paciente', '<img src=x onerror=alert(1)>');
  assert.equal(patient.className, 'bub bub-pac');
  assert.equal(patient.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(patient.innerHTML, undefined, 'conteúdo do paciente permanece texto, não HTML');

  const pharmacist = createChatBubble('farmaceutico', 'Orientação');
  assert.equal(pharmacist.className, 'bub bub-farm');
  assert.equal(pharmacist.textContent, 'Orientação');

  const system = createSystemMessage('Mensagem do sistema');
  assert.equal(system.className, 'bub bub-sys');
  assert.equal(system.textContent, 'Mensagem do sistema');

  const redSystem = createSystemMessage('Alerta', true);
  assert.equal(redSystem.className, 'bub bub-sys bub-red');
  assert.equal(redSystem.textContent, 'Alerta');
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

console.log('✔ chat messages render as text with expected classes');
