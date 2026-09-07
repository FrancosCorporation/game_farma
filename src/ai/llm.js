const LS_KEY = 'farmacheck:llm';
const DEFAULT_URL = 'http://127.0.0.1:8081/v1';
const DEFAULT_MODEL = 'Qwen3.5-9B-Q8_0';

export function loadLLMConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    return { baseUrl: c.baseUrl || DEFAULT_URL, model: c.model || DEFAULT_MODEL };
  } catch { return { baseUrl: DEFAULT_URL, model: DEFAULT_MODEL }; }
}
export function saveLLMConfig(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

// Cliente OpenAI-compatible com streaming (llama.cpp / llama-server na 8081).
export class LLMClient {
  constructor(cfg = {}) {
    this.baseUrl = cfg.baseUrl || DEFAULT_URL;
    this.model = cfg.model || DEFAULT_MODEL;
    this.temperature = cfg.temperature ?? 0.8;
    this.maxTokens = cfg.maxTokens ?? 110;
    this.ok = null; // null = desconhecido; false = fora do ar (usa templates)
  }

  async probe() {
    try {
      const r = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(4000) });
      this.ok = r.ok;
    } catch { this.ok = false; }
    return this.ok;
  }

  async chat(messages, { onToken, temperature, maxTokens, timeoutMs = 45000 } = {}) {
    const body = {
      model: this.model,
      messages,
      stream: true,
      temperature: temperature ?? this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status} ${t.slice(0, 120)}`);
    }
    if (!res.body?.getReader) {
      const j = await res.json();
      return { text: j.choices?.[0]?.message?.content || '' };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const tok = j.choices?.[0]?.delta?.content;
          if (tok) { text += tok; onToken?.(tok, text); }
        } catch { /* fragmento parcial */ }
      }
    }
    if (!text.trim()) throw new Error('LLM vazio');
    return { text };
  }
}