import { t } from './i18n.js';

/** Renderiza o rótulo de pontos sem tomar posse do estado da partida. */
export function renderScoreHud(element, points, translate = t) {
  if (!element) return;
  element.textContent = `${translate('hud.pontos')} ${points}`;
}
