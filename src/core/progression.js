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

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch { return {}; }
}

function saveProgress(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* sem storage */ }
}

// progress = { pontos, ultimaFase, porFase: { faseId: { feitos: [casoId], estrelas: { casoId: n } } }, porCaso: { casoId: melhorNota } }
export function createProgressStore() {
  let state = loadProgress();
  if (!state.porFase) state.porFase = {};
  if (!state.porCaso) state.porCaso = {};

  function save() { saveProgress(state); }

  function unlockLevel() {
    let unlocked = 1;
    for (let i = 0; i < PHASES.length - 1; i++) {
      if ((state.pontos || 0) >= PHASES[i].minNota) unlocked = i + 1;
    }
    return unlocked;
  }

  function registerResult({ faseId, casoId, nota, stars }) {
    const pts = Math.round(nota);
    state.pontos = (state.pontos || 0) + pts;
    state.ultimaFase = faseId;
    const fase = (state.porFase[faseId] ||= { feitos: [], estrelas: {} });
    if (casoId) {
      if (!fase.feitos.includes(casoId)) fase.feitos.push(casoId);
      fase.estrelas[casoId] = Math.max(fase.estrelas[casoId] || 0, stars);
      state.porCaso[casoId] = Math.max(state.porCaso[casoId] || 0, nota);
    }
    save();
    return state;
  }

  function reset() {
    state = { porFase: {}, porCaso: {} };
    save();
  }

  return {
    get state() { return state; },
    unlockLevel,
    registerResult,
    reset,
    isLocked(faseIndex) {
      return faseIndex < PHASES.length - 1 && faseIndex > unlockLevel();
    },
  };
}