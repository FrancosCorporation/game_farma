import assert from 'node:assert/strict';
import { listSavedDsf, saveDsf } from '../src/core/dsfStorage.js';

const data = new Map();
const storage = {
  getItem: (key) => data.get(key) || null,
  setItem: (key, value) => data.set(key, value),
};
assert.deepEqual(listSavedDsf(storage), []);
const record = { caseId: 'carla_dengue', patient: 'Mariana', date: '2026-11-22', conduct: 'Encaminhei.' };
const saved = saveDsf(record, storage);
assert.ok(saved.id && saved.savedAt);
assert.equal(listSavedDsf(storage)[0].conduct, 'Encaminhei.');
saveDsf({ ...saved, conduct: 'Encaminhei à UBS.' }, storage);
assert.equal(listSavedDsf(storage).length, 1, 'salvar novamente atualiza o registro');
assert.equal(listSavedDsf(storage)[0].conduct, 'Encaminhei à UBS.');
data.set('farmacheck:dsf:v1', 'broken');
assert.deepEqual(listSavedDsf(storage), [], 'dados inválidos não travam o atendimento');
console.log('PASS: DSF salva e recuperada dentro do jogo');
