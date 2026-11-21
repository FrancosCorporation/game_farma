import assert from 'node:assert/strict';
import { renderDebriefPanel } from '../src/ui/debrief.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.className = '';
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.focused = false;
  }
  appendChild(child) { this.children.push(child); return child; }
  focus() { this.focused = true; }
}

const keys = new Map();
globalThis.document = { createElement(tag) { return new Element(tag); } };
const names = [
  'debrief-tag', 'debrief-stars', 'debrief-titulo', 'debrief-texto', 'debrief-pontos',
  'debrief-breakdown', 'debrief-detalhes', 'debrief-conquistas', 'debrief-stamp',
  'decision', 'debrief',
];
for (const name of names) keys.set(name, new Element(name));
keys.get('debrief').querySelector = (selector) => selector === 'h2' ? keys.get('debrief-heading') : null;
keys.set('debrief-heading', new Element('h2'));

const elements = Object.fromEntries(names.map((name) => [name, keys.get(name)]));
elements.debrief.querySelector = keys.get('debrief').querySelector;
const translate = (key) => `[${key}]`;
let visibility;
renderDebriefPanel({
  elements,
  outcome: { desfecho: 'bom', titulo: 'Consulta segura', texto: 'Encaminhamento e orientações.' },
  result: {
    total: 95,
    breakdown: [
      { metrica: 'queixa_principal', label: 'Queixa', pontos: 20 },
      { metrica: 'sinais_alarme', label: 'Sinais de alerta', pontos: -10 },
    ],
    missedDomains: [], missedRed: [], criticals: [], reprovado: false,
    testeRapidoPerdido: false, arboviroseNaoEncaminhada: false,
    orientacaoInadequada: false, dsfOk: true,
  },
  stars: 2,
  registration: { mult: 1.3, ganhos: 124, combo: 2, comboQuebrou: false, novasBadges: ['primeiro_dia'] },
  caseDef: { id: 'caso-ficticio', version: 3 },
  points: 360,
  phases: [{ id: 'aprendiz' }, { id: 'plantao' }],
  newlyUnlockedPhase: 1,
  seed: 42,
  translate,
  setVisible(value) { visibility = value; },
});

assert.equal(elements['debrief-tag'].textContent, '[debrief.tag.bom]');
assert.match(elements['debrief-tag'].className, /text-teal-200/);
assert.equal((elements['debrief-stars'].innerHTML.match(/class="star on"/g) || []).length, 2);
assert.equal(elements['debrief-titulo'].textContent, 'Consulta segura');
assert.equal(elements['debrief-pontos'].textContent, '95 / 100');
assert.match(elements['debrief-breakdown'].innerHTML, /width:100%; background:#ef4444/);
assert.deepEqual(elements['debrief-detalhes'].children.map((item) => item.textContent), ['[debrief.perfeito]']);
assert.match(elements['debrief-conquistas'].innerHTML, /phase\.plantao\.nome/);
assert.match(elements['debrief-conquistas'].innerHTML, /badge\.primeiro_dia\.desc/);
assert.equal(elements['debrief-conquistas'].hidden, false);
assert.match(elements['debrief-stamp'].textContent, /caso-ficticio v3 · seed 42/);
assert.equal(elements.decision.hidden, true);
assert.equal(visibility, true);
assert.equal(keys.get('debrief-heading').focused, true);

console.log('✔ debrief panel renders outcome, scores, details, progression and focus');
