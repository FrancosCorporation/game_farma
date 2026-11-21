/** Atualiza a apresentação da decisão sem assumir o estado do atendimento. */
export function showDecisionPanel({
  chatInput,
  chatChips,
  decisionButton,
  redFlagList,
  mipBox,
  confirmButton,
  panel,
  facts,
  revealed,
  renderFlags,
  translate,
  documentRef = document,
}) {
  chatInput.disabled = true;
  chatChips.innerHTML = '';
  decisionButton.hidden = true;
  renderFlags(redFlagList, facts, revealed, translate);

  documentRef.querySelectorAll('#conduta-cards [data-conduta]').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
  });
  mipBox.hidden = true;
  confirmButton.disabled = true;
  panel.hidden = false;
  panel.querySelector('h2').focus();
}

/** Restaura a apresentação da anamnese e o foco depois de voltar da decisão. */
export function showAnamnesisPanel({ panel, chatInput, decisionButton, renderChips }) {
  panel.hidden = true;
  chatInput.disabled = false;
  decisionButton.hidden = false;
  renderChips();
  chatInput.focus();
}
