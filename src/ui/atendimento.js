// F2/F3/F4 — Orquestra os pontos de interesse: botões do HUD → zona da câmera → painel.
// Escape fecha o painel aberto ou volta ao paciente. Barra de ações só em Anamnese/Decisão.
import { SFX } from '../audio/sfx.js';
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
    pov.irPara(zona);
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
    else {
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

  pov.onChange(atualizarBarra);
  pov.onChange((zona) => {
    const hint = document.getElementById('hint-e');
    const txt = document.getElementById('hint-e-texto');
    if (!hint || !txt) return;
    const ativo = emAtendimento();
    hint.hidden = !ativo;
    if (!ativo) return;
    txt.textContent = zona === 'computador' ? 'para consultar o computador (bulário)'
      : zona === 'mesa' ? 'para realizar teste rápido (TLAC)'
      : 'para conversar com o paciente';
  });

  // Controla a visibilidade da barra conforme a fase do atendimento (chamado via game.setFase)
  function setAtendimento(on) {
    barra.hidden = !on;
    if (!on) {
      fecharPainel();
      pov.irPara('paciente');
    }
    atualizarBarra();
  }

  return { setAtendimento };
}
