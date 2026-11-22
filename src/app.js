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
import { touchCachedAvatar, trimAvatarCache } from './scene/avatarLifecycle.js';
import { Game } from './core/game.js';
import { loadCaseServiceConfig, saveCaseServiceConfig } from './core/caseService.js';
import { createProgressStore, PHASES } from './core/progression.js';
import { TTS } from './audio/tts.js';
import { SFX } from './audio/sfx.js';
import { LLMClient, loadLLMConfig, saveLLMConfig } from './ai/llm.js';
import { initAtendimento } from './ui/atendimento.js';
import { t, getLang } from './ui/i18n.js';
import { CASE_INDEX, ACTIVE_CASES } from './data/cases.js';
import { BOOT_MODEL, REVIEW_CANDIDATE_MODELS, modelForCaseId } from './data/patientAssets.js';

const $ = (id) => document.getElementById(id);

export function startApp() {
  // Palco 3D + farmácia procedural (+ renderer p/ ambiente PBR)
  const api = createScene($('scene3d'));
  const pharmacy = buildPharmacy(api.scene, api.addTicker, api.renderer);
  api.refreshQuality();
  const qualitySelect = $('cfg-quality');
  if (qualitySelect) {
    qualitySelect.value = api.selectedQuality;
    qualitySelect.addEventListener('change', () => api.setQuality(qualitySelect.value));
  }

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
  const game = new Game({ avatar: null, cases: ACTIVE_CASES, fx: api.fx, progress });
  game.phases = PHASES;
  const AVATAR_CACHE_LIMIT = 2; // Avatar ativo + o último usado, para trocas comuns.
  const avatarCache = new Map();
  const trimCachedAvatars = (protectedIds = []) => trimAvatarCache(
    avatarCache,
    AVATAR_CACHE_LIMIT,
    protectedIds,
    (model, modelId) => {
      try { model?.dispose?.(); }
      catch (e) { console.error(`[avatar] dispose ${modelId}`, e); }
    },
  );
  // Instâncias em cache permanecem carregadas, mas apenas a identidade montada
  // recebe update por frame; evita ticker e animação permanentes por paciente.
  api.addTicker((dt, t) => avatar?.update(dt, t));

  // NPC: só GLB. Sem avatar procedural e sem fallback silencioso — falha de
  // load/parse loga erro e propaga (para corrigir o asset/URL).
  async function mountAvatar(model) {
    // scoreCase() deixa a saída cosmética rodando enquanto o relatório aparece.
    // Ao trocar/repetir rapidamente, finalize essa caminhada sem esperar o ticker
    // do avatar antigo (que deixará de receber updates após a troca).
    avatar?.cancelMotion?.({ hide: true });
    if (avatar === model) return model;
    avatar = model;
    game.avatar = model;
    trimCachedAvatars([model.modelId].filter(Boolean));
    return model;
  }

  const emAtendimento = () => ['CHEGADA', 'ANAMNESE', 'DECISAO'].includes(game.state);

  // Candidatos animados são ligados ao caso no build deste checkout para QA
  // normal de ponta a ponta. O container de produção não muda até deploy.
  const candidateReviewMode = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('candidateReview') === '1';
  const candidateReviewCaseId = candidateReviewMode
    ? new URLSearchParams(window.location.search).get('candidateCase')
    : null;
  const modeloDoCaso = (caseId) => modelForCaseId(caseId, {
    includeReviewCandidates: candidateReviewMode,
  });

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

  // Cache compartilhado por modelo; somente a identidade do caso é montada.
  // Pacientes procedurais e meshes TRELLIS/estáticos foram removidos; SEM
  // fallback procedural: falha de load/parse propaga.
  const carregando = new Map(); // modelId → Promise<avatar>

  function preloadAvatar(caseId) {
    const modelId = modeloDoCaso(caseId);
    if (!modelId) return Promise.resolve(null);
    const cached = touchCachedAvatar(avatarCache, modelId);
    if (cached) return Promise.resolve(cached);
    if (carregando.has(modelId)) return carregando.get(modelId);
    const version = modelId === BOOT_MODEL ? '44' : '1';
    const p = loadGLBWithRetry(`models/${modelId}.glb?v=${version}`, api.scene)
      .then((m) => {
        m.modelId = modelId;
        avatarCache.set(modelId, m);
        trimCachedAvatars([avatar?.modelId, modelId].filter(Boolean));
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
      // O ticker único acompanha a referência `avatar`; não registrar por instância.
      if (!emAtendimento()) await mountAvatar(inicial);
    } catch (e) {
      console.error(`[boot] FALHA ao montar ${BOOT_MODEL}.glb — sem avatar em cena`, e);
    }
  })();

  const startCaseBase = game.startCase.bind(game);
  let failedAvatarCase = null;
  game.startCase = async function (caseDef, opts) {
    pharmacy.setCase(caseDef, getLang() === 'en');
    try {
      const modelo = await preloadAvatar(caseDef?.id);
      if (modelo) await mountAvatar(modelo);
    } catch (e) {
      // Falha explícita; não iniciar um caso usando a identidade do avatar anterior.
      console.error(`[startCase] GLB do caso falhou (${caseDef?.id}):`, e);
      game.lastAvatarError = String(e?.message || e);
      failedAvatarCase = { caseDef, opts, phaseIdx: game.phaseIdx };
      $('patient-load-error').hidden = false;
      $('menu').hidden = false;
      return; // Retry the same case instead of attending with another person's mesh.
    }
    failedAvatarCase = null;
    game.lastAvatarError = null;
    $('patient-load-error').hidden = true;
    return startCaseBase(caseDef, opts);
  };

  TTS.init();
  game.updateTtsButton();
  const soundVolume = $('cfg-sfx-volume');
  if (soundVolume) {
    soundVolume.value = String(Math.round(SFX.volume * 100));
    soundVolume.addEventListener('input', () => SFX.setVolume(Number(soundVolume.value) / 100));
  }

  // F2/F3/F4 — HUD de pontos de interesse (bulario/TLAC/DSF) acoplado às fases do atendimento
  const atendimento = initAtendimento({ game, pov, camera: api.camera, pharmacy });
  const setFaseBase = game.setFase.bind(game);
  game.setFase = (f) => {
    setFaseBase(f);
    atendimento.setAtendimento(f === 'anamnese' || f === 'decisao');
  };

  // Config do servidor de IA (persistida em localStorage)
  // Mostra só a personalização salva; campos vazios usam o servidor do jogo.
  const savedRaw = (() => { try { return JSON.parse(localStorage.getItem('farmacheck:llm')) || {}; } catch { return {}; } })();
  const oldDefault = savedRaw.baseUrl === 'http://127.0.0.1:8081/v1'
    && (!savedRaw.model || savedRaw.model === 'Qwen3.5-9B-Q8_0');
  $('cfg-endpoint').value = oldDefault ? '' : (savedRaw.baseUrl || '');
  $('cfg-model').value = oldDefault ? '' : (savedRaw.model || '');
  $('cfg-endpoint').placeholder = '/api/llm/primary';
  $('cfg-model').placeholder = 'auto';
  $('cfg-case-endpoint').value = loadCaseServiceConfig().baseUrl;

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
  document.addEventListener('farmacheck:langchange', () => {
    game.refreshLangUI();
    pharmacy.setCase(game.case, getLang() === 'en');
  });

  // Hook de depuração/QA (smoke Playwright): acesso ao game, ao POV e à câmera
  const qaHooks = {
    game, pov, pharmacy, camera: api.camera, scene: api.scene, renderer: api.renderer, graphics: api,
    candidateReviewMode,
  };
  if (import.meta.env.DEV) {
    qaHooks.avatarCacheStats = () => ({ size: avatarCache.size, modelIds: [...avatarCache.keys()] });
  }
  window.__farmacheck = qaHooks;

  $('btn-iniciar').addEventListener('click', () => {
    SFX.ensure();
    saveLLMConfig(readCfg());
    saveCaseServiceConfig({ baseUrl: $('cfg-case-endpoint').value.trim() });
    game.llm = new LLMClient(loadLLMConfig());
    // O servidor do jogo faz a ponte para o llama.cpp. Configurações salvas
    // continuam podendo substituir endpoint/modelo quando necessário.
    game.llm.primaryEnabled = true;
    game.llm.fallbackEnabled = true;
    game.llm.probe();
    $('menu').hidden = true;
    $('patient-load-error').hidden = true;
    if (failedAvatarCase && failedAvatarCase.phaseIdx === game.phaseIdx) {
      const { caseDef, opts } = failedAvatarCase;
      game.startCase(caseDef, opts);
      return;
    }
    failedAvatarCase = null;
    if (candidateReviewCaseId && Object.hasOwn(REVIEW_CANDIDATE_MODELS, candidateReviewCaseId)) {
      // Revisão de candidato consulta o catálogo completo (CASE_INDEX): os outros 13
      // modelos saem do fluxo jogável mas continuam inspecionáveis pelo link de revisão.
      const candidateCase = CASE_INDEX.get(candidateReviewCaseId);
      if (candidateCase) {
        const phaseIndex = PHASES.findIndex((phase) => phase.casos?.includes(candidateReviewCaseId));
        if (phaseIndex >= 0) game.setPhase(phaseIndex);
        game.startCase(candidateCase, { focusAfterArrival: true });
        return;
      }
    }
    // honra a fase escolhida no menu (antes forçava sempre a 0 — e a última
    // fase jogada, guardada em progress.ultimaFase, era perdida)
    game.setPhase(Math.max(0, game.phaseIdx));
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
