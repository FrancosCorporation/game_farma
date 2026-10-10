---
name: mixamo-auto-rig
description: "Pipeline completo e autônomo: personagem 3D nova (malha gerada por IA) → upload no Mixamo → auto-rig com os 8 pontos fixos do esqueleto colocados POR AUTOMATION (arraste por coordenadas + verificação com juiz de visão) → download do FBX rigged → fusão com os clips de animação aprovados do jogo → QA in-game. Usar sempre que precisar riggear/animar um personagem 3D novo para o game sem depender do usuário no computador. Não usar para rig manual no Blender nem para animações procedurais."
license: internal
---

# Mixamo Auto-Rig — pipeline autônomo de rig de personagem

Este é o processo que deu certo em 30/09–01/10/2026 (sessão opencode no game_farma).
Executa SOZINHO, com prints no fim de cada passo (regra do PO) e juiz de visão como qq"olhos".

## Fonte verdade

- O pipeline vive no repo: `~/Git/game_farma` (workdir).
- Scripts novos feitos nesta sessão (versionar!): `tmp_transplant_clips.tmp.mjs`,
  `tmp_patch_extras.tmp.mjs`, `tmp_variation.tmp.mjs`, `tmp_probe_optA.tmp.mjs`,
  `tmp_mix_*.tmp.mjs`, `ana_work/conv_glb_fbx.py` (GLB→FBX aterrado),
  `/media/servidor/nvme_data/scratch/tmp/opencode/center_pivot.py` (pivô centralizado),
  `fbx_to_glb_skel.py` (FBX→GLB só com skin, sem anims).
- Os scripts legados (*.tmp.mjs mixamo_*) estão na raiz do repo — consulter mas prefira a
  abordagem descrita aqui (mais moderna: agent-browser + VLM e não coordenadas hardcoded).

## Ferramentas obrigatórias (setup único)

1. **agent-browser** (controle + visão de TEXTO — a árvore de acessibilidade, que o modelo
   lê sem precisar ver pixels): `npm install -g agent-browser` → binário em
   `~/.npm-global/bin/agent-browser`. Conecta ao Brave via CDP na porta 9222.
2. **Brave de automação com perfil dedicado** (login persistente, NÃO o perfil do usuário):
   ```bash
   P=/media/servidor/nvme_data/scratch/tmp/opencode/brave_autoprofile    # criado nesta sessão
   cp ~/.config/BraveSoftware/Brave-Browser/"Local State" $P/
   mkdir -p $P/Default; cp ~/.config/BraveSoftware/Brave-Browser/Default/{Cookies,Preferences} $P/Default/
   # headless (servidor) OU headed com a tela do usuário (DISPLAY=:0 XAUTHORITY=...mutter-Xwaylandauth.*)
   XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.* DISPLAY=:0 brave-browser-stable \
     --user-data-dir=$P --remote-debugging-port=9222 --no-first-run --window-size=1400,900 \
     https://www.mixamo.com/ &
   ```
   Aviso: `headless=new` mostra "Log in" (a sessão Adobe/Google NÃO atravessa o perfil
   copiado quando diferente da fonte rodando — copiar cookies ajuda, mas o login real foi
   feito pelo usuário UMA vez com o browser VISÍVEL e o Google SSO `rodolfofrancoxico@gmail.com`).
   O perfil guarda o login por meses → próximas runs são 100% autônomas.
3. **Juiz de visão local** (os "olhos" do modelo — este agente não enxerga): 
   `python3 scripts/vision_judge.py <print.png> '<pergunta fechada>'` — usa o VLM local
   Qwen em :8081. ~25–50 s por pergunta. REGRA: perguntas QUALITATIVAS ou com âncoras
   grandes ("o ponto ciano está no queixo ou na testa?"), NUNCA coordenadas absolutas
   de articulações (o VLM erra pixels; para coordenadas use DOM ou máscara de cor).
4. **Blender headless** em `/snap/bin/blender` (v5.2 — a API de Actions é slotted; NÃO
   use strips.new com action= em throws — prefira o nível glTF puro abaixo). 

## O FLUXO (6 fases)

### 1. Malha → FBX para o Mixamo (offline, sem site)
- Se a malha vem de Hunyuan/Meshy/etc. como GLB: `blender -b --python ana_work/conv_glb_fbx.py -- in.glb out.fbx`
  (aterrisa os pés em Z=0 para o viewer do Mixamo enquadrar).
- **LIÇÃO DE OURO (01/10): centralize o pivô no centro do BBOX da malha ANTES de subir**
  (`center_pivot.py`: `origin_set(ORIGIN_GEOMETRY, center='BOUNDS')` + `transform_apply(location=True)`).
  Sem isso o modelo renderiza deslocado no canvas do rigger e o "**Use Symmetry**" (ativado por
  default!) desalinha todos os pares — sintoma: drag de um marcador "desfaz" o parceiro.

### 2. Upload (browser)
- `agent-browser connect 9222` e na Mixamo: `eval` clicando em "UPLOAD CHARACTER",
  `upload "input[type=file]" <ficheiro.fbx>`, esperar a barra 100% ("Processing Character").
- Print + juiz: o modelo aparece? de frente? T-pose?

### 3. Auto-rigger: Orient → Place markers
- **Orient**: print + juiz: frente ✓ T-pose ✓ **CENTRALIZADO** ✓ (se não centralizado,
  voltar à fase 1 e centralizar o pivô melhor). Setas de rotação no dialog se necessário.
- NEXT abre o passo de marcadores. DOM-chave:
  - `.autorig-overlay` cobre o canvas 3D (ler `getBoundingClientRect`).
  - `.autorig-marker` são `position:absolute` dentro do overlay. IDs: `chin`, `larm`, `rarm`,
    `lelbow`, `relbow`, `lknee`, `rknee`, `groin`. A coluna da esquerda = os mesmos spans
    não colocados (posição de chip); quando colocados, ficam com `style.left/top` no overlay.
  - **HÁ DUAS `canvas` na página** — o viewport 3D é o que o `.autorig-overlay` cobre.
- **O drag**: CDP mouse events com smoothstep (exemplo em tmp_mix_auto.tmp.mjs):
  mouse.move → steps de steps 4 → mouse.down → 18-22 passos ease (t·t·(3−2t)) → mouse.up.
  Funciona para chips E para reposicionar marcadores já colocados (são os mesmos elementos).
- **O ESPELHO (a descoberta crítica)**: com "Use Symmetry" ○ ligado (default), cada drag
  de um marcador de par (larm/lelbow/lknee) **move o parceiro para o espelhado matemático
  do ponto solto, em torno do CENTRO DO OVERLAY** (medido: soma dos x = 2×centro_overlay).
  Consequentemente, se o modelo renderizado não estiver centralizado no overlay, NUNCA os
  dois lados acertam ao mesmo tempo — o erro total é invariável = 2×|desalinhamento|, e
  joelhos podem cair do lado imaginado (rig quebrado!). 
  **CORREÇÃO (testada e funcionou)**: medição empírica — arrastar um pulso, ler o centro do
  par `(larm.x + rarm.x)/2` no DOM = centro do espelho real — então deslocar o overlay para
  casar espelho↔corpo: `o.style.transform = 'translateX(<corpo − centro_espelho>px)'`
  (ex.: centro_overlay era 422.5, o corpo estava em ~468 = o queixo ~478 menos a incerteza
  do juiz de ±15px → translate de +45.5px funcionou com precisão de 0.1px).
- Os alvos anatômicos em T-pose (fração da altura teclaro do modelo na tela): medir as
  âncoras grandes com o juiz (topo da cabeça, pés, a linha das mãos) e computar:
  queixo ≈ 88% da altura a partir dos pés; pulsos ≈ 88% (±185px para um modelo de 1.72m
  renderizado com 371px de altura, ajustar à escala); cotovelos ≈ 89% a ±~115px... depois
  joelhos ~0.27, virilha ~0.47. VALORES CONCRETOS que funcionaram nesta sessão podem estar
  em tmp_place_final.tmp.mjs (alvos em page-coords daquele layout).
- **PRINT a cada passo do placar (regra do PO!)** e o juiz valida ANTES de clicar NEXT:
  importa a COR de cada ponto (verde=pulsos, amarelo=cotovelos, laranja=joelhos,
  ciano=queixo, rosa=virilha) — o juiz acerta qualitativo.
- NEXT → "Auto-Rigging…" processa (nesta sessão: <10 s) **e a tela volta ao place markers** —
  NÃO é falha! O rig aplicou. O sinal: no rodapé aparece o botão **DOWNLOAD**.

### 4. Download do FBX rigged
- Rodapé "DOWNLOAD" → dialog "DOWNLOAD SETTINGS": usar **FBX Binary + T-pose** (default) →
  segundo botão "DOWNLOAD" do dialog (havia dois botões com o mesmo nome; o do dialog estava
  em ~(836,285) — clique com mouse por coordenadas é mais confiável que o click JS).
- O download pode parar em `~/Downloads/.org.chromium.Chromium.XXXXXX` (arquivo oculto sem
  finalizar):  **checar a assinatura binária `Kaydara FBX Binary`** no começo do arquivo —
  se o nome não mudou após ~30 s estáveis, o conteúdo está completo; copie dali
  (`ana_work/<nome>_rigged_mixamo.fbx`).

### 5. Fusão com as animações aprovadas (o que vive no jogo hoje)
A chave de tudo: o rig novo (65 ossos mixamorig) e os clips do GLB anterior casam **1:1 por
nome de bone**. NÃO passar as animações pelo Blender (a API de Actions do Blender 5.2 mudou
— slotted actions — e o NLA export gerou clips vazios nesta sessão). Em vez disso:
1. Converter FBX rigged → GLB de esqueleto+somente-skin: `fbx_to_glb_skel.py` (Blender,
   `export_animations=False, export_skins=True, export_apply=False`).
2. Transplantar os clips Walk/Idle do asset aprovado para o GLB novo com gltf-transform
   (nível de arquivo): `node tmp_transplant_clips.tmp.mjs <velho.glb> <novo.glb> <out.glb>`
   — copia as 390 channels (inputs/outputs/samplers/canals) por NOME do node.
3. Injectar `asset.extras = {walkSpeed: 1.684, walkAdvance: 1.7402}` com
   `tmp_patch_extras.tmp.mjs` (só JSON; BIN intacto, semestir comprimidos).
4. Validar a estrutura antes de abrir o jogo: `node tmp_variation.tmp.mjs <final.glb>` —
   gate esperado no World: **Walk: 17 canais de rotação ROBUSTAMENTE variando**
   (mixamorig:LeftUpLeg.rotation var ≈ 1.99 etc.), **Idle: 10 canais com micro-sway**
   (Hips var ≈ 0.01). Se 0 variam, alguma coisa matou as animações (NÃO prossiga).

### 6. QA in-game (servidor de teste, sem tocar a produção)
- Servidor isolado: copiar `dist/` + `server/` para um diretório NVMe, trocar só o GLB,
  `PORT=4180 node server/index.mjs` ( o server serve `../dist` ).
- Probe determinístico (não depende da GPU/ SwiftShader — drive a animação com `av.update(DT)`:
  `node tmp_probe_optA.tmp.mjs http://127.0.0.1:4180/`. Esperado (mesmos números do asset
  aprovado): `cadência ×1.00 (clip 1.68 → 1.684; advance 1.7402)`, pés levantam ~0.15–0.20 m
  no swing, ground-fix com ajuste ~0.086 (dentro do cap ±15 cm), "referência de solo +0.011 m".
- **Prints in-game (idle/walk/interação; regra do PO!)** + juiz de visão com perguntas
  fechadas: corpo íntegro / pés no chão / rosto e cabelo normais / proporções.
- ⚠️ Fantasma de instrumento: prints pontuais do walk podem cair na fase de apoio duplo
  e parecer "parada" — confiar nas métricas do probe, e re-tirar o print na fase de
  passada se precisar do juiz.
- ⚠️ O viewer `char-preview.html` do projeto teve framing ERRADO com este asset (a câmera
  mirou nos "bins"; ele viu "sem rosto" no crop) — usar o probe in-game como ground truth,
  não o viewer, até o framing ser revisto.

### 7. Deploy — SÓ COM O PO
1. `git` o GLB + a dif de runtime (app.js cache-bust `?v=N+1`, comicamentes no repo).
2. `npm run check`, `npm run build`, `bash scripts/deploy.sh` (marca `game_farma:previous`,
   healthcheck, rollback automático) e verificar o SHA remoto = local.
3. Probe pós-deploy contra a URL pública para confirmar o walk vivo em produção.

## Tabela de defeitos conhecidos (sintoma → causa raiz → cura)

| Sintoma | Causa real | Cura |
|---|---|---|
| "Fitas" esticadas até o teto na sombra/ao andar | vértices ponderados em bones de ponta (dedos, *_End) | runtime `sanitizeClips` (glbLoader.js — FREEZE_BONES) |
| Personagem "durona e embaixo do chão" | merge FBX sem limpar o mesh duplicado (node_0.001 sem ARMATURE) | Rodada 10: deletar meshes sem modifier |
| Personagem "andando de lado/capenga" | yaw médio embutido na translação/rotação do Hips | `straighten_hips.mjs` (recentra pela média) |
| Rig "explode" ao iniciar o walk | toe-bones fora da convenção (ler -2.85m) | cap do ground-fix a ±15 cm (patient.js) |
| Marcadores "quicam" (nunca colocados) | drop fora do canvas do viewport (ou o modelo deslocado/overlay errado) | ler `.autorig-overlay` + `.autorig-marker` reais no DOM |
| Arrastar um pulso desfaz o outro | espelho do "Use Symmetry" girando em torno do centro do OVERLAY | CSS `translateX` no overlay até o centro do espelho = centro do corpo |
| Download nunca termina (arquivo oculto) | o rename final do browser não disparou | checar magic "Kaydara FBX Binary" e copiar o temporário |
| Clips vazios após merge no Blender 5.2 | API de Actions slotted / NLA | NÃO usar NLA: transplante gltf-transform nível de arquivo (por nome) |
| Corpo roxo/sem textura nas linhas | loader sem MeshoptDecoder / GLB velho no cache | loader compartilhado + cache-bust `?v=` nos .glb |
| "Statue" — walk/ idle não se movem de jeito nenhum | clips 100% constantes (cirurgia GLB ruim) | node tmp_variation.tmp.mjs antes de subir |
| Prints in-game mostram "nada"/errado | fantasma de instrumentação headless + timing | drive determinístico `av.update(DT)` e vários frames |

## Equipe do PO (experiência acumulada)

- O PO sabe pilotar o login quando for preciso (Google SSO: rodolfofrancoxico@gmail.com —
  vai no browser visível na tela dele).
- O critério de QUALIDADE é visual: os prints fazem o acordo (mocap bom = pernas humanas,
  pés no chão, cabeça lenta aceita no idle, zero movimento da testa no walk).
- Aceitou o atual asset da Ana com mãos fundidas; não procurar perfeição além do que o
  grid de animação básica precisa.
