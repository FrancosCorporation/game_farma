import './styles.css';
import { createScene } from './scene/scene.js';
import { buildPharmacy } from './scene/pharmacy.js';
import { PatientAvatar } from './scene/patient.js';
import { Game } from './core/game.js';
import { createProgressStore, PHASES } from './core/progression.js';
import { TTS } from './audio/tts.js';
import { SFX } from './audio/sfx.js';
import { LLMClient, loadLLMConfig, saveLLMConfig } from './ai/llm.js';
import { CASES } from './data/cases.js';

const $ = (id) => document.getElementById(id);

// Palco 3D + farmácia procedural + NPC
const api = createScene($('scene3d'));
buildPharmacy(api.scene, api.addTicker);
const avatar = new PatientAvatar(api.scene);
api.addTicker((dt, t) => avatar.update(dt, t));

TTS.init();
const progress = createProgressStore();
const game = new Game({ avatar, cases: CASES, fx: api.fx, progress });
game.phases = PHASES;

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

$('btn-iniciar').addEventListener('click', () => {
  SFX.ensure();
  saveLLMConfig(readCfg());
  game.llm = new LLMClient(loadLLMConfig());
  game.llm.probe();
  $('menu').hidden = true;
  game.setPhase(0);
  game.nextPatient();
});