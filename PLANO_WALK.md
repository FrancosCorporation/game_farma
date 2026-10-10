# PLANO_WALK.md — Resolver o andar da Ana de uma vez (09/10/2026)

> **Feito por:** sessão opencode (modo revisão/diagnóstico), a pedido do PO.
> **Escopo:** a personagem principal anda deformada há 38 rodadas. Este plano
> identifica **por que o loop não fecha** e define **a única trajetória que fecha**.

---

## 1. O que está acontecendo (diagnóstico)

O PO relata: *"o modelo está pronto e limpo, mas quando edita/anda fica cagado"*.

Isso **não é** um problema de modelo bonito/feio. É um problema **de animação
envolver ossos que o rest do rig não espera**. Comprovei por medição direta:

### 1.1 O contrato do modelo que FUNCIONA (`ana_clasica.glb`, em produção)

| Propriedade | Valor | Origem |
|---|---|---|
| `asset.extras.walkSpeed` | `1.684` | pipeline grava; runtime lê (`patient.js:93`) |
| `asset.extras.walkAdvance` | `1.7402` | idem (`patient.js:95`) |
| Animações | `["Walk","Idle"]` | nomes casam com `mixer.clipAction(name)` |
| Skin joints | 65 | rig Mixamo |
| Walk — rotações VIVAS | **17 canais** | medição nesta sessão |
| Idle — rotações VIVAS | **10 canais** | idem |
| Hips Walk — translação | **constante (pino in-place)** | idem |

O runtime (`patient.js`) calcula `timeScale = WALK_V / vClip` e desloca a raiz
por tween linear. **O contrato exige: clip in-place (sem root motion) + extras
com advance/speed.** Quando isso falha, a personagem "fica cagada".

### 1.2 Por que cada tentativa nova falha — a evidência

Medi os candidatos atuais com a mesma métrica:

| Arquivo | Walk rot. vivas | Hips translação (Walk) | Veredito |
|---|---|---|---|
| `ana_clasica.glb` (prod) | **17** ✓ | constante ✓ | **SÃO** |
| `ana_v38.glb` | 17 ✓ | (igual ao clasica — é um derivado) | andável |
| `ana_v40.glb` | **7** ✗ | constante | quase estátua |
| `test_v53.glb` (último Blender) | 40 | **y: −0.57 → +190.71** ✗✗ | **DOENTE** |
| `v50_final.glb` | 40 | (retarget, mesma família) | doente |

**`test_v53.glb` — o candidato mais novo da outra sessão — tem o Hips dando um
salto de ~191 unidades no eixo Y durante o Walk.** É a **exata** "doença de frame"
da Rodada 36 (Hips a −108.94 pulando 109 unidades), só que agora em Y. Qualquer
clipe que toque o esqueleto arremessa a pelve — a personagem estica, fica torta,
"cracha". Não é estética. É o clip **não nascer no frame do rig**.

### 1.3 A causa-raiz do loop infinito (38 rodadas)

A outra sessão fica **recusando a rota que funciona** e **reabrindo a rota que
sempre quebra**:

```
ROTA A (SEMPRE QUEBRA — Blender/hi3d/malha nova):     ROTA B (SEMPRE DEU CERTO — Mixamo):
malha IA (45 MB, 2M tris)                              malha A-pose/T-pose
  → simplify                                          → upload Mixamo (logado, skill SKILL_H)
  → esqueleto posicionado a mão (65 ossos)            → auto-rig gera o rig + os pesos JUNTOS
  → pesos: DataTransfer / bone-heat / KDTree          → download FBX (rig + clips Walk/Idle)
  → transplant de clips de OUTRO rig                  → fbx_merge_to_glb.py
  → болезнь de frame (Hips divergente)                → patch_final (extras, in-place)
  → DEFORMA                                          → FUNCIONA
```

**A lição de 30/09–03/10, registrada 5× no `progress.md`, é:** *o Mixamo nasce
num frame único e consistente — imune à doença de frame. Repetir skinning à mão
em malha de IA é quicksand.* A Rota A foi reprovada em **Rodada 21, 24, 30, 31,
34, 36, 38**. Mesmo assim a sessão atual voltou a ela (v49→v53).

**Segunda causa do loop:** cada "fix" é um script *one-shot* no `ana_work/` ou
`scripts/` que aplica uma correção a um arquivo e gera outro. Não existe
**pipeline reproduzível** — existe uma torre de ~30 scripts ad-hoc. Qualquer
recomeço perde as correções hard-won (in-place, straighten, damp, zero-head).

---

## 2. A decisão estratégica

**Parar de tentar skinning manual da malha hi3d.** O corpo novo é bonito parado,
mas sua pose (mãos na cintura, braços a ~28° do rig) é **incompatível
estruturalmente** com o rig do jogo — já provado em 4 abordagens diferentes de
pesos (DataTransfer, bone-heat proxy, 2-ossos-próximos, KDTree). O custo de
continuar é conhecido: mais uma rodada reprovada.

**Adotar a Rota B (Mixamo) como caminho canônico** — a mesma que produziu o asset
que está em produção e anda. E, para não perder o trabalho, **usar a malha nova
apenas se ela entrar na Rota B** (o Mixamo aceita a malha; o que ele não aceita é
pose invertida/escala errada — daí o `conv_glb_fbx.py` com pivô centrado).

### Critério de aceite (uma frase)
> A personagem anda no jogo, 1 ciclo completo, sem deformação (olho do PO +
> juiz), e o arquivo carrega **in-place** com `extras.walkSpeed` /
> `extras.walkAdvance` presentes.

---

## 3. Plano de execução — 4 frentes

### F0 — Estabilizar a produção (hoje, 30 min) — **JÁ É O ESTADO**

- Produção está em `ana_clasica.glb` (65 ossos, 17 canais vivos, extras OK).
- **Não tocar na produção até F2 passar no gate.** Qualquer "melhoria" nova
  morre em branch/`ana_work/`.
- Backup do aprovado: `ana_work/backup_ana_antiga.glb` (SHA `e5b04942…`) +
  imagem docker `game_farma:previous`.

### F1 — Construir o pipeline CANÔNICO reproduzível (a peça que falta)

O objetivo não é "mais um script". É **um comando que reconstrói o asset
inteiro do zero**, de forma determinística, em uma passada.

```
make_ana.mjs  (NOVO — orquestrador; um entry point, logs a cada passo)
  1. IN  : malha A-pose (GLB/FBX limpo, 1 mesh, escala em METROS, altura ~1.7m)
  2. RIG : FBX do Mixamo (auto-rig executado uma vez, logado — skill SKILL_H)
           ou, fallback determinístico: rig de referência aprovado (ana_clasica)
           importado e reaproveitado SOMENTE se o frame casar
  3. CLIPS: Walk + Idle transplantados POR ESPAÇO-MUNDO (fórmula do v50_build:
            L = inv(W_pai_alvo) · D_b · W_src, já validada matematicamente)
            + Hips translation PINADO no rest do alvo (mata a doença de frame)
            + extras { walkSpeed, walkAdvance } derivados do próprio clip
  4. GATE: roda F2 offline ANTES de escrever o arquivo
  5. OUT : ana_game.glb (in-place, extras, clips nomeados Walk/Idle)
```

**Regra de ouro (lição R3 e R24):** uma **única escrita** no GLB. Nunca
empilhar `gltf-transform` em cascata — isso corrompeu o sampler do Hips na
Rodada 3. Se precisar de outra correção, voltar no orquestrador e regenerar.

**Referências vivas (já testadas):**
- Retarget por espaço-mundo: `scripts/v50_build.mjs` (a matemática está certa; o
  bug foi o Hips漂 não ser pinado — corrigir no orquestrador).
- Extras: `scripts/patch_glb_extras.mjs`.
- Clips aprovados: `ana_work/ana_merged_source_250925.glb` (mocap cru, simétrico).

### F2 — Gate offline AUTOMÁTICO (nunca mais chegar deformado ao PO)

Script `scripts/gate_ana.mjs` — **falha o pipeline antes do deploy**. Copiar a
lógica que validei nesta sessão (está em `v50_forensic.mjs` + minha medição):

1. `Walk` existe e tem ≥ **15 canais de rotação com variação > 0.01** (alvo: 17).
2. `Idle` existe e tem ≥ 8 canais vivos (micro-sway aprovado).
3. **Hips translation no Walk: amplitude total ≤ 0.05 m** (in-place forçado).
4. `extras.walkSpeed > 0` e `extras.walkAdvance > 0`.
5. `skins === 1`, joints === 65, nós sem scale negativo, sem NaN.
6. **Zero canais de translação divergindo > 0.2 do rest** (o flag que pegou o
   `test_v53.glb` — é a mesma métrica que salvou a Rodada 36).

> **Esse gate é a coisa mais importante do plano.** A doença de frame é
> *detectável offline em 2 segundos*. Ela chegou ao PO dezenas de vezes só porque
> não havia gate — só probe flaky + juiz de visão (que o próprio progress.md
> descreve como "zero confiabilidade em prints do jogo", Rodada 35).

### F3 — QA in-game + juiz, só então deploy

1. Servidor isolado **próprio** (lição R29: as portas 4180/4181 eram de sessões
   mortas servindo assets velhos). Raiz auto-contida, `curl` no GLB + gate de
   vértices **antes** de abrir o browser.
2. Probe determinístico `tmp_probe_optA.tmp.mjs`: 1 ciclo de walk, telemetria
   (pés, cadência, solo, pageerrors).
3. **Captura de frames sequenciais** (lição R21: nunca screenshot pontual — a
   análise é visual em **sequência**, idle→walk→parada).
4. Juiz (`scripts/vision_judge.py`) + **olho do PO**. Ground truth = os dois.
5. Deploy só com aval explícito do PO, via `scripts/deploy.sh` (rollback
   automático + healthcheck).

---

## 4. Linha do tempo sugerida

| Frente | Duração | Dependência | Entregável |
|---|---|---|---|
| F0 | 30 min | — | produção intocada + backups verificados |
| F2 (gate) | 1–2 h | — | `scripts/gate_ana.mjs` rodando |
| F1 (pipeline) | 2–4 h | F2 | `make_ana.mjs` gerando asset que **passa no gate** |
| F3 (QA) | 1–2 h | F1 | prints + juiz; decisão do PO |
| deploy | 30 min | aval PO | `?v=N+1`, healthcheck 200, rollback pronto |

**Total realista: um turno.** Não é um problema de semanas — é um problema de
**parar de reinventar a rota**.

---

## 5. Regras duras (evitam recaídas)

1. **Blender nunca mais toca no asset final.** Re-deriva bind matrices e rest
   pose (R21, R24, R31). Se a malha precisar de geometria, o Blender trabalha na
   **malha crua** e o orquestrador (NodeIO) monta o GLB final.
2. **Malha de IA com pose "mãos na cintura" está PROIBIDA** como entrada do rig —
   é a causa-mãe da incompatibilidade (R31). Entrada = A-pose ou T-pose.
3. **Uma escrita só.** Qualquer segundo round-trip de gltf-transform é bug
   esperado (R3).
4. **Gate offline antes de qualquer olhar humano.** Deformação de frame é
   falha de máquina, não de gosto.
5. **Produção é sagrada.** Nenhum candidato a mais é deployado "pra ver como
   fica". Rollback existe, mas o PO já foi pego 3x (R30, R35, R37).
6. **Juiz de visão não é ground truth único** (R35: leu "DEFORMADA" em frames
   limpos e "NORMAL" nos mesmos estados). Sempre: gate numérico + frames
   sequenciais + olho do PO.

---

## 6. Estado dos artefatos (mapa para a próxima sessão)

| Arquivo | Papel | Status |
|---|---|---|
| `public/models/ana_clasica.glb` | **produção atual — anda** | ✅ intocável |
| `ana_work/backup_ana_antiga.glb` | backup do aprovado (SHA e5b04942) | ✅ |
| `ana_work/ana_merged_source_250925.glb` | mocap cru aprovado (fonte dos clips) | ✅ |
| `scripts/v50_build.mjs` | retarget espaço-mundo (matemática certa) | reaproveitar |
| `scripts/v50_forensic.mjs` | base do gate | reaproveitar |
| `scripts/patch_glb_extras.mjs` | injeção dos extras | reaproveitar |
| `SKILL_BANK/SKILL_H_RIG_MIXAMO_AUTO.md` | rota Mixamo end-to-end | **a via** |
| `ana_work/ana283_rexato.glb` | malha nova 283k (obra-prima parada) | só rosto/preview |
| `public/models/test_v53.glb` | último candidato | ❌ reprovado pelo gate (Hips 191 und) |
| `public/models/ana_v40.glb` | candidato intermediário | ❌ 7 canais só |

---

## 7. Resumo para o PO

> O modelo **não está com problema de bonito/feio**. O último candidato (`test_v53`)
> chega a **deslocar a pelve 191 unidades para cima** a cada ciclo de walk — é a
> mesma "doença de frame" de 6 rodadas atrás, que dá exatamente o efeito
> "esticada, torta, crachando". Isso é **detectável offline em 2 segundos** e
> **nunca teve um gate automático**.
>
> O plano: **(1)** não tocar na produção (hoje `ana_clasica` anda), **(2)** criar
> um **gate numérico** que reprova arquivo doente antes de qualquer humano ver,
> **(3)** substituir os ~30 scripts avulsos por **um pipeline só**
> (`make_ana.mjs`, uma passada, usando a matemática já validada do `v50_build`),
> e **(4)** só fazer QA visual/deploy do que passar no gate.
>
> A escolha estratégica é **parar de refazer skinning da malha hi3d à mão** —
> isso foi reprovado 7 rodadas seguidas por 4 técnicas de peso diferentes — e
> adotar a **rota Mixamo** (a que gerou o asset que funciona), usando a malha nova
> como **entrada** dela, nunca como objeto de skinning manual.
