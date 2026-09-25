// i18n completo (PT/EN): shell, HUD, atendimento, decisão, debrief, DSF/TLAC
// e conteúdo clínico (via localizeCase + prompts bilíngues).
const STORAGE_KEY = 'farmacheck:lang';

const dict = {
  pt: {
    'capa.iniciar': 'Iniciar jogo',
    'capa.referencias': 'Referências',
    'capa.idioma': 'Linguagem',
    'capa.lang.pt': 'Português (BR)',
    'capa.lang.en': 'English',

    'refs.title': 'Referências',
    'refs.close': 'Fechar',
    'refs.credits.heading': 'Créditos',
    'refs.credits.ufg': 'UFG — Universidade Federal de Goiás',
    'refs.credits.po': 'Product Owner: Jhuly',
    'refs.disclaimer': 'Conteúdo 100% fictício e educacional — não substitui avaliação farmacêutica/médica nem consulta à bula.',
    'refs.sus': 'Cenário inspirado na atenção farmacêutica no SUS.',
    'refs.biblio.heading': 'Bibliografia',
    'refs.biblio.dengue': 'Dengue: sinais de alerta e risco do uso de AAS/anti-inflamatórios.',
    'refs.biblio.dispepsia': 'Dispepsia: automedicação e medicamentos isentos de prescrição (MIP).',
    'refs.biblio.dermatite': 'Dermatite de contato: triggeiros e orientação não farmacológica.',
    'refs.stamp': 'Pendente validação da PO',

    'hud.subtitle': '· O Desafio da Anamnese',
    'hud.idle': 'Expediente encerrado…',
    'hud.tts': 'Narrar',

    'menu.tagline': 'Simulador de atendimento farmacêutico',
    'menu.intro.a': 'Você é a farmacêutica do balcão. Clientes vão chegar pedindo remédios — alguns inofensivos, outros ',
    'menu.intro.b': 'capazes de agravar uma condição grave e oculta',
    'menu.intro.c': '. Investigue por anamnese antes de decidir: vender, orientar ou encaminhar.',
    'menu.disclaimer': 'Ambiente 100% fictício e educacional. Condutas, marcas e desfechos são ilustrativos — não substituem avaliação farmacêutica/médica nem bula.',
    'menu.ai.summary': 'Servidor de IA (llama.cpp · Qwen3.5-9B)',
    'menu.ai.endpoint': 'Endpoint',
    'menu.ai.model': 'Modelo',
    'menu.ai.test': 'Testar conexão',
    'menu.iniciar': 'Iniciar expediente',
    'menu.keys': 'Enter envia · Shift+Enter quebra linha · Ctrl+M dita · R repete a última fala · Tab navega',

    'debrief.next': 'Próximo cliente',
    'debrief.repeat': 'Repetir este caso',
    'debrief.export': 'Exportar relatório',
    'debrief.phases': 'Fases',

    // F2 — POV / pontos de interesse
    'acoes.pc': '🖥 Consultar Computador',
    'acoes.tlac': '🧪 Teste Rápido',
    'acoes.dsf': '📄 Gerar Declaração',
    'acoes.paciente': '↩ Voltar ao paciente',
    'pov.dica': 'Arraste para olhar ao redor · 1/2/3 trocam de ponto',
    'bulario.title': '🖥 Bulário & diretrizes',
    'bulario.close': 'Fechar',
    'bulario.pedido': 'Pedido do cliente',
    'bulario.prateleira': 'Bulas da prateleira',
    'bulario.diretrizes': 'Diretrizes & alertas',
    'bulario.contraindicado': 'CONTRAINDICADO neste caso',
    'bulario.teste': 'Teste rápido indicado',

    // F3 — TLAC
    'tlac.title': '🧪 Teste rápido (TLAC)',
    'tlac.close': 'Fechar',
    'tlac.fazer': 'Realizar teste rápido',
    'tlac.naoIndicado': 'Sem indicação de teste rápido para este caso — dispensar o kit não pontua nem registra.',
    'tlac.passo1': 'Higienizar as mãos e lancetar o dedo',
    'tlac.passo2': 'Coletar a gota de sangue',
    'tlac.passo3': 'Inserir o casete no aparelho',
    'tlac.passo4': 'Adicionar o reagente (buffer)',
    'tlac.passo5': 'Aguardar o temporizador',
    'tlac.executar': 'Executar',
    'tlac.aguardando': 'Lendo o casete…',
    'tlac.resultado': 'Resultado',
    'tlac.registrado': 'Resultado registrado no atendimento.',

    // F4 — DSF
    'dsf.title': '📄 Declaração de Serviços Farmacêuticos',
    'dsf.close': 'Fechar',
    'dsf.paciente': 'Paciente',
    'dsf.data': 'Data',
    'dsf.queixa': 'Queixa / pedido',
    'dsf.rapidas': 'Condutas rápidas',
    'dsf.conduta': 'Conduta farmacêutica',
    'dsf.orientacoes': 'Orientações fornecidas',
    'dsf.encaminhamento': 'Encaminhamento',
    'dsf.emitir': 'Emitir DSF',
    'dsf.imprimir': '🖨 Imprimir / PDF',
    'dsf.voltar': '← Editar',
    'dsf.doc.title': 'DECLARAÇÃO DE SERVIÇOS FARMACÊUTICOS',
    'dsf.doc.sub': 'Atenção farmacêutica — registro do atendimento (Anvisa/CFF · documento fictício para fins educacionais)',
    'dsf.naoNecessario': 'Não necessário',
    'dsf.er': 'pronto-socorro',
    'dsf.stamp': 'DSF emitida no simulador FarmaCheck · conteúdo 100% fictício e educacional — não substitui registro real (Anvisa/CFF).',
    'dsf.rapida.recusa': 'Recusei a dispensação do medicamento solicitado (contraindicado) e encaminhei a pessoa ao pronto-socorro com urgência, orientando hidratação e sinais de alarme.',
    'dsf.rapida.mip': 'Dispensei medicamento isento de prescrição (MIP) com orientações não-medicamentosas e prazo de reavaliação.',
    'dsf.rapida.hidratacao': 'Orientei hidratação, repouso e monitoração de sinais de alarme.',
    'dsf.rapida.retorno': 'Orientei retorno ao serviço se os sintomas piorarem ou persistirem por mais de 3 dias.',

    // Chat
    'chat.aguardando': 'Aguardando cliente…',
    'chat.digitando': 'digitando…',
    'chat.placeholder': 'Faça a próxima pergunta…',
    'chat.enviar': 'Enviar',
    'chat.mic': 'Ditar (Ctrl+M)',
    'chat.logAria': 'Conversa com o cliente',
    'chat.anos': ' anos',
    'chat.cliente': 'Cliente:',

    // Fases do HUD (chaves internas do motor)
    'fase.chegada': 'Chegada',
    'fase.anamnese': 'Anamnese',
    'fase.decisao': 'Decisão',
    'fase.avaliando': 'Avaliando',
    'fase.relatorio': 'Relatório',
    'hud.pontos': 'Pontos',

    // Cartões de fase (menu)
    'phase.aprendiz.nome': 'Aprendiz de Balcão',
    'phase.aprendiz.desc': 'Três clientes simples para aprender o core loop. Sem red flags críticas.',
    'phase.plantao.nome': 'Plantão da Tarde',
    'phase.plantao.desc': 'Casos mistos com armadilhas de venda e primeiros sinais de alerta.',
    'phase.emergencia.nome': 'Emergência Silenciosa',
    'phase.emergencia.desc': 'Condições graves ocultas. Investigue fundo antes de vender qualquer coisa.',
    'phase.livre.nome': 'Expediente Livre',
    'phase.livre.desc': 'Pacientes infinitos randomizados pela IA (llama.cpp). Pontos acumulam sem fim.',

    // Decisão clínica
    'decision.title': 'Decisão clínica',
    'decision.voltar': '← voltar à anamnese',
    'decision.redflags': '1 · Sinais de alerta (só o que você investigou)',
    'decision.condutaLegend': '2 · Conduta',
    'decision.vender.t': 'Vender o pedido',
    'decision.vender.s': 'entregar o que o cliente pediu',
    'decision.sugerir.t': 'Sugerir outro MIP',
    'decision.sugerir.s': 'medicamento isento de prescrição + orientações',
    'decision.encaminhar.t': 'Encaminhar à urgência',
    'decision.encaminhar.s': 'SAMU 192 / pronto-socorro',
    'decision.prateleira': 'Prateleira — MIPs',
    'decision.orientNF': 'Orientações não farmacológicas',
    'decision.confirmar': 'Confirmar conduta',
    'decision.encerrar': 'Encerrar anamnese e decidir a conduta →',
    'decision.confirmarVender': 'Confirmar: vender o pedido',
    'decision.confirmarSugerir': 'Confirmar: orientar e dispensar MIP',
    'decision.confirmarEncaminhar': 'Confirmar: encaminhar à urgência',

    // Mensagens de sistema do atendimento
    'sys.queixaRegistrada': 'Queixa principal e duração do quadro registradas.',
    'sys.lembreteTeste': 'Lembre-se: avalie se há necessidade de teste rápido no computador.',
    'sys.redflag': 'Sinal de alerta: ',
    'sys.investigado': 'Investigado — ',
    'sys.negado': ' (negado)',
    'sys.bulario': 'Bulário/diretrizes consultados no computador.',
    'sys.testeResultado': 'resultado ',
    'sys.testeExecutado': 'executado',
    'sys.dsfEmitida': 'DSF emitida',
    'sys.dsfCom': 'DSF emitida — ',

    // Posturas do avatar
    'pose.mao_no_peito': 'aperta o peito com a mão',
    'pose.curvado': 'se curva, como se o corpo pesasse',
    'pose.cabeca_baixa': 'abaixa a cabeça, visivelmente cansado',

    // Debriefing
    'debrief.tag.fatal': 'DESFECHO FATAL',
    'debrief.tag.grave': 'DESFECHO GRAVE',
    'debrief.tag.bom': 'BOM DESFECHO',
    'debrief.tag.neutro': 'CONDUÇÃO QUESTIONÁVEL',
    'debrief.tag.default': 'DESFECHO',
    'debrief.estrelas': 'Estrelas conquistadas',
    'debrief.faltaPerguntar': 'Deveria ter perguntado sobre: ',
    'debrief.alertaNaoInvestigado': 'Sinais de alerta não investigados: ',
    'debrief.reprovado': 'REPROVADO — dispensou item contraindicado (',
    'debrief.testePerdidoPre': 'Teste rápido indicado (',
    'debrief.testePerdidoPos': ') e não executado (−30).',
    'debrief.arbovirose': 'Suspeita de arbovirose não encaminhada ao pronto-socorro (−40).',
    'debrief.orientacao': 'Orientação inadequada em quadro autolimitado (−25).',
    'debrief.dsf': 'DSF não emitida ou com conduta incorreta (−30).',
    'debrief.critico': 'ERRO CRÍTICO — ',
    'debrief.perfeito': 'Anamnese completa e conduta adequada. Atendimento-modelo.',
    'debrief.stampCase': 'caso',
    'debrief.stampTail': 'condutas ilustrativas — validar bula e protocolos vigentes',

    // Rótulos do log exportado ao preceptor
    'log.farmaceutico': 'FARMACÊUTICO',
    'log.paciente': 'PACIENTE',

    // Hints de interação (tecla E)
    'hint.press': 'Pressione',
    'hint.default': 'para interagir',
    'hint.computador': 'para consultar o computador (bulário)',
    'hint.mesa': 'para realizar teste rápido (TLAC)',
    'hint.paciente': 'para conversar com o paciente',

    // Alvos de interação por proximidade
    'alvo.paciente': 'paciente',
    'alvo.computador': 'computador',
    'alvo.mesa': 'mesa',

    // TLAC
    'tlac.kit': 'kit disponível na bandeja',

    // Bulário — diretrizes fixas
    'bulario.dir1': 'MIPs: orientar dose, horário e duração máxima (reavaliar em até 3–5 dias sem melhora).',
    'bulario.dir2': 'Sinais de alarme (febre persistente, sangramento, dor intensa, vômitos) → encaminhar à urgência.',
    'bulario.dir3': 'Suspeita de arbovirose: evitar AAS e anti-inflamatórios — risco de sangramento e quadro hemorrágico.',

    // Config do servidor de IA / boot
    'cfg.testando': 'Testando…',
    'cfg.ok': 'Conectado ✓',
    'cfg.falha': 'Sem resposta — o jogo rodará no modo plantão (determinístico)',
    'boot.preparando': 'Preparando o cenário…',
    'boot.falha': 'Falha ao carregar o cenário 3D — recarregue a página',
    'fs.enter': 'Entrar em tela cheia',
    'fs.enterTitle': 'Tela cheia',
    'fs.exit': 'Sair da tela cheia',
    'controls.hint': '🖱️ arrastar=olhar · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>=andar · <kbd>E</kbd>=interagir · <kbd>1</kbd>=paciente <kbd>2</kbd>=PC <kbd>3</kbd>=mesa · <kbd>R</kbd>=repetir fala · <kbd>Esc</kbd>=fechar',
    'noscript': 'Este jogo requer JavaScript habilitado.',
  },
  en: {
    'capa.iniciar': 'Start game',
    'capa.referencias': 'References',
    'capa.idioma': 'Language',
    'capa.lang.pt': 'Português (BR)',
    'capa.lang.en': 'English',

    'refs.title': 'References',
    'refs.close': 'Close',
    'refs.credits.heading': 'Credits',
    'refs.credits.ufg': 'UFG — Federal University of Goiás',
    'refs.credits.po': 'Product Owner: Jhuly',
    'refs.disclaimer': 'Content is 100% fictional and educational — it does not replace pharmaceutical/medical assessment or package inserts.',
    'refs.sus': 'Setting inspired by pharmaceutical care within the Brazilian public health system (SUS).',
    'refs.biblio.heading': 'Bibliography',
    'refs.biblio.dengue': 'Dengue: warning signs and the risk of ASA/NSAID use.',
    'refs.biblio.dispepsia': 'Dyspepsia: self-medication and over-the-counter (OTC) medicines.',
    'refs.biblio.dermatite': 'Contact dermatitis: triggers and non-pharmacological guidance.',
    'refs.stamp': 'Pending PO validation',

    'hud.subtitle': '· The Anamnesis Challenge',
    'hud.idle': 'Shift closed…',
    'hud.tts': 'Narrate',

    'menu.tagline': 'Pharmacy care simulator',
    'menu.intro.a': 'You are the pharmacist on duty. Customers will ask for medicines — some harmless, others ',
    'menu.intro.b': 'able to worsen a hidden serious condition',
    'menu.intro.c': '. Investigate through anamnesis before deciding: sell, advise or refer.',
    'menu.disclaimer': 'A 100% fictional, educational environment. Decisions, brands and outcomes are illustrative — they do not replace pharmaceutical/medical assessment or package inserts.',
    'menu.ai.summary': 'AI server (llama.cpp · Qwen3.5-9B)',
    'menu.ai.endpoint': 'Endpoint',
    'menu.ai.model': 'Model',
    'menu.ai.test': 'Test connection',
    'menu.iniciar': 'Start shift',
    'menu.keys': 'Enter sends · Shift+Enter new line · Ctrl+M dictate · R repeats last line · Tab navigates',

    'debrief.next': 'Next patient',
    'debrief.repeat': 'Replay this case',
    'debrief.export': 'Export report',
    'debrief.phases': 'Phases',

    // F2 — POV / points of interest
    'acoes.pc': '🖥 Consult Computer',
    'acoes.tlac': '🧪 Rapid Test',
    'acoes.dsf': '📄 Generate Statement',
    'acoes.paciente': '↩ Back to patient',
    'pov.dica': 'Drag to look around · 1/2/3 switch point',
    'bulario.title': '🖥 Package inserts & guidelines',
    'bulario.close': 'Close',
    'bulario.pedido': 'Customer request',
    'bulario.prateleira': 'Shelf inserts',
    'bulario.diretrizes': 'Guidelines & alerts',
    'bulario.contraindicado': 'CONTRAINDICATED in this case',
    'bulario.teste': 'Rapid test indicated',

    // F3 — TLAC
    'tlac.title': '🧪 Rapid test (POCT)',
    'tlac.close': 'Close',
    'tlac.fazer': 'Perform rapid test',
    'tlac.naoIndicado': 'No rapid test indicated for this case — using the kit neither scores nor registers.',
    'tlac.passo1': 'Sanitize hands and prick the finger',
    'tlac.passo2': 'Collect the blood drop',
    'tlac.passo3': 'Insert the cassette into the device',
    'tlac.passo4': 'Add the reagent (buffer)',
    'tlac.passo5': 'Wait for the timer',
    'tlac.executar': 'Run',
    'tlac.aguardando': 'Reading the cassette…',
    'tlac.resultado': 'Result',
    'tlac.registrado': 'Result registered in the consultation.',

    // F4 — DSF
    'dsf.title': '📄 Pharmaceutical Services Statement',
    'dsf.close': 'Close',
    'dsf.paciente': 'Patient',
    'dsf.data': 'Date',
    'dsf.queixa': 'Complaint / request',
    'dsf.rapidas': 'Quick entries',
    'dsf.conduta': 'Pharmaceutical conduct',
    'dsf.orientacoes': 'Provided guidance',
    'dsf.encaminhamento': 'Referral',
    'dsf.emitir': 'Issue statement',
    'dsf.imprimir': '🖨 Print / PDF',
    'dsf.voltar': '← Edit',
    'dsf.doc.title': 'PHARMACEUTICAL SERVICES STATEMENT',
    'dsf.doc.sub': 'Pharmaceutical care — consultation record (Anvisa/CFF · fictional document for educational purposes)',
    'dsf.naoNecessario': 'Not needed',
    'dsf.er': 'emergency department',
    'dsf.stamp': 'DSF issued in the FarmaCheck simulator · content 100% fictional and educational — does not replace a real record (Anvisa/CFF).',
    'dsf.rapida.recusa': 'I refused to dispense the requested medicine (contraindicated) and urgently referred the patient to the emergency department, advised hydration and warning signs, and a DSF was issued for urgent referral.',
    'dsf.rapida.mip': 'Dispensed an over-the-counter (OTC) medicine with non-drug dietary guidance and a re-evaluation deadline.',
    'dsf.rapida.hidratacao': 'Advised hydration, rest and monitoring of warning signs.',
    'dsf.rapida.retorno': 'Advised returning to the service if symptoms worsen or persist beyond 3 days.',

    // Chat
    'chat.aguardando': 'Waiting for customer…',
    'chat.digitando': 'typing…',
    'chat.placeholder': 'Ask your next question…',
    'chat.enviar': 'Send',
    'chat.mic': 'Dictate (Ctrl+M)',
    'chat.logAria': 'Conversation with the customer',
    'chat.anos': '',
    'chat.cliente': 'Customer:',

    // Fases do HUD (chaves internas do motor)
    'fase.chegada': 'Arrival',
    'fase.anamnese': 'Anamnesis',
    'fase.decisao': 'Decision',
    'fase.avaliando': 'Evaluating',
    'fase.relatorio': 'Report',
    'hud.pontos': 'Points',

    // Cartões de fase (menu)
    'phase.aprendiz.nome': 'Counter Apprentice',
    'phase.aprendiz.desc': 'Three simple customers to learn the core loop. No critical red flags.',
    'phase.plantao.nome': 'Afternoon Shift',
    'phase.plantao.desc': 'Mixed cases with sales traps and the first warning signs.',
    'phase.emergencia.nome': 'Silent Emergency',
    'phase.emergencia.desc': 'Hidden serious conditions. Investigate deeply before selling anything.',
    'phase.livre.nome': 'Open Shift',
    'phase.livre.desc': 'Endless AI-randomized patients (llama.cpp). Points accumulate forever.',

    // Decisão clínica
    'decision.title': 'Clinical decision',
    'decision.voltar': '← back to anamnesis',
    'decision.redflags': '1 · Warning signs (only what you investigated)',
    'decision.condutaLegend': '2 · Conduct',
    'decision.vender.t': 'Sell the requested item',
    'decision.vender.s': 'hand over what the customer asked for',
    'decision.sugerir.t': 'Suggest another OTC',
    'decision.sugerir.s': 'over-the-counter medicine + guidance',
    'decision.encaminhar.t': 'Refer to emergency care',
    'decision.encaminhar.s': 'EMS 192 / emergency department',
    'decision.prateleira': 'Shelf — OTCs',
    'decision.orientNF': 'Non-pharmacological guidance',
    'decision.confirmar': 'Confirm conduct',
    'decision.encerrar': 'End anamnesis and decide the conduct →',
    'decision.confirmarVender': 'Confirm: sell the requested item',
    'decision.confirmarSugerir': 'Confirm: advise and dispense an OTC',
    'decision.confirmarEncaminhar': 'Confirm: refer to emergency care',

    // Mensagens de sistema do atendimento
    'sys.queixaRegistrada': 'Chief complaint and duration recorded.',
    'sys.lembreteTeste': 'Reminder: check on the computer whether a rapid test is needed.',
    'sys.redflag': 'Warning sign: ',
    'sys.investigado': 'Investigated — ',
    'sys.negado': ' (ruled out)',
    'sys.bulario': 'Package inserts/guidelines checked on the computer.',
    'sys.testeResultado': 'result ',
    'sys.testeExecutado': 'performed',
    'sys.dsfEmitida': 'DSF issued',
    'sys.dsfCom': 'DSF issued — ',

    // Posturas do avatar
    'pose.mao_no_peito': 'clutches his chest with one hand',
    'pose.curvado': 'bends over, as if the body were heavy',
    'pose.cabeca_baixa': 'drops his head, visibly tired',

    // Debriefing
    'debrief.tag.fatal': 'FATAL OUTCOME',
    'debrief.tag.grave': 'SEVERE OUTCOME',
    'debrief.tag.bom': 'GOOD OUTCOME',
    'debrief.tag.neutro': 'QUESTIONABLE CONDUCT',
    'debrief.tag.default': 'OUTCOME',
    'debrief.estrelas': 'Stars earned',
    'debrief.faltaPerguntar': 'Should have asked about: ',
    'debrief.alertaNaoInvestigado': 'Warning signs not investigated: ',
    'debrief.reprovado': 'FAILED — dispensed a contraindicated item (',
    'debrief.testePerdidoPre': 'Rapid test indicated (',
    'debrief.testePerdidoPos': ') but not performed (−30).',
    'debrief.arbovirose': 'Suspected arboviral infection not referred to the ER (−40).',
    'debrief.orientacao': 'Inadequate guidance for a self-limiting condition (−25).',
    'debrief.dsf': 'DSF not issued or with wrong conduct (−30).',
    'debrief.critico': 'CRITICAL ERROR — ',
    'debrief.perfeito': 'Complete anamnesis and appropriate conduct. A model consultation.',
    'debrief.stampCase': 'case',
    'debrief.stampTail': 'illustrative conduct — validate against package inserts and current protocols',

    // Rótulos do log exportado ao preceptor
    'log.farmaceutico': 'PHARMACIST',
    'log.paciente': 'PATIENT',

    // Hints de interação (tecla E)
    'hint.press': 'Press',
    'hint.default': 'to interact',
    'hint.computador': 'to use the computer (package inserts)',
    'hint.mesa': 'to run a rapid test (POCT)',
    'hint.paciente': 'to talk with the patient',

    // Alvos de interação por proximidade
    'alvo.paciente': 'patient',
    'alvo.computador': 'computer',
    'alvo.mesa': 'test table',

    // TLAC
    'tlac.kit': 'kit available on the tray',

    // Bulário — diretrizes fixas
    'bulario.dir1': 'OTC medicines: advise dose, schedule and maximum duration (reassess within 3–5 days without improvement).',
    'bulario.dir2': 'Alarm signs (persistent fever, bleeding, severe pain, vomiting) → refer to emergency care.',
    'bulario.dir3': 'Suspected arboviral infection: avoid ASA and NSAIDs — risk of bleeding and hemorrhagic complications.',

    // Config do servidor de IA / boot
    'cfg.testando': 'Testing…',
    'cfg.ok': 'Connected ✓',
    'cfg.falha': 'No response — the game will run in shift mode (deterministic)',
    'boot.preparando': 'Preparing the scene…',
    'boot.falha': 'Failed to load the 3D scene — reload the page',
    'fs.enter': 'Enter fullscreen',
    'fs.enterTitle': 'Fullscreen',
    'fs.exit': 'Exit fullscreen',
    'controls.hint': '🖱️ drag=look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>=walk · <kbd>E</kbd>=interact · <kbd>1</kbd>=patient <kbd>2</kbd>=PC <kbd>3</kbd>=test table · <kbd>R</kbd>=repeat line · <kbd>Esc</kbd>=close',
    'noscript': 'This game requires JavaScript enabled.',
  },
};

let lang = 'pt';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && dict[saved]) lang = saved;
} catch { /* storage indisponível */ }

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!dict[next]) return;
  const changed = lang !== next;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* noop */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  if (changed) document.dispatchEvent(new Event('farmacheck:langchange'));
}

export function t(key) {
  return dict[lang]?.[key] ?? dict.pt[key] ?? key;
}

/** Aplica traduções em todos os elementos marcados dentro de root. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  // HTML controlado (apenas traduções próprias do dicionário — nunca input do usuário)
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
}

export function initI18n() {
  setLang(lang);
  applyI18n(document);
}
