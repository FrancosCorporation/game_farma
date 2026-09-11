import './styles.css';
import { createScene } from './scene/scene.js';
import { createPOV } from './scene/pov.js';
import { buildPharmacy } from './scene/pharmacy.js';
import { PatientAvatar, loadGLBFPatient } from './scene/patient.js';
import { Game } from './core/game.js';
import { createProgressStore, PHASES } from './core/progression.js';
import { TTS } from './audio/tts.js';
import { SFX } from './audio/sfx.js';
import { LLMClient, loadLLMConfig, saveLLMConfig } from './ai/llm.js';
import { initI18n } from './ui/i18n.js';
import { initCapa } from './ui/capa.js';
import { initAtendimento } from './ui/atendimento.js';
import { CASES } from './data/cases.js';

const $ = (id) => document.getElementById(id);

// Palco 3D + farmácia procedural (+ renderer p/ ambiente PBR)
const api = createScene($('scene3d'));
buildPharmacy(api.scene, api.addTicker, api.renderer);

// F2 — POV por pontos de interesse (paciente · computador/bulário · mesa/TLAC)
const pov = createPOV({
  camera: api.camera,
  addTicker: api.addTicker,
  canvas: $('scene3d'),
  povControl: api.povControl,
});

// Progresso + jogo (game precisa existir antes do avatar, que referencia game.avatar)
const progress = createProgressStore();
let avatar = null;
const game = new Game({ avatar: null, cases: CASES, fx: api.fx, progress });
game.phases = PHASES;

// NPC: avatar realista (paciente_real.glb — Eric Rigged, CC-BY) é o padrão.
// Por caso, troca para models/<caseId>.glb; se falhar, mantém o atual.
const avatarCache = new Map();
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);

async function mountAvatar(model) {
  if (avatar === model) return model;
  try { await withTimeout(avatar?.leave?.() ?? Promise.resolve(), 4000); } catch { /* segue */ }
  avatar = model;
  game.avatar = model;
  try { await withTimeout(model.enter?.(game.case?.persona?.aparencia) ?? Promise.resolve(), 6000); } catch { /* segue */ }
  return model;
}

// boot: sobe o paciente realista imediatamente (não espera o primeiro caso)
try {
  const initial = await loadGLBFPatient('models/paciente_real.glb', api.scene);
  avatarCache.set('paciente_real', initial);
  avatar = initial; game.avatar = initial;
  api.addTicker((dt, t) => initial.update(dt, t));
} catch {
  avatar = new PatientAvatar(api.scene);
  game.avatar = avatar;
  api.addTicker((dt, t) => avatar.update(dt, t));
}

async function swapAvatar(caseId) {
  if (!caseId) return;
  if (avatarCache.has(caseId)) return mountAvatar(avatarCache.get(caseId));
  try {
    const m = await loadGLBFPatient(`models/${caseId}.glb`, api.scene);
    avatarCache.set(caseId, m);
    api.addTicker((dt, t) => m.update(dt, t));
    return mountAvatar(m);
  } catch {
    return; // caso sem GLB próprio → mantém o realista atual
  }
}
const startCaseBase = game.startCase.bind(game);
game.startCase = async function (caseDef, opts) {
  await swapAvatar(caseDef?.id);
  return startCaseBase(caseDef, opts);
};

TTS.init();

// F0 — i18n do shell + tela de capa (antes de qualquer fluxo do jogo)
initI18n();
initCapa();

// F2/F3/F4 — HUD de pontos de interesse (bulario/TLAC/DSF) acoplado às fases do atendimento
const atendimento = initAtendimento({ game, pov });
const setFaseBase = game.setFase.bind(game);
game.setFase = (f) => {
  setFaseBase(f);
  atendimento.setAtendimento(f === 'Anamnese' || f === 'Decisão');
};

// Config do servidor de IA (persistida em localStorage)
const saved = loadLLMConfig();
$('cfg-endpoint').value = saved.baseUrl || '';
$('cfg-model').value = saved.model || '';

const readCfg = () => ({
  baseUrl: $('cfg-endpoint').value.trim() || undefined,
  model: $('cfg-model').value.trim() || undefined,
});

$('btn-testar').addEventListener('click', async () => {
  saveLLMConfig(readCfg());
  $('cfg-status').textContent = 'Testando…';
  const c = new LLMClient(loadLLMConfig());
  $('cfg-status').textContent = (await c.probe())
    ? 'Conectado ✓'
    : 'Sem resposta — o jogo rodará no modo plantão (determinístico)';
});

game.renderPhases();

// Hook de depuração/QA (smoke Playwright): acesso ao game e ao controlador POV
window.__farmacheck = { game, pov };

$('btn-iniciar').addEventListener('click', () => {
  SFX.ensure();
  saveLLMConfig(readCfg());
  game.llm = new LLMClient(loadLLMConfig());
  game.llm.probe();
  $('menu').hidden = true;
  game.setPhase(0);
  game.nextPatient();
});
