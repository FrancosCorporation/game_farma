const LS_KEY = 'farmacheck:llm';
const DEFAULT_URL = 'http://127.0.0.1:8081/v1';
const DEFAULT_MODEL = 'Qwen3.5-9B-Q8_0';
const DEFAULT_FALLBACK_URL = import.meta.env?.DEV
  ? '/api/llm/fallback'
  : new URL(/* @vite-ignore */ '../api/llm/fallback', import.meta.url).pathname;

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function cleanText(value, maxLength) {
  return typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : '';
}
function cleanBaseUrl(value) {
  const text = cleanText(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return text.replace(/\/+$/, '');
  } catch { return ''; }
}
function readConfig(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const baseUrl = cleanBaseUrl(parsed.baseUrl);
    const model = cleanText(parsed.model, 120);
    return { ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}) };
  } catch { return {}; }
}

export function loadLLMConfig() {
  try {
    const c = readConfig(localStorage.getItem(LS_KEY));
    return { baseUrl: c.baseUrl || DEFAULT_URL, model: c.model || DEFAULT_MODEL };
  } catch { return { baseUrl: DEFAULT_URL, model: DEFAULT_MODEL }; }
}
export function saveLLMConfig(cfg) {
  const safe = isRecord(cfg) ? {
    ...(cleanBaseUrl(cfg.baseUrl) ? { baseUrl: cleanBaseUrl(cfg.baseUrl) } : {}),
    ...(cleanText(cfg.model, 120) ? { model: cleanText(cfg.model, 120) } : {}),
  } : {};
  try { localStorage.setItem(LS_KEY, JSON.stringify(safe)); return true; }
  catch { return false; }
}
export function hasLLMConfig() {
  // Só conta como configurado se há um endpoint salvo de verdade
  // (o menu grava "{}" quando os campos estão vazios).
  try {
    return !!readConfig(localStorage.getItem(LS_KEY)).baseUrl;
  } catch { return false; }
}

// Cliente OpenAI-compatible com streaming (llama.cpp / llama-server na 8081).
export class LLMClient {
  constructor(cfg = {}) {
    this.baseUrl = cfg.baseUrl || DEFAULT_URL;
    this.model = cfg.model || DEFAULT_MODEL;
    this.fallbackUrl = cfg.fallbackUrl || DEFAULT_FALLBACK_URL;
    this.temperature = cfg.temperature ?? 0.8;
    this.maxTokens = cfg.maxTokens ?? 110;
    this.primaryEnabled = cfg.primaryEnabled ?? true;
    this.fallbackEnabled = cfg.fallbackEnabled ?? true;
    this.ok = null; // null = desconhecido; false = fora do ar (usa templates)
    this.retryMs = cfg.retryMs ?? 15000;
    this.retryAt = 0;
    this.probeInFlight = null;
  }

  markUnavailable() {
    this.ok = false;
    this.retryAt = Date.now() + this.retryMs;
  }

  async probe({ force = false } = {}) {
    if (!this.primaryEnabled) { this.ok = false; return false; }
    if (!force && this.ok === false && Date.now() < this.retryAt) return false;
    if (this.probeInFlight) return this.probeInFlight;
    this.probeInFlight = (async () => {
      try {
        const r = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(4000) });
        this.ok = r.ok;
      } catch { this.ok = false; }
      this.retryAt = this.ok ? 0 : Date.now() + this.retryMs;
      return this.ok;
    })();
    try { return await this.probeInFlight; }
    finally { this.probeInFlight = null; }
  }

  async requestChat(url, body, { onToken, timeoutMs = 45000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(`LLM HTTP ${res.status}`);
      }
      if (!res.body?.getReader) {
        const j = await res.json();
        const text = j.choices?.[0]?.message?.content || '';
        if (!text.trim()) throw new Error('LLM vazio');
        return { text };
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '';
      let finished = false;
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') { finished = true; break; }
            try {
              const j = JSON.parse(payload);
              const tok = j.choices?.[0]?.delta?.content;
              if (tok) { text += tok; onToken?.(tok, text); }
            } catch { /* fragmento parcial */ }
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* já encerrado */ }
        try { reader.releaseLock(); } catch { /* já liberado */ }
      }
      if (!text.trim()) throw new Error('LLM vazio');
      return { text };
    } finally { clearTimeout(timer); }
  }

  async chat(messages, options = {}) {
    const {
      onToken,
      temperature,
      maxTokens,
      timeoutMs = 45000,
      fallbackTimeoutMs = 12000,
    } = options;
    const primaryBody = {
      model: this.model,
      messages,
      stream: true,
      temperature: temperature ?? this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
    };

    try {
      if (!this.primaryEnabled) throw new Error('LLM primário desativado');
      if (this.probeInFlight) await this.probeInFlight;
      if (this.ok === false) {
        if (Date.now() < this.retryAt) throw new Error('LLM temporariamente indisponível');
        if (!await this.probe()) throw new Error('LLM ainda indisponível');
      }
      const result = await this.requestChat(`${this.baseUrl}/chat/completions`, primaryBody, { onToken, timeoutMs });
      this.ok = true;
      return result;
    } catch (primaryError) {
      this.markUnavailable();
      if (!this.fallbackEnabled) throw primaryError;
      try {
        const result = await this.requestChat(this.fallbackUrl, {
          messages,
          temperature: temperature ?? this.temperature,
          max_tokens: maxTokens ?? this.maxTokens,
        }, { onToken, timeoutMs: fallbackTimeoutMs });
        return result;
      } catch {
        throw primaryError;
      }
    }
  }
}
