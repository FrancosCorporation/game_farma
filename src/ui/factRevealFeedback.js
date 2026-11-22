import { t as defaultTranslate } from './i18n.js';

/** Apply visual, audio and chat feedback for a newly revealed case fact. */
export function applyFactRevealFeedback(fact, {
  avatar,
  fx,
  patientName = '',
  playRedFlag = () => {},
  addSystem = () => {},
  translate = defaultTranslate,
} = {}) {
  if (fact.redFlag && fact.valor) {
    playRedFlag();
    fx?.pulse?.();
    addSystem(`${translate('sys.redflag')}${fact.rotulo}`, true);
    avatar?.setMood?.('dolorido');
  } else if (fact.valor === false) {
    addSystem(`${translate('sys.investigado')}${fact.rotulo}`);
  }

  if (fact.postura) {
    avatar?.setPose?.(fact.postura);
    addSystem(`${patientName} ${translate(`pose.${fact.postura}`)}.`);
  }
}
