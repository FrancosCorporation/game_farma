// F4 — DSF (Declaração de Serviços Farmacêuticos): formulário e registro salvo no jogo.
// Ao emitir → game.registrarDSF(texto); a rubrica usa a emissão e a decisão estruturada.
import { t, applyI18n } from './i18n.js';
import { SFX } from '../audio/sfx.js';
import { lockModalFocus, restoreFocus } from './focus.js';
import { listSavedDsf, saveDsf } from '../core/dsfStorage.js';

const $ = (id) => document.getElementById(id);

const ehArbovirose = (caso) =>
  Boolean(caso.testeRapido?.indicado) && /dengue|zika|chikungunya|arbovir/i.test(caso.testeRapido?.tipo || '');

// Condutas rápidas (texto acrescentado ao campo de conduta) — bilíngues via i18n.
const RAPIDAS = [
  { id: 'recusa', destaque: (caso) => ehArbovirose(caso), key: 'dsf.rapida.recusa' },
  { id: 'mip', destaque: () => false, key: 'dsf.rapida.mip' },
  { id: 'hidratacao', destaque: () => false, key: 'dsf.rapida.hidratacao' },
  { id: 'retorno', destaque: () => false, key: 'dsf.rapida.retorno' },
];

export function initDsf({ game, aoFechar }) {
  const painel = $('dsf');
  const preview = $('dsf-preview');
  const statusSalvar = $('dsf-save-status');
  const elConduta = $('dsf-conduta');
  const btnEmitir = $('btn-dsf-emitir');
  let atendimentoAtual = null;
  let focoAnterior = null;
  let liberarPreview = null;
  let registroAtual = null;

  const atualizarEmitir = () => { btnEmitir.disabled = !elConduta.value.trim(); };

  function renderRapidas(caso) {
    const box = $('dsf-rapidas');
    box.innerHTML = '';
    for (const r of RAPIDAS) {
      const texto = r.id === 'recusa' && caso.id === 'carla_dengue'
        ? t('dsf.rapida.recusaMariana') : t(r.key);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dsf-chip' + (r.destaque(caso) ? ' dsf-chip-destaque' : '');
      b.textContent = r.destaque(caso) ? `⚠ ${t('dsf.encaminhamento')} — ${t('dsf.er')}` : texto.slice(0, 42) + '…';
      b.title = texto;
      b.addEventListener('click', () => {
        SFX.pop();
        elConduta.value = (elConduta.value ? elConduta.value.trim() + ' ' : '') + texto;
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
    statusSalvar.hidden = true;
    registroAtual = null;
    if (painel.hidden && preview.hidden) focoAnterior = document.activeElement;
    if (atendimentoAtual !== game.interactionVersion) {
      // novo atendimento → zera o rascunho
      atendimentoAtual = game.interactionVersion;
      elConduta.value = '';
      $('dsf-hipotese').value = '';
    }
    const nomeRegistro = caso.persona.nomeCivil
      ? `${caso.persona.nomeCivil} (${caso.persona.nome})` : caso.persona.nome;
    $('dsf-paciente').value = `${nomeRegistro}, ${caso.persona.idade}${t('chat.anos')}`;
    $('dsf-data').value = new Date().toISOString().slice(0, 10);
    $('dsf-queixa').value = caso.pedido;
    // No caso jogável, o encaminhamento é uma decisão do estudante: pré-preencher
    // o gabarito aqui entregaria a resposta antes da triagem.
    $('dsf-encaminhamento').value = caso.id === 'carla_dengue'
      ? '' : (caso.dsf?.encaminhamento || t('dsf.naoNecessario'));
    renderRapidas(caso);
    renderOrient(caso);
    renderSalvas();
    atualizarEmitir();
    preview.hidden = true;
    painel.hidden = false;
    elConduta.focus();
  }

  function fechar() {
    if (painel.hidden && preview.hidden) return;
    painel.hidden = true;
    preview.hidden = true;
    liberarPreview?.();
    liberarPreview = null;
    aoFechar?.();
    restoreFocus(focoAnterior, $('btn-hud-dsf'));
    focoAnterior = null;
  }

  function montarTexto() {
    const orients = [...$('dsf-orient').querySelectorAll('input:checked')].map((i) => i.value);
    let texto = elConduta.value.trim();
    const hipotese = $('dsf-hipotese').value.trim();
    // Evita "avaliação: texto.." quando o estudante já fecha a frase com ponto.
    if (hipotese) texto += ` ${t('dsf.hipotese')}: ${hipotese.replace(/[.]+$/, '')}.`;
    if (orients.length) texto += ` ${t('dsf.orientacoes')}: ${orients.join('; ')}.`;
    const enc = $('dsf-encaminhamento').value.trim();
    if (enc) texto += ` ${t('dsf.encaminhamento')}: ${enc.replace(/[.]+$/, '')}.`;
    return texto;
  }

  function emitir() {
    const texto = montarTexto();
    if (!texto) return;
    statusSalvar.hidden = true;
    game.registrarDSF(texto);
    SFX.chime();
    registroAtual = {
      ...(registroAtual?.id ? { id: registroAtual.id } : {}),
      caseId: game.case.id,
      patient: $('dsf-paciente').value,
      date: $('dsf-data').value || new Date().toISOString().slice(0, 10),
      complaint: game.case.pedido,
      assessment: $('dsf-hipotese').value.trim(),
      conduct: elConduta.value.trim(),
      orientations: [...$('dsf-orient').querySelectorAll('input:checked')].map((i) => i.value),
      referral: $('dsf-encaminhamento').value.trim(),
      text: texto,
    };
    renderPreview(registroAtual);
    painel.hidden = true;
    preview.hidden = false;
    liberarPreview?.();
    liberarPreview = lockModalFocus(preview);
    $('btn-dsf-salvar').focus();
  }

  function renderPreview(record) {
    const corpo = $('dsf-doc-corpo');
    corpo.replaceChildren();
    const linha = (label, value) => {
      const p = document.createElement('p');
      p.className = 'dsf-linha';
      const b = document.createElement('b');
      b.textContent = `${label}:`;
      p.append(b, document.createTextNode(` ${value}`));
      corpo.appendChild(p);
    };
    linha(t('dsf.paciente'), record.patient || '—');
    linha(t('dsf.data'), record.date || '—');
    linha(t('dsf.queixa'), record.complaint || '—');
    if (record.assessment) linha(t('dsf.hipotese'), record.assessment);
    linha(t('dsf.conduta'), record.conduct || '—');
    if (record.orientations?.length) linha(t('dsf.orientacoes'), record.orientations.join('; '));
    linha(t('dsf.encaminhamento'), record.referral || '—');
    $('dsf-doc-stamp').textContent = t('dsf.stamp');
    applyI18n(preview);
  }

  function renderSalvas() {
    const box = $('dsf-salvas');
    box.replaceChildren();
    const entries = listSavedDsf().filter((entry) => entry.caseId === game.case?.id);
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'text-xs text-slate-400';
      empty.textContent = t('dsf.savedEmpty');
      box.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-ghost w-full text-left';
      button.textContent = `${entry.patient} · ${entry.date}`;
      button.addEventListener('click', () => {
        registroAtual = entry;
        $('dsf-data').value = entry.date || '';
        $('dsf-hipotese').value = entry.assessment || '';
        elConduta.value = entry.conduct || '';
        $('dsf-encaminhamento').value = entry.referral || '';
        for (const input of $('dsf-orient').querySelectorAll('input')) {
          input.checked = Boolean(entry.orientations?.includes(input.value));
        }
        atualizarEmitir();
        renderPreview(entry);
        statusSalvar.hidden = true;
        painel.hidden = true;
        preview.hidden = false;
        liberarPreview?.();
        liberarPreview = lockModalFocus(preview);
        $('btn-dsf-salvar').focus();
      });
      box.appendChild(button);
    }
  }

  elConduta.addEventListener('input', atualizarEmitir);
  btnEmitir.addEventListener('click', emitir);
  $('btn-dsf-salvar').addEventListener('click', () => {
    const saved = registroAtual && saveDsf(registroAtual);
    if (saved) registroAtual = saved;
    statusSalvar.textContent = t(saved ? 'dsf.salvo' : 'dsf.save.error');
    statusSalvar.hidden = false;
    if (saved) renderSalvas();
  });
  $('btn-dsf-voltar').addEventListener('click', () => {
    preview.hidden = true;
    liberarPreview?.();
    liberarPreview = null;
    painel.hidden = false;
    elConduta.focus();
  });
  preview.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fechar();
      event.preventDefault();
    }
  });
  $('btn-dsf-fechar').addEventListener('click', () => {
    SFX.pop();
    fechar();
  });
  const reiniciar = () => {
    if (!game.case || !window.confirm(t('dsf.reiniciarConfirm'))) return;
    const caso = game.case;
    fechar();
    game.startCase(caso, { repeat: true, focusAfterArrival: true });
  };
  $('btn-dsf-reiniciar').addEventListener('click', reiniciar);
  $('btn-dsf-preview-reiniciar').addEventListener('click', reiniciar);

  return { abrir, fechar, aberto: () => !painel.hidden || !preview.hidden };
}
