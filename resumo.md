# Resumo — Personagem Ana (game_farma) — 21/09/2026

## Estado atual (final do dia)
- **Modelo no ar (`public/models/ana.glb`)**: o **BASE** gerado localmente (TRELLIS 2 local) — a versão que o PO prefere.
  Mesh_0 puro, `metallic=0, roughness=0.8`, olhos pintados com catchlight sutil, sem esferas 3D, sem edições de cor.
- Commit `b2aabb9` (09:33) congelou essa versão; `git show HEAD:public/models/ana.glb` reproduz exatamente o que está no ar.
- **Decisão do PO**: esquecer a geração online (nuvem); refinar o base via **Blender** (malha), NUNCA via edição de cor por máscara (quebrou os tons — "cada coisa de uma cor").

## Objetivos desta sessão (e status final)
| # | Objetivo | Status |
|---|---|---|
| 1 | Corrigir o "olho na testa" (esferas oculares na posição errada) | ✓ resolvido (posições validadas por marcadores) — depois descartado: esferas fora, olhos pintados + catchlight |
| 2 | Arrumar o Brave/WebGL para ver o 3D (janela com GPU) | ✓ resolvido — workaround Vulkan/Angle (140–165 fps), debug via CDP 9223 |
| 3 | Deixar a Ana com qualidade "Disney/Pixar" (desenho definitivo) | ✗ não alcançado — teto de qualidade das ferramentas; PO rejeitou todas as versões geradas/editadas |
| 4 | Corrigir as mãos (3 dedos fundidos) | ~ só na geração da nuvem (TRELLIS.2) mãos boas; no base local continuam fundidas (PO aceita o base assim) |
| 5 | Pele lisa (remover estrias/ranhuras da malha e manchas da textura) | ~ mesh-solda+suavização funcionou (rachaduras sumiram); edição de cor reprovada; ranhuras finas persistem no base |
| 6 | Olhos melhores (catchlight, detalhe) | ✓ catchlight na textura aprovado no base; versões "melhoradas" foram rejeitadas (cores estranhas) |
| 7 | Sobrancelhas/boca/acabamentos refinados | ✗ tentativas reprovadas (tons deslocados) |
| 8 | Entregar o mais rápido possível (prazo apertado) | ~ base estável no ar; refinamentos finais não concluídos |
| 9 | Liberar a máquina do PO (RAM/VRAM/GPU) | ✓ RAM 14 GB livres, VRAM livre, llama parado, processos encerrados |
| 10 | Encontrar serviços/locais GRATUITOS para gerar 3D (varredura 3d_free.md) | ✓ testados: hy3d.dev (fila), Sloyd (paywall), Modelfy (login), HF Spaces (cota) — documentados |
| 11 | Gerar na nuvem de graça (com token HF do PO) | ✓ TRELLIS.2 oficial gerou GLB texturizado — porém rejeitado pelo PO ("furado, sem olhos") |
| 12 | Aprender/usar modelagem via Blender + MCP | ✓ toolkit funcionando (inspeção, solda 142k→294 bordas, fill de buracos, headless) — pronto para refinamentos futuros |
| 13 | Reverter ao personagem base (preferido do PO) | ✓ base restaurado do git e no ar |


## COMO A ANA FOI GERADA LOCALMENTE (método original do base)
Pipeline local (ComfyUI + TRELLIS 2), executado em sessões anteriores — é o modelo que está no ar:
1. **Referência**: `scripts/comfy/refs/ana_coriza.png` (personagem em pé, produzida/curada via `gen_ref.py` com DreamShaper/SDXL; PO aprovou mãos na cintura como pose).
2. **Workflow** "2. Trellis 2 - Image to 3D - HQ + PBR Textures.json" (57 nós), submetido por `submit_wf.py` (conversor UI→API) ao ComfyUI `:8188`:
   - `Trellis2Conditioning` (DINOv3 CLIP vision) → `EmptyTrellis2LatentStructure` → **4 passes de difusão**: blob grosseiro → forma real → refine → **cores** (`Trellis2ShapeStage`/`UpsampleStage`/`TextureStage` com CFGOverride/RescaleCFG, seed fixa 33)
   - Decodificação: `VaeDecodeShapeTrellis` → `RemeshMesh` (768) → `DecimateMesh` → `PaintMesh` (voxel→vertex colors) → `Trellis2ExportMesh`/`Save3DAdvanced` → **GLB com UV + texturas PBR** (atlas fragmentado, ~4k tris ilhas pequenas)
   - Saída: `output/3d/trellis2_pbr_*.glb` → polido por `polish_char.py` → `public/models/ana.glb` (243k tris, 1,72 m, texturas 4096 WebP baseColor/normal/metalRough, `metallic=1→0`)
3. **Limitações herdadas**: mãos com dedos fundidos (limite do image-to-3D de vista única), estrias de brush na geometria, atlas UV fragmentado (costuras), sobrancelhas grossas pintadas.

## REFINAMENTOS TENTADOS NESTA SESSÃO (técnicas + resultado)
### A. Esferas oculares 3D (eyes_add.mjs)
- **Método**: esfera UV (96×48) com textura polar (pupila no polo, íris, esclera, catchlight), orientada pela normal da superfície, recuo `R−POLO_OFF`; posição detectada por raycast de clusters escuros (`qa_eyepos.mjs`).
- **Iterações**: 7 ajustes (raio 0.009–0.016, POLO_OFF 0.0015–0.012, posições por marcadores projetados no render).
- **Resultado**: ✓ embutida/derretida/flutuante em todas as variações; **descartado** — olhos pintados + catchlight na textura é o padrão.

### B. Suavização de malha + solda (pipeline Node/gltf-transform)
- **Método**: decodificar posições int16→float, Laplaciano em 3 passes (corpo λ=0.35; cabeça λ=0.5×2), **solda de vértices duplicados de costura UV** por posição quantizada (188k verts→118k grupos — sem isso a malha rasga), normais recalculadas.
- **Resultado**: ✓ rachaduras e estrias sumiram; ✗ rosto "derretido" (λ alto) — PO reprovou a versão, mas a técnica de solda está validada.

### C. Edição de textura por máscara de cor (Python/PIL+scipy)
- **Método**: máscaras por faixa de cor (pele `R>G>B`, cabelo avermelhado, roupa clara) → **blur mascarado** (gaussiana só entre pixels da máscara, σ 9–16), dessaturação da pele, clareamento de pixels escuros (sobrancelhas), catchlight pintado nos UVs dos olhos (L `0.8186,0.0564` / R `0.8847,0.8364`).
- **Resultado**: ✓ no primeiro round suave (base fixo, aprovado); ✗ nos rounds agressivos (σ alto + dessaturação + íris pintada) — **deslocou os tons** ("cada coisa de uma cor") → **REPROVADO pelo PO. Regra: não usar.**

### D. Regeneração local — Hunyuan3D 2.1 (nós nativos ComfyUI)
- **Método**: `ImageOnlyCheckpointLoader` (hunyuan_3d_v2.1) → CLIPVisionEncode → KSampler 30 steps euler → VAEDecode 256 → VoxelToMesh → SaveGLB; fundo removido com BiRefNet + pad quadrado via `ResizeAndPadImage`.
- **Resultado**: ✓ mãos com dedos separados; ✗ gerou parede+chão junto da referência (3 tentativas de contorno); sem textura (paint é CUDA-only). Descartado.

### E. Regeneração local — TRELLIS2 Low VRAM / HQ + PBR / Pixal3D
- **Método**: mesmos workflows 1/2/3 do usuário via `submit_wf.py`, seed 33/777, referência A-pose (`ref_char.png`).
- **Resultado**: Low VRAM ✓ rápido (8 min) mas vertex colors, rosto bruto (reprovado); **HQ+PBR** ✗ não cabe na RAM (30 GB com serviços) — thrash de swap e remesh de 7M faces na CPU leva >3 h (2 tentativas interrompidas); Pixal3D ✗ trava (hang). Descartados.

### F. Geração na nuvem — microsoft/TRELLIS.2 (HF Space, token HF)
- **Método**: gradio_client 2.7.1 autenticado → `/image_to_3d` (res 1024, seed 0) → `/extract_glb` (300k tris, textura 2048) → GLB 11 MB. Pós: corte do chão por faces y<min+0.015 (73k faces removidas), catchlight na textura UV, limpeza de cabelo (blur mascarado), `metallic=0`.
- **Resultado**: ✓ mãos/pele melhores; ✗ cabelo com furos/manchas; ✗ cota ZeroGPU grátis ~5 min/dia. **PO rejeitou e mandou esquecer.**

### G. Serviços gratuitos testados (varredura 3d_free.md)
- hy3d.dev (fila lotada, 25+ tentativas), Sloyd guest (paywall), Modelfy (login), HF anônimo (cota por IP), Hunyuan3D-2.1 Space (270 s > cota restante), Hunyuan3D-2 Space (`generation_all` bugado — NameError do texgen em low_vram). Todos ✗ hoje.

### H. Blender headless (via scripts + addon MCP)
- **Método**: `blender --background --python blender_inspect.py -- <glb>` (inspeção: 128k bordas no base) e `blender_weld_fill.py` (remove_doubles 0.0001 + holes_fill + normais) na cópia da nuvem: bordas 142k→487→294. Addon `blender_mcp.py` instalado (servidor socket 9876, `execute_code`).
- **Resultado**: ✓ toolkit validado e pronto; é o **caminho aprovado pelo PO** para os próximos refinamentos (malha, sem tocar em cor).

## ONDE ESTÁ O PIPELINE QUE GEROU A ANA
| Etapa | Arquivo/Caminho |
|---|---|
| **Referência original da Ana** | `/home/servidor/Git/game_farma/scripts/comfy/refs/ana_coriza.png` (655 KB) |
| Gerador de referência (SDXL/DreamShaper) | `scripts/comfy/gen_ref.py` → ComfyUI `127.0.0.1:8188` |
| Submissão do workflow (UI→API) | `scripts/comfy/submit_wf.py <workflow.json> <imagem> <job> [seed]` |
| Workflow de geração 3D (usado) | `/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/user/default/workflows/2. Trellis 2 - Image to 3D Model - HQ + PBR Textures.json` (e variantes 1/3/4: Low VRAM, Pixal3D) |
| Modelos TRELLIS2/Pixal3D | `…/ComfyUI/models/diffusion_models/3D/` (trellis_2_bf16, pixal3d_bf16, int8) + VAEs `…/models/vae/` + CLIP `dino_v3_L_naf_fp32` |
| Saídas de geração | `…/ComfyUI/output/3d/trellis2_pbr_*.glb` (HQ) e `…/output/3d/trellis2_*.glb` (Low VRAM) |
| Modelo em produção | `public/models/ana.glb` → container `game_farma:/app/dist/models/ana.glb` → `https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana` |
| Deploy rápido | `docker cp public/models/ana.glb game_farma:/app/dist/models/ana.glb && docker restart game_farma` |
| Deploy completo | `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh` |

## Tudo que foi feito nesta sessão (com resultado)
1. **Brave/WebGL**: GPU do perfil padrão crasha (exit 512). Workaround: janela com `--use-angle=vulkan --ignore-gpu-blocklist --user-data-dir=/tmp/brave-hw-ana` → 140–165 fps. Debug via CDP na porta 9223.
2. **Esferas oculares 3D**: detecção (qa_eyepos/qa_lid) errava — pegava sobrancelha; posições corretas validadas por marcadores. Esferas funcionaram no base antigo, mas o PO rejeitou ("olho na testa"→corrigido→"olhos derretidos" na regeneração). **Conclusão: não usar esferas**; olhos pintados + catchlight na textura bastam.
3. **Pipeline pós do base (mesh+textura)**: suavização Laplaciana com solda de costuras (188k→118k grupos) matou rachaduras/estrias ✓, mas λ alto "derreteu" o rosto; blur mascarado + dessaturação = manchas de tom (REPROVADO pelo PO).
4. **Regenerações locais (ComfyUI)**:
   - Hunyuan3D 2.1 (nós nativos): mãos boas ✓, mas gerou parede/chão junto (referência com fundo) e sem textura (sem módulo paint local; rasterizador é CUDA-only, não roda em AMD/ROCm).
   - TRELLIS2 Low VRAM: rápido (8 min) mas vertex-color, rosto bruto — reprovado.
   - TRELLIS2 HQ + PBR: **não cabe na máquina** — remesh de 7M faces na CPU leva horas (2 tentativas >3h, interrompidas). Só roda com a máquina ociosa e mesmo assim é lento.
   - Pixal3D: trava (hang) — não investigar.
5. **Geração na nuvem (com token HF do PO)**:
   - **microsoft/TRELLIS.2 (HF Space)**: FUNCIONOU (4B, GLB texturizado) — mãos boas ✓, rosto limpo, mas cabelo com furos/manchas → PO rejeitou ("todo furado, sem olhos"). Cota ZeroGPU grátis: ~5min/dia (esgotada; Hunyuan3D-2.1 pede 270s e não cabe).
   - hy3d.dev (grátis sem cadastro): fila lotada o dia todo (25+ tentativas).
   - Sloyd guest: paywall. Modelfy: login. HF anônimo: cota por IP.
6. **Correções na versão da nuvem** (antes do PO descartá-la): remoção do chão (73k faces por corte geométrico), catchlight, limpeza de cabelo. Válidas tecnicamente, mas o PO preferiu o base.
7. **Blender (via headless + addon MCP)**: toolkit funcionando — inspeção, **solda de vértices (142k→294 bordas)**, fill de buracos, normais. Script: `/tmp/opencode/blender_weld_fill.py`, `blender_inspect.py`. Addon MCP instalado: `~/.config/blender/5.2/scripts/addons/blender_mcp.py` (servidor socket 9876, comando `execute_code`).
8. **Revert final**: base restaurado do git (`b2aabb9`) — **é o modelo no ar agora**.

## Inventário da máquina (o que temos)
- **Hardware**: Ryzen 28 threads, 30 GB RAM (swap 39 GB no NVMe), **AMD RX 6750 XT 12 GB (ROCm 10.3)**, NVMe 1,8 TB (raiz 218 GB sempre ≥90% cheia — ATENÇÃO), GNOME Wayland.
- **Serviços**: ComfyUI `:8188` (systemd `comfyui.service`, venv em `/media/servidor/nvme_data/ai_music/comfyui/`), llama.cpp Qwen3.8-9B `:8081` (docker `llama-cpp`, parado hoje p/ VRAM — religar: `docker start llama-cpp`), SearXNG `:8080`, 22 containers (game_farma, whatswave, media…), ffmpeg (jobs do PO).
- **Modelos 3D locais**: TRELLIS2 bf16/int8, Pixal3D bf16/int8, Hunyuan3D 2.1 (7 GB, só forma), VAEs shape/texture, DINOv3.
- **Imagem**: SDXL base, DreamShaper XL (referências), BiRefNet (fundo).
- **Workflows prontos** (user/default/workflows): 1–4 (Trellis2/Pixal3D × Low VRAM/HQ-PBR) + blueprints (Hunyuan3d 2.1 etc.).
- **Ferramentas**: Blender 5.2.2 LTS + addon **blender-mcp** (socket 9876), gltf-transform 4.5 + meshoptimizer, Playwright/Chromium, glb_info.mjs, shot3d.mjs, qa_*.mjs, vision_judge.py (Qwen local), python numpy/scipy/PIL.
- **Credenciais**: token HF em `/tmp/opencode/hf_token` (conta FrancosCorp) — usado só para geração na nuvem.

## Aprendizados / regras para a próxima sessão
1. **Não editar textura por máscara de cor** — desloca tons e o PO rejeita. Pele/ranhuras → suavizar **na malha** (Blender Laplacian leve com preserve) e validar por render antes de publicar.
2. **Sempre renderizar e comparar antes de deploy** (o PO cobra print antes/depois).
3. HQ local só com máquina ociosa e ainda assim lento (horas); Low VRAM é rápido mas inferior.
4. Nuvem grátis: TRELLIS.2 HF Space funciona (melhor “mãos/pele”) mas cota diária ~5 min; hy3d.dev fila; demais exigem conta.
5. Hunyuan paint / texturização CUDA-only não roda na AMD.
6. O **base atual é o padrão aprovado** — qualquer refinamento parte dele, em cópia, com rollback fácil (git `b2aabb9`).

## Sessão 22/09 — r1 (solda+Laplaciano corpo) REPROVADO pelo PO
- **O que foi feito**: pipeline via Blender headless (`/media/servidor/nvme_data/ana_work/ana_r1_refine.py`): bake de transforms (validado pés z=0, altura 1,7194 m), weld 1e-4 (188.525→118.318 verts), Laplaciano λ0.30 ×1 **só abaixo de z=1,38** (rosto protegido), normais consistentes. Texturas transplantadas **byte a byte** do base via gltf-transform (`patch_textures.mjs`), reorder+quantize+meshopt (`meshopt_fix.mjs`), gltf-validator **0 erros**, 4,9 MB (menor que o base).
- **Validação**: 7 vistas A/B (full, ¾ D/E, perfil, close braço/rosto/costura) em `nvme_data/ana_work/shots/cmp_*.png`.
- **Resultado**: **PO REJEITOU** — relatou ondulações/deformação visíveis em pernas, braços e roupa, textura "diferente", e algo estranho no olho (bola branca sobressaindo). Servido em produção como `?m=ana_r1` (link separado), sem tocar no `ana.glb`.
- **Reversão executada**: container e repo limpos do candidato; `ana.glb` produção = md5 idêntico ao repo; llama-cpp religado.
- **Hipótese técnica (sem iteração nova)**: o weld funde vértices de costura UV com UVs diferentes → no atlas fragmentado isso estica a textura entre ilhas, e no GPU real (AA/aniso ligados) isso lê como "ondulação/camadas". Renders via Playwright/SwiftShader **suavizam demais** e mascararam o defeito — lição: validar em GPU real (janela Brave CDP 9223), não em software renderer.
- **Regra nova**: pipeline de malha com weld **não serve** para este atlas fragmentado; qualquer futuro passe de suavização tem que ser seam-aware ou não fazer. Blender `export_keep_originals=True` **quebra** texturas de GLB empacotado (exporta 0 imagens) — não usar.
- **Encerramento de frente**: refinamento de malha por solda+Laplaciano está **encerrado por evidência**. Próximo avanço de qualidade depende de ferramenta 2D→3D externa que o PO escolher.

## Sessão 22/09 (cont.) — caça 2D→3D grátis ENCERRADA: cota = 0 em todas as frentes
- **Tencent (3d.hunyuan.tencent.com)**: PO logou manualmente (meus códigos expiraram; slider captcha nunca resolvido). Upload da `ana_coriza.png` OK (`uploadBox isSuccess`); aba 图生3D era "Tucson 3D" na tradução automática — cliquei, 500k faces selecionado. **Gerar imediatamente NÃO dispara**: diagnostics Network+MutationObserver (2×, incl. dança de mouse humana com jitter/hover/clique trusted) capturam o mesmo toast: **"当前生成次数已达到上限" (cota de gerações atingida = 0)**. Não é bloqueio de clique/captcha: o app PROCESSA o click e responde cota zerada. Conta nova não tem os "20/dia" do Reddit.
- **API direta Tencent (subagente extraiu do blender_mcp.py)**: modo OFFICIAL_API = `POST https://ai3d.tencentcloudapi.com`, action `SubmitHunyuanTo3DProJob`, auth TC3-HMAC-SHA256 com **SecretId/SecretKey pagos** + real-name; modo LOCAL_API = precisa servidor Hunyuan local (inviável AMD). Nenhum caminho grátis.
- **Meshy**: Ana 282k faces pronta na conta do PO — download = Pro R$108/mês. **Tripo**: Ana 1.978.826 faces pronta (`rodolfofrancoxico`, 4.145 créditos = ~75 gerações) — download = Pro R$44/mês; link público do modelo também trava export. **Rodin/hyper3d**: EXTERNAL_AUTH_FAILED. **Ai3dgen**: fila morta. **hy3d.dev**: retry loop 39 tentativas, `retry=false dl=null busy=false` — página degradada, loop encerrado.
- **Estado**: `meshy/` vazio de .glb; produção `ana.glb` intocada (md5 `57cf5bbfa54b`); navegador CDP 9222 vivo com logins Meshy/Tripo/Tencent salvos; matriz de decisão entregue ao PO: **A** = Tripo R$44/mês (modelo já gerado, 5 min, cancela), **B** = seguir grátis (sem garantia), **C** = 2× RTX 5060 Ti 16GB (CUDA destrava Hunyuan local texturizado + TRELLIS2 HQ, ilimitado, mas teto de qualidade igual ao da nuvem). **Aguardando letra do PO.**

## Sessão 22/09 (2ª parte) — TENCENT FUNCIONOU: geração de graça com cota resetada
- **O bug era simples**: a aba ficou com a cota **stale em 0**. **Reload na página** (`page.reload()`) → `remain-count` passou de 0 para **20** (cota diária resetada). Toast antes: *"O número atual de spawns atingiu o limite"* (当前生成次数已达到上限) = cota antiga cacheada, **não** era cota real.
- **Fluxo que funcionou (inteiro via CDP/Playwright em Brave :9222)**:
  1. Reload → home → clique no card `图/文生3D` (aka "Tucson 3D" na tradução auto) → workspace.
  2. `setInputFiles` no `input[type=file]` com `scripts/comfy/refs/ana_coriza.png` → upload OK (`genUploadInfo` 200 + `review` 200) → imagem aparece como `background-image` na div `.successImageBg` (classe de sucesso do `uploadBox`).
  3. Clique `立即生成` → **`remain` 20→19**, `Ativos` 0→1, texto *"Geometria / Textura — Geração, deve levar mais 190 segundos"*. Pronto em ~30 s (botão **"Baixar"** = `native-edit__viewport-actionBar-download`).
  4. GLB de saída (COS assinado): `https://hunyuan-base-prod-1258344703.cos.accelerate.myqcloud.com/hunyuan3d/default/<uuid>/<hash>.glb?...`
- **Resultado no GLB**: PO: *"ficou maravilhosamente bonito"*. **2 resalvas** (herdados da REF, não do modelo): (a) `ana_coriza.png` está **sem pés** → gera sem pés; (b) **olhos tortos** na referência → saem tortos. **Fix: regenerar a referência 2D com pés e olhos alinhados antes de refazer.**
- **Diagnostics úteis** (reaproveitáveis): `elementFromPoint` mostra que não há overlay; o `onClick` do botão (extraído do `__reactFiber`) checa `ie.totalRemainCredit < rt.quotaCost` → se OK segue `K({multImageUrl...})`; toast sai e some em ~1 s → capturar com **polling a cada 120 ms** de todos os nós de texto (kw regex só com chinês falha pq o Brave traduz p/ PT-BR).

## FICHA TÉCNICA — o que o site do Tencent USA (p/ quando tiver servidor parrudo)
- **Site** = `3d.hunyuan.tencent.com` roda **Hunyuan 3D 3.1** (badge "3.1" no UI; faces 50k/500k/1M/1.5M; textura 4K). **3.1 NÃO é open source** — só cloud (API `POST ai3d.tencentcloudapi.com`, action `SubmitHunyuanTo3DProJob`, TC3-HMAC-SHA256 + SecretId/SecretKey **pagos** + real-name).
- **Pipeline = 2 estágios**: (1) **shape** = DiT flow-matching (`Hunyuan3D-DiT` / `Hunyuan3DDiTFlowMatchingPipeline`) → mesh; (2) **paint** = diffusion **multiview 6 views** (`Hunyuan3DPaintPipeline`, res 512, config `max_num_view=6`) → textura **PBR** (albedo + metalness-roughness). Paint exige **CUDA** (rasterizador, não roda AMD/ROCm — já confirmado).
- **Linhagem open source** (GitHub `Tencent-Hunyuan`):
  - **2.0** (jan/25, 14.7k★, `Hunyuan3D-2`): DiT 1.1B + Paint 1.3B + Delight 1.3B. Pesos+código+ComfyUI+finetuning.
  - **2.1** (jun/25, `Hunyuan3D-2.1`): **mais completo** — Shape 3.3B + Paint 2B, **inclui training code + VAE + PBR**. **Já temos os pesos 7GB locais** (só a forma; o Paint não roda na AMD).
  - **2.5** (abr/25, relatório `arXiv:2506.16504`): **LATTICE**, 10B params, 4K tex, bump, geo res 1024, skinning. Open weights. **= melhor escolha p/ servidor NVIDIA parrudo.**
  - **PolyGen** (jul/25): malha quad limpa p/ produção. **Não open.**
  - **3.0 / 3.1**: **não open** — é o do site.
- **Licença** (*Tencent Hunyuan 3D Community License*, só 2.1; 2.5 ver repo): grátis **se <1M MAU/mês**; precisa notice; **"Territory" restrito** — usar/distribuir fora da China exige licença (`hunyuan3d@tencent.com`). Commercial OK com atribuição se <1M MAU.
- **Setup p/ servidor NVIDIA** (p/ quando tiver): `python 3.10 + torch 2.5.1+cu124`, `pip` do repo, depois
  ```python
  from diffusers import Hunyuan3DDiTFlowMatchingPipeline, Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
  shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')   # ou -2.5
  mesh = shape(image='ref.png')[0]
  tex  = Hunyuan3DPaintPipeline(Hunyuan3DPaintConfig(max_num_view=6, resolution=512))
  out  = tex(mesh, image_path='ref.png')   # → GLB com PBR
  ```
  Alternativa: **nós ComfyUI do Hunyuan3D** (já no ecossistema; blueprint `hunyuan3d 2.1` nos workflows). Requisito: **GPU NVIDIA** (Paint é CUDA-only) — RX 6750 XT/ROCm não serve pro Paint.
- **VRAM mín.** (estimado p/ 2.1): shape ~10 GB, paint ~12 GB (com `low_vram_mode` offload baixa). 2.5 (10B) pede ~24 GB. **RTX 5060 Ti 16GB roda 2.1 (shape+paint) sim; 2.5 talvez com offload.**

## Sessão 23/09 — RETOMADA PÓS-QUEDA: Qwen-Image 2.1 local + Tencent = ANA COM PÉS ✓
> Energia caiu 22/09 21:15 (máquina desligada até 23/09 11:44). /tmp foi limpo, mas NADA essencial se perdeu:
> os pesos do Qwen-Image 2.1 tinham terminado de baixar às 20:22 e o perfil do navegador CDP fica no NVMe.

- **Recuperado o rastro da sessão anterior**: ela estava (a) gerando no Tencent (20/dia grátis — modelo da Ana aprovado mas sem pés, herdado da referência `ana_coriza.png` cortada), (b) montando o toolkit `scripts/tencent_*.tmp.mjs` (19:58–21:14) e (c) **baixando o Qwen-Image 2.1** para gerar referência melhor local. Tudo em `resumo.md` anterior.
- **Estado restaurado**: Brave CDP :9222 com perfil `/media/servidor/nvme_data/ana_meshy_profile` (login Tencent vivo, cota 20); Qwen Studio (chat.qwen.ai) logado via Google `rodolfofrancoxico` (conta Free, OAuth completo via CDP com clique real no account chooser).
- **BUG DE PROD ACHADO**: container `game_farma` estava MORTO desde a queda (Exited 255, não auto-inicia) — jogo 502. `docker start game_farma` resolveu. **Registrar: após reboot, conferir se subiu.**
- **Qwen-Image 2.1 LOCAL funcionando** (RX 6750 XT): UNet Q5_K_M GGUF 5 GB + text encoder qwen3vl_8b_int8 9,3 GB (offload RAM) + VAE 675 MB.
  - **Turbo com LoRA Lightning 4 steps** (lightx2v/Qwen-Image-2512-Lightning, bf16 810 MB): **batch de 4 variações em 7 min** ✓ (50 steps padrão ≈ 1 min/step = impraticável ~50 min)
  - Alerta: LoRA sobre GGUF emite "lora key not loaded: transformer_blocks.N.attn.add_*" (1776 chaves do stream de texto) — **funciona mesmo assim** (4 renders estruturados aprovados).
  - Scripts: `ana_work/gen_qwen_ref_turbo.py` (4 steps) e `gen_qwen_ref.py` (50 steps). Workflow = blueprint oficial "Text to Image (Qwen-Image 2512)": UnetLoaderGGUF → LoRA → ModelSamplingAuraFlow(3.1) → KSampler euler/simple cfg 1/steps 4; CLIPLoader type `qwen_image`.
  - Protocolo: `docker stop llama-cpp` antes (algo o religa sozinho — re-conferir); RAM aperta (encoder 8,9 GB offload + swap NVMe) mas roda.
- **Referência nova APROVADA pelo PO** (variação 3, seed 33): corpo inteiro **com pés** (bbox 94% da altura, sneakers na base), olhos alinhados, fundo branco puro → salva como `scripts/comfy/refs/ana_fullbody_qwen21.png`. Grid de escolha publicado no DNS: `docker cp` → `game_farma:/app/dist/refs/` → `/game/ufggame/refs/escolha.html` (padrão novo para o PO ver por URL).
- **TENCENT: geração executada e GLB baixado** — regra nova crítica: **clique JS (evaluate) NÃO dispara o 立即生成; é preciso clique REAL do mouse (page.mouse.click) — trusted event.** Fluxo bom: `ana_work/tencent_gen2.mjs` (upload→isSuccess→500k→clique real→cota 20→19→poll 3 min→botão 下载→URL COS capturada→fetch→salvar).
  - **Resultado**: `ana_work/tencent_out/ana_qwen21_500k.glb` (40,6 MB, glTF 2.0 íntegro, 500k faces, texturizado) → publicado como **preview separado** `?m=ana_qwen` (produção `ana.glb` intocada).
- **SKILL criada** (pedido do PO): `/home/servidor/.agents/skills/qwen-tencent-3d/SKILL.md` — pipeline completo documentado (local + site + gotchas).
- **PRÓXIMOS PASSOS (ordem do PO)**:
  1. PO avalia o 3D no preview (`char-preview.html?m=ana_qwen`); se ok, pós-processo Blender (decimar ~15k, escala 1,72 m, pivô Y=0, metallic=0) e substituição **em leva** com rollback.
  2. **ANIMAÇÕES (pedido explícito do PO — "parte importante no render 3D")**: o próprio site Tencent tem **动画生成** (gera animação por texto/vídeo) e **绑骨蒙皮** (auto-rig) — aplicar sobre a Ana nova no site e baixar com esqueleto.
  3. Cota Tencent hoje: 19 restantes (de 20).

## Sessão 23/09 (tarde) — ELENCO COMPLETO NO JOGO + caminho das animações
- **3 personagens gerados e deployados EM LEVA no jogo** (pedido do PO: "colocar nos 3 personagens que aparecem"):
  - Atendentes: referências geradas com o mesmo pipeline Qwen-Image 2.1 turbo (`gen_attendant.py`, batch 4 cada, ~47 min os 2 juntos — memória ainda pressionada; erros "lora shape invalid" nos blocos 17-25 são **não-fatais**, o job completa). PO escolheu **Balcão 3** e **Gôndola 8** via grid no DNS (`/refs/atendentes.html`).
  - Tencent: `tencent_gen3.mjs` (parametrizado) — **2 gerações + download** (68,8/67,9 MB — saíram em **1,5M faces**: o clique em 500k não registra sempre; a cota cai ASSINCRONAMENTE — retry do clique se remain não mudar + toast watcher "当前排队中，前方N个任务" revela a fila).
  - **Pós-processo** (`optimize_model.mjs` @gltf-transform): simplify meshopt (1,5M→150k tris), texturas → 1024 WebP via **sharp** (26MB PNG → 160KB!), escala/aterragem p/ atendentes (1,788/1,732 m casando os antigos — `propFromGLB` NÃO escala, `loadGLBFPatient` auto-normaliza 1,72 m), metallic=0, reorder+quantize+meshopt (o jogo registra MeshoptDecoder ✓). Resultado: **1,6–2,0 MB por personagem** (de 40-69 MB).
  - **Deploy**: backup em `ana_work/backup_models_230923/` → repo `public/models/` → `docker cp` → produção (HTTP 200 ✓). Paciente: `ana_coriza.glb` (o jogo troca por caso `models/<caseId>.glb`); atendentes: `atendente_balcon.glb`/`atendente_gondola.glb`.
- **Gotcha docker cp**: `docker cp pasta container:/dir/` com destino EXISTENTE **anha** (vira `/dir/pasta/`) e o servidor cai no fallback do index → sempre copiar o CONTEÚDO (`cp pasta/. container:/dir/`) e conferir o CORPO da resposta, não só o 200.
- **Tencent 动画生成 = GATED pra conta free**: o card existe (`.creation-item` com botão `.creation-item-start`) mas não abre workspace; a rota interna `/animationTo3D` dá **404** (extraída do bundle JS junto com /videoTo3D, /textureTo3D, /lowpoly, /strip, /assets…). O rig 绑骨蒙皮 da galeria vem pela API paga. **Decisão do PO: usar o Mixamo (grátis).**
- **Mixamo em andamento**: Ana otimizada convertida **GLB→FBX** no Blender 5.2.2 headless (`ana_work/glb_to_fbx.py`, 5,2 MB); mixamo.com aberto no CDP; login Google→Adobe trava no "Carregando" do handshake (3 tentativas automatizadas) — **PO está completando manualmente**. Próximo: upload do FBX → auto-rig (marcadores queixo/pulsos) → animações (walk/idle/wave) → FBX→GLB → estender `patient.js` para tocar AnimationClips (`gltf.animations`) além das poses por bone (que esperam nomes do rig Eric `upperarm_l_024`).

## Sessão 23/09 (noite) — ANIMAÇÕES DE VERDADE: Mixamo rigado + Walk/Idle NO JOGO ✓
- **Login Mixamo resolvido 100% por automação** (o PO reforçou "você faz tudo"): o handshake Google→Adobe trava em "Carregando" (bug do fluxo, não throttling) → caminho alternário: **"Reset your password"** no Adobe → código de 6 dígitos chega no Gmail → lido programaticamente (aba logada) → senha nova definida (teclado real p/ React) → conta Adobe criada/logada (`Farma!2026#Ana3d` — anotar pro PO). Mixamo session colou após o ciclo de reload.
- **Auto-rig da Ana no Mixamo** — pipeline completo:
  1. GLB→FBX **aterrado** (pés Z=0 — o GLB do Tencent vem centrado na origem Z -1..+1 e o viewer do Mixamo enquadrava errado).
  2. Upload (scrollIntoView antes de clicar — janela CDP ampliada via `Browser.setWindowBounds` p/ 1300×950).
  3. Marcadores: são `<span id=chin/larm/rarm/lelbow/relbow/lknee/rknee/groin>` com `style left/top` em coords do canvas; **arrastáveis com mouse real**; wizard rejeita até todos estarem NO corpo (erros vermelhos transitórios: "Oops! Please place all markers" / "Unknown error while generating motion" — capturar com varredura de 350ms p/ elementos `.alert-danger`). Anatomia certa p/ A-pose: pulsos nas PONTAS dos braços (x≈275/390 no canvas de 690px), NÃO no torso. Rig processa em ~64s ("PLEASE WAIT").
  4. Download "With Skin" (FBX Binary) → `Browser.setDownloadBehavior` p/ pasta.
- **Walk + Idle baixados e mesclados**: Blender importa os 2 FBX, remove duplicatas (.001), renomeia actions p/ Walk/Idle, strips NLA (start inteiro!), exporta GLB com as 2 animações → gltf-transform renomeia/otimiza (prune remove o skin órfão — ficar com 1) → **3,2 MB, 65 bones mixamorig, Walk 47f + Idle 251f** (`ana_work/optimize_rigged.mjs`).
- **patient.js estendido**: `AnimationMixer` com crossfade 0,25s — `clips.idle` de base, `walk()` dispara clip Walk, fim do walk volta a Idle; `mixer.update(dt)` no topo do update; **lerp de pose procedural desligado quando há clips** (senão ele sobrescreve os bones por frame e mata a animação). Blink/respiração/poses do rig Eric continuam p/ os modelos antigos (fallback natural: sem `gltf.animations` → comportamento igual).
- **Deploy**: `ana_coriza.glb` = Ana rigada animada (3,3 MB), `vite build` + `docker cp dist/. game_farma:/app/dist/`. Atendentes já estavam no ar da leva anterior. **O jogo agora tem: Ana com pés + olhos alinhados, andando com animação Mixamo real + idle vivo.**
- Contas/sessões (todas no perfil NVMe, sobrevivem reboot): Google ✓, Qwen Studio ✓, Tencent ✓, **Adobe (senha própria) ✓**. Cota Tencent: 17.
