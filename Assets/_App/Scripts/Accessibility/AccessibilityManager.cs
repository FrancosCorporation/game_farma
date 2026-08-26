using System;
using UnityEngine;

namespace FarmaCheck.Core
{
    public enum CueType
    {
        SinalDeAlerta,
        Sucesso,
        Aviso
    }

    public class AccessibilityManager : MonoBehaviour
    {
        public event Action<string> OnVoiceCommandReceived;

        public bool IsMicSupported => false;

        public void Speak(string texto)
        {
            #if UNITY_WEBGL && !UNITY_EDITOR
            // WebGL: usa Web Speech API (SpeechSynthesis)
            SpeakWebGL(texto);
            #else
            Debug.Log($"[Accessibility] Speak: {texto}");
            #endif
        }

        public void StartListening()
        {
            #if UNITY_WEBGL && !UNITY_EDITOR
            StartListeningWebGL();
            #else
            Debug.Log("[Accessibility] StartListening (STT não disponível fora do WebGL)");
            #endif
        }

        public void PlayCue(CueType tipo)
        {
            Debug.Log($"[Accessibility] PlayCue: {tipo}");
            // Aqui pode tocar um beep, vibração, etc.
        }

        #if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void SpeakWebGL(string texto);

        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void StartListeningWebGL();

        // Callback chamado do JS
        public void OnVoiceResult(string transcricao)
        {
            OnVoiceCommandReceived?.Invoke(transcricao);
        }
        #endif
    }
}
