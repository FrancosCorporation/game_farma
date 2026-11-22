// Prompt do ATOR (paciente): pequeno, FACT-GATED — só entra o que o motor liberou.
// Bilíngue: segue o idioma da UI (i18n) — em EN o ator só fala inglês.
import { getLang } from '../ui/i18n.js';
import { classify, warningSignsFromQuestion } from '../core/factGate.js';
import { casoDocumento } from '../data/casoDocumento.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// O documento completo contém fatos ainda ocultos e o gabarito do farmacêutico.
// O ator recebe somente o trecho seguro de contexto mais os fatos liberados
// abaixo; o preceptor recebe o documento completo depois da decisão.
function pushReferenceDocument(L, caso, lang) {
  if (!casoDocumento(caso.id, lang)) return;
  if (lang === 'en') {
    L.push('CASE DOCUMENT EXCERPT: your name, age, occupation and pharmacy request are stated above. The clinical history from the document appears only in INFORMATION ALLOWED below, as the pharmacist discovers it.');
    L.push('The pharmacist’s conduct and test result are never your lines. Never give a diagnosis, test result or medicine advice.');
  } else {
    L.push('EXCERTO DO DOCUMENTO DO CASO: nome, idade, ocupação e pedido no balcão estão acima. A história clínica do documento aparece somente nas INFORMAÇÕES PERMITIDAS abaixo, conforme o farmacêutico a descobre.');
    L.push('Condutas do farmacêutico e resultado de teste não são falas suas. Nunca dê diagnóstico, resultado de exame ou orientação de medicamento.');
  }
}

export function buildActorSystemPrompt(caso, knowledge, novos, evasivas) {
  const p = caso.persona;
  const L = [];
  if (getLang() === 'en') {
    L.push(`You are ${p.nome}, ${p.idade} years old. ${p.resumo}.`);
    L.push(`SCENARIO: you are at a pharmacy counter and want to buy ${caso.pedido}.`);
    L.push(`When you arrived you already said: "${caso.abertura}"`);
    pushReferenceDocument(L, caso, 'en');
    L.push('RULES (follow strictly):');
    L.push('- Answer in 1 to 3 natural, casual sentences in everyday English, with no medical jargon.');
    L.push('- React to the pharmacist\'s latest question in your own words. Vary phrasing and sentence structure; do not sound like a script or repeat a stock line.');
    L.push('- Use ONLY the information allowed below. NEVER invent symptoms, numbers or facts.');
    L.push('- Never self-diagnose, never suggest medicines, never mention "heart attack" or diseases.');
    L.push('- Remember what you came to buy, but do not restate the request unless it fits the conversation.');
    L.push('- If asked to decide or give advice, respond as a patient in your own words and leave clinical guidance to the pharmacist.');
    if (evasivas.length) {
      L.push(`IN THIS TURN you still don't want to share the detail. Deflect naturally, keeping the same intent as this example but wording it differently: "${evasivas[0].falaEvasiva}"`);
    } else if (novos.length) {
      L.push('INFORMATION ALLOWED NOW (weave it in naturally):');
      novos.forEach((f) => L.push(`- ${f.falaLeiga}`));
      const anteriores = knowledge.recent(4, novos);
      if (anteriores.length) {
        L.push("Already revealed before (don't repeat needlessly, only if it makes sense):");
        anteriores.forEach((f) => L.push(`- ${f.falaLeiga}`));
      }
    } else {
      L.push('INFORMATION ALLOWED NOW: no new facts. Answer the latest question using already revealed facts when relevant. If the record has no answer, say that you cannot provide that detail. Do not claim a test was or was not done unless a fact says so. Do not repeat your medicine request as a stock reply.');
      knowledge.recent(8).forEach((f) => L.push(`- Already revealed: ${f.falaLeiga}`));
    }
    L.push('LANGUAGE: reply ONLY in English — never a single Portuguese word.');
  } else {
    L.push(`Você é ${p.nome}, ${p.idade} anos. ${p.resumo}.`);
    L.push(`CENÁRIO: você está no balcão de uma farmácia e quer comprar ${caso.pedido}.`);
    L.push(`Você já disse ao chegar: "${caso.abertura}"`);
    pushReferenceDocument(L, caso, 'pt');
    L.push('REGRAS (obedeça rigorosamente):');
    L.push('- Responda em 1 a 3 frases naturais, em português popular do Brasil, sem jargão médico.');
    L.push('- Reaja à pergunta mais recente do farmacêutico com suas próprias palavras. Varie as frases e a estrutura; não pareça um roteiro nem repita uma fala pronta.');
    L.push('- Use APENAS as informações permitidas abaixo. NUNCA invente sintomas, números ou fatos.');
    L.push('- Nunca se autodiagnostique, nunca sugira remédios, nunca mencione "infarto" ou doenças.');
    L.push('- Lembre o que veio comprar, mas não repita o pedido se isso não combinar com a conversa.');
    L.push('- Se pedirem uma decisão ou orientação, responda como paciente, com suas palavras, e deixe a orientação clínica para o farmacêutico.');
    if (evasivas.length) {
      L.push(`NESTE TURNO você ainda não quer contar o detalhe. Desvie com naturalidade, mantendo a intenção deste exemplo, mas usando outras palavras: "${evasivas[0].falaEvasiva}"`);
    } else if (novos.length) {
      L.push('INFORMAÇÕES PERMITIDAS AGORA (incorpore com naturalidade):');
      novos.forEach((f) => L.push(`- ${f.falaLeiga}`));
      const anteriores = knowledge.recent(4, novos);
      if (anteriores.length) {
        L.push('Já revelado antes (não repita à toa, só se fizer sentido):');
        anteriores.forEach((f) => L.push(`- ${f.falaLeiga}`));
      }
    } else {
      L.push('INFORMAÇÕES PERMITIDAS AGORA: nenhum fato novo. Responda à pergunta mais recente usando fatos já revelados quando forem pertinentes. Se o caso não trouxer a resposta, diga que não tem esse detalhe para informar. Não afirme que fez ou deixou de fazer um exame sem um fato que o confirme. Não repita o pedido de medicamento como fala pronta.');
      knowledge.recent(8).forEach((f) => L.push(`- Já revelado: ${f.falaLeiga}`));
    }
    L.push('IDIOMA: responda APENAS em português do Brasil.');
  }
  return L.join('\n');
}

// Voz determinística (fallback offline). falaLeiga é a fonte única dos tiers.
export function templateReply(caso, knowledge, novos, evasivas, question = '') {
  if (caso?.id === 'carla_dengue') {
    const q = norm(question);
    if (/\b(vacin|imuniz)/.test(q) && /\bdengue\b/.test(q)) {
      return getLang() === 'en'
        ? "I don't know whether I've had a dengue vaccine."
        : 'Não sei dizer se tomei a vacina contra a dengue.';
    }
    if (/\b(articulac|junta|joint)/.test(q)) {
      return getLang() === 'en'
        ? 'My arms and legs ache, but I cannot tell whether the pain is in the joints.'
        : 'Meus braços e pernas doem, mas não sei dizer se a dor é nas articulações.';
    }
  }
  if (caso?.id === 'carla_dengue') {
    const factsBySign = {
      dor_abdominal: 'dor_abdominal_neg',
      vomitos: 'vomitos_persistentes_neg',
      sangramento: 'sangramento_neg',
      hipotensao_postural: 'hipotensao_postural_neg',
    };
    const wanted = new Set(warningSignsFromQuestion(question).map((sign) => factsBySign[sign]).filter(Boolean));
    if (wanted.size) {
      const facts = new Map();
      [...novos, ...(knowledge.revealed instanceof Map ? knowledge.revealed.values() : [])]
        .forEach((fact) => { if (!facts.has(fact.tag)) facts.set(fact.tag, fact); });
      const answers = [...facts.values()].filter((fact) => wanted.has(fact.tag));
      if (answers.length) return answers.map((fact) => fact.falaLeiga).join(' ');
    }
  }
  if (caso?.undocumentedWarningSigns && warningSignsFromQuestion(question).length) {
    const en = getLang() === 'en';
    const known = novos.map((f) => f.falaLeiga).join(' ');
    return `${known}${known ? ' ' : ''}${en
      ? 'I cannot confirm that detail from the information available here.'
      : 'Não consigo confirmar esse detalhe com as informações que tenho aqui.'}`;
  }
  if (evasivas.length) return evasivas[0].falaEvasiva;
  if (novos.length) return novos.map((f) => f.falaLeiga).join(' ');
  const q = norm(question);
  const en = getLang() === 'en';
  if (isExamQuestion(q)) {
    return en ? "I don't have a test result to tell you about right now." : 'Não tenho um resultado de exame para te informar agora.';
  }
  const domains = classify(question);
  const related = knowledge.revealed instanceof Map
    ? [...knowledge.revealed.values()].filter((fact) => domains.includes(fact.dominio))
    : [];
  if (related.length) return related.map((fact) => fact.falaLeiga).join(' ');
  // Pergunta fora de qualquer domínio investigado (ou ausente): a paciente
  // desvia com a própria fala fora de domínio, em vez de texto genérico.
  if (!domains.length && caso?.persona?.falaForaDominio) return caso.persona.falaForaDominio;
  return en
    ? "I don't have more detail about that. I can tell you what I'm feeling."
    : 'Não tenho mais detalhes sobre isso. Posso contar o que estou sentindo.';
}

export function isExamQuestion(question) {
  return /\b(exame|exames|teste|testes|influenza|covid|laboratorio|hemograma|swab|exam|tests?|lab|blood work)\b/.test(norm(question));
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
  const doc = casoDocumento(caso.id, en ? 'en' : 'pt');
  const referencias = doc
    ? `${en
      ? 'CASE REFERENCE DOCUMENT (ground truth for this case):\n'
      : 'DOCUMENTO DE REFERÊNCIA DO CASO (base de verdade deste caso):\n'}${doc}\n`
    : '';
  return [
    { role: 'system', content: `${system}\n${referencias}`.trim() },
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
