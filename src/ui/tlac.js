// F3 — Minigame TLAC: passos guiados → temporizador (~5 s) → resultado do caso.testeRapido.
// Com indicação concluída → game.registrarTesteRapido(resultado). Sem indicação → não registra.
import { t } from './i18n.js';
import { SFX } from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);

const PASSOS = ['tlac.passo1', 'tlac.passo2', 'tlac.passo3', 'tlac.passo4'];
const DUR_TIMER = 5; // segundos "em jogo"

export function initTlac({ game, aoFechar }) {
  const painel = $('tlac');
  const elTipo = $('tlac-tipo');
  const elPassos = $('tlac-passos');
  const elTimer = $('tlac-timer');
  const elTimerFill = $('tlac-timer-fill');
  const elTimerNum = $('tlac-timer-num');
  const elResultado = $('tlac-resultado');
  const btnFechar = $('btn-tlac-fechar');

  let passo = 0;
  let timerId = null;
  let concluido = false;

  const pararTimer = () => { if (timerId) { clearInterval(timerId); timerId = null; } };

  function renderPassos() {
    const li = (label, estado, idx) => `
      <li class="tlac-passo ${estado}">
        <span class="tlac-num">${idx + 1}</span>
        <span class="flex-1">${label}</span>
        ${estado === 'atual' ? `<button type="button" class="tlac-btn" data-passo="${idx}">${t('tlac.executar')}</button>` : estado === 'feito' ? '<span class="tlac-check">✓</span>' : ''}
      </li>`;
    elPassos.innerHTML = PASSOS.map((k, i) => {
      const estado = i < passo ? 'feito' : i === passo ? 'atual' : 'futuro';
      return li(t(k), estado, i);
    }).join('');
    // foco no botão do passo atual (acessível por teclado)
    const btn = elPassos.querySelector('button[data-passo]');
    if (btn) btn.focus();
  }

  function iniciarTimer(caso) {
    elTimer.hidden = false;
    elTimerFill.style.width = '0%';
    const t0 = performance.now();
    let ultimoBeep = -1;
    timerId = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const p = Math.min(1, s / DUR_TIMER);
      elTimerFill.style.width = `${p * 100}%`;
      elTimerNum.textContent = `${Math.max(0, Math.ceil(DUR_TIMER - s))}s`;
      const seg = Math.floor(s);
      if (seg > ultimoBeep && seg < DUR_TIMER) { ultimoBeep = seg; SFX.pop(); }
      if (p >= 1) {
        pararTimer();
        concluir(caso);
      }
    }, 50);
  }

  function concluir(caso) {
    concluido = true;
    elTimer.hidden = true;
    const resultado = String(caso.testeRapido.resultado || 'executado');
    const positivo = /positiv/i.test(resultado);
    elResultado.hidden = false;
    elResultado.className = 'tlac-resultado ' + (positivo ? 'tlac-positivo' : 'tlac-negativo');
    elResultado.innerHTML = `
      <b>${t('tlac.resultado')}:</b> <span class="font-display font-black">${resultado.toUpperCase()}</span>
      <small class="block mt-1 text-slate-400">${t('tlac.registrado')}</small>`;
    game.registrarTesteRapido(caso.testeRapido.resultado);
    if (positivo) SFX.redFlag();
    else SFX.chime();
  }

  function renderNaoIndicado() {
    elPassos.innerHTML = '';
    elTimer.hidden = true;
    elResultado.hidden = false;
    elResultado.className = 'tlac-resultado tlac-neutro';
    elResultado.textContent = t('tlac.naoIndicado');
  }

  function abrir() {
    const caso = game.case;
    if (!caso) return;
    pararTimer();
    passo = 0;
    concluido = false;
    elResultado.hidden = true;
    elTimer.hidden = true;
    const tr = caso.testeRapido;
    if (!tr?.indicado) {
      elTipo.textContent = '';
      renderNaoIndicado();
    } else {
      elTipo.textContent = `🧪 ${tr.tipo} — ${t('tlac.kit')}`;
      renderPassos();
    }
    painel.hidden = false;
    const foco = painel.querySelector('button:not([disabled])');
    if (foco) foco.focus();
  }

  function fechar() {
    pararTimer();
    painel.hidden = true;
    aoFechar?.();
  }

  elPassos.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-passo]');
    if (!b || concluido) return;
    const caso = game.case;
    if (!caso?.testeRapido?.indicado) return;
    SFX.pop();
    passo = Number(b.dataset.passo) + 1;
    if (passo >= PASSOS.length) {
      renderPassos();
      iniciarTimer(caso);
    } else {
      renderPassos();
    }
  });

  btnFechar.addEventListener('click', () => {
    SFX.pop();
    fechar();
  });

  return { abrir, fechar, aberto: () => !painel.hidden };
}
