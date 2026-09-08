# 🎮 FARMACHECK — O Desafio da Anamnese · Planejamento Consolidado (v4)

> **Data:** 08/09/2026 · **Branch:** `v3-rewrite` · **Plataforma:** Web (navegador, WebGL/Three.js)
> **Fonte de verdade:** GDD oficial (Documento de Especificação de Game Design) + este arquivo.
> **Histórico:** `docs/PLANEJAMENTO_GAME.md` e `docs/IMPLEMENTACAO_TRACKER.md` (visão v3 — mantidos como registro).

---

## 1. Visão (GDD oficial)

Simulador interativo de **anamnese e cuidado farmacêutico** em drogaria comunitária.
Jogador em **primeira pessoa (POV do farmacêutico)**, com navegação de câmera por
**pontos de interesse** (paciente · computador/bulário · mesa/teste rápido).
Anamnese por texto livre com IA, testes rápidos, consulta a bulário/diretrizes,
emissão da **DSF** (Declaração de Serviços Farmacêuticos — Anvisa/CFF) e conduta final.

**Estilo visual:** 3D estilizado semi-realista.
**Stack:** Vanilla JS + **Three.js** + Vite · IA local llama.cpp (ROCm, Qwen3.5-9B) · fallback determinístico.

---

## 2. Requisitos do GDD (resumo operacional)

### 2.1 Câmera / UI
- POV 1ª pessoa; look-around por zonas: **paciente** (anamnese), **PC à lateral**
  (bulário/OMS), **mesa** (kit TLAC).
- HUD: caixa de diálogo inferior (texto livre + respostas) + botões de ação
  ("Consultar Computador", "Realizar Teste Rápido", "Gerar Declaração").

### 2.2 IA do paciente (system prompt)
- **Linguagem leiga obrigatória** ("dor atrás dos olhos", não "retro-orbital").
- **Manutenção estrita de personagem** (off-topic responde no personagem).
- **Gatilhos de informação:** detalhes cruciais só revelados se a pergunta investigativa
  correspondente for feita (já implementado via Fact Gate — manter e estender).

### 2.3 Pontuação 0–100 (tabela oficial do GDD)
| Ação | Impacto |
|---|---|
| Identificar queixa principal + duração | **+20** |
| Investigar sinais de alarme (contraindicações, medicação, alergias) | **+20** |
| Consultar bulário/diretrizes no computador | **+10** |
| Executar teste rápido (TLAC) quando indicado | **+20** |
| Emitir DSF com conduta correta | **+30** |
| **Dispensar contraindicado (ex.: AAS/Sonrisal em dengue)** | **−100 (reprovação imediata)** |
| Omitir teste necessário | **−30** |
| Não encaminhar arbovirose ao pronto-socorro | **−40** |
| Orientação inadequada em quadro autolimitado | **−25** |

### 2.4 Casos clínicos oficiais
1. **Carla, 24** — suspeita de dengue: pede Sonrisal (AAS contraindicado), revela
   dor retro-orbital/febre alta súbita via anamnese → consulta no PC + TLAC (NS1/IgM)
   positivo → recusa, hidratação/sinais de alarme, **DSF de encaminhamento urgente**.
2. **Roberto, 30** — dispepsia autolimitada: sem sinais de alarme → **MIP antiácido** +
   orientação não-medicamentosa + DSF.
3. **Cátia, 45** — dermatite de contato leve: sem sintomas sistêmicos → proteção (luvas),
   emoliente/MIP tópico + DSF.

### 2.5 Fluxo
`Atendimento → POV 3D → (paciente | PC | mesa) → TLAC → DSF → Revisar/Finalizar → Nota 0–100`

---

## 3. Gaps — GDD × Código atual

| Requisito GDD | Estado no código | Ação |
|---|---|---|
| Capa `inicio_game.jpeg` com botões (Iniciar/Referências/Linguagem PT-EN) | ❌ não existe | **F0** |
| i18n PT/EN do shell (capa, menu, HUD) | ❌ não existe | **F0** |
| Painel Referências (créditos UFG + bibliografia) | ❌ não existe | **F0** |
| Casos Carla/Roberto/Cátia | ❌ não estão nos 11 casos atuais | **F1** |
| Tabela de pontuação do GDD (−100 reprovação etc.) | ⚠️ `scoring.js` atual usa outro esquema | **F1** |
| Navegação de câmera por pontos de interesse | ⚠️ câmera fixa no balcão | **F2** |
| Consulta de bulário no computador (zonas interativas) | ❌ não existe | **F2** |
| Minigame TLAC (teste rápido) | ❌ não existe | **F3** |
| DSF (geração/validação Anvisa/CFF) | ❌ não existe | **F4** |
| Anamnese IA fat-gated + linguagem leiga + persona | ✅ já existe (`factGate.js`, `prompts.js`) | estender |
| Cena 3D farmácia + avatar procedural + pós-processamento | ✅ já existe | melhorar |
| Fases/progressão/persistência | ✅ já existe (adaptar) | adaptar |

---

## 4. Roadmap priorizado

### F0 — Capa + i18n + Referências *(próxima execução, já especificado)*
- Mover `inicio_game.jpeg` → `public/capa/` (+ `.webp` com fallback).
- Overlay `#capa`: stage `aspect-ratio: 1406/791` travado + **hotspots `<button>` em %**
  sobre os botões da arte (Iniciar Jogo → menu de fases atual; Referências → painel;
  chips PT/EN → idioma). Hover/foco, teclado, aria, SFX (`sfx.js`).
- `src/ui/i18n.js`: dicionários pt/en, `data-i18n`, `localStorage` (`farmacheck:lang`),
  default pt-BR. Shell traduzido; conteúdo clínico permanece PT (tradução EN pendente PO).
- Painel Referências: **créditos** (UFG, equipe/PO Jhuly, isenção legal, SUS) +
  **bibliografia** extraída de `cases.js` com carimbo "pendente validação PO".
- Validação: build + Playwright (alinhamento de hotspots, cliques, toggle PT/EN).

### F1 — Casos oficiais + Scoring v2
- Implementar Carla/Roberto/Cátia em `src/data/cases.js` (schema atual estendido com
  campos: `testeRapido`, `dsf`, tabela de pontos do GDD).
- `src/core/scoring.js` v2: acumular +20/+20/+10/+20/+30; **−100 = reprovação imediata**;
  penalidades −30/−40/−25; debrief mostra breakdown por métrica do GDD.

### F2 — POV + pontos de interesse + PC/bulário
- Controle de câmera look-around (drag/mouse) com snapping nas 3 zonas
  (paciente central, PC esquerda/direita, mesa) — transições suaves (tween).
- Interativos: computador (UI de bulário/diretrizes in-game, +10 pontos), mesa (TLAC).
- Botões HUD: "Consultar Computador" / "Realizar Teste Rápido" / "Gerar Declaração".

### F3 — Minigame TLAC
- Fluxo: coletar amostra → reagente → temporizador → leitura do resultado
  (positivo/negativo conforme `case.testeRapido`). Pular teste indicado = −30.

### F4 — DSF (Anvisa/CFF)
- Formulário guiado (conduta, orientações, encaminhamento) → preview imprimível/PDF
  (padrão do export do debrief). Conduta correta = +30; errada aplica penalidades.

### F5 — Banco de Skills (registro obrigatório)
- Nova skill `web_start_screen_capa_i18n` (SKILL.md + catálogo + índice) após F0 validado.
- Skill de scoring v2/DSF quando F1/F4 validados.

---

## 5. Banco de Skills — status verificado (08/09/2026)

Local: `~/Git/site_corp/banco_skills/` (formato: `<nome>.md` catálogo + `<nome>/SKILL.md` + índice no README).

- ✅ **`hunyuan3d_geracao_3d`** — VERIFICADA: cobre os 4 URLs fornecidos
  (Hunyuan3D-2 DiT+Paint, portal hunyuan3d, 2D-to-3D-Image-Converter/MiDaS→GLB,
  WorldClaw). VRAM 6/16 GB, `api_server.py` :8080, Blender addon, gradio, ComfyUI.
  **Pipeline pronto para gerar corpinhos/avatares 3D (.glb) nas próximas fases**
  (contrato `loadGLBFPatient` já existe em `src/scene/patient.js`).
  - ⚠️ WorldClaw re-verificado em 08/09: repo **sem código** (só README/assets,
    paper arXiv 2608.05248) — trackear até saírem pesos.
- ✅ **NOVAS (08/09/2026)**:
  - **`hunyuan3d_rocm_12gb`** — Hunyuan na RX 6750 XT 12 GB: variantes que cabem
    (2.1/2mini + low_vram + FlashVDM), Paint 2.1 (2.0 pede 16 GB), porta **:8090**,
    convivência com llama.cpp/ComfyUI.
  - **`threejs_glb_rig_poses`** — rig NLA com Actions `Idle/Pain/Weakness/Discomfort/
    Embarrassed` (nomes do poseMap) + export glTF + contrato `loadGLBFPatient`.
- ✅ Apoio já disponíveis: `modelagem_personagem_3d`, `blender_foto2d_para_3d`,
  `threejs-characters-3d-refs`, `gamedev_art_3d-asset-pipeline`, `blender_*`, MCPs
  (`mcp_blender`, `mcp_threlte`, …), `playwright` (validação web).

### 🧊 Planejamento 3D dedicado
**`docs/PLANEJAMENTO_3D.md`** — pipeline completo (personagens do elenco, props da
farmácia real, realismo PBR), decisão Blender × Hunyuan3D × ComfyUI por tipo de asset,
milestones G0–G6, orçamento de performance web e contratos de integração. Fases 3D
(G0–G6) rodam em paralelo/anteriores às fases F0–F5 deste documento.
- ℹ️ Pasta "passatempo" **não localizada** no servidor — conhecimento já consolidado
  nas skills acima.

---

## 6. Pendências

- [ ] Tradução EN do conteúdo clínico (bloqueada por validação da PO — Jhuly).
- [ ] Validação clínica dos casos Carla/Roberto/Cátia antes de congelar.
- [ ] Confirmar local da pasta "passatempo" (se existir fora deste servidor).
- [ ] Endpoint llama.cpp :8081 ativo para voz IA em tempo real (fallback: templates + TTS).

---

## 7. Critérios de pronto (por fase)

- **F0:** capa alinhada pixel-perfect, PT/EN persistido, Referências completo, build limpo,
  smoke Playwright OK, skill registrada no banco.
- **F1:** 3 casos GDD jogáveis fim-a-fim com nota conforme tabela oficial.
- **F2:** navegação de câmera estável (60 fps, `prefers-reduced-motion` respeitado).
- **F3:** TLAC completo com consequência real na nota.
- **F4:** DSF gerada/imprimível com todos os campos do GDD.
