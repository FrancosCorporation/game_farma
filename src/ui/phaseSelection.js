import { t } from './i18n.js';

/** Renderiza cards de fase sem tomar posse do índice ou da progressão do jogo. */
export function renderPhaseSelection(box, {
  phases,
  phaseIndex,
  progress,
  onSelect,
  translate = t,
  createElement = (tag) => document.createElement(tag),
}) {
  if (!box) return;
  box.innerHTML = '';
  const unlocked = progress.unlockLevel();

  phases.forEach((phase, index) => {
    const locked = index > unlocked && index < phases.length - 1;
    const button = createElement('button');
    button.type = 'button';
    button.className = 'phase-card' + (locked ? ' locked' : '') + (index === phaseIndex ? ' pressed' : '');
    button.setAttribute('aria-pressed', String(index === phaseIndex));
    button.disabled = locked;

    const phaseProgress = progress?.state?.porFase?.[phase.id];
    const feitos = phaseProgress?.feitos?.length || 0;
    const total = Array.isArray(phase.casos) ? phase.casos.length : 0;
    const estrelas = Object.values(phaseProgress?.estrelas || {}).reduce((sum, value) => sum + value, 0);
    const progressMarkup = (feitos || estrelas)
      ? `<span class="ph-prog">★ ${estrelas} · ${total ? `${feitos}/${total}` : feitos} ${translate('menu.fase.casos')}</span>`
      : '';
    button.innerHTML = `<span class="ph-num">${phase.icone}</span><span class="ph-info"><b>${translate(`phase.${phase.id}.nome`)}</b><small>${translate(`phase.${phase.id}.desc`)}</small>${progressMarkup}</span>`;
    button.addEventListener('click', () => onSelect(index));
    box.appendChild(button);
  });
}
