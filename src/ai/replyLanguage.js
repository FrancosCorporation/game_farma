import { buildTranslateMessages, looksPortuguese } from './prompts.js';

/** Translate Portuguese model output only when the UI is English; return empty on failed translation. */
export async function translatePortugueseToEnglish(text, {
  llm,
  language = 'pt',
  maxTokens = 160,
} = {}) {
  if (language !== 'en' || !text || !looksPortuguese(text)) return text;
  if (!llm) return '';

  try {
    const { text: translated } = await llm.chat(buildTranslateMessages(text), {
      maxTokens,
      temperature: 0.2,
    });
    const clean = (translated || '').trim();
    return clean && !looksPortuguese(clean) ? clean : '';
  } catch {
    return '';
  }
}
