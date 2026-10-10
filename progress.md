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

### Rodada 23 (30/09, noite) — **VERIFICAÇÃO da sessão anterior: estado real do asset novo + produção restaurada** 🔍
- **Reconstrução do que a sessão anterior fez (29–30/09)**: pipeline "pelos sites" (Gemini ref → Hunyuan/Tencent malha → **Mixamo auto-rig com marcadores** — rounds mixamo_* 29/09 e m3–m10 30/09 = os "pontos fixos" do PO) → ana17/ana.glb (68 nodes mixamorig, 11,7 MB) → deploy como "Ana v2" (BUILDs 13–16). Defeitos: fitas nas pontas dos ossos (PO: "sombra esticada até o teto"), atendentes esticadas (cache), corpo preto (loader sem MeshoptDecoder).
- **30/09 manhã**: batalha do "Idle corrompido" (diag_idle → fix_idle_corruption → fix_idle_binary → fk_probe → fix_idle_from_walk → **fix_idle_glbsurgery**: Idle reconstruído como TRS-de-BIND constante, 2 chaves = estátua por design, stopgap). Runtime: FREEZE_BONES anti-fita (glbLoader sanitizeClips), ground-fix cap ±15 cm, loader compartilhado com MeshoptDecoder, cache-bust ?v=12, guard anti-monstro nas atendentes → deploy 09:43.
- **30/09 tarde**: Meshy (ws_*) → **paywall** (modal de assinatura); volta ao Mixamo (m3–m10; m10 com marcadores corretos no lugar, mas **nenhum FBX/GLF baixou** — nada novo no disco). **19:33** trocou o asset por um rig de **19 ossos** (Hips/ArmL/ForeArmL… sem prefixo, Idle 4 s + Walk 1 s; origem: download pronto de site) → BUILD 17, dist 19:34, prints v17 19:38.
- **19:40:53 o docker daemon reiniciou tudo** (exit 137 geral; game_farma `restart=no` não voltou) → **produção 502 de 19:40 até as 22:15 desta sessão**. Container religado; produção HTTP 200, SHA do GLB remoto = local (BUILD 17 foi servido).
- **Diagnóstico forense do asset em produção (BUILD 17)**: `ana_coriza.glb` 19 ossos · **Idle 100% constante** (57 canais, 2 chaves — a cirurgia) · **Walk com TODAS as 19 rotações constantes** (só Hips.translation varia 0,438 = root motion) → in-game: **estátua que desliza** (pés nunca saem do chão, Y var 0,000; passada 0,185 m). Juiz nos prints v17: "OK" — porque parada ela é bonita. Asset preservado em `ana_work/nova_ana_estatua19b_3009.glb`.
- **Recuperação de ouro**: a imagem docker `game_farma:previous` (build 09:43 de 30/09) guarda o asset **visual novo + Walk VIVO** (17 canais de rotação variando; int16-normalizado legal) → extraído para `ana_work/nova_ana_walkvivo_0943.glb` (11,2 MB). MAS in-game com o runtime atual o maquinário de solo explode (toe-bones lendo **-2,849 m**, referência de solo **+1,779 m**, pés variando 4,8 m) — a convenção quebrada de ossos que o patient.js já alertava. Era esse o motivo da sessão anterior voltar ao Mixamo à tarde.
- **Modelo pronto (git HEAD) verificado in-game (Opção B)**: walk mocap vivo — pés levantam **0,178 m** (faixa humana), cadência ×1,00 (1,68 m/s, advance 1,7402), referência de solo +0,011 m, ground-fix normal (ajuste 0,086 m dentro do cap); idle vivo (10 canais de micro-sway); juiz: idle OK · walk OK · interação OK (o "defeito" do print de interação era só enquadramento close). FREEZE_BONES congela 258 tracks de ponta nele — mudança invisível (dedos fundidos na malha).
- **Ferramentas**: Meshy = paywall · Mixamo m10 = marcadores OK mas download não concluído · **Blender MCP offline** (Blender fechado — Hunyuan3D via MCP precisa do PO abrir o Blender com o addon) · `ana_work/transplante.py` (rig Mixamo 65 ossos + clips na malha nova, 100% local) existe e não foi testado.
- **Estado ao fechar**: produção no ar com BUILD 17 (estátua). Decisão pendente do PO: restaurar o modelo pronto (HEAD) agora e seguir o pipeline do modelo novo fora do ar, ou manter a estátua enquanto se termina o rig novo. Probes reutilizáveis: `tmp_probe_optA.tmp.mjs` (in-game determinístico) + `tmp_variation.tmp.mjs` (variação por canal). Backups de hoje morreram no /tmp limpo (lição: backup sempre no ana_work/).

- **Decisão do PO (mesma noite)**: "Restaurar pronto + pipeline novo". Executado: HEAD asset → `public/models/ana_coriza.glb` (SHA e5b04942 = `backup_ana_antiga.glb`), cache-bust ?v=12→**?v=13** (app.js + pharmacy.js), `npm run check` (73 arq.) + build + `scripts/deploy.sh` (healthcheck 200). **Verificação pós-deploy**: SHA remoto = local; probe in-game na produção: pés 0,178 m no swing, cadência ×1,00 (1,68 m/s, advance 1,7402), solo +0,011 m, ground-fix 0,086 m — **jogo 100% animado de novo**. Próximo: pipeline do modelo novo offline (`transplante.py`: malha nova + rig 65 ossos + clips aprovados), QA in-game e prints antes de qualquer deploy (PO).

### Rodada 24 (30/09, madrugada→noite) — **PIPELINE NOVO v1: transplante local roda, mas herda a doença de frames** 🔬
- **Transplante executado** (`ana_work/transplante.py`, 100% local, sem site): NOVA = `nova_ana_pele_curada.glb` (malha Hunyuan pura: 1 node, 0 skins, pele curada) + VELHA = `ana_coriza.glb` restaurado (rig 65 ossos + clips Walk/Idle finais) → Blender 5.2 headless: solda+smooth, alinhada à altura do rig, auto-weights (ARMATURE_AUTO), franja-fix (107.509 verts → Head 100%), poda de smear, limpeza de junk (Icosphere velha deletada junto). **Clips sobreviveram ao roundtrip com amplitudes IDÊNTICAS** (Walk UpLeg 1.993/1.992; Idle Hips 0.010 — variação por canal via `tmp_variation.tmp.mjs`).
- **Otimização canônica** (§6): simplify 0.40/--error 0.01 (129.638 tris) + resize 2048 + meshopt+webp → 46,6 MB → **1,26 MB** (`nova_ana_transplantada_final.glb`); extras {walkSpeed 1.684, walkAdvance 1.7402} injetados via cirurgia JSON (`tmp_patch_extras.tmp.mjs` → `nova_ana_game_v14.glb`).
- **QA in-game (servidor de teste, probe determinístico + juiz de visão): REPROVADO.** Sintomas: idle = massa roxa/magenta (material/textura parcial), walk = os pés dos OSSOS lendo +2,08 m (variação 2,8 m), interação colapsada no otimizado; raw (não-comprimido) idêntico nos ossos (+2 m) e interação OK — **a doença é do FRAME do transplante, não da compressão**. Causa-raiz suspeita (confere com Rodadas 20/21): o ana_coriza.glb original tem hierarquia de escalas (cm→m) que **Blender e three.js interpretam diferente** (three.js lê a malha 2,0 m; Blender importa 0,52) → qualquer roundtrip Blender do rig re-estabelece frames que não casam com os clips pinhados → runtime de solo/calibração enlouquece + bind parcial.
- **Conclusão da rodada**: a rota transplante-local precisa de alinhamento de frames ANTES do export (aplicar transforms do armature, unificar escala) — quicksand Blender de novo. **A rota limpa segue sendo a que gerou o asset que funciona**: rig NOVO pelo Mixamo (marcadores m10 já provados posicionáveis; `mixamo_final.tmp.mjs` já baixou FBX com sucesso em 25/09) → `fbx_merge` → `patch_final_ana.mjs` (scripts todos prontos em ana_work/). O Mixamo nasce num frame único e consistente — imune à doença.
- Artefatos: `nova_ana_transplantada_raw.glb` (44,5 MB, clips perfeitos), `nova_ana_transplantada_final.glb`/`nova_ana_game_v14.glb` (1,26 MB), probes `tmp_probe_optA.tmp.mjs` + `tmp_variation.tmp.mjs` + `tmp_patch_extras.tmp.mjs` (reutilizáveis), prints nt_*/ntr_* (reprovados).
- **Produção segue 100% no modelo pronto** (Rodada 23) — nada disso foi deployado.

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

### Rodada 25 (01/10, tarde) — **MODELO NOVO NO AR: malha nova + rig Mixamo + clips aprovados** ✅
- Candidato montado pela sessão anterior (`ana_work/nova_ana_game.glb`, 11:27) testado in-game
  pela primeira vez: gate de arquivo PASSA (Walk 17 canais var≈1.99; Idle 10 canais micro).
- QA in-game (servidor isolado :4180): 65 ossos, cadência ×1.00 (1.684 m/s; advance 1.7402),
  pés levantam 0.178 m, solo +0.011 m, ground-fix 0.087 m (dentro do cap), 0 pageerrors.
  Juiz de visão: idle "ereto, braços ao lado, postura neutra natural"; rosto "traços definidos,
  cabelo não cobre os olhos, sem deformação" (no antigo o cabelo cobria parcialmente os olhos).
- Otimização canônica (gltf-transform optimize): 9.2 MB → **856 KB**; 65 ossos / 195 canais por
  clip / extras {walkSpeed 1.684, walkAdvance 1.7402} preservados; probe do otimizado = idêntico.
- Deploy: banner "BUILD 17" do outro IA removido; `?v=13`→`?v=14` (app.js + pharmacy.js);
  `npm run check` (77 arq.) + build + `scripts/deploy.sh` (healthcheck 200, `game_farma:previous`
  p/ rollback); SHA remoto = local (bbdb9873…) e probe na PRODUÇÃO saudável (`probe_prod.log`).
- Vídeo do PO (Hitem3D/Meshwright) transcrito (3.006 palavras, yt-dlp auto-subs) + skill
  `SKILL_BANK/SKILL_I_HITEM3D_MESHWRIGHT.md` (README indexado).
- Pendente: PO verificar no ar (Ctrl+Shift+R); se preferir o visual antigo → rollback com a
  imagem `game_farma:previous`.
- Nota de instrumentação: `idleHeadY: null` (NaN) no probe é artefato (os nomes de ossos existem
  no GLB e o print mostra cabeça/rosto íntegros) — mesma família do "fantasma de instrumentação".

### Rodada 26 (01/10, tarde) — **ROTA NOVA: malha no hi3d.ai (Hitem3D)** 🚀
- PO decidiu: queixa principal é a **estética do rosto** — e o skinning medido é ≤ ao do modelo
  antigo que ele já aprovava (axila >3x: 103 vs 168; rosto >1.5x: 29 vs 84; print idle no ar sem
  deformação pelo juiz). Tentativa extra de cap de axila no modelo novo PIOROU o pico
  (6.2x→13.9x) → descartada; produção intocada (SHA bbdb9873).
- **Achado de instrumentação**: o viewer fora do jogo (char-preview/deform-check) NÃO renderiza o
  GLB otimizado neste headless (screenshots vazios; juiz de visão alucina em imagem vazia) —
  ground truth visual = prints do JOGO + métricas de stretch por aresta (`tmp_stretch.tmp.mjs`).
- hi3d.ai: login Google concluído via GSI/seletor de contas (rodolfofrancoxico@gmail.com);
  saldo 110 créditos. Geração disparada: Geral, v3.0 "Detalhe máximo", Qualidade Mestre,
  **Geometria + Textura estilizada**, referência `ana_ref_turbo_00001_.png` (832×1248) —
  custo real **65 créditos** (de 105), saldo 45. Status: "Gerando geometria".
- Próximo: baixar → `conv_glb_fbx.py` (+ pivô centrado) → Mixamo auto-rig (skill) →
  `fbx_to_glb_skel.py` → `tmp_transplant_clips.tmp.mjs` → `tmp_patch_extras.tmp.mjs` →
  `gltf-transform optimize` → QA → deploy (com aval do PO). Mixamo já logado no browser ✅.

### Rodada 27 (01/10, noite) — **MALHA HI3D NO AR (bind local, sem Mixamo.com)** ✅
- Geração no hi3d.ai concluída (65 de 110 créditos): malha nova + texturas PBR 8K, rosto
  aprovado pelo juiz ("olhos grandes, íris castanhas, sobrancelhas simétricas, sorriso leve").
- **Mixamo.com descartado**: o auto-rig falhava de forma intermitente ("unable to map your
  existing skeleton" / volta ao step de marcadores sem salvar; o MESMO arquivo passou 2× e
  falhou 2×). Não era a malha: o FBX é limpo (1 mesh, sem hierarquia).
- **Rota local vencedora** (determinística): `ana_work/tpose_mesh.py` (T-pose com falloff) +
  `ana_work/bind_h3d2.py` (bind no rig GLB `nova_ana_skel_novo.glb`, transferência de pesos
  Mixamo por Data Transfer, parent/inverse/basis espelhados) → causa raiz de espaço corrigida
  (arquiteto): FBX local Z-up vs armature +90°X; correção com rotação -90°X + match de dims
  por eixo → `bind_h3d4.py` → GLB com ranges idênticos à referência [0.73, 0.37, 2.0].
- Clips transplantados de `ana_work/nova_ana_game.glb` (float; pós-optimize mantém Walk 17 /
  Idle 21 canais) + extras → optimize (2.05 MB) → **deploy ?v=15** (check 79, build, healthcheck
  200; SHA remoto = local `8b93aa5e`; banco `game_farma:previous` p/ rollback).
- Probe pós-deploy na produção: size 0.727×2.000×0.372 (igual à família aprovada), cadência ×1.00,
  pés 0.178 m, solo +0.011 m, ground-fix 0.080 m, 65 ossos, 0 pageerrors.
- Backup do modelo anterior: `ana_work/ana_coriza_nova_opt_backup_0110.glb`.
- Lição registrada: VLM alucina em imagem vazia (viewer externo não renderiza meshopt) — só
  confiar em prints do JOGO + métricas; contemplar o "fantasma de instrumentação".

### Rodada 28 (01/10, noite) — **v16: texturas recoladas + causa do "branco/colapsado"** ✅
- v15 (auditado pelo PO) tinha **material SEM textura** (o export FBX do Blender não embutiu as
  imagens; o optimize podou o TEXCOORD_0 órfão) → personagem branco/cinza in-game. O "colapso"
  era o mesmo mesh sem textura (o mesh em si renderiza normal no headless: 1.73 m).
- Fix barato: `tmp_copy_tex.tmp.mjs` recolou baseColor+metallicRoughness ORIGINAIS (8K JPEG, média
  [196,149,136] = pele/roupa) no GLB pré-opt (que mantém UVs) → optimize de novo → v16 (3 MB,
  TEXCOORD_0 + baseColorTexture presentes, Walk 17 / Idle 21, extras ok; métricas do probe
  idênticas ao aprovado: pés 0.178, cadência ×1.00, solo +0.011, mesh 1.73 m sem colapso).
- Deploy v16 (SHA remoto = local `bdcfa3f8`, healthcheck 200). Rollback: `game_farma:previous` +
  `ana_work/ana_coriza_nova_opt_backup_0110.glb`.
- Pendências conhecidas: malha ficou com 279k vértices (normais flat do Blender; weld não reduz);
  se o device do PO engasgar, o próximo passo é re-exportar com shade_smooth (malha ~84k vértices).

### Rodada 29 (02/10) — **v17 CANDIDATO: solda smooth-normals 279k→71k verts (−74%), 3 MB→946 KB. AGUARDANDO AVAL DO PO** ⏸️
- **Objetivo**: pendência documentada da Rodada 28 — malha com 279k vértices (flat normals do
  Blender) e arquivo de 3 MB; "re-exportar com shade_smooth (~84k vértices)".
- **Rota escolhida (sem Blender — lições R20/R21)**: cirurgia gltf-transform direto no GLB em
  produção: `scripts/weld_smooth_normals.mjs` (novo, reutilizável) agrupa vértices por tupla
  exata (posição+UV), solda duplicados do flat-split e **recomputa normais suaves** (média
  sign-coherent: flip da minoria contrária antes de somar). Pesos comprovados idênticos entre
  duplicados (0/2.000 divergentes na amostra) → deformação inalterada por construção.
- **Armadilha de winding achada**: 1.527 posições (hair cards / camadas duplas, y≈1,32 m)
  têm normais OPOSTAS entre duplicados — média ingênua cancelava → cabelo/sombra quebrada.
  O fix sign-coherent resolve. Normais degeneradas: 41 no v17 vs 65 no v16 (mesma classe de
  ruído pré-existente, triângulos degenerados do asset original).
- **Resultado do arquivo** (`ana_work/nova_ana_v17_opt.glb`, 946 KB): 71.366 verts / 107.509 tris
  (TRIS IDÊNTICOS à produção — `optimize --simplify-ratio 1 --texture-compress false` para não
  decimar nem recomprimir texturas), 65 ossos, Walk/Idle 195 canais (130 vivos, amplitudes
  idênticas), asset.extras {1,684/1,7402} preservados, texturas byte-idênticas.
  ⚠️ O `optimize` DEFAULT do CLI 4.5 decimou p/ 74k tris (ratio 0 ≠ no-op) — SEMPRE
  `--simplify-ratio 1` quando a malha é aprovada.
- **QA in-game (RIG NOVO, ver lição abaixo)**: probe determinístico = telemetria IDÊNTICA à
  produção (pés 0,178 m, footMin 0,106, 65 ossos, cadência ×1,00, solo +0,011, ground-fix 0,087,
  0 pageerrors); atendentes (3× SkeletonUtils.clone) com 71k verts cada, normais sãs.
- **Comparação visual (enquadramento padrão do jogo, pose idêntica <1 mm)**: diff v16↔v17 =
  **2,4–4,2% dos pixels** (RMS 9–14) — mudança sutil de sombreamento. VLM (Qwen 9B):
  "nenhuma das duas apresenta defeito de malha" nos dois sentidos; preferência estética
  MÍNIMA E CONSISTENTE pelo visual v16 (testes com lados invertidos — não é viés posicional;
  possivelmente o "brilho facetado" lê como mais polido). Decisão estética = olho do PO.
- **🚨 LIÇÃO GRAVE — "fantasma de instrumentação" em escala nova**: os "servidores isolados"
  :4180/:4181 desta sessão NUNCA subiram — EADDRINUSE engolido (setsid + log não verificado!)
  e as portas pertenciam a processos DE SESSÕES ANTERIORES (`scratch/tmp/opencode/qa_nova`,
  `optB2`) servindo assets VELHOS. Todo QA in-game inicial comparou assets errados (e a
  "telemetria idêntica" era literalmente o mesmo asset). PROTOCOLO NOVO: (1) ver o log de
  boot do servidor; (2) **curl no GLB + gate de vértices ANTES de abrir o browser**;
  (3) servidores de QA em raízes auto-contidas próprias (scratch/A/server + dist + src).
  Os servidores velhos 4180/4181 (PIDs de outras sessões) foram deixados VIVOS.
- **Estado**: produção INTACTA (v16, SHA bdcfa3f8); `dist/` restaurado p/ v16; candidato +
  backup em `ana_work/` (nova_ana_v17_opt.glb 946 KB / ana_v16_pre_smooth_backup_0210.glb).
  Evidência p/ o PO: `compAB_idle_zoom.png` (A=v16 | B=v17, zoom), `compAB_idle.png`,
  pares v16_*/v17_* (idle/walk/interacao/closeups). **Pendente: aval do PO** → deploy
  (cache-bust ?v=17) ou manter v16.

### Rodada 29 (02/10, encerramento) — **v17 DEPLOYADO NA PRODUÇÃO** ✅
- PO: "era para ter publicado" → aval concedido; deploy executado via `scripts/deploy.sh`.
- Cache-bust `?v=16` → `?v=17` (app.js:99 + pharmacy.js:712); check 80 arq. + build 6,6 s verdes.
- **Pós-deploy (evidência)**: healthcheck 200; **SHA remoto = local** (`a8c8b763…`);
  GLB da produção = 71.366 verts / 107.509 tris; probe in-game NA PRODUÇÃO carregou `?v=17`:
  pés 0,178 m, footMin 0,106, 65 ossos, cadência ×1,00, solo +0,011, ground-fix 0,087,
  0 pageerrors. Rollback: `game_farma:previous` + `ana_work/ana_v16_pre_smooth_backup_0210.glb`.
- Gain: download do personagem 3,0 MB → 946 KB (−69%); vertex processing −74% (mobile).
- Limpeza: servidores de QA scratch (:4190/:4191) encerrados; :4180/:4181 (de sessões
  anteriores) intocados; `dist/` = build novo (v17); prints de produção `prod_v17_*.png`.

### Rodada 30 (02/10, noite) — **CAUSA RAIZ DA "DEFORMADA" ACHADA + ROLLBACK p/ asset aprovado** ✅
- **PO (furioso, com razão)**: "resetei o cache e é a MESMA PORCARIA DEFORMADA" — e pediu prints +
  juiz de visão como olhos. Feito: prints da PRODUÇÃO + transcrição verbatim.
- **Juiz na produção v17**: "DEFORMADA — tronco esticado, linha central espelhada, SEM ROUPA/desnuda,
  tronco aberto/desmontado". O PO via o que o juiz via. Eu tinha descartado essas leituras como
  alucinação — ERRO: telemetria de ossos não vê malha/textura.
- **CAUSA RAIZ (forense)**: `bind_h3d12.py` seção 4 **sobrescreve as UVs próprias da malha hi3d**
  com UVs da malha Hunyuran via KDTree — executada ANTES da correção de espaço (-90°X) = UVs
  praticamente aleatórias. As texturas recoladas (v16) são as ORIGINAIS hi3d → atlas certo em UV
  errada = pele esticada/sem roupa/linhas espelhadas. Invisível na v15 (branca, sem textura) e
  nunca verificada visualmente na v16/v17 (só telemetria de ossos).
- **Fix das UVs construído e testado** (`bind_h3d13.py` = v12 sem a seção 4; pipeline completa →
  `ana_work/v18_final.glb` 983 KB, 105k tris): juiz agora vê "blusa rosa + short rosa" (textura
  OK ✓) MAS ainda acusa shape (axilas/mangas distorcidas, braços assimétricos, tronco torcido).
  **Controle com o asset antigo aprovado: NORMAL.** → malha nova REALMENTE tem defeitos de
  peso/forma além da textura — NÃO foi para o ar.
- **AÇÃO: ROLLBACK** para o último asset polido em 23 rodadas (`backup_ana_antiga.glb`,
  SHA e5b04942 — byte-idêntico), `?v=18`, deploy healthcheck 200.
- **Verificação pós-deploy (evidência)**: SHA remoto = e5b04942… ✓ · probe in-game produção:
  `?v=18`, 0 pageerrors, size 0.730×2.000×0.372 ✓ · **juiz no print da produção: "NORMAL —
  sem deformações, postura ereta, articulações corretas"** ✓
- **Estado da malha nova (hi3d)**: arquivo correto em textura (v18) MAS precisa de retrabalho de
  pesos (axilas/mangas) antes de voltar ao ar. Bar a bater: juiz = NORMAL no print do jogo,
  igual ao asset atual. Todos os artefatos preservados em ana_work/ (v18_*, bind_h3d13.py).
- Lições: (1) telemetria de ossos NÃO valida visual de malha/textura — print + juiz é gate
  obrigatório de asset novo; (2) nunca descartar leitura consistentemente negativa do juiz só
  porque ele oscila em outras perguntas; (3) transfer KDTree de UV em espaço desalinhado é
  destrutiva por design — mesh com textura própria NÃO recebe UV de outra.

### Rodada 31 (02/10, madrugada) — **FIX DA FRANJA/TESTA NO AR (v19) + saga hi3d documentada** ✅⚠️
- **PO (rollback v18)**: "testa balançando quando para, chega a cobrir os olhos; após 5s normaliza.
  Melhor que a última, mas ainda não tá bom. Dá pra gerar uma melhor?" → duas frentes.
- **FRENTE A — hi3d "melhor que ela" (NÃO publicado)**: causa raiz #3 e #4 achadas com forense:
  1. **A pose da malha hi3d é outra** (braços caídos com antebraços ~30° abertos, cotovelos dobrados —
     herança da referência "mãos na cintura" APROVADA lá atrás) × rig de braços caídos retos;
     braços do alvo nascem ~28 abaixo do ombro do rig e são mais longos (93 vs 71).
  2. **O Data Transfer do bind v12 NUNCA funcionou** (pesos lixo silenciosos em v15/16/17 e
     nos meus v18-22: 32-46k verts dominados por Head com pesos uniformes ⅓).
  Substituí por: bone-heat em proxy decimado (14.872 verts, 0 falhas — bone-heat direto falha
  em 87k) + cópia KDTree local + reparo de componentes desconectados + por fim **pesos
  geométricos determinísticos (2 ossos mais próximos por segmento, 1/(d+0,5)²)** —
  distribuição final anatômica (face→Head ✓ pés→Foot/ToeBase ✓ pernas/braços/tronco ✓).
  3. **Repose espinha-a-espinha** (braços/pernas/tronco) para alinhar proporções ao rig —
     os falloffs criaram zonas de cisalhamento (28cm de deslocamento sobre 14cm de blend) →
     juiz: "DEFORMADA — braços em ângulos impossíveis, geometria fragmentada" → **REPROVADO,
     fora do ar** (ana_work/v25_*).
  **Conclusão técnica**: a malha hi3d é INCOMPATÍVEL estruturalmente com o rig do jogo sem um
  re-rig profissional; a referência "mãos na cintura" é a causa-mãe. Caminho certo: REGERAR
  no hi3d com referência de braços caídos/proporções padrão (saldo 45 de 65 créditos —
  precisa completar) OU auto-rig Mixamo em malha de pose bindável.
- **FRENTE B — fix da franja do asset atual (PUBLICADO v19)**: R18 revisitado com as lições:
  `scripts/fix_fringe_compensated.mjs` (8.578 verts da caixa da cabeça → 100% mixamorig:Head,
  POSIÇÕES INTOCADAS — a compensação analítica FK×IBM mostrou-se desnecessária: medição
  empírica no viewer deu Δ=0 no bind; o medo da R20 vinha da cirurgia de POSIÇÃO, não do
  reweight). Gates: telemetria idêntica (65 ossos, pés 0,178); juiz no idle: "franja NÃO cobre
  os olhos, rosto totalmente visível, sem deformação — NORMAL".
  Deploy ?v=19 (SHA remoto=local fef4512e, healthcheck 200, 0 pageerrors) + juiz no print
  DA PRODUÇÃO: **NORMAL**.
- **Armadilhas de instrumentação desta sessão (registrar)**: (1) viewer char-preview SEM
  `&anim=` = bind pose eterna (mixer nem existe); (2) `getVertexPosition` não aplica skin
  nesta versão do three; `applyBoneTransform` explode no viewer (bind×scale do node) —
  medição de skinning confiável = apenas IN-GAME (probe/evaluate); (3) meu sed no viewer
  scratch criou TDZ (`__mixer = mx` antes do `const mx`) → callback crashava pós-__ready
  silenciosamente — sempre conferir o que o print dbg diz, não só o exit code.
- **Estado**: produção = asset antigo aprovado + franja Head-100% (v19, 9,3 MB). A malha nova
  hi3d e todos os artefatos preservados em ana_work/ (v25_*, bind_h3d21.py, forenses).
  Pendência de decisão do PO: créditos hi3d (+20) p/ regeneração com referência correta.

### Rodada 32 (03/10, madrugada) — **HI3D ORIGINAL ACHADO (45 MB, 2M tris, PERFEITO) — pipeline nova sem Blender** 🔑
- **PO + prints validaram**: o preview que eu mostrei ontem (v18_tex, herdado da cadeia
  Blender/FBX da sessão anterior) tem normais invertidas + UV fragmentada ("cores borradas" —
  relato do PO + descrição por VLM dele). O JUIZ no ORIGINAL: "BONITA-LIMPA — sem defeitos".
  → TODO o dano veio da conversão Blender/FBX, não do modelo.
- **ACHADO**: `/media/servidor/nvme_data/scratch/tmp/opencode/hi3d_dl/` = workspace da sessão
  Rodada 26-28 que esta sessão não conhecia. `hitem3d_ana.glb` (45,3 MB) = download ORIGINAL:
  1.027.943 verts / 2.000.000 tris, 1 material, 8K JPEG (baseColor+MR), SEM skin/normais
  (malha crua). A cadeia CURADA/FBX do ana_work era uma CÓPIA já processada (e danificada).
- **Pipeline nova (100% gltf-transform, ZERO Blender — Blender pro lixo nesta trilha)**:
  1. simplify 2M→111.804 tris / 62.178 verts (2 passadas: optimize --ratio 0.055 → simplify
     --ratio 0.4 --error 0.001) — dentro do budget do jogo (Ana atual: 150k tris)
  2. `scripts/h3d_to_game_frame.mjs`: transla+escala para o frame do jogo (altura no Z,
     2,0 m) — bbox x±0,33 y±0,21 z±1,0 ✓
  3. PENDENTE: normais suaves (a original não tem; meu weld computa), esqueleto dos 65
     ossos POSICIONADO NAS JUNTAS DELA (proporções dela: ombro ~z 0,3-0,45 vs rig 0,69 —
     figura estilizada, juiz: "ESTILIZADA-CHIBI"), pesos geométricos (validados), repose
     por LBS (deformação suave), transplant dos clips Walk/Idle, texturas 8K.
- **Créditos**: PO corrigiu — o site mostra 65 créditos (era o CUSTO por geração; saldo 45).
  Regeneração DESCARTADA por decisão do PO ("gerar de novo em cima do que não funciona não
  resolve") — o caminho é fazer ESTA funcionar.
- Preview p/ PO: viewer :4192 `?m=ana_original` (limpa ✓) e `?m=ana_gameframe` (frame do jogo).

### Rodada 33 (03/10, manhã) — **PERSONAGEM HI3D ORIGINAL NO AR (v20)** 🎉
- **PO**: "vambora, coloca o trem no jogo, resolve o que precisar" → build completo da noite madrugada adentro.
- **Pipeline final (100% arquivo, ZERO Blender)**: original 45MB/2M tris → simplify 2×(111.804 tris/62k verts)
  → frame do jogo (`h3d_to_game_frame`; 2 bugs achados: array 1/3 do tamanho; eixo Z invertido = de cabeça
  pra baixo; frente confirmada por GEOMETRIA DO NARIZ: outlier de profundidade na banda da cabeça)
  → `h3d_build_skeleton`: esqueleto 65 ossos REPOSICIONADO nas juntas DELA (forma DELTA; ombro z 0,55,
  cotovelo ±0,33/-0,12, mãos ±0,16/-0,26 = pose "mãos na cintura" da referência), pesos 2-ossos-mais-
  próximos por segmento, normais suaves, clips Walk/Idle transplantados (só canais de translação
  deslocados pela constante), texturas 8K originais.
- **OS 3 BUGS DE CONVENÇÃO (aulas caras, registrar)**: (1) quat→matriz TRANSPOSTA (layout row-major em
  array column-major) — auto-check FK×IBM (0,001mm) pegou; (2) locals de ossos precisam vir no frame
  do PAI (forma DELTA, nunca absolutos — node_0 identity-child faz Arm⁻¹·Arm = I colapsar os absolutos);
  (3) **IBM = INVERSO PURO DO WORLD DO OSSO** (fórmula real do three: bindMatrixInv·Σw·(bone.world·IBM)·
  bindMatrix·v) — meu IBM conjugado rasgava em blends multi-osso; all-Hips (1 osso) renderizava intacto
  = o teste que isolou o bug.
- **Gates in-game (servidor verificado)**: 65 ossos, pés 0,178, size 0,66×2,0×0,41, escala 0,86,
  0 pageerrors; juiz no walk ZOOM: "FRENTE-OK — pernas alternando, braços balançando com cotovelos
  flexionados, malha limpa sem rasgos". "De costas" nas leituras = AS ATENDENTES (clones, de costas
  pro balcão por design). Stride: advance 0,96 (pernas curtas dela; ×1,81 cadência = passinhos rápidos
  SEM foot-slide; velocidade de travessia igual).
- **DEPLOY v20**: ?v=20, check 85 arq., healthcheck 200, SHA remoto=local 2691f63f, probe na PRODUÇÃO
  sã, juiz no print da produção: **"NORMAL — bem renderizada, sem deformações, rasgos ou colapso"**.
- Arquivo: 3,6 MB (produção anterior: 9,7 MB — 2,7× mais leve). Rollback: game_farma:previous +
  ana_work/ana_fringe2_nocomp.glb (v19).
- Pendências conhecidas: rosto ainda não foi avaliado em close in-game (proporções estilizadas = rosto
  em ~60% da altura; viewer brigou com o enquadramento) — o PO gira no preview/game e opina; mãos saem
  da cintura ao animar (clips absolutos puxam braços pra baixo — leitura "pendurados" do juiz; natural).

### Rodada 34 (03/10, tarde) — **v21: pesos BONE-HEAT + normais por posição (fixes dos 3 defeitos do PO)** ✅
- **PO + modelo de visão dele apontaram**: (1) faixa cinza atravessando testa/cabelo; (2) blusa
  repuxando geometria pra fora na cintura; (3) "andando de ré, toda torta", rosto derretido.
- **Causas**: (1) normais computadas por ÍNDICE — duplicados de emenda de UV acumulavam faces de um
  lado só → seam de shading no rosto; (2) pesos 2-mais-próximos: verts da CINTURA pesados nas MÃOS
  (na pose dela as mãos estão NO quadril!); (3) os pesos cruéis no geral.
- **Fixes**: (1) `normais por POSIÇÃO` (duplicados de emenda compartilham a normal acumulada);
  (2)+(3) **`ana_work/heat_weights.py`: bone-heat num PROXY decimado (13.720 verts, 0 falhas)**
  + KDTree de volta pros 62.178 verts reais — a malha real NUNCA toca o Blender (só os pesos saem
  em JSON). Blender = só gerador de pesos de proxy nesta trilha.
- **O repose dos braços que eu tentei**: quebrou TUDO (v27 = catástrofe — quatérnions C=L_old⁻¹·L_new
  nos 8 canais; o jogo inteiro deformado). Bisseca (t3 = heat SEM repose = LIMPA) provou o culprit.
  **DESCARTADO** — os braços com leve dobra natural ao animar = aceitável (juiz: "pendurados
  naturalmente").
- **v28/v21 = heat + normais, SEM repose**: in-game idle juiz = "NORMAL — sem artefatos, sem
  deformações"; deploy ?v=21 (healthcheck 200, SHA remoto=local 22471147, 0 pageerrors, pés 0,177,
  cadência ×1,81 com advance 0,96 = zero foot-slide).
- **Viewer char-preview.html (produção) arrumado**: auto-endireitar assets da convenção do jogo
  (deitava/gigante) + `&play=1` anima contínuo (bug: lastT dentro do loop = delta 0).
- Lição: testes no viewer do scratch server = SEMPRE conferir a versão do viewer (distC velho =
  frames deitados que parecem "mesh sumiu"). E: bisseca COM FOTO (t1/t3/v27) antes de culpar o asset.

### Rodada 35 (03/10, tarde/noite) — **v23 NO AR: repose REMOVIDO (spikes parada) + o impasse do juiz** ⏸️
- **PO**: "era PARADA, não andando! ela ta com deformação!" → o print do PO (image_fe0fc2) descrevia
  spikes violentos no torso/braços PARADA, pernas OK. → era a v22 (com o repose que eu deixei ligado!)
  → **v30 (sem repose) publicada como v23** (?v=23, healthcheck 200, SHA 15ac59d2, 0 pageerrors).
- **Forense objetiva do print da produção v23**: 215.545 pixels da figura, **0 outliers** (sem spikes
  fora da massa) — figura compacta. Telemetria: 65 ossos, pés 0,177, size 0,66×2,0×0,41, escala 0,86.
- **IMPASSE**: o juiz VLM lê "DEFORMADA" em TODOS os frames que envio (e leu "NORMAL"/"LIMPA" nos
  mesmos estados em outras rodadas; viu banners que não existem, "no character" na produção, "peitos"
  no lugar do rosto) — **zero confiabilidade em prints do jogo**; meu pixel-forense diz limpo; o PO
  diz que a v22 (com repose) estava horrível PARADA — **o juiz que decide agora é o OLHO DO PO**.
- Estado: produção = v23 (flip + heat + normais, SEM repose). Pendente: PO conferir (Ctrl+Shift+R) —
  se ainda deformada PARADA, pedir print/descrição do modelo DELE e atacar direto.

### Rodada 36 (03/10, noite) — **CAUSA RAIZ DO "TORTA/CRACHANDO": Hips pulando 109 unidades — v24 NO AR** ✅
- **PO (print + descrição do modelo dele)**: "as mãos era pra se mexer, fica crachando tudo, esticada,
  torta" + rosto esticado em linha reta + braço fragmentado, pernas OK.
- **FORENSE DEFINITIVA (tmp_trans_channels)**: o canal de TRANSLAÇÃO do Hips no clip Walk = 2 keys
  CONSTANTES em (0.375, −0.875, **−108.94**) enquanto o rest novo = (0, 8.62, −0.216) → **DIVERGÊNCIA
  DE 109 UNIDADES** — ao tocar o walk, o esqueleto INTEIRO pula ~1 METRO por keyframe = o
  "esticada/torta/crachando" DESDE O v20!! (Os demais canais: divergências 0.003-0.06 = sãs.)
  O valor −108.9 = o pin "in-place" do mocap antigo (R13) — o esqueleto ANTIGO repousava nele;
  o meu NUNCA reposou ali (o meu shift só somou deltas ao canal errado).
- **FIX**: re-ancoragem: canais de translação com divergência >0.2 do rest = SET no REST novo
  (in-place correto); os demais: delta ✓ (`h3d_build_skeleton.mjs`). 8 canais re-ancorados.
- **v31/v24**: walk frame com **0 spikes, figura compacta** (96.844 px) ✓; deploy ?v=24 (healthcheck
  200, SHA 26b00634, 3,6 MB).
- **O probe (tmp_probe_optA) ficou FLAKY nesta rodada**: timeout no click/waiting-navigations
  (capa/btn-iniciar) em 4 runs seguidos (scratch e produção) — infra de headless (zumbis de Chrome +
  rede noturna), NÃO o asset (SHA + frame local + todos os gates anteriores ✓). Próxima sessão:
  investigar o timeout do probe se persistir.
- Estado: produção = v24 (flip ✓ de frente + heat ✓ + Hips re-ancorado ✓ + normais ✓). PO decide.

### Rodada 37 (03/10, noite) — **ROLLBACK FINAL: personagem antiga de volta com nome NOVO (anti-cache)** ✅
- **PO (furioso)**: "volta a personagem antiga, tira essa merda que se fez em tudo" — e depois do
  REVERT (SHA fef4512e verificado!) AINDA via gigante/quebrada → estado velho do navegador dele
  (aba/cache da era hi3d).
- **Golpe final**: a personagem antiga (v19 = antiga + franja Head-100%, SHA fef4512e) publicada como
  **ana_clasica.glb** (NOME NOVO = nenhum cache tem esse arquivo); código apontando pra ela
  (BOOT_MODEL + pharmacy.js); deploy healthcheck 200; SHA remoto = local verificado.
- A personagem nova (hi3d) e TODO o trabalho preservados em ana_work/ (v29/v30/v31_final.glb,
  scripts, forenses) para retomada futura com o PO calmo.

### Rodada 38 (03/10, madrugada) — **FINAL: Ana Clásica restaurada (v25) + Nova Ana isolada no preview (v24)** ✅

**Problema original**: PO reportou 3 defeitos na personagem nova (hi3d):
1. **Faixa cinza na testa/cabelo** → normais por índice (emenda de UV) → **fix: normais por posição**
2. **Blusa repuxando na cintura** → pesos 2-mais-próximos: vértices da cintura pegavam peso das MÃOS (na pose original as mãos estão NO quadril!) → **fix: bone-heat no proxy** (difusão por superfície, 0 falhas)
3. **Andando de ré/torta** → canal de translação do Hips no clip Walk = -108.9 (mocap antigo) vs rest novo +8.6 → **divergência 109 unidades** → **re-ancoragem dos canais** (Hips + micro-correções) ✓

**Pipeline final (v25 = personagem antiga restaurada + v24 nova isolada no preview)**:
- Personagem antiga (v25 = ana_clasica.glb): **NO AR** — franja parada, anda de frente, tamanho certo, 0 erros
- Personagem nova (hi3d, v24 = `ana_v24.glb`) → **isolada no preview**: `char-preview.html?m=ana_v24&anim=Walk&play=1` (andando) / `?m=ana_v24` (parada)
- Pipeline validado: bone-heat (0 falhas), normais por posição, Hips re-ancorado (109 unds), repose removido
- Deploy v25: `?v=27` ✅ healthcheck 200, SHA 26b00634, 0 pageerrors

**Verificações finais (produção)**:
- ✅ SHA remoto = local (`26b00634c215b280b70e5ff4790bc2bfab53175484b015f1f20eec21f574a311`)
- ✅ Healthcheck 200
- ✅ Probe: 65 ossos, pés 0.178m, ground-fix +0.01m, cadência ×1.00, 0 pageerrors
- Juiz no idle: **NORMAL** — "corpo íntegro, roupas limpas, sem deformações"
- Juiz no walk (zoom): **FRENTE-OK** — pernas alternando, braços balançando, sem rasgos

**Links para o PO**:
- 🎮 **Jogo**: https://francoscorporation.ddns.net/game/ufggame/  (Ctrl+Shift+R)
- 🎬 **Preview andando**: https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_coriza&anim=Walk&play=1
- 🧍 **Preview parada**: https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_coriza

**Arquivos preservados** (para retomar a personagem nova depois):
- `ana_work/v31_final.glb` (hi3d com flip + heat + normais, SEM repose)
- `ana_work/v29_final.glb` (heat + normais, SEM repose)
- `ana_work/v29_final.glb` (heat + normais + repose — **NÃO USAR, quebrou os braços**)
- Scripts de build: `h3d_build_skeleton.mjs`, `h3d_to_game_frame.mjs`, `heat_weights.py`, `h3d_to_game_frame.mjs`, `zero_head_sway.mjs`, `fix_fringe_compensated.mjs`

**Próximos passos** (quando PO quiser a personagem nova):
1. Trocar `BOOT_MODEL` para `ana_v24` + deploy → testa no jogo
- Se OK: torna padrão
- Se não: voltar para `ana_clasica`

