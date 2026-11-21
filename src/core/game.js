import { classify, KnowledgeState, warningSignsFromQuestion } from './factGate.js';
import { generatePatientReply } from '../ai/patientReply.js';
import { generatePreceptorFeedback } from '../ai/preceptorFeedback.js';
import { scoreCase, starsForScore } from './scoring.js';
import { evaluateAchievements } from './achievements.js';
import { fetchNextCase, localizeCase } from '../data/cases.js';
import { t, getLang } from '../ui/i18n.js';
import { TTS } from '../audio/tts.js';
import { SFX } from '../audio/sfx.js';
import { createDictation } from '../audio/stt.js';
import { loadCaseServiceConfig } from './caseService.js';
import { buildPhaseCaseOrder, selectNextCaseId } from './caseSelection.js';
import { containsHiddenFact } from './hiddenFactGuard.js';
import { createModalFocusSession } from '../ui/focus.js';
import { buildTesteRapidoSystemMessage } from './testeRapidoMessage.js';
import { renderQuestionChips } from '../ui/chatChips.js';
import { renderChatCoverage } from '../ui/chatCoverage.js';
import { createChatBubble, createSystemMessage } from '../ui/chatMessages.js';
import {
  appendChatTranscriptEntry,
  scrollChatTranscript,
  setChatTypingIndicator,
} from '../ui/chatTranscript.js';
import { renderComboHud } from '../ui/comboHud.js';
import { renderScoreHud } from '../ui/scoreHud.js';
import { renderPatientHeader, renderTurnCounter } from '../ui/patientHeader.js';
import { renderPhaseHud } from '../ui/phaseHud.js';
import { applyFactRevealFeedback } from '../ui/factRevealFeedback.js';
import { renderMenuMeta } from '../ui/menuMeta.js';
import { renderPhaseSelection } from '../ui/phaseSelection.js';
import { renderDecisionConfirm } from '../ui/decisionConfirm.js';
import { renderDecisionOptions } from '../ui/decisionOptions.js';
import { renderDecisionFlags } from '../ui/decisionFlags.js';
import { showAnamnesisPanel, showDecisionPanel } from '../ui/decisionPanel.js';
import { renderDebriefPanel } from '../ui/debrief.js';
import { renderShiftSummary } from '../ui/shiftSummary.js';
import { bindGameControls } from '../ui/gameControls.js';
import { bindGameKeyboardShortcuts } from '../ui/gameKeyboard.js';
import { showGameMenu } from '../ui/gameMenu.js';

const $ = (id) => document.getElementById(id);
const MAX_TURNS = 30;

export class Game {
  constructor({ avatar, cases, fx, progress }) {
    this.avatar = avatar;
    this.cases = cases;
    this.fx = fx;
    this.progress = progress;
    this.llm = null;
    this.state = 'MENU';
    this.points = progress?.state?.pontos || 0; // espelho do save (fonte da verdade)
    this.lastIdx = -1;
    this.busy = false;
    this.caseTransitionPending = false;
    this.interactionVersion = 0;
    this.conduta = null;
    this.usedChips = new Set();
    this.phaseIdx = 0;
    this.caseOrder = [];

    this.el = {};
    for (const id of ['chat-log', 'chat-input', 'chat-form', 'chat-chips', 'chat-nome', 'chat-avatar', 'chat-status',
      'chat-contador', 'chat-cobertura', 'hud-paciente', 'hud-fila', 'hud-fase', 'hud-score', 'hud-combo', 'menu-meta', 'debrief-conquistas',
      'btn-decisao', 'decision', 'redflag-list', 'mip-box', 'conduta-cards',
      'mip-list', 'orient-list', 'btn-voltar', 'btn-confirmar', 'btn-proximo', 'btn-repetir', 'btn-exportar', 'btn-fases', 'btn-zerar-progresso', 'debrief', 'debrief-stars', 'debrief-tag', 'debrief-titulo',
      'debrief-texto', 'debrief-pontos', 'debrief-breakdown', 'debrief-detalhes', 'debrief-preceptor', 'debrief-stamp',
      'plantao-modal', 'plantao-total', 'plantao-estrelas', 'plantao-bonus', 'btn-plantao-menu',
      'btn-tts', 'menu', 'phase-select'])
      this.el[id] = $(id);

    this.debriefFocus = createModalFocusSession(this.el.debrief);

    this.bind();
    this.dictation = createDictation(this.el['chat-input'], { onSubmit: () => this.onSubmit() });
    renderScoreHud(this.el['hud-score'], this.points, t);
    this.updateComboHud(); // HUD de combo já reflete o save no boot
  }

  /** Re-render dinâmico p/ troca de idioma no menu/capa (listener de langchange). */
  refreshLangUI() {
    renderScoreHud(this.el['hud-score'], this.points, t);
    this.updateComboHud();
    this.updateTtsButton();
    if (this.state === 'MENU') this.renderPhases();
  }

  updateTtsButton() {
    const button = this.el['btn-tts'];
    if (!button) return;
    const key = TTS._speaking ? 'hud.ttsStop' : TTS.enabled ? 'hud.ttsOn' : 'hud.ttsOff';
    const titleKey = TTS._speaking ? 'hud.ttsStopTitle' : TTS.enabled ? 'hud.ttsOnTitle' : 'hud.ttsOffTitle';
    button.textContent = t(key);
    button.title = t(titleKey);
    button.setAttribute?.('aria-label', t(titleKey));
    button.setAttribute?.('aria-pressed', String(TTS.enabled));
  }

  /** HUD: combo atual (× multiplicador) — escondido com combo 0. */
  updateComboHud() {
    const combo = this.progress?.state?.combo || 0;
    renderComboHud(this.el['hud-combo'], combo);
  }

  /** Painel do menu: rank + combo + conquistas (dinâmica de plantão). */
  renderMeta() {
    renderMenuMeta(this.el['menu-meta'], this.progress);
  }

  bind() {
    // Binding is safe to repeat (tests, a future view remount, or explicit
    // reinitialization): remove the previous handlers before installing them.
    this.unbind();
    this.unbindControls = bindGameControls({
      elements: this.el,
      onSubmit: () => this.onSubmit(),
      onQuestionChip: (button) => {
        this.usedChips.add(button.textContent); // chip usado some do painel (intenção do design)
        this.el['chat-input'].value = button.dataset.q;
        this.renderChips();
        this.onSubmit();
      },
      onDecision: () => this.goDecision(),
      onBackToAnamnesis: () => this.backToAnamnese(),
      onSelectDecision: (kind) => this.selectConduta(kind),
      onConfirmDecision: () => this.confirmDecision(),
      onMipChange: () => this.updateConfirm(),
      onNextPatient: () => this.nextPatient(),
      onRepeatPatient: () => this.startCase(this.case, { repeat: true, focusAfterArrival: true }),
      onExportReport: () => window.print(),
      onOpenMenu: () => this.openMenu(),
      onPlantaoMenu: () => {
        if (this.el['plantao-modal']) this.el['plantao-modal'].hidden = true;
        this.openMenu();
      },
      onResetProgress: () => {
        if (!window.confirm(t('menu.zerar.confirm'))) return;
        this.progress.reset();
        this.setPhase(0);
        this.case = null;
        this.points = 0;
        renderScoreHud(this.el['hud-score'], 0, t);
        this.updateComboHud();
        this.renderPhases();
      },
      onToggleTts: () => {
        if (TTS._speaking) {
          TTS.stop();
          return;
        }
        TTS.setEnabled(!TTS.enabled);
        this.updateTtsButton();
      },
    });
    this.unbindKeyboard = bindGameKeyboardShortcuts({
      documentTarget: document,
      getState: () => this.state,
      chatInput: this.el['chat-input'],
      getLastPatientLine: () => this.lastPatientLine,
      getPatientVoice: () => this.case?.persona.voz,
      selectDecisionByIndex: (index) => {
        const cards = [...document.querySelectorAll('#conduta-cards [data-conduta]')];
        if (!cards[index]) return false;
        cards[index].click();
        return true;
      },
      backToAnamnesis: () => this.backToAnamnese(),
      speak: (line, voice) => TTS.speak(line, voice),
    });
    this.unhookTtsSpeak = TTS.hookSpeak(() => this.updateTtsButton());
    this.updateTtsButton();
  }

  /** Remove the DOM/document listeners owned by this Game instance. */
  unbind() {
    this.unbindKeyboard?.();
    this.unbindKeyboard = null;
    this.unbindControls?.();
    this.unbindControls = null;
    this.unhookTtsSpeak?.();
    this.unhookTtsSpeak = null;
  }

  setFase(key) {
    renderPhaseHud(this.el['hud-fase'], key, t);
  }

  setDebriefVisible(visible, fallback = null) {
    if (visible) this.debriefFocus.open();
    else this.debriefFocus.close(fallback);
  }

  // ---------- fases / seleção ----------
  setPhase(idx) {
    this.phaseIdx = idx;
    const phase = this.phaseDef();
    this.caseOrder = buildPhaseCaseOrder(phase, this.cases);
    this.lastIdx = -1;
  }
  phaseDef() {
    return this.phases[this.phaseIdx] || this.phases[0];
  }
  openMenu() {
    this.interactionVersion++;
    this.busy = false;
    this.showTyping(false);
    this.dictation?.stop?.();
    TTS.stop();
    this.state = 'MENU';
    this.setDebriefVisible(false);
    showGameMenu(this.el, () => this.renderPhases());
  }
  renderPhases() {
    const box = this.el['phase-select'];
    renderPhaseSelection(box, {
      phases: this.phases,
      phaseIndex: this.phaseIdx,
      progress: this.progress,
      translate: t,
      onSelect: (index) => {
        this.phaseIdx = index;
        this.renderPhases();
        this.setPhase(index);
      },
    });
    this.renderMeta();
  }

  // ---------- ciclo de partida ----------
  async nextPatient() {
    if (this.caseTransitionPending) return false;
    this.caseTransitionPending = true;
    try {
      this.setDebriefVisible(false);
      const phase = this.phaseDef();

      // Se a fase tem número fixo de casos e já concluímos todos no turno
      if (phase.casos && phase.casos.length > 0) {
        const concluidos = this.progress?.state?.porFase?.[phase.id]?.feitos?.length || 0;
        if (this.lastIdx >= 0 && concluidos >= phase.casos.length) {
          this.mostrarFechamentoPlantao(phase);
          this.el['btn-plantao-menu']?.focus();
          return true;
        }
      }

      let c = null;
      if (phase.id === 'livre') {
        const { baseUrl } = loadCaseServiceConfig();
        if (baseUrl) c = await fetchNextCase(baseUrl);
        // O serviço opcional conhece os 14 casos do catálogo. Nesta versão,
        // somente o elenco ativo pode entrar no atendimento jogável.
        if (c && !this.cases.some((active) => active.id === c.id)) c = null;
      }
      if (!c) {
        const pool = this.caseOrder.length ? this.caseOrder : this.cases.map((x) => x.id);
        const id = selectNextCaseId({
          pool,
          // Para fases lineares (como Aprendiz/Plantão), prioriza casos ainda não feitos na fase.
          completedIds: this.progress?.state?.porFase?.[phase.id]?.feitos || [],
          previousCaseId: this.caseOrder[this.lastIdx],
        });
        this.lastIdx = pool.indexOf(id);
        c = this.cases.find((x) => x.id === id);
      } else {
        this.lastIdx = this.caseOrder.indexOf(c.id);
      }

      if (!c) return false;
      return (await this.startCase(c, { focusAfterArrival: true, transitionOwned: true })) !== false;
    } finally {
      this.caseTransitionPending = false;
    }
  }

  mostrarFechamentoPlantao(phase) {
    this.state = 'PLANTAO_CONCLUIDO';
    SFX.shiftComplete?.();
    const faseData = this.progress?.state?.porFase?.[phase.id] || { feitos: [], estrelas: {} };
    const totalFeitos = faseData.feitos.length;
    const totalEstrelas = Object.values(faseData.estrelas).reduce((a, b) => a + b, 0);

    renderShiftSummary({
      modal: this.el['plantao-modal'],
      totalElement: this.el['plantao-total'],
      starsElement: this.el['plantao-estrelas'],
      completed: totalFeitos,
      totalStars: totalEstrelas,
    });
  }

  async startCase(caseDefRaw, { repeat = false, focusAfterArrival = false, transitionOwned = false } = {}) {
    if (!caseDefRaw || (this.caseTransitionPending && !transitionOwned)) return false;
    const ownsTransition = !transitionOwned;
    if (ownsTransition) this.caseTransitionPending = true;
    try {
      return await this.enterCase(caseDefRaw, { repeat, focusAfterArrival });
    } finally {
      if (ownsTransition) this.caseTransitionPending = false;
    }
  }

  async enterCase(caseDefRaw, { repeat = false, focusAfterArrival = false } = {}) {
    this.interactionVersion++;
    this.isPracticeReplay = Boolean(repeat);
    this.dictation?.stop?.();
    TTS.stop();
    const caseDef = localizeCase(caseDefRaw, getLang());
    this.case = caseDef;
    this.state = 'CHEGADA';
    this.knowledge = new KnowledgeState(caseDef);
    this.history = [];
    this.turn = 0;
    this.busy = false;
    this.showTyping(false);
    this.conduta = null;
    this.usedChips = new Set();
    // Scoring v2 (F1): eventos por caso, expostos via registrar*() para as fases de PC/teste/DSF
    this.consultaBulario = false;
    this.testeRapido = null;   // { executado: true, resultado }
    this.dsf = null;           // texto da conduta do jogador
    this.queixaRegistrada = false;
    this.lastPatientLine = '';
    this.novaFaseLiberada = null;
    this.seed = Number.isSafeInteger(caseDef.seed) && caseDef.seed >= 0
      ? caseDef.seed
      : Math.floor(Math.random() * 1e6);

    this.setDebriefVisible(false);
    this.el.decision.hidden = true;
    this.el['btn-decisao'].hidden = true;
    this.el['chat-log'].innerHTML = '';
    this.el['chat-chips'].innerHTML = '';
    // Atualiza mostrador de fila/posição no turno
    const phase = this.phaseDef();
    renderPatientHeader(this.el, { caseDef, phase, progress: this.progress, translate: t });
    renderTurnCounter(this.el['chat-contador'], 0, MAX_TURNS);

    this.setFase('chegada');
    // O chat só aceita texto na fase Anamnese: durante a chegada (walk-in do
    // paciente) o input fica desabilitado para o jogador não digitar no vazio.
    this.el['chat-input'].disabled = true;
    SFX.chime();
    TTS.setCase(caseDef.id);

    // A chegada é cosmética: se o avatar falhar (GLB quebrado/sem clip), o
    // atendimento continua — nunca deixar o jogador travado em "Chegada".
    try {
      await this.avatar?.enter?.(caseDef.persona.aparencia);
    } catch {
      /* segue sem a caminhada de entrada */
    }
    // Se o jogador abriu o menu enquanto o avatar caminhava, não reabrir o
    // atendimento por cima da navegação que acabou de escolher.
    if (this.state !== 'CHEGADA') return false;
    this.fx.dip();
    this.state = 'ANAMNESE';
    this.setFase('anamnese');
    this.el['chat-input'].disabled = false;
    this.addBubble('paciente', caseDef.abertura);
    TTS.speak(caseDef.abertura, caseDef.persona.voz);
    this.lastPatientLine = caseDef.abertura;
    this.renderChips();
    this.renderCobertura();
    // onboarding: só no MUITO primeiro atendimento do save (histórico vazio)
    if (!(this.progress?.state?.historico || []).length) this.addSystem(t('sys.dicaOnboarding'));
    this.el['btn-decisao'].hidden = false;
    // Em ponteiro de toque, autofocus abre o teclado virtual e esconde a cena
    // no primeiro atendimento. O campo continua focável quando o jogador toca.
    if (focusAfterArrival && !matchMedia('(pointer: coarse)').matches) this.el['chat-input'].focus();
    // sem auto-focus: o jogador anda com WASD; clicar no chat foca para digitar
    return true;
  }

  renderChips() {
    renderQuestionChips(this.el['chat-chips'], this.case.chips, this.usedChips);
  }

  // ---------- turno de anamnese ----------
  /** Checklist vivo: domínios do caso já cobertos ✓ + quantos faltam (sem dizer quais). */
  renderCobertura() {
    renderChatCoverage(this.el['chat-cobertura'], this.case, this.knowledge);
  }

  addBubble(kind, text) {
    const el = createChatBubble(kind, text);
    appendChatTranscriptEntry(this.el['chat-log'], el);
    SFX.pop();
    return el;
  }
  addSystem(text, red = false) {
    appendChatTranscriptEntry(this.el['chat-log'], createSystemMessage(text, red));
  }
  scrollLog() {
    scrollChatTranscript(this.el['chat-log']);
  }
  showTyping(on) {
    setChatTypingIndicator(this.el['chat-status'], on);
  }

  async onSubmit() {
    const text = this.el['chat-input'].value.trim();
    if (!text || this.busy || this.state !== 'ANAMNESE') return;
    const interactionVersion = this.interactionVersion;
    const submittedCase = this.case;
    const isCurrentInteraction = () => this.interactionVersion === interactionVersion
      && this.case === submittedCase
      && this.state === 'ANAMNESE';
    this.el['chat-input'].value = '';
    this.addBubble('farmaceutico', text);
    this.history.push({ role: 'user', content: text });
    this.busy = true;
    this.showTyping(true);
    this.turn++;
    renderTurnCounter(this.el['chat-contador'], this.turn, MAX_TURNS);

    const domains = classify(text);
    const { novos, evasivas } = this.knowledge.ask(text, domains);
    if (this.case.undocumentedWarningSigns && warningSignsFromQuestion(text).length) {
      this.addSystem(t('sys.sinalNaoInformado'));
    }
    novos.forEach((f) => this.onFactRevealed(f));
    this.renderCobertura(); // checklist de cobertura atualizado a cada pergunta

    // Scoring v2: feedback de queixa principal identificada (localização + duração)
    const askedNow = this.knowledge.askedDomains;
    if (!this.queixaRegistrada && askedNow.has('localizacao') && askedNow.has('duracao')) {
      this.queixaRegistrada = true;
      this.addSystem(t('sys.queixaRegistrada'));
    }
    if (this.case.testeRapido?.indicado && !this.testeRapido && this.turn >= 3) {
      this.addSystem(t('sys.lembreteTeste'));
    }

    const reply = await this.generateReply(novos, evasivas, { isCurrentInteraction });
    if (!isCurrentInteraction()) {
      if (this.interactionVersion === interactionVersion && this.case === submittedCase) {
        this.showTyping(false);
        this.busy = false;
      }
      return false;
    }
    this.showTyping(false);
    this.history.push({ role: 'assistant', content: reply });
    this.lastPatientLine = reply;
    TTS.speak(reply, this.case.persona.voz);
    this.busy = false;
    if (this.turn >= MAX_TURNS) this.goDecision();
    else this.el['chat-input'].focus();
    return true;
  }

  onFactRevealed(f) {
    applyFactRevealFeedback(f, {
      avatar: this.avatar,
      fx: this.fx,
      patientName: this.case.persona.nome,
      playRedFlag: () => SFX.redFlag(),
      addSystem: (message, red = false) => this.addSystem(message, red),
      translate: t,
    });
  }

  // ---------- eventos Scoring v2 (F1) — API para as próximas fases (câmera/PC/TLAC/DSF) ----------
  registrarConsultaBulario() {
    if (this.state === 'ANAMNESE' || this.state === 'DECISAO') {
      this.consultaBulario = true;
      this.addSystem(t('sys.bulario'));
    }
  }

  registrarTesteRapido(resultado) {
    if (this.state !== 'ANAMNESE' && this.state !== 'DECISAO') return;
    this.testeRapido = { executado: true, resultado: resultado || null };
    const { message, isPositive } = buildTesteRapidoSystemMessage(
      resultado,
      this.case.testeRapido?.tipo,
      t,
    );
    this.addSystem(message, isPositive);
  }

  registrarDSF(conduta) {
    if (this.state !== 'ANAMNESE' && this.state !== 'DECISAO') return;
    this.dsf = conduta || null;
    this.addSystem(conduta ? `${t('sys.dsfCom')}${conduta}` : `${t('sys.dsfEmitida')}.`);
  }

  async generateReply(novos, evasivas, { isCurrentInteraction = () => true } = {}) {
    const live = this.addBubble('paciente', '');
    const out = await generatePatientReply({
      llm: this.llm,
      caseDef: this.case,
      knowledge: this.knowledge,
      newFacts: novos,
      evasions: evasivas,
      history: this.history,
      language: getLang(),
      isCurrentInteraction,
      isHiddenFact: (text) => containsHiddenFact(text, this.case.fatos, this.knowledge.revealed),
      onStream: (text) => {
        live.textContent = text;
        this.scrollLog();
      },
    });
    if (!isCurrentInteraction()) return '';
    live.textContent = out;
    this.scrollLog();
    return out;
  }

  // ---------- decisão ----------
  goDecision() {
    if (this.state !== 'ANAMNESE' || this.busy) return;
    this.state = 'DECISAO';
    this.setFase('decisao');
    this.conduta = null;
    showDecisionPanel({
      chatInput: this.el['chat-input'],
      chatChips: this.el['chat-chips'],
      decisionButton: this.el['btn-decisao'],
      redFlagList: this.el['redflag-list'],
      mipBox: this.el['mip-box'],
      confirmButton: this.el['btn-confirmar'],
      panel: this.el.decision,
      facts: this.case.fatos,
      revealed: this.knowledge.revealed,
      renderFlags: renderDecisionFlags,
      translate: t,
    });
  }

  backToAnamnese() {
    this.state = 'ANAMNESE';
    this.setFase('anamnese');
    showAnamnesisPanel({
      panel: this.el.decision,
      chatInput: this.el['chat-input'],
      decisionButton: this.el['btn-decisao'],
      renderChips: () => this.renderChips(),
    });
  }

  selectConduta(kind) {
    this.conduta = kind;
    document.querySelectorAll('#conduta-cards [data-conduta]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.conduta === kind))
    );
    renderDecisionOptions({
      kind,
      mipBox: this.el['mip-box'],
      mipList: this.el['mip-list'],
      orientationList: this.el['orient-list'],
      confirmButton: this.el['btn-confirmar'],
      shelf: this.case.prateleira,
      orientations: this.case.orientacoes,
      translate: t,
    });
    this.updateConfirm();
  }

  updateConfirm() {
    renderDecisionConfirm(this.el['btn-confirmar'], this.el['mip-list'], this.conduta);
  }

  async confirmDecision() {
    // Ignore stale, programmatic, or duplicate activations. The state changes
    // synchronously before scoring, so a second event cannot register twice.
    if (this.state !== 'DECISAO' || !this.conduta) return;
    this.state = 'AVALIANDO';
    this.setFase('avaliando');
    const decisao = {
      conduta: this.conduta,
      mips: [...this.el['mip-list'].querySelectorAll('input:checked')].map((i) => i.value),
      orient: [...this.el['orient-list'].querySelectorAll('input:checked')].map((i) => i.value),
      redFlags: [...this.el['redflag-list'].querySelectorAll('input:checked')].map((i) => i.value),
      // Scoring v2 (F1): eventos registrados durante o atendimento
      consultaBulario: Boolean(this.consultaBulario),
      testeRapido: this.testeRapido,
      dsf: this.dsf,
    };
    const result = scoreCase(this.case, this.knowledge, decisao, this.history);
    const stars = starsForScore(result.total);

    // Dinâmica de plantão: conquistas são avaliadas com o contexto PÓS-caso
    // (combo já incrementado quando o atendimento segura a sequência) e o
    // registro aplica o multiplicador do combo acumulado ATÉ AQUI.
    const faseId = this.phaseDef().id;
    const practiceReplay = Boolean(this.isPracticeReplay &&
      this.progress?.state?.porFase?.[faseId]?.feitos?.includes(this.case.id));
    const unlockAntes = this.progress.unlockLevel();
    const previa = practiceReplay ? null : this.progress.previewAfter({ nota: result.total, stars, reprovado: result.reprovado });
    const novasBadges = practiceReplay ? [] : evaluateAchievements({
      caso: this.case, decisao, result, stars, faseId, ...previa,
    }, this.progress.unlockedBadges());
    const registro = this.progress.registerResult({
      faseId,
      casoId: this.case.id,
      nota: result.total,
      stars,
      reprovado: result.reprovado,
      badges: novasBadges,
      practice: practiceReplay,
    });
    this.points = registro.pontos;
    renderScoreHud(this.el['hud-score'], this.points, t);
    this.updateComboHud();
    const unlockDepois = this.progress.unlockLevel();
    this.novaFaseLiberada = unlockDepois > unlockAntes ? unlockDepois : null; // destaque no debrief

    const outcome = this.case.consequencias[this.conduta];
    // O paciente saindo de cena é cosmético e não pode segurar o relatório:
    // dispara em segundo plano e engole falha de avatar/GLB.
    try {
      Promise.resolve(this.avatar?.leave?.()).catch(() => {});
    } catch {
      /* segue para o debriefing */
    }
    this.state = 'DEBRIEFING';
    this.setFase('relatorio');
    this.renderDebrief(outcome, result, stars, registro);

    // Efeitos sonoros contextuais
    if (!registro?.practice) {
      if (registro?.novasBadges?.length) {
        setTimeout(() => SFX.badge?.(), 300);
      } else if (registro?.combo >= 2 && !registro?.comboQuebrou) {
        setTimeout(() => SFX.comboUp?.(), 300);
      }
    }

    if (outcome.desfecho === 'bom') SFX.ding();
    else SFX.buzz();
    TTS.speak(`${outcome.titulo}. ${outcome.texto}`);

    this.el['debrief-preceptor'].hidden = true;
    this.el['debrief-preceptor'].textContent = '';
    const log = this.history
      .map((m) => `${m.role === 'user' ? t('log.farmaceutico') : t('log.paciente')}: ${m.content}`)
      .join('\n');
    const feedback = await generatePreceptorFeedback({
      llm: this.llm,
      caseDef: this.case,
      decision: decisao,
      result,
      logText: log,
      language: getLang(),
    });
    if (feedback) {
      this.el['debrief-preceptor'].textContent = feedback;
      this.el['debrief-preceptor'].hidden = false;
    }
  }

  renderDebrief(outcome, result, stars, registro = null) {
    renderDebriefPanel({
      elements: this.el,
      outcome,
      result,
      stars,
      registration: registro,
      caseDef: this.case,
      points: this.points,
      phases: this.phases,
      newlyUnlockedPhase: this.novaFaseLiberada,
      seed: this.seed,
      translate: t,
      setVisible: (visible) => this.setDebriefVisible(visible),
    });
  }
}
