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
