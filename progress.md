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

### Rodada 8 (25/09) — biomecânica aplicada + colisões restauradas
- **PO: "espelhar gente andando"** — alvos biomecânicos obtidos via subagente
  (quadril 35–40° de flexão no balanço; joelho 60–70° p/ desobstrução mínima;
  pé 1–2 cm do chão no swing; 100–110 passos/min). Diagnóstico: o clip "Walking"
  tem rotações de perna MINÚSCULAS de fábrica (coxa 18–20°, joelho 12–23° —
  o "passo" era o corpo deslizando com pernas esticadas = steppage/rasteiro).
- **(7) v12b**: escala por ALVO biomecânico (mede a amplitude do bone e escala
  ao alvo — coxa→38°, joelho→60°, tornozelo→28°, MESMO alvo p/ L/R = simetria).
  WALK_V 0,95 m/s (≈2 passos/s, cadência humana).
- **PO: colisões voltam** ("não deveria atravessar balcão/prateleiras"):
  AABBs calibrados na cena (balcão central, 5 gôndolas, vitrine) com deslize
  por eixo. Testado: balcão para em z=2,15; gôndola em x=1,65; zonas do
  paciente/computador/mesa continuam acessíveis (área livre z≳2,2).
- Limitação honesta: as curvas de perna do clip atual são limitadas (defeito
  de fábrica do retarget "Walking"); a cura real segue sendo o clip **"Walk"
  normal do Mixamo** (login pendente).

### Rodada 9 (25/09) — **Walk.fbx oficial do Mixamo integrado** ✅
- Login Mixamo concluído (Adobe 2FA via email linduxico@gmail.com)
- Baixado **Walk.fbx** (basic locomotion, 31 frames, "With Skin") do character **ANA_QWEN_GROUNDED**
- Retarget do novo Walk pro rig original da Ana (`ana_rigged_opt.glb`) via Blender:
  - Importa Ana GLB + Walk.fbx → copia action Walk pro armature da Ana → NLA tracks (Walk + Idle) → exporta GLB
- Patch v12b aplicado no GLB retargetado (escalas biomecânicas por alvo: quadril 38°, joelho 60°, tornozelo 28°)
- walkAdvance = 0.854 m (step length compatível)
- Deploy: https://francoscorporation.ddns.net/game/ufggame/
- **Colisões validadas**: balcão para em z=2.17; gôndolas/vitrine bloqueiam; zonas paciente/computador/TLAC acessíveis

**Status**: andar agora usa animação **nativa do Mixamo** (mo-cap real) + correção biomecânica por alvo — elimina "steppage" (perna na cintura) e "foot drag" (arrastar pé direito). Colisões restauradas como pedido.

### Rodada 10 (25/09) — **Ana corrigida: mesh duplicado removido, em pé no chão** ✅
- **Causa raiz ("durona e embaixo do chão")**: o retarget Blender removia só o ARMATURE
  do FBX, não o MESH duplicado (node_0.001: sem skin, scale 100) + Icosphere órfã
  → mesh gigante sem pose renderizado por cima da Ana real.
- **Cache do browser mascarava o fix**: GLB velho (2 meshes) em cache → verificação
  pós-deploy mostrava o bug. CDP clearBrowserCache + setCacheDisabled = passo padrão.
- **Correção**: limpeza Blender (meshes sem ARMATURE modifier) → re-export
  (NLA_TRACKS, export_skins) → GLB final MESHES: 1, SKINS: 1, CLIPS: [Walk, Idle]
  → extras {walkSpeed: 0.95, walkAdvance: 0.854} via patch binário (Blender 5.2
  NÃO mapeia scene props → asset.extras — testado) → deploy.
- **Verificação numérica**: LeftFoot Y=0.102, RightFoot Y=0.092, Hips Y=0.932
  (skeleton in-game; GLTFLoader sanitiza nomes: 'mixamorig:X' → 'mixamorigX').
  Tudo positivo = EM PÉ no chão. Walk-in funcionando (screenshots antes/depois).
- **Juízes (Actor-Critic)**: rodada 1 = 7.0/8.5 → correções → rodada 2 = **9.0/9.0 consenso**.
- Runbook: diagnóstico GLB (chunk JSON em byte 20, bounds slice(20, 20+jsonLen)) →
  limpeza → verificação estrutural → deploy → cache clear → verify skeleton → extras.
- Melhorias futuras (juízes): CI gate (gltf-validator + ângulos 38/60/28 ±2°),
  cache-bust determinístico (?v=hash), issue upstream Blender p/ asset.extras.

### Rodada 11 (25/09, noite) — **WALKING HUMANO v13: mocap cru transplantado no Walk** ✅
- **Causa raiz da manqueira/estiff ("abre as pernas", "mexendo a testa", "travado")**: o
  pipeline v12b RESSINTETIZOU as curvas das pernas para persegir alvos de amplitude
  (38/60/28 ±2°) — joelhos ficaram 25,7°/46,5° (Δ20,8° de assimetria = manqueira) e os braços
  foram amortecidos (LeftArm 24,7°→10,5° = "travado"). O mocap cru do Mixamo nunca teve
  esses defeitos: 37,9°/39,4° simétricos.
- **Fix (`scripts/fix_ana_walk_mocap.mjs`)**: transplantou VERBATIM as 58 curvas de rotação
  do mocap cru (pernas/braços/mãos/dedos), manteve os fixes aprovados (Hips pinado,
  cabeça/tronco zerados, yaw damped 40% ±8°), derivou o transform de frame M do próprio
  clip público em produção, retimou TODOS os canais p/ 1,033 s e regravou
  `walkAdvance=1,7402` (stride real medido no root do cru; era 0,854 do synthetic).
  Backup do estado anterior: `/tmp/opencode/ana_coriza_pre_walkfix.glb` (+ fonte crua
  copiada p/ `ana_work/ana_merged_source_250925.glb`).
- **Gate v13 recalibrado p/ mocap** (`qa_walk_angles.tmp.mjs`): quadril 28°, joelho 38,6°,
  tornozelo 26,4° ±4° + simetria por par — **19/19 PASS** (era 3 FAIL crônicos).
- **Verificação in-game** (headless :4174): cadência ×0,56 (clip 1,68 m/s → 0,95 m/s =
  stride/p temporal exato → sem foot slide estrutural); walk-calib converge p/ drop 0,001 m
  (pés plantando em y≈0,000); toes levantam 0,13–0,17 m alternados; mesh deforma
  (getVertexPosition varia); 0 pageerrors.
- **Contralateralidade em espaço-mundo** (rAF in-page, detrend do root): mão×pé mesmo lado
  −0,94/−0,89; cruzado +0,96/+0,95; pé L×pé R −0,84 → caminhada humana (braço oposto à perna).
- **Juiz de visão** (nas capturas de passada máxima, sep 0,75–0,79 m): "passada clara,
  joelho dobrado, pisada correta, sem mancar" → **ACEITÁVEL** (VLM 9B oscila em fases de
  duplo-apoio — ignorar leituras "parada" fora do pico de separação).
- Pendências visuais (não-bloqueantes): torso 100% rígido é efeito colateral do zero-set
  pedido pelo PO ("testa não mexe"); se quiser mais vida, restaurar Spine/Spine1 do mocap
  SEM o Neck/Head (só o pescoço pra cima fica parado).

### Rodada 12 (25/09, madrugada) — **Colisão do balcão calibrada + DEPLOY produção** ✅
- **Bug (PO): "espaço em branco sem balcão intransponível"**: o AABB do balcão ia até
  x ±3,6 (7,2 m) mas o balcão renderizado tem 4,8 m (x ±2,4, medido no browser via
  `tmp_bounds.tmp.mjs` — GLB e procedural batem) → ~1 m de parede invisível de cada lado,
  engolindo a mesa lateral TLAC (que não tinha collider próprio).
- **Fix (`src/scene/pov.js` OBSTACULOS)**: AABBs recalibrados pela GEOMETRIA RENDERIZADA +
  margem 0,25 m — balcão x ±2,65 / z 0,85..2,27; mesa TLAC (tampo rot −0,35 rad) x 1,63..3,27 /
  z 0,71..2,19. Balcão+mesa formam barreira contínua (não dá pra atravessar entre eles),
  com passagem livre pelas duas pontas.
- **E2E (`tmp_collide.tmp.mjs`, WASD real)**: A(x−3,0) atravessou ✓ · B(x0) parou em z2,28 ✓ ·
  C(x2,45, mesa) parou em z2,28 ✓ · D(x3,45) atravessou ✓ — 4/4 PASS.
- **Deploy produção** (`scripts/deploy.sh`, healthcheck 200 + rollback automático):
  GLB do walking v13 em prod com SHA idêntico ao local (29ac5682…), bundle com os AABBs
  novos e o antigo (±3,6) ausente. `Cache-Control: no-cache` no GLB → browser revalida
  (sem hard-refresh). URL: https://francoscorporation.ddns.net/game/ufggame/
- Nota: o "ainda anda desengonçada" da noite era o asset VELHO — o fix v13 ainda não tinha
  ido pra produção. Se o andar ainda parecer rígido AGORA, o próximo ganho é restaurar
  Spine/Spine1 do mocap (mantendo Neck/Head zerados — "testa parada").

### Rodada 13 (25/09 → 26/09, madrugada) — **Idle ereto + cabeça lenta + axila com divisão + tween linear + DEPLOY** ✅
- **Idle pende p/ um lado (PO: "parada, pendurada p/ a esquerda")**: a cadeia Spine do
  Idle tinha média de roll ~+6° acumulado → recentrada pela média de Karcher
  (`scripts/fix_ana_idle.mjs`; respiração 1,0°/0,29° preservada). Gate v13.1: |roll|/|pitch| ≤ 0,5°.
- **Cabeça (PO: "a cabeça por completo mexendo seria bom, mas bem devagar" — o defeito
  era a testa/couro tremendo SOZINHOS)**: substituí o wobble rápido do mocap (~0,8° @1-2 Hz)
  por balanço lento sintetizado: Head yaw ±3° @ 6,6s · pitch ±1,5° @ 3,3s · roll ±1° @ 2,2s
  (períodos que dividem a duração = loop sem salto), Neck com 35% do mesmo balanço,
  HeadTop_End constante. Gate: Head amp 2-5° + passo ≤ 0,2°/key (wobble rápido reprovado).
- **Axila (PO: "pedaço do corpo vira axila e anda junto com o braço")**: 6.460 vértices do
  TRONCO (dominante Spine/Hips) com influência de braço ≥0,15 (4.358 entre 0,3-0,5!) —
  cada balanço arrastava uma laje lateral do tronco. Fix (`scripts/fix_ana_armpits.mjs`):
  influência de braço CAPADA em 0,10 nesses vértices, déficit redistribuído só sobre
  influências de tronco (renormalizar re-inflava o braço — corrigido). Pós-fix: 0 arrastados;
  in-game: oscilação de vértice de tronco ≈ osso do Hips + exatamente 10% do braço ✓.
- **Pés patinando (PO)**: o root tween usava smoothstep (easing) enquanto o clip cicla
  UNIFORME pela cadência de walkAdvance → pé plantado derivava ~1 m/s no mundo
  (tmp_slide: root p95 1,42 m/s). Fix: tween LINEAR (o comentário original do código já
  pedia "a MESMA velocidade") → root constante 0,95 m/s medido ✓. + `lastWalkDrop`
  persistido entre caminhadas (a 2ª entrada já nasce com o pé no chão).
- **Mesa TLAC saiu de cima do balcão** (x2.45→x3.1 — 52 cm enterrada; ZONAS.mesa
  reposicionada p/ (2.15, 1.52, 2.45) yaw −0,76; AABB da mesa → x 2,28..3,92). E2E 4/4 PASS.
- **⚠️ FANTASMA DE INSTRUMENTAÇÃO (importante p/ próximas sessões)**: os probes que leem
  `getWorldPosition`/`getVertexPosition` do bone em runs headless podem ler **matrixWorld
  STALE** em alguns runs — um MESMO build mostrou pés "congelados" num run e animando no
  outro, com o walk-calib do próprio jogo logando valores de pé ANIMADO no mesmo run.
  O "congelamento do Walk" que assustou nesta rodada era fantasma (round-trip no-op
  "congelava" e o run seguinte do MESMO build animava). **Ground truth: gate offline +
  logs do walk-calib + olho do PO — nunca um único run de probe.**
- **Deploy produção** (healthcheck 200): GLB com sha idêntico ao local; bundle com os
  AABBs novos e o runtime completo (linear + mediana + drop persistido + abdução).

### Rodada 14 (26/09, madrugada) — **Assets visuais: prateleiras/balcão/paredes/logos + DEPLOY** ✅
- **Armadilha achada (importante)**: o `propFromGLB` esconde o grupo fallback quando o
  GLB carrega — melhorias adicionadas DENTRO dos grupos fallback (ripas/itens/frascos)
  ficavam INVISÍVEIS (juiz: "balcão liso, sem etiquetas"). Fix: decoração em grupo
  PRÓPRIO na cena, ancorado no mesmo lugar (sobrevive à troca pelo GLB).
- **Prateleiras/gôndolas**: frascos de remédio (âmbar/verde/azul, tampa+rótulo) misturados
  com as caixas (55/45), etiquetas de preço brancas no bordo das prateleiras, lábio frontal,
  painel de fundo. Juiz: "produtos variados e etiquetas ✓".
- **Balcão**: ripas verticais de madeira na frente (face do cliente), no tampo: planta,
  caixa de lenços (x0,75 — visível no enquadramento padrão), expositor de band-aids.
- **Paredes**: molduras nos 3 pôsteres (saiu do "adesivo colado"), friso horizontal a 1,15 m
  nas 3 paredes, relógio de parede no fundo (âncora visual de profundidade).
- **Logos**: banner FarmaCheck com gradiente + sombra + brilho diagonal; halo emissivo
  atrás da cruz verde.
- **Iluminação** (juiz: "metade escura"): environmentIntensity 0,24→0,45, hemisférica
  0,45→0,62, 2ª luz de preenchimento no fundo (z −4). Veredito do juiz pós-fix: prateleiras
  ✓ etiquetas ✓; texturas low-poly = direção estilizada (aceito).
- **Deploy produção** (healthcheck 200) — https://francoscorporation.ddns.net/game/ufggame/
- **Personagens (pendente)**: Hunyuan MCP indisponível nesta sessão (Blender addôn não
  conectado); levar Tencent via scripts/tencent_*.tmp.mjs (cota 17) fica para a próxima
  — automação de login/upload/generate/download não rodou desacompanhada nesta noite.

### Rodada 15 (26/09 manhã) — **Tique do braço + pisar no chão + gôndolas** ✅
- **Tique no braço parada (PO)**: caçada longa com métrica ERRADA (meu q4 indexava
  componentes, não chaves — "seam 180°" nunca existiu; HeadTop_End provado idêntico).
  Verdade: o Idle está limpo (amp ≤3,4°, passos ≤0,19°/key, seams reais ≈0°). O tique
  era o **armAbduct runtime** — adicionado p/ "axilas pregadas", mas o PO esclareceu
  que o defeito era o PESO DE SKIN (já corrigido no asset). **armAbduct REMOVIDO.**
  (scripts/fix_ana_idle_seam.mjs v3 ficou como utilitário; as sobrescritas de última
  chave foram no-op — os valores já eram loop-coherent.)
- **Pisar no chão caminhando (PO: "o chão de quando ela PARA vale p/ o andar")**:
  nova `stanceDelta` no load — avatar invisível, mede o dedo na pose de APOIO do Walk
  vs Idle (mediana sobre todas as keys, timeScale=1 provisório) → walk nasce no
  MESMO nível do idle (+0,011 m medidos). walk-calib vira fino com **cap ±3 cm**
  (leitura stale/fantasma não acumula mais drop).
- **Gôndolas (PO: "remédios mal definidos" + "a da direita virada p/ a parede")**:
  (a) produtos procedurais REMOVIDOS da decoração (somavam/atravessavam os do GLB
  na mesma prateleira); (b) GLB com rotY + π — o prop_gondola.glb tem os produtos
  no lado −z (oposto ao procedural) → nas laterais ficava "de costas" p/ loja.
- **Deploy produção** (healthcheck 200).
- Lição registrada: 2 falhas de instrumentação minhas nesta trilha (getVertexPosition
  stale + q4 com index de componente). Ground truth: valores brutos do arquivo + logs
  do runtime + olho do PO.

### Rodada 16 (26/09) — **Braço na coxa + deslizar + gôndolas/vitrine** ✅
- **Braço esquerdo entrando na perna (idle)**: bake de 4° de abdução LOCAL nos canais
  LeftArm/RightArm do Idle (`scripts/fix_ana_arm_clearance.mjs`) — delta medido no
  navegador (tmp_arm_delta: cotovelos +3,1 cm p/ fora, simétrico, via conversão
  Qp⁻¹⊗Δ⊗Qp). Determinístico, ZERO runtime (o armAbduct runtime foi a causa do tique
  e foi removido na Rodada 15).
- **Deslizando (PO: "passos não compatíveis com o tanto que ela anda")**: o clip anda
  naturalmente a 1,68 m/s; o jogo rodava a 0,56× (câmera lenta) = passadas lentas com
  corpo deslizando. **walkSpeed 0,95 → 1,684** (= advance/duração) → timeScale 1.00,
  cadência natural, passo-e-anda de verdade. Entrada porta→balcão: 6,1s → 3,4s.
- **Gôndolas "fechadas" sem remédios**: MEU ERRO — o flip +π (Rodada 15) virou o
  costas escuro do GLB pra loja (o GLB tem os produtos no lado +z, igual ao
  procedural; sem material de vidro). **Flip revertido** — produtos visíveis de novo.
- **"Primeiro armário da direita virado pra parede" (desde sempre)**: era a VITRINE
  (x8,2, mais perto do balcão que a gôndola), não a gôndola. rotY +π/2 → −π/2: a
  frente do GLB (produtos + vidro BLEND 0,22) agora olha a loja — antes via-se o
  fundo escuro do fallback ("vidro não transparente").
- **Deploy produção** (healthcheck 200). Logs pós-fix: cadência ×1.00 ✓, referência
  de solo +0,011 ✓, drop cap 0.030 ✓.

### Rodada 17 (26/09) — **Polimento geral (lista do PO)** ✅
- **Mão esquerda na coxa (idle)**: abdução local 4° → 6,5° no bake (fix_ana_arm_clearance,
  restaurado do backup pre-arm para não somar). Cotovelo ~5 cm p/ fora agora.
- **Cabelo na ochecha direita**: causa provável = SWAY do Neck (hair pesado no Neck
  atravessava o rosto ao mexer). Neck agora CONSTANTE (SWAY 0; Head carrega 100% do
  balanço lento). Gate atualizado (Neck amp ≤ 0,05°).
- **Glide no início da caminhada**: CROSSFADE_S 0,25 → 0,15 s.
- **Parede preta atrás do jogador**: parede FRONTAL adicionada (z +6,5, wallTexture).
- **Atendentes**: os 2 procedurais REMOVIDOS → clones da Ana (SkeletonUtils.clone +
  mixer Idle dessincronizado, ±4,4/1,6 — SkinnedMesh ×3 verificado na cena, 0 erros).
- **PC**: prop_pc.glb descartado (monitor sem teclado/tela vazia) → procedural completo
  (tela com bulário emissivo + teclado + mouse) + CPU torre no chão atrás do balcão
  com LED pulsando.
- **Balcão**: expositor de band-aids REMOVIDO (PO: "coisa em pé com 4 retângulos");
  planta redesenhada (6 folhas + haste + borda do vaso); caixa de lenços com faixa
  da marca + lenço saindo.
- **Mesinha TLAC**: prop_mesa.glb descartado (itens do GLB se atravessavam) →
  procedural com kit espaçado (bandeja com borda, casete+lancetador+3 algodões+
  frasco com tampa, sem overlap).
- **Relógio**: releitura — marcações 12h (maiores nas 3/6/9/12), ponteiro de
  segundos vermelho, pino central, moldura bronze metálica.
- **Pôsteres**: releitura — gradiente, cápsula estilizada, moldura dupla, slogan.
- **Gôndolas**: topo de cada uma com fileira de remédios "de marca" (10 variantes
  com rótulo canvas, mistura caixas/frascos) — repetindo o set em todas.
- **DEPLOY produção** (healthcheck 200). Juiz: relógio ✓, parede ✓, remédios ✓,
  veredito ACEITÁVEL (texturas low-poly = direção estilizada).
- **Pendente p/ próxima**: geração de personagens próprios (Marina/José + variações)
  — precisa do Blender aberto (Hunyuan MCP) ou leva Tencent; cabelo-na-bochecha se
  persistir estático = cirurgia de mesh no Blender.

### Rodada 12 — Dinâmica de plantão v1 + jogabilidade (26/09, sessão paralela à do walk)
- **Mudança de cadeia**: a outra sessão assumiu a Ana/walk (GLB + paciência da PO);
  esta sessão passou a **rede de dinâmica de jogo** (client-side, sem tocar no avatar).
- **Combo de acertos**: nota ≥ 70 segura a sequência (+10 % por caso, teto ×2,0);
  nota baixa ou dispensa contraindicada zera. Multiplicador aplicado sobre o combo
  ATÉ AQUI (o caso bom premia o **próximo**), fonte da verdade = `progression.js`
  (pontos do save agora alimentam o HUD no boot — antes ficava "Pontos 0").
- **12 conquistas** (`src/core/achievements.js`, lógica pura): primeiro_dia, nota_maxima,
  combo3/5, sem_reprovacao, trinca de 3 estrelas, detetive, comunicador, bulario_mestre,
  tlac, encaminhador, maratona — persistidas no save, painel no menu (🔒 → ícone),
  destaque no debrief, i18n PT/EN completo.
- **Painel do menu** (`#menu-meta`): barra de rank (Prata→Ouro faltam N), combo atual
  e grade de medalhas; botão "Zerar progresso" (com confirmação) no details da IA.
- **Jogabilidade**:
  - checklist vivo da anamnese (`#chat-cobertura`): domínios cobertos ✓ + N pendentes
    (sem dizer quais — não vaza o gabarito);
  - chips usados agora **somem** do painel (fecha pendência antiga do task_plan);
  - atalhos 1/2/3 escolhem a conduta e Esc volta à decisão (kbd nos cards);
  - fase escolhida no menu é honrada ao iniciar (antes `setPhase(0)` forçava a fase 1);
  - cards de fase mostram progresso (★ · feitos/total); dica de onboarding no 1º caso;
  - "Nova fase liberada" + progresso de rank no bloco do debrief.
- **Validação**: `npm run check` (62 arq.), `npm run test:logica` (48 asserts, node puro,
  cobre multiplicador/persistência/predicados de conquistas/i18n), `npm run build`,
  `npm run qa:dynamics` (23/23 PASS headless: painel, HUD, chips, cobertura, atalho,
  debrief), `npm run qa:all` (6/6 PASS completo em 539s: check + test:logica + build +
  qa:boot + qa:dynamics + qa) — zero erros de página. Nada publicado em produção por esta sessão.



### Rodada 13 — Estruturação do trabalho (26/09, sessão de dinâmica)
- **`docs/ROADMAP.md` criado**: fonte única de coordenação — regras multi-sessão (1 dono por
  arquivo, `progress.md`/`findings.md` append-only, deploy só com PO), estado por área com
  evidência, **workstreams W1–W6** (W1 avatar = sessão paralela; W2 dinâmica; W3 clínico = PO;
  W4 IA/i18n; W5 infra/deploy; W6 QA), **mapa de donos de arquivo** anti-colisão, backlog
  P0–P2 com critério de aceite, matriz de gates e top-6 armadilhas.
- **`task_plan.md` atualizado**: bloco "Retomada atual" agora em 26/09, aponta para o ROADMAP,
  marca o QA completo como COMPLETE (18/18), registra a dinâmica v1 e o walk da Ana como
  EM ANDAMENTO (W1); pendências antigas marcadas como resolvidas (`usedChips`, assets mortos
  — `public/models/` caiu de 337 MB para 24 MB).
- **`npm run qa:all`** (`scripts/qa_all.mjs`): roda check → test:logica → build → qa:boot →
  qa:dynamics → qa em sequência, com resumo (PASS/tempo), detecção do servidor (skip dos gates
  de browser com aviso quando ausente) e `--fast` para os estáticos. Validado: `--fast` 3/3 PASS.
- Nada foi commitado nem publicado por esta sessão (repo com sessão paralela ativa em W1).
- **2 gates corrigidos** (achados ao rodar `qa:all`):
  - `scripts/qa_boot.mjs`: a checagem da barra do POV (`#acoes`) esperava 30 s *antes* da
    ANAMNESE; no headless o walk-in passa de 1 min → falso negativo. Agora espera a fase
    (180 s) e só então exige a barra (15 s).
  - `scripts/farmacheck_qa.mjs` + `src/core/game.js`: a contagem de "red flags" incluía
    achados NEGADOS ("não tem alergia"), que aparecem de propósito na decisão. `goDecision()`
    agora marca `data-tag`/`data-negado` na linha (contrato testável) e o gate conta só
    achados positivos.

### Rodada 18 (26/09) — **Testa caída: CAUSA RAIZ + correções de cena** ✅
- **"A TESTA CAIU PRA CIMA DO ROSTO" (PO) — causa raiz ACHADA E CORRIGIDA**: NÃO era
  animação (canais Head/Neck idênticos ao aprovado) — era **PESO DE SKIN da franja**:
  32% da massa da franja/testa estava no **Spine2** (+3% ombros). Na marcha o Spine2
  balança com o quadril (damped yaw ±8°) e ARRASTAVA a franja sobre os olhos a cada
  passo ("ela vem, vem, vem e cai"). Juiz confirmou no render: walk = "cabelo cobre
  testa E olhos". Fix (`scripts/fix_ana_fringe.mjs`): caixa da cabeça (z>0,70,
  y>−0,04, |x|<0,15) → 100% mixamorig:Head — 8.578 vértices. Estruturalmente a
  franja agora é rígida com a cabeça (Head constante no walk). Pós-fix, juiz: rosto
  visível ✓ franja sobre a testa ✓ (o mesmo fix resolve o cabelo da orelha direita).
- **PC flutuando ~1 m**: meu bug (grupo em y=1,03 com monitor local 1,2). y=0 ✓.
- **Relógio "ponteiros pulados"**: eram caixas deslocadas; agora geometria com pivô
  no pino (translate) + rotação — e ponteiro de SEGUNDOS girando devagar (vivo).
- **Remédios flutuando no topo**: y 2,25 → base assentada em 2,1 (altura real).
- **Remédios do MEIO feios**: loader próprio da gôndola troca os 8 materiais bx* do
  GLB pelas texturas de rótulo de marca (medLabelTexture) — os remédios internos
  agora têm rótulos desenhados.
- Deploy produção (healthcheck 200). Doc do PO (Google Docs) = privado, não li;
  vídeo do YouTube = "IA texto→animação 3D grátis" — anotado como lead p/ pipeline
  de animação; preciso do nome da ferramenta.

### Rodada 19 (26/09 noite → 27/09) — **PIPELINE KIMODO.CPP OPERACIONAL** 🎉
- **Kimodo.cpp (localai-org) instalado no servidor** (/media/servidor/nvme_data/kimodo): build release
  CPU (sem Vulkan), SOMA RP v1.1 (licença comercial ✓) + encoder Q8_0 (7,8 GB) + tokenizer.
  Demo web na :8094 (Go 1.25 ✓). Pesos no NVMe (disco / estava 98%).
- **Geração testada**: "a person is walking forward" (90f) em ~7,5 min na CPU (llama-server ligado).
  Saída: animation.glb (30 juntas SOMA, 31 canais).
- **Retarget SOMA→Mixamo criado** (`scripts/retarget_kimodo.mjs`): mapa 23 ossos
  (LeftLeg→LeftUpLeg, LeftShin→LeftLeg etc), **fórmula correta: q_new = q_rest ⊗ q_soma**
  (delta da animação NO frame do rest — a v1 usava o inverso e explodia o corpo) +
  pin da translação do Hips no frame raw do pub (o mesmo valor dos clips Walk/Idle).
- **Preview corrigido** (public/kimodo-preview.html): normalização IDÊNTICA ao patient.js
  (incluindo o fix Z-up!) — sem ele TODA animação parece explodida (inclusive o Walk de
  produção!). Aula registrada: comparar sempre contra o clip de referência na MESMA página.
- **VEREDITO DO JUIZ NA PRIMEIRA GERAÇÃO RETARGETADA: UTILIZÁVEL** — "pernas alternando,
  joelhos dobrando, braços em contrafase, ereta, pés no chão, sem deformação".
- **Batch de emotes de sintoma rodando** (batch_emotes.sh): espirro, tosse, dor no peito,
  dor de cabeça, aceno, apontar garganta — 150f cada (~7 min/um na CPU). Saída em
  /media/servidor/nvme_data/kimodo/emotes/*.glb → retarget → clips extras no jogo.
- **iris 0.4.1 instalado** (~/.local/bin, brijr/iris): câmera de screenshots CLI+MCP p/ QA.
- **Pendências**: integrar emotes como clips extras do elenco (playClip por sintoma do caso);
  geração de personagens (Marina/José) segue dependendo de Hunyuan/Tencent (Blender aberto);
  Google Doc "Kimodo.CPP" do PO continua privado — exportar/compartilhar se quiser que eu leia.

### Rodada 20 (27/09) — **TESTA CORRIGIDA (cirurgia Blender headless) + casa arrumada** ✅
- **Causa raiz da "testa caída" FINALMENTE resolvida**: meu reweight via gltf-transform (R18)
  forçou 100% Head SEM recomputar as bind matrices → a franja deslocou PRA FRENTE (o PO
  viu certo: "do olho pra cima vem pra frente, moldou errado"). O diagnóstico no Blender
  headless (/snap/blender/7803/blender -b ✓) QUANTIFICOU: a franja estava no PLANO DO
  NARIZ (y≈+17,5-18,1; pele da testa ≈ y 9-11). Cirurgia (surgery_head.py): franja
  achatada p/ y≤11,8 (12 verts da borda — cabelo low-poly), cabelo da orelha direita
  puxado −1,5 (6 verts), reweight Head 100% NO BLENDER (rest = a própria mesh → sem
  deslocamento), export + extras re-aplicados (Blender perde asset.extras!).
  **Juiz: "testa NO LUGAR, rosto visível, CORRIGIDO."**
- **Gôndola: GLB renderizava a ~50%** (frame y≈1,0, caixas y≈0,6 — medido in-game) → os
  remédios do topo flutuavam ~1 m. Loader agora mede o bbox e normaliza p/ o fallback
  (2,4×2,1×0,5) — decoração (tags/lábios) e topo alinhados.
- **Tela do PC**: recuada 2 mm p/ dentro da face do monitor (PO: "alto relevo → embutida").
- **NVMe rule (PO)**: bashrc agora aponta GOPATH/GOMODCACHE/TMPDIR p/ a NVMe; /tmp/opencode
  (557 MB) e ~/go (308 MB) movidos p/ /media/servidor/nvme_data/scratch + tools/go-path.
- **Pendentes**: axila "mais definição" (o box da cirurgia pegou 0 — frame x difere; próxima
  leva corrige com o box certo) · braços "meio tortos" (delta 6,5° assimétrico — revisar) ·
  remédios DE DENTRO gerados no Hunyuan (precisa Blender+MCP com GUI) · emotes Kimodo
  (batch terminando em NVMe) p/ integrar como clips.

### Rodada 21 (27/09) — **REVERT completa da cirurgia Blender + lição aprendida** ✅
- **Blender roundtrip QUEBROU TUDO** (PO: "muito mais feio"): o export re-deriva o rig
  inteiro — bind matrices, rest pose, semântica dos canais — e o resultado foi couro
  cabeludo junto com testa, olhos junto com testa, testa indo pra cima e pra baixo.
  A causa: os 12 verts da franja achatados + 14 reweight Head no Blender mudaram o
  REST POSE VISÍVEL (não só os pesos — o glTF renderiza o bind pela composição
  Σ wi·Mi·Bi⁻¹·v_bind, e qualquer alteração nessa fórmula desloca o que se vê em
  descanso). O Blender re-export é PERIGOSO para assets com frames crus/pinhados.
- **Asset revertido** para ana_coriza_pre_fringefix.glb (pré-cirurgia — walk/idle/axila
  funcionando; franja no estado original "aceitável mas não perfeito").
- **45 frames capturados** (15 idle + 30 walk, câmera padrão) — juiz: TODOS OK (rosto
  visível, cabelo não cobre, testa natural, couro não separa). ESTE é o estado real.
- **PC screen**: PlaneGeometry (sem espessura) 1mm à frente da face do monitor.
- **Gôndolas**: topDisplay removido (flutuava), lips/tags/back do decor removidos
  (PO: "divisão no meio" que não casava com o GLB escalado). O GLB normalizado
  com rótulos de marca nos remédios internos é o que fica.
- **REGRA**: nunca mais operar o ana_coriza.glb no Blender sem capturar frames
  antes E depois. A análise deve ser visual sequencial (frames), não screenshot pontual.
- Deploy produção (healthcheck 200).

### Rodada 22 (27/09) — **REVERT TOTAL da cabeça + animação reduzida** ✅
- **"HORRÍVEL" (PO com screenshots + análise)**: meus dois "fixes" da franja RASGARAM o
  rosto — o fix de pesos (Head 100% em 8578 verts) E o fix de posição (3205 verts
  esmagados para y=0,025) literalmente partiram a cabeça: "a parte frontal do rosto
  está completamente separada da parte posterior, com um vão vazio vertical no meio
  do crânio". Aprendi: NUNCA mexo na malha da Ana sem ver o resultado completo antes.
- **Asset revertido para pre_fringefix** (antes de QUALQUER mexida na franja):
  pesos originais (56% Head + 32% Spine2 + 6% Neck), posições originais (cabelo
  arredondado, rosto intacto). Gate 100% PASS.
- **Idle head sway reduzido**: yaw ±3→1,5° · pitch ±1,5→0,5° · roll ±1→0,5° (PO:
  "testa subindo e descendo numa grande proporção"). Gate atualizado (0,5-3°).
- **Pé afundando no walk**: REMOVIDO o stanceDelta (medição fantasgada). Agora
  bobBaseY = groundFix.alvo direto — o walk clip tem o Hips pinado no mesmo valor
  do idle, então a altura deveria ser a mesma. Sem subtrações, sem calibração.
- Deploy produção (healthcheck 200).
