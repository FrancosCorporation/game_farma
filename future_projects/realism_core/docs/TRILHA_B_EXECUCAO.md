# 🧊 FarmaCheck — Trilha B · Execução (avatar humano real + PBR + morphs)

> **Versão:** 1.0 · **Data:** 09/09/2026 · **Branch:** `v3-rewrite`
> Referência: `docs/PLANO_PIPELINE_REALISTA_3D.md` (§3, Trilha B) + skill `banco_skills/pipeline3d_web`.

## 1. Objetivo
Substituir o avatar procedural (primitivas → "ursinho de goma", veredito CARTOON)
por um **humanoide real** já rigado, com **morph targets (blendshapes)** e **texturas
PBR**, integrado ao contrato `loadGLBFPatient`, renderizado com AgX + sheen + rim light.
Alvo: **realista mid-poly estilo GTA V**.

## 2. Fontes de avatar (verificar acesso — 09/09)
| Fonte | Acesso | Nota |
|---|---|---|
| three.js examples (`Michelle.glb`, `Soldier.glb`, `Xbot.glb`) | ✅ 200 | PBR + rig + morphs (female: Michelle; male: Soldier/Xbot). Licença Mixamo/Adobe. |
| Ready Player Me (`models.readyplayer.me/*.glb`) | ❌ bloqueado | Avatares mais realistas; exige API/avatar id. |
| VRoid Hub / Pixiv VRM | a testar | VRM 1.0 (ARKit presets). |
| Hunyuan3D local (ComfyUI/ROCm) | Trilha A | Realista porém retopo+rig pós-geração. |

**Decisão MVP:** começar com `Michelle.glb` (morphs) + `Soldier.glb`/`Xbot.glb` (macho),
porque são baixáveis agora, têm rig + PBR + morphTargets e cabem na web após compressão.

## 3. Pipeline de evidência (cada etapa: comando + print + juiz de visão)
1. **Download** do GLB (three.js) + fallback se tamanho > limite.
2. **Inspeção** (`@gltf-transform/inspect` ou script Python): listar meshes, materiais,
   `morphTargetDictionary` completo (nomes), `animations`/clips, tamanho, tris.
3. **Compressão** (`gltf-transform optimize` — meshopt + KTX2) → ≤10MB.
4. **Integração** em `loadGLBFPatient`: detectar materiais de pele (por nome OU cor),
   aplicar o upgrade PBR (sheen/clearcoat), mapear poses → clips existentes OU morphs
   para expressão clínica (dor = morph, não só pose).
5. **Morphs clínicos:** dor 0–10 → pesos de morphs (damping), respiração (scale tórax),
   palidez/cianose via `material.color.lerpColors()`.
6. **QA:** screenshot in-game → juiz de visão → medir `renderer.info`.

## 4. Contrato e integração (mudanças em `src/scene/patient.js`)
- `loadGLBFPatient` passa a expor `setExpression(key, 0..1)` (morphs) além de `setPose`.
- `poseMap` vira: idle→primeiro clip idle; falhas caem p/ morphs/procedural.
- Diversidade por caso: mapear `case.id → { urlu, morphs, tintPele }`; enquanto houver 1
  base, usar tint de pele/roupa via material quando possível.

## 5. Budgets (medir)
Desktop: ≤20–30k tris, ≤10MB, ≤30 draw calls, ≥60 fps. Mobile: 10–15k tris, ≤5MB.

## 6. Riscos e critério de parada
- Licença Mixamo (usar como base didática; registrar no relatório de licenças).
- Se Michelle/Soldier não caberem esteticamente (mulher jovem vs casos clínicos),
  fallback = gerar 1 base neutra via Hunyuan3D (Trilha A) com retopo.
- Parar quando o juiz de visão der ≥2× seguidas "REALISTA" ou "QUASE" na cena real.