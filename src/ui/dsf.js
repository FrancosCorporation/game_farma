// F4 — DSF (Declaração de Serviços Farmacêuticos): formulário guiado + preview imprimível.
// Ao emitir → game.registrarDSF(texto) (scoring valida cobertura ≥70% das palavras-chave).
import { t, applyI18n } from './i18n.js';
import { SFX } from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);

const ehArbovirose = (caso) =>
  Boolean(caso.testeRapido?.indicado) && /dengue|zika|chikungunya|arbovir/i.test(caso.testeRapido?.tipo || '');

// Condutas rápidas (texto acrescentado ao campo de conduta)
const RAPIDAS = [
  {
    id: 'recusa',
    destaque: (caso) => ehArbovirose(caso),
    texto: 'Recusei a dispensação do medicamento solicitado (contraindicado) e encaminhei a pessoa ao pronto-socorro com urgência, orientando hidratação e sinais de alarme.',
  },
  {
    id: 'mip',
    destaque: () => false,
    texto: 'Dispensei medicamento isento de prescrição (MIP) com orientações não-medicamentosas e prazo de reavaliação.',
  },
  {
    id: 'hidratacao',
    destaque: () => false,
    texto: 'Orientei hidratação, repouso e monitoração de sinais de alarme.',
  },
  {
    id: 'retorno',
    destaque: () => false,
    texto: 'Orientei retorno ao serviço se os sintomas piorarem ou persistirem por mais de 3 dias.',
  },
];

export function initDsf({ game, aoFechar }) {
  const painel = $('dsf');
  const preview = $('dsf-preview');
  const elConduta = $('dsf-conduta');
  const btnEmitir = $('btn-dsf-emitir');
  let casoIdAtual = null;

  const atualizarEmitir = () => { btnEmitir.disabled = !elConduta.value.trim(); };

  function renderRapidas(caso) {
    const box = $('dsf-rapidas');
    box.innerHTML = '';
    for (const r of RAPIDAS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dsf-chip' + (r.destaque(caso) ? ' dsf-chip-destaque' : '');
      b.textContent = r.destaque(caso) ? `⚠ ${t('dsf.encaminhamento')} — pronto-socorro` : r.texto.slice(0, 42) + '…';
      b.title = r.texto;
      b.addEventListener('click', () => {
        SFX.pop();
        elConduta.value = (elConduta.value ? elConduta.value.trim() + ' ' : '') + r.texto;
        atualizarEmitir();
        elConduta.focus();
      });
      box.appendChild(b);
    }
  }

  function renderOrient(caso) {
    const box = $('dsf-orient');
    box.innerHTML = '';
    for (const o of caso.orientacoes || []) {
      const label = document.createElement('label');
      label.className = 'check-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = o.nome || o;
      const span = document.createElement('span');
      span.textContent = o.nome || o;
      label.append(cb, span);
      box.appendChild(label);
    }
    if (!(caso.orientacoes || []).length) {
      box.innerHTML = '<p class="text-xs text-slate-500">—</p>';
    }
  }

  function abrir() {
    const caso = game.case;
    if (!caso) return;
    if (casoIdAtual !== caso.id) {
      // novo atendimento → zera o rascunho
      casoIdAtual = caso.id;
      elConduta.value = '';
    }
    $('dsf-paciente').value = `${caso.persona.nome}, ${caso.persona.idade} anos`;
    $('dsf-data').value = new Date().toISOString().slice(0, 10);
    $('dsf-queixa').value = caso.pedido;
    $('dsf-encaminhamento').value = caso.dsf?.encaminhamento || 'Não necessário';
    renderRapidas(caso);
    renderOrient(caso);
    atualizarEmitir();
    preview.hidden = true;
    painel.hidden = false;
    elConduta.focus();
  }

  function fechar() {
    painel.hidden = true;
    preview.hidden = true;
    aoFechar?.();
  }

  function montarTexto() {
    const orients = [...$('dsf-orient').querySelectorAll('input:checked')].map((i) => i.value);
    let texto = elConduta.value.trim();
    if (orients.length) texto += ` Orientações fornecidas: ${orients.join('; ')}.`;
    const enc = $('dsf-encaminhamento').value.trim();
    if (enc) texto += ` Encaminhamento: ${enc}.`;
    return texto;
  }

  function emitir() {
    const texto = montarTexto();
    if (!texto) return;
    game.registrarDSF(texto);
    SFX.chime();
    renderPreview(texto);
    painel.hidden = true;
    preview.hidden = false;
    $('btn-dsf-imprimir').focus();
  }

  function renderPreview(texto) {
    const caso = game.case;
    const data = $('dsf-data').value || new Date().toISOString().slice(0, 10);
    const orients = [...$('dsf-orient').querySelectorAll('input:checked')].map((i) => i.value);
    const enc = $('dsf-encaminhamento').value.trim() || '—';
    $('dsf-doc-corpo').innerHTML = `
      <p class="dsf-linha"><b>${t('dsf.paciente')}:</b> ${$('dsf-paciente').value || '—'}</p>
      <p class="dsf-linha"><b>${t('dsf.data')}:</b> ${data}</p>
      <p class="dsf-linha"><b>${t('dsf.queixa')}:</b> ${caso.pedido}</p>
      <p class="dsf-linha"><b>${t('dsf.conduta')}:</b> ${texto}</p>
      ${orients.length ? `<p class="dsf-linha"><b>${t('dsf.orientacoes')}:</b> ${orients.join('; ')}</p>` : ''}
      <p class="dsf-linha"><b>${t('dsf.encaminhamento')}:</b> ${enc}</p>`;
    $('dsf-doc-stamp').textContent =
      `DSF emitida no simulador FarmaCheck · conteúdo 100% fictício e educacional — não substitui registro real (Anvisa/CFF).`;
    applyI18n(preview);
  }

  elConduta.addEventListener('input', atualizarEmitir);
  btnEmitir.addEventListener('click', emitir);
  $('btn-dsf-imprimir').addEventListener('click', () => window.print());
  $('btn-dsf-voltar').addEventListener('click', () => {
    preview.hidden = true;
    painel.hidden = false;
    elConduta.focus();
  });
  $('btn-dsf-fechar').addEventListener('click', () => {
    SFX.pop();
    fechar();
  });

  return { abrir, fechar, aberto: () => !painel.hidden || !preview.hidden };
}
