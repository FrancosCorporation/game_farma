// Progressão: fases, estrelas, rank e persistência (localStorage).
const LS_KEY = 'farmacheck:progress';
export const PROGRESS_SCHEMA_VERSION = 1;

// Fases (24/10/2026): com o elenco reduzido ao caso único "Mariana" (dengue), cada
// fase fixa roda o mesmo caso; o Expediente Livre continua com catálogo/serviço.
export const PHASES = [
  {
    id: 'aprendiz',
    nome: 'Aprendiz de Balcão',
    desc: 'Atendimento guiado para aprender o core loop, com um único cliente por fase.',
    icone: '①',
    pacientes: 1,
    minNota: 0,
    casos: ['carla_dengue'],
  },
  {
    id: 'plantao',
    nome: 'Plantão da Tarde',
    desc: 'O mesmo caso: avaliar o pedido e investigar sintomas antes de dispensar.',
    icone: '②',
    pacientes: 1,
    minNota: 50,
    casos: ['carla_dengue'],
  },
  {
    id: 'emergencia',
    nome: 'Emergência Silenciosa',
    desc: 'O mesmo caso: investigar sinais de alarme antes de decidir a conduta.',
    icone: '③',
    pacientes: 1,
    minNota: 70,
    casos: ['carla_dengue'],
  },
  {
    id: 'cuidados',
    nome: 'Cuidado Integral',
    desc: 'Pratique investigação, orientação e encaminhamento no mesmo atendimento.',
    icone: '④',
    pacientes: 1,
    minNota: 120,
    casos: ['carla_dengue'],
  },
  {
    id: 'livre',
    nome: 'Expediente Livre',
    desc: 'Atendimento repetível da Mariana; o serviço opcional mantém o elenco ativo.',
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

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeInt = (value, fallback = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) ? Math.max(0, Math.min(max, value)) : fallback;

function normalizeProgress(value) {
  const saved = isRecord(value) ? value : {};
  const phaseIds = new Set(PHASES.map(({ id }) => id));
  const porFase = Object.fromEntries(Object.entries(isRecord(saved.porFase) ? saved.porFase : {})
    .filter(([id, fase]) => phaseIds.has(id) && isRecord(fase))
    .map(([id, fase]) => {
      const definition = PHASES.find(({ id: phaseId }) => phaseId === id);
      const allowedCases = definition.casos ? new Set(definition.casos) : null;
      const isValidCase = (caseId) => typeof caseId === 'string' && caseId.length > 0 &&
        (!allowedCases || allowedCases.has(caseId));
      const feitos = Array.isArray(fase.feitos)
        ? [...new Set(fase.feitos.filter(isValidCase))]
        : [];
      const completed = new Set(feitos);
      const estrelas = Object.fromEntries(Object.entries(isRecord(fase.estrelas) ? fase.estrelas : {})
        .filter(([casoId, stars]) => isValidCase(casoId) && completed.has(casoId) && Number.isFinite(stars))
        .map(([casoId, stars]) => [casoId, Math.max(0, Math.min(3, Math.floor(stars)))]));
      return [id, { feitos, estrelas }];
    }));
  const porCaso = Object.fromEntries(Object.entries(isRecord(saved.porCaso) ? saved.porCaso : {})
    .filter(([casoId, nota]) => typeof casoId === 'string' && Number.isFinite(nota) && nota >= 0 && nota <= 100));
  const badges = Object.fromEntries(Object.entries(isRecord(saved.badges) ? saved.badges : {})
    .filter(([id, timestamp]) => typeof id === 'string' && Number.isFinite(timestamp) && timestamp >= 0));
  const historico = Array.isArray(saved.historico)
    ? saved.historico.filter((item) => isRecord(item) && typeof item.casoId === 'string' &&
      phaseIds.has(item.faseId) && Number.isFinite(item.nota) && item.nota >= 0 && item.nota <= 100 &&
      Number.isFinite(item.stars) && item.stars >= 0 && item.stars <= 3 && Number.isFinite(item.t))
      .slice(-40)
    : [];

  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    pontos: safeInt(saved.pontos),
    ultimaFase: phaseIds.has(saved.ultimaFase) ? saved.ultimaFase : null,
    porFase,
    porCaso,
    combo: safeInt(saved.combo, 0, 10),
    semReprovar: safeInt(saved.semReprovar),
    tresEstrelas: safeInt(saved.tresEstrelas),
    badges,
    historico,
  };
}

function readProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    const futureVersion = isRecord(stored) && Number.isInteger(stored.schemaVersion) &&
      stored.schemaVersion > PROGRESS_SCHEMA_VERSION;
    // Versão ausente é o formato legado v0 e migra sem descartar campos válidos.
    return { state: normalizeProgress(stored), writable: !futureVersion };
  } catch { return { state: normalizeProgress(null), writable: true }; }
}

export function loadProgress() {
  return readProgress().state;
}

function saveProgress(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* sem storage */ }
}

// progress = { pontos, ultimaFase, porFase: { faseId: { feitos: [casoId], estrelas: { casoId: n } } },
//              porCaso: { casoId: melhorNota }, combo, semReprovar, tresEstrelas,
//              badges: { id: ts }, historico: [{ casoId, nota, stars, faseId, t }] }
export function createProgressStore() {
  const loaded = readProgress();
  let state = loaded.state;
  if (!state.porFase) state.porFase = {};
  if (!state.porCaso) state.porCaso = {};
  // Dinâmica de plantão (combo/conquistas) — defaults p/ saves antigos
  if (!Number.isFinite(state.combo)) state.combo = 0;
  if (!Number.isFinite(state.semReprovar)) state.semReprovar = 0;
  if (!Number.isFinite(state.tresEstrelas)) state.tresEstrelas = 0;
  if (!state.badges || typeof state.badges !== 'object') state.badges = {};
  if (!Array.isArray(state.historico)) state.historico = [];

  function save() {
    if (loaded.writable) saveProgress(state);
  }

  function unlockLevel() {
    let unlocked = 0;
    for (let i = 0; i < PHASES.length - 1; i++) {
      if ((state.pontos || 0) >= PHASES[i].minNota) unlocked = i;
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
  function registerResult({ faseId, casoId, nota, stars, reprovado = false, badges = [], practice = false }) {
    const faseExistente = state.porFase[faseId];
    const replayDeCasoConcluido = Boolean(practice && casoId && faseExistente?.feitos?.includes(casoId));
    if (replayDeCasoConcluido) {
      // Replay explícito é prática: permite atualizar recordes, mas não rende
      // pontos, combo, conquistas nem progresso/contagem da fase.
      const fase = faseExistente;
      fase.estrelas ||= {};
      fase.estrelas[casoId] = Math.max(fase.estrelas[casoId] || 0, stars);
      state.porCaso[casoId] = Math.max(state.porCaso[casoId] || 0, nota);
      save();
      return {
        pontos: state.pontos, ganhos: 0, mult: 0, combo: state.combo,
        comboQuebrou: false, novasBadges: [], badges: state.badges,
        stars, fase: faseId, casoId, practice: true,
      };
    }

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
      novasBadges: novas, badges: state.badges, stars, fase: faseId, casoId, practice: false,
    };
  }

  function reset() {
    state = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      pontos: 0,
      ultimaFase: null,
      porFase: {},
      porCaso: {},
      combo: 0,
      semReprovar: 0,
      tresEstrelas: 0,
      badges: {},
      historico: [],
    };
    loaded.writable = true;
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
