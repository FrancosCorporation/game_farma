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
  ['fatores',      /(piora|melhora|deitado|deitar|comida|comer|gordura|esforco|escada|esforcar|worse|better|worsen|reliev|lying down|lie down|after (eating|food)|fatty|effort|stairs|exert|walking)/],
  ['associados',   /(suor|sua|nausea|enjoo|vomito|falta de ar|respirar|engolir|tosse|coriza|tontura|desmaio|placa|pus|amigdal|linfonodo|bolinha|sweat|nausea|queasy|vomit|throw|short(ness)? of breath|breathe|breathing|swallow|cough|runny nose|sneez|dizzy|dizziness|faint|syncope|spots?|pus|lump|blister|rash|symptoms)/],
  ['febre',        /(febre|temperatura|calor no corpo|termometro|escalafrio|fever|temperature|chills|thermometer)/],
  ['historico',    /(hiperten|pressao|diabet|colesterol|fuma|cigarro|tabag|coracao|cardiaco|infarto|doencas|historico|saude|hypertension|blood pressure|diabet|cholesterol|smoke|cigarette|history|comorbidit|condition|heart)/],
  ['medicamentos', /(remedio|medicacao|\btoma\b|tomando|comprimido|uso continuo|antibiotico|amoxicilina|medicine|medication|meds|taking|pills?|drugs?|antibiotic|amoxicillin)/],
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

export class KnowledgeState {
  constructor(caseDef) {
    this.case = caseDef;
    this.revealed = new Map();     // tag → fato (ordem de inserção = ordem de revelação)
    this.askedDomains = new Set();
    this.attempts = new Map();     // contagem de abordagens p/ fatos relutantes
    this.turnsWithoutNews = 0;
    this.revealVoluntarios();
  }
  revealVoluntarios() {
    for (const f of this.case.fatos) if (f.nivel === 'voluntario') this.revealed.set(f.tag, f);
  }
  ask(text, domains) {
    const q = norm(text);
    const novos = [], evasivas = [];
    for (const f of this.case.fatos) {
      if (this.revealed.has(f.tag) || !domains.includes(f.dominio)) continue;
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
