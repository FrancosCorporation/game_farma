export function createDictation(inputEl) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-mic');
  if (!SR) { if (btn) btn.hidden = true; return { supported: false }; }
  const rec = new SR();
  rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false;
  let on = false;
  rec.onresult = (e) => {
    let final = '';
    for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) final += e.results[i][0].transcript;
    if (final) inputEl.value = (inputEl.value + ' ' + final).trim();
  };
  const off = () => { on = false; btn?.setAttribute('aria-pressed', 'false'); };
  rec.onend = off; rec.onerror = off;
  const toggle = () => {
    if (on) { rec.stop(); return; }
    try { rec.start(); on = true; btn?.setAttribute('aria-pressed', 'true'); } catch { /* já ativo */ }
  };
  btn?.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggle(); }
  });
  return { supported: true, toggle };
}