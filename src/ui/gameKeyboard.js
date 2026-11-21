// Controls that span the decision panel and the patient's spoken reply.
export function bindGameKeyboardShortcuts({
  documentTarget = document,
  getState,
  chatInput,
  getLastPatientLine,
  getPatientVoice,
  selectDecisionByIndex,
  backToAnamnesis,
  speak,
}) {
  const onKeydown = (event) => {
    if (getState() === 'DECISAO' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index >= 0 && selectDecisionByIndex(index)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        backToAnamnesis();
        event.preventDefault();
        return;
      }
    }

    const lastLine = getLastPatientLine();
    if (event.key.toLowerCase() === 'r' && documentTarget.activeElement !== chatInput && lastLine) {
      speak(lastLine, getPatientVoice());
    }
  };

  documentTarget.addEventListener('keydown', onKeydown);
  return () => documentTarget.removeEventListener?.('keydown', onKeydown);
}
