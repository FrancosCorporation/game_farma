export function renderShiftSummary({ modal, totalElement, starsElement, completed, totalStars }) {
  if (totalElement) totalElement.textContent = completed;
  if (starsElement) starsElement.textContent = `★ ${totalStars}`;
  if (modal) modal.hidden = false;
}
