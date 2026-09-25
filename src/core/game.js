import { classify, KnowledgeState, norm, domainLabel } from './factGate.js';
import { buildActorSystemPrompt, templateReply, buildEvaluatorMessages, looksPortuguese, buildTranslateMessages } from '../ai/prompts.js';
import { scoreCase, starsForScore } from './scoring.js';
import { localizeCase } from '../data/cases.js';
import { t, getLang } from '../ui/i18n.js';
import { TTS } from '../audio/tts.js';
import { SFX } from '../audio/sfx.js';
import { createDictation } from '../audio/stt.js';

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
    this.points = 0;
    this.lastIdx = -1;
    this.busy = false;
    this.conduta = null;
    this.usedChips = new Set();
    this.phaseIdx = 0;
    this.caseOrder = [];

    this.el = {};
    for (const id of ['chat-log', 'chat-input', 'chat-form', 'chat-chips', 'chat-nome', 'chat-avatar', 'chat-status',
      'chat-contador', 'hud-paciente', 'hud-fase', 'hud-score', 'btn-decisao', 'decision', 'redflag-list', 'mip-box',
      'mip-list', 'orient-list', 'btn-voltar', 'btn-confirmar', 'debrief', 'debrief-stars', 'debrief-tag', 'debrief-titulo',
      'debrief-texto', 'debrief-pontos', 'debrief-breakdown', 'debrief-detalhes', 'debrief-preceptor', 'debrief-stamp',
      'btn-tts', 'menu', 'phase-select'])
      this.el[id] = $(id);

    this.bind();
    this.dictation = createDictation(this.el['chat-input']);
    this.el['hud-score'].textContent = `${t('hud.pontos')} 0`;
  }

  /** Re-render dinâmico p/ troca de idioma no menu/capa (listener de langchange). */
  refreshLangUI() {
    this.el['hud-score'].textContent = `${t('hud.pontos')} ${this.points}`;
    if (this.state === 'MENU') this.renderPhases();
  }

  bind() {
    this.el['chat-form'].addEventListener('submit', (e) => {
      e.preventDefault();
      this.onSubmit();
    });
    this.el['chat-input'].addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.onSubmit();
      }
    });
    this.el['chat-chips'].addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]');
      if (b) {
        this.el['chat-input'].value = b.dataset.q;
        this.onSubmit();
      }
    });
    this.el['btn-decisao'].addEventListener('click', () => this.goDecision());
    this.el['btn-voltar'].addEventListener('click', () => this.backToAnamnese());
    $('conduta-cards').addEventListener('click', (e) => {
      const b = e.target.closest('[data-conduta]');
      if (b) this.selectConduta(b.dataset.conduta);
    });
    this.el['btn-confirmar'].addEventListener('click', () => this.confirmDecision());
    // habilita o confirmar assim que um MIP é marcado (conduta "sugerir")
    this.el['mip-list'].addEventListener('change', () => this.updateConfirm());
    $('btn-proximo').addEventListener('click', () => this.nextPatient());
    $('btn-repetir').addEventListener('click', () => this.startCase(this.case, { repeat: true }));
    $('btn-exportar').addEventListener('click', () => window.print());
    $('btn-fases').addEventListener('click', () => this.openMenu());
    this.el['btn-tts'].addEventListener('click', () => {
      TTS.enabled = !TTS.enabled;
      this.el['btn-tts'].setAttribute('aria-pressed', String(TTS.enabled));
      if (!TTS.enabled) TTS.stop();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r' && document.activeElement !== this.el['chat-input'] && this.lastPatientLine) {
        TTS.speak(this.lastPatientLine, this.case?.persona.voz);
      }
    });
  }

  setFase(key) {
    this.el['hud-fase'].textContent = t(`fase.${key}`);
  }

  // ---------- fases / seleção ----------
  setPhase(idx) {
    this.phaseIdx = idx;
    const phase = this.phaseDef();
    this.caseOrder = phase.casos ? [...phase.casos] : [];
    if (!phase.casos && this.cases.length) this.caseOrder = this.cases.map((c) => c.id);
    this.lastIdx = -1;
  }
  phaseDef() {
    return this.phases[this.phaseIdx] || this.phases[0];
  }
  openMenu() {
    this.state = 'MENU';
    this.el.debrief.hidden = true;
    this.el.decision.hidden = true;
    this.el.menu.hidden = false;
    this.renderPhases();
  }
  renderPhases() {
    const box = this.el['phase-select'];
    box.innerHTML = '';
    const unlocked = this.progress.unlockLevel();
    this.phases.forEach((phase, i) => {
      const locked = i > unlocked && i < this.phases.length - 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'phase-card' + (locked ? ' locked' : '') + (i === this.phaseIdx ? ' pressed' : '');
      btn.setAttribute('aria-pressed', String(i === this.phaseIdx));
      btn.disabled = locked;
      btn.innerHTML = `<span class="ph-num">${phase.icone}</span><span class="ph-info"><b>${t(`phase.${phase.id}.nome`)}</b><small>${t(`phase.${phase.id}.desc`)}</small></span>`;
      btn.addEventListener('click', () => {
        this.phaseIdx = i;
        this.renderPhases();
        this.setPhase(i);
      });
      box.appendChild(btn);
    });
  }

  // ---------- ciclo de partida ----------
  async nextPatient() {
    this.el.debrief.hidden = true;
    const cfg = JSON.parse(localStorage.getItem('farmacheck:llm') || '{}');
    let c = await import('../data/cases.js').then((m) => m.fetchNextCase(cfg.serverURL));
    if (!c) {
      const pool = this.caseOrder.length ? this.caseOrder : this.cases.map((x) => x.id);
      let id;
      do {
        id = pool[(Math.random() * pool.length) | 0];
      } while (pool.length > 1 && id === this.caseOrder[this.lastIdx]);
      this.lastIdx = pool.indexOf(id);
      c = this.cases.find((x) => x.id === id);
    }
    this.startCase(c);
  }

  async startCase(caseDefRaw, { repeat = false } = {}) {
    const caseDef = localizeCase(caseDefRaw, getLang());
    this.case = caseDef;
    this.state = 'CHEGADA';
    this.knowledge = new KnowledgeState(caseDef);
    this.history = [];
    this.turn = 0;
    this.busy = false;
    this.conduta = null;
    this.usedChips = new Set();
    // Scoring v2 (F1): eventos por caso, expostos via registrar*() para as fases de PC/teste/DSF
    this.consultaBulario = false;
    this.testeRapido = null;   // { executado: true, resultado }
    this.dsf = null;           // texto da conduta do jogador
    this.queixaRegistrada = false;
    this.lastPatientLine = '';
    this.seed = Math.floor(Math.random() * 1e6);

    this.el.debrief.hidden = true;
    this.el.decision.hidden = true;
    this.el['btn-decisao'].hidden = true;
    this.el['chat-log'].innerHTML = '';
    this.el['chat-chips'].innerHTML = '';
    this.el['chat-nome'].textContent = `${caseDef.persona.nome}, ${caseDef.persona.idade}${t('chat.anos')}`;
    this.el['chat-avatar'].textContent = caseDef.persona.nome.replace(/^(Dona?|Seu|Mr\.?|Mrs\.?)\s*/i, '')[0] || '?';
    this.el['chat-contador'].textContent = `0/${MAX_TURNS}`;
    this.el['hud-paciente'].textContent = `${t('chat.cliente')} ${caseDef.persona.nome}`;
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
    this.fx.dip();
    this.state = 'ANAMNESE';
    this.setFase('anamnese');
    this.el['chat-input'].disabled = false;
    this.addBubble('paciente', caseDef.abertura);
    TTS.speak(caseDef.abertura, caseDef.persona.voz);
    this.lastPatientLine = caseDef.abertura;
    this.renderChips();
    this.el['btn-decisao'].hidden = false;
    // sem auto-focus: o jogador anda com WASD; clicar no chat foca para digitar
  }

  renderChips() {
    const box = this.el['chat-chips'];
    box.innerHTML = '';
    for (const c of this.case.chips) {
      if (this.usedChips.has(c.label)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.q = c.q;
      b.textContent = c.label;
      b.className = 'text-xs rounded-full border border-teal-400/30 text-teal-200 px-2.5 py-1 hover:bg-teal-900/50';
      box.appendChild(b);
    }
  }

  // ---------- turno de anamnese ----------
  addBubble(kind, text) {
    const el = document.createElement('div');
    el.className = kind === 'paciente' ? 'bub bub-pac' : 'bub bub-farm';
    el.textContent = text;
    this.el['chat-log'].appendChild(el);
    this.scrollLog();
    SFX.pop();
    return el;
  }
  addSystem(text, red = false) {
    const el = document.createElement('div');
    el.className = 'bub bub-sys' + (red ? ' bub-red' : '');
    el.textContent = text;
    this.el['chat-log'].appendChild(el);
    this.scrollLog();
  }
  scrollLog() {
    this.el['chat-log'].scrollTop = this.el['chat-log'].scrollHeight;
  }
  showTyping(on) {
    this.el['chat-status'].classList.toggle('hidden', !on);
  }

  async onSubmit() {
    const text = this.el['chat-input'].value.trim();
    if (!text || this.busy || this.state !== 'ANAMNESE') return;
    this.el['chat-input'].value = '';
    this.addBubble('farmaceutico', text);
    this.history.push({ role: 'user', content: text });
    this.busy = true;
    this.showTyping(true);
    this.turn++;
    this.el['chat-contador'].textContent = `${this.turn}/${MAX_TURNS}`;

    const domains = classify(text);
    const { novos, evasivas } = this.knowledge.ask(text, domains);
    novos.forEach((f) => this.onFactRevealed(f));

    // Scoring v2: feedback de queixa principal identificada (localização + duração)
    const askedNow = this.knowledge.askedDomains;
    if (!this.queixaRegistrada && askedNow.has('localizacao') && askedNow.has('duracao')) {
      this.queixaRegistrada = true;
      this.addSystem(t('sys.queixaRegistrada'));
    }
    if (this.case.testeRapido?.indicado && !this.testeRapido && this.turn >= 3) {
      this.addSystem(t('sys.lembreteTeste'));
    }

    const reply = await this.generateReply(novos, evasivas);
    this.showTyping(false);
    this.history.push({ role: 'assistant', content: reply });
    this.lastPatientLine = reply;
    TTS.speak(reply, this.case.persona.voz);
    this.busy = false;
    if (this.turn >= MAX_TURNS) this.goDecision();
    else this.el['chat-input'].focus();
  }

  onFactRevealed(f) {
    if (f.redFlag && f.valor) {
      SFX.redFlag();
      this.fx.pulse();
      this.addSystem(`${t('sys.redflag')}${f.rotulo}`, true);
      this.avatar?.setMood?.('dolorido');
    } else if (f.valor === false) {
      this.addSystem(`${t('sys.investigado')}${f.rotulo}${t('sys.negado')}`);
    }
    if (f.postura) {
      this.avatar?.setPose?.(f.postura);
      this.addSystem(`${this.case.persona.nome} ${t(`pose.${f.postura}`)}.`);
    }
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
    const tipo = this.case.testeRapido?.tipo || t('tlac.title');
    this.addSystem(
      `${tipo}: ${resultado ? `${t('sys.testeResultado')}${String(resultado).toUpperCase()}` : t('sys.testeExecutado')}`,
      !!resultado && /positiv/i.test(String(resultado)),
    );
  }

  registrarDSF(conduta) {
    if (this.state !== 'ANAMNESE' && this.state !== 'DECISAO') return;
    this.dsf = conduta || null;
    this.addSystem(conduta ? `${t('sys.dsfCom')}${conduta}` : `${t('sys.dsfEmitida')}.`);
  }

  /** UI em EN + resposta do LLM em PT → traduz no próprio servidor de IA;
   *  falhou ou continuou PT → devolve '' (o template EN assume). */
  async enforceLang(text) {
    if (getLang() !== 'en' || !text || !looksPortuguese(text)) return text;
    if (!this.llm || this.llm.ok === false) return '';
    try {
      const { text: tr } = await this.llm.chat(buildTranslateMessages(text), { maxTokens: 160, temperature: 0.2 });
      const clean = (tr || '').trim();
      if (clean && !looksPortuguese(clean)) return clean;
    } catch { /* cai no template EN */ }
    return '';
  }

  async generateReply(novos, evasivas) {
    const live = this.addBubble('paciente', '');
    let out = '';
    try {
      if (!this.llm || this.llm.ok === false) throw new Error('llm indisponível');
      const sys = buildActorSystemPrompt(this.case, this.knowledge, novos, evasivas);
      const msgs = [{ role: 'system', content: sys }, ...this.history.slice(-9)];
      const { text } = await this.llm.chat(msgs, {
        onToken: (tok, full) => {
          out = full;
          live.textContent = full;
          this.scrollLog();
        },
      });
      out = await this.enforceLang(text);
    } catch {
      out = '';
    }
    if (!out.trim() || this.guardLeaks(out)) out = templateReply(this.case, this.knowledge, novos, evasivas);
    live.textContent = out;
    this.scrollLog();
    return out;
  }

  guardLeaks(text) {
    const q = norm(text);
    return this.case.fatos.some(
      (f) => f.segredo && !this.knowledge.revealed.has(f.tag) && new RegExp(f.segredo, 'i').test(q)
    );
  }

  // ---------- decisão ----------
  goDecision() {
    if (this.state !== 'ANAMNESE' || this.busy) return;
    this.state = 'DECISAO';
    this.setFase('decisao');
    this.el['chat-input'].disabled = true;
    this.el['chat-chips'].innerHTML = '';
    this.el['btn-decisao'].hidden = true;

    const list = this.el['redflag-list'];
    list.innerHTML = '';
    for (const f of this.case.fatos) {
      if (!this.knowledge.revealed.has(f.tag) || !(f.redFlag || f.valor === false)) continue;
      const label = document.createElement('label');
      label.className = 'check-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = f.tag;
      const span = document.createElement('span');
      span.textContent = f.rotulo + (f.valor ? '' : t('sys.negado'));
      label.append(cb, span);
      list.appendChild(label);
    }

    document.querySelectorAll('#conduta-cards [data-conduta]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    this.el['mip-box'].hidden = true;
    this.el['btn-confirmar'].disabled = true;
    this.conduta = null;
    this.el.decision.hidden = false;
    this.el.decision.querySelector('h2').focus();
  }

  backToAnamnese() {
    this.state = 'ANAMNESE';
    this.setFase('anamnese');
    this.el.decision.hidden = true;
    this.el['chat-input'].disabled = false;
    this.renderChips();
    this.el['chat-input'].focus();
  }

  selectConduta(kind) {
    this.conduta = kind;
    document.querySelectorAll('#conduta-cards [data-conduta]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.conduta === kind))
    );

    const mipBox = this.el['mip-box'];
    if (kind === 'sugerir') {
      mipBox.hidden = false;
      const fill = (boxId, items, valueKey) => {
        const box = this.el[boxId];
        box.innerHTML = '';
        for (const item of items) {
          const label = document.createElement('label');
          label.className = 'check-row';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = valueKey === 'id' ? item.id : item;
          const span = document.createElement('span');
          span.textContent = item.nome || item;
          label.append(cb, span);
          box.appendChild(label);
        }
      };
      fill('mip-list', this.case.prateleira, 'id');
      fill('orient-list', this.case.orientacoes, 'nome');
      this.el['btn-confirmar'].textContent = t('decision.confirmarSugerir');
    } else {
      mipBox.hidden = true;
      this.el['btn-confirmar'].textContent =
        kind === 'vender' ? t('decision.confirmarVender') : t('decision.confirmarEncaminhar');
    }
    this.updateConfirm();
  }

  updateConfirm() {
    const needMip =
      this.conduta === 'sugerir' && this.el['mip-list'].querySelector('input:checked') === null;
    this.el['btn-confirmar'].disabled = !this.conduta || needMip;
  }

  async confirmDecision() {
    if (!this.conduta) return;
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
    this.points += result.total;
    this.el['hud-score'].textContent = `${t('hud.pontos')} ${this.points}`;

    const stars = starsForScore(result.total);
    this.progress.registerResult({
      faseId: this.phaseDef().id,
      casoId: this.case.id,
      nota: result.total,
      stars,
    });

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
    this.renderDebrief(outcome, result, stars);
    if (outcome.desfecho === 'bom') SFX.ding();
    else SFX.buzz();
    TTS.speak(`${outcome.titulo}. ${outcome.texto}`);

    this.el['debrief-preceptor'].hidden = true;
    this.el['debrief-preceptor'].textContent = '';
    if (this.llm && this.llm.ok) {
      try {
        const log = this.history
          .map((m) => `${m.role === 'user' ? t('log.farmaceutico') : t('log.paciente')}: ${m.content}`)
          .join('\n');
        const { text } = await this.llm.chat(buildEvaluatorMessages(this.case, decisao, result, log), {
          maxTokens: 320,
          temperature: 0.3,
        });
        let feedback = (text || '').trim();
        if (getLang() === 'en' && looksPortuguese(feedback)) {
          try {
            const { text: tr } = await this.llm.chat(buildTranslateMessages(feedback), { maxTokens: 400, temperature: 0.2 });
            const clean = (tr || '').trim();
            if (clean && !looksPortuguese(clean)) feedback = clean;
            else feedback = '';
          } catch { feedback = ''; }
        }
        if (feedback) {
          this.el['debrief-preceptor'].textContent = feedback;
          this.el['debrief-preceptor'].hidden = false;
        }
      } catch {
        /* template já cobre */
      }
    }
  }

  renderDebrief(outcome, result, stars) {
    const tag = this.el['debrief-tag'];
    const styles = {
      fatal: 'bg-red-900/60 text-red-200',
      grave: 'bg-amber-900/60 text-amber-200',
      bom: 'bg-teal-900/60 text-teal-200',
      neutro: 'bg-slate-700/60 text-slate-200',
    };
    tag.className = 'inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ' + (styles[outcome.desfecho] || styles.neutro);
    const tagKey = {
      fatal: 'debrief.tag.fatal', grave: 'debrief.tag.grave',
      bom: 'debrief.tag.bom', neutro: 'debrief.tag.neutro',
    }[outcome.desfecho] || 'debrief.tag.default';
    tag.textContent = t(tagKey);

    this.el['debrief-stars'].innerHTML = [1, 2, 3]
      .map((i) => `<span class="star ${i <= stars ? 'on' : ''}">★</span>`)
      .join('');

    this.el['debrief-titulo'].textContent = outcome.titulo;
    this.el['debrief-texto'].textContent = outcome.texto;
    this.el['debrief-pontos'].textContent = `${result.total} / 100`;

    const breakdown = result.breakdown || [];
    const MAX_BY_METRICA = {
      queixa_principal: 20, sinais_alarme: 20, bulario: 10, teste_rapido: 20, dsf: 30,
    };
    this.el['debrief-breakdown'].innerHTML = breakdown.map((m) => {
      const neg = m.pontos < 0;
      const max = neg ? Math.abs(m.pontos) : (MAX_BY_METRICA[m.metrica] || Math.max(1, m.pontos));
      const pct = neg ? 100 : Math.round((m.pontos / max) * 100);
      return `
        <div class="scorebar">
          <span>${m.label}</span>
          <span class="fill"><i style="width:${pct}%; background:${neg ? '#ef4444' : ''}"></i></span>
          <span class="text-right">${m.pontos > 0 ? '+' : ''}${m.pontos}</span>
        </div>`;
    }).join('');

    const det = this.el['debrief-detalhes'];
    det.innerHTML = '';
    const li = (txt, cls) => {
      const e = document.createElement('li');
      e.textContent = txt;
      e.className = cls || '';
      det.appendChild(e);
    };
    if (result.missedDomains.length)
      li(`${t('debrief.faltaPerguntar')}${result.missedDomains.map((d) => domainLabel(d)).join(', ')}.`, 'text-amber-300');
    if (result.missedRed.length)
      li(`${t('debrief.alertaNaoInvestigado')}${result.missedRed.map((d) => domainLabel(d)).join(', ')}.`, 'text-amber-300');
    if (result.reprovado)
      li(`${t('debrief.reprovado')}${this.case.contraindicado?.motivo || t('bulario.contraindicado')}).`, 'text-red-400 font-semibold');
    if (result.testeRapidoPerdido)
      li(`${t('debrief.testePerdidoPre')}${this.case.testeRapido?.tipo}${t('debrief.testePerdidoPos')}`, 'text-amber-300');
    if (result.arboviroseNaoEncaminhada)
      li(t('debrief.arbovirose'), 'text-red-400');
    if (result.orientacaoInadequada)
      li(t('debrief.orientacao'), 'text-amber-300');
    if (this.case.dsf && !result.dsfOk)
      li(t('debrief.dsf'), 'text-amber-300');
    result.criticals.forEach((c) => li(`${t('debrief.critico')}${c}`, 'text-red-400 font-semibold'));
    if (!result.missedDomains.length && !result.missedRed.length && !result.criticals.length
      && !result.reprovado && !result.testeRapidoPerdido && !result.arboviroseNaoEncaminhada
      && !result.orientacaoInadequada && result.dsfOk)
      li(t('debrief.perfeito'), 'text-teal-300');

    this.el['debrief-stamp'].textContent =
      `${t('debrief.stampCase')} ${this.case.id} v${this.case.version} · seed ${this.seed} · FarmaCheck web · ${t('debrief.stampTail')}`;
    this.el.debrief.hidden = false;
    this.el.debrief.querySelector('h2').focus();
  }
}