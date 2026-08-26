using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace FarmaCheck.Core
{
    /// <summary>
    /// Estados possíveis do fluxo do jogo:
    /// MainMenu -> Anamnesis -> Diagnosis -> Conduct -> Feedback.
    /// </summary>
    public enum GameState
    {
        MainMenu,   // Seleção de paciente
        Anamnesis,  // Entrevista clínica via chat (LLM)
        Diagnosis,  // Definição de risco (red flags sim/não)
        Conduct,    // Escolha da conduta clínica
        Feedback    // Relatório do Preceptor (IA avaliadora)
    }

    /// <summary>
    /// Gerenciador central do jogo (Padrão Singleton).
    /// Sobrevive entre cenas (DontDestroyOnLoad) e guarda o caso clínico ativo.
    /// Deve existir apenas UM objeto com este script na cena "Menu".
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        /// <summary>Instância única acessível globalmente.</summary>
        public static GameManager Instance { get; private set; }

        [Header("Estado Atual (apenas leitura em runtime)")]
        [SerializeField] private GameState estadoAtual = GameState.MainMenu;

        /// <summary>Caso clínico selecionado pelo jogador (nulo antes da seleção).</summary>
        public ClinicalCase CurrentCase { get; private set; }

        /// <summary>Estado atual da máquina de estados.</summary>
        public GameState EstadoAtual => estadoAtual;

        /// <summary>Evento disparado a cada mudança de estado (para UI reagir).</summary>
        public event Action<GameState> OnStateChanged;

        private void Awake()
        {
            // Garante que exista somente uma instância viva (proteção contra duplicatas).
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            // Mantém o GameManager vivo ao carregar a cena "Consultorio".
            DontDestroyOnLoad(gameObject);
            Debug.Log("[GameManager] Instancia criado no menu!");
        }

        private void Start()
        {
            Debug.Log("[GameManager] Start chamado. Estado atual: " + estadoAtual);
        }

        /// <summary>Muda o estado atual e notifica os inscritos.</summary>
        public void SetState(GameState novoEstado)
        {
            estadoAtual = novoEstado;
            OnStateChanged?.Invoke(novoEstado);
        }

        /// <summary>Armazena o caso clínico ativo (sem trocar de cena).</summary>
        public void SelectCase(ClinicalCase caso)
        {
            CurrentCase = caso;
        }

        /// <summary>
        /// Chamado pelos botões do menu (UnityEvent aceita parâmetro int persistido no Inspector).
        /// Seleciona o paciente pelo índice e inicia a anamnese.
        /// </summary>
        public void StartCaseByIndex(int indice)
        {
            var casos = PatientDatabase.GetAllCases();
            if (indice < 0 || indice >= casos.Count)
            {
                Debug.LogError($"[GameManager] Índice de caso inválido: {indice}");
                return;
            }

            SelectCase(casos[indice]);
            SetState(GameState.Anamnesis);
            SceneManager.LoadScene("Consultorio");
        }

        /// <summary>
        /// Sorteia um paciente aleatorio e inicia o atendimento.
        /// Usado pela PortaClinica: o jogador entra na clinica e o paciente ja esta la.
        /// </summary>
        public void StartRandomCase()
        {
            var casos = PatientDatabase.GetAllCases();
            if (casos == null || casos.Count == 0)
            {
                Debug.LogError("[GameManager] Banco de pacientes vazio!");
                return;
            }

            int sorteio = UnityEngine.Random.Range(0, casos.Count);
            SelectCase(casos[sorteio]);
            SetState(GameState.Anamnesis);
            Debug.Log($"[GameManager] Paciente sorteado: {casos[sorteio].Nome} — carregando Consultorio...");
            SceneManager.LoadScene("Consultorio");
        }

        /// <summary>Volta para o menu principal (botão "Novo atendimento").</summary>
        public void LoadMenu()
        {
            SetState(GameState.MainMenu);
            SceneManager.LoadScene("Menu");
        }
    }
}
