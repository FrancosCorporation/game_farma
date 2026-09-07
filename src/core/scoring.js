const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function heuristicaComunicacao(history, caso) {
  const all = history.map((m) => norm(m.content)).join(' ');
  let pts = 3;
  if (/(bom dia|boa tarde|boa noite|ola|oi )/.test(all)) pts++;
  const nome = norm(caso.persona.nome).split(' ').find((w) => w.length > 3);
  if (nome && all.includes(nome)) pts++;
  return Math.min(5, pts);
}

// Nota determinística 0–100. Erro crítico → cap 50.
export function scoreCase(caso, knowledge, decisao, history) {
  const asked = [...knowledge.askedDomains];
  const miss = (list) => list.filter((d) => !asked.includes(d));
  const missedDomains = miss(caso.checklistDominios);
  const missedRed = miss(caso.redFlagDominios);

  const anamnese = Math.round(35 * (1 - missedDomains.length / Math.max(1, caso.checklistDominios.length)));
  const redflags = Math.round(20 * (1 - missedRed.length / Math.max(1, caso.redFlagDominios.length)));

  const reveladasRF = caso.fatos.filter((f) => f.redFlag && f.valor && knowledge.revealed.has(f.tag)).map((f) => f.tag);
  const apontadas = decisao.redFlags;
  let risco;
  if (!caso.temRedFlag) risco = apontadas.length === 0 ? 10 : 4;
  else {
    const acertos = reveladasRF.filter((t) => apontadas.includes(t)).length;
    const falsosPos = apontadas.filter((t) => !reveladasRF.includes(t)).length;
    risco = Math.round(10 * Math.max(0, (reveladasRF.length ? acertos / reveladasRF.length : 1) - falsosPos * 0.25));
  }

  const gab = caso.condutaGabarito;
  let conduta = 0;
  if (decisao.conduta === gab.tipo) conduta += 15;
  if (gab.tipo === 'manejo') {
    const alvo = gab.mips.length || 1;
    conduta += Math.round(15 * gab.mips.filter((m) => decisao.mips.includes(m)).length / alvo);
  } else if (decisao.conduta === gab.tipo) conduta += 15;

  const comunicacao = heuristicaComunicacao(history, caso);
  let total = anamnese + redflags + risco + conduta + comunicacao;
  const criticals = caso.errosCriticos.filter((e) => e.teste(decisao)).map((e) => e.msg);
  if (criticals.length) total = Math.min(total, 50);

  return { total, anamnese, redflags, risco, conduta, comunicacao, missedDomains, missedRed, criticals, reveladasRF };
}

// Estrelas 1–3 por caso, baseadas na nota.
export function starsForScore(score) {
  if (score >= 85) return 3;
  if (score >= 60) return 2;
  if (score >= 30) return 1;
  return 0;
}