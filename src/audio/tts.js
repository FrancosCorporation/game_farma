// Sistema de voz dos NPCs em 3 níveis:
//   T1 · asset pré-gerado (public/audio/voices/<caseId>/<hash>.ogg) — instantâneo, voz do personagem
//   T2 · geração sob demanda via endpoint TTS OpenAI-compat (/v1/audio/speech) — cache em memória
//   T3 · speechSynthesis do navegador com rate/pitch por persona — fallback offline

function splitChunks(text, max = 180) {
  const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
  const out = [];
  let cur = '';
  for (const s of parts) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const TTS = {
  enabled: true,
  voice: null,
  ttsUrl: '', // endpoint OpenAI-compat, ex.: http://127.0.0.1:8080/v1/audio/speech
  voiceName: 'pt-BR', // voz/persona para o endpoint
  currentCaseId: '',
  _cache: new Map(),

  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /pt[-_]BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },

  setCase(caseId) {
    this.currentCaseId = caseId || '';
  },

  // Define a voz da persona atual (perfil de fala do NPC)
  setVoice({ rate = 1, pitch = 1, nomeVoz } = {}) {
    this.rate = rate;
    this.pitch = pitch;
    this.voiceName = nomeVoz || this.voiceName;
  },

  _assetUrl(text) {
    if (!this.currentCaseId) return null;
    return `audio/voices/${this.currentCaseId}/${hash(this.normalize(text))}.ogg`;
  },

  normalize(t) {
    return (t || '').trim().replace(/\s+/g, ' ');
  },

  // tenta T1 (asset) → T2 (API on-the-fly) → T3 (speechSynthesis)
  async play(text) {
    if (!this.enabled || !text) return;
    const clean = this.normalize(text);
    const onTheFly = this._playApi(clean);
    if (onTheFly) return onTheFly;
    if (this._playAsset(clean)) return Promise.resolve();
    this._playNative(clean);
    return Promise.resolve();
  },

  _playAsset(text) {
    const url = this._assetUrl(text);
    if (!url) return false;
    const audio = new Audio();
    audio.onerror = () => {};
    audio.src = url;
    audio.volume = 1;
    audio.play().catch(() => {});
    return true;
  },

  async _playApi(text) {
    if (!this.ttsUrl) return null;
    try {
      if (this._cache.has(text)) {
        const cached = this._cache.get(text);
        cached.currentTime = 0;
        cached.play().catch(() => {});
        return;
      }
      const res = await fetch(`${this.ttsUrl.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: this.voiceName,
          response_format: 'mp3',
        }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this._cache.set(text, audio);
      audio.play().catch(() => {});
    } catch {
      return null;
    }
  },

  _playNative(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    for (const chunk of splitChunks(text)) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = 'pt-BR';
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate || 1;
      u.pitch = this.pitch ?? 1;
      speechSynthesis.speak(u);
    }
  },

  speak(text, voz) {
    if (voz) this.setVoice(voz);
    return this.play(text);
  },
  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
};