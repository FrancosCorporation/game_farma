export function createChatBubble(kind, text) {
  const el = document.createElement('div');
  el.className = kind === 'paciente' ? 'bub bub-pac' : 'bub bub-farm';
  el.textContent = text;
  return el;
}

export function createSystemMessage(text, red = false) {
  const el = document.createElement('div');
  el.className = 'bub bub-sys' + (red ? ' bub-red' : '');
  el.textContent = text;
  return el;
}
