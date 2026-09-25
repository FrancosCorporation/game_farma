import { SFX } from '../audio/sfx.js';
import { setLang, applyI18n } from './i18n.js';

const $ = (id) => document.getElementById(id);

/** Wrapper seguro: garante o AudioContext sem quebrar o fluxo se o áudio falhar. */
const withSfx = (fn) => (ev) => {
  try { SFX.ensure(); } catch { /* áudio é opcional */ }
  fn(ev);
};

/** Enquanto a capa está aberta, o jogo atrás fica inerte (sem Tab/clique vazando).
 *  Percorre a árvore sem tocar na capa (nem nos ancestrais dela) e mantém o modal de refs usável. */
const KEEP_IDS = new Set(['capa', 'refs']);
function setBackgroundInert(on) {
  const capa = document.getElementById('capa');
  const ancestors = new Set();
  for (let n = capa; n; n = n.parentElement) ancestors.add(n);
  const walk = (parent) => {
    for (const el of parent.children) {
      if (KEEP_IDS.has(el.id)) continue;
      if (ancestors.has(el)) { walk(el); continue; }
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      el.toggleAttribute('inert', on);
    }
  };
  walk(document.body);
}

export function initCapa() {
  const capa = $('capa');
  const menu = $('menu');
  const refs = $('refs');
  const pt = $('capa-lang-pt');
  const en = $('capa-lang-en');

  setBackgroundInert(true);

  // Som de clique físico no pressionar (acompanha a animação de afundamento)
  for (const el of [$('capa-iniciar'), $('capa-refs'), pt, en]) {
    el.addEventListener('pointerdown', () => { try { SFX.ensure(); SFX.click(); } catch { /* opcional */ } }, { passive: true });
  }

  const markLang = () => {
    const cur = document.documentElement.lang;
    pt.setAttribute('aria-pressed', String(cur !== 'en'));
    en.setAttribute('aria-pressed', String(cur === 'en'));
  };

  $('capa-iniciar').addEventListener('click', withSfx(() => {
    capa.hidden = true;
    menu.hidden = false;
    setBackgroundInert(false);
  }));

  $('capa-refs').addEventListener('click', withSfx(() => { refs.hidden = !refs.hidden; }));
  $('btn-refs-fechar').addEventListener('click', withSfx(() => { refs.hidden = true; }));

  pt.addEventListener('click', withSfx(() => { setLang('pt'); applyI18n(document); markLang(); }));
  en.addEventListener('click', withSfx(() => { setLang('en'); applyI18n(document); markLang(); }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refs && !refs.hidden) refs.hidden = true;
  });

  markLang();

  // Chips de idioma com animação ao trocar (feedback visível do toggle)
  for (const chip of [pt, en]) {
    chip.addEventListener('click', () => {
      chip.classList.remove('lang-bump');
      void chip.offsetWidth; // reinicia a animação
      chip.classList.add('lang-bump');
    });
  }

  // Física da pílula de idioma: afunda junto com o chip pressionado (sem depender de :has())
  const langPill = document.querySelector('.capa-lang');
  if (langPill) {
    for (const chip of [pt, en]) {
      chip.addEventListener('pointerdown', () => langPill.classList.add('pressing'));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
        chip.addEventListener(ev, () => langPill.classList.remove('pressing'));
      }
    }
  }

  // Sinal de prontidão da capa (gate de boot em scripts/qa_boot.mjs): marca no documento
  // que os listeners estão instalados — antes disso o 1º clique do jogador cairia no vazio.
  // O carimbo de tempo é medido na própria página (o polling do harness fica faminto
  // durante a inicialização da cena e não serve para medir boot).
  document.documentElement.dataset.capaPronta = '1';
  document.documentElement.dataset.capaProntaMs = String(Math.round(performance.now()));
}
