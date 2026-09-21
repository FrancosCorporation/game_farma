# Resumo — Melhoria da personagem Ana (game_farma)

## Objetivo
Deixar a personagem **Ana** (`public/models/ana.glb`) com qualidade "Disney estilizado/realista":
pele limpa, olhos vivos com catchlight, sobrancelhas naturais, sem artefatos de malha/textura.

## Base do modelo
- Gerada por **TRELLIS 2** (image-to-3D) a partir de referência aprovada.
- 243.714 triângulos, altura 1,72 m, atlas UV **fragmentado** (muitas ilhas pequenas espalhadas).
- Posições quantizadas (int16 ÷32767) + UV uint16 (÷65535) + texturas WebP (baseColor 4096, normal 2048, metalRough 4096).

## Problemas identificados (com evidência visual)
1. **Estrias "veludo cotelê" na pele** — relevo **geométrico** da malha (o normal map é quase plano).
2. **Rachaduras nas costuras UV** — a malha tem ~70k vértices duplicados nas bordas das ilhas; suavizar sem soldar abre a superfície.
3. **Manchas irregulares de pele** — baseColor com blocos de tons diferentes (bake do TRELLIS).
4. **Sobrancelhas grossas/pretas** — pintura dura na textura.
5. **Olhos vítreos/sem vida** — textura de íris estava quebrada e esferas 3D falharam (costura visível, afundamento).
6. **Brilho metálico** — material com `metallic=1` + metalRough texture.
7. **Dimples "estrela"** (ombro/decote) — artefatos de normal map.
8. **Proporções** (testa alta, nariz grande, queixo curto) — limitação da base TRELLIS.

## Métodos usados (pipeline em `/tmp/opencode` + scripts do repo)
1. **Solda + suavização Laplaciana** (`tmp_rebuild.mjs`): agrupa vértices por posição quantizada e move o grupo junto (mantém a superfície fechada).
2. **Blur mascarado por material** (`make_basecolor.py`): média local só entre pixels de pele/cabelo/roupa, com **exclusão das regiões dos olhos** (UV L≈0.8186,0.0564 / R≈0.8847,0.8364).
3. **Clareamento de pixels escuros** (sobrancelhas) só na vizinhança da pele.
4. **Normal map achatado 55%** rumo ao neutro (remove dimples).
5. **Material**: `metallic=0`, `roughness=0.8`.
6. **Catchlight pintado** na textura sobre as íris (substituiu as esferas 3D, que falhavam por costura/afundamento).
7. **Verificação visual real** (screenshots lidos com visão): `scripts/shot3d.mjs`, playwright face-cam, e CDP na janela do Brave.

## O que funcionou
- Solda eliminou as **rachaduras**.
- Suavização eliminou as **estrias**.
- Blur mascarado + dessaturação reduziu **manchas**.
- Sem esferas: olhos pintados preservados + catchlight = olhar vivo, sem artefatos.
- metallic=0 removeu o aspecto escuro/metálico.

## O que piorou / pendências
- **Suavização forte demais** na cabeça (λ=0.5 ×2) "derreteu" o rosto (perde definição de nariz/lábios/órbita).
- Normal map achatado removeu micro-relevo.
- Mancha laranja no peito (blush vazado da textura base).
- Olho direito mais escuro que o esquerdo (assimetria da textura base).
- Proporções do rosto — só esculpindo (Blender) ou regenerando (Hunyuan3D 2.1 — já instalado!).

## Próximo passo proposto
Versão **mais afiada**: suavização 1 passe leve (λ≈0.25) na cabeça, normal map original de volta,
mantendo solda + correções de textura. Comparar lado a lado antes de publicar.
Alternativa forte: **regenerar a Ana com Hunyuan3D 2.1** (já disponível na máquina) — tende a dar mãos e superfícies melhores que o TRELLIS 2.

---

# Inventário da máquina (o que está à disposição)

## Hardware
- **CPU**: 28 threads (~14 núcleos).
- **RAM**: 30 GiB total (≈12 GiB disponíveis em uso normal).
- **GPU**: AMD Radeon **RX 6750 XT** (Navi 22, 12 GB VRAM) — ROCm via `HSA_OVERRIDE_GFX_VERSION=10.3.0`; Mesa 26.0.8 (RADV). Vulkan OK.
- **Discos**: raiz `/` 218 GB (92% usado — **18 GB livres, atenção**); NVMe `/media/servidor/nvme_data` 1,8 TB (**1,1 TB livres**).

## Serviços de IA locais (já rodando)
- **ComfyUI** `http://127.0.0.1:8188` — serviço `comfyui.service`
  (`/media/servidor/nvme_data/ai_music/comfyui/ComfyUI`) — "ACE-Step + SDXL + Pixal3D/Trellis2".
  - Custom nodes: `ComfyUI-Pixaroma` (inclui `node_3d.py` + workflow "3D Builder"), `ace-step-comfyui` (música).
  - Modelos 3D:
    - `models/diffusion_models/3D/trellis_2_bf16.safetensors` + `trellis_2_int8_convrot.safetensors`
    - `models/vae/trellis_2_shape_vae_bf16.safetensors` + `trellis_2_texture_vae_bf16.safetensors`
    - `models/diffusion_models/hunyuan_3d_v2.1.safetensors` (**Hunyuan3D 2.1**, 7 GB)
  - Imagem: `dreamshaper_xl.safetensors`, `sd_xl_base_1.0.safetensors` (6,6 GB cada).
  - Cópia extra do TRELLIS 2 em `game_farma/trellis_2_bf16.safetensors` (9,9 GB).
- **Juiz de visão local** `http://127.0.0.1:8081` — llama.cpp com **Qwen3.8-9B multimodal**
  (usado por `scripts/vision_judge.py`).
- **SearXNG** `http://127.0.0.1:8080` — busca web.
- `comfyui-music-panel.service` — painel/orquestrador de música.

## Ferramentas de 3D/render
- **Blender** (`/snap/bin/blender`) + scripts do repo em `scripts/blender/`
  (`gen_characters.py`, `gen_props.py`, `postprocess_character.py`, `split_materials.py`).
- **Node/glTF toolchain** (deps do projeto): `@gltf-transform/core|extensions|functions|cli` 4.5,
  `meshoptimizer` 1.2, `playwright` 1.63, `three` 0.169.
- **Python**: numpy 2.5, scipy 1.18, Pillow 11.3 (sem torch/diffusers no Python do sistema —
  o torch roda dentro do venv do ComfyUI).
- Navegadores: **Brave** (com workaround de GPU), Chrome, Firefox.

## Scripts úteis do repo (`game_farma/scripts`)
- Render/QA: `shot3d.mjs`, `shot3d_close.mjs`, `qa_char_preview.mjs`, `qa_closeups.mjs`,
  `qa_eyepos.mjs`, `qa_lid.mjs`, `qa_eyecheck_tex.mjs`, `qa_eyesclera.mjs`, `qa_realista.mjs`,
  `vision_judge.py`, `validate_character.py`.
- Pipeline 3D (`scripts/comfy/`): `gen_ref.py` (gera referência), `submit_wf.py` (envia workflow ao ComfyUI),
  `batch_assets.py`, `polish_char.py`, `eyes_add.mjs`, `glb_info.mjs`, `free_ram.py`, `refs/` (referências aprovadas).
- Deploy: `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh` → `https://francoscorporation.ddns.net/game/ufggame/`.

## Infra de debug usada
- Preview: `https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana`
- Brave com GPU (workaround da GPU quebrada do perfil padrão — GPU process crash exit 512):
  janela com `--ozone-platform=wayland --user-data-dir=/tmp/brave-hw-ana --ignore-gpu-blocklist
  --use-gl=angle --use-angle=vulkan --remote-debugging-port=9223` (140–165 fps).
- CDP (Chrome DevTools Protocol) na porta `9223` para navegar/capturar sem depender de screenshot do GNOME
  (scripts em `/tmp/opencode/cdp_*.mjs`).
- Backup do modelo limpo: `git show HEAD:public/models/ana.glb > ana_clean.glb`.

---

# Para depois (pendências anotadas)

- **Testar geração de imagens com Qwen Image 2.1** (sugestão do PO): avaliar se dá pra rodar geração de imagens no ComfyUI
  local com os blueprints `Text to Image (Qwen-Image 2512)` / `Image Edit (Qwen 2511)` / `Text to Image (Qwen-Image)`.
  Objetivo futuro: gerar referências melhores (character sheet multi-ângulo) e/ou vistas extras para o pipeline 3D.
  **Não fazer agora** — anotado para depois.

