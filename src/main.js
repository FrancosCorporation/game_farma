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

// NPC: começa com o avatar procedural; o GLB do caso é montado no startCase
// (swapAvatar → loadGLBFPatient com fallback em cadeia: <caseId>.glb → paciente.glb → procedural).
let avatar = new PatientAvatar(api.scene);
api.addTicker((dt, t) => avatar.update(dt, t));


TTS.init();

// F0 — i18n do shell + tela de capa (antes de qualquer fluxo do jogo)
initI18n();
initCapa();

const progress = createProgressStore();
const game = new Game({ avatar, cases: CASES, fx: api.fx, progress });
game.phases = PHASES;

// G2/G3 — elenco 3D: um .glb por caso (public/models/<caseId>.glb) com 5 clips
// (Idle/Pain/Weakness/Discomfort/Embarrassed). Fallback: paciente.glb → procedural.
// Blindado com timeout: o jogo NUNCA trava por causa de GLB (cai p/ procedural).
const avatarCache = new Map();
const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms em ${label}`)), ms)),
]);
async function mountAvatar(model) {
  try {
    await withTimeout(avatar.leave?.() ?? Promise.resolve(), 4000, 'avatar.leave');
  } catch { /* segue mesmo se a saída travar */ }
  avatar = model;
  game.avatar = model;
  try {
    await withTimeout(model.enter?.() ?? Promise.resolve(), 6000, 'avatar.enter');
  } catch { /* entra mesmo sem animação de entrada */ }
}
async function swapAvatar(caseId) {
  if (!caseId) return;
  if (avatarCache.has(caseId)) return mountAvatar(avatarCache.get(caseId));
  try {
    const m = await loadGLBFPatient(`models/${caseId}.glb`, api.scene);
    avatarCache.set(caseId, m);
    return mountAvatar(m);
  } catch {
    // caso sem GLB próprio → paciente.glb genérico → procedural atual
    if (!avatarCache.has('paciente')) {
      try {
        avatarCache.set('paciente', await loadGLBFPatient('models/paciente.glb', api.scene));
      } catch {
        return; // fica no procedural
      }
    }
    if (avatar !== avatarCache.get('paciente')) return mountAvatar(avatarCache.get('paciente'));
  }
}
const startCaseBase = game.startCase.bind(game);
game.startCase = async function (caseDef, opts) {
  await swapAvatar(caseDef?.id);
  return startCaseBase(caseDef, opts);
};


// F2/F3/F4 — HUD de pontos de interesse (bulario/TLAC/DSF) acoplado às fases do atendimento
const atendimento = initAtendimento({ game, pov });
const setFaseBase = game.setFase.bind(game);
game.setFase = (f) => {
  setFaseBase(f);
  atendimento.setAtendimento(f === 'Anamnese' || f === 'Decisão');
};
// F1 — barra visível também quando o caso abre (startCase define a fase via setFase;
// este gatilho garante a barra mesmo se a fase base отличаться)

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