import assert from 'node:assert/strict';
import { showAnamnesisPanel, showDecisionPanel } from '../src/ui/decisionPanel.js';

const events = [];
const chatInput = {
  disabled: false,
  focus() { events.push('focus-input'); },
};
const chatChips = { innerHTML: '<button>old</button>' };
const decisionButton = { hidden: false };
const redFlagList = { id: 'red-flags' };
const mipBox = { hidden: false };
const confirmButton = { disabled: false };
const heading = { focus() { events.push('focus-heading'); } };
const panel = {
  hidden: true,
  querySelector(selector) {
    assert.equal(selector, 'h2');
    return heading;
  },
};
const cards = [{ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
  { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }];
const documentRef = {
  querySelectorAll(selector) {
    assert.equal(selector, '#conduta-cards [data-conduta]');
    return cards;
  },
};
const facts = [{ tag: 'alergia', valor: true }];
const revealed = new Set(['alergia']);
const translate = (key) => key;

showDecisionPanel({
  chatInput, chatChips, decisionButton, redFlagList, mipBox, confirmButton, panel,
  facts, revealed, translate, documentRef,
  renderFlags(list, actualFacts, actualRevealed, actualTranslate) {
    events.push('render-flags');
    assert.equal(list, redFlagList);
    assert.equal(actualFacts, facts);
    assert.equal(actualRevealed, revealed);
    assert.equal(actualTranslate, translate);
  },
});

assert.equal(chatInput.disabled, true);
assert.equal(chatChips.innerHTML, '');
assert.equal(decisionButton.hidden, true);
assert.deepEqual(cards.map((button) => button.attributes['aria-pressed']), ['false', 'false']);
assert.equal(mipBox.hidden, true);
assert.equal(confirmButton.disabled, true);
assert.equal(panel.hidden, false);
assert.deepEqual(events, ['render-flags', 'focus-heading'], 'a decisão revela achados antes de focar o título');

events.length = 0;
showAnamnesisPanel({
  panel, chatInput, decisionButton,
  renderChips() { events.push('render-chips'); },
});
assert.equal(panel.hidden, true);
assert.equal(chatInput.disabled, false);
assert.equal(decisionButton.hidden, false);
assert.deepEqual(events, ['render-chips', 'focus-input'], 'a volta restaura os chips antes de devolver o foco');

console.log('✔ decision panel: estados visuais, achados e foco preservados na ida/volta');
