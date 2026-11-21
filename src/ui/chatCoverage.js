import { domainLabel } from '../core/factGate.js';
import { t } from './i18n.js';

// Renderiza a cobertura do checklist sem acoplar a UI ao ciclo de vida do jogo.
export function renderChatCoverage(box, caseDef, knowledge) {
  if (!box) return;
  if (!caseDef || !knowledge) { box.textContent = ''; return; }

  const asked = knowledge.askedDomains;
  const checklist = caseDef.checklistDominios || [];
  const covered = checklist.filter((domain) => asked.has(domain));
  const pending = Math.max(0, checklist.length - covered.length);
  if (!covered.length) { box.textContent = t('chat.coberturaVazio'); return; }

  const remainder = pending
    ? ` · <span class="text-amber-400/80">${pending} ${t('chat.coberturaPendentes')}</span>`
    : ` · <span class="text-teal-300">${t('chat.coberturaCompleta')}</span>`;
  box.innerHTML = `<span class="text-teal-400/80">${t('chat.cobertura')}</span> `
    + `${covered.map((domain) => `✓ ${domainLabel(domain)}`).join(' · ')}${remainder}`;
}
