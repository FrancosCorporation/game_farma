// Sistema de voz dos NPCs em 3 níveis:
//   T1 · asset pré-gerado (public/audio/voices/<caseId>/<hash>.ogg) — instantâneo, voz do personagem
//   T2 · Microsoft Edge neural speech sob demanda via /v1/audio/speech — cache em memória
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

import { getLang } from '../ui/i18n.js';
import { getCharacterVoiceProfile } from '../data/characterVoices.js';

const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

// Vite's development server does not host the local speech API. Avoid a noisy
// 404 there and use the browser voice fallback; the production server
// synthesizes Microsoft neural speech at /v1/audio/speech.
const DEFAULT_TTS_URL = import.meta.env?.DEV ? '' : '/v1';

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const TTS = {
  enabled: true,
  voice: null,
  ttsUrl: DEFAULT_TTS_URL, // servidor local em produção; Vite dev usa a voz nativa
  voiceName: 'pt-BR', // voz/persona para o endpoint
  currentCaseId: '',
  _cache: new Map(),
  _assetManifest: new Map(),
  _assetPhrases: new Map(),
  _assetManifestPromise: null,
  _speakHooks: new Set(), // estado/progresso da narração para consumidores do avatar
  _generation: 0,
  _activeAudio: null,
  _audioElement: null,
  _audioUnlocked: false,
  _audioUnlockPending: false,
  _audioUnlockHandler: null,
  _finishAudio: null,
  _cancelNative: null,
  _abortController: null,
  _speaking: false,

  hookSpeak(fn) {
    if (typeof fn !== 'function') return () => {};
    this._speakHooks.add(fn);
    return () => this._speakHooks.delete(fn);
  },
  _notifySpeak(on, text = '', progress = null, duration = null) {
    const next = Boolean(on);
    if (!next && !this._speaking) return;
    this._speaking = next;
    this._speakHooks.forEach((f) => { try { f(next, text, progress, duration); } catch { /* noop */ } });
  },

  init() {
    try { this.enabled = localStorage.getItem('farmacheck:narration') !== 'false'; } catch { /* memory preference */ }
    this._loadAssetManifest();
    this._installAudioUnlock();
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voices = vs;
      this.voice = this._voiceFor(vs);
    };
    // getVoices() pode bloquear alguns segundos em ambientes sem backend de voz
    // (ex.: Chromium headless) — a leitura é adiada para não travar o boot do jogo.
    speechSynthesis.addEventListener('voiceschanged', pick);
    setTimeout(pick, 0);
  },

  _installAudioUnlock() {
    if (typeof document === 'undefined' || this._audioUnlockHandler) return;
    this._audioUnlockHandler = () => {
      this.unlockAudio();
      if (!this._audioUnlocked) return;
      document.removeEventListener('pointerdown', this._audioUnlockHandler, true);
      document.removeEventListener('keydown', this._audioUnlockHandler, true);
      this._audioUnlockHandler = null;
    };
    document.addEventListener('pointerdown', this._audioUnlockHandler, true);
    document.addEventListener('keydown', this._audioUnlockHandler, true);
  },

  /** Prime the same media element during a user gesture, before voice/network work awaits. */
  unlockAudio() {
    if (this._audioUnlocked || this._audioUnlockPending || this._activeAudio || typeof Audio === 'undefined') return this._audioUnlocked;
    try {
      const audio = this._audioElement || (this._audioElement = new Audio());
      audio.src = SILENT_AUDIO;
      audio.volume = 1;
      const started = audio.play();
      this._audioUnlockPending = true;
      Promise.resolve(started).then(() => {
        this._audioUnlockPending = false;
        this._audioUnlocked = true;
        audio.pause();
        try { audio.currentTime = 0; } catch { /* empty source */ }
        audio.removeAttribute?.('src');
        if (!audio.removeAttribute) audio.src = '';
        audio.load?.();
        if (this._audioUnlockHandler && typeof document !== 'undefined') {
          document.removeEventListener('pointerdown', this._audioUnlockHandler, true);
          document.removeEventListener('keydown', this._audioUnlockHandler, true);
          this._audioUnlockHandler = null;
        }
      }).catch(() => {
        this._audioUnlockPending = false;
      });
      return true;
    } catch {
      this._audioUnlockPending = false;
      return false;
    }
  },

  _makeAudio(src) {
    const audio = this._audioElement || (this._audioElement = new Audio());
    audio.pause?.();
    audio.src = src;
    audio.volume = 1;
    try { audio.currentTime = 0; } catch { /* media metadata not ready */ }
    return audio;
  },

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try { localStorage.setItem('farmacheck:narration', String(this.enabled)); } catch { /* memory preference */ }
    if (!this.enabled) this.stop();
  },

  // Voz nativa coerente com o idioma da UI (EN → voz en-US; PT → pt-BR).
  _voiceFor(vs = this.voices || speechSynthesis.getVoices()) {
    if (!vs || !vs.length) return null;
    const profile = getCharacterVoiceProfile(this._assetCaseId(), getLang());
    const named = vs.find((voice) => voice.name?.toLowerCase().includes(profile.voice.toLowerCase()));
    if (named) return named;
    if (getLang() === 'en') {
      return vs.find((v) => /en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    }
    return vs.find((v) => /pt[-_]BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
  },

  setCase(caseId) {
    this.currentCaseId = caseId || '';
    this.voiceName = getCharacterVoiceProfile(this._assetCaseId(), getLang()).voice;
  },

  // Define a voz da persona atual (perfil de fala do NPC)
  setVoice({ rate = 1, pitch = 1, nomeVoz } = {}) {
    this.rate = rate;
    this.pitch = pitch;
    this.voiceName = nomeVoz || (getLang() === 'en' ? 'en-US' : 'pt-BR');
  },

  _assetCaseId() {
    return String(this.currentCaseId || '').replace(/_s\d+$/, '');
  },

  _assetUrl(text) {
    const caseId = this._assetCaseId();
    if (!caseId) return null;
    const key = `${caseId}/${hash(this.normalize(text))}`;
    return this._assetManifest.get(key) || null;
  },

  _assetSequence(text) {
    const clean = this.normalize(text);
    const direct = this._assetUrl(clean);
    if (direct) return [{ text: clean, url: direct }];
    const caseId = this._assetCaseId();
    if (!caseId || !this._assetPhrases.size) return null;

    const prefix = `${caseId}/`;
    const phrases = [...this._assetPhrases.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, phrase]) => ({ text: phrase, url: this._assetManifest.get(key) }))
      .filter((entry) => entry.url)
      .sort((a, b) => b.text.length - a.text.length);
    const sequence = [];
    let remaining = clean;
    while (remaining) {
      const match = phrases.find(({ text: phrase }) => remaining.startsWith(phrase)
        && (remaining.length === phrase.length || /\s/.test(remaining[phrase.length])));
      if (!match) return null;
      sequence.push(match);
      remaining = remaining.slice(match.text.length).trimStart();
    }
    return sequence.length > 1 ? sequence : null;
  },

  async _loadAssetManifest() {
    if (!this._assetManifestPromise) {
      this._assetManifestPromise = (async () => {
        try {
          const response = await fetch('audio/voices/manifest.json', { cache: 'force-cache' });
          if (!response.ok) return;
          const manifest = await response.json();
          const assets = Object.entries(manifest?.assets || {}).filter(([key, path]) =>
            /^[a-z0-9_-]+\/[a-z0-9]+$/.test(key)
            && typeof path === 'string'
            && /^audio\/voices(?:-[a-z0-9-]+)?\/[a-z0-9_-]+\/[a-z0-9]+\.(?:ogg|mp3)$/.test(path));
          this._assetManifest = new Map(assets);
          this._assetPhrases = new Map(Object.entries(manifest?.phrases || {}).filter(([key, phrase]) =>
            this._assetManifest.has(key) && typeof phrase === 'string' && phrase.trim()));
        } catch {
          this._assetManifest = new Map();
          this._assetPhrases = new Map();
        }
      })();
    }
    await this._assetManifestPromise;
  },

  normalize(t) {
    return (t || '').trim().replace(/\s+/g, ' ');
  },

  _cacheKey(text) {
    const language = getLang();
    const speaker = getCharacterVoiceProfile(this._assetCaseId(), language).voice;
    return `${language}|${this._assetCaseId()}|${speaker}|${this.rate || 1}|${this.pitch ?? 1}|${text}`;
  },

  // T1 (asset) → T2 (API on-the-fly) → T3 (speechSynthesis)
  async play(text) {
    if (!this.enabled || !text) return false;
    if (this._speaking || this._activeAudio || this._abortController) this.stop();
    const generation = ++this._generation;
    const clean = this.normalize(text);
    try {
      if (await this._playAsset(clean, generation)) return true;
      if (generation !== this._generation) return false;
      if (await this._playApi(clean, generation)) return true;
      if (generation !== this._generation) return false;
      return await this._playNative(clean, generation);
    } finally {
      if (generation === this._generation) this._notifySpeak(false);
    }
  },

  async _playAsset(text, generation) {
    if (!this.currentCaseId || generation !== this._generation) return false;
    try {
      await this._loadAssetManifest();
      const sequence = this._assetSequence(text);
      if (!sequence || generation !== this._generation) return false;
      for (const segment of sequence) {
        if (generation !== this._generation) return false;
        const audio = this._makeAudio(segment.url);
        if (!await this._playAudio(audio, generation, segment.text)) return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async _playAudio(audio, generation, text) {
    if (generation !== this._generation) return false;
    this._activeAudio = audio;
    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      const duration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      const begin = () => {
        if (started || generation !== this._generation) return;
        started = true;
        this._notifySpeak(true, text, 0, duration());
      };
      const finish = (played) => {
        if (settled) return;
        settled = true;
        audio.onplay = null;
        audio.onplaying = null;
        audio.ontimeupdate = null;
        audio.onended = null;
        audio.onerror = null;
        if (started) this._notifySpeak(false);
        if (this._activeAudio === audio) this._activeAudio = null;
        if (this._finishAudio === finish) this._finishAudio = null;
        resolve(Boolean(played) && generation === this._generation);
      };
      this._finishAudio = finish;
      audio.onplay = begin;
      audio.onplaying = begin;
      audio.ontimeupdate = () => {
        begin();
        const length = duration();
        if (length) this._notifySpeak(true, text, audio.currentTime / length, length);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      try {
        Promise.resolve(audio.play()).catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
  },

  async _playApi(text, generation) {
    if (!this.ttsUrl || generation !== this._generation) return false;
    try {
      const key = this._cacheKey(text);
      let url = this._cache.get(key);
      if (!url) {
        const base = this.ttsUrl.replace(/\/+$/, '');
        const endpoint = /\/audio\/speech(?:\?.*)?$/.test(base)
          ? base
          : `${base.replace(/\/v1$/, '')}/v1/audio/speech`;
        const lang = getLang();
        const profile = getCharacterVoiceProfile(this._assetCaseId(), lang);
        const controller = new AbortController();
        this._abortController = controller;
        const timeout = setTimeout(() => controller.abort(), 22000);
        let res;
        try {
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'tts-1',
              input: text,
              voice: profile.voice || this.voiceName,
              speed: this.rate || 1,
              pitch: this.pitch ?? 1,
              response_format: 'mp3',
            }),
          });
        } finally {
          clearTimeout(timeout);
          if (this._abortController === controller) this._abortController = null;
        }
        if (!res.ok || generation !== this._generation
          || !res.headers.get('content-type')?.toLowerCase().startsWith('audio/')) return false;
        const blob = await res.blob();
        if (generation !== this._generation) return false;
        url = URL.createObjectURL(blob);
        this._cache.set(key, url);
        while (this._cache.size > 32) {
          const [oldKey, oldUrl] = this._cache.entries().next().value;
          this._cache.delete(oldKey);
          try { URL.revokeObjectURL(oldUrl); } catch { /* noop */ }
        }
      }
      const audio = this._makeAudio(url);
      const played = await this._playAudio(audio, generation, text);
      if (!played && generation === this._generation && this._cache.get(key) === url) {
        this._cache.delete(key);
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
      }
      return played;
    } catch {
      return false;
    }
  },

  async _playNative(text, generation) {
    if (!('speechSynthesis' in window) || generation !== this._generation) return false;
    try { speechSynthesis.cancel(); } catch { /* unavailable in some embedded browsers */ }
    const lang = getLang();
    const voice = this._voiceFor();
    let searchFrom = 0;
    for (const chunk of splitChunks(text)) {
      if (generation !== this._generation) return false;
      const chunkStart = Math.max(searchFrom, text.indexOf(chunk, searchFrom));
      searchFrom = chunkStart + chunk.length;
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = lang === 'en' ? 'en-US' : 'pt-BR';
      if (voice) u.voice = voice;
      u.rate = this.rate || 1;
      u.pitch = this.pitch ?? 1;
      const played = await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (this._cancelNative === cancel) this._cancelNative = null;
          resolve(Boolean(ok) && generation === this._generation);
        };
        const cancel = () => finish(false);
        this._cancelNative = cancel;
        u.onstart = () => this._notifySpeak(true, text, chunkStart / Math.max(1, text.length));
        u.onboundary = (event) => {
          const charIndex = Number(event?.charIndex);
          if (!Number.isFinite(charIndex)) return;
          this._notifySpeak(true, text, (chunkStart + charIndex) / Math.max(1, text.length));
        };
        u.onend = () => finish(true);
        u.onerror = () => finish(false);
        try { speechSynthesis.speak(u); } catch { finish(false); }
      });
      if (!played) return false;
    }
    return true;
  },

  speak(text, voz) {
    if (voz) this.setVoice(voz);
    return this.play(text);
  },
  stop() {
    this._generation++;
    try { this._abortController?.abort(); } catch { /* noop */ }
    this._abortController = null;
    if (this._activeAudio) {
      try { this._activeAudio.pause(); } catch { /* noop */ }
      try { this._activeAudio.currentTime = 0; } catch { /* noop */ }
    }
    this._finishAudio?.(false);
    this._cancelNative?.();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch { /* noop */ }
    }
    this._notifySpeak(false);
  },
};
