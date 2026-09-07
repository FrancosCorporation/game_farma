// O motor decide o que a IA pode saber. A LLM nunca vê fato bloqueado → não vaza.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const DOMAIN_TESTS = [
  ['duracao',      /(quanto tempo|ha quanto|desde quando|quando comecou|quantos dias|quantas horas|quando come)/],
  ['localizacao',  /(onde|em que lugar|no peito|torax|coracao|epigastr|garganta|estomago|barriga|cabeca)/],
  ['caracter',     /(como (e|esta|sente)|que tipo|aperta|queima|ardor|pontada|fisgada|peso|capacete|pulsa|lateja)/],
  ['irradiacao',   /(irradia|espalha|vai para|passa para|braco|mandibula|queixo|ombro|costas)/],
  ['intensidade',  /(intensidade|de zero|de 0 a|nota de|quao forte|forte|aguenta)/],
  ['fatores',      /(piora|melhora|deitado|deitar|comida|comer|gordura|esforco|escada|esforcar)/],
  ['associados',   /(suor|sua|nausea|enjoo|vomito|falta de ar|respirar|engolir|tosse|coriza|tontura|desmaio|placa|pus|amigdal|linfonodo|bolinha)/],
  ['febre',        /(febre|temperatura|calor no corpo|termometro|escalafrio)/],
  ['historico',    /(hiperten|pressao|diabet|colesterol|fuma|cigarro|tabag|coracao|cardiaco|infarto|doencas|historico|saude)/],
  ['medicamentos', /(remedio|medicacao|toma|tomando|comprimido|uso continuo|antibiotico|amoxicilina)/],
  ['alergias',     /(alerg|intoleran|reacao adversa)/],
  ['episodios',    /(outras vezes|ja teve|ja sentiu|antes|de vez em quando|recorrente|sempre|outra vez)/],
  ['genero',       /(idade|quantos anos)/],
];

export const DOMAIN_LABELS = {
  duracao: 'duração do quadro', localizacao: 'localização da queixa', caracter: 'característica da queixa',
  irradiacao: 'irradiação', intensidade: 'intensidade', fatores: 'fatores de melhora/piora',
  associados: 'sintomas associados', febre: 'febre', historico: 'histórico e comorbidades',
  medicamentos: 'medicamentos em uso', alergias: 'alergias', episodios: 'episódios anteriores', genero: 'idade',
};

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