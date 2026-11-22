import assert from 'node:assert/strict';
import { renderTlacResult } from '../src/ui/tlacResult.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = '';
    this.textContent = '';
    this.hidden = true;
    this.children = [];
  }

  set innerHTML(_value) {
    throw new Error('innerHTML não deve ser usado no resultado do TLAC');
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName),
};

const t = (key) => `[${key}]`;
const malicious = '<img src=x onerror="alert(1)">';
const resultado = new FakeElement('div');

renderTlacResult(resultado, { resultado: malicious, positivo: true, t });
assert.equal(resultado.className, 'tlac-resultado tlac-positivo');
assert.equal(resultado.hidden, false);
assert.deepEqual(resultado.children.map((child) => child.tagName), ['b', 'span', 'small']);
assert.equal(resultado.children[0].textContent, '[tlac.resultado]:');
assert.equal(resultado.children[1].textContent, malicious.toUpperCase());
assert.equal(resultado.children[1].className, 'font-display font-black');
assert.equal(resultado.children[2].textContent, '[tlac.registrado]');
assert.equal(resultado.children[2].className, 'block mt-1 text-slate-400');

renderTlacResult(resultado, { resultado: 'negativo', positivo: false, t });
assert.equal(resultado.className, 'tlac-resultado tlac-negativo');
assert.equal(resultado.children[1].textContent, 'NEGATIVO');

renderTlacResult(resultado, { resultado: null, positivo: false, semResultado: true, t });
assert.equal(resultado.className, 'tlac-resultado tlac-neutro');
assert.equal(resultado.children.length, 2);
assert.equal(resultado.children[0].textContent, '[tlac.testeConcluido]');
assert.equal(resultado.children[1].textContent, '[tlac.semResultadoNota]');

console.log('✔ TLAC result: positive/negative layout and untrusted values rendered as text');
