// F2 — Painel do computador: consulta de bulário/diretrizes do caso (registra +10 via game).
import { t } from './i18n.js';
import { SFX } from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);

const DIRETRIZES_FIXAS = [
  () => t('bulario.dir1'),
  () => t('bulario.dir2'),
  () => t('bulario.dir3'),
];

export function initBulario({ game, aoFechar }) {
  const painel = $('bulario');
  const corpo = $('bulario-corpo');
  let consultadoPara = null;

  const card = (html, cls = '') => `<div class="bulario-card ${cls}">${html}</div>`;
  const h = (txt) => `<h3 class="text-xs uppercase tracking-wide text-slate-400 mb-1">${txt}</h3>`;

  function render(caso) {
    corpo.innerHTML = [
      h(t('bulario.pedido')),
      card(`<b>${caso.pedido}</b>`),
      caso.contraindicado
        ? card(`<b class="text-red-300">⚠ ${t('bulario.contraindicado')}</b><br><span class="text-xs">${caso.contraindicado.motivo}</span>`, 'bulario-alerta')
        : '',
      caso.testeRapido?.indicado
        ? card(`<b class="text-teal-300">🧪 ${t('bulario.teste')}:</b> ${caso.testeRapido.tipo}`)
        : '',
      h(t('bulario.prateleira')),
      ...caso.prateleira.map((p) => card(`<b>${p.nome}</b>`)),
      h(t('bulario.diretrizes')),
      ...DIRETRIZES_FIXAS.map((d) => card(`<span class="text-xs leading-relaxed">${d()}</span>`)),
    ].filter(Boolean).join('');
  }

  function abrir() {
    const caso = game.case;
    if (!caso) return;
    // +10 do GDD — conta como consulta ao bulário apenas 1× por caso
    if (consultadoPara !== caso.id) {
      consultadoPara = caso.id;
      game.registrarConsultaBulario();
    }
    render(caso);
    painel.hidden = false;
    $('btn-bulario-fechar').focus();
  }

  function fechar() {
    painel.hidden = true;
    aoFechar?.();
  }

  $('btn-bulario-fechar').addEventListener('click', () => {
    try { SFX.pop(); } catch { /* opcional */ }
    fechar();
  });

  return { abrir, fechar, aberto: () => !painel.hidden };
}
