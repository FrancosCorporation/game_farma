// Renderiza o resultado do teste como texto; o valor do caso nunca é HTML.
export function renderTlacResult(element, { resultado, positivo, semResultado = false, t }) {
  const label = document.createElement('b');
  label.textContent = `${t('tlac.resultado')}:`;

  const value = document.createElement('span');
  value.className = 'font-display font-black';
  value.textContent = String(resultado ?? '').toUpperCase();

  const note = document.createElement('small');
  note.className = 'block mt-1 text-slate-400';
  note.textContent = t(semResultado ? 'tlac.semResultadoNota' : 'tlac.registrado');

  element.className = `tlac-resultado ${semResultado ? 'tlac-neutro' : (positivo ? 'tlac-positivo' : 'tlac-negativo')}`;
  element.replaceChildren(label, value, note);
  element.hidden = false;
}
