import assert from 'node:assert/strict';
import { CASES } from '../src/data/cases.js';
import {
  CHARACTER_VOICE_PROFILES,
  DEFAULT_CHARACTER_VOICE,
  getCharacterVoiceProfile,
  isSupportedCharacterVoice,
} from '../src/data/characterVoices.js';

const femaleCases = new Set([
  'marina_amoxicilina', 'ana_coriza', 'clara_cefaleia', 'helena_avc',
  'dona_rosa_hipotensao', 'bia_apendicite', 'carla_dengue', 'catia_dermatite',
]);
const maleCases = new Set([
  'nelson_infarto', 'jose_gripe', 'paulo_dor_lombar', 'joao_queimacao',
  'carlos_asma', 'roberto_dispepsia',
]);

assert.deepEqual(Object.keys(CHARACTER_VOICE_PROFILES).sort(), CASES.map((item) => item.id).sort(),
  'every clinical patient has a voice profile');
assert.equal(femaleCases.size + maleCases.size, CASES.length);

for (const patient of CASES) {
  const profile = CHARACTER_VOICE_PROFILES[patient.id];
  const expectedGender = femaleCases.has(patient.id) ? 'female' : 'male';
  assert.equal(profile.gender, expectedGender, `${patient.id} has the correct voice gender`);
  assert.match(profile.pt, expectedGender === 'female' ? /^pt-BR-(Francisca|Thalita)/ : /^pt-BR-Antonio/);
  assert.match(profile.en, expectedGender === 'female'
    ? /^en-US-(Ava|Jenny|Emma|Michelle|Aria|Ana)/
    : /^en-US-(Christopher|Andrew|Brian|Guy|Roger|Eric)/);
  assert.equal(getCharacterVoiceProfile(patient.id, 'pt').voice, profile.pt);
  assert.equal(getCharacterVoiceProfile(`${patient.id}_s12345`, 'en').voice, profile.en,
    'Free Shift variants keep their base character voice');
  assert.equal(isSupportedCharacterVoice(profile.pt), true);
  assert.equal(isSupportedCharacterVoice(profile.en), true);
}

for (const language of ['pt', 'en']) {
  const characterVoices = CASES.map((patient) => {
    const profile = getCharacterVoiceProfile(patient.id, language);
    const { rate = 1, pitch = 1 } = patient.persona?.voz || {};
    return `${profile.voice}|${rate}|${pitch}`;
  });
  assert.equal(new Set(characterVoices).size, CASES.length,
    `${language.toUpperCase()} voices remain individually distinguishable by neural identity and character prosody`);
}

assert.equal(getCharacterVoiceProfile('', 'pt').voice, DEFAULT_CHARACTER_VOICE.pt);
assert.equal(getCharacterVoiceProfile('', 'en').voice, DEFAULT_CHARACTER_VOICE.en);
assert.equal(isSupportedCharacterVoice('pt-BR'), true, 'legacy locale-only requests remain supported');
assert.equal(isSupportedCharacterVoice('en-US'), true, 'legacy locale-only requests remain supported');
assert.equal(isSupportedCharacterVoice('pt-BR-FakeNeural'), false, 'unknown voices are rejected');
console.log('PASS: all 14 patient voice assignments match gender, language, and Free Shift identity');
