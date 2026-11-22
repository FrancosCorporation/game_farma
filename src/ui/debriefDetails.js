export function buildDebriefDetails(result, caseDef, { t, domainLabel }) {
  const details = [];
  const add = (text, className) => details.push({ text, className });

  if (result.missedDomains.length)
    add(`${t('debrief.faltaPerguntar')}${result.missedDomains.map(domainLabel).join(', ')}.`, 'text-amber-300');
  if (result.missedRed.length)
    add(`${t('debrief.alertaNaoInvestigado')}${result.missedRed.map(domainLabel).join(', ')}.`, 'text-amber-300');
  if (result.marcacoesIncorretas?.length)
    add(`${t('debrief.marcacoesIncorretas')}${result.marcacoesIncorretas.join('; ')}.`, 'text-amber-300');
  if (result.reprovado)
    add(`${t('debrief.reprovado')}${caseDef.contraindicado?.motivo || t('bulario.contraindicado')}).`, 'text-red-400 font-semibold');
  if (result.testeRapidoPerdido)
    add(`${t('debrief.testePerdidoPre')}${caseDef.testeRapido?.tipo}${t('debrief.testePerdidoPos')}`, 'text-amber-300');
  if (result.arboviroseNaoEncaminhada)
    add(t('debrief.arbovirose'), 'text-red-400');
  if (result.orientacaoInadequada)
    add(t('debrief.orientacao'), 'text-amber-300');
  if (caseDef.dsf && !result.dsfOk)
    add(t('debrief.dsf'), 'text-amber-300');
  result.criticals.forEach((critical) => add(`${t('debrief.critico')}${critical}`, 'text-red-400 font-semibold'));

  if (!result.missedDomains.length && !result.missedRed.length && !result.criticals.length
    && !result.reprovado && !result.testeRapidoPerdido && !result.arboviroseNaoEncaminhada
    && !result.orientacaoInadequada && !result.marcacoesIncorretas?.length && result.dsfOk)
    add(t('debrief.perfeito'), 'text-teal-300');

  return details;
}
