## Estado atual — Ana044 publicada / retomada pelo resumo.md (12/10/2026)

- PO aprovou a caminhada043 e autorizou corrigir cabeça e publicar. Cabeça044 corrige fallback Hips/Spine2 com transição Neck/Head; todos os canais/tempos de animação preservados. Rest/rig/bind/materiais/mesh preservados; cabeça rígida em Walk/Idle.
- Asset ativo `public/models/ana_clasica.glb` e preview padrão =044, cachev44 em app.js. SHA local/HTTPS `45ac4e2da7206e7c481830dd1c4c5913b2b490bc875b4bc78c1fa73be74419d2`.
- Imagem persistente final `game_farma:latest` / `game_farma:ana044-groundfix-20261012`, ID409ae64d6960, containergame_farma healthy/restartunless-stopped, stack base_fundation/game_farma, networkbase_fundation_app_network, PORT4174/HOST0.0.0.0. Backupv38 em imagem/container e ana_work/head_20261012/deploy_before.
- A primeira QA online encontrou groundFix.alvo0 no ramo SKIP, que afundava nova caminhada. patient.js agora preserva inner.position.y. Rebuild/republicação feitos; QA runtime online final PASS, incluindo SKIP sem afundamento. Boot desktop e celular PASS; etapa concluída. Evidências head044; logs originais reprovados preservados, não confundir com versão final.
- **Fonte de retomada atual: resumo.md, recriado e completo.** Histórico integral anterior em validated_20261012/head044/resumo_pre044.md e HANDOFF_pre044.md. Skill criacao-modelo-3d atualizada com cabeça e ground-fix; quick_validate PASS.
- Próximo plano do PO após reinício: melhorar todos os demais objetos/ambientes. Inventariar scene.js/pharmacy.js, priorizar grandes elementos do POV, estilo consistente, candidatos por pequenos lotes e validação no jogo/celular. Nenhuma execução desse plano iniciada. Preservar caminhada aprovada.
- Worktree sujo, sem commit; não resetar/limpar. Trabalhadores gratuitos NVIDIA autorizados para tarefas mecânicas; contexto completo de entrada, retorno mínimo, sem provider pago.

## Histórico anterior

# findings.md — descobertas, armadilhas e receitas (handoff)

## Armadilhas confirmadas na sessão 21/09/2026 (com medição)

### 1. `await` no topo do entry mata a UI inteira
`src/main.js` fazia `await loadGLBFPatient('models/paciente_real.glb')` no topo. Como ESM executa
o corpo do módulo só depois de resolver todas as importações **e** o await estar pendente, todo o
wiring de DOM (capa, i18n, menu, botões) ficava para depois. Medição no headless: `window.__farmacheck`
só existia a **~10,3 s** — e nesse intervalo o clique em "Iniciar Jogo" não fazia nada.
Regra prática deste projeto: **nada de `await` no caminho crítico do boot**; carregar asset pesado
em background e trocar quando chegar (`mountAvatar`), nunca no caminho do primeiro render.

### 2. Import estático de three.js na entry atrasa o primeiro clique
O browser precisa baixar e **avaliar** o three (~600 kB) antes de executar a entry. Mesmo sem
`await`, o wiring da capa ficava atrás desse custo (pior com a máquina carregada: load average 22
medido nesta sessão → boot de ~13 s).
Solução adotada: `src/main.js` = entry leve (capa/i18n, ~13 kB) + `import('./app.js')` dinâmico para
cena/regras. Resultado medido: capa em **258–303 ms**, cena em **825 ms**.

### 3. Medir tempos de boot com Playwright: cuidado com starvation
`waitForFunction`/`waitForSelector` pollam por `requestAnimationFrame`; durante a inicialização da
cena o main thread está ocupado e a medição infla vários segundos (falso negativo: "capa não pronta
em 1,5 s" quando ela estava pronta em 258 ms). `page.addInitScript` com `MutationObserver` também
não serve: o elemento `document.documentElement` ainda pode não existir quando o init script roda.
Receita que funcionou: **carimbar o tempo dentro da página** (`data-*-ms` no `documentElement`)
e o gate só lê o valor.

### 4. Docker/deploy do repo não batia com o README
README mandava `docker compose up --build` e não havia `docker-compose.yml`; o Dockerfile usava
`serve -s dist`, que **não** expõe `POST /api/case/next` (Expediente Livre quebrava). Além disso o
nome `game_farma` já é o container de **produção** (Caddy) — usar `docker_container_name`
diferente (`game_farma_local`) evita derrubar o deploy.

### 5. Testes do repo eram frágeis
`npm run check` cobria 3 arquivos (um erro de sintaxe em `ui/`, `audio/`, `ai/` passava batido);
`scripts/smoke-f2f3f4.mjs` importava Playwright por um caminho absoluto de `~/.npm/_npx/...`
(quebra em qualquer outra máquina). Substituídos por `scripts/check-syntax.mjs` (51 arquivos) e
`import { chromium } from 'playwright'`.

### 6. `root.visible` dos avatares
`PatientAvatar` e `loadGLBFPatient` **nascem invisíveis** (`root.visible = false`) e só aparecem no
`enter()`. Qualquer troca de avatar fora do fluxo de caso precisa respeitar isso, senão o paciente
some de cena no meio do atendimento (por isso o boot só monta o GLB realista quando
`game.state` não está em atendimento).


> **Atualizado:** 14/09/2026 · Complementa `task_plan.md` e `progress.md`.
> Tudo aqui foi descoberto NA PRÁTICA nesta sessão (i.e., se doeu, está documentado).

---

## 1. ComfyUI / geração 3D (o que funciona e o que quebra)

### 1.1 Ambiente
- ComfyUI roda como **serviço systemd** (`systemctl ... comfyui`), **não** é container. Porta **8188**.
  - `WorkingDirectory=/media/servidor/nvme_data/ai_music/comfyui/ComfyUI`
  - env importante: `HSA_OVERRIDE_GFX_VERSION=10.3.0`, `PYTORCH_HIP_ALLOC_CONF=...max_split_size_mb:128`
- Pastas:
  - workflows: `.../ComfyUI/user/default/workflows/` (4 workflows: Trellis 2 LowVRAM, Trellis 2 HQ+PBR, Pixal3D LowVRAM, Pixal3D HQ+PBR)
  - modelos 3D: `.../models/diffusion_models/3D/` → **usar `trellis_2_bf16.safetensors`** (int8_convrot QUEBRA no gfx1031)
  - checkpoints (2D): `.../models/checkpoints/sd_xl_base_1.0.safetensors`
  - entrada: `.../ComfyUI/input/` · saída: `.../ComfyUI/output/` (GLBs em `output/3d/`)
- **RX 6750 XT (12 GB, gfx1031):**
  - PROTOCOLO: antes de gerar, **parar o llama**: `docker stop llama-cpp` (liberar VRAM; ele usa `-ngl 35`).
    Depois religar: `docker start llama-cpp`. NÃO use rocm-smi (não instalado).
  - Trellis 2 bf16 img→3D levou **> 35 min** (não interromper; checar `GET /queue`).
  - SDXL 832×1216, 30 steps ≈ **8 min** nesta GPU (headless).

### 1.2 Conversor UI → API — scripts versionados no repo
- **`scripts/comfy/submit_wf.py`** — converte workflow UI → API e submete (uso:
  `python3 scripts/comfy/submit_wf.py "<workflow.json>" <imagem> <nome_job> [seed]`; copia a imagem para `input/ref_char.png`).
- **`scripts/comfy/gen_ref.py`** — gera referências 2D (SDXL) com as âncoras Pixar; aceita lote:
  `python3 scripts/comfy/gen_ref.py [seed_base] [n]` (batch de variações para escolher a melhor em mãos/olhos).
- (cópias de trabalho em `/tmp/opencode/` — o versionado é o do repo.)

Getchas do conversor (todas resolvidas no script):
1. **Somente tipos-escalares consomem slot de widget**. Allowlist: `INT, FLOAT, STRING, BOOLEAN, COMBO, COLOR, LOAD_3D, COMFY_DYNAMICCOMBO_V3`.
   Tipos como `MESH`, `FILE_3D_GLB,...`, `SHAPE_SUBDIVIDES`, `MODEL` são **sockets** (não consomem).
   (Erro típico se errar: tudo desalinha e a validação acusa "Required input is missing".)
2. **`control_after_generate`**: o frontend guarda um valor extra (`fixed|increment|decrement|randomize`) **logo após o seed**.
   Pular +1 após o widget `seed`/`noise_seed` (mesmo quando o seed está linkado).
3. **DynamicCombo (`COMFY_DYNAMICCOMBO_V3`)**: consome a escolha (ex.: `'udf'`) **e os sub-widgets da opção**
   (ex.: `qef`, `drop_inverted_components`, `drop_enclosed_components`). Ex.: `RemeshMesh` (nó core em `comfy_extras/nodes_mesh_postprocess.py`).
4. **Normalizar strings de modelo**: trocar `\`→`/` e `int8_convrot`→`bf16`
   (o workflow salvo referencia `3D\trellis_2_int8_convrot.safetensors` que não existe/roda).
5. **PixaromaSeed**: o seed mora em `properties.seedState` (JSON string) → mandar como input `SeedState`.
6. **DynamicCombo (`COMFY_DYNAMICCOMBO_V3`) — FORMATO CORRETO (definitivo, 15/09)**: o input principal
   recebe a **CHAVE como string** e os sub-widgets vão **PLANOS com nome pontilhado**:
   ```json
   "sign_mode": "udf",
   "sign_mode.qef": false,
   "sign_mode.drop_inverted_components": false,
   "sign_mode.drop_enclosed_components": false
   ```
   ⚠️ **NÃO** usar dict aninhado (`{"sign_mode": ...}`) — isso PASSA na validação mas **quebra na execução**
   (`TypeError: RemeshMesh.execute() missing 1 required positional argument: 'sign_mode'`, pois
   `_expand_schema_for_dynamic` compara `option["key"] == live_inputs[parent]` e o dict nunca casa).
   Como descobrir para outros nodes: submeter e ler `extra_info.input_name` do erro de validação
   (ex.: `"input_name": "sign_mode.qef"`); fonte: `comfy_api/latest/_io.py` → `_expand_schema_for_dynamic`.
   Vale para `RemeshMesh.sign_mode` e `DecimateMesh.placement_mode` (neste último, o modo 'midpoint' não tem subs).
7. **Teste mínimo que valida o formato** (rápido, ~50s): `Load3DAdvanced → Get3DComponents → RemeshMesh →
   MeshToFile3D → Save3DAdvanced` (usar `input/3d/test_model.glb`; saída `output/3d/remesh_test_*.glb`, 9,1MB @res 256).
   Use SEMPRE esse teste antes de rodar o workflow completo (~1h+).
8. **REGRA DE OURO pós-submissão**: SEMPRE rodar
   `journalctl -u comfyui --since "1 min ago" | grep -E "ignored|missing|ERROR"` logo após enviar.
   Se aparecer `Output will be ignored`, o job "vai dar sucesso" mas não produzirá aquela saída.
   Foi assim que perdemos DUAS gerações de ~31 min sem salvar o GLB.
9. **Cuidado com cópias do script**: `scripts/comfy/submit_wf.py` e `/tmp/opencode/submit_wf.py` já
   divergiram (versão intermediária sem a allowlist) → manter os DOIS idênticos (`diff`) e usar sempre o do repo.
10. **Nó da imagem**: `PixaromaLoadImageMini` (id 324 no workflow 1) — `widgets_values[0]` = nome do arquivo em `input/`.
11. Saídas: nós `Save3DAdvanced` (335), `MeshToFile3D` (282), `Preview3DAdvanced` (246), `PixaromaFreeVram` (328).
   O `/history` do ComfyUI **não lista o .glb** de forma amigável — procurar direto em `output/3d/`.
12. Validar SEMPRE o log do serviço em caso de "sucesso" rápido (85 ms = nada executou):
   `journalctl -u comfyui --since "5 min ago" | grep ERROR` — ele diz exatamente qual input faltou/está inválido.

### 1.3 Job TRAVADO? Como detectar e resolver (aprendido 14/09 à noite)
**ATENÇÃO (correção importante):** a máquina é compartilhada e o pipeline tem **estágios CPU-bound**
(VAE na CPU, voxel/mesh: VoxelToMesh, RemeshMesh, PaintMesh). Nesses estágios é NORMAL: GPU ~0%,
sem I/O de disco e sem log. **Não matar por isso.**

Critério de travamento REAL (todos juntos, por >10–15 min):
- GPU global ~0% **E**
- **CPU instantâneo do processo** ~0% (`top -b -n2 -d1 -p <MainPID>` — NÃO usar `ps %cpu`, que é média de vida) **E**
- `/proc/<pid>/io` (read_bytes) congelado **E**
- log sem linhas novas.

Sinais de que está VIVO:
- CPU instantâneo alto (ex.: ~200%) = estágio CPU-bound rodando;
- GPU sustentada 50–99% = amostragem;
- log com transições `Requested to load` / `loaded completely` / `Unloaded` = progredindo entre estágios.

Se travar de verdade:
- `POST /interrupt` pode não resolver (deadlock no carregador de modelo).
- **Causa provável:** cache de VRAM de execução anterior (ex.: SDXL da referência) impedindo o novo
  modelo de carregar → o loader espera memória que não libera.
- **Solução (sem sudo):** `kill -9 <MainPID>` do comfyui — o serviço é `Restart=on-failure` e roda como
  `servidor`, então o systemd ressuscita limpo (VRAM 12.8/12.9 GB livres). Confirmar em seguida.
- **Regra de bolso:** ao alternar famílias de modelo (SDXL 2D → TRELLIS 3D), reiniciar o ComfyUI
  (a sessão de 13/09 já fazia isso: "fila travada com 22GB RAM → systemctl restart comfyui.service").
- Job saudável = GPU sustentada em 50–99% durante amostragem OU CPU alto em estágio de malha.

### 1.4 Referência aprovada (seed 777)
`/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/ref_pixar_777_00001_.png`
— mulher jovem estilo Pixar, corpo inteiro, pose neutra, fundo rosa suave (aprovada visualmente; prompts em `gen_ref.py`).

---

## 2. Bugs do jogo descobertos nesta sessão (todos corrigidos no código local)

| Sintoma | Causa raiz | Correção |
|---|---|---|
| Paciente entra, volta pra porta e entra de novo | `mountAvatar()` chamava `enter()` E `game.startCase` chamava `enter()` de novo | remover `enter()` do `mountAvatar` (`src/main.js`); entrada é responsabilidade só do `startCase` |
| Não dá pra andar (WASD) | (a) sistema de zonas substituiu o WASD; (b) auto-`focus()` no `#chat-input` engolia as teclas | modo livre WASD em `src/scene/pov.js` + remoção do autofocus (`src/core/game.js:181`) |
| Boot ~10 s "travado" (sem erro) | `TTS.init()` → `speechSynthesis.getVoices()` síncrono bloqueia em ambiente sem backend de voz | `setTimeout(pick, 0)` + `voiceschanged` (`src/audio/tts.js`) |
| Fundo da capa tabulável (btn-tts etc.) | nada isolava o jogo atrás da capa | `inert` na árvore exceto capa/refs/ancestrais (`src/ui/capa.js`) — CUIDADO: nunca inerte um **ancestral** da capa |
| 502 no DNS após deploy | `server/index.mjs` com bind fixo `127.0.0.1` (Caddy não alcança) | respeitar `HOST` env (rebuild.sh passa `HOST=0.0.0.0`) |
| Build Docker arrastaria 9.7 GB | sem `.dockerignore` (raiz tem `trellis_2_bf16.safetensors`) | `.dockerignore` criado na raiz |

---

## 3. Receitas de verificação (QA)

- **Preview local do build:** `setsid --fork sh -c 'cd /home/servidor/Git/game_farma && exec npx vite preview --port 4174 --host 127.0.0.1 > /tmp/vite_preview.log 2>&1'`
  (⚠️ NUNCA `pkill -f "vite preview"` — o padrão casa com a própria shell. Use `fuser -k 4174/tcp`.)
- **QA da capa:** `node qa-capa.tmp.mjs` (mede geometria dos botões, press físico, i18n, teclado; screenshots em `/tmp/opencode/capa_shots/`).
- **Testar andar:** probe padrão — ler `window.__farmacheck.camera.position` antes/depois de segurar `w`.
- **Playwright**: `import { chromium } from 'playwright'` — rodar o script NA RAIZ do projeto (node_modules local).
- **Headless é ~8× mais lento** que a máquina real (dt clampado): animações de 2 s levam ~15 s; FPS ~3 (SwiftShader). Não confundir com bug.
- **Juiz de visão** (llama-cpp :8081): `python3 scripts/vision_judge.py <img.png> "<prompt>"` — depende do `llama-cpp` ligado.
- **Deploy DNS:** `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh`
  (contexto de build = `/home/servidor/Git/game_farma`; Caddy → `https://francoscorporation.ddns.net/game/ufggame/`).
  Após deploy: `docker logs game_farma` deve dizer `http://0.0.0.0:4174`.

---

## 4. Arte da capa (resumo do que foi feito — não repetir)
- Fundo limpo gerado por **inpaint harmônico (Laplace em pirâmide)** a partir de `public/capa/inicio_game.jpeg`
  → `public/capa/inicio_game_clean.webp` (removeu as pílulas pintadas; a garrafinha decorativa foi preservada).
- Sprites fatiados da arte (não recriar!): `public/capa/spr_avatar|spr_play|spr_book|spr_globe|spr_flag_br|spr_flag_uk.webp`.
- Geometria dos botões em `%` medida 1:1 sobre a arte 1376×768; texto usa fonte **Baloo 2** (Google Fonts).
- Tamanho final (após ajuste do PO): visual ≈ **arte + 5 px** (boxes: 455×129 / 382×97 / 410×97 px @1376).

## 5. Otimizações ComfyUI (análise 14/09 — sem perder qualidade)

### 5.1 Máquina hoje
- RX 6750 XT (12 GB, gfx1031) · Xeon **28 threads** · 32 GB RAM (⚠️ **swap ~20–24 GB em uso** — gargalo real)
- Serviço: `--reserve-vram 1.0 --vram-headroom 0.8 --cache-ram 0.5 1.0 --fp16-unet --fast-disk --preview-method none`
  `MemoryHigh=25G` (cgroup) · `OMP_NUM_THREADS=14` · `PYTORCH_HIP_ALLOC_CONF=...max_split_size_mb:128`
- Concorrência: `media-api` dispara ffmpeg contínuo (250–680% CPU!) → **pausar durante geração**
  (`docker pause media-api`; despausar depois). `llama-cpp` deve ficar parado (VRAM).

### 5.2 Ganhos SEM perda de qualidade (ordenados por impacto)
1. **LoRA de aceleração no SDXL (Lightning / Hyper-SD, 4–8 steps)** — referência 2D passa de ~8 min para
   ~1–2 min com qualidade praticamente igual (6–8 steps). Ideal para iterar referências do elenco.
   (+ opcional: LoRA de mãos/anatomia p/ reduzir artefatos tipo o botão entre dedos.)
2. **Pausar a mídia durante geração** (script: pause → gera → unpause). Testado manualmente hoje.
3. **Reiniciar o ComfyUI entre famílias de modelo** (SDXL → TRELLIS) — já é regra (evita deadlock de VRAM).
4. **OMP_NUM_THREADS 14 → 20** — há 28 threads; os estágios de malha (voxel/remesh, CPU) escalam com
   threads. Testar 18–22 com medição (não afeta qualidade).
5. **`--cache-ram` mais conservador** (ex.: `--cache-none` ou `0.2 0.8`) com 32 GB + swap cheio:
   troca swap-thrash por releitura do NVMe (`--fast-disk`) — testar e medir.
6. **`--reserve-vram 1.0/--vram-headroom 0.8` → reduzir (0.5/0.5)** libera +VRAM p/ menos offload
   (testar com monitor; risco de OOM).
7. **RAM 32 → 64 GB (hardware)**: elimina swap (hoje 20+ GB), acelera todo offload e estabiliza.

### 5.3 Testes de baixo risco (janela de manutenção)
- `HSA_OVERRIDE_GFX_VERSION=10.3.1` (alguns Navi22 rendem melhor que 10.3.0) — testar 1 job comparando.
- `PYTORCH_HIP_ALLOC_CONF` com `expandable_segments:True` (se suportado) p/ menos fragmentação.

### 5.4 Workflows diferenciados (criar a partir dos existentes)
- **"Ref rápida"**: SDXL + Lightning LoRA (+LoRA mãos) — para o elenco 2D.
- **"Iteração rápida"**: Trellis LowVRAM com menos steps e SEM RemeshMesh (mais rápido; só p/ preview).
- **"Final PBR"**: já existe o workflow 2 (HQ + PBR: UnwrapMesh, BakeTextureFromVoxel,
  BakeAmbientOcclusion, BakeNormalMapFromMesh) — usar para os assets de produção.
- **Split shape×texture** (a pesquisar): se o Trellis2TextureStage aceitar latent de shape salvo, dividir
  em 2 jobs reduz pico de VRAM/tempo total e permite retexturizar sem refazer a forma.

### 5.4b Vídeos analisados (14/09)
- **"Best 3D AI Generator Now Runs Natively in ComfyUI" (o7VJnIN31Ds, PixelArtistry)**: Pixal3D + TRELLIS 2
  nativos; recomenda **aumentar steps dos samplers (12 → 30–50)** e upsampling/2K + textura 4K para melhor
  qualidade (RTX 5080: TRELLIS ~186s; Pixal3D int8 ~282s; 16 GB). Para personagens: **gerar em partes**
  (melhor controle de face/textura). int8 recomendado p/ 6-8 GB — ⚠️ no gfx1031 int8_convrot QUEBRA (usar bf16).
- **"Best 3D AI Generator Now Runs on 6GB VRAM" (FuFm8zBHDWI)**: **TRELLIS 2 em GGUF (Q4–Q8)** via fork do
  ComfyUI (Arrow X) — **CUDA-only, sem suporte ROCm** → não aplicável à RX 6750 XT hoje. Único truque
  reaproveitável: `--disable-pinned-memory` (libera RAM) e fechar apps que usam GPU.

### 5.5 ComfyUI MCP
- **NÃO está configurado** no opencode (só `blender-mcp` e `unity-mcp` em `.opencode/opencode.json`).
- Hoje dirigimos o ComfyUI por API direta (`scripts/comfy/*.py`) — suficiente. Se quiser, dá para
  adicionar um MCP de ComfyUI (npm/community) para inspeção/criação de workflows via agente.

---

## 6. Pipeline de assets estilizados (16/09 — pilot Ana + lote)

- **Ordem validada (pilot Ana)**: ref refinada → TRELLIS HQ+PBR → Blender pós (tris) →
  gltf-transform (`resize` 2048 → `optimize --compress meshopt --texture-compress webp`) → QA `shot3d.mjs`.
- **SEMPRE reiniciar/free-RAM antes de alternar família de modelo** (TRELLIS→SDXL ou vice-versa).
  Ferramenta: `python3 scripts/comfy/free_ram.py` (POST /free; se RSS>8GB após, `kill -9` →
  systemd ressuscita limpo). **Regra do PO: quando os processos terminarem e não houver mais
  trabalho com o ComfyUI, rodar `free_ram.py`** (o `batch_assets.py` já chama sozinho no fim).
- **Lote em 2 fases** (evita 21 trocas de família de modelo):
  1. `--ref-only` (só SDXL) → QA contact sheet das refs → revisar;
  2. `--skip-ref` (só TRELLIS + Blender + QA).
- **⚠️ ARMADILHA GRAVE — `gltf-transform simplify` é limitado pelo `--error` (default 0.0001)!**
  Com o default, o simplificador para no erro e IGNORA o `--ratio` (achamos que tínhamos 30k tris,
  mas o arquivo tinha ~265k!). SEMPRE passar `--error 0.01` (permissivo) para o ratio mandar.
  Validado: alvo 100k → 99.138 (clara) / 99.384 (paulo) / 99.124 (ana) tris, altura 1.72.
- **Pipeline de finalização (canônico)**: `scripts/comfy/finalize_assets.py`
  (Blender normaliza sem decimar → `simplify --ratio alvo/tris_raw --error 0.01` → `resize 2048` →
  `optimize --compress meshopt --texture-compress webp`) + **validação de contrato** por
  `scripts/comfy/glb_info.mjs` (lê tris/altura/extensões corretamente, inclusive meshopt/quantizado):
  tris ≤ alvo×1.15, altura 1.70–1.74 (personagem), tamanho < 8MB, extensões meshopt+webp.
  - Personagens: **100k tris** (alvo `--tris-char`); props: 5k (`--tris-prop`) e **sem escala**
    (`target_h=0` mantém dimensões — corrigido em `postprocess_character.py`).
  - Resultados: clara 1.69MB · paulo 2.23MB · ana 2.01MB (todos contract_ok).
  - Modo avulso: `--raw <bruto.glb> --out <final.glb> --id nome`.
- **Blender Decimate destrói rostos detalhados** — NÃO usar p/ decimar personagem; o meshopt
  (com o `--error` acima) fica muito melhor no mesmo orçamento (clara: boca furada no Blender, lisa no meshopt).
- **`batch_assets.py`**: `blender_post()` agora chama o pipeline final; seed determinística por asset no
  TRELLIS/ref (`ref_seed`/`trellis_seed` no state); `qa_shot` com try/finally; protocolo docker checa containers.
- **Causa dos OOMs do lote (16/09 manhã)**: VRAM 12GB disputada com apps do desktop
  (missioncenter/corectrl/baunilha/gnome) → fechar apps antes de lotes longos (VRAM caiu 11.2→1.9GB).
- **Pilot Ana final**: `public/models/trellis_ana_pbr_v2.glb` (99k tris, 2,01 MB).
  Renders: `/tmp/opencode/ana_v2_30k_face.png` (legado), `scripts/comfy/qa/ana_v2_face.png`.
- **Causa do travamento de 15/09**: rodada TRELLIS submetida logo após SDXL sem reiniciar o
  ComfyUI (deadlock de VRAM). Sintomas: GPU 0%, 1 core girando, log mudo, HTTP morre depois.
  Correção: `kill -9` + re-submissão → **17,3 min** (vs 33,7 min da rodada anterior!).
- **Contrato de asset (validado por `glb_info.mjs`)**: tris ≤ alvo×1.15 · altura 1.70–1.74 (personagem)
  · `TEXCOORD_0` presente · meshopt+webp · personagem < 8 MB / prop < 4 MB. O `batch_assets.py`
  agora **falha o asset** (status=error) se o contrato não passar — sem "done" inválido.
- **Props**: `postprocess_character.py` NÃO escala quando `altura=0` (mantém dimensões) e a decimação
  do Blender virou **opt-in** (5º argumento `decimate`; default OFF — o canônico é o meshopt).
- **Lote**: `--retry-errors` reprocessa só os assets com status=error (usar depois de fechar apps);
  QA do lote agora gera 3 câmeras (`<id>.png` full + `<id>_face.png` + `<id>_torso.png`);
  protocolo docker é idempotente (só altera/restaura containers que estavam running).
- **`free_ram.py`**: threshold configurável por `FREE_RAM_THRESHOLD_GB` (default 8 GB); ao reiniciar,
  mata também os processos filhos (`pkill -P`) antes do `kill -9`.
- **`--retry-errors`** (testado): `python3 scripts/comfy/batch_assets.py --retry-errors --dry-run`
  lista só os assets com status=error (evidência 16/09: 7 assets). Rodar sem `--dry-run` reprocessa-os.
- **Viewer de aprovação em produção**: `public/char-preview.html` (órbita/presets Corpo·Torso·Rosto·Girar,
  % de load, FPS no HUD, retry, a11y básica; three do vendor + MeshoptDecoder) —
  URL: `https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana`.
  Deploy: `bash scripts/deploy.sh` (pré-tag `game_farma:previous` + healthcheck + **rollback automático**).
- **QA automatizado (CI-ready)**: `scripts/comfy/qa_compare.py` (MAE rosto final vs cru; falha se ≥ referência
  ruim — calibrado: final 0.0145 < ruim 0.0164) e `scripts/qa_char_preview.mjs` (gate: carrega, sem erros de
  console, FPS amostrado; headless SwiftShader é lento por natureza → piso de sanidade, não benchmark).
  Ligar no pipeline quando houver CI.
- **LOD/SSR**: não aplicável ao viewer de aprovação (243k tris + texturas 4096 = 3,7 MB; LOD reduziria a
  qualidade justamente na inspeção). Reavaliar para o jogo final se a performance exigir.
- **Crash → tela de bloqueio (investigado 16/09)**: VRAM esgotada (ComfyUI/TRELLIS + apps) → amdgpu
  `pin failed`/`-ENOMEM` → reset da GPU → mutter/gnome-shell perde o contexto → tela de bloqueio.
  Mitigação: fechar apps de GPU antes de lotes (VRAM 11,2→1,9 GB) e/ou limitar VRAM do ComfyUI.

---

## 7. Sessão 24/09 — rig Mixamo na Ana + pitfalls de runtime

- **GLTFLoader sanitiza nomes de nodes**: `PropertyBinding.sanitizeNodeName` **REMOVE**
  `:` (não troca por `_`): `mixamorig:Head` vira `mixamorigHead` no runtime. Os tracks
  são sanitizados igual (casam). Ao procurar bone por nome no runtime, use a grafia
  sem separador.
- **Merge FBX→GLB do Mixamo pode vir com 3 defeitos simultâneos** (todos corrigidos
  com patches offline via `@gltf-transform` + MeshoptDecoder/Encoder — round-trip
  preserva meshopt+webp):
  1. clips no frame Y-up cru + Armature com `Rx(+90°)` baked → personagem deitada.
     Fix: pré-multiplicar rotação do Hips por `Rx(+90°)` (forma fechada:
     `x'=c(x+w) y'=c(y+z) z'=c(z-y) w'=c(w-x)`).
  2. root motion embutido no Walk (89 cm/loop → "pulava" ao reiniciar o loop, brigando
     com o tween do jogo). Fix: pino da translação do Hips (in-place).
  3. yaw médio embutido (-37,6° no Walk; tilt no Idle) → andava "de lado/capenga" e
     parava torta. Fix: recentrar cada clip pela média de rotação do Hips
     (pré-multiplicar pelo inverso do quat médio; pernas/braços acompanham pois são
     filhos). Extra: yaw pélvico damped a 40% (±8°, gingado natural).
- **Agentes sem visão: usar `scripts/vision_judge.py`** (Qwen3.8-9B multimodal em
  :8081) como "olhos" objetivo — prompt com pergunta FECHADA e específica dá resposta
  útil (~50 s/imagem); prompt genérico vagueia.
- **Zonas por proximidade**: o andar livre (WASD) não atualizava `zonaAtual` → hint da
  tecla E e o próprio E ficavam presos em "paciente". Fix: calcular zona por distância
  (raio 1,45 m) no ticker do modo livre e disparar onChange.
- **Painel contextual**: painel aberto + jogador saiu de perto → fecha sozinho (gate por
  zona no atendimento.js). E dentro da zona não re-tweena a câmera.

## 8. Sessão 25/09 — transplant do mocap cru no Walk (v13) + pitfalls gltf-transform 4.x

- **Alvo-de-amplitude (v12b) era a causa da manqueira**: a ressíntese sintética que perseguiu
  os alvos 38°/60°/28° degradou o mocap — joelhos 25,7°/46,5° (Δ20,8°) e quadríssis inflados ±20°,
  braços amputados (LeftArm 24,7°→10,5°). O clip cru do Mixamo (`ana_merged.glb`) é simétrico
  (37,9°/39,4°). **Fonte da verdade = mocap cru**; gate recalibrado p/ alvos medidos no cru
  (28°/38,6°/26,4° ±4°, `qa_walk_angles.tmp.mjs` v13). Fix: `scripts/fix_ana_walk_mocap.mjs`.
- **Transform M derivado do clip em produção**: em vez de re-derivar Rx(+90°)+recentre do zero,
  M = média de Karcher de `q_pub(t)·q_raw(t)⁻¹` nas fases alinhadas (fase casa a 0%) — herda
  TODO o histórico de fixes de frame do clip que já funcionava no jogo. Depois: recentre
  (média) + damp de yaw pélvico 40% ±8°. Zero-set (Spine*/Neck/Head) preservado do público.
- **gltf-transform 4.x — 3 armadilhas silenciosas**:
  1. `doc.createAnimationChannel/createAnimationSampler(arg1, arg2…)` aceitam APENAS o NOME
     (outros args ignorados sem erro) → sempre `.setTargetPath().setTargetNode().setSampler()` /
     `.setInput().setOutput().setInterpolation()`.
  2. O sampler pertence à **Animation**: sem `anim.addSampler(sampler)` ele NÃO serializa
     (canal lê com sampler null no arquivo escrito).
  3. `meshopt()` transform DEQUANTIZA com convenção errada neste asset (POSITION ia de ±0,186
     para ±6088 = ×32767) e o prune dele derrubou a SKIN VIVA. Round-trip via `io.write` puro
     preserva a compressão original; canais novos ficam flat (~40 KB, irrelevante).
- **Retimado TUDO — inclusive o zero-set**: canal esquecido no timeline velho (1,208s vs 1,033s)
  estica `AnimationClip.duration` → zona morta ~0,17 s/loop = stutter periódico.
- **Contralateralidade só em espaço-mundo**: correlação de componentes de quaternion entre
  perna L×R é inválida (rig espelhado — oscilação dominante em eixos diferentes). Válido:
  posição-mundo DETRENDADA do root, amostrada IN-PAGE via rAF (loop externo de `evaluate`
  aliaza a 2 fps no SwiftShader). Gate: `tmp_walk_contra_world.tmp.mjs` (mesmo lado < −0,3;
  cruzado > +0,3; medido −0,94/−0,89 e +0,96/+0,95 ✓).
- **Câmera × VLM**: passada NA DIREÇÃO da câmera projeta em linha ("pés juntos" pro juiz);
  capturar no MÁXIMO de separação de dedos (~0,75 m) e, se precisar de ângulo, `avatar.walk()`
  em travessia lateral — posicionar a câmera na mão não cola, o jogo re-tweena no ANAMNESE.

## Retomada — serviço e preview da Ana (11/10/2026)
- Se o host reiniciar, verificar docker inspect de game_farma e restart policy antes de rebuild: o container estava parado por restart=no, não por falha de build. Reiniciar a imagem existente restaurou HTTP 200 sem deploy.
- O preview DNS é um canal separado: SHA b81e07f… do GLB público, com ana_clasica/v=38 ainda ativa no jogo. Não confundir publicação do preview com promoção ao runtime.
- rightArmMotion025 reduz a dobra dinâmica mas deixa resíduo no close-up. Gate estrutural e captura corpo inteiro não bastam para aprovar estética; verificar Walk/Idle/Rest, ambos lados e múltiplos ângulos antes de publicar.

## Contato dos pés no runtime — 11/10/2026
- Para localizar flutuação, meça todos os vértices da sola skinada dos dois pés por fase no runtime. O GLB b81e07f passa gate estrutural e QA do ground-fix do preview, mas o QA real mediu folga de até 83,2 mm; ambos os pés ficam acima de 25 mm em 53,7% das amostras e a deriva horizontal chega a 26,5 cm.
- O bone ToeBase do preview b81e07f já está a +3 mm em Idle (ground-fix de −3 mm), então não atribua o caso ao plano do chão. O defeito está no clip Walk/avanço/pose do rig. O ground-fix pela sola de Idle foi testado e revertido porque elevou o Walk em ~13 mm.
- O IK dinâmico opt-in ainda reprova: folga de 68,1 mm, deriva de 17,8–23,4 cm, projeção horizontal de 20,8 cm e perna solicitada 6,7 cm além do alcance. Não o ligue por padrão nem publique; corrigir/substituir o clip com rig/identidade compatíveis e repetir contato, penetração e drift juntos.
- A coleta por frame só deve ocorrer em QA (`?qaFootContact=1`) ou candidato experimental explícito (`asset.extras.walkFootContact=true`); a trilha normal do jogo não deve varrer vértices da sola a cada frame.

## Ana — 12/10/2026

Candidata 038 corrigida e tecnicamente validada. Resumo, relatórios e skills: `.planning/2026-10-10-walk-animation-web-pipeline/HANDOFF.md`. Avatar ativo ainda aguarda revisão visual para promoção.

## 12/10/2026 — complemento da perna esquerda / candidata 039

Corrigidas influência da coxa oposta e descontinuidade dos pesos do joelho esquerdo; 27 saltos >15% em arestas <1 cm eliminados (máximo 51,2% → 11,4%). Ruído geométrico local reparado com Taubin limitado a 4 mm, normais recalculadas; perna direita/rig/bind/clips/UVs/materiais preservados. 48 novas capturas + gate/topologia/viewer/runtime/verify PASS. Preview separado candidata039, SHA 6e7cda16270656108df307875d0314126b7c59675436c5cdd2fe8ca4a0b2661a; avatar ativo preservado. Skill J e referência atualizadas com a falha no recorte dos pesos LowerLeg. Skill global nvidia-free-workers criada/validada e usada por trabalhador NVIDIA real; entrada sem teto de palavras e retorno mínimo até cinco linhas. Ver HANDOFF.md e validated_20261012/pants_left/.

### Diagnóstico final do renderizador publicado

Linhas concêntricas eram principalmente shadow acne no char-preview.html: far=500, bias/normalBias=0. A/B com mesmo GLB/pose/material comprovou; calibrar near=.5/far=20/bias=-.0001/normalBias=.005 elimina padrões preservando sombras. Renderer diagnóstico sem sombras não expunha o defeito. Viewer QA e Skill J atualizados com essa distinção; reparos de coxa/joelho permanecem independentes.


## Checkpoint atual — 12/10/2026, candidata 040 e skill renomeada

Caminhada corrigida preservando a malha/bind da 039. Zero inversões de joelho em 241 poses serializadas e no runtime; pelve mais alta/estável, largura 130 mm e contato com deriva máx. 24,4 mm. 48 capturas/quatro vistas, gate, viewer local/HTTPS e verify PASS. Preview: https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview_candidate040&anim=Walk&play=1&cam=full&v=gait20261012 . Avatar ativo intacto; promoção aguarda revisão visual do PO. A 039 foi rejeitada por cinemática; os PASS anteriores não detectavam joelho invertido. Skill agora `criacao-modelo-3d`, instalada globalmente, entrada objetiva de 56 linhas + referências técnicas preservadas e nova referência de caminhada. Fonte de retomada: HANDOFF da planning; evidências validated_20261012/gait/.



## Estado atual — 12/10/2026, candidata 041

- PO rejeitou 040 por parecer marcha; não promover. Nova 041 usa arco contínuo mais baixo: lift 35 mm em vez de 65, sem patamar no alto; progressão horizontal quintic. Malha/rig/bind/pesos, Idle, upper arms, largura e cadência preservados.
- Preview: https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview_candidate041&anim=Walk&play=1&cam=full&v=walkarc20261012
- Fonte `ana_work/walk_natural_20261012/walk1.glb`; cópias local/Docker `ana_walk_preview_candidate041.glb`. SHA local/HTTPS `6687dd041ab507672228968224e283b41dc70716c935f9bb32bb8b2eddaf0a67`.
- 241 poses: zero joelhos invertidos; flexão L/R 37,0°/38,3°. Runtime 91 solas: deriva 12,4/25,2 mm, gap 2,2 mm, penetração 4,2 mm, ambos elevados 0%; entrada/destino e Idle PASS. 48 frames/quatro vistas, gate, viewer local/HTTPS e verify PASS.
- Config: advance0,8; stance0,6; halfWidth0,065; lift0,035; reserve0,002; clearance0,005; startPhase0,15; crossfade0,04; ForeArm18°; gaitProfile=walk_arc. Tempo no alto (~90% do pico) caiu de ~53% para30% do swing. Cadência/velocidade seguem a 040.
- Ativo e preview padrão intactos; aprovação estética do PO ainda pendente. Não afirmar caminhada aprovada só pelos gates técnicos. Skill criacao-modelo-3d registra esta falha de avaliação e o perfil temporal.
- Evidências `validated_20261012/walk_natural041/`; scratch `ana_work/walk_natural_20261012/`. Preview diagnóstico agora evita render de frames intermediários nos loops de medição; isso resolve timeouts, sem alterar os dados.



## Estado atual — 12/10/2026, candidata 042

- PO rejeitou 040 por marcha e 041 por passada curta. A 042 aumenta comprimento e retima o ciclo inteiro, mantendo arco baixo e joelhos corretos. Revisão estética do PO ainda pendente; não promover automaticamente.
- Preview: https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview_candidate042&anim=Walk&play=1&cam=full&v=stride20261012
- Fonte: `ana_work/walk_stride_20261012/walk1.glb`; cópias `public/models/ana_walk_preview_candidate042.glb` e `game_farma:/app/dist/models/ana_walk_preview_candidate042.glb`.
- SHA local/HTTPS: `50653728f75bd4502558a0958f1b0120e1f2e9118390633eb21aa3bc9e1134f5`.
- Avanço 0,8→1,1 m/ciclo; passo nominal 0,40→0,55 m. Amplitude longitudinal relativa de tornozelos 0,371→0,509 m (+37%). Duração 1,0667→1,2 s, cadência112,5→100 passos/min e velocidade~0,917 m/s. Lift35mm, apoio55%, largura130mm, fase0,11, crossfade40ms, ForeArm18°, IK runtime off.
- 241 poses serializadas: inversões0/0, flexão máxima36,9°/38,1°. Pelve0,896–0,938m; maior excursão necessária à passada maior, sem colapso de joelho. Runtime75solas: deriva16,3/15,5mm, gap2,2mm, penetração4,2mm, ambos elevados0%. Entrada/destino5,769m e Idle PASS.
- 48 frames/quatro vistas, gate, viewer local/HTTPS e verify PASS. Ativo/preview padrão continuam intactos. Evidências compactas em `validated_20261012/stride042/`; logs/frames/audits completos em `ana_work/walk_stride_20261012/`.


## Retomada integral —12/10/2026

- Produção running/healthy409ae64d6960; SHA público/local Ana044 coincidem. Não houve deploy novo nesta rodada.
- CASES tem14personas;13novas personagens além daAna. PHASES vem de core/progression.js, não cases.js. Primeira importação incorreta foi corrigida sem alterar fonte.
- PC/mesa GLB existem mas não são ativos; três famílias de props são carregadas. Cinco gôndolas, duas atendentes desativadas, cadeira não construída.
- Capturas da produção: desktop e celular chegam a ANAMNESE,3POVs por aparelho,8imagens incluindo menus, zero pageerrors. Layoutmobile cobre cena com chat/blur e sobrepõe controles: prioridadeP0.
- Fallback da gôndola não tem grupo procedural adicionado e o g do callback sombreia o externo; não supor fallback completo a partir do comentário. decorG do balcão é independente e permanece.
- NVIDIA Nemotron produziu rascunho com erros e escreveu inventory.md na raiz; movido e corrigido por evidências. Não aceitar completed nem contagem declarada como validação. Cwd aninhado não impediu project root voltar à raiz: usar scratch externo no próximo despacho.
- Plano integral e fichas de elenco são documentos; nenhuma geração, edição de runtime ou nova aprovação estética nesta rodada.

## Primeiro lote aplicado/publicado —12/10/2026

Usuário autorizou aplicar o plano usando trabalhadoresNVIDIA. Entrega: mobile retrato/paisagem com conversa recolhível, cena reenquadrada e controles/painéis separados; cache de fontes/geometry/material/rótulos de props; fallback completo de gôndolas; balcão novoBlenderCPU/meshopt ativo comdimensões preservadas; CRM porcaso/idioma; timeoutintegral doLLM eDONE.

Imagem finalgame_farma:integral001-20261012 /ea49ad1f417f, healthy, compose--no-build somentegame_farma. Rollback principalbefore-integral001(409ae64d6960). Ana044/v44 e código de animação preservados; SHA público/local45ac4e2d…igual. Semcommit, reset/clean ou remoção de experimentos.

QA final: verify PASS, fluxo18/18PASS, mobile19/19 local/online, props/fallback/encaixe2/2 local/online, streaming3cenáriosHTTP PASS, bootdesktop/celularonlinePASS. Logs intermediários sob carga degeração falharam em timing e estão preservados para diagnóstico; não são a validação final. Critérios de sola/contato não alterados. Sem benchmark deaparelho real nem revisão clínica.

Três processosOpenCode/NVIDIA: dois rascunhosNemotron rejeitados; GLM5.3flash entregou correção de stream, revisada/integrada/testada. Rascunhos/eventos/revisão em implementation/nvidia-*. Nenhum worker externo segue emexecução.

ReferênciasC1:2Marinas e1José geradas viaQwenlocal e congeladas em public/refs/candidates. Primeira tentativaJosé parou em carga/cache; refeito comcache-none/disable-async-offload e concluiu11m39. ComfyUI da sessão encerrado, llama-cpp religado. Galeria pública/art-review.html pronta. Semmalha/rig novo: skillqwen-tencent-3d exige “Escolha do PO”; perguntas enviadas paraMarina1/2 eJosé. Não houve geração3DTencent nesta rodada; não presumir resposta/aprovação pelo tempo decorrido.

Próximo: escolhaC1→malha/inspeção/rig/WalkIdle/QA; continuarO2–O8 eC2–C5. Aplicação do plano continua autorizada; não perguntar novamente se pode continuar emgeral. Clínica dos14casos seguependente. Resumo seção10/ROADMAP/plano integral/fichas atualizados.

## 12/10/2026 — revisão visual dos pacientes solicitada pelo usuário

Balcão aprovado pelo usuário. Elenco: Ana044 é a única malha ativa para todos os casos; Marina2referências e José1referência são imagens2D, sem malhas/rigs. Novo cadastro de revisão cobre14pacientes e indica os11restantes ainda planejados. Botão na capa/menu abre revisão em outra aba.

Primeiro teste local com iframe passou, mas o teste público detectou X-Frame-Options:DENY do proxy. Não alterar a política global: revisão corrigida para WebGL direto. Viewer deriva do preview aprovado com normalização, sanitização de clips e correção de piso preservadas; acrescenta dimensionamento pelo painel e cleanup de frame/timer/controles/geometria/material/textura/skeleton/contexto na troca. char-preview.html e modelos aprovados preservados.

NVIDIA/GLM5.3flash externo para métricas de5props em scratch: timeout2m/exit143, sem artefato. Extração local em implementation/prop-metrics-review.json confirma os valores iniciais; não representa FPS/draw calls reais. PC/mesaGLB não são os procedurais ativos.

Verify PASS. Revisão direta final local: desktop1280×800, retrato390×844, paisagem844×390; Ana real, Walk e groundfixPASS, Marina1/2/José, anterior/próximo/select,14casos, pendentes sem avatar falso, toque/entrada e falha do registroPASS. Publicação final em andamento; registrar imagem/QAonline quando concluídos.

Atualização de conclusão: QAfinal-online e boot desktop/celular online PASS. Imagem763094ed7823 publicada/healthy; a implementação anterior comiframe é histórica. Evidências finais em implementation/patient-review-final-online e patient-review-boot-online.log.

12/10 nova versão:5props estilizados gerados BlenderCPU/atlas1024/meshopt, gôndola4134tris/2mats/36produtos, vitrine2396/3mats, mesa1318/2, PC2736/1, CPU480/1. Carga/fallback2/2PASS. Revisão identificou tela rente(front-.029), corrigida para-.0275; shadowacne ajustada near/far/bias; marco/parede de entrada separados, exterior afastado, headeratlas com aspectcorreto. Qualidadeauto/leve/equilibrada/alta implementada comcomposerlazy; narração/SFX persistentes; faseCuidadoIntegral cobre casosfaltantes e desbloqueio off-by-one corrigido/testado. Marina e José fontesTencent500k baixadas(40MB); Marina15kprovisóriasv001/v002 reprovadasporseamsapósdecimação, fonte500ksuave. v00350k emteste, não promovermalhabad porcumprirbudget. MixamoAdobe desconectado, tela de login pronta eperguntaasyncenviada; não acessarcredenciais. GPU local estáocupada(~11.26GB/12.87GB), nova geraçãoQwen não iniciada.

## Acesso às sessões — instrução do usuário
Reutilizar perfis dedicados já registrados e usar o botão normal “Continue with Google” com a conta existente quando necessário. Não pedir login antes de verificar essas sessões. Senha, OTP e consentimento novo permanecem com o usuário; não ler/copiar cookies ou segredos. Chrome CDP9222, perfil dedicado ana_meshy_profile: Mixamo autenticado confirmado pela UI em12/10. Marina FBX enviada; montagem de marcadores em execução.
### Retomada — Expediente Livre (13/10/2026)

- `npm run qa:free-shift` foi simplificado para apenas o caminho E2E de menor risco; os cenários de URL ausente, HTTP não-OK e timeout ficaram no contrato unitário `scripts/test_case_service.mjs`.
- A execução do caminho remoto chegou a `DEBRIEFING`; os asserts anteriores confirmaram que a fase fixa não chamou o endpoint, o payload foi `{}`, o ID com sufixo voltou ao ID local canônico, a seed foi preservada e os dados/regras clínicas vieram do catálogo local.
- O harness foi interrompido manualmente antes de encerrar a suíte porque o Chromium headless ainda consumia CPU elevada e havia outro render no host que não pertence a esta QA. Portanto, não registrar `qa:free-shift` como comando PASS; o atendimento remoto foi observado até o debriefing e o fechamento automático do teste continua pendente.
- O teste de contrato cobre explicitamente URL vazia sem rede, erro HTTP e timeout; ainda não há E2E completo do Expediente Livre sem serviço.
- `npm run qa:dsf-security` passou novamente. `npm run verify` passou: sintaxe, lógica, storage, case-service, TTS, STT e build; Vite emitiu somente avisos conhecidos de módulos importados estática e dinamicamente.
- A API do host não oferece `nvidia-smi`; não há listener em `8188` (ComfyUI) nem `9222` (CDP). A inspeção de processos mostrou vários `comfy-mcp` e um `llama-server` com offload de GPU; todos foram preservados. Não foi possível confirmar VRAM livre nem perfil/cota Tencent, portanto nenhuma geração/submissão foi feita.
- Novo teste sem navegador em `scripts/test_case_service.mjs` exercita `Game.nextPatient()` com a fase `livre`, configuração ausente e `fetch` que falha se chamado. Resultado: escolhe o caso do catálogo local e não tenta rede. `npm run test:case-service` passou. O E2E completo sem serviço ainda não foi executado.
- A consulta somente-leitura `mcp__comfyui__server_info` confirma ComfyUI parado, `hardware.gpu=null`, sem target remoto; também sinaliza core local desatualizado. Pela orientação do servidor, esse `null` é desconhecido, não ausência de GPU, e geração local não deve ser iniciada sem esclarecer capacidade/atualização. Nenhum serviço foi iniciado ou atualizado.
- Revisão visual CPU dos arquivos disponíveis: as capturas `qa008/ntr_*` mostram Ana ou composição de jogo, não são evidência de aceite da Clara. Os renders de Paulo mostram olhar elevado em comparação à referência frontal; fonte/candidatos permanecem intactos, sem rig. A face do Nelson no close-up disponível não confirma objetivamente o antigo diagnóstico de olhar elevado; o LOD é estático, com 30.000 triângulos, 22.705 vértices e topologia aberta/desconectada que requer inspeção visual antes do rig. O agente de auditoria não alterou arquivos; tarefas de reparo permanecem candidatas isoladas.
- O gate offline foi executado novamente diretamente sobre `public/models/candidates/clara_cefaleia_walk_v001.glb`: PASS, 57 joints, 30.000 triângulos, Walk 1,3 s/22 rotações vivas/241 chaves de Hips, Idle 8,3667 s/16 rotações vivas/504 chaves; metadados `walkSpeed=0,5` e `walkAdvance=0,65`. O campo `staticBoundsHeightY=0,003624` é limite de accessor offline, não altura runtime; não usar como escala. Gates/runtime anteriores continuam favoráveis, mas não substituem revisão visual nem integração.
- Foi criado `scripts/test_fact_gate_scoring.mjs`, ligado ao `npm run verify`, com cobertura local determinística para classificação PT/EN, KnowledgeState e score/penalidades/reprovação/estrelas; sem mudar código ou conteúdo clínico. FC-021 passa a Parcial, não concluído.
