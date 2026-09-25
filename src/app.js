// Bootstrap do jogo "pesado": cena 3D, farmácia, avatares, IA e regras.
//
// É carregado por import dinâmico a partir de src/main.js. Motivo: este módulo
// arrasta o three.js (~600 KB); se ele fosse importado estaticamente pela entry, o
// browser só executaria o wiring da capa/menu DEPOIS de baixar e avaliar o three —
// e o primeiro clique do jogador caía no vazio em máquina carregada.
import { createScene } from './scene/scene.js';
import { createPOV } from './scene/pov.js';
import { buildPharmacy } from './scene/pharmacy.js';
import { loadGLBFPatient } from './scene/patient.js';
import { Game } from './core/game.js';
import { createProgressStore, PHASES } from './core/progression.js';
import { TTS } from './audio/tts.js';
import { SFX } from './audio/sfx.js';
import { LLMClient, loadLLMConfig, saveLLMConfig } from './ai/llm.js';
import { initAtendimento } from './ui/atendimento.js';
import { t } from './ui/i18n.js';
import { CASES } from './data/cases.js';

const $ = (id) => document.getElementById(id);

export function startApp() {
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

  // NPC: só GLB. Sem avatar procedural e sem fallback silencioso — falha de
  // load/parse loga erro e propaga (para corrigir o asset/URL).
  const avatarCache = new Map();
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);

  async function mountAvatar(model) {
    if (avatar === model) return model;
    const visivel = avatar?.root?.visible === true;
    const sair = avatar?.leave;
    if (visivel && typeof sair === 'function') {
      try { await withTimeout(avatar.leave(), 4000); } catch (e) { console.error('[avatar] leave', e); }
    } else if (typeof sair === 'function') {
      try { Promise.resolve(avatar.leave()).catch((e) => console.error('[avatar] leave', e)); } catch (e) { console.error('[avatar] leave', e); }
    }
    avatar = model;
    game.avatar = model;
    return model;
  }

  const emAtendimento = () => ['CHEGADA', 'ANAMNESE', 'DECISAO'].includes(game.state);

  // Elenco (PO 24/09): por enquanto SOMENTE a Ana (Tencent + rig Mixamo, a
  // aprovada) atende TODOS os casos — os demais serão gerados no mesmo
  // pipeline depois e aí o mapa por caso volta a existir. Pacientes
  // procedurais e meshes TRELLIS/estáticos foram removidos; SEM fallback.
  // (deve vir ANTES do boot IIFE que usa BOOT_MODEL — TDZ)
  const BOOT_MODEL = 'ana_coriza';
  const modeloDoCaso = () => BOOT_MODEL;

  // Retry p/ GLBs (rede móvel/flaky): 3 tentativas; se falhar, ERRO (sem fallback).
  const loadGLBWithRetry = async (url, scene, tries = 3) => {
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await loadGLBFPatient(url, scene); }
      catch (e) {
        last = e;
        console.error(`[glb] tentativa ${i + 1}/${tries} falhou: ${url}`, e);
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
    console.error(`[glb] FALHA FINAL após ${tries} tentativas: ${url}`, last);
    throw last;
  };

  // (boot do avatar default fica DEPOIS de preloadAvatar — precisa do cache)

  // Elenco (PO 24/09): por enquanto SOMENTE a Ana (Tencent + rig Mixamo, a
  // aprovada) atende TODOS os casos — os demais pacientes serão gerados no
  // mesmo pipeline depois e aí o mapa por caso volta a existir.
  // Pacientes procedurais e meshes TRELLIS/estáticos foram removidos; SEM
  // fallback procedural: falha de load/parse propaga.
  const carregando = new Map(); // modelId → Promise<avatar>

  function preloadAvatar(caseId) {
    const modelId = modeloDoCaso(caseId);
    if (!modelId) return Promise.resolve(null);
    if (avatarCache.has(modelId)) return Promise.resolve(avatarCache.get(modelId));
    if (carregando.has(modelId)) return carregando.get(modelId);
    const p = loadGLBWithRetry(`models/${modelId}.glb`, api.scene)
      .then((m) => {
        avatarCache.set(modelId, m);
        api.addTicker((dt, t) => m.update(dt, t));
        return m;
      })
      .finally(() => carregando.delete(modelId));
    // Sem .catch(() => null): erro propaga para startCase logar/tratar.
    carregando.set(modelId, p);
    return p;
  }

  // Boot: paciente default (mesma instância do caso ana_coriza — via preload,
  // cache compartilhado, sem segundo download). Sem fallback — se falhar,
  // erro no console (não há o que "manter").
  (async () => {
    try {
      const inicial = await preloadAvatar(BOOT_MODEL);
      if (!inicial) throw new Error('preload nulo');
      // ticker NÃO aqui: o preloadAvatar já registra 1× por instância (registrar
      // de novo = update 2× por frame = walk/clips 2× rápidos).
      if (!emAtendimento()) await mountAvatar(inicial);
    } catch (e) {
      console.error(`[boot] FALHA ao montar ${BOOT_MODEL}.glb — sem avatar em cena`, e);
    }
  })();

  const startCaseBase = game.startCase.bind(game);
  game.startCase = async function (caseDef, opts) {
    try {
      const modelo = await preloadAvatar(caseDef?.id);
      if (modelo) await mountAvatar(modelo);
    } catch (e) {
      // Sem fallback: erro explícito. O caso ainda pode rodar sem avatar novo
      // apenas se já houver um montado; se não, o jogo loga e segue sem personagem.
      console.error(`[startCase] GLB do caso falhou (${caseDef?.id}):`, e);
      game.lastAvatarError = String(e?.message || e);
    }
    return startCaseBase(caseDef, opts);
  };

  TTS.init();

  // F2/F3/F4 — HUD de pontos de interesse (bulario/TLAC/DSF) acoplado às fases do atendimento
  const atendimento = initAtendimento({ game, pov });
  const setFaseBase = game.setFase.bind(game);
  game.setFase = (f) => {
    setFaseBase(f);
    atendimento.setAtendimento(f === 'anamnese' || f === 'decisao');
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
    $('cfg-status').textContent = t('cfg.testando');
    const c = new LLMClient(loadLLMConfig());
    $('cfg-status').textContent = (await c.probe())
      ? t('cfg.ok')
      : t('cfg.falha');
  });

  game.renderPhases();

  // Troca de idioma na capa: re-renderiza fases e rótulos dinâmicos do HUD.
  document.addEventListener('farmacheck:langchange', () => game.refreshLangUI());

  // Hook de depuração/QA (smoke Playwright): acesso ao game, ao POV e à câmera
  window.__farmacheck = { game, pov, camera: api.camera };

  $('btn-iniciar').addEventListener('click', () => {
    SFX.ensure();
    saveLLMConfig(readCfg());
    game.llm = new LLMClient(loadLLMConfig());
    game.llm.probe();
    $('menu').hidden = true;
    game.setPhase(0);
    game.nextPatient();
  });

  // Handshake com src/main.js: com TODOS os listeners do menu instalados, avisa que
  // o jogo está pronto — o aviso "Preparando o cenário…" sai e o botão habilita.
  // O carimbo de tempo é lido pelo gate de boot (scripts/qa_boot.mjs).
  document.documentElement.dataset.jogoPronto = '1';
  document.documentElement.dataset.jogoProntoMs = String(Math.round(performance.now()));
  document.dispatchEvent(new Event('farmacheck:pronto'));

  return { game, pov, camera: api.camera };
}
