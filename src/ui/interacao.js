// Interação por proximidade (tecla E) — banner "Pressione E" + ação + fechar chat ao afastar.
// Pontos de interesse alinhados à cena (pharmacy.js): paciente (à frente do balcão),
// computador (bulário, esquerda) e mesa (TLAC, direita).
import { SFX } from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);

// alvo XZ (mundo) + raio de alcance (m) + zona de câmera
const ALVOS = [
  { nome: 'paciente', pos: [0, 0.9], raio: 2.0, zona: 'paciente', acao: 'atender' },
  { nome: 'computador', pos: [-1.4, 1.78], raio: 1.7, zona: 'computador', acao: 'bulario' },
  { nome: 'mesa', pos: [2.45, 1.45], raio: 1.7, zona: 'mesa', acao: 'tlac' },
];

export function initInteracao({ game, pov, addTicker, atendimento }) {
  const banner = $('pressione-e');
  const afastado = $('afastado-paciente');
  const chat = $('chat');
  if (!banner || !chat) return {};

  let alvoAtual = null;

  function dist2D(px, pz, tx, tz) {
    const dx = px - tx, dz = pz - tz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  addTicker(() => {
    const cam = pov.getPosition();
    const emAcao = game.state === 'ANAMNESE' || game.state === 'DECISAO';
    if (!emAcao) {
      banner.classList.add('hidden');
      afastado.classList.add('hidden');
      return;
    }

    // alvo mais PRÓXIMO dentro do raio (evita sobreposição paciente/mesa/pc)
    let perto = null, melhorD = Infinity;
    for (const a of ALVOS) {
      const d = dist2D(cam.x, cam.z, a.pos[0], a.pos[1]);
      if (d <= a.raio && d < melhorD) { melhorD = d; perto = a; }
    }
    alvoAtual = perto;

    if (perto) {
      banner.querySelector('b').textContent = perto.nome;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    // afastou do paciente durante a anamnese → fecha o chat + avisa
    const dPac = dist2D(cam.x, cam.z, 0, 0.9);
    const longeDoPaciente = dPac > 2.8 && game.state === 'ANAMNESE' && !perto;
    afastado.classList.toggle('hidden', !longeDoPaciente);
    chat.classList.toggle('opacity-40', longeDoPaciente);
  });

  document.addEventListener('keydown', (e) => {
    const tecla = e.key.toLowerCase();
    if (tecla !== 'e' && tecla !== 'e') return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
    if (!alvoAtual || (game.state !== 'ANAMNESE' && game.state !== 'DECISAO')) return;
    try { SFX.ensure(); SFX.pop(); } catch { /* áudio opcional */ }
    if (alvoAtual.acao === 'atender') {
      atendimento.voltarPaciente();
      // auto-focus no chat + soltar pointer lock pra digitar direto
      document.exitPointerLock?.();
      $('chat-input')?.focus();
    }
    else if (alvoAtual.acao === 'bulario') atendimento.abrirPainel('bulario', 'computador');
    else if (alvoAtual.acao === 'tlac') atendimento.abrirPainel('tlac', 'mesa');
  });

  return { alvoAtual: () => alvoAtual };
}