import { buildEvaluatorMessages } from './prompts.js';
import { translatePortugueseToEnglish } from './replyLanguage.js';

/** Generate optional preceptor feedback; scoring and fallback report stay local. */
export async function generatePreceptorFeedback({
  llm,
  caseDef,
  decision,
  result,
  logText,
  language,
  translate = translatePortugueseToEnglish,
}) {
  if (!llm || llm.ok === false) return '';
  try {
    const messages = buildEvaluatorMessages(caseDef, decision, result, logText);
    const { text } = await llm.chat(messages, { maxTokens: 320, temperature: 0.3 });
    return await translate((text || '').trim(), { llm, language, maxTokens: 400 });
  } catch {
    return '';
  }
}
