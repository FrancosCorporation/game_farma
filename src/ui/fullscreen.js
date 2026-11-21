/** Botão persistente de tela cheia para celular e tablet. */
import { t } from './i18n.js';

let fullscreenAbort = null;

const expandIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const shrinkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>`;

function isTouchDevice() {
  return navigator.maxTouchPoints > 0
    || 'ontouchstart' in window
    || matchMedia('(any-pointer: coarse)').matches
    || matchMedia('(pointer: coarse)').matches;
}

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

export function initFullscreenButton() {
  if (fullscreenAbort && document.getElementById('btn-fullscreen')) {
    return document.getElementById('btn-fullscreen');
  }

  const ua = navigator.userAgent;
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1); // iPadOS em modo desktop
  const isMobileOrTablet = () => isTouchDevice() || mobileUA
    || window.innerWidth <= 1024 || window.innerHeight <= 768;
  if (!isMobileOrTablet()) return null;

  fullscreenAbort = new AbortController();
  const { signal } = fullscreenAbort;
  const wrapper = document.createElement('div');
  wrapper.id = 'fullscreen-controls';
  wrapper.className = 'fullscreen-controls';
  const btn = document.createElement('button');
  btn.id = 'btn-fullscreen';
  btn.type = 'button';
  btn.className = 'fs-btn';
  const status = document.createElement('span');
  status.id = 'fullscreen-status';
  status.className = 'fullscreen-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  wrapper.append(btn, status);

  const syncButton = () => {
    const active = isFullscreen();
    const label = active ? t('fs.exit') : t('fs.enter');
    btn.innerHTML = `${active ? shrinkIcon : expandIcon}<span>${t(active ? 'fs.exitShort' : 'fs.enterShort')}</span>`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(active));
    btn.title = label;
  };

  const positionButton = () => {
    const header = document.getElementById('hud');
    const headerBottom = header?.getBoundingClientRect().bottom || 56;
    wrapper.style.top = `${Math.max(56, Math.round(headerBottom) + 8)}px`;

    // Em tablets e celulares deitados, deixa o controle ao lado da cena, sem
    // cobrir o cabeçalho da conversa. Em retrato, o chat fica embaixo.
    const chat = document.getElementById('chat');
    const rect = chat?.getBoundingClientRect();
    const chatVisible = chat && rect && getComputedStyle(chat).visibility !== 'hidden'
      && getComputedStyle(chat).display !== 'none';
    const overlapsChat = chatVisible && rect.top < wrapper.getBoundingClientRect().bottom + 52
      && rect.right >= window.innerWidth - 2 && rect.left > 0;
    wrapper.style.right = overlapsChat ? `calc(${Math.ceil(window.innerWidth - rect.left)}px + 12px)` : '12px';
  };

  let statusTimer;
  const reportFailure = () => {
    status.textContent = t('fs.unavailable');
    status.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.hidden = true; }, 5000);
  };

  btn.addEventListener('click', async () => {
    try {
      if (isFullscreen()) {
        const exit = document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document);
        if (!exit) throw new Error('exit fullscreen unavailable');
        await exit();
        screen.orientation?.unlock?.();
      } else {
        const root = document.documentElement;
        const enter = root.requestFullscreen?.bind(root) || root.webkitRequestFullscreen?.bind(root);
        if (!enter) throw new Error('fullscreen unavailable');
        if (root.requestFullscreen) await enter({ navigationUI: 'hide' });
        else await enter();
        try {
          if (screen.orientation?.lock) await screen.orientation.lock('landscape');
        } catch (error) {
          console.warn('Orientação horizontal não pôde ser bloqueada:', error);
        }
      }
      syncButton();
    } catch (error) {
      console.warn('Tela cheia não suportada ou negada:', error);
      reportFailure();
    }
  }, { signal });

  const onFullscreenChange = () => {
    syncButton();
    if (!isFullscreen()) screen.orientation?.unlock?.();
    positionButton();
  };
  document.addEventListener('fullscreenchange', onFullscreenChange, { signal });
  document.addEventListener('webkitfullscreenchange', onFullscreenChange, { signal });
  document.addEventListener('farmacheck:langchange', syncButton, { signal });
  window.addEventListener('resize', positionButton, { signal });
  window.addEventListener('orientationchange', positionButton, { signal });

  const ui = document.getElementById('ui');
  if (ui) ui.appendChild(wrapper);
  syncButton();
  positionButton();
  return btn;
}

export function destroyFullscreenButton() {
  fullscreenAbort?.abort();
  fullscreenAbort = null;
  document.getElementById('fullscreen-controls')?.remove();
}
