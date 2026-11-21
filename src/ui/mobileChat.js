import { getLang } from './i18n.js';

// A conversa ocupa parte da tela; o jogador pode recolhê-la para ver o cenário.
export function initMobileChat(camera) {
  const button = document.getElementById('btn-chat-toggle');
  const chat = document.getElementById('chat');
  if (!button || !chat) return { setAtendimento() {} };
  const compact = matchMedia('(max-width: 639px), (max-height: 500px) and (max-width: 1000px)');
  let collapsed = false;
  let active = false;

  const frameScene = () => {
    if (!camera) return;
    const sidePanel = matchMedia('(orientation: landscape) and (max-height: 500px)').matches
      && compact.matches && active && !collapsed;
    if (sidePanel) {
      const chatWidth = chat.getBoundingClientRect().width;
      camera.setViewOffset(window.innerWidth, window.innerHeight, chatWidth / 2, 0,
        window.innerWidth, window.innerHeight);
      return;
    }
    if (compact.matches && window.innerWidth < 640 && active && !collapsed) {
      // Centra a paciente na área livre acima do chat, sem mover o POV no mundo.
      const offset = Math.max(0, (chat.getBoundingClientRect().height - 56) / 2);
      camera.setViewOffset(window.innerWidth, window.innerHeight, 0, offset, window.innerWidth, window.innerHeight);
    } else {
      camera.clearViewOffset();
    }
  };

  const label = () => {
    const english = getLang() === 'en';
    button.textContent = collapsed ? (english ? 'Chat' : 'Conversar') : (english ? 'Scene' : 'Ver cena');
    button.title = collapsed ? (english ? 'Open conversation' : 'Abrir conversa')
      : (english ? 'Show the scene' : 'Ampliar o cenário');
    button.setAttribute('aria-expanded', String(!collapsed));
  };
  const setCollapsed = (value) => {
    collapsed = compact.matches && value;
    document.body.classList.toggle('mobile-chat-collapsed', collapsed);
    label();
    frameScene();
  };
  button.addEventListener('click', () => setCollapsed(!collapsed));
  chat.addEventListener('focusin', (event) => {
    if (event.target !== button) setCollapsed(false);
  });
  document.getElementById('btn-hud-paciente')?.addEventListener('click', () => setCollapsed(false));
  compact.addEventListener('change', () => setCollapsed(false));
  window.addEventListener('resize', frameScene);
  document.addEventListener('farmacheck:langchange', label);
  label();

  return {
    setAtendimento(on) {
      document.body.classList.toggle('in-atendimento', on);
      const wasActive = active;
      active = on;
      if (!on || !wasActive) setCollapsed(false);
    },
  };
}
