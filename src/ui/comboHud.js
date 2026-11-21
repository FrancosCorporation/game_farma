import { comboMultiplier } from '../core/progression.js';
import { t } from './i18n.js';

/** Renderiza o HUD de combo sem assumir posse do progresso do jogo. */
export function renderComboHud(element, combo, translate = t, multiplier = comboMultiplier) {
  if (!element) return;
  if (combo < 1) {
    element.hidden = true;
    element.textContent = '';
    return;
  }

  element.hidden = false;
  element.textContent = `${translate('hud.combo')} ×${multiplier(combo).toFixed(1)} · ${combo}${translate('hud.comboSeguidos')}`;
  element.title = translate('hud.comboTitle');
}
