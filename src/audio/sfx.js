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
  // clique de plástico (feed-back físico dos botões da capa): thud curto + tick agudo
  click: () => { tone(196, 0.05, 'square', 0.04); tone(2200, 0.022, 'triangle', 0.018, 0.003); },
  chime: () => { tone(659, 0.12, 'sine', 0.06); tone(880, 0.18, 'sine', 0.06, 0.12); },
  redFlag: () => { tone(392, 0.22, 'square', 0.05); tone(311, 0.3, 'square', 0.05, 0.18); },
  ding: () => { tone(880, 0.1, 'sine', 0.07); tone(1318, 0.2, 'sine', 0.07, 0.09); },
  buzz: () => tone(110, 0.5, 'sawtooth', 0.06),
  // Efeitos da dinâmica de plantão
  fanfare: () => {
    tone(523.25, 0.12, 'sine', 0.08, 0);       // C5
    tone(659.25, 0.12, 'sine', 0.08, 0.1);     // E5
    tone(783.99, 0.15, 'sine', 0.09, 0.2);     // G5
    tone(1046.50, 0.35, 'triangle', 0.10, 0.3); // C6
  },
  badge: () => {
    tone(440, 0.09, 'sine', 0.07, 0);          // A4
    tone(554.37, 0.09, 'sine', 0.07, 0.08);    // C#5
    tone(659.25, 0.18, 'triangle', 0.09, 0.16);// E5
    tone(880, 0.25, 'sine', 0.08, 0.24);       // A5
  },
  comboUp: () => {
    tone(493.88, 0.08, 'triangle', 0.06, 0);   // B4
    tone(587.33, 0.08, 'triangle', 0.07, 0.07);// D5
    tone(739.99, 0.18, 'sine', 0.08, 0.14);    // F#5
  },
  shiftComplete: () => {
    tone(392.00, 0.15, 'sine', 0.08, 0);       // G4
    tone(523.25, 0.15, 'sine', 0.08, 0.12);    // C5
    tone(659.25, 0.15, 'sine', 0.08, 0.24);    // E5
    tone(783.99, 0.30, 'triangle', 0.11, 0.36);// G5
    tone(1046.50, 0.45, 'sine', 0.12, 0.50);   // C6
  },

};