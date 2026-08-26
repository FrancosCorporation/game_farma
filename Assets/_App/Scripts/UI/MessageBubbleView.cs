using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace FarmaCheck.UI
{
    /// <summary>
    /// Componente visual de um balão de mensagem do chat (estilo WhatsApp).
    /// Deve estar na raiz do prefab MessageBubble junto com:
    /// - Image (fundo arredondado, sprite "UISprite" built-in em modo Sliced)
    /// - TextMeshProUGUI (texto da mensagem)
    /// </summary>
    [RequireComponent(typeof(HorizontalLayoutGroup))]
    public class MessageBubbleView : MonoBehaviour
    {
        [SerializeField] private Image fundo;
        [SerializeField] private TextMeshProUGUI texto;

        // Paleta oficial do projeto (GDD): teal #0D9488 para o farmacêutico,
        // branco para o paciente, cinza-escuro para contraste de texto.
        private static readonly Color32 CorFarmaceutico = new Color32(13, 148, 136, 255);   // #0D9488
        private static readonly Color32 CorPaciente = new Color32(255, 255, 255, 255);      // #FFFFFF
        private static readonly Color32 CorTextoEscuro = new Color32(31, 41, 55, 255);      // #1F2937

        /// <summary>Configura o conteúdo e o estilo conforme quem enviou.</summary>
        public void Setup(string mensagem, bool enviadoPeloJogador)
        {
            texto.text = mensagem;
            texto.alignment = enviadoPeloJogador ? TextAlignmentOptions.Right : TextAlignmentOptions.Left;
            fundo.color = enviadoPeloJogador ? CorFarmaceutico : CorPaciente;
            texto.color = enviadoPeloJogador ? Color.white : (Color)CorTextoEscuro;
        }
    }
}
