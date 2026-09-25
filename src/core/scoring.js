import { getLang } from '../ui/i18n.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Métricas Scoring v2 (GDD) — labels exatos usados no debrief (bilíngues).
const GDD_LABELS = {
  pt: {
    queixa_principal: 'Queixa principal identificada (com duração)',
    sinais_alarme: 'Sinais de alarme investigados (contraindicações/medicamentos/alergias)',
    bulario: 'Consulta a bulário/diretrizes',
    teste_rapido: 'Teste rápido executado (quando indicado)',
    dsf: 'DSF com conduta correta',
    contraindicado: 'Dispensou item contraindicado (−100 · reprovação)',
    teste_pendente: 'Finalizou sem teste necessário (−30)',
    arbovirose: 'Não encaminhou suspeita de arbovirose ao PS (−40)',
    orientacao: 'Orientação inadequada em quadro autolimitado (−25)',
  },
  en: {
    queixa_principal: 'Chief complaint identified (with duration)',
    sinais_alarme: 'Warning signs investigated (contraindications/medications/allergies)',
    bulario: 'Package inserts/guidelines checked',
    teste_rapido: 'Rapid test performed (when indicated)',
    dsf: 'DSF with correct conduct',
    contraindicado: 'Dispensed a contraindicated item (−100 · fail)',
    teste_pendente: 'Finished without the required test (−30)',
    arbovirose: 'Did not refer suspected arboviral infection to the ER (−40)',
    orientacao: 'Inadequate guidance for a self-limiting condition (−25)',
  },
};

export function gddLabel(metrica) {
  const dict = GDD_LABELS[getLang()] || GDD_LABELS.pt;
  return dict[metrica] || metrica;
}

function heuristicaComunicacao(history, caso) {
  const all = history.map((m) => norm(m.content)).join(' ');
  let pts = 3;
  if (/(bom dia|boa tarde|boa noite|ola|oi |hello|hi |good (morning|afternoon|evening)|hey )/.test(all)) pts++;
  const nome = norm(caso.persona.nome).split(' ').find((w) => w.length > 3);
  if (nome && all.includes(nome)) pts++;
  return Math.min(5, pts);
}

// DSF do jogador cobre a conduta correta do gabarito? (match por palavras-chave, tolerante a redação)
export function dsfCorreta(caso, texto) {
  if (!caso.dsf || !texto) return false;
  const alvo = norm(caso.dsf.condutaCorreta).split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
  const unicos = [...new Set(alvo)];
  const resp = norm(texto);
  const acertos = unicos.filter((w) => resp.includes(w)).length;
  return acertos / Math.max(1, unicos.length) >= 0.7;
}

function dispensouContraindicado(caso, decisao) {
  const c = caso.contraindicado;
  if (!c || !c.item) return false;
  if (decisao.conduta === 'vender') return true; // dispensou o pedido (item contraindicado)
  return decisao.conduta === 'sugerir' && (decisao.mips || []).includes(c.item);
}

function ehArbovirose(caso) {
  const tipo = norm(caso.testeRapido?.tipo || '');
  return Boolean(caso.testeRapido?.indicado) && /dengue|zika|chikungunya|arbovir/.test(tipo);
}

function quadroAutolimitado(caso) {
  return !caso.temRedFlag && caso.condutaGabarito?.tipo === 'manejo';
}

// Nota determinística 0–100 (Scoring v2 do GDD). Mantém os campos legados
// (anamnese/redflags/risco/conduta/comunicacao/…) para consumidores existentes
// e expõe `breakdown` [{metrica, label, pontos}] para o debrief.
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
  const criticals = caso.errosCriticos.filter((e) => e.teste(decisao)).map((e) => e.msg);

  // ----- Scoring v2 (GDD) -----
  const breakdown = [];
  const add = (metrica, pontos) => breakdown.push({ metrica, label: gddLabel(metrica), pontos });

  // +20 queixa principal identificada (com duração)
  let queixa = 0;
  if (asked.includes('localizacao')) queixa += 10;
  if (asked.includes('duracao')) queixa += 10;
  add('queixa_principal', queixa);

  // +20 sinais de alarme investigados (contraindicações/medicamentos/alergias)
  const alarmeDominios = [...new Set([...(caso.redFlagDominios || []), 'medicamentos', 'alergias'])];
  const investigados = alarmeDominios.filter((d) => asked.includes(d)).length;
  add('sinais_alarme', Math.round(20 * investigados / Math.max(1, alarmeDominios.length)));

  // +10 consulta de bulário/diretrizes
  add('bulario', decisao.consultaBulario ? 10 : 0);

  // +20 teste rápido executado quando indicado
  const testeIndicado = Boolean(caso.testeRapido?.indicado);
  const testeExecutado = Boolean(decisao.testeRapido?.executado);
  add('teste_rapido', testeIndicado && testeExecutado ? 20 : 0);

  // +30 DSF com conduta correta (casos novos: texto da DSF; legados: conduta no gabarito)
  const dsfOk = caso.dsf
    ? dsfCorreta(caso, decisao.dsf) && decisao.conduta === gab.tipo
    : decisao.conduta === gab.tipo;
  add('dsf', dsfOk ? 30 : 0);

  // Penalidades
  const reprovado = dispensouContraindicado(caso, decisao);
  if (reprovado) add('contraindicado', -100);

  const testePendente = testeIndicado && !testeExecutado;
  if (testePendente) add('teste_pendente', -30);

  const arboviroseNaoEncaminhada = ehArbovirose(caso) && decisao.conduta !== 'encaminhar';
  if (arboviroseNaoEncaminhada) add('arbovirose', -40);

  const orientacaoInadequada = quadroAutolimitado(caso)
    && (decisao.conduta === 'vender' || decisao.conduta === 'encaminhar');
  if (orientacaoInadequada) add('orientacao', -25);

  const bruto = breakdown.reduce((s, m) => s + m.pontos, 0);
  let total = Math.max(0, Math.min(100, bruto));
  if (reprovado) total = 0; // reprovação imediata

  return {
    total, breakdown, reprovado,
    testeRapidoPerdido: testePendente,
    arboviroseNaoEncaminhada,
    orientacaoInadequada,
    dsfOk,
    // legados (compatibilidade com debrief/preceptor já existentes)
    anamnese, redflags, risco, conduta, comunicacao,
    missedDomains, missedRed, criticals, reveladasRF,
  };
}

// Estrelas 1–3 por caso, baseadas na nota (GDD: ≥80 / ≥60 / >0).
export function starsForScore(score) {
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  if (score > 0) return 1;
  return 0;
}