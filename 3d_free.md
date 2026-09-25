# 3D Free — 2D para 3D sem custo para o game_farma

Varredura web + verificação automatizada via Chromium headless (`/usr/bin/google-chrome` + Playwright, 21/09/2026).
Objetivo: gerar `.glb` a partir de imagem 2D com plano gratuito, pronto para `public/models/` + React Three Fiber.

> Nenhum gera 3D "perfeito" de 1 foto — a IA inventa o lado oculto.
> Para melhor resultado: fundo limpo, objeto centralizado, 1040px+, e se possível 2-4 ângulos (multi-view).

## Ranking gratuito verificado

| # | Ferramenta | Free real | Formatos | Melhor para | Status Chromium |
|---|---|---|---|---|---|
| 1 | **Hunyuan 3D (hy3d.dev)** | 100% free, sem cadastro, ilimitado | GLB | Teste rápido, sem conta | 200 OK 6.3s |
| 2 | **Tripo Studio** | 200 créditos/mês ~13 modelos, CC BY / não-comercial | GLB/OBJ/FBX/STL/USD/3MF | Fidelidade máxima | 200 OK workspace |
| 3 | **Meshy 7.1** | 100 créditos/mês ~5 modelos, CC BY 4.0 | GLB/OBJ/FBX/STL/USDZ/BLEND/3MF | Impressão + PBR | 200 OK 6.3s, canvas 3D |
| 4 | **Hyper3D Rodin** | Créditos free trial, pay-by-result $1.50 | STL/FBX/OBJ/GLB/GLTF/US DZ | Controle pro / games | 200 OK 6.4s |
| 5 | **3D AI Studio (Trellis 2)** | créditos signup, Trellis 2 = 10 créd/modelo | GLB/OBJ/PLY + PBR 4K | Comparar engines | 200 OK 5.5s |
| 6 | **Sloyd Labs** | Guest 1/dia, Plus $15/mês ilimitado | GLB/FBX/OBJ/STL | Volume game-ready low-poly | 200 OK 5.5s |
| 7 | **Stable Fast 3D** | Demo + API paga (2 créd/gen, 0.5s) | GLB com UV/PBR | Dev / pipeline API | 200 OK 6s |
| 8 | **Alpha3D** | Tester €5/mês, trial | GLB/FBX/OBJ/STL | Substituto Luma, retopo+rig | 200 OK 8.3s |
| 9 | **Hi3D** | 100 créditos lifetime | STL/GLB/OBJ | STL watertight barato | 200 OK 12.5s |
| 10 | **Spline AI V2** | Free + AI+ $5/mês 2000 créd | GLB via editor | Protótipo web rápido | 200 OK 5.6s |
| 11 | **Modelfy 3D Ultra** | 1º modelo free, até 300K polys | GLB/OBJ/STL + mapas | Alternativa rápida | 200 OK 7s |
| 12 | **Kaedim** | Trial/enterprise, ~15min/gen | OBJ/FBX/GLB/glTF | Estúdios/marcas | 200 OK 5.6s canvas |
| 13 | **PromeAI** | Free limitado, foco render | PNG/MP4 (não mesh) | Render arquitetônico | 200 OK 6.3s |
| 14 | **Masterpiece X / WorldEngen** | Trial 7 dias | Cenas Blender/Unity/Unreal | Worldbuilding | 200 OK 6.9s |

Mortos (não usar): Luma Genie (sunset 01/01/2026, virou vídeo), CSM Cube (DNS fail, adquirida Google 05/01/2026).

## Detalhes por ferramenta (o que faz, free, quando usar)

### 1. Hunyuan 3D — https://hy3d.dev/
Modelo open-source da Tencent. Upload JPG/PNG/WEBP até 20MB, escolhe 5K-40K faces, gera em ~50s no browser, baixa GLB texturizado. Sem login, sem watermark, roda até no celular. Qualidade boa para props simples, perde em estruturas complexas vs Tripo/Meshy. Uso comercial liberado pela licença Tencent Hunyuan Community.
Use para: validar `useGLTF` em minutos, sem gastar crédito.

### 2. Tripo AI — https://studio.tripo3d.ai/ | https://www.tripo3d.ai/features/image-to-3d-model | Preços: https://www.tripo3d.ai/pricing
Gera em segundos até 2M polys, quad-mesh nativo 500-25K ou tri 500-50K, textura 8K PBR (BaseColor/Normal/ORM), segmentação 1-clique, auto-rig humanoide/animal + animação, DCC Bridge Blender/Unity/Unreal/Maya/Godot. Aceita 1-4 fotos. Free: 200 créd/mês, modelos públicos CC BY 4.0. Pro $20/mês: 3000 créd ~200 modelos, privado + comercial.
Verificado: Studio 200 OK com "Gere rapidamente a partir de uma imagem | Gerar | Galeria".
Use para: qualidade final do game_farma, personagens com rig.

### 3. Meshy 7.1 — https://www.meshy.ai/workspace | https://www.meshy.ai/features/image-to-3d | Preços: https://www.meshy.ai/pricing
Foto→3D em ~1min, até ~600K faces, single + multi-view 4 fotos + batch 10 imagens, Image Enhancement, Pose A/T/Custom, PBR Diffuse/Roughness/Metallic/Normal, Printability Check + auto-repair watertight, split para impressão, envio direto Bambu Studio/OrcaSlicer/Creality. Exporta FBX/OBJ/GLB/USDZ/STL/BLEND/3MF/DXF. Free: 100 créd/mês. All3DP 07/2026 elegeu melhor para impressão.
Use para: peças imprimíveis farmácia, assets com textura pronta.

### 4. Hyper3D Rodin — https://hyper3d.ai/ | https://hyper3d.ai/workspace/rodin
Single-image resolve maioria, multi-view opcional, Smart Low-Poly, HD textures, normal baking, ControlNet bbox/voxel/point-cloud, edição parcial, API + MCP + plugins DCC. Free trial com créditos, Creator $30/mês ou $1.50 pay-by-result. Parceiros: Nvidia, Meta, Tencent, Supercell.
Use para: controle fino de topologia para games.

### 5. 3D AI Studio + Trellis 2 — https://www.3daistudio.com/ | https://www.3daistudio.com/Models/Trellis-2
Hub com 20+ engines no mesmo lugar. Trellis 2 (Microsoft Research, 4B params, 1536³ voxels, PBR): 10 créd/modelo. Hunyuan 35-100, Meshy 20-50. Ideal para testar a mesma foto em 3 engines e comparar.
Use para: decidir qual engine acerta seu sprite/foto antes de gastar.

### 6. Sloyd — https://www.sloyd.ai/ | Lab: https://app.sloyd.ai/labs/image-to-3d
Texto/imagem→3D + templates paramétricos com sliders em tempo real (tamanho/curva/detalhe), controle polycount 3K-500K, Tri/Quad, T-Pose, textura + auto-rig, plugins Unity/Unreal/Blender. Guest 1 gen/dia, Plus $15/mês ilimitado (sem crédito). Verificado: upload "Click, drop or paste image here" funcional.
Use para: volume alto de props low-poly com estilo consistente.

### 7. Stable Fast 3D — https://www.stablefast3d.com/ | Docs: https://stablefast3d.github.io/
Stability AI, 0.5s/asset em GPU 7GB VRAM, mesh com UV unwrap + PBR, menos bake de luz. Input JPG/PNG/WebP 64px-4Mpx. API: `POST api.stability.ai/v1/generation/stable-fast-3d`, 2 créd/sucesso. Open-source no GitHub/HuggingFace.
Use para: integrar geração no backend do jogo, sem editor manual.

### 8. Alpha3D — https://www.alpha3d.io/ | https://alpha3d.io/ai-3d-model-generator
Texto + até 8 views → mesh + retopo Quad/Tri 3 tiers + UV unwrap + AI texture + auto-rig T-pose + conversão GLB/FBX/OBJ/STL (12 créd) + agente Alphred. Tester €5/mês. Posicionado como substituto oficial do Luma Genie.
Use para: pipeline game-ready completo numa aba.

### 9. Hi3D (ex-Hitem3D) — https://www.hi3d.ai/
Foco STL estanque pronto para fatiar (Sparc3D NeurIPS 2025 + Ultra3D, até 1536³ voxels), multi-view, 8K textures, relief, Split-to-Print. Free 100 créd lifetime, Pro $19.90/mês.
Use para: só impressão barata e rápida.

### 10. Spline AI V2 — https://spline.design/ai
Descreva ou arraste imagem até 15MB → 4 looks em segundos → vira mesh texturizado editável no Spline (shaded/clay/wireframe). Free + AI+ $5/mês 2000 créd. Export web sem watermark no Starter $12.
Use para: protótipo web/landing 3D colaborativa.

### 11. Modelfy 3D Ultra — https://modelfy.art/
Proprietário até 300K polys + PBR, single + multi-image, Standard/Pro/Ultra, exporta GLB/OBJ/STL + mapas + preview. 1º modelo free, promo 50% Ultra.
Use para: alternativa rápida se Tripo/Meshy esgotarem crédito.

### 12. Kaedim — https://www.kaedim3d.com/ | Guia: https://medium.com/@kaedim/how-to-convert-an-image-to-3d-model-with-kaedim-630b6e64e805
1-6 fotos fundo branco/monocromático → modelo production-ready em ~15min, com review markup, wireframe viewer, cor no viewer, download OBJ/FBX/GLB/glTF. Foco studios/brands, não hobby.
Use para: terceirizar assets de catálogo com direção de arte.

### 13. PromeAI — https://www.promeai.pro/
42 ferramentas de sketch→render foto-realista e imagem→vídeo para arquitetura (Seedance 2.0, 4K video para Pro). Não gera mesh GLB/STL real. 2M+ usuários, Top 20 Global AI Awards 2023.
Use para: visualizar conceito antes de modelar, não para asset jogável.

### 14. Masterpiece X → WorldEngen — https://masterpiecex.com/
Virou co-pilot de cenas: junta concept/style/greybox + agentes 3D + Blender/Unity/Unreal para buildar mundos em horas. Trial 7 dias.
Use para: worldbuilding de fase inteira, não objeto único.

### Mortos — não usar
- **Luma Genie:** https://lumalabs.ai/ verificado 200 OK mas só fala vídeo/agentes Ray 3.2. Sunset 01/01/2026. Alternativa: Alpha3D.
- **CSM Cube:** https://3d.csm.ai/ verificado `ERR_NAME_NOT_RESOLVED`. Shutdown 05/01/2026, adquirida Google.

## Links diretos (todos)

- Hunyuan free: https://hy3d.dev/
- Tripo Studio: https://studio.tripo3d.ai/
- Tripo image-to-3D: https://www.tripo3d.ai/features/image-to-3d-model
- Tripo pricing: https://www.tripo3d.ai/pricing
- Meshy workspace: https://www.meshy.ai/workspace
- Meshy image-to-3D: https://www.meshy.ai/features/image-to-3d
- Meshy pricing: https://www.meshy.ai/pricing
- Hyper3D: https://hyper3d.ai/
- Rodin workspace: https://hyper3d.ai/workspace/rodin
- 3D AI Studio: https://www.3daistudio.com/
- Trellis 2: https://www.3daistudio.com/Models/Trellis-2
- Sloyd: https://www.sloyd.ai/
- Sloyd image-to-3D: https://app.sloyd.ai/labs/image-to-3d
- Stable Fast 3D: https://www.stablefast3d.com/
- Alpha3D: https://www.alpha3d.io/
- Alpha3D generator: http://alpha3d.io/ai-3d-model-generator
- Hi3D: https://www.hi3d.ai/
- Spline AI: https://spline.design/ai
- Modelfy: https://modelfy.art/
- Kaedim: https://www.kaedim3d.com/
- PromeAI: https://www.promeai.pro/
- WorldEngen: https://masterpiecex.com/
- Luma (sem 3D): https://lumalabs.ai/

## Recomendação para o game_farma

1. **Prototipar grátis agora:** `hy3d.dev` → upload PNG/JPG → download GLB → jogar em `public/models/patients/` para validar `useGLTF`.
2. **Qualidade final free:** Tripo (200 créd) com multi-view frente+lado+costas, export Quad 5-25K polys → ideal R3F 15-35K tris.
3. **Se precisar imprimir peças (farmácia/tablets):** Meshy → Printability Check → Auto-repair → STL/3MF → Bambu/OrcaSlicer.
4. **Pipeline local sem custo (RX 6750 XT 12GB):** manter ComfyUI + TRELLIS.2 / Hunyuan3D 2.0 MV Turbo como em `ideia_3d_fast_ia_learn.md` (`--lowvram --fp16`, input 512-768px, bake 1024px), pós no Blender headless (Decimate + pivô Y=0 + 1.70m + Draco).

## Checklist R3F

- [ ] Input 512-768px, fundo branco
- [ ] Export GLB, < 35K tris, textura 1024px max
- [ ] Validar wireframe/normais antes do commit
- [ ] Free = CC BY 4.0 → dar atribuição; Pro/Privado para uso comercial fechado
