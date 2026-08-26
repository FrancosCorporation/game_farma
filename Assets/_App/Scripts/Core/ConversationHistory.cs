// =============================================================================
// ConversationHistory.cs — Log serializável da entrevista
// Usado pelo ClinicalEvaluationManager para enviar o histórico à IA.
// =============================================================================
using System;
using System.Collections.Generic;

namespace FarmaCheck.Core
{
    /// <summary>Representa uma mensagem do chat (semelhante ao LLMMessage mas para persistência).</summary>
    [Serializable]
    public class ChatMessage
    {
        public string role;   // "user" = jogador, "assistant" = paciente, "system" = prompt
        public string content;
    }

    /// <summary>Log completo da conversa, exportável para o Preceptor.</summary>
    [Serializable]
    public class ConversationHistory
    {
        public List<ChatMessage> messages = new List<ChatMessage>();

        public void AddMessage(string role, string content)
        {
            messages.Add(new ChatMessage { role = role, content = content });
        }

        public string BuildTextLog()
        {
            var sb = new System.Text.StringBuilder();
            foreach (var msg in messages)
            {
                if (msg.role == "system") continue;
                string autor = msg.role == "user" ? "FARMACÊUTICO" : "PACIENTE";
                sb.AppendLine($"{autor}: {msg.content}");
            }
            return sb.ToString();
        }
    }
}
