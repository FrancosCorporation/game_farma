// O motor decide o que a IA pode saber. A LLM nunca vê fato bloqueado → não vaza.
// Padrões bilíngues: perguntas em PT ou EN classificam nos mesmos domínios.
import { getLang } from '../ui/i18n.js';

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const DOMAIN_TESTS = [
  ['duracao',      /(quanto tempo|ha quanto|desde quando|quando comecou|quantos dias|quantas horas|quando come|how long|since when|when did|when was|how many (days|hours)|started|begin)/],
  ['localizacao',  /(onde|em que lugar|no peito|torax|coracao|epigastr|garganta|estomago|barriga|cabeca|where|which part|what part|chest|throat|stomach|belly|tummy|epigastri|head)/],
  ['caracter',     /(como (e|esta|sente)|que tipo|aperta|queima|ardor|pontada|fisgada|peso|capacete|pulsa|lateja|what .* (like|feel)|kind of|burning|pressure|squeeze|squeez|sharp|stab|throb|tight|pulsat|aching|ache)/],
  ['irradiacao',   /(irradia|espalha|vai para|passa para|braco|mandibula|queixo|ombro|costas|radiat|spread|travel|move to|go to|going to|goes to|arm|jaw|chin|shoulder)/],
  ['intensidade',  /(intensidade|de zero|de 0 a|nota de|quao forte|forte|aguenta|intensity|from 0|zero to|scale|rate (it|your|the)|how (bad|severe|strong)|bearable|tolerate)/],
  ['fatores',      /(piora|melhora|deitado|deitar|comida|comer|comeu|alimentac|alimento|estragado|marmita|gordura|esforco|escada|esforcar|worse|better|worsen|reliev|lying down|lie down|after (eating|food)|diet|food|spoiled|packed meal|fatty|effort|stairs|exert|walking)/],
  ['associados',   /(suor|sua|nausea|enjoo|diarrei|vomito|sangr|hematoma|dor abdominal|dor.*barriga|barriga.*dor|barriga intensa|hipotens|tontura|desmaio|o que sente|sentindo|sintoma|falta de ar|respirar|engolir|tosse|coriza|placa|pus|amigdal|linfonodo|bolinha|sweat|nausea|queasy|diarrh|vomit|throw|bleed|bruis|abdominal pain|belly pain|stomach pain|postural|what .*feel|feeling|short(ness)? of breath|breathe|breathing|swallow|cough|runny nose|sneez|dizzy|dizziness|faint|syncope|spots?|pus|lump|blister|rash|symptoms)/],
  ['febre',        /(febre|temperatura|calor no corpo|termometro|escalafrio|fever|temperature|chills|thermometer)/],
  ['historico',    /(hiperten|pressao|diabet|colesterol|fuma|cigarro|tabag|coracao|cardiaco|infarto|doencas|historico|saude|trabalh|plantao|hospital|profiss|quanto.*pes|qual.*peso|seu peso|hypertension|blood pressure|diabet|cholesterol|smoke|cigarette|history|comorbidit|condition|heart|work|shift|job|occupation|hospital|how much.*weigh|what.*weight|your weight)/],
  ['medicamentos', /(remedio|medicacao|dipirona|\btoma\b|tomando|comprimido|uso continuo|antibiotico|amoxicilina|medicine|medication|meds|dipyrone|taking|pills?|drugs?|antibiotic|amoxicillin)/],
  ['alergias',     /(alerg|intoleran|reacao adversa|allerg|intoleran|adverse reaction)/],
  ['episodios',    /(outras vezes|ja teve|ja sentiu|antes|de vez em quando|recorrente|sempre|outra vez|before|other times|recurren|again|used to|ever had|previously)/],
  ['genero',       /(idade|quantos anos|age|how old)/],
];

const DOMAIN_LABELS = {
  pt: {
    duracao: 'duração do quadro', localizacao: 'localização da queixa', caracter: 'característica da queixa',
    irradiacao: 'irradiação', intensidade: 'intensidade', fatores: 'fatores de melhora/piora',
    associados: 'sintomas associados', febre: 'febre', historico: 'histórico e comorbidades',
    medicamentos: 'medicamentos em uso', alergias: 'alergias', episodios: 'episódios anteriores', genero: 'idade',
  },
  en: {
    duracao: 'duration of the problem', localizacao: 'location of the complaint', caracter: 'character of the complaint',
    irradiacao: 'radiation', intensidade: 'intensity', fatores: 'worsening/relieving factors',
    associados: 'associated symptoms', febre: 'fever', historico: 'history and comorbidities',
    medicamentos: 'current medications', alergias: 'allergies', episodios: 'previous episodes', genero: 'age',
  },
};

export function domainLabel(d) {
  const dict = DOMAIN_LABELS[getLang()] || DOMAIN_LABELS.pt;
  return dict[d] || d;
}

export function classify(text) {
  const q = norm(text);
  return DOMAIN_TESTS.filter(([, re]) => re.test(q)).map(([d]) => d);
}

// Os quatro sinais de dengue são investigados individualmente; as respostas
// negativas do caso só entram na conversa quando cada sinal é perguntado.
const WARNING_QUESTIONS = {
  dor_abdominal: /(dor abdominal|dor.*barriga|abdominal pain|belly pain|stomach pain)/,
  vomitos: /(vomit|throw(?:ing)? up|vomitando)/,
  sangramento: /(sangr|hematoma|bleed|bruis|nosebleed)/,
  hipotensao_postural: /(hipotens|tontura.*levanta|pressao.*levanta|desmai|postural|orthostatic|dizz.*stand|lightheaded.*stand|faint.*stand)/,
};

export function warningSignsFromQuestion(text) {
  const q = norm(text);
  return Object.entries(WARNING_QUESTIONS).filter(([, pattern]) => pattern.test(q)).map(([sign]) => sign);
}

export class KnowledgeState {
  constructor(caseDef) {
    this.case = caseDef;
    this.revealed = new Map();     // tag → fato (ordem de inserção = ordem de revelação)
    this.askedDomains = new Set();
    this.warningSignsAsked = new Set();
    this.attempts = new Map();     // contagem de abordagens p/ fatos relutantes
    this.turnsWithoutNews = 0;
    this.revealVoluntarios();
  }
  revealVoluntarios() {
    for (const f of this.case.fatos) if (f.nivel === 'voluntario') this.revealed.set(f.tag, f);
  }
  ask(text, domains) {
    const q = norm(text);
    if (this.case.id === 'carla_dengue') {
      warningSignsFromQuestion(q).forEach((sign) => this.warningSignsAsked.add(sign));
    }
    const novos = [], evasivas = [];
    for (const f of this.case.fatos) {
      if (this.revealed.has(f.tag) || !domains.includes(f.dominio)) continue;
      // Alguns domínios reúnem perguntas bem diferentes (ex.: náusea e
      // sangramento). Um fato com gatilho específico só responde ao tema certo.
      if (f.somenteGatilho && (!f.gatilho || !new RegExp(f.gatilho, 'i').test(q))) continue;
      if (f.nivel === 'relutante') {
        const direta = f.gatilho ? new RegExp(f.gatilho, 'i').test(q) : false;
        const tentativas = (this.attempts.get(f.tag) || 0) + 1;
        this.attempts.set(f.tag, tentativas);
        if (direta || tentativas >= 2) { this.revealed.set(f.tag, f); novos.push(f); }
        else evasivas.push(f);
      } else {
        this.revealed.set(f.tag, f); novos.push(f);
      }
    }
    domains.forEach((d) => this.askedDomains.add(d));
    if (!novos.length && !evasivas.length) this.turnsWithoutNews++;
    else this.turnsWithoutNews = 0;
    return { novos, evasivas };
  }
  recent(n, exclude = []) {
    const ex = new Set(exclude.map((f) => f.tag));
    return [...this.revealed.values()].filter((f) => !ex.has(f.tag)).slice(-n);
  }
}
