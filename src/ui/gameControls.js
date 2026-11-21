/** Bind the encounter controls to callbacks owned by the Game orchestrator. */
export function bindGameControls({
  elements,
  onSubmit,
  onQuestionChip,
  onDecision,
  onBackToAnamnesis,
  onSelectDecision,
  onConfirmDecision,
  onMipChange,
  onNextPatient,
  onRepeatPatient,
  onExportReport,
  onOpenMenu,
  onPlantaoMenu,
  onResetProgress,
  onToggleTts,
}) {
  const listeners = [];
  const listen = (element, type, handler) => {
    element.addEventListener(type, handler);
    listeners.push([element, type, handler]);
  };
  const listenOptional = (element, type, handler) => {
    if (element) listen(element, type, handler);
  };

  listen(elements['chat-form'], 'submit', (event) => {
    event.preventDefault();
    onSubmit();
  });
  listen(elements['chat-input'], 'keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  });
  listen(elements['chat-chips'], 'click', (event) => {
    const button = event.target.closest('button[data-q]');
    if (button) onQuestionChip(button);
  });
  listen(elements['btn-decisao'], 'click', onDecision);
  listen(elements['btn-voltar'], 'click', onBackToAnamnesis);
  listen(elements['conduta-cards'], 'click', (event) => {
    const button = event.target.closest('[data-conduta]');
    if (button) onSelectDecision(button.dataset.conduta);
  });
  listen(elements['btn-confirmar'], 'click', onConfirmDecision);
  listen(elements['mip-list'], 'change', onMipChange);
  listen(elements['btn-proximo'], 'click', onNextPatient);
  listen(elements['btn-repetir'], 'click', onRepeatPatient);
  listen(elements['btn-exportar'], 'click', onExportReport);
  listen(elements['btn-fases'], 'click', onOpenMenu);
  listenOptional(elements['btn-plantao-menu'], 'click', onPlantaoMenu);
  listenOptional(elements['btn-zerar-progresso'], 'click', onResetProgress);
  listen(elements['btn-tts'], 'click', onToggleTts);

  return () => {
    for (const [element, type, handler] of listeners.splice(0).reverse()) {
      element.removeEventListener(type, handler);
    }
  };
}
