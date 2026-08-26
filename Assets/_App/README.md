# FarmaCheck: O Desafio da Anamnese

Simulador de consultorio farmaceutico (UFG) — Unity 2022.3 LTS.

O jogador percorre um mundo 3D (menu → exterior → clinica) e consulta pacientes
impulsionados por IA (local ou nuvem), praticando anamnese e decisao clinica.

---

## 1. Pre-requisitos

| Item | Versao / Comando |
|------|------------------|
| Unity | **2022.3.62f1** LTS |
| OS | Ubuntu (Linux Standalone) |
| GPU | Testado com AMD RX 6750 XT (Mesa radeonsi) |
| .NET SDK | `sudo apt-get install -y dotnet-sdk-8.0` (intellisense C#) |
| VS Code | `sudo snap install --classic code` + extensoes Unity + C# Dev Kit |

**Pacotes do projeto** (`Packages/manifest.json`):
- `com.unity.nuget.newtonsoft-json` 3.2.1
- `com.unity.textmeshpro` 3.0.6
- `com.unity.toolchain.linux-x86_64` 2.0.11

---

## 2. Build via CLI (headless)

```bash
# Mata instancias anteriores
pkill -9 -f "Unity" 2>/dev/null; pkill -9 -f "dotnet" 2>/dev/null
rm -f ~/Unity/Hub/Editor/2022.3.62f1/Editor/Data/UnityLockfile
rm -f ~/Git/game_farma/Temp/UnityLockfile

# Build
~/Unity/Hub/Editor/2022.3.62f1/Editor/Unity \
  -batchmode -quit \
  -projectPath ~/Git/game_farma \
  -executeMethod FarmaCheckSceneGenerator.BuildJogavel \
  -logFile /tmp/build.log

# Verificar
ls -la ~/Git/game_farma/Builds/Linux/FarmaCheck
```

**Importante:** Sempre passe `-logFile`. Erros de compilacao aparecem no log,
nao no stdout do batchmode.

---

## 3. Arquitetura do Jogo

```
Menu ──(E no portal)──► Exterior ──(porta auto)──► Consultorio
  │                        │                         │
  │  PlayerWalk +          │  PlayerWalk +           │  Chat com IA
  │  PortalTrigger         │  PortaClinica           │  Anamnese/Conduta
  │                        │                         │  Avaliacao Preceptor
```

### Cenas

| Cena | Arquivo | Descricao |
|------|---------|-----------|
| Menu | `Assets/_App/Scenes/Menu.unity` | Selecao de paciente + portal 3D |
| Exterior | `Assets/_App/Scenes/Exterior.unity` | Fachada da clinica + porta trigger |
| Consultorio | `Assets/_App/Scenes/Consultorio.unity` | Sala de atendimento com chat UI |

### Pipeline de IA (3 camadas)

```
1. LocalLLM          ← llama.cpp + Qwen3-4B GGUF (CPU, ~7 tok/s)
   ↓ falhou?
2. LLMClient         ← API OpenAI-compatible (cloud)
   ↓ falhou?
3. OfflinePatientBrain ← keyword matching local
```

---

## 4. Estrutura de Scripts

### API/ (namespace `FarmaCheck.API`)

| Arquivo | Classe Principal | Descricao |
|---------|-----------------|-----------|
| `LLMClient.cs` | `LLMClient` | Cliente HTTP OpenAI-compatible; 3 tiers de fallback |
| `LocalLLM.cs` | `LocalLLM` | P/Invoke para `libfarmallm.so` (llama.cpp + Qwen3-4B) |
| `ClinicalEvaluationManager.cs` | `ClinicalEvaluationManager` | Preceptor avaliador: compila log + envia para IA |

### Core/ (namespace `FarmaCheck.Core`)

| Arquivo | Classe Principal | Descricao |
|---------|-----------------|-----------|
| `GameManager.cs` | `GameManager` | Singleton central; estados: MainMenu → Anamnesis → Diagnosis → Conduct → Feedback |
| `ClinicalCase.cs` | `ClinicalCase` | Modelo de dados: Id, Nome, Idade, QueixaPrincipal, SystemPrompt, etc. |
| `PatientDatabase.cs` | `PatientDatabase` | 3 pacientes hard-coded com System Prompts completos |
| `OfflinePatientBrain.cs` | `OfflinePatientBrain` + `OfflineEvaluator` | Dialogo por keywords + avaliacao por checklist |
| `ConversationHistory.cs` | `ConversationHistory` | Log serializavel para avaliacao do Preceptor |
| `PortalTrigger.cs` | `PortalTrigger` | Gatilho do portal do menu (tecla E → cena Exterior) |
| `PortaClinica.cs` | `PortaClinica` | Gatilho da porta (colisao → paciente aleatorio → Consultorio) |

### UI/ (namespace `FarmaCheck.UI`)

| Arquivo | Classe Principal | Descricao |
|---------|-----------------|-----------|
| `ChatUIManager.cs` | `ChatUIManager` | Janela de chat: bubbles, envio, microfone (STT), sonificacao de red flags |
| `PatientSelector.cs` | `PatientSelector` | Botao do menu → mapeia para indice do PatientDatabase |
| `MessageBubbleView.cs` | `MessageBubbleView` | Balao estilo WhatsApp (teal/jogador, branco/paciente) |

### Global (sem namespace)

| Arquivo | Classe Principal | Descricao |
|---------|-----------------|-----------|
| `PlayerWalk.cs` | `PlayerWalk` | FPS controller: WASD + mouse look + gravidade (CharacterController) |

### Editor/

| Arquivo | Classe Principal | Descricao |
|---------|-----------------|-----------|
| `FarmaCheckSceneGenerator.cs` | `FarmaCheckSceneGenerator` | Gerador programatico de cenas (menu, exterior, consultorio) |
| `FarmaCheckTmpDiag.cs` | `FarmaCheckTmpDiag` | Diagnostico de configuracao TMP |

---

## 5. Pacientes (Clinical Cases)

| # | Nome | Idade | Queixa Principal | Red Flags |
|---|------|-------|-------------------|-----------|
| 0 | Carlos | 35 | "Faz uns 3 dias que ta queimando aqui no estomago, e piora quando eu deito" | Nenhum |
| 1 | Beatriz | 22 | "No fim do dia parece que alguem aperta minha cabeca dos dois lados" | Nenhum |
| 2 | Dona Antonia | 68 | "Faz 2 dias que so vou pro banheiro, e sai tudo aguadinho" | **SIM** — Febre 38.5C + sangue/moco nas fezes (OCULTO, so revela se perguntado) |

### Detalhes clinicos

**Carlos (35)** — Dispepsia / azia
- Motorista de app, estressado, fala informal
- Historico: duracao, fatores agravantes/alivio, screening de hemorragia digestiva, screening cardiaco, disfagia, nausea, medicacoes

**Beatriz (22)** — Cefaleia tensao
- Estagiaria jovem, educada, levemente ansiosa
- Historico: padrao de inicio, febre, nausea, alteracoes visuais, sinais neurologicos, tempo de tela, cafeina, sono, medicacoes

**Dona Antonia (68)** — Diarreia infecciosa aguda (COM RED FLAGS OCULTOS)
- Idosa, carinhosa, chama farmaceutico de "meu filho/minha filha"
- Historico: duracao, alimentacao, frequencia, desidratacao, tontura posural, vomito, **febre** (oculto), **sangue/moco** (oculto), medicacoes (losartana + metformina)
- ⚠ O jogador DEVE perguntar especificamente sobre febre e sangue nas fezes

---

## 6. LLM Local (Qwen3-4B)

| Propriedade | Valor |
|-------------|-------|
| Modelo | `qwen3-4b-q4_k_m.gguf` (2.4 GB) |
| Localizacao | `Assets/StreamingAssets/Models/` |
| Plugin nativo | `Assets/Plugins/x86_64/libfarmallm.so` (6.2 MB) |
| Contexto max | 2048 tokens |
| Output max | 300 tokens |
| Temperature | 0.7 |
| Template | ChatML com `/no_think` |
| Performance | ~7 tok/s CPU (28 threads) |

**Fallback offline:** `OfflinePatientBrain.cs` — matching por keywords +
`OfflineEvaluator.cs` — avaliacao por checklist quando nao ha rede nem modelo local.

---

## 7. Materiais e Prefabs

### Materiais (`Assets/_App/Materials/`)

| Material | Uso |
|----------|-----|
| `Chao.mat` | Piso |
| `Madeira.mat` | Mesa, cadeira |
| `Parede.mat` | Paredes da sala |
| `Pele.mat` | Cabeca do paciente |
| `MedicoAzul.mat` | Uniforme medico |
| `TealFarma.mat` | Cor principal teal #0D9488 |
| `TealDark.mat` | Variante teal escuro |

### Prefabs (`Assets/_App/Prefabs/`)

| Prefab | Uso |
|--------|-----|
| `MessageBubble.prefab` | Balao de chat estilo WhatsApp |
| `PatientPlaceholder.prefab` | Avatar 3D do paciente (primitivas: sphere head + box body) |

### Fontes (`Assets/_App/Fonts/`)

- `DejaVuSans.ttf`
- `FreeSans.ttf`
- `LiberationSans-Regular.ttf`

---

## 8. Fluxo do Jogo (Runtime)

1. **Menu** — Jogador entra no portal (colisao) → pressiona **E** → cena Exterior
2. **Exterior** — Caminha ate a porta da clinica → colisao automatica → GameManager.StartRandomCase() → sorteia paciente → cena Consultorio
3. **Consultorio** — Chat UI na parte inferior da tela; jogador digita perguntas; IA responde (local/nuvem/offline)
4. **Conduta** — Ao final da anamneses, 3 opcoes de conduta clinica
5. **Feedback** — Preceptor avaliador: nota 0-100 + feedback textual

### Controles

| Acao | Tecla |
|------|-------|
| Mover | WASD |
| Olhar | Mouse |
| Interagir | E |
| Liberar cursor | ESC |
| Travar cursor | Click |

---

## 9. Acessibilidade

### Implementado

- **WebGL**: bridge JavaScript (`FarmaCheckAccessibility.jslib`) para Web Speech API
  - TTS via `speechSynthesis` (lê respostas do paciente e relatório final)
  - STT via `SpeechRecognition` (botão 🎤)
  - Região `aria-live="polite"` para leitores de tela
- **Red-flag sonification**: scan da resposta por keywords clinicas → beep grave
- **Audiodescricao inicial** do estado visual do paciente

### Pendente / Desktop

- `AccessibilityManager.cs` foi deletado (pasta vazia)
- Chamadas TTS desktop stubadas com `Debug.Log` em `ChatUIManager.cs`
- `edge-tts 7.2.8` disponivel no sistema (testado: `edge-tts --voice "pt-BR-FranciscaNeural"`)
- Integracao TTS desktop pendente

---

## 10. Build Output

```
Builds/Linux/
├── FarmaCheck              (executavel Linux x86_64)
├── UnityPlayer.so          (32.1 MB)
└── FarmaCheck_Data/
    ├── Plugins/
    │   └── libfarmallm.so  (6.2 MB — llama.cpp native)
    ├── StreamingAssets/
    │   └── Models/
    │       └── qwen3-4b-q4_k_m.gguf (2.4 GB)
    └── Managed/
        └── Assembly-CSharp.dll (64 KB — scripts compilados)
```

### Executar

```bash
DISPLAY=:1 nohup ~/Git/game_farma/Builds/Linux/FarmaCheck </dev/null >/tmp/jogo.log 2>&1 &
```

### Logs de runtime

```bash
tail -f ~/.config/unity3d/DefaultCompany/game_farma/Player.log
```

---

## 11. Pendencias Conhecidas

| Prioridade | Descricao |
|------------|-----------|
| 🔴 Alta | Compile error: `AccessibilityManager` referenciado em `FarmaCheckSceneGenerator.cs` e `ClinicalEvaluationManager.cs` (classe deletada) |
| 🔴 Alta | Compile error: `ChatUIManager.cs` — campos `accessibility?.Speak(...)`, `.IsMicSupported`, `.StartListening()` em tipo `object` |
| 🟡 Media | Bug "limbo" — jogador cai infinitamente ao encostar nas paredes do consultorio (colliders das paredes destruidos pelo generator) |
| 🟡 Media | Paciente invisivel ou posicao errada em relacao a chat UI |
| 🟡 Media | Integracao TTS desktop (edge-tts) ainda pendente |
| 🟡 Media | Sem assets 3D (modelos, texturas) — sala usa primitivas |
| 🟡 Media | Pasta `Assets/_App/Models/` vazia |
| 🟡 Media | Pasta `Assets/_App/Audio/` vazia (sem clips de audio) |
| 🟢 Baixa | Upgrade para URP (Built-in funciona mas visual e basico) |
| 🟢 Baixa | Kenney.nl assets retornam 404; Blender nao instalado |
