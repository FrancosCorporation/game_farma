# Tutoriais 3D — Transcrições e Análise (game_farma)

Análise de **163 vídeos únicos** (13 individuais + 2 playlists + 2 buscas do YouTube)
sobre criação de personagens/objetos 3D em Blender, Blender MCP e IA. Tudo foi
transcrito via `yt-dlp --write-auto-subs` e analisado para virar skills do
`SKILL_BANK/`.

## Estrutura

| Arquivo/Dir | Conteúdo |
|---|---|
| `CATALOGO_TUTORIAIS_3D.md` | Catálogo completo dos 163 vídeos com estado (transcrito / sem legenda / off-topic). |
| `transcricoes/` | 111 transcrições limpas (`.txt`), nomeadas por `ID do vídeo`. |
| `analises/` | 6 arquivos de análise técnica (per-vídeo: fluxo, addons e comandos bpy). |
| `index.tsv`, `idx_relevantes.tsv` | Índices com título + contagem de palavras. |

## Aprendizados-chave (sintetizados dos tutoriais)

**Modelagem de personagem (orgânico):**
- Sempre **Mirror (clipping) + Subdivision Surface (viewport 2)** para formas simétricas.
- Modelar = **extrude / loop cut (`Ctrl+R`) / inset (`I`) / bevel (`Ctrl+B`)** + mover/escalar/rotacionar.
- Aplicar subdivision em **nível 1** para manter low-poly de jogo.

**Sculpt (orgânico/polimento):**
- Brushes essenciais: **Draw, Clay Strips, Crease, Smooth, Inflate, Elastic Grab, Pinch**.
- `Ctrl` inverte o efeito; `F` raio, `Shift+F` força.

**UV / Texturização:**
- Marcar **seams** em bordas críticas → `UV > Unwrap` / `smart_project` → `pack islands`.
- Pintura em camadas: detalhes → imperfeições → sombras (**blend Darken**) → highlights (**Lighten**).
- Textura base ≤1024×1024; reduzir depois, nunca ampliar.

**Materiais (realismo):**
- `Principled BSDF` com **Subsurface** (pele), **Sheen** (tecido), **Coat** (verniz), **Transmission** (vidro/olhos).
- Texturas PBR: albedo + roughness + metalness + normal map (mapas de 1024px).

**Hair:** curves + `Principled Hair BSDF`, Color Ramp + noise p/ alpha; ou low-poly com bake.

**Rigging / Animação:**
- **Rigify** (human metarig → ajustar ossos → `Symmetrize` → auto weights) ou **AccuRig** (free).
- Objetos rígidos seguem **1 osso** (weight paint 100% na pelvis/pescoço).
- **Shape Keys** para expressões (mouth_open, eye_blink) → morph targets no Three.js.
- Animação: auto-keyframe, pose por controllers de pés/mãos, `T > Spline` (fora do constant), copy/paste **flipped** para loop.

**Limpeza de asset de IA (sempre):**
1. `merge by distance` (vérticies duplicados de GLB)
2. `Weighted Normal` (consertar flat shading)
3. `apply transforms` (`Ctrl+A`)
4. mirror no eixo Y quando simétrico
5. `join` (`Ctrl+J`) / apagar polígonos cobertos
6. origem no cursor (world origin)

**Setup Blender MCP:** `uvx blender-mcp install-addon` → addon no Blender → `N` → conectar porta 9876 → marcar Polyhaven/Hyper3D. Prompt **específico** sempre ("futuristic Lamborghini-style sports car" >> "cool car").

## Regras de budget (herdadas do MASTER_PLAN)

- Personagem ≤15k tris (ideal 8–12k); prop 500–8k; móvel 2–8k; veículo 8–25k; rocha 1–20k; módulo arquitetura ≤50k.
- Textura ≤1024×1024; `.glb` com Draco 6–7; escala métrica; Y-up; pivô base em `Y=0`.

## Skills relacionadas

- `SKILL_BANK/SKILL_D_PERSONAGEM_BLENDER_MCP.md` — playbook completo (do tutorial ao web-ready via bpy).
- `SKILL_BANK/SKILL_E_FONTES_ASSET_SCAN_IA.md` — assets reais (Photogrammetry/Polycam, LiDAR, impressão 3D) + IA-vídeo como referência.
- `SKILL_BANK/SKILL_F_GAMEPLAY_CAMERA_RAYCAST.md` — câmera 1ª/3ª pessoa, raycast de seleção/tiro, alternância de perspectiva.
- `SKILL_BANK/SKILL_A_PIPELINE_3D_UNIVERSAL.md` — orquestração de geração + consolidação.

## Cobertura

- **163 vídeos distintos** catalogados; **144 transcritos** (88%).
- 15 vídeos têm legenda automática mas o download foi bloqueado por rate-limit (429) do YouTube: EuuTpA-30UY, tElREHvYJng, VmRM_qRzPhU, IZKyOSt6VCw, L9gSTSdz4GA, J5Dd-3d-StY, jLSJ5MVjdYU, -ympvQ1Far4, -PZ531zo_P0, Q0AspgErHuQ, v4gVcdlkFuo, 0kxqU7wxisA, ABLcmrLjOZM, pTpZDX1XUDY, 9tjJa-PC4sk (todos off-topic).
- 4 vídeos sem legendas automáticas (timelapse/footage sem narração): -Fztbv28gk4, p3SDYY6Hl-U, uUv0wxBy4ks, e67NVWFz-L0.

## Fontes originais

Links catalogados em `site_corp/banco_skills/links_skills.md` (seção "Tutoriais / Playlists YouTube").