# 🧊 FarmaCheck — Planejamento Master 3D (personagens, cenário, realismo)

> **Versão:** 1.0 · **Data:** 08/09/2026 · **Branch:** `v3-rewrite`
> **Fonte de verdade:** `docs/PLANEJAMENTO_3D.md` (milestones G0–G6) +
> `docs/PLANEJAMENTO_GAME.md` (GN para a pipeline geral) + este documento.
> **Objetivo deste doc:** registrar o que foi feito + servir como **template
> reutilizável** para adicionar qualquer novo personagem, prop, cenário ou fase 3D
> no futuro — sem reinventar de cada vez.

> **Status G5 (08/09/2026):**
> `gen_characters.py` → 17 personagens validados (5 clips cada) +
> `pharmacy.js` piso PBR, cartazes, banner "FarmaCheck", ambiente + rua noturna.
> Validação: build limpo + smoke F2/F3/F4 OK + Playwright sem pageerror.
> **Pendentes:** G0 (Hunyuan via IA) · G1 (sheets SDXL) · detalhes manuais (hands,
> texturas) · dinâmica de fila/pegar-medicamento/pov (G5+).

---

## 1. Visão geral

### 1.1 O que é o pipeline 3D do FarmaCheck

- **Personagens 3D:** cada caso do `cases.js` tem um `.glb` individual com hierarquia
  de partes animada por 5 **Actions** nomeadas (Idle/Pain/Weakness/Discomfort/Embarrassed) —
  contrato exato do `loadGLBFPatient` (`src/scene/patient.js`).
- **Props da farmácia:** balcão, gôndolas, vitrine, PC, mesa TLAC, etc. — `.glb`
  PBR com materiais, emissive, vidro, etc.
- **Cenário/atmosfera:** piso cerâmico PBR, paredes, madeira, luzes, billboard,
  post-processing, ambiente PBR, exterior noturno visível pela porta.
- **Pipeline (Blender headless):** geração de personagens + props via Blender 5.2
  scripts + diferenciação para Hunyuan (IA) quando disponível.
- **Pipeline de validação:** validação automática de clips/tamanho/tris/GLTF +
  Playwright smoke (F2/F3/F4) + verificação de pageerror.

### 1.2 Caminho completo de um personagem

```
look CFG em YAML/JS (id, gender, cores, estilos) →
  Blender (gênero × atuendo × postura de base) →
  GLTF export (Actions: Idle/Pain/Weakness/Discomfort/Embarrassed) →
  validação automática (clips, escala, size, name, tris) →
  public/models/<CASE_ID>.glb →
  loadGLBFPatient (fallback em cadeia: caso → paciente.glb → procedural) →
  swapAvatar no startCase → entrada no jogo
```

### 1.3 Caminho completo de um prop

```
look CFG em YAML/JS ou Blender de mão →
  Blender (geometria PBR/texturas) →
  export GLTF (sem animation, análise de material/roughness/metalness/transparency) →
  validação (size, name, material mapeado) →
  public/models/prop_<NOME>.glb →
  propFromGLB no pharmacy.js (fallback procedural: mantém no lugar se faltar) →
  cena 3D
```

### 1.4 Caminho completo de uma cena/atmosfera

```
look cfg → Blender (iluminação · post-processing · ambiente · ambiente PBR) →
  validação (ruído de luz, sombras, bloom, reflectividade) →
  src/scene/pharmacy.js (ou o arquivo do cenário) →
  buildPharmacy(scene, addTicker, renderer) → runtime
```

### 1.5 Pipeline de validação

1. **Validação automática de GLB:** parser Python (struct + json) para clips,
   tamanho esperado, escala/ativos.
2. **Playwright smoke (F2/F3/F4):** instalar Paciente → clique em botões → verificar
   APIs game (bulário, TLAC, DSF, setPose, scene).
3. **Verificação de pageerror:** Playwright `page.on('pageerror')` + verificar
   status das respostas GLB (200) e `setPose` sem erro.
4. **Validação de performance:** ≥ 50 FPS em cena, sem problema de contexto.

---

## 2. Arquitetura de pipeline 3D (como funciona, para reusar)

### 2.1 Blender headless na máquina

- **Blender 5.2.1 LTS** (snap) — `blender -b --python <script> -- --args`
- **Pipote:** `scripts/blender/gen_characters.py` (elenco + props) e
  `scripts/blender/gen_props.py` (props puros) — o script de `gen_props.py` funciona
  com batches em processo único; o de personagens precisa de um processo por personagem.
- **APIs Blender 5.2 que mudaram** (lições do pipeline — registrar em
  `banco_skills/threejs_glb_rig_poses`): `Action.fcurves` → `layers[i].strips[j].channelbags[k].fcurves`;
  `ad.action_slot` para definir o slot; `animation_data.tracks` → `.nla_tracks`;
  slot.nome → `getattr(slot, 'name_display', '?')` para imprimir; exporter só
  com action **ativa** atribuída (`obj.animation_data.action = actions['Idle']`).
- **Purga entre personagens:** um processo Blender por personagem é o mais robusto;
  se rodar vários no mesmo processo, deletar objetos antes (`object.delete()`) e
  remover actions incondicionalmente (`bpy.data.actions.remove(a)`). `use_fake_user`
  impede a remoção pelo filtro `users == 0`.
- **Parsing de GLB para validação:** `open(path,'rb')` → magic `data[:4]==b'glTF'`
  (NÃO `[4:8]` que é a versão), JSON chunk começa em 20, length em `[12:16]`:
  `json.loads(data[20:20+struct.unpack('<I',data[12:16])[0]])`.

### 2.2 GAN de personagens

- **Hunyuan3D-2 / 2mini / 2.1** via GPU AMD 12 GB (ROCm/gfx1031), variante
  shape+texture cabe em ~9 GB (low_vram). docs: `hunyuan3d_geracao_3d`,
  `hunyuan3d_rocm_12gb`.
- Quando trabalhar com Hunyuan: retopo obrigatória antes do rig (não pular);
  rig NLA com as 5 Actions; export GLB com ativação de ação antes do export;
  validação automatizada como acima.

### 2.3 Validação automática

- Script de validação: Python deduzido do parser de GLB acima — checa `clips`,
  `size` (escala humana ~1.7m), `node.mesh ~= expected`.
- Testes Playwright: navegar → carregar → verificar APIs do jogo (bulário, TLAC,
  DSF, setPose, scene).
- Verificação de pageerror: Playwright `page.on('pageerror')` + verificar
  status das respostas GLB (200) e `setPose` sem erro.
- Validação de performance: ≥ 50 FPS em cena, sem problema de contexto.

### 2.4 Render/Visualização

- **Playwright screenshot:** `page.screenshot({path: '/tmp/cena_<NAME>.png'})` —
  captura cena para validar visual.
- **Playwright track de respostas GLB:** `page.on('response', r => if r.url().includes('.glb') ...)`.



## 3. Template de configuração de personagem (YAML/JS)

Cada personagem é definido por uma **configuração de look** — copie este template
em `scripts/config/<CASE_ID>.yaml` (ou JS) e adicione no `scripts/blender/gen_characters.py`
como entry nova.

```yaml
# id: deve ser o CASE_ID de cases.js (troca o avatar no startCase)
id: carla_dengue       # → public/models/carla_dengue.glb
gender: female          # atuendo feminino/smaller shoulders etc.
skin: 0xd9a066          # pele 0xRRGGBB (cor base)
hair: 0x1a1a1a          # cabelo 0xRRGGBB
hair_style: long        # short | long | bun | baggy | up
eyes: 0x3b2a1a          # íris (opcional, padrão castanho)
shirt: 0x2ec4b6         # camisa 0xRRGGBB
pants: 0x37414b         # calça 0xRRGGBB
shoes: 0x22262a         # sapato (opcional, padrão 0x22262a)
belt: false             # cinto (opcional)
buttons: true           # botões de camisa (opcional)
lips: 0xa86050          # lábios (opcional)
jewelry: false          # pulseira/collar (opcional)
# postura de base para o Idle (opcional — loop padrão se omitido)
idle_pose: default
```

**Regras para adicionar um novo personagem:**

1. Copie o template, preencha `id`, `gender`, cores, estilos.
2. Adicione na lista `CHARACTERS = [...]` em `scripts/blender/gen_characters.py`
   (ou num arquivo separado de config que o script importe).
3. Rode: `blender -b --python scripts/blender/gen_characters.py -- --out public/models`.
4. Valide: `python3 validate_glb.py public/models/<CASE_ID>.glb` → 5 clips,
   escala ~1.7m, <12k tris.
5. Se passar → commitar o GLB + validar no jogo (smoke F2/F3/F4 ou ativação do
   `swapAvatar` no main.js).
6. Se falhar → corrija a configuração (cores, gender mismatch → poucos tris?
   gender → nome do glb errado?) e rerode.

---

## 4. Template de prop (YAML/JS → Blender → GLB)

```yaml
# id: nome do prop (sem .glb, sem caminho — o script adiciona)
id: prop_balcao       # → public/models/prop_balcao.glb
# tipo: prop | personagem | ambiente | UI
type: prop
# geometria: Blender primitivo por padrão (Box/Cylinder/Sphere/Capsule)
# materiais: lista de primitivas com cor/roughness/metalness/transparency emissive
materials:
  - name: metal
    color: 0x8d99ae
    roughness: 0.3
    metalness: 0.8
  - name: wood
    color: 0x8a5a33
    roughness: 0.35
    metalness: 0.0
# posição (raiz, em m) — pivô no centro, desde que não afete rotações de animação
transform:
  translate: [0, 0, 0]
  scale: [1, 1, 1]
# validação: count de primitivas, size esperado
```

**Regras para adicionar uma nova prop:**

1. Defina a geometria (primitivas Blender: Box, Cilindro, Esfera, Capsule).
2. Rastreie os materiais (cor, roughness, metalness, emissive se aplicável).
3. Coloque posição/transformação na definição.
4. Roda o script de props — o GLB sai com geometry + material.
5. Valide: geometry count, size esperado, file size ≤ ~8 MB.
6. Adicione no `pharmacy.js` via `propFromGLB('models/<NOME>.glb', fallbackGroup, scene, { pos, rotY })`.

---

## 5. Template de cena/atmosfera (GBL → lighting · pós-processo)

Referência: `src/scene/pharmacy.js` para a farmácia + `src/scene/fx.js` para
post-processing.

**Campos de uma cena:**

- **Iluminação:** hemisphereLight (base ambiente fria + frio/cálido) + directionalLight
  (chave, sombras, shadow.camera) + pointLight (acentos).
- **Pós-processo:** EffectComposer, RenderPass, UnrealBloomPass (threshold, strength,
  radius), ShaderPass (vinheta, grain, saturate).
- **Ambiente PBR:** PMREMGenerator.fromScene(new RoomEnvironment(), 0.04) →
  scene.environment (se o material for PBR).
- **Exterior (opcional):** skybox via canvas/textura + edifícios silhuetas + luzes
  espalhadas + poste de luz.

**Regras para criar/alterar uma cena:**

1. Defina iluminação principal (hemisphere + chave + acentos).
2. Se PBR, adicione ambiente (RoomEnvironment + PMREMGenerator).
3. Pós-processo: Bloom (threshold ~0.4-0.7, strength ~0.4-0.9), Vinheta (amount
   0.35-0.45), Grain (0.03-0.05).
4. Se cenário — adicione exterior (sky + edifícios + luzes).
5. Valide: render sem erro, sombras visíveis, luzes em posições esperadas,
   performance esperada (≥ 50 fps).
6. Commitar + validar na cena (Playwright ou vivo).

---

## 6. Personagens implementados (G2/G3 — elenco)

### 6.1 Elenco principal (casos)

| CASE_ID (cases.js) | Personagem (.glb) | Gender | Pele | Cabelo | Estilo | Camisa | Calça |
|---|---|---|---|---|---|---|---|
| nelson_infarto | nelson_infarto.glb | male | 0xe8b48c | 0x9a9a9a | short | 0x8d99ae | 0x4b4e57 |
| marina_amoxicilina | marina_amoxicilina.glb | female | 0xf1c9a5 | 0x1f1a17 | long | 0x74c69d | 0x37414b |
| jose_gripe | jose_gripe.glb | male | 0xd9a066 | 0x8a7f6d | short | 0xb08968 | 0x4b4e57 |
| ana_coriza | ana_coriza.glb | female | 0xe8b48c | 0x4a3728 | long | 0x9fd8ff | 0x57534e |
| clara_cefaleia | clara_cefaleia.glb | female | 0xd9a066 | 0x23140e | long | 0xe07a5f | 0x2f3e46 |
| paulo_dor_lombar | paulo_dor_lombar.glb | male | 0xb87a4b | 0x1f1a17 | short | 0x6d9dc5 | 0x37414b |
| joao_queimacao | joao_queimacao.glb | male | 0xf1c9a5 | 0x3f3a34 | short | 0xd7d3cb | 0x4b4e57 |
| helena_avc | helena_avc.glb | female | 0xf1c9a5 | 0xcfcfcf | bun | 0xcdb4db | 0x57534e |
| dona_rosa_hipotensao | dona_rosa_hipotensao.glb | female | 0xe8b48c | 0xd8d3cb | bun | 0xffc8dd | 0x57534e |
| carlos_asma | carlos_asma.glb | male | 0x8d5a3a | 0x14100c | short | 0x2ec4b6 | 0x37414b |
| bia_apendicite | bia_apendicite.glb | female | 0xd9a066 | 0x2e2a25 | long | 0xffd166 | 0x3d5a80 |
| carla_dengue | carla_dengue.glb | female | 0xd9a066 | 0x1a1a1a | long | 0x2ec4b6 | 0x37414b |
| roberto_dispepsia | roberto_dispepsia.glb | male | 0xe8b48c | 0x2e2a25 | short | 0xd7d3cb | 0x3d5a80 |
| catia_dermatite | catia_dermatite.glb | female | 0xf1c9a5 | 0x6b4a2f | bun | 0xf28f3b | 0x57534e |
| paciente | paciente.glb | male | 0xd9a066 | 0x2e2a25 | short | 0x8b8378 | 0x37414b |

### 6.2 Atendentes (fundos)

| CASE_ID | Personagem | Gender | Pele | Cabelo | Estilo | Camisa | Calça | Cinto |
|---|---|---|---|---|---|---|---|---|
| atendente_balcon | atendente_balcon.glb | female | 0xd9a066 | 0x2e2a25 | bun | 0xf5f5f0 | 0x37414b | ✅ |
| atendente_gondola | atendente_gondola.glb | male | 0x8d5a3a | 0x14100c | short | 0x0d9488 | 0x4b4e57 | ✅ |

---

## 7. Props implementados (G4 — cenário)

| NOME (id) | Arquivo | Tipo | Materiais/Notes |
|---|---|---|---|
| prop_balcao | prop_balcao.glb | prop | corpo (4.6×1.0×0.75) + tampo madeira + emissive teal + kick |
| prop_gondola | prop_gondola.glb | prop | 4 prateleiras + artigo de medicamento (cores) + emissive header |
| prop_vitrine | prop_vitrine.glb | prop | metal back/bottom/top + vidro lateral/frente + luz emissiva teal |
| prop_pc | prop_pc.glb | prop | monitor escuro + tela emissive (BULÁRIO) + teclado |
| prop_mesa | prop_mesa.glb | prop | tampo madeira + pernas + bandeja teal + casete branco + lanceta/azul + algodão + frasco |

---

## 8. Cenário implementado (G5 — farmácia noturna + rua)

### 8.1 Farmácia

- **Piso:** cerâmico PBR (roughness 0.34, metalness 0.03) — veios de brilho, manchas,
  grout. (tileTexture/tileMaterial em `pharmacy.js`)
- **Paredes:** textura de pintura com rodapé branco integrado.
- **Madeira balcão:** veios + nós ricos.
- **Luzes:** hemisphere (base fria 0xdfe9f5/0x2a2622) + chave quente (directional,
  2048px shadow map, 0xfff2e0, int 2.0) + fill quente (point, 0x9fd8ff, 12, 22) +
  warm acento (point, 0xffd9a0, 7, 13) + LED frio na coifa + góndola/warm + vitrine
  cool. Toque emissive no banner (teal 0x0f766e, int 0.45).
- **Post-Processing:** VignetteShader (amount 0.38, grain 0.03, boost 0.05) +
  UnrealBloomPass (threshold 0.65, strength 0.42, radius 0.6) + RenderPass +
  dust particles dinâmico.
- **AmbientePBR:** RoomEnvironment via PMREMGenerator (environmentIntensity 0.5).
- **Exterior:** via porta de vidro — rua noturna com luzeiros + edifícios + poste.
- **Badge "FarmaCheck":** banner com incentivo emissivo (anti-agente textual: 4.6×0.66 m).

### 8.2 Cartazes (3)

- Vacinação: "Protegí a quem amas"
- Teste Rápido: "Resultado em minutos"
- Farmacêutica: "Sempre ao teu lado"

---

## 9. Pipeline de futuro (o que adicionar depois — priorizadas)

### Prioridade 1 (G5 — completar o realismo)

- [ ] Farmacêutico POV: mãos/antebraços modelados com anim (use rig com armature
  e animar pegar-medicamento).
- [ ] Vitrine refrigerada: gelo/frio com emissive + texturas de vidro.
- [ ] Letreiro "FarmaCheck" → já feito.
- [ ] Partículas/brua de luz na vitrine.
- [ ] 2-3 personagens com retopo + rig Mixamo + textura más detallada (Olhos/
  sobrancelhas/boca + drapeado roupa).
- [ ] Uniformes más detalles (camisa, crachá, laços, orgao).

### Prioridade 2 (G3/G2 — completar o personaje)

- [ ] Avatars 3D con animación de fila (walk loop) + selcción con tecla E.
- [ ] Pega medicamento (gincando mano, animación de pega).
- [ ] Balconista jueable (movimiento libre atrás do balcón).
- [ ] Cámara POV.

### Prioridade 3 (G1 — sheets + generaión por IA)

- [ ] Hunyuan3D-2 (via GPU 12 GB, ROCm) → genera shapes → retopo Blender.
- [ ] Sheets SDXL (ComfyUI) → prompt por personaje → referencia de look.

### Prioridad 4 (G6 — realismo mestres)

- [ ] Texturas PBR (ComfyUI + PBR) pela piso/parede/madeira/vidro.
- [ ] Detalhes manuais: olhos/boca/drapeado/hands en más personajes.

---

## 10. Checklist de validación (para cualquier nuevo 3D)

### A. Personaje

- [ ] 5 clips: Idle, Pain, Weakness, Discomfort, Embarrassed
- [ ] Livre de rotulos (.glb nomeado <CASE_ID>.glb)
- [ ] Pivô base (chan, entre os pies) — scaler 1.0
- [ ] Scale: ~1.7m (≤2m)
- [ ] Tri count: <30k
- [ ] FBX/GLTF emissive mapeado se emissivo necessario
- [ ] Size ≤ 8 MB, compact → DRACO se > 4 MB
- [ ] Testar loadGLBFPatient('models/<CASE_ID>.glb', scene) → OK
- [ ] Testar swapAvatar + startCase → avatar muda + setPose('mao_no_peito') sem erro
- [ ] Render Playwright → 0 pageerror

### B. Prop

- [ ] 1-10k tris
- [ ] Pivô: base ou centro (de acordo com posição esperada)
- [ ] Materials mapeados (roughness/metalness/transparency) em props PBR
- [ ] Emissive mapeado se emissivo
- [ ] GLB ≤ 8 MB, compact → DRACO se > 4 MB
- [ ] Testar propFromGLB(): fallback procedural visível ate carregar, fallback
  continua se falhar
- [ ] Render: prop visível, posição correta, luzes/reflexos

### C. Cena/Atmosfera

- [ ] Iluminação: hemisphere + chave + acentos
- [ ] Se PBR: RoomEnvironment + PMREMGenerator + environmentIntensity
- [ ] Post-Processing: Bloom (threshold/strength/radius) + Vignette (amount/grain/boost)
- [ ] Performance: ≥ 50 fps sem erro de render
- [ ] Export: sem erro de contexto, shadow map ok, volume de luz visível
- [ ] Render em cena: luzes, reflexos, atmosfera visíveis

### D. Documentação (obrigatorio para o plan)

- [ ] Template de config YAML/JS salvo em `scripts/config/<CASE_ID/NOME>.yaml`
- [ ] Novo entry em `CHARACTERS` (ou `PROPS`) para o script de geração
- [ ] Script de geração rodado (Blender) con sucesso
- [ ] Validación automatica (clips, size, tris) + Playwright (se personaje)
- [ ] Novo personaje/prop/cena documentado en `PLANEJAMENTO_MASTER_3D.md`
- [ ] Commit con mensaje: `feat(3d): <tipo> <nome> (<CASE_ID/NOME>)`

---

## 11. Como reutilizar para novos modelos

### Criar novo personaje

```bash
# 1. Copiar o template de config (scripts/config/template_person.yaml → scripts/config/<CASE_ID>.yaml)
cp scripts/config/template_person.yaml scripts/config/<CASE_ID>.yaml
# editar: id, gender, cores, estilos

# 2. Adicionar na lista CHARACTERS no gen_characters.py (ou importar archivo)
# 3. Generar:
blender -b --python scripts/blender/gen_characters.py -- --out public/models
# 4. Validar:
python3 - <<'EOF'
import struct, json, sys
BASE = {'Idle','Pain','Weakness','Discomfort','Embarrassed'}
path = 'public/models/' + sys.argv[1]
d = open(path, 'rb').read()
ln = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20+ln])
clips = [a['name'] for a in j.get('animations', [])]
missing = BASE - set(clips)
print('OK' if not missing else 'FALHA: ' + str(sorted(missing)))
print('clips:', len(clips), '| size:', len(d)//1024, 'KB')
EOF
# 5. Validar no jogo:
node scripts/smoke-f2f3f4.mjs (ou Playwright por cima)
```

### Crear nova prop

```bash
# 1. Copiar template de prop (scripts/config/template_prop.yaml → scripts/config/<PROP_NAME>.yaml)
# editar: id, geometry, materials

# 2. Adicionar no script de props ou criar novo script de props
# 3. Generar:
blender -b --python scripts/blender/gen_props.py -- --out public/models
# 4. Validar:
python3 - <<'EOF'
import struct, json, sys
path = 'public/models/' + sys.argv[1]
d = open(path, 'rb').read()
ln = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20+ln])
print('GLTF:', 'OK' if d[:4]==b'glTF' else 'FALHA')
print('nodes:', len(j.get('nodes',[])))
print('size:', len(d)//1024, 'KB')
EOF
# 5. Adicionar na cena (pharmacy.js):
propFromGLB('models/<PROP_NAME>.glb', fallbackGroup, scene, { pos: [x,y,z], rotY: r })
```

### Crear nova cena/atmosfera

```bash
# Editar o archivo do cenário (src/scene/pharmacy.js ou novo archivo)
# Adicionar: iluminação + ambiente + pós-processo + exterior
# Validar:
node scripts/smoke-f2f3f4.mjs
# + Playwright para render sem erro
```

---

## 12. Como estender para novas fases/dinamicadores

- **FARMÁCIA:** já presente en `src/scene/pharmacy.js`. Reusar para:
  - Nova loja/farmácia (cores, luzes, layout)
- **Novo personaje para nova fase:** usar template de config + gen_characters.py
  + validación.
- **Novo prop para nova fase:** template de prop + gen_props.py + validación +
  propFromGLB() na cena.
- **Novo ambiente (rua, consultório, etc.)**: copiar `outdoor()` como template de
  ambiente → adicionar luzes + edificações + poste + fonts de luz.

---

## 13. Notas para manutenção

- **Personajes con animación:** 1 proceso Blender por personaje (evita
  `use_fake_user` acumulando actions e renomando -> `.001`).
- **Props sin animación:** batch seguro no mesmo proceso (script de props).
- **Perfomance:** se tri count subir, DRACO compress (via export glTF con draco).
  Se AWS/file size for critico, DRACO + KTX2 textures.
- **Emissive mapeado:** emissive map de banner/texturas via shader uniform
  (`emissiveMap`) no Three.js, não apenas material emissive.
- **Materiais PBR:** roughness/metalness + emissive (prop propósito) + environment
  (RoomEnvironment) para reflexos → luzes de ambiente + emissive luzes.
- **Blender 5.2:** APIs que mudaron — Action.fcurves → layers/strips/channelbags/fcurves;
  action_slot para definir o slot; animation_data.tracks → nla_tracks; slot.name →
  getattr(slot, 'name_display', '?') para imprimir; exporter só com action
  ativa atribuída.

---

## 14. Commits de referencecia (para rastrear estados do pipeline)

- `7438d62` feat(3d): elenco 15 personajes + 5 props (Blender 5.2 headless)
  — `scripts/blender/gen_characters.py` + `gen_props.py` + `pharmacy.js` G4 +
  `main.js` swapAvatar.
- `38608f3` threejs_glb_rig_poses — lições Blender 5.2 (slots/layers/fcurves,
  action ativa no export, purga fake_user, parsing GLB).
- `1579507` planejamento 3D (milestones G0–G6).
- `a715aeb` · `6402472` · `2762a8d` · `e90c512` — skills novas e subagentes gratís.
