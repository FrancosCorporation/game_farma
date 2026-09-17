# 🧊 FarmaCheck — Plano de Pipeline 3D Realista para Web (estilo GTA V-inspirado)

> **Versão:** 1.1 · **Data:** 09/09/2026 · **Branch:** `v3-rewrite`
> **➡️ EXECUÇÃO:** a Trilha B (base humana rigada) agora tem plano próprio:
> **`PLANO_TRILHA_B_REALISMO_3D.md`** (fases R0–R6) — este doc fica como
> referência do diagnóstico (F0/F1) e dos critérios de QA/aceite.
> **Status:** F0 EXECUTADO (AgX + rim + sheen) · F1 EXECUTADO (proporções/face) ·
> **Veredito do juiz de visão (loop concluído):** modelo isolado = **CARTOON**;
> cena real in-game com a renderização nova = **REALISTA com ressalvas**
> (a luz/AgX/sheen elevam a percepção — ~50% do "look"). **Conclusão: o approach
> procedural de primitivas tem TETO estilizado — GTA V exige Trilha B (base humana
> VRM/RPM + PBR) ou Hunyuan3D + retopo.**
> **QA visual:** o modelo de visão **Qwen3.8-9B multimodal** (llama-cpp, `:8081`)
> avalia screenshots a cada iteração (loop: melhorar → print → julgar → ajustar).
> Reutilizável em `scripts/vision_judge.py`.

---

## 1. Objetivo e referência

Personagens 3D do FarmaCheck com aparência **realista mid-poly inspirada em GTA V**
(não fotorreal), otimizados para navegador (60 FPS), com expressões clínicas
controladas por código. O jogo roda em Three.js (`three@0.169`), GPU AMD 12 GB
(ROCm), ComfyUI local disponível.

**Estado atual:** personagens procedurais low-poly (~3-3.6k tris) — o juiz de visão
reportou: "cabeça gigantesca, corpo 'ursinho de goma', olhos de boneco colados na
testa, nariz quase imperceptível, cabelo como calva, textura plana". 

## 2. Verdades técnicas inegociáveis (auditoria do prompt do agente sênior)

| # | Item | Veredito / Correção |
|---|------|--------------------|
| 1 | Image-to-3D (TripoSR/CRM) | Qualidade mascote. Preferir **Hunyuan3D-2.x (local/ROCm)**, Tripo API, Rodin, SF3D. |
| 2 | SSS no `MeshPhysicalMaterial` | **Não existe nativo.** Ordem de custo: (a) `sheen` + cavity [grátis] → (b) pre-integrated skin via `onBeforeCompile` + LUT [~0,5ms] → (c) `transmission` localizada [caro]. |
| 3 | Mixamo + Morph Targets | Mixamo **não gera blendshapes faciais**. Expressões clínicas: VRM 1.0, Ready Player Me (ARKit 52), Faceit, ou sculpt no Blender. |
| 4 | "Nível GTA V" puro | **Não existe** via image-to-3D atual. ~50% do look = iluminação + tonemapping + color management. |
| 5 | Compressão | Todo GLB final passa por **`gltf-transform` (Meshopt + KTX2)** — senão não vai pra web. |
| 6 | Tone mapping | **AgX** (r162+) ou **Neutral** (r168+) — ACES lava tons frios. Já aplicado (AgX). |
| 7 | Color management | Albedo = `SRGBColorSpace`; normal/roughness/AO = linear. |
| 8 | Métricas | Medir (`renderer.info`, stats.js, glTF-Validator) — estimativa sem medição é ficção. |

## 3. Trilhas — decisão

- **Trilha A (do zero):** folhas ortográficas (SDXL) → image-to-3D → retopo → rig → bake.
  Candidatas locais: Hunyuan3D-2.x (ROCm 12 GB — ver `hunyuan3d_rocm_12gb`), SF3D (rápido).
- **Trilha B (base pronta — MVP recomendada pelo agente):** avatar rigado com
  blendshapes (VRM 1.0 / Ready Player Me) + texturas PBR; deformar o look com
  **MATERIAL** (sheen, cavity, tone) e não com topologia.

**Decisão em 2 estágios:**
1. **Já:** melhorar o modelo procedural existente (proporções humanas, face) +
   renderização realista (AgX, sheen, luz) — ~50% do ganho visual sem assets externos.
2. **Próximo:** testar Trilha B (avatar VRM/RPM com blendshapes) e Hunyuan3D como
   base real; iterar com QA visual.

## 4. Fases (cada uma exige comando executado + print + veredito do juiz de visão)

### F0 — Renderização realista (EXECUTANDO 09/09)
- [x] `renderer.toneMapping = AgXToneMapping`, exposure 1.0 (`src/scene/scene.js`)
- [x] Rim light frio atrás do paciente (separação de fundo)
- [x] Sheen (fake-SSS) + clearcoat na pele via `MeshPhysicalMaterial` (`src/scene/patient.js`)
- [x] Contact shadow + walk-in do GLB (feito na sessão anterior)
- [ ] Validar: screenshot in-game → juiz de visão → ajustar exposição/rim
- **Procedural:** `PatientAvatar` com mesma classe de material (sheen na pele)

### F1 — Proporções humanas (em andamento)
- Cabeça menor (skull 0.148→~0.125; relação cabeça:corpo ~1/6.9)
- Olhos menores (0.028→~0.022) e mais baixos (longe da "testa")
- Nariz proeminente; boca/lábios definidos; cabelo cheio (cap + franja + sideburns)
- Corpo esbelto: ombros largos, cintura marcada, quadril definido; pescoço fino
- Braços com ombro (deltoide) — não "brotando do tronco"
- **Gate:** `validate_character.py` (clips/partes/tris/<30k) + QA facial do script

### F2 — Geração real (Trilha A/B) — PRÓXIMA
- Baixar avatar base (VRM 1.0 / RPM) OU gerar Hunyuan3D-2.x via ComfyUI (ROCm)
- Listar `morphTargetDictionary` completo (52 shapes ARKit se RPM/VRM)
- Retopo 15-30k tris (desktop) / 10-15k (mobile): Instant Meshes / meshopt simplify
- Rig: Mixamo corpo + blendshapes faciais (não Mixamo — Faceit/sculpt/VRM)
- Bake PBR 2K: albedo, normal (poros), roughness, AO

### F3 — Otimização web
- `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2`
- Budgets: download ≤10MB, VRAM texturas ≤20MB, draw calls ≤30/personagem
- Passar no **glTF-Validator** (0 erros)

### F4 — Deformação clínica
- Escala de dor 0-10 → pesos de morphs (damping)
- Respiração procedural (scale do osso do tórax)
- Palidez/cianose via `material.color.lerpColors()`

### F5 — Integração FarmaCheck
- Contrato `loadGLBFPatient` (enter/leave/setPose/update) preservado
- Fallback: GLB → `paciente.glb` → procedural
- Swap por caso mantido

## 5. Budgets (medir, não estimar)

| Métrica | Desktop | Mobile |
|---|---|---|
| Triângulos | 20-30k | 10-15k |
| Download | ≤10MB | ≤5MB |
| VRAM texturas | ≤20MB | ≤10MB |
| Draw calls (personagem) | ≤30 | ≤20 |
| FPS | ≥60 | ≥30 |

## 6. Loop de QA visual (juiz local)

```bash
# 1. screenshot (jogo ou preview 3D)
node scripts/shot3d.mjs "carla_dengue" /tmp/modelo.png --pose idle
# 2. juiz de visão (llama-cpp :8081)
python3 scripts/vision_judge.py /tmp/modelo.png
# 3. iterar até "realista / proporcional / pele convincente"
```

Prompt-padrão do juiz (pt-BR, crítico, direcionado a: proporções, face, material,
iluminação, o que está feio). Registrar cada veredito no doc de evolução.

## 7. Entregas e skill

- Skill **`pipeline3d_web`** registrada no banco (`banco_skills/pipeline3d_web/`) —
  boilerplate Three.js (AgX, KTX2, Meshopt, sheen) + comandos gltf-transform.
- Este documento atualizado com resultados por fase (prints + vereditos do juiz).

## 8. Critérios de aceite

- [ ] glTF-Validator: 0 erros
- [ ] `gltf-transform inspect`: dentro dos budgets
- [ ] `renderer.info.render.calls` ≤ 30 no personagem
- [ ] FPS ≥60 desktop / ≥30 mobile mid-range
- [ ] Morphs listados e respondendo (console)
- [ ] Screenshots em 3 ângulos (com/sem HDRI) aprovados pelo juiz de visão
- [ ] Relatório de licenças por ferramenta