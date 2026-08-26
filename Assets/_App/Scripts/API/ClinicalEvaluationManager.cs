using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
// using FarmaCheck.Accessibility;
using FarmaCheck.Core;
using FarmaCheck.UI;

namespace FarmaCheck.API
{
    /// <summary>
    /// Resultado da avaliação do Preceptor, desserializado do JSON retornado pela IA.
    /// Os nomes dos campos casam exatamente com as chaves do JSON esperado:
    /// { "nota": 0-100, "red_flags_identificadas": bool, "feedback": "..." }
    /// </summary>
    [Serializable]
    public class EvaluationResult
    {
        public int nota;
        public bool red_flags_identificadas;
        public string feedback;
    }

    /// <summary>
    /// Função B da IA (GDD): o Preceptor Avaliador.
    /// Ao final do atendimento, compila todo o log do chat + a decisão final do aluno,
    /// envia à API com um System Prompt de professor e exibe o relatório na tela final.
    /// </summary>
    public class ClinicalEvaluationManager : MonoBehaviour
    {
        [Header("Referências principais")]
        [SerializeField] private LLMClient llmClient;
        [SerializeField] private ChatUIManager chatUI; // Para travar o input durante a avaliação
        [SerializeField] private object accessibility;

        [Header("Painéis da fase final")]
        [SerializeField] private GameObject condutaPanel;
        [SerializeField] private GameObject feedbackPanel;
        [SerializeField] private TextMeshProUGUI notaTexto;
        [SerializeField] private TextMeshProUGUI feedbackTexto;

        [Header("Configuração da API (Preceptor)")]
        [SerializeField] private string apiUrl = "https://api.openai.com/v1/chat/completions";
        [SerializeField] private string apiKey = "";
        [SerializeField] private string model = "gpt-4o-mini";

        // Instrução rígida para a IA responder APENAS com JSON no formato esperado.
        private const string SystemPromptPreceptor =
            "Você é um professor de farmácia clínica rigoroso, porém didático, avaliando um aluno em um simulador de anamnese. " +
            "Analise o log do atendimento e a decisão final do aluno. Verifique: " +
            "(1) se a anamnese foi completa (dados essenciais do caso); " +
            "(2) se os sinais de alerta foram investigados corretamente; " +
            "(3) se a conduta final é adequada para um problema de saúde autolimitado. " +
            "Responda APENAS com um JSON válido, sem nenhum texto adicional, exatamente neste formato: " +
            "{\"nota\": <inteiro de 0 a 100>, \"red_flags_identificadas\": <true|false>, \"feedback\": \"texto curto de avaliação em português\"}.";

        // Evita avaliações duplicadas por cliques rápidos.
        private bool emAvaliacao;

        /// <summary>
        /// Chamado pelos botões da tela de Conduta (UnityEvent com string persistida):
        /// ex. "Tratamento farmacológico (MIP) + orientações", "Apenas medidas não farmacológicas",
        /// "Encaminhamento médico imediato".
        /// Orquestra todo o encerramento: trava chat -> avalia -> mostra feedback.
        /// </summary>
        public async void SubmitDecision(string decisaoDoAluno)
        {
            if (emAvaliacao) return;
            emAvaliacao = true;

            if (GameManager.Instance != null)
            {
                GameManager.Instance.SetState(GameState.Conduct);
            }

            chatUI?.SetInputLocked(true);
            if (condutaPanel != null) condutaPanel.SetActive(false);

            try
            {
                string log = llmClient.BuildChatLog();
                EvaluationResult resultado = await EvaluatePlayerAsync(log, decisaoDoAluno);
                if (this == null) return; // Proteção contra troca/destruição durante o await

                MostrarResultado(resultado);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Preceptor] Rede falhou ({ex.Message}). Usando avaliação OFFLINE.");

                // Degradação elegante: sem rede, o Preceptor avalia pelo checklist local.
                var casoFallback = GameManager.Instance != null
                    ? GameManager.Instance.CurrentCase : null;
                var resultado = OfflineEvaluator.Evaluate(
                    llmClient.BuildChatLog(), decisaoDoAluno,
                    casoFallback != null ? casoFallback : PatientDatabase.GetAllCases()[0]);
                if (this == null) return;

                MostrarResultado(resultado);
            }
            finally
            {
                if (this != null)
                {
                    emAvaliacao = false;
                    chatUI?.SetInputLocked(false);
                }
            }
        }

        /// <summary>
        /// Envia o log + decisão ao LLM com o papel de Preceptor e desserializa o JSON.
        /// </summary>
        public async Task<EvaluationResult> EvaluatePlayerAsync(string chatLog, string playerDecision)
        {
            // MODO OFFLINE: avalia por checklist de regras locais quando não há
            // endpoint utilizável (jogo roda sem internet e sem chave de API).
            bool temEndpoint = !string.IsNullOrEmpty(apiUrl);
            bool ehLocal = temEndpoint &&
                (apiUrl.Contains("localhost") || apiUrl.Contains("127.0.0.1"));
            bool podeRede = temEndpoint && (ehLocal || !string.IsNullOrEmpty(apiKey));

            if (!podeRede)
            {
                var casoOffline = GameManager.Instance != null
                    ? GameManager.Instance.CurrentCase : null;
                return OfflineEvaluator.Evaluate(
                    chatLog, playerDecision,
                    casoOffline != null ? casoOffline : PatientDatabase.GetAllCases()[0]);
            }

            var mensagens = new List<LLMMessage>
            {
                new LLMMessage("system", SystemPromptPreceptor),
                new LLMMessage(
                    "user",
                    $"LOG DO ATENDIMENTO:\n{chatLog}\n\nDECISÃO FINAL DO ALUNO: {playerDecision}")
            };

            string respostaBruta = await EnviarRequisicaoAsync(mensagens);

            // LLMs às vezes cercam o JSON com ```json ... ```: extrai apenas o objeto.
            string json = ExtrairJson(respostaBruta);

            EvaluationResult resultado = JsonConvert.DeserializeObject<EvaluationResult>(json);

            if (resultado == null || resultado.feedback == null)
            {
                throw new Exception("JSON de avaliação incompleto.");
            }

            // Garante que a nota fique sempre dentro do intervalo 0-100.
            resultado.nota = Mathf.Clamp(resultado.nota, 0, 100);
            return resultado;
        }

        /// <summary>
        /// POST assíncrono padrão OpenAI-compatible (mesmo plumbing do LLMClient,
        /// mantido separado porque o Preceptor é uma sessão independente).
        /// </summary>
        private async Task<string> EnviarRequisicaoAsync(List<LLMMessage> mensagens)
        {
            var corpo = new LLMRequest
            {
                model = model,
                messages = mensagens,
                temperature = 0.2, // Respostas determinísticas: avaliação consistente
                MaxTokens = 300
            };
            string jsonBody = JsonConvert.SerializeObject(corpo);

            using var request = new UnityWebRequest(apiUrl, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
            request.downloadHandler = new DownloadHandlerBuffer();
                request.timeout = 120; // Modelos locais em CPU podem demorar na 1ª resposta
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {apiKey}");

            var operation = request.SendWebRequest();
            while (!operation.isDone)
            {
                await Task.Yield();
            }

            if (request.result != UnityWebRequest.Result.Success)
            {
                throw new Exception(
                    $"Erro HTTP {request.responseCode}: {request.error} | {request.downloadHandler.text}");
            }

            var resposta = JsonConvert.DeserializeObject<LLMResponse>(request.downloadHandler.text);
            if (resposta?.choices == null || resposta.choices.Count == 0 || resposta.choices[0].message == null)
            {
                throw new Exception("Resposta da API em formato inesperado.");
            }

            return resposta.choices[0].message.content.Trim();
        }

        /// <summary>Extrai o primeiro objeto JSON {...} encontrado na resposta bruta.</summary>
        private static string ExtrairJson(string texto)
        {
            int inicio = texto.IndexOf('{');
            int fim = texto.LastIndexOf('}');
            if (inicio < 0 || fim <= inicio)
            {
                throw new Exception($"A IA não retornou um JSON válido: {texto}");
            }
            return texto.Substring(inicio, fim - inicio + 1);
        }

        /// <summary>Preenche a tela de Feedback e narra o resultado via TTS.</summary>
        private void MostrarResultado(EvaluationResult resultado)
        {
            GameManager.Instance?.SetState(GameState.Feedback);

            if (feedbackPanel != null) feedbackPanel.SetActive(true);
            if (notaTexto != null) notaTexto.text = $"{resultado.nota}/100";
            if (feedbackTexto != null) feedbackTexto.text = resultado.feedback;

            // Audiodescrição completa do relatório (jogador cego recebe a mesma nota).
            Debug.Log("[Preceptor] TTS: " + 
                $"Atendimento finalizado. Sua nota é {resultado.nota} de 100. " +
                $"{resultado.feedback}");

            Debug.Log($"[Preceptor] Nota: {resultado.nota} | Red flags identificadas: {resultado.red_flags_identificadas}");
        }
    }
}
