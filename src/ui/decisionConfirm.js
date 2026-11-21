/** Atualiza a disponibilidade da confirmação sem assumir a propriedade da decisão. */
export function renderDecisionConfirm(button, mipList, conduta) {
  if (!button) return;
  const hasSelectedMip = Boolean(mipList?.querySelector('input:checked'));
  button.disabled = !conduta || (conduta === 'sugerir' && !hasSelectedMip);
}
