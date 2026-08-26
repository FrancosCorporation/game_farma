using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using UnityEngine;
using FarmaCheck.API;

namespace FarmaCheck.Core
{
    /// <summary>
    /// Motor de diálogo OFFLINE do paciente. Usado automaticamente quando nenhuma
    /// chave de API está configurada no LLMClient: o jogo funciona 100% sem internet.
    /// As respostas replicam exatamente os "RESPOSTAS FIXAS QUANDO PERGUNTADO"
    /// definidos nos System Prompts do GDD — inclusive os sinais de alerta OCULTOS
    /// da Dona Antônia (febre 38,5 °C e sangue/muco nas fezes), revelados somente
    /// se o jogador perguntar especificamente sobre eles.
    /// </summary>
    public static class OfflinePatientBrain
    {
        /// <summary>Uma regra de diálogo: palavras-chave -> fala do paciente.</summary>
        private class Regra
        {
            public string[] Chaves;    // Termos normalizados (sem acento, minúsculo)
            public string Resposta;    // Fala correspondente do paciente
        }

        // Rotação das respostas genéricas para não repetir a mesma frase.
        private static int contadorGenerico;

        // ----------------------------------------------------------------------
        // Base de conhecimento por paciente (mesma ordem dos System Prompts).
        // Regras de red flag vêm SEMPRE primeiro para terem prioridade no casamento.
        // ----------------------------------------------------------------------
        private static readonly Dictionary<string, List<Regra>> Dialogos =
            new Dictionary<string, List<Regra>>
        {
            // ------------------------------------------------------------------
            // CARLOS, 35 anos - dispepsia/azia (SEM sinais de alerta)
            // ------------------------------------------------------------------
            {
                "carlos_35", new List<Regra>
                {
                    new Regra { Chaves = new[] { "desde quando", "quando começou", "quantos dias", "começou" },
                        Resposta = "Uns três dias, doutor. Faz três dias que tá queimando." },
                    new Regra { Chaves = new[] { "piora", "agrava", "piora" },
                        Resposta = "Deitar e comida pesada, fritura. Piora na hora." },
                    new Regra { Chaves = new[] { "melhora", "alivia", "melhor" },
                        Resposta = "Ficar sentado melhora um pouco." },
                    new Regra { Chaves = new[] { "fezes", "evacua", "intestino", "cocô", "escuro", "negro" },
                        Resposta = "Não, tá tudo normal." },
                    new Regra { Chaves = new[] { "braço", "ombro", "mandíbula", "irradia", "espalha" },
                        Resposta = "Não, não. A queimação fica ali no meio do peito mesmo." },
                    new Regra { Chaves = new[] { "falta de ar", "respirar", "respiração", "ofegante" },
                        Resposta = "Não." },
                    new Regra { Chaves = new[] { "engolir", "engol", "degluti" },
                        Resposta = "Não não, engulo normal." },
                    new Regra { Chaves = new[] { "náusea", "nausea", "vômito", "vomit", "enjoo" },
                        Resposta = "Às vezes um enjoo, mas nunca vomitei." },
                    new Regra { Chaves = new[] { "medicamento", "remédio", "remedio", "usa algum", "toma algum" },
                        Resposta = "Ah, só comprimido de dor de cabeça às vezes." },
                    new Regra { Chaves = new[] { "estress", "trabalho", "corrida" },
                        Resposta = "Tô bem estressado com o trabalho, corrida demais todo dia." },
                }
            },

            // ------------------------------------------------------------------
            // BEATRIZ, 22 anos - cefaleia tensional (SEM sinais de alerta)
            // ------------------------------------------------------------------
            {
                "beatriz_22", new List<Regra>
                {
                    new Regra { Chaves = new[] { "repentino", "súbito", "subito", "explosiv", "piores da vida", "piores" },
                        Resposta = "Não, foi aparecendo devagar." },
                    new Regra { Chaves = new[] { "febre", "termômetro", "temperatura" },
                        Resposta = "Não, não medi nada, mas não acho que tenha." },
                    new Regra { Chaves = new[] { "nuca", "rigidez", "travamento", "pescoço" },
                        Resposta = "Não, só aquela tensão normal." },
                    new Regra { Chaves = new[] { "vômito", "vomit", "náusea", "enjoo" },
                        Resposta = "Não, só enjoo leve se eu demorar pra comer." },
                    new Regra { Chaves = new[] { "visão", "visao", "embaçad", "mancha" },
                        Resposta = "Não." },
                    new Regra { Chaves = new[] { "dormência", "dormencia", "formigamento", "boca torta", "fala embolada", "embolad" },
                        Resposta = "Que isso, não!" },
                    new Regra { Chaves = new[] { "desde quando", "quando começou", "como começa" },
                        Resposta = "É sempre no fim do dia, vai apertando aos poucos." },
                    new Regra { Chaves = new[] { "tela", "computador", "celular", "celular" },
                        Resposta = "Umas dez horas, trabalho e faculdade." },
                    new Regra { Chaves = new[] { "café", "cafe", "cafeína", "energético" },
                        Resposta = "Uns três por dia, às vezes mais." },
                    new Regra { Chaves = new[] { "sono", "dorme", "dormindo", "descansa" },
                        Resposta = "Dormindo mal, umas cinco horas por causa dos trabalhos." },
                    new Regra { Chaves = new[] { "medicamento", "remédio", "contínuo", "anticoncepcional" },
                        Resposta = "Não, só anticoncepcional." },
                }
            },

            // ------------------------------------------------------------------
            // DONA ANTÔNIA, 68 anos - diarreia infecciosa COM sinais de alerta OCULTOS
            // (febre 38,5 °C + sangue/muco nas fezes: só revela se perguntarem!)
            // ------------------------------------------------------------------
            {
                "antonia_68", new List<Regra>
                {
                    // SINAIS DE ALERTA OCULTOS - prioridade máxima no casamento.
                    new Regra { Chaves = new[] { "febre", "temperatura", "38", "termômetro" },
                        Resposta = "Agora que o senhor falou, meu filho... medi hoje de manhã e tava trinta e oito e meio." },
                    new Regra { Chaves = new[] { "sangue", "vermelho", "muco", "risquinho" },
                        Resposta = "Ai, meu filho... sim. Vi uns risquinhos de sangue e uma coisa branquinha, tipo mucosidade." },

                    // Demais dados clínicos (revelados apenas sob pergunta).
                    new Regra { Chaves = new[] { "desde quando", "quando começou", "quantos dias" },
                        Resposta = "Do domingo passadinho, dois dias já." },
                    new Regra { Chaves = new[] { "comeu", "comida", "almoço", "galinhada", "algo diferente", "alimenta" },
                        Resposta = "Comi uma galinhada num almoço de família no domingo." },
                    new Regra { Chaves = new[] { "quantas vezes", "banheiro", "evacua", "cága", "intestino" },
                        Resposta = "Umas seis vezes, meu filho." },
                    new Regra { Chaves = new[] { "sede", "água", "hidrata", "bebe" },
                        Resposta = "Com muita sede, mas a água não fica." },
                    new Regra { Chaves = new[] { "tontura", "tonta", "levantar", "levanta", "cambalear" },
                        Resposta = "Sim, um pouco, tenho que segurar na parede." },
                    new Regra { Chaves = new[] { "urina", "xixi", "urinar" },
                        Resposta = "Pouquinha e escura." },
                    new Regra { Chaves = new[] { "vômito", "vomit", "náusea" },
                        Resposta = "Não consegui comer nada, mas não vomitei." },
                    new Regra { Chaves = new[] { "medicamento", "remédio", "contínuo", "pressão", "açúcar", "diabet" },
                        Resposta = "Tomo remédio de pressão e de açúcar, losartana e metformina." },
                    new Regra { Chaves = new[] { "como está", "como se sente", "está sentindo" },
                        Resposta = "Tô fraquinha, com muita cólica, meu filho." },
                }
            }
        };

        // Respostas genéricas quando o jogador pergunta algo fora da base (por paciente).
        private static readonly Dictionary<string, string[]> Genericas = new Dictionary<string, string[]>
        {
            { "carlos_35", new[]
                {
                    "É... aí não sei te dizer não, só tô com essa queimação mesmo.",
                    "Peraí, deixa eu pensar... acho que é só isso que eu sinto.",
                    "Hmm, boa pergunta. Mas não sei responder isso, sou leigo."
                } },
            { "beatriz_22", new[]
                {
                    "Hmm... acho que não entendi muito bem, pode perguntar de outro jeito?",
                    "Só sei que no fim do dia aperta dos dois lados, sabe?",
                    "Nossa, nunca prestei atenção nisso, desculpa."
                } },
            { "antonia_68", new[]
                {
                    "Não entendi bem, meu filho. O senhor pergunta devagarzinho?",
                    "Ai, meu filho, só Deus pra essas coisas... como é a pergunta?",
                    "Deus abençoe, mas aí eu não sei te explicar não."
                } }
        };

        /// <summary>
        /// Devolve a fala do paciente para a pergunta do jogador.
        /// Primeiro tenta casar palavras-chave (regras específicas); sem casamento,
        /// usa uma resposta genérica rotativa do próprio paciente.
        /// </summary>
        public static string Respond(string patientId, string pergunta)
        {
            string perguntaNorm = Normalizar(pergunta);

            if (!string.IsNullOrEmpty(patientId) && Dialogos.TryGetValue(patientId, out var regras))
            {
                foreach (var regra in regras)
                {
                    foreach (var chave in regra.Chaves)
                    {
                        if (perguntaNorm.Contains(chave))
                        {
                            return regra.Resposta;
                        }
                    }
                }

                // Nenhuma regra casou: resposta genérica rotativa do personagem.
                var opcoes = Genericas.TryGetValue(patientId, out var g)
                    ? g
                    : new[] { "Desculpe, não entendi. Pode repetir?" };
                contadorGenerico++;
                return opcoes[contadorGenerico % opcoes.Length];
            }

            // Paciente desconhecido (fluxo de segurança).
            return "Desculpe, pode repetir a pergunta?";
        }

        /// <summary>
        /// Remove acentos e converte para minúsculas, tornando o casamento de
        /// palavras-chave imune a variações de escrita do jogador ("FEBRE" = "febre").
        /// </summary>
        private static string Normalizar(string texto)
        {
            if (string.IsNullOrEmpty(texto)) return string.Empty;

            string formaD = texto.ToLower(new CultureInfo("pt-BR"))
                .Normalize(NormalizationForm.FormD);

            var sb = new StringBuilder(formaD.Length);
            foreach (var c in formaD)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                {
                    sb.Append(c);
                }
            }
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }
    }

    /// <summary>
    /// Preceptor Avaliador OFFLINE: avalia o atendimento por checklist de regras,
    /// sem nenhuma chamada de rede. Pontuação (0-100):
    ///   - Anamnese completa: até 75 pontos (proporcional aos itens investigados)
    ///   - Sinais de alerta descobertos (casos que os possuem): até 15 pontos
    ///   - Conduta final adequada ao caso: até 10 pontos
    /// O feedback textual lista o que foi feito e o que faltou, como um professor.
    /// </summary>
    public static class OfflineEvaluator
    {
        /// <summary>Item do checklist de anamnese: descrição didática + termos que a detectam.</summary>
        private class ItemChecklist
        {
            public string Descricao;
            public string[] Termos;
        }

        /// <summary>Checklists essenciais por caso clínico (derivados dos System Prompts).</summary>
        private static readonly Dictionary<string, ItemChecklist[]> Checklists =
            new Dictionary<string, ItemChecklist[]>
        {
            {
                "carlos_35", new[]
                {
                    new ItemChecklist { Descricao = "duração da queixa", Termos = new[] { "desde quando", "quando começou", "quantos dias" } },
                    new ItemChecklist { Descricao = "fatores de piora/melhora", Termos = new[] { "piora", "melhora", "alivia" } },
                    new ItemChecklist { Descricao = "investigação de sangramento digestivo", Termos = new[] { "fezes", "evacua", "intestino", "escuro", "negro" } },
                    new ItemChecklist { Descricao = "irradiação da dor (excluir cardíaco)", Termos = new[] { "braço", "ombro", "mandíbula", "irradia" } },
                    new ItemChecklist { Descricao = "presença de dispneia", Termos = new[] { "falta de ar", "respirar", "respira" } },
                    new ItemChecklist { Descricao = "disfagia (dificuldade para engolir)", Termos = new[] { "engoli" } },
                    new ItemChecklist { Descricao = "náuseas e vômitos", Termos = new[] { "náusea", "nausea", "vômito", "vomit", "enjoo" } },
                    new ItemChecklist { Descricao = "uso atual de medicamentos", Termos = new[] { "medicamento", "remédio", "remedio" } }
                }
            },
            {
                "beatriz_22", new[]
                {
                    new ItemChecklist { Descricao = "padrão de instalação da dor", Termos = new[] { "desde quando", "começou", "súbito", "subito", "devagar" } },
                    new ItemChecklist { Descricao = "presença de febre", Termos = new[] { "febre" } },
                    new ItemChecklist { Descricao = "náuseas e vômitos", Termos = new[] { "vômito", "vomit", "náusea", "enjoo" } },
                    new ItemChecklist { Descricao = "alterações visuais", Termos = new[] { "visão", "visao", "embaçad" } },
                    new ItemChecklist { Descricao = "sinais neurológicos (dormência, fala)", Termos = new[] { "dormência", "dormencia", "fala", "boca torta" } },
                    new ItemChecklist { Descricao = "tempo de tela e postura", Termos = new[] { "tela", "computador", "celular" } },
                    new ItemChecklist { Descricao = "consumo de cafeína", Termos = new[] { "café", "cafe", "cafeína" } },
                    new ItemChecklist { Descricao = "qualidade do sono", Termos = new[] { "sono", "dorme", "dormindo" } },
                    new ItemChecklist { Descricao = "medicação de uso contínuo", Termos = new[] { "medicamento", "remédio", "contínuo", "anticoncepcional" } }
                }
            },
            {
                "antonia_68", new[]
                {
                    new ItemChecklist { Descricao = "duração do quadro", Termos = new[] { "desde quando", "quando começou", "quantos dias" } },
                    new ItemChecklist { Descricao = "alimentação recente (fonte provável)", Termos = new[] { "comeu", "comida", "almoço", "alimenta" } },
                    new ItemChecklist { Descricao = "frequência das evacuações", Termos = new[] { "quantas vezes", "banheiro", "evacua" } },
                    new ItemChecklist { Descricao = "sinais de desidratação (sede e urina)", Termos = new[] { "sede", "urina", "xixi", "hidrata" } },
                    new ItemChecklist { Descricao = "tontura postural", Termos = new[] { "tontura", "tonta", "levantar", "levanta" } },
                    new ItemChecklist { Descricao = "presença de vômitos", Termos = new[] { "vômito", "vomit" } },
                    new ItemChecklist { Descricao = "medicamentos de uso contínuo", Termos = new[] { "medicamento", "remédio", "losartana", "metformina", "pressão" } }
                }
            }
        };

        /// <summary>
        /// Avalia o atendimento sem rede. Recebe o log textual completo, a decisão
        /// final do aluno e o caso clínico jogado.
        /// </summary>
        public static EvaluationResult Evaluate(string chatLog, string decisao, ClinicalCase caso)
        {
            string logNorm = Normalizar(chatLog);
            string decisaoNorm = Normalizar(decisao ?? string.Empty);

            var checklist = Checklists.TryGetValue(caso.Id, out var lista)
                ? lista
                : new ItemChecklist[0];

            // --- Parte 1: itens de anamnese investigados (até 75 pontos) ---
            var feitos = new List<string>();
            var faltantes = new List<string>();
            foreach (var item in checklist)
            {
                bool investigou = item.Termos.Any(t => logNorm.Contains(Normalizar(t)));
                if (investigou) feitos.Add(item.Descricao);
                else faltantes.Add(item.Descricao);
            }
            float pontosAnamnese = checklist.Length > 0
                ? 75f * feitos.Count / checklist.Length
                : 75f;

            // --- Parte 2: sinais de alerta descobertos (até 15 pontos) ---
            float pontosRedFlag;
            bool redFlagsIdentificadas = true;
            if (caso.PossuiSinaisDeAlerta && caso.PalavrasChaveSinaisDeAlerta.Count > 0)
            {
                // Agrupa as palavras-chave em 2 alvos clínicos: febre e sangue/muco.
                bool achouFebre = logNorm.Contains("febre") || logNorm.Contains("38");
                bool achouSangue = logNorm.Contains("sangue") || logNorm.Contains("muco");
                int achados = (achouFebre ? 1 : 0) + (achouSangue ? 1 : 0);
                pontosRedFlag = 15f * achados / 2f;
                redFlagsIdentificadas = achados == 2;
            }
            else
            {
                // Caso sem red flag: identificar corretamente significa NÃO haver omissão.
                pontosRedFlag = 15f;
            }

            // --- Parte 3: conduta final adequada (até 10 pontos) ---
            bool condutaOk;
            switch (caso.Id)
            {
                case "antonia_68":
                    // Com sinais de alerta, a única conduta segura é encaminhar.
                    condutaOk = decisaoNorm.Contains("encaminhament");
                    break;
                default:
                    // Casos autolimitados: tratamento no próprio farmacêutico é adequado.
                    condutaOk = decisaoNorm.Contains("mip")
                                || decisaoNorm.Contains("farmacolog")
                                || decisaoNorm.Contains("orientaç")
                                || decisaoNorm.Contains("orientac");
                    break;
            }
            float pontosConduta = condutaOk ? 10f : 0f;

            int nota = Mathf.RoundToInt(Mathf.Clamp(pontosAnamnese + pontosRedFlag + pontosConduta, 0f, 100f));

            // --- Montagem do feedback didático ---
            var fb = new StringBuilder();
            fb.AppendLine($"Atendimento de {caso.Nome}, {caso.Idade} anos.");

            if (feitos.Count > 0)
            {
                fb.AppendLine();
                fb.AppendLine("Bem investigado: " + string.Join(", ", feitos) + ".");
            }

            if (faltantes.Count > 0)
            {
                fb.AppendLine();
                fb.AppendLine("Faltou questionar: " + string.Join(", ", faltantes) + ".");
            }

            if (caso.PossuiSinaisDeAlerta)
            {
                fb.AppendLine();
                if (redFlagsIdentificadas)
                {
                    fb.AppendLine("Excelente: você descobriu os sinais de alerta ocultos (febre e sangue/muco nas fezes)!");
                }
                else
                {
                    fb.AppendLine("ATENÇÃO: este caso tinha sinais de alerta OCULTOS. Pergunte sempre sobre " +
                                  "FE BRE/temperatura e SANGUE/MUCO nas fezes em quadros diarreicos de idosos!");
                }
            }

            fb.AppendLine();
            if (condutaOk)
            {
                fb.AppendLine("Conduta final adequada para o caso.");
            }
            else
            {
                fb.AppendLine(caso.Id == "antonia_68"
                    ? "Conduta inadequada: diarreia com febre e sangue em idosa exige ENCAMINHAMENTO médico imediato."
                    : "Conduta inadequada: problemas autolimitados podem ser resolvidos pelo farmacêutico (MIP + orientações).");
            }

            fb.AppendLine();
            fb.AppendLine(nota >= 80 ? "Excelente raciocínio clínico. Continue assim!"
                : nota >= 60 ? "Bom atendimento, mas há espaço para uma anamnese mais completa."
                : "Revise o roteiro de anamnese: perguntas-chave ficaram faltando.");

            return new EvaluationResult
            {
                nota = nota,
                red_flags_identificadas = redFlagsIdentificadas,
                feedback = fb.ToString()
            };
        }

        /// <summary>Equivale a OfflinePatientBrain.Normalizar (mesma regra de acentos).</summary>
        private static string Normalizar(string texto)
        {
            if (string.IsNullOrEmpty(texto)) return string.Empty;
            string formaD = texto.ToLower(new CultureInfo("pt-BR")).Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder(formaD.Length);
            foreach (var c in formaD)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                    sb.Append(c);
            }
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }
    }
}
