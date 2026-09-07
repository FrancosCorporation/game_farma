let ctx = null;
const ensure = () => {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
  return ctx;
};
function tone(freq, dur = 0.15, type = 'sine', gain = 0.07, delay = 0) {
  const c = ensure(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
export const SFX = {
  ensure,
  pop: () => tone(520, 0.06, 'triangle', 0.03),
  chime: () => { tone(659, 0.12, 'sine', 0.06); tone(880, 0.18, 'sine', 0.06, 0.12); },
  redFlag: () => { tone(392, 0.22, 'square', 0.05); tone(311, 0.3, 'square', 0.05, 0.18); },
  ding: () => { tone(880, 0.1, 'sine', 0.07); tone(1318, 0.2, 'sine', 0.07, 0.09); },
  buzz: () => tone(110, 0.5, 'sawtooth', 0.06),
};