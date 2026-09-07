// Prompt do ATOR (paciente): pequeno, FAT-GATED — só entra o que o motor liberou.
export function buildActorSystemPrompt(caso, knowledge, novos, evasivas) {
  const p = caso.persona;
  const L = [];
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
  return L.join('\n');
}

// Voz determinística (fallback offline). falaLeiga é a fonte única dos tiers.
export function templateReply(caso, knowledge, novos, evasivas) {
  if (evasivas.length) return evasivas[0].falaEvasiva;
  if (novos.length) return novos.map((f) => f.falaLeiga).join(' ');
  if (knowledge.turnsWithoutNews >= 2) return caso.persona.falaRepetida;
  return caso.persona.falaForaDominio;
}

// PRECEPTOR (best-effort): recebe a nota JÁ COMPUTADA e humaniza o relatório.
export function buildEvaluatorMessages(caso, decisao, result, logText) {
  return [
    { role: 'system', content:
`Você é um preceptor de farmácia clínica, tom calmo e construtivo. Recebe o RESULTADO JÁ COMPUTADO
de uma simulação e escreve o feedback em português do Brasil (máx. 180 palavras, 3 blocos):
1) o que o aluno fez bem (máx. 3 pontos); 2) o que faltou investigar; 3) recomendação prática.
Regras: NUNCA recalcule ou questione a nota; não prescreva doses; linguagem respeitosa.` },
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