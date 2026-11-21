import { ACHIEVEMENTS } from '../core/achievements.js';
import { comboMultiplier, rankInfo } from '../core/progression.js';
import { t } from './i18n.js';

/** Renderiza o resumo de rank, combo e medalhas sem assumir posse do estado do jogo. */
export function renderMenuMeta(box, progress, translate = t) {
  if (!box) return;

  const state = progress?.state || {};
  const points = state.pontos || 0;
  const { atual, proximo, faltam, pct } = rankInfo(points);
  const combo = state.combo || 0;
  const unlocked = new Set(progress?.unlockedBadges?.() || []);
  const medal = (achievement) => {
    const on = unlocked.has(achievement.id);
    const name = translate(`badge.${achievement.id}.nome`);
    const description = translate(`badge.${achievement.id}.desc`);
    const status = translate(on ? 'menu.meta.badge.unlocked' : 'menu.meta.badge.locked');
    return `<li class="medalha${on ? ' on' : ''}" title="${description}" aria-label="${name} — ${status}. ${description}">
        <span class="medalha-ico" aria-hidden="true">${on ? achievement.icone : '🔒'}</span>
        <b>${name}</b></li>`;
  };

  box.innerHTML = `
      <div class="meta-rank">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <span class="text-xs uppercase tracking-widest text-teal-300">${translate('menu.meta.rank')} · <b>${translate(`rank.${atual}`)}</b></span>
          <span class="text-xs text-slate-400">${points} ${translate('hud.pontos')}${
            proximo ? ` · ${faltam} ${translate('menu.meta.para')} ${translate(`rank.${proximo}`)}` : ` · ${translate('menu.meta.max')}`}</span>
        </div>
        <span class="rankbar" role="progressbar" aria-label="${translate('menu.meta.progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}">
          <i style="width:${Math.round(pct * 100)}%"></i></span>
        <p class="text-xs text-slate-400 mt-2">${translate('menu.meta.combo')} <b class="${combo ? 'text-amber-300' : 'text-slate-400'}">${
          combo ? `🔥 ${combo} · ×${comboMultiplier(combo).toFixed(1)}` : translate('menu.meta.comboZero')}</b>
          <span class="block mt-1 text-slate-400">${translate('menu.meta.comboInfo')}</span></p>
      </div>
      <details class="meta-badges">
        <summary class="cursor-pointer text-xs uppercase tracking-widest text-teal-300 mb-2">${translate('menu.meta.badges')} · ${unlocked.size}/${ACHIEVEMENTS.length}</summary>
        <ul class="medalhas">${ACHIEVEMENTS.map(medal).join('')}</ul>
      </details>`;
}
