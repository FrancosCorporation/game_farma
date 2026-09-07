import { classify, KnowledgeState, norm, DOMAIN_LABELS } from './factGate.js';
import { buildActorSystemPrompt, templateReply, buildEvaluatorMessages } from '../ai/prompts.js';
import { scoreCase, starsForScore } from './scoring.js';
import { TTS } from '../audio/tts.js';
import { SFX } from '../audio/sfx.js';
import { createDictation } from '../audio/stt.js';
import { POSE_FRASE } from '../scene/patient.js';

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

  setFase(f) {
    this.el['hud-fase'].textContent = f;
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
      btn.innerHTML = `<span class="ph-num">${phase.icone}</span><span class="ph-info"><b>${phase.nome}</b><small>${phase.desc}</small></span>`;
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

  async startCase(caseDef, { repeat = false } = {}) {
    this.case = caseDef;
    this.state = 'CHEGADA';
    this.knowledge = new KnowledgeState(caseDef);
    this.history = [];
    this.turn = 0;
    this.busy = false;
    this.conduta = null;
    this.usedChips = new Set();
    this.lastPatientLine = '';
    this.seed = Math.floor(Math.random() * 1e6);

    this.el.debrief.hidden = true;
    this.el.decision.hidden = true;
    this.el['btn-decisao'].hidden = true;
    this.el['chat-log'].innerHTML = '';
    this.el['chat-chips'].innerHTML = '';
    this.el['chat-nome'].textContent = `${caseDef.persona.nome}, ${caseDef.persona.idade} anos`;
    this.el['chat-avatar'].textContent = caseDef.persona.nome.replace(/^Dona? ?/i, '')[0] || '?';
    this.el['chat-contador'].textContent = `0/${MAX_TURNS}`;
    this.el['hud-paciente'].textContent = `Cliente: ${caseDef.persona.nome}`;
    this.setFase('Chegada');
    this.el['chat-input'].disabled = false;
    SFX.chime();
    TTS.setCase(caseDef.id);

    await this.fx.fadeOut();
    await this.avatar.enter(caseDef.persona.aparencia);
    await this.fx.fadeIn();
    this.state = 'ANAMNESE';
    this.setFase('Anamnese');
    this.addBubble('paciente', caseDef.abertura);
    TTS.speak(caseDef.abertura, caseDef.persona.voz);
    this.lastPatientLine = caseDef.abertura;
    this.renderChips();
    this.el['btn-decisao'].hidden = false;
    this.el['chat-input'].focus();
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
      this.addSystem(`Sinal de alerta: ${f.rotulo}`, true);
      this.avatar.setMood('dolorido');
    } else if (f.valor === false) {
      this.addSystem(`Investigado — ${f.rotulo} (negado)`);
    }
    if (f.postura) {
      this.avatar.setPose(f.postura);
      this.addSystem(`${this.case.persona.nome} ${POSE_FRASE[f.postura]}.`);
    }
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
      out = text;
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
    this.setFase('Decisão');
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
      span.textContent = f.rotulo + (f.valor ? '' : ' (negado)');
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
    this.setFase('Anamnese');
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
      this.el['btn-confirmar'].textContent = 'Confirmar: orientar e dispensar MIP';
    } else {
      mipBox.hidden = true;
      this.el['btn-confirmar'].textContent =
        kind === 'vender' ? 'Confirmar: vender o pedido' : 'Confirmar: encaminhar à urgência';
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
    this.setFase('Avaliando');
    const decisao = {
      conduta: this.conduta,
      mips: [...this.el['mip-list'].querySelectorAll('input:checked')].map((i) => i.value),
      orient: [...this.el['orient-list'].querySelectorAll('input:checked')].map((i) => i.value),
      redFlags: [...this.el['redflag-list'].querySelectorAll('input:checked')].map((i) => i.value),
    };
    const result = scoreCase(this.case, this.knowledge, decisao, this.history);
    this.points += result.total;
    this.el['hud-score'].textContent = `Pontos ${this.points}`;

    const stars = starsForScore(result.total);
    this.progress.registerResult({
      faseId: this.phaseDef().id,
      casoId: this.case.id,
      nota: result.total,
      stars,
    });

    const outcome = this.case.consequencias[this.conduta];
    this.avatar.leave();
    this.state = 'DEBRIEFING';
    this.setFase('Relatório');
    this.renderDebrief(outcome, result, stars);
    if (outcome.desfecho === 'bom') SFX.ding();
    else SFX.buzz();
    TTS.speak(`${outcome.titulo}. ${outcome.texto}`);

    this.el['debrief-preceptor'].hidden = true;
    this.el['debrief-preceptor'].textContent = '';
    if (this.llm && this.llm.ok) {
      try {
        const log = this.history
          .map((m) => (m.role === 'user' ? 'FARMACÊUTICO: ' : 'PACIENTE: ') + m.content)
          .join('\n');
        const { text } = await this.llm.chat(buildEvaluatorMessages(this.case, decisao, result, log), {
          maxTokens: 320,
          temperature: 0.3,
        });
        this.el['debrief-preceptor'].textContent = text;
        this.el['debrief-preceptor'].hidden = false;
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
    tag.textContent = { fatal: 'DESFECHO FATAL', grave: 'DESFECHO GRAVE', bom: 'BOM DESFECHO', neutro: 'CONDUÇÃO QUESTIONÁVEL' }[outcome.desfecho] || 'DESFECHO';

    this.el['debrief-stars'].innerHTML = [1, 2, 3]
      .map((i) => `<span class="star ${i <= stars ? 'on' : ''}">★</span>`)
      .join('');

    this.el['debrief-titulo'].textContent = outcome.titulo;
    this.el['debrief-texto'].textContent = outcome.texto;
    this.el['debrief-pontos'].textContent = `${result.total} / 100`;

    const rows = [
      ['Anamnese essencial', result.anamnese, 35],
      ['Investigação de alertas', result.redflags, 20],
      ['Diagnóstico de risco', result.risco, 10],
      ['Conduta clínica', result.conduta, 30],
      ['Comunicação', result.comunicacao, 5],
    ];
    this.el['debrief-breakdown'].innerHTML = rows
      .map(([nome, v, max]) => `
        <div class="scorebar">
          <span>${nome}</span>
          <span class="fill"><i style="width:${Math.round((v / max) * 100)}%"></i></span>
          <span class="text-right">${v}/${max}</span>
        </div>`)
      .join('');

    const det = this.el['debrief-detalhes'];
    det.innerHTML = '';
    const li = (txt, cls) => {
      const e = document.createElement('li');
      e.textContent = txt;
      e.className = cls || '';
      det.appendChild(e);
    };
    if (result.missedDomains.length)
      li(`Deveria ter perguntado sobre: ${result.missedDomains.map((d) => DOMAIN_LABELS[d] || d).join(', ')}.`, 'text-amber-300');
    if (result.missedRed.length)
      li(`Sinais de alerta não investigados: ${result.missedRed.map((d) => DOMAIN_LABELS[d] || d).join(', ')}.`, 'text-amber-300');
    result.criticals.forEach((c) => li(`ERRO CRÍTICO — ${c}`, 'text-red-400 font-semibold'));
    if (!result.missedDomains.length && !result.missedRed.length && !result.criticals.length)
      li('Anamnese completa e conduta adequada. Atendimento-modelo.', 'text-teal-300');

    this.el['debrief-stamp'].textContent =
      `caso ${this.case.id} v${this.case.version} · seed ${this.seed} · FarmaCheck web · condutas ilustrativas — validar bula e protocolos vigentes`;
    this.el.debrief.hidden = false;
    this.el.debrief.querySelector('h2').focus();
  }
}