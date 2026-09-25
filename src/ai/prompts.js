// Prompt do ATOR (paciente): pequeno, FAT-GATED — só entra o que o motor liberou.
// Bilíngue: segue o idioma da UI (i18n) — em EN o ator só fala inglês.
import { getLang } from '../ui/i18n.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildActorSystemPrompt(caso, knowledge, novos, evasivas) {
  const p = caso.persona;
  const L = [];
  if (getLang() === 'en') {
    L.push(`You are ${p.nome}, ${p.idade} years old. ${p.resumo}.`);
    L.push(`SCENARIO: you are at a pharmacy counter and want to buy ${caso.pedido}.`);
    L.push(`When you arrived you already said: "${caso.abertura}"`);
    L.push('RULES (follow strictly):');
    L.push('- Answer in 1 to 3 short sentences, casual everyday English, no medical jargon.');
    L.push('- Use ONLY the information allowed below. NEVER invent symptoms, numbers or facts.');
    L.push('- Never self-diagnose, never suggest medicines, never mention "heart attack" or diseases.');
    L.push('- Keep wanting to buy what you asked for, naturally.');
    L.push('- If asked what to do, answer: "aren\'t you the one who studied for this?"');
    if (evasivas.length) {
      L.push(`IN THIS TURN you still don't want to share the detail. Deflect with something like: "${evasivas[0].falaEvasiva}"`);
    } else if (novos.length) {
      L.push('INFORMATION ALLOWED NOW (weave it in naturally):');
      novos.forEach((f) => L.push(`- ${f.falaLeiga}`));
      const anteriores = knowledge.recent(4, novos);
      if (anteriores.length) {
        L.push("Already revealed before (don't repeat needlessly, only if it makes sense):");
        anteriores.forEach((f) => L.push(`- ${f.falaLeiga}`));
      }
    } else {
      L.push(`INFORMATION ALLOWED NOW: nothing new. React without giving new clinical info and get back to your request, e.g.: "${p.falaForaDominio}"`);
    }
    L.push('LANGUAGE: reply ONLY in English — never a single Portuguese word.');
  } else {
    L.push(`Você é ${p.nome}, ${p.idade} anos. ${p.resumo}.`);
    L.push(`CENÁRIO: você está no balcão de uma farmácia e quer comprar ${caso.pedido}.`);
    L.push(`Você já disse ao chegar: "${caso.abertura}"`);
    L.push('REGRAS (obedeça rigorosamente):');
    L.push('- Responda em 1 a 3 frases curtas, português popular do Brasil, sem jargão médico.');
    L.push('- Use APENAS as informações permitidas abaixo. NUNCA invente sintomas, números ou fatos.');
    L.push('- Nunca se autodiagnostique, nunca sugira remédios, nunca mencione "infarto" ou doenças.');
    L.push('- Continue querendo comprar o que pediu, com naturalidade.');
    L.push('- Se perguntarem o que fazer, responda: "a senhora não é que estudou pra isso?"');
    if (evasivas.length) {
      L.push(`NESTE TURNO você ainda não quer contar o detalhe. Desvie com algo como: "${evasivas[0].falaEvasiva}"`);
    } else if (novos.length) {
      L.push('INFORMAÇÕES PERMITIDAS AGORA (incorpore com naturalidade):');
      novos.forEach((f) => L.push(`- ${f.falaLeiga}`));
      const anteriores = knowledge.recent(4, novos);
      if (anteriores.length) {
        L.push('Já revelado antes (não repita à toa, só se fizer sentido):');
        anteriores.forEach((f) => L.push(`- ${f.falaLeiga}`));
      }
    } else {
      L.push(`INFORMAÇÕES PERMITIDAS AGORA: nenhuma nova. Reaja sem dar informação clínica nova e volte ao seu pedido, ex.: "${p.falaForaDominio}"`);
    }
    L.push('IDIOMA: responda APENAS em português do Brasil.');
  }
  return L.join('\n');
}

// Voz determinística (fallback offline). falaLeiga é a fonte única dos tiers.
export function templateReply(caso, knowledge, novos, evasivas) {
  if (evasivas.length) return evasivas[0].falaEvasiva;
  if (novos.length) return novos.map((f) => f.falaLeiga).join(' ');
  if (knowledge.turnsWithoutNews >= 2) return caso.persona.falaRepetida;
  return caso.persona.falaForaDominio;
}

// ── Guarda de idioma: detecta resposta do LLM em PT quando a UI está em EN ──
// Heurística: >=2 marcadores exclusivos do português (normalizados, sem acento).
const PT_MARKERS = /\b(nao|esta|estou|voce|pra|pro|isso|aqui|sou|sei|quero|queria|posso|toco|tomei|tomou|tomar|acho|sinto|meu|minha|uma|comi|muito|coisa|nada|hoje|semana|tambem|entao|melhor|pior|remedio|medicament|bom dia|boa tarde|boa noite)/g;

export function looksPortuguese(text) {
  const q = norm(text);
  const hits = new Set(q.match(PT_MARKERS) || []);
  return hits.size >= 2;
}

// Mensagens p/ traduzir uma fala PT→EN no próprio servidor de IA.
export function buildTranslateMessages(text) {
  return [
    { role: 'system', content: 'Translate the pharmacy patient\'s line into natural, casual English (1–3 sentences). Output ONLY the translation — no notes, no quotes.' },
    { role: 'user', content: text },
  ];
}

// PRECEPTOR (best-effort): recebe a nota JÁ COMPUTADA e humaniza o relatório.
export function buildEvaluatorMessages(caso, decisao, result, logText) {
  const en = getLang() === 'en';
  const system = en
    ? `You are a clinical pharmacy preceptor, calm and constructive tone. You receive the ALREADY COMPUTED RESULT
of a simulation and write the feedback in English (max. 180 words, 3 blocks):
1) what the student did well (max. 3 points); 2) what was missing in the investigation; 3) practical recommendation.
Rules: NEVER recalculate or question the score; do not prescribe doses; respectful language.`
    : `Você é um preceptor de farmácia clínica, tom calmo e construtivo. Recebe o RESULTADO JÁ COMPUTADO
de uma simulação e escreve o feedback em português do Brasil (máx. 180 palavras, 3 blocos):
1) o que o aluno fez bem (máx. 3 pontos); 2) o que faltou investigar; 3) recomendação prática.
Regras: NUNCA recalcule ou questione a nota; não prescreva doses; linguagem respeitosa.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({
      caso: caso.id, decisao, nota: result.total,
      detalhes: { anamnese: result.anamnese, redflags: result.redflags, risco: result.risco,
                  conduta: result.conduta, comunicacao: result.comunicacao,
                  dominios_faltantes: result.missedDomains, redflags_faltantes: result.missedRed,
                  erros_criticos: result.criticals },
      log: logText,
    }) },
  ];
}
