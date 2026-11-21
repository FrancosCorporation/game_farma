// Renderiza apenas os atalhos visuais de pergunta; o Game mantém a política
// de quais chips já foram usados e o listener delegado do formulário.
export function renderQuestionChips(container, chips, usedLabels) {
  container.innerHTML = '';
  for (const chip of chips) {
    if (usedLabels.has(chip.label)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.q = chip.q;
    button.textContent = chip.label;
    button.className = 'text-xs rounded-full border border-teal-400/30 text-teal-200 px-2.5 py-1 hover:bg-teal-900/50';
    container.appendChild(button);
  }
}
