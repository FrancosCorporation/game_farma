import { getLang, t } from '../ui/i18n.js';

export function createDictation(inputEl, { onSubmit } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-mic');
  const status = document.getElementById('mic-status');
  if (!SR) { if (btn) btn.hidden = true; return { supported: false }; }
  const rec = new SR();
  const currentLanguage = () => getLang() === 'en' ? 'en-US' : 'pt-BR';
  rec.lang = currentLanguage();
  rec.interimResults = true;
  rec.continuous = false;
  let on = false;
  let submitAfterStop = false;
  let startingValue = '';
  let recordedText = '';
  const renderButton = () => {
    if (!btn) return;
    const key = on ? 'chat.micStopButton' : 'chat.micButton';
    btn.textContent = t(key);
    btn.title = t(on ? 'chat.micStop' : 'chat.mic');
    btn.setAttribute('aria-label', t(key));
    btn.setAttribute('aria-pressed', String(on));
  };
  const off = () => {
    on = false;
    if (btn) btn.disabled = false;
    renderButton();
  };
  const setMessage = (key) => {
    if (status) status.textContent = key ? t(`chat.${key}`) : '';
  };

  rec.onresult = (e) => {
    let final = '';
    for (let i = e.resultIndex || 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
    }
    if (final) {
      recordedText = `${recordedText} ${final}`.trim();
      inputEl.value = [startingValue, recordedText].filter(Boolean).join(' ').trim();
    }
  };
  rec.onend = () => {
    const shouldSubmit = submitAfterStop;
    submitAfterStop = false;
    off();
    if (!shouldSubmit) return;
    if (!recordedText) { setMessage('mic.noSpeech'); return; }
    setMessage('mic.sending');
    Promise.resolve().then(() => onSubmit?.()).then((sent) => {
      if (sent === false) setMessage('mic.failed');
      else setMessage('mic.sent');
    }).catch(() => setMessage('mic.failed'));
  };
  rec.onerror = (event) => {
    submitAfterStop = false;
    off();
    if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') setMessage('mic.denied');
    else if (event?.error === 'no-speech') setMessage('mic.noSpeech');
    else if (event?.error !== 'aborted') setMessage('mic.failed');
  };
  renderButton();
  const stopRecognition = (submit) => {
    if (!on) return;
    submitAfterStop = submit;
    if (submit) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = t('chat.micStoppingButton');
      }
      setMessage('mic.sending');
    }
    try { rec.stop(); }
    catch {
      submitAfterStop = false;
      off();
      setMessage('mic.failed');
    }
  };
  const toggle = () => {
    setMessage('');
    if (on) {
      stopRecognition(true);
      return;
    }
    try {
      startingValue = inputEl.value.trim();
      recordedText = '';
      // SpeechRecognition may end on its own after one utterance; send that
      // finalized transcript just as we do when the player taps Stop.
      submitAfterStop = true;
      rec.lang = currentLanguage();
      rec.start();
      on = true;
      renderButton();
      setMessage('mic.recording');
    } catch {
      off();
      setMessage('mic.failed');
    }
  };
  btn?.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key?.toLowerCase() === 'm') { e.preventDefault(); toggle(); }
  });
  document.addEventListener('farmacheck:langchange', () => {
    rec.lang = currentLanguage();
    setMessage('');
    if (on) stopRecognition(false);
    else renderButton();
  });
  return {
    supported: true,
    toggle,
    stop() { stopRecognition(false); },
    get active() { return on; },
    get language() { return rec.lang; },
  };
}
