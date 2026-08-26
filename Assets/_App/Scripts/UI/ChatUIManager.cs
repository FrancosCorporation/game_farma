using System;
using System.Collections;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using FarmaCheck.API;
// using FarmaCheck.Accessibility;
using FarmaCheck.Core;

namespace FarmaCheck.UI
{
    /// <summary>
    /// Controla toda a interface do consultório: janela de chat, campo de digitação,
    /// botão de envio, botão de microfone (STT) e rolagem automática das mensagens.
    /// Separação de responsabilidades: a lógica de negócio fica no LLMClient/GameManager;
    /// esta classe cuida APENAS da apresentação (padrão MVC básico).
    /// </summary>
    public class ChatUIManager : MonoBehaviour
    {
        [Header("Referências principais")]
        [SerializeField] private LLMClient llmClient;
        [SerializeField] private AccessibilityManager accessibility;

        [Header("Componentes do chat")]
        [SerializeField] private TMP_InputField campoEntrada;
        [SerializeField] private Button botaoEnviar;
        [SerializeField] private Button botaoMicrofone;
        [SerializeField] private ScrollRect scrollChat;
        [SerializeField] private Transform conteudoChat;

        [Header("Prefabs")]
        [Tooltip("Prefab MessageBubble com o componente MessageBubbleView na raiz.")]
        [SerializeField] private MessageBubbleView prefabBalaoMensagem;
        [Tooltip("Balão simples com o texto 'Paciente digitando...' (opcional).")]
        [SerializeField] private GameObject prefabIndicadorDigitando;

        private GameObject indicadorAtual;
        private bool entradaBloqueada;

        private void Start()
        {
            // Fallback para testar a cena "Consultorio" direto (sem passar pelo Menu).
            var caso = GameManager.Instance != null ? GameManager.Instance.CurrentCase : null;
            if (caso == null)
            {
                Debug.LogWarning("[ChatUI] Nenhum caso selecionado. Usando Carlos como padrão.");
                caso = PatientDatabase.GetAllCases()[0];
                if (GameManager.Instance != null)
                {
                    GameManager.Instance.SelectCase(caso);
                }
            }

            // Semeia o histórico com o System Prompt do paciente selecionado.
            llmClient.ConfigureForPatient(caso.SystemPrompt);

            // Exibe a queixa principal como primeira fala do paciente + audiodescrição inicial.
            CriarBalao(caso.QueixaPrincipal, enviadoPeloJogador: false);
            // TtsManager.Instancia?.Falar(caso.QueixaPrincipal);
            accessibility?.Speak(caso.AudiodescricaoInicial);

            // Liga os eventos dos controles.
            botaoEnviar.onClick.AddListener(OnSendButtonClicked);
            campoEntrada.onSubmit.AddListener(_ => OnSendButtonClicked());

            // O microfone só aparece quando o STT está disponível (build WebGL).
            bool micDisponivel = accessibility != null && accessibility.IsMicSupported;
            if (botaoMicrofone != null)
            {
                botaoMicrofone.gameObject.SetActive(micDisponivel);
                if (micDisponivel)
                {
                    botaoMicrofone.onClick.AddListener(() => accessibility.StartListening());
                    accessibility.OnVoiceCommandReceived += ReceberVoz;
                }
            }
        }

        private void OnDestroy()
        {
            if (accessibility != null)
            {
                accessibility.OnVoiceCommandReceived -= ReceberVoz;
            }
        }

        /// <summary>Bloqueia/libera input e botões (durante espera da IA ou avaliação).</summary>
        public void SetInputLocked(bool bloqueado)
        {
            entradaBloqueada = bloqueado;
            botaoEnviar.interactable = !bloqueado;
            campoEntrada.interactable = !bloqueado;
        }

        /// <summary>
        /// Handler do botão enviar / tecla Enter:
        /// cria o balão do jogador, chama a IA e exibe a resposta do paciente.
        /// async void é aceitável aqui por ser handler de evento com tratamento completo de erros.
        /// </summary>
        public async void OnSendButtonClicked()
        {
            if (entradaBloqueada) return;

            string pergunta = campoEntrada.text;
            if (string.IsNullOrWhiteSpace(pergunta)) return;

            CriarBalao(pergunta, enviadoPeloJogador: true);
            campoEntrada.text = string.Empty;
            SetInputLocked(true);
            MostrarIndicadorDigitando(true);

            try
            {
                // Chamada de rede assíncrona ao LLM (não trava a UI).
                string resposta = await llmClient.SendMessageToPatient(pergunta);
                if (this == null) return; // Cena pode ter mudado durante o await

                MostrarIndicadorDigitando(false);
                CriarBalao(resposta, enviadoPeloJogador: false);

                // Sonificação: beep grave se a resposta citar palavra-chave de red flag.
                VerificarSinaisDeAlerta(resposta);

                // TtsManager.Instancia?.Falar(resposta);
                accessibility?.Speak(resposta);
            }
            catch (Exception ex)
            {
                if (this == null) return;
                MostrarIndicadorDigitando(false);
                CriarBalao("(Desculpe, tive um problema de conexão. Pode repetir?)", enviadoPeloJogador: false);
                Debug.LogError($"[ChatUI] Falha ao obter resposta: {ex.Message}");
            }
            finally
            {
                if (this != null)
                {
                    MostrarIndicadorDigitando(false);
                    SetInputLocked(false);
                    campoEntrada.ActivateInputField(); // Devolve o foco para digitar de novo
                }
            }
        }

        /// <summary>Recebe a transcrição de voz (STT) e simula o envio da pergunta.</summary>
        private void ReceberVoz(string transcricao)
        {
            if (entradaBloqueada || string.IsNullOrWhiteSpace(transcricao)) return;
            campoEntrada.text = transcricao;
            OnSendButtonClicked();
        }

        /// <summary>
        /// Escaneia a resposta do paciente procurando palavras-chave de sinal de alerta
        /// definidas no caso clínico. Dispara o cue sonoro correspondente.
        /// Limitação v1: não entende negações ("não tenho febre" também toca o beep).
        /// </summary>
        private void VerificarSinaisDeAlerta(string resposta)
        {
            var caso = GameManager.Instance != null ? GameManager.Instance.CurrentCase : null;
            if (caso?.PalavrasChaveSinaisDeAlerta == null) return;

            string respostaNormalizada = resposta.ToLowerInvariant();
            foreach (var palavra in caso.PalavrasChaveSinaisDeAlerta)
            {
                if (!string.IsNullOrEmpty(palavra) && respostaNormalizada.Contains(palavra.ToLowerInvariant()))
                {
                    accessibility?.PlayCue(CueType.SinalDeAlerta);
                    break; // Um único beep por mensagem basta
                }
            }
        }

        /// <summary>Instancia um balão de mensagem e força a rolagem até o fim.</summary>
        private void CriarBalao(string mensagem, bool enviadoPeloJogador)
        {
            var view = Instantiate(prefabBalaoMensagem, conteudoChat);
            view.Setup(mensagem, enviadoPeloJogador);
            StartCoroutine(RolarParaFim());
        }

        /// <summary>
        /// Mostra/esconde o indicador "Paciente digitando..." (se o prefab foi atribuído).
        /// </summary>
        private void MostrarIndicadorDigitando(bool mostrar)
        {
            if (prefabIndicadorDigitando == null) return;

            if (mostrar && indicadorAtual == null)
            {
                indicadorAtual = Instantiate(prefabIndicadorDigitando, conteudoChat);
                StartCoroutine(RolarParaFim());
            }
            else if (!mostrar && indicadorAtual != null)
            {
                Destroy(indicadorAtual);
                indicadorAtual = null;
            }
        }

        /// <summary>
        /// Espera um frame para o Layout Group recalcular e rola o ScrollRect
        /// até a última mensagem (verticalNormalizedPosition 0 = fundo da lista).
        /// </summary>
        private IEnumerator RolarParaFim()
        {
            yield return null;
            Canvas.ForceUpdateCanvases();
            scrollChat.verticalNormalizedPosition = 0f;
        }
    }
}
