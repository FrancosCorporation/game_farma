# 🧍 FarmaCheck — Plano Trilha B: Base Humana Rigada → Realismo (R0–R6)

> **Versão:** 1.0 · **Data:** 09/09/2026 · **Branch:** `v3-rewrite`
> **Status:** VIGENTE — este doc substitui, como **fonte de verdade para o objetivo
> "pessoas de verdade com realismo"**, o caminho procedural das demais fases.
> Docs anteriores permanecem válidos para: **props/cenário** (`PLANEJAMENTO_MASTER_3D.md`),
> **referência técnica** (`PLANEJAMENTO_3D.md`) e **QA/entregas** (`PLANO_PIPELINE_REALISTA_3D.md`).

> **DIRETIVA DO PO (10/09/2026):** foco em **PERSONAGENS PRIMEIRO**, com **máximo
> de detalhe** (dedos, olhos, boca, texturas de verdade, nível GTA V). Depois
> ambiente (prédios, chão, balcão, gôndolas). Loop obrigatório: **print → juiz de
> visão → ajustar** até aprovar. Ao aprovar os personagens, **rebuild + deploy**.

---

## 0. TL;DR (o que muda e por quê)

O objetivo passou a ser personagens **humanos realistas (K5: parece gente de verdade)**.
A auditoria dos 4 docs converge para um único veredito, confirmado pelo **juiz de
visão** (`scripts/vision_judge.py`, Qwen multimodal `:8081`):

> **O approach procedural de primitivas tem TETO estilizado ("CARTOON").**
> ~50% do look realista já foi extraído do render (AgX + rim + sheen — F0/F1
> executados), mas os outros 50% exigem **topologia humana real + texturas PBR +
> blendshapes faciais**, que primitivas Blender não entregam.

**Decisão (Trilha B, conforme prescrito em `PLANO_PIPELINE_REALISTA_3D.md` §3):**
partir de uma **base humana rigada pronta** (VRM 1.0 ou Ready Player Me, ambos com
blendshapes faciais) e construir a identidade dos 17 personagens **por cima** da base:
shapekeys de tipo corporal/idade + recolor das paletas de `cases.js` + material
PBR/sheen no runtime + retarget das 5 Actions clínicas.

- Hunyuan3D (Trilha A) **não é descartado**: vira **variante opcional (R3+)** para
  1-2 identidades icônicas, dependendo de retopo + rig facial — custo alto por
  personagem. Não é o caminho principal.
- **Pré-requisitos hardware/dev já atendidos:** Blender 5.2 (headless), ComfyUI
  `:8188`, llama.cpp `:8081` (juiz de visão), GPU 12 GB (ROCm).

---

## 1. Auditoria dos 4 docs (o que cada um diz sobre o objetivo "realismo")

| Doc | Escopo | Veredito para o objetivo realismo-humano |
|---|---|---|
| `PLANEJAMENTO_3D.md` (08/09) | Milestones G0–G6, hardware, ferramentas | **Correto e atual.** Aponta Hunyuan p/ orgânico e reconhece sheets SDXL pendentes. Definiu contratos que continuam valendo (§4 daqui). Não detalha o "como" da base humana. |
| `PLANEJAMENTO_MASTER_3D.md` (v3, 09/09) | Template reutilizável + estado G5 | **Melhor fonte de estado** (elenco 17/17 v3, QA, lições Blender 5.2). Mas o pipeline que descreve é o **procedural** — o mesmo que o juiz reprovou. Mantém valor como template de props/cenário e como registro de lições. |
| `PLANO_PIPELINE_REALISTA_3D.md` (v1.1, 09/09) | Pipeline realista (F0–F5) | **Diagnóstico exato.** F0/F1 executados; o próprio doc conclui que o procedural tem teto e que a solução é Trilha B. Porém **não executa** a Trilha B — só a lista como "próximo". |
| `PLANEJAMENTO_GAME.md` + `IMPLEMENTACAO_TRACKER.md` | Game geral / tracker | Alinhados; M2.5 marca elenco GLB concluído (verdade para o pipeline procedural). Realismo facial/clínico segue aberto. |

**Conclusão:** nenhum doc contradiz outro — falta o **plano de execução da Trilha B**.
É exatamente o que este documento cria.

---

## 2. Evidência (por que trocar de rumo)

1. **Juiz de visão (loop concluído):** modelo isolado = `CARTOON`; só com o render
   da cena a nota sobe para `REALISTA com ressalvas` — ou seja, o modelo em si
   não convence sem o "travestimento" de luz/cor.
2. **Proporções já corrigidas (F1):** cabeça ~1/7, olhos baixos, nariz 3 volumes,
   mãos com dedos — e o resultado continua estilizado. O limite é estrutural:
   primitivas não geram poros, dobras, assimetria nem microexpressão.
3. **Blendshapes:** `Mixamo não gera morphs faciais` (verdade técnica nº 3 do
   pipeline doc). A escala de dor 0–10 do FarmaCheck **exige** morphs
   (sobrancelha, boca, olhos) — sem eles a semiologia facial é impossível.
4. **Custo-benefício:** 1 base humana rigada + adaptação serve os **17
   personagens**; Hunyuan + retopo + Faceit por personagem é ~1 dia **cada**.

---

## 3. Contratos inegociáveis (preservar o que existe — verificado no código)

Qualquer avatar novo entra **sem quebrar** o jogo:

1. **`loadGLBFPatient(url, scene)`** (`src/scene/patient.js:346`): contrato
   `enter/leave/setPose/update` + normalização de escala (altura 1.72 m, pés no
   chão, centrado no ponto do paciente `z=0.9`) + upgrade de material
   (sheen fake-SSS na pele por nome `skin`, clearcoat nos olhos, clamp de
   emissive) + sombra de contato + walk-in. **Todo caminho daqui entra por
   wrapper dessa função ou por função irmã com fallback.**
2. **Fallback em cadeia:** `caso.glb → paciente.glb → procedural` (`swapAvatar` em
   `src/main.js`). Se a Trilha B falhar para um personagem, o jogo continua com o
   GLB v3 atual. **Nada de trocar tudo de uma vez.**
3. **5 Actions nomeadas:** `Idle, Pain, Weakness, Discomfort, Embarrassed`
   (poseMap `idle/mao_no_peito/curvado/cabeca_baixa`).
4. **Escala/glTF:** 1 unidade = 1 m, pivô no chão entre os pés, forward = +Z para
   a câmera, Y-up (o exporter do Blender corrige −Y→+Z).
5. **Budgets web (`PLANEJAMENTO_3D.md` §4):** personagem ≤ 30k tris alvo (tolerância
   base VRM: até ~80k tris no desktop se `gltf-transform` mantiver 60 FPS — medir,
   não estimar), `.glb` ≤ 8 MB, texturas KTX2, draw calls ≤ 30/personagem,
   FPS ≥ 60 desktop / ≥ 30 mobile mid-range.
6. **Materiais:** albedo em SRGB; normal/roughness/AO lineares; tonemapping **AgX**
   (já em `src/scene/scene.js:12`); sheen/clearcoat do `loadGLBFPatient` continuam
   aplicados por **nome de material** — manter os nomes (`skin`, `eye`, `iris`,
   `pupil`, `lip`, `hair`) nos novos assets.

---

## 4. Árvore de decisão (qual base humana)

```
Avatar humano realista (17 personagens)
├── B1. VRM 1.0 (pixiv three-vrm)          ← CAMINHO PRINCIPAL
│      ✓ expressões 1.0 nativas + look-at, formato aberto, rig humanoide padrão
│      ✓ exportável como .glb (VRM é glTF+extensão) → loader atual continua lendo malha+clips
│      ✗ material default MToon (anime) → sobe para MeshPhysicalMaterial (sheen) no runtime
├── B2. Ready Player Me (.glb ARKit-52)    ← ALTERNATIVA (decidida no gate do R1)
│      ✓ morphs ARKit 52 + PBR de fábrica; carrega no GLTFLoader puro (zero dependência nova)
│      ✗ identidade "média" (menos variedade de corpo/idade), customização via API
└── B3. Hunyuan3D-2.1 + retopo + Faceit    ← VARIANTE OPCIONAL (pós-R4, 1–2 personagens)
       ✓ identidade única real (ex.: Dona Rosa idosa)
       ✗ ~1 dia/personagem; retopo obrigatória; rig facial manual
```

**Gate de escolha (fim do R1):** gerar o MESMO personagem (ex.: `carla_dengue`)
nas rotas B1 e B2 → mesmo screenshot → juiz decide. Critérios objetivos:
(a) expressões faciais legíveis a 3 m de câmera; (b) tris/FPS dentro do budget;
(c) esforço de recolor/shapekey ≤ 1h por personagem; (d) licença comercial OK.

---

## 5. Fases R0–R6 (cada fase = comando executado + print + veredito do juiz)

### R0 — Baseline e limpeza (0.5h)
- [ ] Remover `public/models/npc_zero.glb` (resto de teste, falha validação, sem
  referência no código — pendência já registrada no Master §v3).
- [ ] Registrar baseline: `node scripts/shot3d.mjs "carla_dengue,nelson_infarto" /tmp/base_trilhaB.png`
  + veredito do juiz salvo neste doc (§9). É a nota a bater.
- **Gate:** baseline arquivado; nenhum GLB válido removido.

### R1 — Aquisição da base humana rigada (0.5–1 dia)
- [ ] Baixar/gerar **2–3 candidatas B1 (VRM 1.0)** — VRoid Studio / Avaturn /
  exemplo oficial pixiv — e **1 candidata B2 (RPM)**, corpo neutro A-pose.
- [ ] Critérios por candidata: VRM 1.0 (não 0.x), blendshapes ≥ 15 (ideal ARKit-52),
  tris ≤ 80k, esqueleto humanoide padrão, **licença registrada** (tabela §8).
- [ ] Carregar cada uma via `loadGLBFPatient` em `test-avatar3d.html` (luz do jogo)
  → screenshot → juiz.
- **Gate:** exatamente 1 rota escolhida (§4) + 1 base eleita; decisão anotada aqui.

### R2 — Reconstrução de identidade (1–2 dias) — *a "alma" dos 17*
- [ ] **Tipo corporal/idade via shapekeys:** criar (Blender, no rig da base)
  `body_fat/body_thin/body_muscle/age_elder` (e variações de ombro/quadril por
  `gender` do template do Master §3). Mapear cada caso → shapekey weights.
- [ ] **Recolor das paletas** (`skin/hair/shirt/pants/shoes` de
  `scripts/blender/gen_characters.py`): sobrescrever `material.color` da base no
  runtime (mesma ideia do `setStyle` do procedural) ou re-exportar texturas por
  personagem — escolher o que o juiz aprovar primeiro.
- [ ] **Cabelo:** a base deve permitir troca de penteado (mesh de cabelo por estilo
  `short/long/bun` reaproveitada da base) — penteado é identidade clínica visual.
- [ ] Manter nomes de material (`skin`, `eye`, `iris`, `hair`...) para o sheen do
  `loadGLBFPatient` continuar funcionando sem alteração de código.
- **Gate:** paleta de 3 casos (`carla_dengue`, `nelson_infarto`, `dona_rosa_hipotensao`)
  reconhecível; juiz distingue idade adulta vs idosa; ~1h/personagem ou menos.

### R3 — Retarget das 5 Actions clínicas (1–2 dias)
- [ ] Baixar 5 clipes Mixamo **in-place** (Idle, dor no peito, fraqueza/curvado,
  cabeça baixa/discomfort, embarasso) para o esqueleto da base.
- [ ] Caminho A (preferido — mantém contrato puro): retarget+bake no Blender
  (NLA → 1 Action por clip, lições Blender 5.2 do Master §13) → GLB com as 5
  Actions nomeadas → `validate_character.py` passa sem mudança.
- [ ] Caminho B (fallback): retarget no runtime com `three-vrm`
  (`loadMixamoAnimation` → clip por VRM) — conferir API da versão instalada.
- **Gate:** `python3 scripts/validate_character.py <novo>.glb` → 5 clips;
  smoke F2/F3/F4 chega ao DSF com `setPose` OK; 0 pageerror.

### R4 — Expressões clínicas (dor 0–10) (1–2 dias) — *diferencial do FarmaCheck*
- [ ] Driver central `src/scene/expressionDriver.js`: `painLevel(0..10) → pesos de
  blendshapes` (browDown/browRaise, mouthFrown, eyeSquint, jawOpen...) com
  damping; pallor/cianose via `material.color.lerpColors()` (já previsto no
  pipeline doc F4).
- [ ] Rota B1: expressões via VRM 1.0 (VRMExpressionManager, three-vrm).
  Rota B2: morphs ARKit via `morphTargetDictionary` no GLTFLoader puro.
- [ ] Respiração procedural e blink mantidos (portar do procedural p/ o driver).
- **Gate:** 3 níveis (dor 2, 6, 9) distinguíveis pelo juiz em screenshot;
  `setPose` + dor combinam sem conflito (clip de corpo + morphs de face coexistem).

### R5 — Otimização web (1 dia)
- [ ] `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2`
- [ ] `gltf-transform inspect` dentro do budget (§3) + glTF-Validator 0 erros +
  `renderer.info.render.calls ≤ 30` + FPS alvo medido (não estimado).
- **Gate:** budgets OK em desktop e mobile mid-range (Playwright + throttling).

### R6 — Produção dos 17 + integração + documentação (1–2 dias)
- [ ] Batch: aplicar R2/R3 aos 17 (15 casos + 2 atendentes + `paciente.glb`) —
  1 processo Blender por personagem com animação (Master §13).
- [ ] `swapAvatar` preserva cadeia de fallback (novo avatar → v3 atual → procedural).
- [ ] Atualizar **`PLANEJAMENTO_MASTER_3D.md`** (estado + template de config da
  base humana) e **`IMPLEMENTACAO_TRACKER.md`** (M2.5 → sub-seção Trilha B).
- [ ] Commit: `feat(3d): trilha B base humana (R0–R6)`.
- **Gate:** 17/17 validados + smoke completo + veredito final do juiz
  ("parece gente de verdade") registrado em §9.

> **Total estimado: ~1 semana de sessões.** Hunyuan (B3) é um pós-projeto separado,
> só se o juiz ainda achar identidade "genérica demais" após R6.

---

## 6. QA visual (loop obrigatório, reuso total)

```bash
# 1. screenshot do modelo/cena
node scripts/shot3d.mjs "carla_dengue" /tmp/modelo.png --pose idle
# 2. juiz de visão local (llama.cpp :8081, Qwen multimodal)
python3 scripts/vision_judge.py /tmp/modelo.png
# 3. iterar (R2 recolor/shapekey, R4 expressões) até "realista / proporcional / pele convincente"
```

Regras: **nenhuma fase avança sem veredito registrado** (§9); comparar sempre com
o baseline do R0; prompts do juiz focados em proporção, pele, material, luz e
"o que está feio".

---

## 7. O que permanece valendo (não descartar)

| Ativo | Uso na Trilha B |
|---|---|
| Render atual (AgX, rim, sheen, contato, walk-in) | ~50% do look já conquistado — mantém |
| `loadGLBFPatient` + fallback em cadeia | Contrato de entrada de todo avatar novo |
| `validate_character.py` + smoke F2/F3/F4 + `farmacheck_qa.mjs` | Gates de qualidade idênticos |
| `gen_props.py` + props/cenário v3 | Fora do escopo deste plano — já aprovados |
| Lições Blender 5.2 (Master §13) | Direto aplicáveis ao retarget/bake (R3) |
| Templates de config YAML (Master §3) | Formato das configs por personagem |
| Hunyuan/ROCm (`PLANEJAMENTO_3D.md` §3) | Variante B3, pós-R4, sob demanda |
| Skill `pipeline3d_web` + banco de skills | Boilerplate three-vrm/KTX2 entra lá no R5 |

---

## 8. Licenças (bloqueio de aceite)

| Ferramenta/asset | Licença | Ação |
|---|---|---|
| three-vrm (pixiv) | MIT | OK — registrar versão |
| VRoid Studio / modelos VRM | Verificar termos por modelo (uso comercial) | Anotar origem + licença por base |
| Ready Player Me | Termos comerciais (self-hosted GLB permitido) | Revisar antes do gate R1 |
| Mixamo (clipes) | Grátis c/ conta Adobe — termos de uso | Anotar conta/uso |
| Hunyuan3D-2.1 (se B3) | Licença Tencent (uso comercial restrito) | Checar antes de qualquer uso |

Regra do projeto (`PLANO_PIPELINE_REALISTA_3D.md` §8): relatório de licenças por
ferramenta é critério de aceite.

---

## 9. Log de vereditos do juiz (preencher por fase)

| Data | Fase | Alvo | Veredito | Print |
|---|---|---|---|---|
| 09/09/2026 | R0 | baseline v3 (`carla_dengue`, `nelson_infarto`) | *(a preencher)* | *(a preencher)* |
| *(R1…R6)* | | | | |

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Base VRM com cara de anime (MToon) | Upgrade de material no runtime (MeshPhysicalMaterial + sheen já pronto) — gate R1 decide se basta |
| Base com >80k tris ou >8 MB | `gltf-transform` meshopt+KTX2 (R5); se não couber, trocar de base no R1 |
| Retarget Mixamo não casa com VRM/humanoid | Caminho A (bake Blender) é o plano; Caminho B (runtime three-vrm) é o fallback |
| Identidade "genérica" (mesma base × 17) | Shapekeys corporais + penteados + paletas (R2); se insuficiente → B3 (Hunyuan) em 1–2 ícones |
| Regressão no jogo | Fallback em cadeia intocado; swap por personagem (nunca em lote sem validar) |
| Licença comercial | §8 como gate de aceite |
