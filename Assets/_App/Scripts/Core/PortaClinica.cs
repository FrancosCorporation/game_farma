// =============================================================================
// PortaClinica.cs — Trigger na porta da clinica: paciente aleatorio + Consultorio
// =============================================================================
using UnityEngine;
using FarmaCheck.Core;

namespace FarmaCheck.Core
{
    /// <summary>
    /// Colocado na porta da clinica (cena Exterior). Quando o jogador entra,
    /// sorteia um paciente aleatorio e carrega o Consultorio.
    /// </summary>
    public class PortaClinica : MonoBehaviour
    {
        [Header("Configuracao")]
        [SerializeField] private string nomeCenaDestino = "Consultorio";
        [Tooltip("Tag do objeto que ativa o gatilho (jogador).")]
        [SerializeField] private string tagJogador = "Player";

        private bool transicionando;

        private void OnTriggerEnter(Collider other)
        {
            if (transicionando) return;
            if (!other.CompareTag(tagJogador)) return;

            transicionando = true;
            Debug.Log($"[PortaClinica] COLISAO DETECTADA! Objeto: {other.name} (tag={other.tag})");
            Debug.Log($"[PortaClinica] Entrando na clinica! Sorteando paciente...");

            if (GameManager.Instance != null)
            {
                GameManager.Instance.StartRandomCase();
            }
            else
            {
                Debug.LogError("[PortaClinica] GameManager nao encontrado!");
                UnityEngine.SceneManagement.SceneManager.LoadScene(nomeCenaDestino);
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (other.CompareTag(tagJogador)) transicionando = false;
        }

        private void Update()
        {
            // Debug: mostra estado
            if (transicionando)
                Debug.Log("[PortaClinica] Estado: transicionando (aguardando carga)");
        }
    }
}
