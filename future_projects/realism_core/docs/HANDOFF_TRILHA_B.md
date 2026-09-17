# 🤝 Handoff — Trilha B / Personagens 3D (para o outro agente do time)

> Criado por: agente da sessão FarmaCheck · Data: 10/09/2026
> Projeto: `game_farma` (FarmaCheck) — simulador de farmácia 3D web (Three.js).
> Se você estiver trabalhando nos personagens 3D, LEIA ISTO antes de começar —
> economiza horas e evita refazer o que já foi descoberto.

---

## 1. Estado atual (10/09)
- O jogo roda em `https://francoscorporation.ddns.net/game/ufggame/` (container `game_farma`).
- **Elenco atual = procedural low-poly** (`gen_characters.py`, Blender headless) — o juiz
  de visão avaliou como **CARTOON/RUIM** (cores chapadas, sem textura, proporções estilizadas).
- Foi integrada uma **base VRM 1.0** (`public/models/paciente_real.glb`, 10.7MB, 8.3k tris,
  357 bones, **57 morphs faciais**). Ativável com `localStorage.farmacheck:real='1'`.
  ⚠️ **MAS essa base (`twist_sample.vrm`) é um MANEQUIM TÉCNICO TEAL** (cor verde-azulada),
  não um humano bonito. **Não é boa como base definitiva** — precisa de uma base humana
  real com textura de pele.

## 2. Recursos prontos (reutilizar)
| Recurso | Caminho | Nota |
|---|---|---|
| Juiz de visão (Qwen multimodal llama.cpp :8081) | `game_farma/scripts/vision_judge.py <img.png> [prompt]` | **FUNCIONA** (mmproj na CPU via `--no-mmproj-offload`). **Fix 11/09:** se o server cair com `rocBLAS Permission denied` / `libhipblas.so.2 not found`, é a pasta `/opt/rocm-6.3.3` (→ NVMe) com permissão `root:root 700` — corrigir com `sudo chmod -R a+rX /media/servidor/nvme_data/opt/rocm-6.3.3 && sudo ldconfig` e reiniciar o server. Comando: `HSA_OVERRIDE_GFX_VERSION=10.3.1 llama-server --model .../Qwen3.8-9B-Q4_K_M.gguf --mmproj .../mmproj-Qwen3.8-9B-Coder-BF16.gguf --no-mmproj-offload --port 8081 --ctx-size 100000 -ngl 999 -np 1`. |
| Validação de GLB | `game_farma/scripts/validate_character.py` | clips/partes/tris/size |
| Preview 3D com luz do jogo | `game_farma/public/real-preview.html` + `face-preview.html` (servir public/ estático) | AgX + rim + sheen |
| Screenshot driver | `game_farma/scripts/shot3d.mjs` | + `scripts/vision_judge.py` p/ loop |
| Plano Trilha B | `game_farma/docs/PLANO_TRILHA_B_REALISMO_3D.md` | R0–R6, gates, budgets |
| Skill pipeline | `~/Git/site_corp/banco_skills/pipeline3d_web/` | boilerplate AgX/sheen/KTX2 |
| Modelos baixados | `/tmp/trilha_b/` | `rpm.glb` (RPM, falha no load), `twist_sample.vrm` (manequim) |

## 3. Contratos inegociáveis (não quebrar)
- `loadGLBFPatient(url, scene)` (`src/scene/patient.js`) — contrato `enter/leave/setPose/update` +
  normalização (altura 1.72m, pés no chão, z=0.9) + material upgrade (sheen na pele por nome
  `skin/body`, clearcoat em `eye`, clamp emissive) + sombra de contato + walk-in.
- **Fallback em cadeia:** `caso.glb → paciente.glb → procedural` (`swapAvatar` em `src/main.js`).
- 5 poses: idle/mao_no_peito/curvado/cabeca_baixa (poseMap). Bone controller suporta RPM
  (`LeftArm`) E VRM/Unity (`J_Bip_L_UpperArm`) via aliases (`skel` em patient.js).
- Budgets web: personagem ≤ 20–30k tris alvo, GLB ≤ 8MB (KTX2/meshopt p/ maior), draw calls
  ≤ 30/personagem, FPS ≥ 60 desk / ≥ 30 mob. **Só 1 paciente carrega por vez** (lazy por caso).

## 4. O que a gente precisa (para colaborar — escolha uma)
1. **Base humana VRM/RPM REAL com textura de pele** (não o manequim). RPM API está bloqueado
   na rede (`models.readyplayer.me` inacessível); `rpm.glb` do three.js falha no load no meu
   preview (erro `Vector2.copy`). VRoid Hub/outros VRM = testar download.
2. **Texturas PBR** nos personagens (atualmente cores chapadas). Duas frentes:
   - Runtime: `detailTexture()` já adicionada em `patient.js` (canvas skin/cloth) — usar se quiser;
   - Blender: bake/retintar base real (MCP ou headless) — o caminho "de verdade".
3. **Otimização** da base escolhida (`gltf-transform optimize`, KTX2) p/ não pesar no jogo.

## 5. ⚠️ Coordenação — Blender MCP é COMPARTILHADO
- Há **UMA instância** de Blender 5.2 com addon MCP rodando em `127.0.0.1:9876`
  (subida via `xvfb-run`, PID em `/tmp/blender_mcp.log`). **Se os dois agentes dirigirem o
  mesmo Blender ao mesmo tempo, conflita.** Regra combinada: quem precisar do Blender avisa
  no arquivo `docs/COLABORACAO_BLENDER.md` (novo) ou usa Blender **headless** (`-b --python`)
  para batch, que não conflita.
- Para pedir a base humana via MCP, primeiro verifique o que existe em
  `~/Git/site_corp/banco_skills/` (`hunyuan3d_*`, `modelagem_personagem_3d`, `mcp_blender`).

## 6. Perguntas que você pode deixar pro time (se quiser)
- Qual base humana escolher (VRM realista vs RPM) dados os bloqueios de rede?
- Vale a pena Hunyuan3D local (ROCm 12GB) para 1–2 identidades icônicas (Dona Rosa idosa)?
- Prioridade: texturas runtime (rápido) vs bake no Blender (mais real)?

---

## 7. Intel do time (adicional — para o agente do G0/modelagem)
- **Juiz de visão FUNCIONA agora:** `scripts/vision_judge.py <img> [prompt]` (llama-cpp :8081, Qwen multimodal, mmproj na CPU via `--no-mmproj-offload` — 30-60s). Use pro QA dos GLBs que você gerar.
- ⚠️ **`public/models/paciente_real.glb` = manequim técnico teal** (twist_sample.vrm) — NÃO é humano bonito. Se a auditoria G0 pegar pele "verde-azulada" nele, é isso.
- **RPM (Ready Player Me):** `models.readyplayer.me` está **bloqueado** na rede; o `rpm.glb` do three.js falha no load no preview (`Vector2.copy`). Se quiser RPM, precisa contornar.
- **`patient.js` já tem:** upgrade de material (sheen pele/clearcoat olho) + `detailTexture()` runtime (canvas skin/cloth) + bone controller com aliases RPM **e** VRM/Unity (`J_Bip_*`). **Não reescreva** — estenda.
- **Budgets:** ≤20-30k tris/personagem, GLB ≤8MB (senão KTX2/meshopt), draw calls ≤30, 1 paciente por vez (lazy). Medir com `renderer.info`/fps, não estimar.
- **Fallback preservado:** `caso.glb → paciente.glb → procedural` (swapAvatar em `src/main.js`). Se seu GLB falhar pra um caso, o jogo continua.
- **G0 (auditoria):** se puder, inclua textura presente/ausente + peso por GLB (a "textura" é o que o juiz mais reclama).

---

Se você terminou de verificar no Blender e tiver achado/gerado um GLB humano bom,
coloque em `public/models/` (nome `paciente_real.glb` já existe) e deixe um print +
veredito do juiz em `docs/PLANO_TRILHA_B_REALISMO_3D.md` §9. O time valida junto.