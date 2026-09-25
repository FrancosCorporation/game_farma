# progress.md — log da sessão (14/09/2026)

## Sessão 21/09/2026 (retomada — "resolver o que falta para o jogo 3D rodar")

Objetivo: parar de planejar e entregar jogo jogável com evidência. Resultado: **gate de
boot 100% verde (desktop + celular)** e build/servidor/API validados.

### Bugs corrigidos (todos com evidência)

1. **Boot bloqueado — capa morta por ~10 s** (crítico, sintoma relatado pelo PO: "clico e não acontece nada").
   Causa: `src/main.js` tinha `await loadGLBFPatient('models/paciente_real.glb')` no topo do
   módulo → todo o wiring (capa, i18n, menu, `#btn-iniciar`, HUD) só rodava depois do download
   do GLB. Medido: `window.__farmacheck` só existia a **~10,3 s**.
   Correção: (a) avatar procedural entra na hora e o GLB realista assume em segundo plano
   (sem bloquear); (b) three.js + cena saíram para `src/app.js`, carregado por **import dinâmico**
   em `src/main.js` — a entry ficou com **13 kB** (antes 757 kB) e o clique na capa funciona em
   **258–303 ms**; (c) se o jogador fechar a capa antes da cena ficar pronta, o botão do menu
   mostra "Preparando o cenário…" (nunca fica um botão morto); (d) falha ao carregar a cena
   agora aparece no botão em vez de tela muda.
2. **Digitar na fase "Chegada"** não fazia nada e a mensagem era descartada. Agora o
   `#chat-input` fica desabilitado até o estado virar `ANAMNESE`.
3. **Trava em "Chegada"**: `await this.avatar.enter(...)` sem proteção — GLB com problema
   deixava o jogador preso. Agora é try/catch (a chegada é cosmética).
4. **Relatório final podia não aparecer**: `this.avatar.leave()` síncrono sem try/catch
   interrompia o debriefing. Agora é fire-and-forget com `.catch`.
5. **`initCapa()` não sinalizava prontidão** (sem como testar/observar o boot) → passou a
   publicar `data-capa-pronta` + `data-capa-pronta-ms`; `src/app.js` publica
   `data-jogo-pronto` + `data-jogo-pronto-ms`.

### Infra/testes

- `scripts/check-syntax.mjs` + `npm run check`: valida sintaxe de **51 arquivos**
  (antes: 3 arquivos; um erro em `ui/`, `audio/`, `ai/` não era pego).
- `scripts/qa_boot.mjs` (`npm run qa:boot`): gate novo de boot, desktop **e** celular
  (390×844), com orçamentos (capa ≤1500 ms, cena ≤20 s) e checagem de console limpo.
- `package.json`: `serve`, `qa`, `qa:boot`, `verify`.
- `scripts/smoke-f2f3f4.mjs`: import do Playwright era um caminho absoluto de `~/.npm/_npx`
  (quebrava em qualquer outra máquina) → agora `from 'playwright'`.
- Docker: o README prometia `docker compose up --build` **sem compose no repo**; e o Dockerfile
  servia `dist/` com `serve` (sem `POST /api/case/next`, quebrando o Expediente Livre).
  Agora: `docker-compose.yml` (container `game_farma_local`, 4174→3000) e Dockerfile rodando
  `node server/index.mjs` com `HOST=0.0.0.0` + healthcheck. Não colide com o container de
  produção `game_farma` (Caddy).
- Build: three.js em chunk próprio (`manualChunks`) → entry 13 kB, app 143 kB, three 600 kB.

### Validação executada (FINAL)

| Verificação | Resultado |
|---|---|
| `npm run check` | ✅ 53 arquivos |
| `npm run build` | ✅ entry 13 kB + app 144 kB + three 600 kB (gzip 5,3 / 47,3 / 152 kB) |
| `curl /` e `/assets/three-*.js` | ✅ HTTP 200 |
| `POST /api/case/next` | ✅ caso válido (ex.: `catia_dermatite_s36564`) |
| `npm run qa:boot` (desktop 1280×800) | ✅ 10/10 |
| `npm run qa:boot` (celular 390×844) | ✅ 10/10 |
| `npm run qa` (fluxo completo) | ✅ **PASS — 18 checagens, 0 problemas** (`/tmp/farma-qa6.log`) |

### Como ler os números do QA em headless
O gate/QA roda em Chromium headless **sem GPU real** → WebGL via SwiftShader (render por
software, ~2-3 fps medidos). Consequências documentadas (não são bugs do jogo):
- O walk-in do paciente é animação por frames: em software leva **~20 s** para o estado virar
  ANAMNESE (o próprio QA reporta "até digitar: Xms"); com GPU real o mesmo caminho é questão de
  segundos (o repo já tinha medição de 140-165 fps no Brave com GPU).
- O cheque de FPS só falha com GPU de verdade (piso 20 fps); em SwiftShader ele é informativo.
- "0 red flags" é comportamento correto nos casos de emergência silenciosa
  (`temRedFlag: false` — ex. `jose_gripe`, `marina_amoxicilina`): o painel lista apenas o que
  foi investigado. O QA se adapta ao caso sorteado.
- Bônus de diagnóstico: `node scripts/qa_chips.mjs <caseId>` mostra chips vs. fatos do caso.

### Registro histórico da sessão de 14/09 (mantido abaixo)


## Retomada — 21/09/2026

- Plano legado recuperado exclusivamente de `/home/servidor/Git/game_farma`; não há plano nomeado neste projeto.
- Inventário inicial: Vite 5 + Three.js 0.169, Node backend mínimo, Playwright instalado; Chrome disponível.
- Alterações anteriores do usuário em modelos e `3d_free.md` serão preservadas.
- Iniciada auditoria da execução, gameplay, assets e testes. Estado de serviços registrado abaixo em setembro/14 é histórico.

> Companheiro de `task_plan.md` (fases/próximos passos) e `findings.md` (descobertas).
> Formato: hora aproximada · evento · arquivos.

## Sessão opencode (tarde/noite de 14/09)

- **~17:00** Retomada do crash da IA anterior (07:28). Reconstruído o estado: diretrizes estilizadas,
  SKILL_BANK, re-tune de luz, capa WIP. Validação: `npm run check` + `vite build` OK; QA completo do jogo
  (`scripts/farmacheck_qa.mjs`) sem erros JS; 3 "fails" do QA explicados (timing/design, não regressão).
- **~18:00** **Capa refeita com fidelidade total à arte**: fatiei os desenhos originais (farmacêutica, play,
  livro, globo, bandeiras) e gerei fundo limpo por inpaint harmônico. Botões DOM com física de clique
  (afunda 7 px medidos), som de clique no `pointerdown`, i18n PT/EN, teclado, reduced-motion.
  Arquivos: `index.html` (#capa), `src/styles.css` (F0), `src/ui/capa.js`, `src/audio/sfx.js`, `public/capa/*`.
- **~19:00** **Ciclo de avaliação com subagente revisor (Nemotron 550B, custo zero):**
  - Rodada 1: **8/10** (inline styles frágeis; `:has()` sem fallback; keyframe em JS; cursor; teclado não verificado).
  - Correções: posicionamento → CSS; `.pressing` via JS; keyframes no CSS; auditoria de teclado
    (Tab: iniciar→refs→PT→EN; Space/Enter ok) + **2 bugs achados no caminho**: fundo tabulável → `inert`;
    `TTS.init()` travando ~9 s o boot → leitura adiada.
  - Rodada 2: **10/10**.
- **~19:30** **Auditoria paralela (subagente explorador):** diretriz de 3 itens (arquivamento do realismo /
  nova identidade visual / limpeza do código) → **CUMPRIDO** nos 3, sem pendências.
- **~19:40** **Deploy no DNS**: rebuild do container (`rebuild.sh`) + 2 correções de infra
  (`.dockerignore`; `server/index.mjs` HOST env). Verificado: 200 em `/game/ufggame/` e nos assets novos.
- **~20:00** **Ajuste de tamanho dos botões** (pedido do PO: ≈5 px maiores que a arte): boxes encolhidos
  (455×129 / 382×97 / 410×97) + fontes/margens escaladas 0.9485×. QA da capa: geometria ok, teclado ok.
- **~20:10** **Bugs de gameplay consertados** (pedidos do PO):
  walk-in duplo do paciente; **andar livre WASD restaurado** (zonas 1/2/3 mantidas); autofocus do chat removido;
  hint de controles atualizado (`index.html`). Testes: posição da câmera confirmando W/A + zona 2 + digitação não anda.
- **~20:20** **Pipeline de personagens**: ComfyUI ativo; llama parado (VRAM); **SDXL gerou a referência**
  Pixar `ref_pixar_777_00001_.png` (~8 min). Reescrevi o conversor `submit_wf.py` (o antigo se perdeu no /tmp)
  e corrigi 5 getchas de conversão UI→API (ver `findings.md` §1.2).
- **~20:50** Primeiras submissões falharam rápido (validação); com o log do serviço, corrigido o mapeamento.
- **~21:00** **Job TRELLIS 2 rodando** (`e226cec3-...`) — em execução no momento deste log.
  **NÃO interromper.** Ao terminar: pegar o `.glb` em `output/3d/`, religar `llama-cpp`, pós-processar (Fase G).

## Estado de processos no fim da sessão

| Processo | Estado |
|---|---|
| ComfyUI (systemd :8188) | ✅ ativo — job TRELLIS em execução |
| `llama-cpp` (docker) | ⏸️ parado (protocolo de VRAM) — **religar depois do job** |
| `game_farma` (docker, DNS) | ✅ no ar com fases A+B (capa fiel) — **faltam C+D** (botões menores + fixes de gameplay) |
| Preview local 4174 | opcional (subir com `setsid --fork ... vite preview`) |

## Pendências imediatas (para quem retomar)

1. **Job TRELLIS**: verificar `GET http://127.0.0.1:8188/queue` → ao terminar, procurar `*.glb` novo em
   `/media/servidor/nvme_data/ai_music/comfyui/ComfyUI/output/3d/`.
2. `docker start llama-cpp` (juiz de visão volta a funcionar).
3. Blender headless: decimar ~15k tris, escala 1.7 m, pivô Y=0 → exportar GLB (ver `SKILL_BANK/SKILL_A`).
4. Screenshot (`scripts/shot3d.mjs`) + juiz (`scripts/vision_judge.py`) → mostrar ao PO.
5. Deploy das fases C+D: `bash /home/servidor/Git/base_fundation/game_farma/rebuild.sh`.
6. (Após aprovação do personagem-teste) gerar 2–3 identidades e substituir **em leva** — nunca item a item.

## Arquivos tocados nesta sessão (git status resumido)

```
 M index.html            (capa + hint de controles)
 M src/styles.css        (bloco F0 da capa)
 M src/ui/capa.js        (inert, pressing, som)
 M src/ui/i18n.js?       (não tocado nesta sessão)
 M src/audio/sfx.js      (SFX.click)
 M src/audio/tts.js      (init não-bloqueante)
 M src/core/game.js      (sem autofocus do chat)
 M src/main.js           (mountAvatar sem enter duplo; __farmacheck.camera)
 M src/scene/pov.js      (andar livre WASD)
 M server/index.mjs      (HOST env)
?? .dockerignore          (novo)
?? public/capa/spr_*.webp + inicio_game_clean.webp (novos)
?? task_plan.md, findings.md, progress.md (este handoff)
```

---

## Sessão 24/09/2026 (manhã) — "Só a Ana" + animações alinhadas + interações restauradas

### Decisão do PO
1. **Elenco = SOMENTE a Ana** (Tencent/HY3D + rig Mixamo, a aprovada) em TODOS os casos.
   Os demais serão gerados depois no mesmo pipeline. Procedurais e TRELLIS antigos: fora.
2. Corrigir: paciente "deitada de costas" ao andar/parar; E contextual por proximidade;
   atravessar o balcão; mouse-look tipo tela cheia (pointer lock); walk travando/pulando;
   boca mexendo quando fala no chat.

### Feito (tudo deployado em https://francoscorporation.ddns.net/game/ufggame/)
- **Deitada → de pé**: os clips Walk/Idle do merge FBX→GLB vinham com `Rx(-90°)` no Hips
  (frame Y-up cru por cima do Armature que já tem `Rx(+90°)` baked). Fix: pré-multiplicar
  as chaves de rotação do Hips por `Rx(+90°)` (`ana_work/fix_ana_hips.mjs`).
- **Walk travando/pulando**: o clip Walk tinha **root motion de 89 cm por loop**
  (translação y do Hips: -2,18 → +87,21 → reset) brigando com o tween do jogo, + hop
  procedural por cima. Fix: pino da translação (in-place, `patch_walk_inplace.mjs`) e
  hop desativado quando o modelo tem mixer (`patient.js`).
- **"De lado/capenga" ao andar**: o Walk tinha **yaw médio de -37,6° embutido no Hips**
  (soma ao yaw do trajeto → entrava de lado). Fix: recentrar cada clip pela média de
  rotação (`straighten_hips.mjs`) + yaw pélvico amortecido a 40% (±8°, gingado natural,
  `damp_hips_yaw.mjs`).
- **"Para torta pra esquerda"**: Idle tinha tilt residual (roll -3,3° / yaw +5,4°). O
  mesmo recentrar pela média deixou o Idle ≈ identidade pura — ela para ereta de frente.
- **Só a Ana em todos os casos**: `app.js` → `modeloDoCaso = () => 'ana_coriza'` (cache
  único, instância compartilhada; material "Material.001" não casa o tint → cor original
  preservada). Boot também é a Ana. Removidos de `public/models/`: 8 procedurais (lote
  11/09), Eric `paciente_real`, trellis_ana×4, ana/ana_local/ana_v2×2, _raw×2 (19 arquivos)
  e os 5 estáticos Tencent (bia/clara/dona_rosa/helena/paulo) → backup em
  `ana_work/backup_models_230923/somente_ana_240924/`. Pastas: 337 MB → ~7 MB (dist 19 MB).
- **Zonas por PROXIMIDADE** (`pov.js`): no andar livre, `zonaPorPos()` (raio 1,45 m das
  âncoras) atualiza a zona e dispara onChange → hint da tecla E e o próprio E ficam
  contextuais. Longe dos POIs: hint some, E não faz nada.
- **E contextual verificado**: PC → abre bulário ✓; mesa → TLAC ✓; paciente → foca chat ✓;
  longe → nada ✓. Painel desativa sozinho ao sair da frente (gate por zona).
- **Balcão liberado**: removido o bloqueio (`z >= 2,0`); dá para cruzar e chegar perto
  do paciente. Teste: z 2,6 → 1,19 atravessando.
- **Pointer lock restaurado** (`pov.js`): clicar no jogo trava o mouse (olhar livre 360°,
  "tela cheia"), ESC destrava (nativo). Nas zonas 1/2/3 com lock: look-around limitado.
  Drag com botão continua como fallback.
- **Fala = animação**: sem morph targets no asset, o "falar" aplica nod de cabeça/pescoço
  por cima do clip (`applySpeak` — amplitudes 0,035+0,012 rad; Head oscilou 17× mais com
  fala ligada: 0,0045 → 0,0796 rad). Boca articulada real exigirá blendshapes no pipeline.

### Verificação (evidências)
- `jwalk_batch` 14/14 OK (state ANAMNESE, pos [0,0,0.55], rot [0,0,0], badRot false; y=0
  durante todo o walk = sem hop).
- **Juiz de visão local** (Qwen3.8-9B :8081) nas perguntas do PO: "de frente, não de
  lado"; "ereta, braços ao lado do corpo"; "para ereta de frente, sem pendência" ✓.
- Nota: o agente desta sessão não lê imagens — o juiz de visão (`scripts/vision_judge.py`)
  foi usado como "olhos" objetivo. Ele também confirmou jose/nelson (ex-procedurais)
  como "personagem 3D estilizado, não boneco de primitivas".

### Pendências (decisão futura do PO)
- **Olhos** da Ana ("precisam de mais atenção" — PO: "depois a gente vê").
- **Boca articulada**: gerar com blendshapes/visemes no pipeline Tencent+Mixamo.
- **Demais pacientes**: gerar no mesmo pipeline da Ana (Tencent → rig → clips → patches).
- Usar `vision_judge.py` no lugar de screenshots manual em reviews futuros.

### Rodada 2 (24/09 tarde) — pés no chão + boot + verificação com prints
- **Pés enterrados (PO)**: confirmados por telemetria — os toe-bases no idle ficavam
  **-7,9 cm** abaixo do piso (a normalização mede o Box3 da pose de BIND; os clips
  posicionam os pés noutro lugar). Fix: `ground-fix` no patient.js — mede o
  worldY mínimo dos toe-bases **só quando parado (idle ≥ 1,2 s, nunca em swing)** e
  assenta suavemente (lerp ~0,3 s). Auto-corretivo para clips futuros. Pós-fix:
  pés a +0,9 cm / +2,3 cm (contato correto). LOG: `[patient] ground-fix: …`.
- **Boot morto (TDZ, bug da minha edição)**: `BOOT_MODEL` foi declarado DEPOIS do
  IIFE que o usava → ReferenceError engolido → menu sem paciente. Corrigido:
  declaração movida para antes + boot agora usa `preloadAvatar(BOOT_MODEL)`
  (1 instância/1 download — antes eram 2 por sessão, logs duplicados).
- **"Torta/tronxa"**: telemetria serial do yaw do root no ar (pós-straighten):
  -0,468 rad constante no trajeto, blend → 0 na chegada, nos DOIS casos testados
  — o fluxo está reto. Suspeita da versão que o PO viu: janela entre deploys
  (GLB ainda com yaw -37,6°) e/ou cache HTTP (server já manda `no-cache` p/ .glb —
  revalida por Last-Modified). Instrução de teste: F5 comum basta; se persistir,
  Ctrl+Shift+R.
- **Verificação com "olhos" independentes (vision_judge nos prints)**: t700 "pés
  tocando o piso"; t1500 "pés visíveis tocando; ereta, de frente; proporcional";
  done "pés tocando; ereta e de frente; proporcional".
- jwalk_batch 14/14 OK pós-ground-fix.

### Rodada 3 (24/09 noite) — "andado humano": bob nativo restaurado + solo por estado
- **Descoberta-chave**: os múltiplos round-trips do gltf-transform (5 escritas em
  cascata) CORROMPIAM o sampler de translação do Hips — o three congelava o track
  no 1º key (rotações animavam, translações não). A **escrita única**
  (`patch_final_ana.mjs`, uma passada a partir do ana_rigged_opt original) DEU CERTO
  e o bob vertical do clip voltou a animar NATIVO no mixer (localZ −95..−103 ✓).
  Lição: nunca empilhar reescritas no mesmo GLB — um script único, uma escrita.
- **Solo por estado (PO: "andava elevada, afundava ao parar")**:
  - `walk-calib`: mede o pé de CONTATO durante 0,8 s de andar e aplica `drop`
    (−0,068 m medido) — o clip Walking mantém a pelve ~10 cm mais baixa que o
    Idle; agora cada estado toca o chão na sua altura.
  - Ao parar, `inner` volta ao alvo do ground-fix (idle) — sem mais afundar.
  - `bobBaseY` ancora no `groundFix.alvo` quando pronto; recalibra o drop se a
    base mudar entre walks.
- **Bob artificial REMOVIDO** (estava dobrando o bob nativo e fora de fase).
- Observação técnica: leitura crua de `bone.matrixWorld` fora do render fica stale
  p/ bones skinned — usar `getWorldPosition()` (força update) em qualquer
  calibração/telemetria.
- **Validação**: telemetria (Head 1,43–1,53 oscilando; mãos 0,71–1,03; pé de contato
  minY −0,068 → drop 0,068) + juiz de visão 3/3 frames: "pés tocam o piso; braços
  balançam naturalmente; andar humano natural".
- **Pendente (refino)**: o clip "Walking" do Mixamo tem passos curtos (~45 cm);
  aceleramos a cadência (×2,28) pra casar com 1,3 m/s. Para passos ~70 cm, baixar
  o clip **"Walk" (normal)** no Mixamo (sessão logada no Brave do CDP, character
  da Ana já riggeado) → `fbx_merge_to_glb.py` → `patch_final_ana.mjs` → medir novo
  avanço → atualizar constante no patient.js. Scripts prontos em ana_work.

### Rodada 4 (24/09) — cabeça parada no andar (pedido PO) + Mixamo "Walk" pendente
- **PO: "a testa/cabeça não pode mexer ao andar — só braços, mãos e caminhar"**:
  passo (6) no `patch_final_ana.mjs` — remove os canais de Neck/Head/HeadTop_End
  do clip Walk (195→186 canais). Head quaternion = 0.0000 em 10/10 amostras do
  andar (validação numérica). Idle mantém o micro-sway (PO aprova).
- **Automação Mixamo**: `mixamo_getwalk.mjs` achou o card errado ("Walker Walk" —
  andador!) e a SESSÃO CAIU no relançamento do Brave ("Log in" visível). O clip
  **"Walk" (normal)** do Mixamo (passos ~70 cm) segue PENDENTE: precisa login
  Adobe (interação do PO) → buscar "Walk" EXATO → DOWNLOAD (FBX with skin) →
  `fbx_merge_to_glb.py Walk.fbx Idle.fbx` → `patch_final_ana.mjs` → medir avanço
  novo → atualizar `0.894` no patient.js → deploy. Tudo pronto, só falta o login.
- O que ainda pode incomodar o PO no clip atual ("Walking" lento): passos
  curtinhos (~45 cm) acelerados ×2,28 = cadência apressada. O clip "Walk" resolve.

### Rodada 5 (24/09, 22:16) — espinha fora do walk (causa da "mexida da testa")
- **PO acertou a causa**: a cabeça estava parada (quaternion 0) mas a ESPINHA
  (Spine/Spine1/Spine2) ainda balançava no clip — a cabeça acompanha o tronco na
  ponta da cadeia. Passo (6) estendido: remove Spine/Spine1/Spine2/Neck/Head/
  HeadTop_End (195→177 canais). Agora só Hips (bob), pernas, braços e mãos animam.
- **Validação numérica (deploy 22:16)**: headQx/y = 0.0000 e spine1Qx = 0.0000 em
  10/10 amostras do andar; headWorldY estável ~1,52 m (±1 cm do bob do corpo).
- Cache do PO: se ainda vir versão velha → Ctrl+Shift+R (GLB é no-cache, mas
  garantia nunca é demais).

### Rodada 6 (24/09, ~23h) — gingado zero + passada fechada (feedback PO)
- **PO: "crânio/olho balançando nas laterais"** = o gingado do quadril (yaw ±8°
  damped) transmitido rigidamente pelo tronco parado → corpo/cabeça girando de
  lado a lado. Fix: **yaw pélvico do Walk ZERADO** (passo 4 do patch). headWorldY
  agora 1,531–1,535 (±2 mm) — estável de verdade.
- **PO: "passos muito espaçados"** = amplitude de perna do clip lento acelerado.
  Fix: passo (7) — slerp das rotações de UpLegs/Legs/Feet em torno da média
  (×0,65) → passada máx medida **0,67 m** (andar humano típico; era ~1 m).
- walk-calib recalibrou pro novo passo (drop 0,075 m) — tudo clip-agnóstico.
- Pendências: clip "Walk" normal do Mixamo (login PO) p/ cadência mais natural;
  se o PO preferir a velocidade do preview (andar calmo), basta WALK_V 1.3→0.9.

### Rodada 7 (24/09, ~00h) — Ciclo Actor-Critic (protocolo orquestrador) + v9
- **Ciclo de avaliação com 2 juízes independentes** (subagentes revisor + arquiteto):
  - Notas: 5/10 e 3/10 (rodada 1) → 7 e 5 (rodada 2) → **7/10 e 7/10 (consenso final)**.
  - Correções aplicadas conforme os apontamentos: média de quaternions → iteração
    de **Karcher**; contradição Δ×remoção de canais resolvida (Δ só em braços);
    **constantes derivadas do asset** (pipeline grava `extras.walkAdvance` e
    `extras.walkSpeed`; runtime lê — sem mágica); **base única idle↔walk**
    (translação do Hips pinada nos DOIS clips no mesmo valor = sem pop);
    `applyLegSwing` guard (nunca com clip de walk); **validação offline passo (8)**
    (falha o pipeline antes do jogador: canais de cabeça, hips oscilando, NaN,
    extras); literais nomeados (PARAMS/CROSSFADE_S); ground-fix 0,7 s.
  - Itens classificados pelos JUÍZES como fase seguinte ("elenco 14", registro
    público): modularizar patient.js, manifest por rigType, fallback ghost,
    testes vitest + CI visual Playwright, clip SpeakNod aditivo, altura por extras.
- **Skill criada**: `site_corp/banco_skills/mixamo_glb_walk_normalizer/`
  (+ catálogo `mixamo_glb_walk_normalizer.md` + índice no README do banco).
- **Integração com outra frente** (factGate/scoring, trabalho paralelo): build
  quebrou com `import ... from './n.js'` (corrupção de edit alheio) — corrigido
  para `'./scoring.js'`; build+deploy+smoke OK (3/3 casos ANAMNESE).
- Estado final validado no ar: cabeça ±6 mm no andar, passada 0,66 m, pé de
  contato tocando, entrada com rampa suave (drop lerp casado com crossfade).
