// Progressão: fases, estrelas, rank e persistência (localStorage).
const LS_KEY = 'farmacheck:progress';

export const PHASES = [
  {
    id: 'aprendiz',
    nome: 'Aprendiz de Balcão',
    desc: 'Três clientes simples para aprender o core loop. Sem red flags críticas.',
    icone: '①',
    pacientes: 3,
    minNota: 0,
    casos: ['marina_amoxicilina', 'jose_gripe', 'ana_coriza'],
  },
  {
    id: 'plantao',
    nome: 'Plantão da Tarde',
    desc: 'Casos mistos com armadilhas de venda e primeiros sinais de alerta.',
    icone: '②',
    pacientes: 5,
    minNota: 50,
    casos: ['clara_cefaleia', 'paulo_dor_lombar', 'marina_amoxicilina', 'nelson_infarto', 'joao_queimacao'],
  },
  {
    id: 'emergencia',
    nome: 'Emergência Silenciosa',
    desc: 'Condições graves ocultas. Investigue fundo antes de vender qualquer coisa.',
    icone: '③',
    pacientes: 5,
    minNota: 70,
    casos: ['nelson_infarto', 'helena_avc', 'dona_rosa_hipotensao', 'carlos_asma', 'bia_apendicite'],
  },
  {
    id: 'livre',
    nome: 'Expediente Livre',
    desc: 'Pacientes infinitos randomizados pela IA (llama.cpp). Pontos acumulam sem fim.',
    icone: '∞',
    pacientes: Infinity,
    minNota: 0,
    casos: null,
  },
];

export const RANKS = [
  { nome: 'Bronze', min: 0 },
  { nome: 'Prata', min: 250 },
  { nome: 'Ouro', min: 500 },
  { nome: 'Diamante', min: 900 },
];

export function rankForPoints(points) {
  let r = RANKS[0];
  for (const rank of RANKS) if (points >= rank.min) r = rank;
  return r;
}

// ---------- Dinâmica de plantão: combo + rank ----------
// Nota mínima para o atendimento "segurar" o combo (abaixo disso ou reprovado,
// o combo zera). O multiplicador premia consistência: +10% por caso segurado,
// teto ×2,0 (10 casos).
export const COMBO_MIN_NOTA = 70;

export function comboMultiplier(combo) {
  const c = Math.min(Math.max(0, Math.floor(combo || 0)), 10);
  return 1 + 0.1 * c;
}

/** Progresso até o próximo rank (para a barra do menu). */
export function rankInfo(points) {
  const pts = Math.max(0, Math.round(points || 0));
  const atual = rankForPoints(pts);
  const proximo = RANKS.find((r) => r.min > pts) || null;
  if (!proximo) return { atual: atual.nome, proximo: null, faltam: 0, pct: 1 };
  const base = atual.min;
  const pct = Math.max(0, Math.min(1, (pts - base) / Math.max(1, proximo.min - base)));
  return { atual: atual.nome, proximo: proximo.nome, faltam: proximo.min - pts, pct };
}

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch { return {}; }
}

function saveProgress(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* sem storage */ }
}

// progress = { pontos, ultimaFase, porFase: { faseId: { feitos: [casoId], estrelas: { casoId: n } } },
//              porCaso: { casoId: melhorNota }, combo, semReprovar, tresEstrelas,
//              badges: { id: ts }, historico: [{ casoId, nota, stars, faseId, t }] }
export function createProgressStore() {
  let state = loadProgress();
  if (!state.porFase) state.porFase = {};
  if (!state.porCaso) state.porCaso = {};
  // Dinâmica de plantão (combo/conquistas) — defaults p/ saves antigos
  if (!Number.isFinite(state.combo)) state.combo = 0;
  if (!Number.isFinite(state.semReprovar)) state.semReprovar = 0;
  if (!Number.isFinite(state.tresEstrelas)) state.tresEstrelas = 0;
  if (!state.badges || typeof state.badges !== 'object') state.badges = {};
  if (!Array.isArray(state.historico)) state.historico = [];

  function save() { saveProgress(state); }

  function unlockLevel() {
    let unlocked = 1;
    for (let i = 0; i < PHASES.length - 1; i++) {
      if ((state.pontos || 0) >= PHASES[i].minNota) unlocked = i + 1;
    }
    return unlocked;
  }

  /** Contexto PÓS-caso sem mutar o save (para avaliar conquistas no debrief). */
  function previewAfter({ nota = 0, stars = 0, reprovado = false } = {}) {
    const bom = nota >= COMBO_MIN_NOTA && !reprovado;
    return {
      combo: bom ? (state.combo || 0) + 1 : 0,
      semReprovar: reprovado ? 0 : (state.semReprovar || 0) + 1,
      tresEstrelas: stars >= 3 ? (state.tresEstrelas || 0) + 1 : 0,
      totalCasos: (state.historico || []).length + 1,
    };
  }

  /**
   * Registra o atendimento: pontos = nota × multiplicador do combo ATÉ AQUI
   * (o combo do próprio caso premia o próximo atendimento). `badges` = ids
   * recém-conquistados (avaliados com previewAfter — ver achievements.js).
   */
  function registerResult({ faseId, casoId, nota, stars, reprovado = false, badges = [] }) {
    const mult = comboMultiplier(state.combo);
    const ganhos = Math.round(nota * mult);
    state.pontos = (state.pontos || 0) + ganhos;
    state.ultimaFase = faseId;
    const fase = (state.porFase[faseId] ||= { feitos: [], estrelas: {} });
    if (casoId) {
      if (!fase.feitos.includes(casoId)) fase.feitos.push(casoId);
      fase.estrelas[casoId] = Math.max(fase.estrelas[casoId] || 0, stars);
      state.porCaso[casoId] = Math.max(state.porCaso[casoId] || 0, nota);
    }
    const post = previewAfter({ nota, stars, reprovado });
    const comboQuebrou = (state.combo || 0) > 0 && post.combo === 0;
    state.combo = post.combo;
    state.semReprovar = post.semReprovar;
    state.tresEstrelas = post.tresEstrelas;
    state.historico.push({ casoId, nota, stars, faseId, t: Date.now() });
    if (state.historico.length > 40) state.historico = state.historico.slice(-40);

    const novas = [];
    for (const id of badges) {
      if (state.badges[id]) continue;
      state.badges[id] = Date.now();
      novas.push(id);
    }
    save();
    return {
      pontos: state.pontos, ganhos, mult, combo: state.combo, comboQuebrou,
      novasBadges: novas, badges: state.badges, stars, fase: faseId, casoId,
    };
  }

  function reset() {
    state = { porFase: {}, porCaso: {}, combo: 0, semReprovar: 0, tresEstrelas: 0, badges: {}, historico: [] };
    save();
  }

  return {
    get state() { return state; },
    unlockLevel,
    previewAfter,
    registerResult,
    reset,
    unlockedBadges() { return Object.keys(state.badges || {}); },
    isLocked(faseIndex) {
      return faseIndex < PHASES.length - 1 && faseIndex > unlockLevel();
    },
  };
}