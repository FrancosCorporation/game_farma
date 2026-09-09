import { SFX } from '../audio/sfx.js';
import { setLang, applyI18n } from './i18n.js';

const $ = (id) => document.getElementById(id);

/** Wrapper seguro: toca SFX sem quebrar o fluxo se o áudio falhar. */
const withSfx = (fn) => (ev) => {
  try { SFX.ensure(); SFX.pop(); } catch { /* áudio é opcional */ }
  fn(ev);
};

export function initCapa() {
  const capa = $('capa');
  const menu = $('menu');
  const refs = $('refs');
  const pt = $('capa-lang-pt');
  const en = $('capa-lang-en');

  const markLang = () => {
    const cur = document.documentElement.lang;
    pt.setAttribute('aria-pressed', String(cur !== 'en'));
    en.setAttribute('aria-pressed', String(cur === 'en'));
  };

  $('capa-iniciar').addEventListener('click', withSfx(() => {
    capa.hidden = true;
    menu.hidden = false;
  }));

  $('capa-refs').addEventListener('click', withSfx(() => { refs.hidden = !refs.hidden; }));
  $('btn-refs-fechar').addEventListener('click', withSfx(() => { refs.hidden = true; }));

  pt.addEventListener('click', withSfx(() => { setLang('pt'); applyI18n(document); markLang(); }));
  en.addEventListener('click', withSfx(() => { setLang('en'); applyI18n(document); markLang(); }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refs && !refs.hidden) refs.hidden = true;
  });

  markLang();
}
