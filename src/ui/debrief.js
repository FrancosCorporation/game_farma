import { achievementIcon } from '../core/achievements.js';
import { domainLabel } from '../core/factGate.js';
import { comboMultiplier, rankInfo } from '../core/progression.js';
import { buildDebriefDetails } from './debriefDetails.js';
import { t as defaultTranslate } from './i18n.js';

const MAX_BY_METRIC = {
  queixa_principal: 20,
  sinais_alarme: 20,
  bulario: 10,
  teste_rapido: 20,
  dsf: 30,
};

/** Render the completed encounter report from explicit game state. */
export function renderDebriefPanel({
  elements,
  outcome,
  result,
  stars,
  registration = null,
  caseDef,
  points,
  phases = [],
  newlyUnlockedPhase = null,
  seed,
  translate = defaultTranslate,
  setVisible = () => {},
  createElement = (tag) => document.createElement(tag),
}) {
  const tag = elements['debrief-tag'];
  const styles = {
    fatal: 'bg-red-900/60 text-red-200',
    grave: 'bg-amber-900/60 text-amber-200',
    bom: 'bg-teal-900/60 text-teal-200',
    neutro: 'bg-slate-700/60 text-slate-200',
  };
  tag.className = 'inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ' + (styles[outcome.desfecho] || styles.neutro);
  const tagKey = {
    fatal: 'debrief.tag.fatal',
    grave: 'debrief.tag.grave',
    bom: 'debrief.tag.bom',
    neutro: 'debrief.tag.neutro',
  }[outcome.desfecho] || 'debrief.tag.default';
  tag.textContent = translate(tagKey);

  elements['debrief-stars'].innerHTML = [1, 2, 3]
    .map((star) => `<span class="star ${star <= stars ? 'on' : ''}">★</span>`)
    .join('');
  elements['debrief-titulo'].textContent = outcome.titulo;
  elements['debrief-texto'].textContent = outcome.texto;
  elements['debrief-pontos'].textContent = `${result.total} / 100`;

  elements['debrief-breakdown'].innerHTML = (result.breakdown || []).map((metric) => {
    const negative = metric.pontos < 0;
    const max = negative ? Math.abs(metric.pontos) : (MAX_BY_METRIC[metric.metrica] || Math.max(1, metric.pontos));
    const percent = negative ? 100 : Math.round((metric.pontos / max) * 100);
    return `
        <div class="scorebar">
          <span>${metric.label}</span>
          <span class="fill"><i style="width:${percent}%; background:${negative ? '#ef4444' : ''}"></i></span>
          <span class="text-right">${metric.pontos > 0 ? '+' : ''}${metric.pontos}</span>
        </div>`;
  }).join('');

  const details = elements['debrief-detalhes'];
  details.innerHTML = '';
  for (const { text, className } of buildDebriefDetails(result, caseDef, { t: translate, domainLabel })) {
    const item = createElement('li');
    item.textContent = text;
    item.className = className;
    details.appendChild(item);
  }

  const achievements = elements['debrief-conquistas'];
  if (achievements) {
    const lines = [];
    if (newlyUnlockedPhase != null && phases[newlyUnlockedPhase]) {
      lines.push(`<p class="dyn-line text-amber-200 font-semibold">🎉 ${translate('debrief.novaFase')} ${translate(`phase.${phases[newlyUnlockedPhase].id}.nome`)}</p>`);
    }
    if (registration) {
      if (registration.practice) {
        lines.push(`<p class="dyn-line text-amber-200">${translate('debrief.practice')}</p>`);
      } else {
        const multiplier = registration.mult || 1;
        lines.push(`<p class="dyn-line">${translate('debrief.comboGanho')} ${result.total} × ${multiplier.toFixed(1)} = <b class="text-teal-300">${registration.ganhos}</b> ${translate('hud.pontos')}</p>`);
      }
      const rank = rankInfo(points);
      lines.push(`<p class="dyn-line text-slate-400">${translate('menu.meta.rank')} <b>${rank.atual}</b>${
        rank.proximo ? ` → ${rank.proximo} · ${rank.faltam} ${translate('menu.meta.para')}` : ` · ${translate('menu.meta.max')}`}</p>`);
      if (!registration.practice && registration.comboQuebrou) {
        lines.push(`<p class="dyn-line text-red-300">${translate('debrief.comboQuebrou')}</p>`);
      } else if (!registration.practice && registration.combo >= 2) {
        lines.push(`<p class="dyn-line text-amber-300">🔥 ${translate('debrief.comboMantido')} ${registration.combo}${translate('debrief.comboProx')} ×${comboMultiplier(registration.combo + 1).toFixed(1)}.</p>`);
      }
      if (!registration.practice && registration.novasBadges?.length) {
        lines.push(`<p class="dyn-line text-teal-200">${translate('debrief.badgeNova')}</p><ul class="medalhas">${
          registration.novasBadges.map((id) => `<li class="medalha on"><span class="medalha-ico" aria-hidden="true">${achievementIcon(id)}</span><b>${translate(`badge.${id}.nome`)}</b><small>${translate(`badge.${id}.desc`)}</small></li>`).join('')}</ul>`);
      }
    }
    achievements.innerHTML = lines.join('');
    achievements.hidden = lines.length === 0;
  }

  elements['debrief-stamp'].textContent =
    `${translate('debrief.stampCase')} ${caseDef.id} v${caseDef.version} · seed ${seed} · FarmaCheck web · ${translate('debrief.stampTail')}`;
  elements.decision.hidden = true;
  setVisible(true);
  elements.debrief.querySelector('h2').focus();
}
