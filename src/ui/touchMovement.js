/** Direcional virtual: mantém o mesmo movimento e colisões das teclas WASD. */
function supportsTouch() {
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return mobileUA
    || navigator.maxTouchPoints > 0
    || 'ontouchstart' in window
    || matchMedia('(any-pointer: coarse)').matches
    || matchMedia('(pointer: coarse)').matches;
}

export function initTouchMovement({ pov }) {
  const root = document.getElementById('touch-movement');
  if (!root) return { setEnabled() {} };

  const touch = supportsTouch();
  const activePointers = new Map();
  let enabled = false;

  const hasDirection = (direction) => [...activePointers.values()].includes(direction);
  const releasePointer = (pointerId) => {
    const direction = activePointers.get(pointerId);
    if (!direction) return;
    activePointers.delete(pointerId);
    if (!hasDirection(direction)) {
      pov.setTouchDirection(direction, false);
      root.querySelector(`[data-touch-move="${direction}"]`)?.setAttribute('aria-pressed', 'false');
    }
  };
  const releaseAll = () => {
    for (const pointerId of activePointers.keys()) releasePointer(pointerId);
  };

  root.querySelectorAll('[data-touch-move]').forEach((button) => {
    const direction = button.dataset.touchMove;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('pointerdown', (event) => {
      if (!enabled || event.button !== 0 || activePointers.has(event.pointerId)) return;
      event.preventDefault();
      activePointers.set(event.pointerId, direction);
      button.setAttribute('aria-pressed', 'true');
      pov.setTouchDirection(direction, true);
      try { button.setPointerCapture(event.pointerId); } catch { /* toque já cancelado pelo navegador */ }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, (event) => releasePointer(event.pointerId));
    }
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  const setEnabled = (on) => {
    enabled = Boolean(on && touch);
    root.hidden = !enabled;
    if (!enabled) releaseAll();
  };

  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
  setEnabled(false);
  return { setEnabled };
}
