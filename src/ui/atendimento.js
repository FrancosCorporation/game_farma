// F2/F3/F4 — Orquestra os pontos de interesse: botões do HUD → zona da câmera → painel.
// Escape fecha o painel aberto ou volta ao paciente. Barra de ações só em Anamnese/Decisão.
import { SFX } from '../audio/sfx.js';
import { t } from './i18n.js';
import { initBulario } from './bulario.js';
import { initTlac } from './tlac.js';
import { initDsf } from './dsf.js';

const $ = (id) => document.getElementById(id);

const comSfx = (fn) => () => {
  try { SFX.ensure(); SFX.pop(); } catch { /* áudio opcional */ }
  fn();
};

export function initAtendimento({ game, pov }) {
  const barra = $('acoes');
  const btnPc = $('btn-hud-pc');
  const btnTlac = $('btn-hud-tlac');
  const btnDsf = $('btn-hud-dsf');
  const btnPaciente = $('btn-hud-paciente');

  let painelAberto = null;
  const modulos = {
    bulario: initBulario({ game, aoFechar: () => { painelAberto = null; } }),
    tlac: initTlac({ game, aoFechar: () => { painelAberto = null; } }),
    dsf: initDsf({ game, aoFechar: () => { painelAberto = null; } }),
  };

  const emAtendimento = () => game.state === 'ANAMNESE' || game.state === 'DECISAO';

  const fecharPainel = () => {
    if (painelAberto && modulos[painelAberto].aberto()) modulos[painelAberto].fechar();
    painelAberto = null;
  };

  const abrirPainel = (nome, zona) => {
    if (!emAtendimento()) return;
    fecharPainel();
    painelAberto = nome;
    if (pov.zonaAtual() !== zona) pov.irPara(zona); // já perto? não re-tweena o olhar
    modulos[nome].abrir();
    atualizarBarra();
  };

  const voltarPaciente = () => {
    fecharPainel();
    pov.irPara('paciente');
    atualizarBarra();
  };

  function atualizarBarra() {
    btnPaciente.hidden = pov.zonaAtual() === 'paciente' && !painelAberto;
  }

  btnPc.addEventListener('click', comSfx(() => abrirPainel('bulario', 'computador')));
  btnTlac.addEventListener('click', comSfx(() => abrirPainel('tlac', 'mesa')));
  btnDsf.addEventListener('click', comSfx(() => abrirPainel('dsf', 'paciente')));
  btnPaciente.addEventListener('click', comSfx(voltarPaciente));

  // Tecla E: interage com o ponto de interesse da zona atual da câmera
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e') return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (!emAtendimento()) return;
    if (pov.zonaAtual() === 'computador') abrirPainel('bulario', 'computador');
    else if (pov.zonaAtual() === 'mesa') abrirPainel('tlac', 'mesa');
    else if (pov.zonaAtual() === 'paciente') {
      const input = document.getElementById('chat-input');
      if (input && !input.disabled) input.focus();
    }
  });

  // Escape: fecha painel → senão volta ao paciente (capa/referências têm seu próprio handler)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (painelAberto && !barra.hidden) voltarPaciente();
    else if (!barra.hidden && pov.zonaAtual() !== 'paciente') voltarPaciente();
  });

  function atualizarHint() {
    const hint = document.getElementById('hint-e');
    const txt = document.getElementById('hint-e-texto');
    if (!hint || !txt) return;
    const ativo = emAtendimento();
    const zona = pov.zonaAtual();
    // contextual por PROXIMIDADE (PO 24/09): longe dos pontos de interesse,
    // não há o que interagir — o hint some.
    hint.hidden = !ativo || !zona;
    if (!ativo || !zona) return;
    txt.textContent = zona === 'computador' ? t('hint.computador')
      : zona === 'mesa' ? t('hint.mesa')
      : t('hint.paciente');
  }

  pov.onChange(atualizarBarra);
  pov.onChange(atualizarHint);

  // Saiu da frente do painel (andou p/ outro lugar)? O painel desativa sozinho.
  const ZONA_DO_PAINEL = { bulario: 'computador', tlac: 'mesa', dsf: 'paciente' };
  pov.onChange(() => {
    if (!painelAberto) return;
    if (pov.zonaAtual() !== ZONA_DO_PAINEL[painelAberto]) fecharPainel();
  });

  // Controla a visibilidade da barra conforme a fase do atendimento (chamado via game.setFase)
  function setAtendimento(on) {
    barra.hidden = !on;
    if (!on) {
      fecharPainel();
      pov.irPara('paciente');
    }
    atualizarBarra();
    // sem irPara() não dispara onChange — hint E ficava escondido na 1ª anamnese
    atualizarHint();
  }

  return { setAtendimento };
}
