import './styles.css';
import { initI18n, t } from './ui/i18n.js';
import { initCapa } from './ui/capa.js';

const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────────────────────────────────────────
// F0 — capa + i18n primeiro, e SEM three.js no grafo deste entry.
// Este módulo roda em milissegundos (só DOM); a cena 3D entra por import dinâmico
// logo abaixo. Antes, um import estático de three segurava a execução deste arquivo
// até o fim do download/avaliação do bundle e o primeiro clique do jogador na capa
// caía no vazio (tela viva, botão morto).
// ─────────────────────────────────────────────────────────────────────────────
initI18n();
initCapa();

// Handshake com o bootstrap (src/app.js): o botão do menu só vale quando a cena 3D existe.
const jogoPronto = () => document.documentElement.dataset.jogoPronto === '1';

function travarInicio() {
  const b = $('btn-iniciar');
  if (!b || jogoPronto()) return;
  b.dataset.rotuloOriginal = t('menu.iniciar');
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  b.textContent = t('boot.preparando');
}

function liberarInicio() {
  const b = $('btn-iniciar');
  if (!b) return;
  b.disabled = false;
  b.removeAttribute('aria-busy');
  if (b.dataset.rotuloOriginal) {
    b.textContent = b.dataset.rotuloOriginal;
    delete b.dataset.rotuloOriginal;
  }
}

// Só marca "carregando" se o jogador fechar a capa antes do cenário ficar pronto
// (no caso normal o aviso nem chega a aparecer).
$('capa-iniciar')?.addEventListener('click', () => setTimeout(travarInicio, 0));
document.addEventListener('farmacheck:pronto', liberarInicio);

function falharBoot(erro) {
  console.error('[farmacheck] falha ao carregar o cenário 3D:', erro);
  const b = $('btn-iniciar');
  if (!b) return;
  b.disabled = true;
  b.removeAttribute('aria-busy');
  b.textContent = t('boot.falha');
}

// Cena, avatares, IA e regras (chunk próprio, com three.js), depois da capa viva.
import('./app.js')
  .then(({ startApp }) => startApp())
  .catch(falharBoot);
