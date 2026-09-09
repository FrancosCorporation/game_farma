// Shell i18n (PT/EN) — conteúdo clínico permanece em PT-BR.
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
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* noop */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
}

export function t(key) {
  return dict[lang]?.[key] ?? dict.pt[key] ?? key;
}

/** Aplica traduções em todos os elementos marcados dentro de root. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
}

export function initI18n() {
  setLang(lang);
  applyI18n(document);
}
