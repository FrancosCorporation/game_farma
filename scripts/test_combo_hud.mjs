import assert from 'node:assert/strict';
import { renderComboHud } from '../src/ui/comboHud.js';

const translate = (key) => key;
const el = () => ({ hidden: false, textContent: 'stale', title: 'old' });

assert.doesNotThrow(() => renderComboHud(null, 2, translate), 'ausência do elemento é um no-op');

const hidden = el();
renderComboHud(hidden, 0, translate);
assert.equal(hidden.hidden, true);
assert.equal(hidden.textContent, '');
assert.equal(hidden.title, 'old', 'esconder o combo preserva o título existente');

const visible = el();
renderComboHud(visible, 3, translate);
assert.equal(visible.hidden, false);
assert.equal(visible.textContent, 'hud.combo ×1.3 · 3hud.comboSeguidos');
assert.equal(visible.title, 'hud.comboTitle');

renderComboHud(visible, 0, translate);
assert.equal(visible.hidden, true);
assert.equal(visible.textContent, '', 'zerar combo remove texto anterior');

console.log('✔ combo HUD cobre ausência, combo zerado, render positivo e retorno a zero');
