// Microsoft Edge neural voice profiles for the FarmaCheck patient cast.
// Brazilian Portuguese currently offers one male and two female identities;
// character rate/pitch adds a restrained distinction while preserving PT-BR.
export const CHARACTER_VOICE_PROFILES = Object.freeze({
  nelson_infarto: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-ChristopherNeural' }),
  marina_amoxicilina: Object.freeze({ gender: 'female', pt: 'pt-BR-ThalitaMultilingualNeural', en: 'en-US-AvaNeural' }),
  jose_gripe: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-AndrewNeural' }),
  ana_coriza: Object.freeze({ gender: 'female', pt: 'pt-BR-FranciscaNeural', en: 'en-US-JennyNeural' }),
  clara_cefaleia: Object.freeze({ gender: 'female', pt: 'pt-BR-ThalitaMultilingualNeural', en: 'en-US-MichelleNeural' }),
  paulo_dor_lombar: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-BrianNeural' }),
  joao_queimacao: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-GuyNeural' }),
  helena_avc: Object.freeze({ gender: 'female', pt: 'pt-BR-FranciscaNeural', en: 'en-US-MichelleNeural' }),
  dona_rosa_hipotensao: Object.freeze({ gender: 'female', pt: 'pt-BR-ThalitaMultilingualNeural', en: 'en-US-AriaNeural' }),
  carlos_asma: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-RogerNeural' }),
  bia_apendicite: Object.freeze({ gender: 'female', pt: 'pt-BR-FranciscaNeural', en: 'en-US-AvaNeural' }),
  carla_dengue: Object.freeze({ gender: 'female', pt: 'pt-BR-ThalitaMultilingualNeural', en: 'en-US-JennyNeural' }),
  roberto_dispepsia: Object.freeze({ gender: 'male', pt: 'pt-BR-AntonioNeural', en: 'en-US-EricNeural' }),
  catia_dermatite: Object.freeze({ gender: 'female', pt: 'pt-BR-FranciscaNeural', en: 'en-US-AnaNeural' }),
});

export const DEFAULT_CHARACTER_VOICE = Object.freeze({
  gender: 'female', pt: 'pt-BR-FranciscaNeural', en: 'en-US-EmmaNeural',
});

export function getCharacterVoiceProfile(caseId, language = 'pt') {
  const profile = CHARACTER_VOICE_PROFILES[String(caseId || '').replace(/_s\d+$/, '')]
    || DEFAULT_CHARACTER_VOICE;
  return { ...profile, voice: language === 'en' ? profile.en : profile.pt };
}

export function isSupportedCharacterVoice(voice) {
  return voice === 'pt-BR' || voice === 'en-US'
    || Object.values(CHARACTER_VOICE_PROFILES).some((profile) => profile.pt === voice || profile.en === voice)
    || DEFAULT_CHARACTER_VOICE.pt === voice || DEFAULT_CHARACTER_VOICE.en === voice;
}
