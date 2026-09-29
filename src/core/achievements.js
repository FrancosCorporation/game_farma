// Conquistas (badges) — lógica PURA (sem DOM/i18n): ids + predicados.
// A UI resolve os rótulos via i18n ('badge.<id>.nome' / 'badge.<id>.desc').
//
// Contexto recebido (montado pelo Game no debrief):
//   caso         caso localizado do atendimento
//   decisao      { conduta, mips, orient, redFlags }
//   result       saída de scoreCase() (total, breakdown, reprovado, dsfOk, …)
//   stars        1–3 estrelas do caso
//   faseId       id da fase em andamento
//   combo        combo APÓS este caso (0 quando quebrou)
//   totalCasos   casos finalizados (histórico acumulado)
//   semReprovar  casos seguidos sem dispensa de contraindicado
//   tresEstrelas casos seguidos com 3 estrelas
//
// `evaluateAchievements(ctx, jaDesbloqueadas)` devolve só as NOVAS (ordem do
// catálogo, sem repetir) — chamada com o contexto pós-caso (ver previewAfter no
// store), então combo_3/combo_5 acendem no mesmo atendimento que os atinge.

const usouBulario = (r) => (r.breakdown || []).some((m) => m.metrica === 'bulario' && m.pontos > 0);
const executouTeste = (r) => (r.breakdown || []).some((m) => m.metrica === 'teste_rapido' && m.pontos > 0);
const nota = (r) => Number(r.total || 0);

export const ACHIEVEMENTS = [
  { id: 'primeiro_dia', icone: '🎓', when: (c) => c.totalCasos >= 1 },
  { id: 'nota_maxima', icone: '🏅', when: (c) => nota(c.result) >= 95 },
  { id: 'combo3', icone: '🔥', when: (c) => c.combo >= 3 },
  { id: 'combo5', icone: '⚡', when: (c) => c.combo >= 5 },
  { id: 'sem_reprovacao', icone: '🛡️', when: (c) => c.semReprovar >= 5 },
  { id: 'tres_estrelas_seguidas', icone: '✨', when: (c) => c.tresEstrelas >= 3 },
  { id: 'detetive', icone: '🔎', when: (c) => c.result.reveladasRF.length > 0 && c.result.missedRed.length === 0 },
  { id: 'comunicador', icone: '💬', when: (c) => c.result.comunicacao >= 5 },
  { id: 'bulario_mestre', icone: '📖', when: (c) => usouBulario(c.result) && c.result.dsfOk },
  { id: 'tlac', icone: '🧪', when: (c) => executouTeste(c.result) },
  { id: 'encaminhador', icone: '🚑', when: (c) => c.decisao?.conduta === 'encaminhar' && c.caso?.condutaGabarito?.tipo === 'encaminhar' && c.result.dsfOk },
  { id: 'maratona', icone: '🕗', when: (c) => c.totalCasos >= 20 },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Medalhas recém-conquistadas (não presentes em `ja`), na ordem do catálogo. */
export function evaluateAchievements(ctx, ja = []) {
  const done = ja instanceof Set ? ja : new Set(ja || []);
  const novas = [];
  for (const a of ACHIEVEMENTS) {
    if (done.has(a.id)) continue;
    let ok = false;
    try { ok = Boolean(a.when(ctx)); } catch { ok = false; }
    if (ok) novas.push(a.id);
  }
  return novas;
}

export function achievementIcon(id) {
  return ACHIEVEMENTS.find((a) => a.id === id)?.icone || '🏅';
}
