import assert from 'node:assert/strict';
import { renderScoreHud } from '../src/ui/scoreHud.js';

const element = { textContent: '', hidden: false };
const translate = (key) => (key === 'hud.pontos' ? 'Score' : key);

assert.doesNotThrow(() => renderScoreHud(null, 10, translate), 'missing HUD is a no-op');
renderScoreHud(element, 0, translate);
assert.equal(element.textContent, 'Score 0', 'zero points render on a fresh game');
renderScoreHud(element, 125, translate);
assert.equal(element.textContent, 'Score 125', 'updated points replace the previous value');
assert.equal(element.hidden, false, 'renderer leaves visibility ownership with its caller');

console.log('✔ score HUD: missing element, zero and updated score');
