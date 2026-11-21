export function buildTesteRapidoSystemMessage(resultado, tipo, translate) {
  const label = tipo || translate('tlac.title');
  const detail = resultado
    ? `${translate('sys.testeResultado')}${String(resultado).toUpperCase()}`
    : translate('sys.testeExecutado');

  return {
    message: `${label}: ${detail}`,
    isPositive: !!resultado && /positiv/i.test(String(resultado)),
  };
}
