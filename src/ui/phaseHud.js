import { t } from './i18n.js';

/** Renderiza o rótulo da fase atual sem possuir o estado de fase de Game. */
export function renderPhaseHud(element, phaseKey, translate = t) {
  if (!element) return;
  element.textContent = translate(`fase.${phaseKey}`);
}
