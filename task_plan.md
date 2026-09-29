# task_plan.md — FarmaCheck: arte estilizada + pipeline de personagens

## Retomada atual — 26/09/2026

> **Plano vivo agora:** `docs/ROADMAP.md` — workstreams W1–W6, **mapa de donos de arquivo**
> (anti-colisão entre sessões), backlog P0–P2 com critério de aceite e matriz de gates.
> Este arquivo guarda o histórico das rodadas anteriores.

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | Auditoria de código/execução/assets | **COMPLETE** | `findings.md` §21/09 |
| 2 | Bloqueios de boot (capa morta ~10 s, three.js na entry, chat travado na entrada, debriefing podendo não aparecer) | **COMPLETE** | `progress.md` §21/09 (capa 258 ms, cena 825 ms) |
| 3 | Testes reproduzíveis + build/servidor/API | **COMPLETE** | `npm run check` (62 arq.), `npm run qa:boot`, `POST /api/case/next` 200 |
| 4 | Documentação de execução (dev/build/docker/testes) | **COMPLETE** | `README.md`, `docker-compose.yml`, `Dockerfile` |
| 5 | QA completo do fluxo (decisão → debriefing) | **COMPLETE** | `npm run qa` → PASS 18/18 (26/09, `/tmp/farma-qa-full.log`) |
| 6 | **Dinâmica de plantão v1** (combo ×1,0–2,0, 12 conquistas, rank, checklist de anamnese, atalhos 1/2/3, chips consumidos) | **COMPLETE** | `npm run test:logica` (48 asserts) + `npm run qa:dynamics` 23/23 — `progress.md` Rodada 12 |
| 7 | **Walk/idle da Ana** (passada e cadência humanas) | **EM ANDAMENTO — outra sessão (W1)** | critério de aceite no `docs/ROADMAP.md` §4 (P0-1); diagnóstico: passada 0,69 m a 65 passos/min (clip em ×0,56) |

### Resolvido das pendências antigas
- ~~`usedChips` nunca preenchido~~ → chip usado **some** do painel (rodada 12).
- ~~Assets mortos (~165 MB em `public/models/`)~~ → pasta em **24 MB** (limpeza feita).

### Pendências que NÃO são bloqueio de jogar (para o PO decidir)
- Validação clínica dos 11 casos (Jhuly) antes de congelar `src/data/cases*.js`.
- Voz/LLM em tempo real: o jogo roda em modo plantão determinístico sem `llama-server` na 8081.
- Substituição "em leva" do elenco estilizado (Fase H do plano antigo) — `ana.glb` com alterações locais do PO.
- Deploy: `dist/` local ≠ remoto em 26/09 (outra sessão republicou 00:36) — republicar é decisão do PO (W5).


> **Atualizado:** 14/09/2026 (sessão opencode)
> **Objetivo geral:** migrar o FarmaCheck para a direção **3D estilizado casual mobile (Pixar/Disney)**
> e substituir o elenco legado (realista/procedural) por personagens gerados no pipeline
> local (SDXL → TRELLIS 2 → Blender → jogo), sem quebrar o jogo que está no ar.
> **Leia também:** `findings.md` (armadilhas/descobertas) e `progress.md` (log da sessão).

---

## Status das fases

| # | Fase | Status | Evidência / onde |
|---|------|--------|------------------|
| A | Diretrizes de arte estilizada + SKILL_BANK + arquivamento do realismo | **COMPLETE** | `docs/DIRETRIZES_ARTE_ESTILIZADA.md`, `SKILL_BANK/`, `future_projects/realism_core/` |
| B | Capa: botões DOM fiéis à arte (sprites fatiados) + física de clique + a11y | **COMPLETE** (10/10 no review) | `index.html` (#capa), `src/styles.css` (bloco F0), `src/ui/capa.js`, `public/capa/spr_*.webp` |
| C | Ajuste de tamanho dos botões (visual = arte + ~5px) | **COMPLETE (local, NÃO deployado)** | `src/styles.css` .capa-btn--*/capa-lang (boxes: 455×129, 382×97, 410×97) |
| D | Correções de gameplay/UX | **COMPLETE (local, NÃO deployado)** | ver decisões D1–D4 abaixo |
| E | **Pipeline de personagens estilizados** (referência → malha 3D) | **EM ANDAMENTO — job TRELLIS rodando AGORA** | ver "Fase E" abaixo |
| F | Deploy DNS das fases C+D (e A/B já foram) | **PENDENTE** | `https://francoscorporation.ddns.net/game/ufggame/` |
| G | Pós-processo do GLB (Blender: decimar ~15k tris, escala 1.7m, pivô Y=0) + preview + juiz de visão | **PENDENTE** | usar `scripts/shot3d.mjs` + `scripts/vision_judge.py` |
| H | Substituir elenco do jogo **em leva** (paciente + atendentes), quando aprovado | **PENDENTE** | `public/models/` |

## Fase E — estrutura que está sendo construída (linha de raciocínio)

Fluxo desenhado e JÁ VALIDADO até a geração:

```
1) REFERÊNCIA 2D (Pixar)         SDXL no ComfyUI (txt2img)
   └─ prompts nas âncoras de docs/DIRETRIZES_ARTE_ESTILIZADA.md §1
   └─ ✅ FEITO: /media/.../ComfyUI/output/ref_pixar_777_00001_.png (832×1216, aprovada visualmente)
   └─ script: /tmp/opencode/gen_ref.py <seed>

2) MALHA 3D                      TRELLIS 2 (img→3D) no ComfyUI
   └─ workflow: "1. Trellis 2 - Image to 3D Model - Low VRAM.json"
   └─ submissor: /tmp/opencode/submit_wf.py "<workflow>" <img> <job> [seed]   (conversor UI→API)
   └─ ⏳ EM ANDAMENTO: prompt e226cec3-... (rodando há ~35 min; NÃO INTERROMPER)
   └─ saída: /media/.../ComfyUI/output/3d/*.glb

3) PÓS-PROCESSO                  Blender headless (CPU)
   └─ decimar ao budget (6k–15k tris), escala metros, pivô Y=0, Y-up, shade smooth
   └─ refs: SKILL_BANK/SKILL_A_PIPELINE_3D_UNIVERSAL.md + SKILL_G
   └─ PENDENTE

4) QA VISUAL                     screenshot + juiz de visão
   └─ scripts/shot3d.mjs (playwright) → scripts/vision_judge.py (llama :8081)
   └─ critério: juiz ≥ "QUASE/REALISTA-ESTILIZADO" 2× + checklist §5 das diretrizes
   └─ PENDENTE

5) INTEGRAÇÃO NO JOGO            contrato loadGLBFPatient(enter/leave/setPose/update)
   └─ fallback em cadeia: caso.glb → paciente.glb → procedural (NÃO quebrar)
   └─ substituir EM LEVA (nunca item a item) — DIRETRIZES §6
   └─ PENDENTE
```

## Ressalvas do PO para a PRÓXIMA geração de referência (14/09, 21:45)

> A referência `ref_pixar_777_00001_.png` foi **aprovada** ("ficou bom"). **A pose de mãos na cintura
> está APROVADA — não restringir.** O ajuste é fazer o modelo **entender melhor** o que queremos:

- **Defeito exato a corrigir**: na **mão esquerda** (que fecha na cintura) apareceu um **botão da camisa
  (disco escuro) entre/sobre os dedos** — parece um buraco no meio deles.
- **Estratégia (sem restringir a pose)**: descrever as mãos e olhos em **positivo** + negativos específicos
  do defeito (não da pose):
  - Positivo: `both hands resting on hips, hands cleanly modeled, naturally curled relaxed fingers,
    clear finger separation, no objects overlapping the hands` + olhos `clean symmetric eyes, round irises,
    centered pupils, calm friendly gaze`
  - Negativo adicional: `button between fingers, object between fingers, hole between fingers,
    gap between fingers, webbed fingers, fused fingers, extra fingers, missing fingers`
- **Método**: gerar **lote de 3–4 seeds de uma vez** (batch no mesmo run) e escolher o melhor nas mãos/olhos.
- Contexto 3D: em img→3D os olhos viram bolinhas rasas de qualquer forma → no jogo, **olhos serão geometria
  separada** (esferas com íris pintada), padrão mobile. O artefato de botão pode ser **limpo no Blender**
  (a malha do botão não precisa existir).

## 🚦 GATE DE QUALIDADE (decisão do PO — 15/09)

> **A orquestração em lote está CONSTRUÍDA mas NÃO roda até o primeiro paciente passar no crivo do PO.**
> A Ana (workflow Low VRAM = cor por vértice, sem textura + decimate 15k) **NÃO passou**: olhos/rosto ruins.

Plano de correção em andamento:
1. **Workflow nº 2 (HQ + PBR)** — UV unwrap + bake de textura + normal map + AO (é o que segura rosto/olhos).
   Rodando para a Ana em 15/09 12:00 (`b699f750`).
2. Pós-Blender: testar 15k (budget do jogo) **e** uma variante com mais tris/cabeça protegida se o rosto perder.
3. Preview full + close de rosto → aprovação do PO.
4. Se os olhos ainda não segurarem: **geometria de olhos separada** (esferas com íris) no pós-Blender.
5. **Só depois de aprovado**: rodar `python3 scripts/comfy/batch_assets.py` (21 assets: 14 pacientes + 2 atendentes + 5 props).
   - Viewer atual: `https://francoscorporation.ddns.net/game/ufggame/real-preview.html?m=trellis_ana`

## 🎯 OTIMIZAÇÃO — checklist mestre (ordem do PO: "otimizar tudo", 15/09 00:14)

### A. Flags do ComfyUI (PRONTO p/ aplicar — precisa sudo; só depois do job atual!)
- [ ] `--reserve-vram 1.0 → 0.4` e `--vram-headroom 0.8 → 0.4` (libera ~1-1.5GB VRAM → menos CPU-offload)
- [ ] `--cache-ram 0.5 1.0 → --cache-none` (temos 20GB de swap! NVMe é mais rápido)
- [ ] `OMP_NUM_THREADS 14 → 22` + `MKL_NUM_THREADS=22` (28 threads existem; fases CPU)
- Comando pronto: drop-in em `/etc/systemd/system/comfyui.service.d/optimize.conf` (ver progress.md/findings)
- [ ] **Reboot antes de lote grande** (limpa swap acumulado de ~20GB)

### B. Operacional (agente faz — sem sudo)
- [x] Pausar `media-api` (ffmpeg) e `flaresolverr` durante geração; despausar depois
- [x] Reiniciar ComfyUI entre famílias de modelo (SDXL → TRELLIS) — evita deadlock
- [x] Checar log pós-submissão (`ignored|missing|ERROR`) — job "sucesso" ≠ saída produzida
- [x] Scripts versionados em `scripts/comfy/` (submit_wf.py + gen_ref.py)
- [ ] Avaliar pausar qbittorrent (4GB RAM) durante gerações longas
- [ ] Medir duração por estágio (shape/textura/malha/save) para baseline comparativa

### C. Pipeline/Modelos (a implementar)
- [ ] **SDXL Lightning/Hyper-SD LoRA** → referências 2D de ~8 min para ~2 min (6-8 steps)
- [ ] **LoRA de mãos** → reduzir artefatos (ex.: botão entre dedos)
- [ ] Workflow **"Iteração rápida"** (menos steps, sem RemeshMesh; só preview)
- [ ] Workflow **"Final PBR"** = usar o nº 2 existente (HQ + PBR: unwrap + bake AO/normal)
- [ ] Pesquisar **split shape×texture** (2 jobs) p/ reduzir pico de VRAM
- [x] Batch de referências (gen_ref.py gera n=4 numa passada)

### D. Hardware (decisão do PO)
- [ ] GPU 24GB → ~2-3 min/asset (vs ~30-50 min hoje)
- [ ] RAM 32 → 64GB (elimina swap)
- [ ] GGUF/Q4 (6GB) = **CUDA-only**, não roda no ROCm

## Decisões desta sessão (journal)

- **D1 — Caps ignoram teclas**: removido o auto-`focus()` do `#chat-input` no início do caso (`src/core/game.js`) para o jogador poder andar logo; digitar = clicar no chat. (Antes o focus engolia WASD/1/2/3.)
- **D2 — Andar livre restaurado**: `pov.js` ganhou modo livre WASD (2.6 m/s, limites do salão + balcão bloqueia) mantendo as zonas 1/2/3 com tween. Câmera exposta em `window.__farmacheck.camera` para QA.
- **D3 — Walk-in duplo corrigido**: `mountAvatar()` (main.js) não chama mais `enter()`; a entrada em cena é só do `game.startCase` (causa: paciente voltava pra porta e entrava 2×).
- **D4 — TTS travava o boot**: `TTS.init()` chamava `speechSynthesis.getVoices()` síncrono (~9 s em headless). Agora `setTimeout(pick, 0)` + evento `voiceschanged`.
- **D5 — Fundo inerte na capa**: enquanto a capa está aberta, todo o resto do DOM recebe `inert` (sem Tab/clique vazando), exceto `#capa`/`#refs` e ancestrais. Liberado no "Iniciar Jogo" (`src/ui/capa.js`).
- **D6 — Deploy exige 2 correções de infra**: `.dockerignore` criado (senão o build context arrastava 9.7 GB de `trellis_2_bf16.safetensors`); `server/index.mjs` agora respeita `HOST` env (antes bind fixo em 127.0.0.1 → Caddy 502).

## Próximos passos (ordem)

1. **AGUARDAR** o job TRELLIS terminar (ComfyUI queue). Depois:
   - achar o `.glb` novo em `/media/.../ComfyUI/output/3d/`
   - **religar o llama-cpp**: `docker start llama-cpp` (ficou parado p/ liberar VRAM)
   - pós-processar no Blender (Fase G) + screenshot + juiz
2. **Deploy DNS** das fases C+D: `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh`
   - conferir: `https://francoscorporation.ddns.net/game/ufggame/` (HTTP 200) e assets `capa/spr_*.webp`
3. Mostrar o personagem gerado ao PO; com aprovação, gerar o elenco (2–3 identidades primeiro) e
   substituir **em leva** (Fase H).
