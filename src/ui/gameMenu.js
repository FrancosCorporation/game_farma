/** Show the menu view and return keyboard focus to the selected phase. */
export function showGameMenu(elements, renderPhases) {
  elements.decision.hidden = true;
  if (elements['plantao-modal']) elements['plantao-modal'].hidden = true;
  if (elements['hud-fila']) elements['hud-fila'].hidden = true;
  elements.menu.hidden = false;
  renderPhases();
  elements['phase-select'].querySelector('button[aria-pressed="true"]')?.focus();
}
