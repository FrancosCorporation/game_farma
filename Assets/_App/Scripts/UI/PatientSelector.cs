// =============================================================================
// PatientSelector.cs — Botões do Menu Inicial
// =============================================================================
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using FarmaCheck.Core;

namespace FarmaCheck.UI
{
    /// <summary>
    /// Botão de seleção de paciente no menu inicial.
    /// Cada instância sabe qual índice do banco carregar.
    /// Montagem: criar um GameObject + este script + Button + TextMeshPro.
    /// </summary>
    public class PatientSelector : MonoBehaviour
    {
    [SerializeField] private int indexDoPaciente;

        // Botao clicado: inicia o atendimento do paciente correspondente.
        public void OnClick()
        {
            GameManager.Instance?.StartCaseByIndex(indexDoPaciente);
        }

        // Metodo chamado pelo gerador de cenas (evita precisar expor o campo no inspector).
        public void SetIndex(int index)
        {
            indexDoPaciente = index;
        }

        // Configura o nome do botão a partir do banco de pacientes (usado pelo gerador).
        public void SetLabel(string nome)
        {
            var txt = GetComponentInChildren<TextMeshProUGUI>();
            if (txt != null) txt.text = nome;
            else Debug.LogWarning($"[PatientSelector] Botão sem TextMeshPro em {transform.name}");
        }
    }
}
