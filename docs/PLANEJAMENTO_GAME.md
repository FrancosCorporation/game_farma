# 🎮 FarmaCheck Web — Planejamento Completo

> Documento mestre do novo FarmaCheck (web). Substitui os escopos Unity antigos.
> **Stack:** Vanilla JS + Three.js + Vite · **IA paciente:** 100% llama.cpp (ROCm) com Qwen3.5-9B-Q8_0.gguf · **Subagentes:** Nemotron-550B-A55B (NVIDIA, opcional)
> **Skills de referência:** `site_corp/banco_skills/` (gamedev_*, ui_ux_pro_max, skill_design_taste_frontend, playwright…)

---

## 1. Visão

Simulador educacional de **atendimento farmacêutico** em 3D web: o jogador é a
farmacêutica(o) do balcão, recebe clientes **randomizados**, conduz anamnese por
chat/voz e decide entre vender, orientar (MIP) ou encaminhar à urgência. Nota
determinística 0–100 por caso; fases de progressão; avatares e cenário 100%
procedurais; IA (llama.cpp + Qwen3.5-9B) dá voz e variação aos pacientes.

**Pilares (herdados do GDD v3.0):**
1. **O motor manda, a IA atua** — Fact Gate decide o que o LLM pode saber; a nota é determinística.
2. **O motor corrige, a IA ensina** — tudo mensurável é código; a IA humaniza a fala/relatório.

---

## 2. Decisões Fechadas

| Tema | Decisão |
|---|---|
| Stack | Vanilla JS + Three.js + Vite (base = `Escopo_official_v4_novo_game_farma.md`) |
| Avatares 3D | **100% procedural** (PatientAvatar melhorado) |
| Visual | Procedural + **ComfyUI (SDXL local)** para texturas/banners/arte do menu |
| IA do paciente | **llama.cpp (ROCm/GPU) + `Qwen3.5-9B-Q8_0.gguf`** (100%), com fallback determinístico (templates `falaLeiga`) |
| Endpoint LLM | `http://127.0.0.1:8080/v1` (OpenAI-compatible, llama-server) |
| Subagentes (opencode) | `explore`/`general` → **Nemotron-550B-A55B** via provider NVIDIA (chave = `NVIDIA_API_KEY`) |
| Persistência | `localStorage` (progresso, fases, rank) |
| Cleanup | Deletar todo o Unity; manter `Escopo_official_v4` + `docs/` |
| Banco de skills | Registrar toda skill aprendida em `site_corp/banco_skills/` (obrigatório) |

---

## 3. Estrutura do Projeto

```
game_farma/
├── index.html · package.json · vite.config.js
├── server/index.mjs          # Node 0-dep: proxy LLM (SSE) + gerador de casos + serve dist
├── src/
│   ├── main.js · styles.css
│   ├── core/    game.js · factGate.js · scoring.js · progression.js
│   ├── scene/   scene.js · pharmacy.js · patient.js · fx.js
│   ├── ai/      llm.js · prompts.js · generator.js
│   ├── audio/   sfx.js · tts.js · stt.js
│   ├── ui/      menu.js · hud.js · chat.js · decision.js · debrief.js
│   └── data/    cases.js · seeds.js
├── public/textures/          # geradas via ComfyUI
├── docs/
│   ├── PLANEJAMENTO_GAME.md   # ← este arquivo
│   └── IMPLEMENTACAO_TRACKER.md
└── .opencode/opencode.json    # provider NVIDIA + subagentes
```

---

## 4. Core Loop (skill: `gamedev_design_core_loop`)

```
ANAMNESE (pergunta) → Paciente responde (LLM/template, fatos revelados pelo motor)
   → DECIDIR (vender / sugerir MIP / encaminhar) → JUICE (beep red flag, postura, TTS)
   → NOTA determinística + desfecho narrativo → próximo paciente
```

**Feedback/juice:** beep de red flag por evento do motor, postura semiológica do avatar,
TTS das falas, telas de transição, partículas de poeira na luz.

---

## 5. Fases e Progressão (skill: `gamedev_design_progression-design`)

| Fase | Nome | Pacientes | Conteúdo |
|---|---|---|---|
| 1 | Aprendiz de Balcão | 3 | Casos simples, tutorial guiado, sem red flags críticos |
| 2 | Plantão da Tarde | 5 | Casos mistos, armadilhas de venda, red flags leves |
| 3 | Emergência Silenciosa | 5 | Condições graves ocultas (ex: caso Nelson) |
| ∞ | Expediente Livre | infinito | Pacientes randomizados pela IA (llama.cpp) |

**Progressão:** estrelas 1–3 por caso · pontos acumulados · nota mínima desbloqueia fase ·
rank final (Bronze→Diamante) · histórico persistido.

**Randomização IA:** endpoint `POST /api/case/next` → llama.cpp gera caso em JSON estrito
(schema validado antes de aceitar) → misturado ao pool; fallback = permutação com seed dos casos-base.

---

## 6. IA — 3 vias com o mesmo contrato

| Via | Backend | Uso |
|---|---|---|
| T1 | **llama.cpp (ROCm) + Qwen3.5-9B** na `:8080` | Voz do paciente (streaming SSE) + gerador de casos |
| T2 | Templates determinísticos (`falaLeiga`) | Fallback offline instantâneo |
| T3 | (futuro) NVIDIA Nemotron via proxy | Subagentes / preceptor cloud |

**Guarda anti-vazamento:** o Fact Gate nunca envia fato bloqueado ao LLM → não vaza.
Nota 0–100 determinística no motor (erro crítico → cap 50).

---

## 7. Visual 3D (procedural + ComfyUI)

- Farmácia noturna: balcão iluminado (teal), gôndolas, vitrine, letreiro emissivo.
- `EffectComposer`: bloom + vignette + ACES tone mapping.
- Raios de luz com partículas de poeira.
- Avatar procedural melhorado: proporções humanas, tons de pele/cabelo/roupa variados,
  posturas semiológicas (mao_no_peito, curvado, cabeca_baixa) + respiração.
- Texturas (paredes, banners, embalagens) e arte do menu geradas com **SDXL (ComfyUI local)**.

**Design system** (`skill_design_taste_frontend` + `ui_ux_pro_max`): vertical Gaming
(vivo, não corporativo), paleta teal/âmbar, glassmorphism no HUD, Google Fonts,
`prefers-reduced-motion` respeitado.

---

## 8. Milestones

- **M0** Setup: limpeza Unity, Vite+Three, provider NVIDIA, porta 8080/11434
- **M1** Core: factGate + KnowledgeState + scoring + llm + TTS/SFX + casos-base
- **M2** Cena 3D procedural + avatar + post-processing + texturas ComfyUI
- **M3** UI/UX: menu, HUD, chat, decisão, debrief + design system
- **M4** Fases + progressão (estrelas/rank/unlock)
- **M5** Gerador de casos IA (server + llama.cpp + schema)
- **M6** Juice & polish + a11y (WCAG) + exportar relatório
- **M7** QA (playwright) + performance budget
- **M8** Build, deploy, registrar novas skills no banco

> Progresso detalhado e checkboxes → [`IMPLEMENTACAO_TRACKER.md`](./IMPLEMENTACAO_TRACKER.md)

---

## 9. Infra LLM (llama.cpp na GPU)

- GPU: **AMD Radeon RX 6750 XT (Navi 22, 12 GB)** · ROCm 6.4.2 no container
- Modelo: `/media/servidor/nvme_data/Ai/modelos/Qwen3.5-9B-Q8_0.gguf`
- Container/serviço: `llama-server` (ROCm) exposto em `http://127.0.0.1:8081/v1`
- **Config validada:** `HSA_OVERRIDE_GFX_VERSION=10.3.1` (arch gfx1031 do build; `10.3.0` crasha) ·
  `-ngl 999` (todas as camadas na GPU) · `--cache-type-k/v q8_0` · `--flash-attn on` ·
  `-np 1` (fila serial) · contexto 100k (KV excedente cai em RAM, sem crash)
- Medido: prompt ~180 tok/s · geração ~36 tok/s (skill: `llama-cpp-rocm-gpu`)
- ComfyUI (SDXL) continua no host na `:8188`; GPU compartilhada com o llama
- `hermes-bot` já referencia `LLAMA_SERVER_URL=http://llama-cpp:8080` (design existente)

---

## 10. Pendências / Notas

- ~~Chave NVIDIA (`NVIDIA_API_KEY`) para subagentes Nemotron~~ **RESOLVIDO (08/09/2026):**
  subagentes **grátis** configurados em `.opencode/opencode.json` via **opencode Zen**
  (tier `*-free`): `operario` (braçal: build/testes/lote assets, bash+edit),
  `explorador` (varredura read-only), `revisor` (code review, nemotron-3-ultra-free).
  Testados: `nemotron-3.5-lightning-free` e `nemotron-3-ultra-free` respondem com custo
  zero. `small_model` também grátis. Chave NVIDIA do provider global segue válida
  como plano B (modelos 550B/DeepSeek). Skill: `opencode_subagentes_gratis`.
- Publicar porta do serviço llama-cpp (se container) ou rodar no host
- Conteúdo clínico dos casos-base é rascunho — validar com a PO (Jhuly) antes de congelar