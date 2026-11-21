const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function lockModalFocus(overlay) {
  const parent = overlay.parentElement;
  const siblings = parent ? [...parent.children].filter((el) => el !== overlay) : [];
  const oldInert = siblings.map((el) => [el, el.inert]);
  siblings.forEach((el) => { el.inert = true; });

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll(FOCUSABLE)]
      .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
    if (!items.length) {
      event.preventDefault();
      overlay.focus();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', onKeydown);

  return () => {
    overlay.removeEventListener('keydown', onKeydown);
    oldInert.forEach(([el, wasInert]) => { el.inert = wasInert; });
  };
}

export function restoreFocus(preferred, fallback) {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return;
  const canFocus = (el) => el instanceof HTMLElement
    && el !== document.body
    && el.isConnected
    && !el.matches(':disabled')
    && !el.closest('[hidden], [inert]')
    && el.tabIndex >= 0
    && el.getClientRects().length > 0;
  const target = canFocus(preferred) ? preferred : fallback;
  if (canFocus(target)) target.focus();
}

/** Owns the visible + focus-trap lifecycle for one modal overlay. */
export function createModalFocusSession(overlay) {
  let returnFocus = null;
  let releaseTrap = null;

  return {
    open() {
      if (!overlay || (!overlay.hidden && releaseTrap)) return false;
      returnFocus = document.activeElement;
      overlay.hidden = false;
      releaseTrap = lockModalFocus(overlay);
      return true;
    },
    close(fallback = null) {
      if (!overlay || (overlay.hidden && !releaseTrap)) return false;
      overlay.hidden = true;
      releaseTrap?.();
      releaseTrap = null;
      restoreFocus(returnFocus, fallback);
      returnFocus = null;
      return true;
    },
  };
}
