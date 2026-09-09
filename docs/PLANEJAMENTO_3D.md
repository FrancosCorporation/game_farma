# 🧊 FarmaCheck — Planejamento 3D (personagens, cenário e realismo)

> **Data:** 08/09/2026 · **Branch:** `v3-rewrite` · Complementa `planejamento.md` (v4, F0–F5).
> **Objetivo:** sair do "3D procedural" atual para **semi-realismo**: personagens modelados
> (Carla, Roberto, Cátia, farmacêutico, NPCs), farmácia real (balcão, gôndolas, vitrine,
> PC, mesa TLAC) e props com material PBR — tudo rodando leve no navegador.

---

## 1. Hardware e restrições reais (medidas neste servidor)

| Item | Valor | Consequência |
|---|---|---|
| GPU | AMD Radeon RX 6750 XT · **12 GB** (gfx1031, `HSA_OVERRIDE_GFX_VERSION=10.3.1`) | Hunyuan3D-2 completo (shape+texture) pede **16 GB** → precisa de estratégia (§3) |
| ROCm | 6.4.2, validado com llama.cpp | PyTorch ROCm funciona nesta máquina (precedente llama-cpp-rocm-gpu) |
| Portas ocupadas | llama.cpp `:8080`/`:8081` · ComfyUI `:8188` | Hunyuan `api_server.py` → **`:8090`** |
| Blender | 5.2.1 LTS (snap) | Retopo/rig/bake/UV — skills `blender_*` |
| ComfyUI | SDXL local, host, `:8188` | Character sheets, texturas tileable, banners |
| Disco | `/media/servidor/nvme_data` com 1,2 TB livres | Modelos HF (2mini ≈ 2 GB, 2.0 ≈ 10 GB) sem pressão |

**Regra de ouro da GPU:** geração de assets é **dev-time** (não roda junto com o jogo).
Para o batch de geração: **parar o llama-server** (Qwen3.5-9B Q8 usa ~10 GB dos 12 GB)
ou rodar Hunyuan em modo low-VRAM; ComfyUI e Hunyuan alternam, nunca simultâneos.

---

## 2. Inventário de assets (o que precisa existir)

### Personagens (cada um = 1 `.glb` com 5 clips)
| Asset | Origem visual | Clips obrigatórios | Destino |
|---|---|---|---|
| Carla (24, dengue) | character sheet SDXL | Idle, Pain, Weakness, Discomfort, Embarrassed | `public/models/carla.glb` |
| Roberto (30, dispepsia) | character sheet SDXL | idem | `public/models/roberto.glb` |
| Cátia (45, dermatite) | character sheet SDXL | idem | `public/models/catia.glb` |
| Nelson, Marina + demais casos (11) | variações do sheet base | idem | `public/models/<caseId>.glb` |
| Farmacêutico (mãos/antebraço POV) | modelagem Blender | — (primeira pessoa) | `public/models/farmaceutico.glb` |

### Cenário e props (farmácia real)
| Asset | Estratégia | Destino |
|---|---|---|
| Casco da farmácia (paredes, piso, teto) | **manter procedural** (`pharmacy.js`) + texturas PBR tileable (ComfyUI) | código |
| Balcão | Blender (modelagem manual, curvas/acetato) → GLB | `public/models/prop_balcao.glb` |
| Gôndolas + ~40 caixas de remédio | Hunyuan3D-2 (1 prop base + variação de textura) ou Blender instancing | `public/models/prop_gondola.glb` |
| Vitrine refrigerada | Blender (vidro/acrílico = transmissão) | `public/models/prop_vitrine.glb` |
| PC do bulário + mesa TLAC | Blender (low-poly + PBR) | `public/models/prop_pc.glb`, `prop_mesa.glb` |
| Fundo externo (fachada/rua) | 2D-to-3D (MiDaS) ou Projection Map (skill `blender_foto2d_para_3d`) | `public/models/ambiente_rua.glb` |

---

## 3. Decisão de ferramenta por tipo de asset (Blender × Hunyuan3D × ComfyUI)

| Necessidade | Ferramenta escolhida | Por quê |
|---|---|---|
| **Personagem (corpo + rosto)** | **Hunyuan3D-2mini/2.1 (shape)** ← character sheet SDXL → **retopo+rig Blender** | IA dá forma orgânica em minutos; Blender garante topologia p/ animação |
| **Textura do personagem** | Hunyuan3D-Paint **2.1** (≥6 GB, cabe na 6750 XT) ou pintura Blender | 2.0-Paint pede 16 GB → usar 2.1 |
| **Props duros (balcão, prateleira, PC)** | **Blender puro** | IA erra bordas retas/paralelismo; box modeling é mais rápido e limpo |
| **Props orgânicos/detalhados (plantas, itens de vitrine)** | Hunyuan3D-2 + cleanup Blender | IA vence em orgânico |
| **Texturas PBR tileable (piso, parede, madeira, gôndola)** | **ComfyUI SDXL** (seamless) | Já operacional; controle da paleta teal/âmbar |
| **Fundo externo / ambiente** | 2D-to-3D (MiDaS) ou Projection Map | Leve, sem diffusion — props de fundo não precisam de alta fidelidade |
| **Mundo aberto agêntico** | ❌ Hunyuan3D-WorldClaw | **Só paper** (repo sem código — 3 commits, README+assets). Reavaliar quando soltarem pesos |

**Config Hunyuan nesta máquina (12 GB):**
```bash
python3 gradio_app.py --model_path tencent/Hunyuan3D-2.1 \
  --low_vram_mode   # shape 2.1 ≥3 GB + Paint 2.1 ≥6 GB ⇒ ~9 GB pico, cabe
# API (preferida p/ lote): python api_server.py --host 0.0.0.0 --port 8090
# Shape só (6 GB, 2.0): ok · Shape+Paint 2.0 (16 GB): NÃO cabe → usar 2.1 ou 2mini
```
Detalhes de setup ROCm, conflito de porta e validação → skill `hunyuan3d_rocm_12gb`.

---

## 4. Contratos de integração (não negociáveis)

1. **Formato:** `.glb` · escala **1 unidade = 1 m** · pivô no **chão, entre os pés** ·
   forward = −Z (padrão glTF) · eixo Y para cima. (skill `gamedev_art_3d-asset-pipeline`)
2. **Animação:** clips nomeados **`Idle, Pain, Embarrassed, Discomfort, Weakness`** —
   o `poseMap` de `loadGLBFPatient` (`src/scene/patient.js:348`) mapeia
   `idle→Idle · mao_no_peito→Pain · curvado→Weakness · cabeca_baixa→Discomfort`.
   Sem o clip, cai no `Idle` — nunca quebra, mas perde a semiologia.
3. **Load:** `loadGLBFPatient('models/<nome>.glb', scene)` com fallback automático ao
   procedural — todo asset entra sem tocar no `Game`.
4. **Budget web (por asset):** personagem ≤ **30k tris** · prop ≤ **10k tris** ·
   `.glb` ≤ 8 MB · textura 2K máx (KTX2/DRACO quando > 4 MB) · total em VRAM de jogo < 400 MB.

---

## 5. Milestones 3D (G0–G6)

> **Status 08/09/2026:** G0 ✔ G1 (parcial — sheets base por código) **G2 ✔ G3 ✔ G4 ✔**
> (elenco de 15 personagens gerados + 5 props; integração via `loadGLBFPatient`/`propFromGLB`
> com fallback procedural). G5/G6 pendentes.

- **G0 — Infra de geração (1 sessão):** venv ROCm + clone Hunyuan3D-2 + download
  `Hunyuan3D-2mini` e `Hunyuan3D-2.1` · smoke test: 1 imagem → 1 `.glb` validado no
  Blender. ✅ critério: asset abre no Blender com textura e escala correta.
  ⚠️ **NÃO executado** — ver `hunyuan3d_rocm_12gb` quando for gerar via IA.
- **G1 — Character sheets (ComfyUI):** SDXL gera ficha frontal T-pose/neutral A-pose
  por personagem (pele/roupa/cabelo conforme `cases.js`). ✅: 11 sheets aprovados pela PO.
  ⚠️ **Parcial** — nesta sessão os looks foram definidos **por código** (paletas
  `skin/hair/shirt/pants` por caso no `gen_characters.py`); sheets SDXL seguem para G5.
- **G2 — Pipeline personagem:** ✅ **CONCLUÍDO.** `scripts/blender/gen_characters.py`
  gera os 15 `.glb` com hierarquia de partes animada por **Actions nomeadas
  (Idle/Pain/Weakness/Discomfort/Embarrassed)**. Lições Blender 5.2 registradas na
  skill `threejs_glb_rig_poses`. Validação: 5 clips por GLB, ~250-300 KB cada, sem
  pageerror, `setPose` OK (verificado via Playwright).
- **G3 — Elenco:** ✅ **CONCLUÍDO.** `swapAvatar` no `main.js` troca o avatar pelo
  `<caseId>.glb` no `startCase`, com fallback em cadeia (caso → `paciente.glb` →
  procedural). Smoke F2/F3/F4 (Carla: bulário/TLAC/DSF) 100% OK.
- **G4 — Props da farmácia:** ✅ **CONCLUÍDO.** `scripts/blender/gen_props.py` gerou
  `prop_balcao/gondola/vitrine/pc/mesa` (7-96 KB); `propFromGLB` em `pharmacy.js`
  substitui os procedurais com fallback. Verificado: 5 GLBs carregados (200) no jogo.
- **G5 — Realismo da cena:** texturas PBR tileable ComfyUI (piso/parede/madeira),
  gelo/vidro (transmission), ajuste fino de bloom/vinheta, luz de loja (LED 4000K +
  fresnel do letreiro). ✅: screenshot comparativo antes/depois aprovado + fps alvo.
- **G6 — Registro e QA:** ✅ skills registradas (`hunyuan3d_rocm_12gb`,
  `threejs_glb_rig_poses`) + smoke Playwright + build limpo.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Hunyuan-Paint 2.0 estoura 12 GB | Usar **2.1** (texture ≥6 GB) ou Paint via ComfyUI wrapper |
| Malha IA sem topologia p/ rig | Retopo obrigatória no G2 antes de qualquer rig (não pular) |
| GPU disputada (llama vs Hunyuan) | Batch de geração com llama-server parado; assets são dev-time |
| GLB pesado para web | `validate-glb.mjs` no CI manual + DRACO/KTX2 quando > 4 MB |
| WorldClaw sem código | Trackear o repo; não bloqueia nada (escopo é farmácia fechada) |
| Estilo inconsistente entre personagens | Mesmo seed/LoRA e mesmo prompt-base de sheet no ComfyUI |

---

## 7. Skills do banco envolvidas

`hunyuan3d_geracao_3d` · `hunyuan3d_rocm_12gb` (nova) · `threejs_glb_rig_poses` (nova) ·
`modelagem_personagem_3d` · `blender_bones_rig` · `blender_uv_mapping` ·
`blender_cabelo_curvas` · `blender_lowpoly_pintura` · `blender_foto2d_para_3d` ·
`gamedev_art_3d-asset-pipeline` · `threejs-farmacia-procedural-web` · `mcp_blender`.

