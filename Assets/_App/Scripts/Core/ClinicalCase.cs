using System;
using System.Collections.Generic;

namespace FarmaCheck.Core
{
    /// <summary>
    /// Modelo de dados puro (não herda de MonoBehaviour).
    /// Representa um caso clínico completo do banco de pacientes.
    /// </summary>
    [Serializable]
    public class ClinicalCase
    {
        /// <summary>Identificador único do caso (ex: "carlos_35").</summary>
        public string Id;

        /// <summary>Nome completo do paciente.</summary>
        public string Nome;

        /// <summary>Idade do paciente em anos.</summary>
        public int Idade;

        /// <summary>Fala inicial do paciente (queixa principal em linguagem leiga).</summary>
        public string QueixaPrincipal;

        /// <summary>Audiodescrição inicial do estado visual do paciente (acessibilidade).</summary>
        public string AudiodescricaoInicial;

        /// <summary>O caso possui sinais de alerta (red flags) ocultos?</summary>
        public bool PossuiSinaisDeAlerta;

        /// <summary>
        /// Palavras-chave que indicam sinal de alerta quando mencionadas pelo paciente.
        /// Usada pelo detector de red flags para disparar o som de alerta.
        /// Limitação conhecida (v1): negações ("não tenho febre") também disparam o cue sonoro.
        /// </summary>
        public List<string> PalavrasChaveSinaisDeAlerta;

        /// <summary>
        /// System Prompt enviado à IA como primeira mensagem do histórico.
        /// Define personalidade, dados clínicos ocultos e regras de comportamento do paciente.
        /// </summary>
        public string SystemPrompt;
    }
}
