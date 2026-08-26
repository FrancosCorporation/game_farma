using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace FarmaCheck.API
{
    /// <summary>
    /// Motor de IA embutido: expõe o plugin nativo libfarmallm.so (llama.cpp
    /// estaticamente linkado + Qwen3-4B em StreamingAssets). Roda 100% na CPU
    /// da máquina do jogador — não exige internet, chave de API nem instalação.
    /// Se algo faltar (plugin, modelo ou plataforma móvel), Disponivel = false
    /// e o LLMClient cai automaticamente para rede/respostas roteirizadas.
    /// </summary>
    public static class LocalLLM
    {
        // Nome do plugin nativo (Assets/Plugins/x86_64/libfarmallm.so)
        private const string LibName = "farmallm";

        // Valor retornado por farmallm_probe() quando a versão do protocolo bate
        private const int ProtocoloEsperado = 20260824;

        // Arquivo do modelo dentro de StreamingAssets
        private const string ModeloRelativo = "Models/qwen3-4b-q4_k_m.gguf";

        // Limites de geração por resposta do paciente
        private const int MaxTokensResposta = 300;
        private const float TemperaturaPadrao = 0.7f;

        // Serializa chamadas ao motor (uma geração por vez; o contexto é único)
        private static readonly SemaphoreSlim trava = new SemaphoreSlim(1, 1);

        private static bool inicializado;
        private static bool? disponivel;

        // ------------------------------------------------------------------
        // P/Invoke do shim nativo
        // ------------------------------------------------------------------

        [DllImport(LibName)] private static extern int farmallm_probe();
        [DllImport(LibName)] private static extern int farmallm_init(string path, int n_ctx, int n_threads);
        [DllImport(LibName)] private static extern int farmallm_generate(string prompt, byte[] saida, int max_saida, int max_tokens, float temperatura);
        [DllImport(LibName)] private static extern void farmallm_free();

        /// <summary>Caminho absoluto do GGUF em StreamingAssets.</summary>
        private static string CaminhoModelo =>
            Path.Combine(Application.streamingAssetsPath, ModeloRelativo);

        /// <summary>
        /// True se a IA embutida pode ser usada nesta máquina:
        /// plataforma desktop + plugin carregável + modelo presente no build.
        /// Resultado é cacheado (checagem barata, feita uma única vez).
        /// </summary>
        public static bool Disponivel
        {
            get
            {
                if (disponivel.HasValue) return disponivel.Value;

                try
                {
                    bool plataformaDesktop =
                        Application.platform == RuntimePlatform.WindowsPlayer ||
                        Application.platform == RuntimePlatform.OSXPlayer ||
                        Application.platform == RuntimePlatform.LinuxPlayer ||
                        Application.platform == RuntimePlatform.WindowsEditor ||
                        Application.platform == RuntimePlatform.OSXEditor ||
                        Application.platform == RuntimePlatform.LinuxEditor;

                    disponivel = plataformaDesktop
                                 && farmallm_probe() == ProtocoloEsperado
                                 && File.Exists(CaminhoModelo);
                }
                catch (DllNotFoundException)      { disponivel = false; }
                catch (EntryPointNotFoundException){ disponivel = false; }
                catch (Exception)                 { disponivel = false; }

                if (!disponivel.Value)
                    Debug.LogWarning("[LocalLLM] IA embutida indisponível — usando fallback.");

                return disponivel.Value;
            }
        }

        /// <summary>
        /// Envia todo o histórico da conversa ao motor local e devolve a
        /// resposta do paciente. Retorna null se falhar (o chamador aplica
        /// o fallback offline). Nunca lança exceção.
        /// </summary>
        public static async Task<string> EnviarAsync(IReadOnlyList<LLMMessage> historico)
        {
            if (!Disponivel || historico == null || historico.Count == 0) return null;

            await trava.WaitAsync();
            try
            {
                // Carga do modelo acontece uma única vez, fora da main thread.
                if (!inicializado)
                {
                    int nThreads = Mathf.Clamp(SystemInfo.processorCount / 2, 4, 16);
                    int r = await Task.Run(() => farmallm_init(CaminhoModelo, 2048, nThreads));
                    if (r < 0)
                    {
                        Debug.LogError($"[LocalLLM] Falha ao carregar o modelo (código {r}).");
                        return null;
                    }
                    inicializado = true;
                    Debug.Log("[LocalLLM] Modelo Qwen3-4B carregado na memória.");
                }

                string prompt = MontarPromptChatML(historico);
                string bruto = await Task.Run(() => Gerar(prompt));
                return LimparResposta(bruto);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LocalLLM] Erro na geração: {e.Message}");
                return null;
            }
            finally
            {
                trava.Release();
            }
        }

        // ------------------------------------------------------------------
        // Internos
        // ------------------------------------------------------------------

        /// <summary>
        /// Monta o prompt no template ChatML (formato nativo do Qwen3).
        /// O sufixo /no_think desativa o modo raciocínio longo do Qwen3,
        /// reduzindo muito a latência em CPU.
        /// </summary>
        private static string MontarPromptChatML(IReadOnlyList<LLMMessage> historico)
        {
            var sb = new StringBuilder();
            foreach (var msg in historico)
            {
                string conteudo = msg.content ?? "";
                if (msg.role == "system") conteudo += " /no_think";
                sb.Append("<|im_start|>").Append(msg.role)
                  .Append('\n').Append(conteudo)
                  .Append("<|im_end|>\n");
            }
            sb.Append("<|im_start|>assistant\n");
            return sb.ToString();
        }

        /// <summary>Chamada bloqueante ao plugin (rodar sempre fora da main thread).</summary>
        private static string Gerar(string prompt)
        {
            var buffer = new byte[4096];
            int n = farmallm_generate(prompt, buffer, buffer.Length, MaxTokensResposta, TemperaturaPadrao);
            if (n <= 0) return null;
            return Encoding.UTF8.GetString(buffer, 0, n);
        }

        /// <summary>
        /// Remove o bloco &lt;think&gt;...&lt;/think&gt; que o Qwen3 pode emitir
        /// mesmo com /no_think, e aparas espaços das bordas.
        /// </summary>
        private static string LimparResposta(string texto)
        {
            if (string.IsNullOrEmpty(texto)) return null;

            int abre = texto.IndexOf("<think>", StringComparison.Ordinal);
            if (abre >= 0)
            {
                int fecha = texto.IndexOf("</think>", abre, StringComparison.Ordinal);
                texto = fecha >= 0 ? texto.Substring(fecha + "</think>".Length) : "";
            }

            texto = texto.Trim();
            return texto.Length > 0 ? texto : null;
        }
    }
}
