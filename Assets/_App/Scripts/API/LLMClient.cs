using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;
using FarmaCheck.Core;

namespace FarmaCheck.API
{
    // ----------------------------------------------------------------------
    // DTOs - classes de serialização JSON no padrão OpenAI ChatCompletions.
    // Compatível com OpenAI, Gemini (endpoint OpenAI-compatible) e similares.
    // ----------------------------------------------------------------------

    /// <summary>Uma mensagem da conversa ("system", "user" ou "assistant").</summary>
    public class LLMMessage
    {
        public string role;
        public string content;

        public LLMMessage(string role, string content)
        {
            this.role = role;
            this.content = content;
        }
    }

    /// <summary>Corpo da requisição enviada à API.</summary>
    public class LLMRequest
    {
        public string model;
        public List<LLMMessage> messages;
        public double temperature;

        [JsonProperty("max_tokens")]
        public int MaxTokens;
    }

    /// <summary>Mensagem dentro de uma escolha da resposta.</summary>
    public class LLMResponseMessage
    {
        public string role;
        public string content;
    }

    /// <summary>Cada alternativa gerada pela IA.</summary>
    public class LLMChoice
    {
        public LLMResponseMessage message;
    }

    /// <summary>Estrutura da resposta completa da API.</summary>
    public class LLMResponse
    {
        public List<LLMChoice> choices;
    }

    /// <summary>
    /// Cliente responsável pela comunicação com a API de LLM.
    /// Mantém o histórico da conversa para que o paciente "lembre" do diálogo.
    /// A primeira mensagem do histórico é SEMPRE o System Prompt do caso clínico atual.
    /// </summary>
    public class LLMClient : MonoBehaviour
    {
        [Header("Configuração da API")]
        [SerializeField] private string apiUrl = "https://api.openai.com/v1/chat/completions";
        [SerializeField] private string apiKey = "";
        [SerializeField] private string model = "gpt-4o-mini";
        [SerializeField] [Range(0f, 2f)] private double temperature = 0.7;
        [SerializeField] private int maxTokens = 300;

        [Header("Rede")]
        [Tooltip("Tempo limite (em segundos) para cada requisição.")]
        [SerializeField] private int timeoutSeconds = 30;

        /// <summary>Histórico completo da conversa (incluindo o System Prompt).</summary>
        private readonly List<LLMMessage> historico = new List<LLMMessage>();

        /// <summary>Caso clínico atual (guardado para o motor de diálogo offline).</summary>
        private ClinicalCase casoAtual;

        /// <summary>Evento disparado sempre que o paciente (IA) responde algo.</summary>
        public event Action<string> OnPatientResponse;

        /// <summary>Acesso somente leitura ao histórico (para o Preceptor avaliar depois).</summary>
        public IReadOnlyList<LLMMessage> Historico => historico;

        /// <summary>
        /// Prepara o histórico para uma nova sessão: limpa tudo e insere
        /// o System Prompt do paciente como primeira mensagem.
        /// Chamado pelo ChatUIManager no início do atendimento.
        /// </summary>
        public void ConfigureForPatient(string systemPrompt)
        {
            historico.Clear();
            historico.Add(new LLMMessage("system", systemPrompt));
        }

        /// <summary>
        /// Sobrecarga usada pelo ChatUIManager: guarda também o caso clínico,
        /// necessário para o motor de diálogo offline escolher as respostas certas.
        /// </summary>
        public void ConfigureForPatient(ClinicalCase caso)
        {
            casoAtual = caso;
            ConfigureForPatient(caso.SystemPrompt);
        }

        /// <summary>
        /// Indica se existe um endpoint HTTP utilizável: nuvem exige chave de API;
        /// endereços locais (Ollama, llama-server etc.) dispensam chave.
        /// </summary>
        private bool PodeUsarRede()
        {
            if (string.IsNullOrEmpty(apiUrl)) return false;
            bool ehLocal = apiUrl.Contains("localhost") || apiUrl.Contains("127.0.0.1");
            return ehLocal || !string.IsNullOrEmpty(apiKey);
        }

        /// <summary>
        /// Compila todo o atendimento (sem o System Prompt) em um log textual,
        /// usado como entrada para a avaliação do Preceptor (ClinicalEvaluationManager).
        /// </summary>
        public string BuildChatLog()
        {
            var sb = new StringBuilder();
            foreach (var msg in historico)
            {
                if (msg.role == "system") continue; // O Preceptor não precisa das instruções internas
                sb.AppendLine(msg.role == "user"
                    ? $"FARMACÊUTICO: {msg.content}"
                    : $"PACIENTE: {msg.content}");
            }
            return sb.ToString();
        }

        /// <summary>
        /// Envia a pergunta do jogador ao LLM e devolve a resposta do paciente.
        /// Mantém o histórico sincronizado (adiciona "user" antes e "assistant" depois).
        /// </summary>
        public async Task<string> SendMessageToPatient(string playerMessage)
        {
            if (string.IsNullOrWhiteSpace(playerMessage))
            {
                throw new ArgumentException("A mensagem do jogador não pode ser vazia.");
            }

            // Passo 1: adiciona a pergunta do jogador ao contexto da conversa.
            historico.Add(new LLMMessage("user", playerMessage.Trim()));

            // PRIORIDADE 1: IA EMBUTIDA no build (plugin nativo + modelo local em
            // StreamingAssets). O cliente não instala nada e não precisa de internet.
            if (LocalLLM.Disponivel)
            {
                string respostaEmbutida = await LocalLLM.EnviarAsync(historico);
                if (this == null) return respostaEmbutida;

                historico.Add(new LLMMessage("assistant", respostaEmbutida));
                OnPatientResponse?.Invoke(respostaEmbutida);
                return respostaEmbutida;
            }

            // MODO OFFLINE: sem endpoint utilizável, responde pelo motor scriptado
            // local (respostas fixas do GDD). O jogo funciona sem internet e sem chave.
            if (!PodeUsarRede())
            {
                string respostaLocal = OfflinePatientBrain.Respond(
                    casoAtual != null ? casoAtual.Id : null, playerMessage);

                await Task.Delay(700); // Pequena pausa simulando fala natural
                if (this == null) return respostaLocal;

                historico.Add(new LLMMessage("assistant", respostaLocal));
                OnPatientResponse?.Invoke(respostaLocal);
                return respostaLocal;
            }

            // Passo 2: serializa o corpo da requisição em JSON.
            var requestData = new LLMRequest
            {
                model = model,
                messages = historico,
                temperature = temperature,
                MaxTokens = maxTokens
            };
            string jsonBody = JsonConvert.SerializeObject(requestData);

            // Passo 3: monta a requisição HTTP POST manualmente (corpo JSON puro,
            // sem codificação de formulário, exigido pelas APIs OpenAI-compatible).
            using var request = new UnityWebRequest(apiUrl, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.timeout = timeoutSeconds;
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {apiKey}");

            try
            {
                // Passo 4: dispara a requisição e cede o main thread até terminar.
                var operation = request.SendWebRequest();
                while (!operation.isDone)
                {
                    await Task.Yield();
                }

                // Passo 5: trata falhas de rede / credenciais / limite de uso.
                if (request.result != UnityWebRequest.Result.Success)
                {
                    throw new Exception(
                        $"Falha na requisição LLM ({request.responseCode}): {request.error} | Resposta: {request.downloadHandler.text}");
                }

                // Passo 6: desserializa a resposta e extrai o texto do paciente.
                var responseData = JsonConvert.DeserializeObject<LLMResponse>(request.downloadHandler.text);

                if (responseData?.choices == null || responseData.choices.Count == 0 ||
                    responseData.choices[0].message == null)
                {
                    throw new Exception("Resposta da IA em formato inesperado.");
                }

                string resposta = responseData.choices[0].message.content.Trim();

                // Proteção contra troca de cena durante o await (objeto destruído).
                if (this == null) return resposta;

                // Passo 7: registra a resposta no histórico e avisa os ouvintes.
                historico.Add(new LLMMessage("assistant", resposta));
                OnPatientResponse?.Invoke(resposta);
                return resposta;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[LLMClient] Rede falhou ({ex.Message}). Caindo no modo OFFLINE.");

                // Degradação elegante: se o servidor local estiver desligado (ou a
                // nuvem falhar), o jogo continua jogável com as respostas fixas.
                string fallback = OfflinePatientBrain.Respond(
                    casoAtual != null ? casoAtual.Id : null, playerMessage);

                if (this == null) return fallback;

                historico.Add(new LLMMessage("assistant", fallback));
                OnPatientResponse?.Invoke(fallback);
                return fallback;
            }
        }
    }
}
