/**
 * Fullscreen button for mobile/tablet devices
 * Shows a button in the bottom-right corner on mobile/tablet devices
 * to enter fullscreen mode (like F11 on desktop)
 */

export function initFullscreenButton() {
  // Detect mobile/tablet: touch-capable or small viewport
  const isMobileOrTablet = () => {
    const ua = navigator.userAgent;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSmallViewport = window.innerWidth <= 1024 || window.innerHeight <= 768;
    return isTouch || isMobileUA || isSmallViewport;
  };

  // Don't show on desktop
  if (!isMobileOrTablet()) return;

  // Create button element
  const btn = document.createElement('button');
  btn.id = 'btn-fullscreen';
  btn.setAttribute('aria-label', 'Entrar em tela cheia');
  btn.title = 'Tela cheia';
  btn.className = 'fs-btn';
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
      <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
      <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
      <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
    </svg>
  `;

  // Style for the button - positioned fixed bottom-right
  btn.style.cssText = `
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 9999;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(13, 148, 136, 0.9);
    color: #ecfeff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Hover/touch feedback
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.05)';
    btn.style.background = 'rgba(13, 148, 136, 1)';
    btn.style.boxShadow = '0 6px 24px rgba(13, 148, 136, 0.4)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.background = 'rgba(13, 148, 136, 0.9)';
    btn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
  });
  btn.addEventListener('touchstart', () => {
    btn.style.transform = 'scale(0.95)';
  });
  btn.addEventListener('touchend', () => {
    btn.style.transform = 'scale(1)';
  });

  // Fullscreen handler
  btn.addEventListener('click', async () => {
    try {
      const elem = document.documentElement;
      if (!document.fullscreenElement) {
        await elem.requestFullscreen({ navigationUI: 'hide' });
        // Update icon to exit fullscreen
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 14h6"/>
            <path d="M20 14h-6"/>
            <path d="M14 4v6"/>
            <path d="M10 20v-6"/>
          </svg>
        `;
        btn.setAttribute('aria-label', 'Sair da tela cheia');
        btn.title = 'Sair da tela cheia';
      } else {
        await document.exitFullscreen();
        // Update icon to enter fullscreen
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        `;
        btn.setAttribute('aria-label', 'Entrar em tela cheia');
        btn.title = 'Tela cheia';
      }
    } catch (err) {
      console.warn('Fullscreen não suportado ou negado:', err);
    }
  });

  // Listen for fullscreen changes (e.g., user presses ESC)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
          <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
          <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
      `;
      btn.setAttribute('aria-label', 'Entrar em tela cheia');
      btn.title = 'Tela cheia';
    }
  });

  // Add to UI container
  const ui = document.getElementById('ui');
  if (ui) {
    ui.appendChild(btn);
  }

  // Handle orientation change / resize to show/hide on desktop resize
  const checkVisibility = () => {
    const shouldShow = isMobileOrTablet();
    btn.style.display = shouldShow ? 'flex' : 'none';
  };
  window.addEventListener('resize', checkVisibility);
  checkVisibility();

  return btn;
}

export function destroyFullscreenButton() {
  const btn = document.getElementById('btn-fullscreen');
  if (btn) btn.remove();
}