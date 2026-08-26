// =============================================================================
// FarmaCheckAccessibility.jslib
// Ponte entre o C# do Unity e as APIs nativas do navegador (Web Speech API):
// - TTS: speechSynthesis + região aria-live para leitores de tela (NVDA etc.)
// - STT: SpeechRecognition (Chrome/Edge/Safari), idioma pt-BR
//
// Regras do projeto:
// - O GameObject do AccessibilityManager deve se chamar "AccessibilityBridge".
// - O template WebGL padrão expõe a instância como `unityInstance` global,
//   o que permite usar unityInstance.SendMessage() aqui.
// =============================================================================

mergeInto(LibraryManager.library, {

  // ---------------------------------------------------------------------------
  // Fala um texto em pt-BR e publica o texto na região aria-live da página.
  // Se a região ainda não existir, ela é criada dinamicamente (funciona com
  // qualquer template, inclusive o padrão da Unity).
  // ---------------------------------------------------------------------------
  FarmaCheck_Speak: function (textoPtr) {
    var texto = UTF8ToString(textoPtr);

    // 1) Garante a existência da região oculta lida pelos leitores de tela.
    var regiao = document.getElementById('farmacheck-live-region');
    if (!regiao) {
      regiao = document.createElement('div');
      regiao.id = 'farmacheck-live-region';
      regiao.setAttribute('aria-live', 'polite');
      regiao.setAttribute('role', 'log');
      regiao.style.position = 'absolute';
      regiao.style.left = '-9999px';   // Invisível, mas legível por NVDA/VoiceOver
      regiao.style.width = '1px';
      regiao.style.height = '1px';
      regiao.style.overflow = 'hidden';
      document.body.appendChild(regiao);
    }
    regiao.textContent = texto;

    // 2) Sintetiza a voz em português do Brasil.
    var sintetizador = window.speechSynthesis;
    if (sintetizador) {
      try { sintetizador.cancel(); } catch (e) {} // Interrompe fala anterior
      var utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      sintetizador.speak(utterance);
    }
  },

  // ---------------------------------------------------------------------------
  // Interrompe qualquer síntese de fala em andamento.
  // ---------------------------------------------------------------------------
  FarmaCheck_StopSpeaking: function () {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },

  // ---------------------------------------------------------------------------
  // Retorna 1 se o navegador suporta Speech Recognition, senão 0.
  // (Firefox não suporta; Chrome, Edge e Safari suportam.)
  // ---------------------------------------------------------------------------
  FarmaCheck_SpeechRecognitionAvailable: function () {
    return (window.SpeechRecognition || window.webkitSpeechRecognition) ? 1 : 0;
  },

  // ---------------------------------------------------------------------------
  // Inicia o reconhecimento de voz em pt-BR. Ao final, envia a transcrição
  // de volta para o Unity via SendMessage no GameObject "AccessibilityBridge".
  // ---------------------------------------------------------------------------
  FarmaCheck_Listen: function () {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // Cancela um reconhecimento anterior, se houver.
    if (window.farmacheckRecognition) {
      try { window.farmacheckRecognition.abort(); } catch (e) {}
    }

    var recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;  // Só resultados finais
    recognition.maxAlternatives = 1;

    recognition.onresult = function (evento) {
      var transcricao = evento.results[0][0].transcript;
      if (window.unityInstance) {
        window.unityInstance.SendMessage(
          'AccessibilityBridge',
          'OnSpeechResult',
          transcricao
        );
      }
    };

    recognition.onerror = function () {
      // Permissão negada, sem microfone etc.: silencioso para o jogador.
    };

    recognition.onend = function () {
      window.farmacheckRecognition = null;
    };

    recognition.start();
    window.farmacheckRecognition = recognition;
  },

  // ---------------------------------------------------------------------------
  // Cancela o reconhecimento de voz em andamento.
  // ---------------------------------------------------------------------------
  FarmaCheck_StopListening: function () {
    if (window.farmacheckRecognition) {
      try { window.farmacheckRecognition.abort(); } catch (e) {}
      window.farmacheckRecognition = null;
    }
  }
});
