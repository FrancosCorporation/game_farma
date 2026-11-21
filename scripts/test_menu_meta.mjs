import assert from 'node:assert/strict';
import { ACHIEVEMENTS } from '../src/core/achievements.js';
import { renderMenuMeta } from '../src/ui/menuMeta.js';
import { setLang, t } from '../src/ui/i18n.js';

const translate = (key) => key;
const box = () => ({ innerHTML: '' });

assert.doesNotThrow(() => renderMenuMeta(null, null, translate), 'ausência do contêiner é um no-op');

const fresh = box();
renderMenuMeta(fresh, null, translate);
assert.match(fresh.innerHTML, /rank\.Bronze/);
assert.match(fresh.innerHTML, /aria-valuenow="0"/);
assert.match(fresh.innerHTML, /menu\.meta\.comboZero/);
assert.match(fresh.innerHTML, new RegExp(`0\\/${ACHIEVEMENTS.length}`));
assert.match(fresh.innerHTML, /🔒/);

const middle = box();
renderMenuMeta(middle, {
  state: { pontos: 300, combo: 3 },
  unlockedBadges: () => ['primeiro_dia'],
}, translate);
assert.match(middle.innerHTML, /rank\.Prata/);
assert.match(middle.innerHTML, /200 menu\.meta\.para rank\.Ouro/);
assert.match(middle.innerHTML, /aria-valuenow="20"/);
assert.match(middle.innerHTML, /×1\.3/);
assert.match(middle.innerHTML, new RegExp(`1\\/${ACHIEVEMENTS.length}`));
assert.match(middle.innerHTML, /<li class="medalha on"[^>]*title="badge\.primeiro_dia\.desc"/);

const max = box();
renderMenuMeta(max, { state: { pontos: 900, combo: 0 } }, translate);
assert.match(max.innerHTML, /rank\.Diamante/);
assert.match(max.innerHTML, /menu\.meta\.max/);
assert.match(max.innerHTML, /aria-valuenow="100"/);
assert.match(max.innerHTML, /menu\.meta\.comboZero/);

globalThis.document = { documentElement: {}, dispatchEvent() {} };
const localizedProgress = { state: {}, unlockedBadges: () => ['primeiro_dia'] };
setLang('pt');
const portuguese = box();
renderMenuMeta(portuguese, localizedProgress, t);
assert.match(portuguese.innerHTML, /aria-label="Primeiro plantão — Desbloqueada\./);
assert.match(portuguese.innerHTML, /aria-label="Atendimento-modelo — Bloqueada\./);

setLang('en');
const english = box();
renderMenuMeta(english, localizedProgress, t);
assert.match(english.innerHTML, /aria-label="First shift — Unlocked\./);
assert.match(english.innerHTML, /aria-label="Model consultation — Locked\./);

console.log('✔ menu meta cobre rank, combo e status acessível de conquistas PT/EN');
