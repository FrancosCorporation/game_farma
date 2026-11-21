import assert from 'node:assert/strict';
import { showGameMenu } from '../src/ui/gameMenu.js';

const events = [];
const selectedButton = { focus: () => events.push('focus-selected-phase') };
const element = (hidden = false) => ({ hidden });
const elements = {
  decision: element(false),
  'plantao-modal': element(false),
  'hud-fila': element(false),
  menu: element(true),
  'phase-select': {
    querySelector(selector) {
      events.push(`query:${selector}`);
      return selectedButton;
    },
  },
};

showGameMenu(elements, () => events.push('render-phases'));

assert.equal(elements.decision.hidden, true);
assert.equal(elements['plantao-modal'].hidden, true);
assert.equal(elements['hud-fila'].hidden, true);
assert.equal(elements.menu.hidden, false);
assert.deepEqual(events, [
  'render-phases',
  'query:button[aria-pressed="true"]',
  'focus-selected-phase',
]);

const withoutOptionalPanels = {
  decision: element(false),
  menu: element(true),
  'phase-select': { querySelector: () => null },
};
assert.doesNotThrow(() => showGameMenu(withoutOptionalPanels, () => {}));
assert.equal(withoutOptionalPanels.decision.hidden, true);
assert.equal(withoutOptionalPanels.menu.hidden, false);

console.log('PASS game menu: hides encounter panels, renders phases, restores selected focus');
