// =============================================================================
// PortalTrigger.cs — Trigger no portal do menu: pressiona E -> cena Exterior
// =============================================================================
using UnityEngine;
using FarmaCheck.Core;

namespace FarmaCheck.Core
{
    /// <summary>
    /// Colocado no portal da cena Menu. Quando o jogador pressiona E dentro do trigger,
    /// carrega a cena Exterior.
    /// </summary>
    public class PortalTrigger : MonoBehaviour
    {
        [Tooltip("Nome da cena para carregar.")]
        [SerializeField] private string cenaDestino = "Exterior";
        [Tooltip("Tag do jogador.")]
        [SerializeField] private string tagJogador = "Player";

        private bool jogadorDentro;

        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag(tagJogador))
            {
                jogadorDentro = true;
                Debug.Log("[PortalTrigger] Jogador entrou no portal!");
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (other.CompareTag(tagJogador))
            {
                jogadorDentro = false;
            }
        }

        private void Update()
        {
            if (!jogadorDentro) return;
            if (Input.GetKeyDown(KeyCode.E))
            {
                Debug.Log("[PortalTrigger] E pressionado! Carregando: " + cenaDestino);
                UnityEngine.SceneManagement.SceneManager.LoadScene(cenaDestino);
            }
        }
    }
}
