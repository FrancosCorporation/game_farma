# game_farma — FarmaCheck

Simulador web 3D (Three.js/Vite) de atendimento farmacêutico. O jogo roda **sem IA**
(modo plantão determinístico) e melhora se houver um servidor LLM OpenAI-compatible
local — ex.: `llama-server` em `http://127.0.0.1:8081/v1` (configurável no menu).

> **Estado do projeto:** consulte [`plan.md`](plan.md) para o roadmap vivo e
> [`resumo.md`](resumo.md) para evidências e continuidade. O checkout local contém
> 14 modelos revisáveis; Ana, Marina e José estão publicados no atendimento, enquanto
> os outros 11 são candidatos locais e não fazem parte da produção.

## Rodar (desenvolvimento, sem build)

```bash
npm ci
npm start          # Vite em http://127.0.0.1:5173
```

No Vite de desenvolvimento, a narração usa `speechSynthesis` do navegador como
fallback porque esse servidor não hospeda `/v1/audio/speech`. As falas fixas dos
14 pacientes têm clipes PT/EN locais e tocam sem uma voz instalada no navegador.
O servidor Node de produção abaixo habilita o endpoint eSpeak NG para respostas
dinâmicas do LLM; um host que serve apenas arquivos estáticos não fornece esse
endpoint, então respostas dinâmicas dependem da voz nativa do navegador.

Para regenerar os clipes fixos com eSpeak NG e ffmpeg instalados:

```bash
ESPEAK_NG_BIN=/caminho/espeak-ng npm run voicegen
npm run test:voice-assets
npm run qa:audio:assets
```

## Rodar o build de produção (com API do Expediente Livre)

```bash
npm run build      # gera dist/
npm run serve      # server/index.mjs em http://127.0.0.1:4174
```

`server/index.mjs` serve o `dist/` **e** expõe `POST /api/case/next` (caso sorteado
para o modo Expediente Livre). Variáveis: `PORT` (default 4174) e `HOST` (default
127.0.0.1; em container use `0.0.0.0`).

O Expediente Livre usa a lista fictícia local por padrão. Se o serviço opcional de
casos estiver configurado, ele sorteia um ID e uma seed dessa mesma lista; não gera
novos casos clínicos com LLM. O assistente de conversa é uma integração separada.

Endpoints operacionais: `GET /healthz` confirma que o processo HTTP responde;
`GET /readyz` confirma que `dist/index.html` está disponível (503 quando não está).
O healthcheck Docker usa `/readyz`. Logs de acesso são JSON com método, categoria
da rota, status e latência; não incluem caminho bruto, query string, corpo ou IP.
Erros registram somente categoria/código técnico, sem mensagem potencialmente
sensível. `FARMA_DIST_DIR` pode apontar para outro diretório estático; sem ele, o
servidor usa `dist/` ao lado do projeto. O teste isolado pode ser executado com
`npm run qa:http-server`.

## Rodar com Docker

```bash
docker build --file Dockerfile --tag game_farma:local .
docker run --rm --name game_farma_local \
  --publish 127.0.0.1:4181:4174 \
  --env HOST=0.0.0.0 --env PORT=4174 --env NODE_ENV=production \
  game_farma:local             # http://127.0.0.1:4181
```

O container local é `game_farma_local`; a porta 4181 evita conflito com o serviço de
produção e com o servidor de desenvolvimento. O nome `game_farma` pertence ao deploy
de produção via Caddy.

## Pipeline local de modelos 3D

`scripts/comfy/finalize_assets.py` normaliza apenas GLBs estáticos no Blender e aplica
simplify/resize/optimize por meio de `scripts/comfy/gltf_transform_sdk.mjs`. O wrapper
usa os mesmos parâmetros da CLI glTF Transform 4.5.1 e tem teste de paridade para uma
malha estática e a Clara com Walk/Idle. O finalizador mede bounds estáticos e recusa
qualquer entrada com skin ou animação antes de iniciar o Blender; não use essa rota
para exportar personagens animados.

`FARMA_REPO_ROOT`, `FARMA_BLENDER_BIN`, `FARMA_COMFY_OUTPUT_3D` e `FARMA_FINALIZE_TMP`
permitem apontar o pipeline para checkout, Blender, fonte e scratch específicos. A
saída final só é aceita após conferir textura/UV, compressão, escala, contato com o
piso e limite de tamanho.

## Publicação em produção

O caminho suportado é o script do repositório, que constrói usando este `Dockerfile`,
faz smoke interno antes da troca, confere a URL pública e recria a imagem anterior se
o healthcheck falhar. Primeiro revise o plano sem executar alterações:

```bash
bash scripts/deploy.sh --dry-run
```

Somente quando a publicação estiver explicitamente autorizada, execute:

```bash
CONFIRM_GAME_FARMA_PRODUCTION=YES bash scripts/deploy.sh --apply
```

O padrão é `--dry-run`; `--apply` sem a confirmação explícita aborta. Não usar o
`rebuild.sh` legado de `base_fundation`, que seleciona outro Dockerfile e não mantém
o mesmo fluxo de tag/health/rollback.

Para exercitar o contrato sem tocar na publicação, use `npm run test:deploy-contract`.
O teste de integração `npm run qa:deploy-sandbox` cria uma rede e containers
temporários `game_farma_test_*`, constrói a aplicação, valida a troca saudável e
força um healthcheck ruim para provar o rollback. Para validar apenas o mecanismo de
troca/rollback com o app que já existe no Docker local, sem repetir o envio do contexto
Docker de 1,4 GB, use `GAME_FARMA_QA_CANDIDATE_IMAGE=game_farma:latest npm run qa:deploy-sandbox`.
O modo `GAME_FARMA_QA_CANDIDATE_FIXTURE=YES` testa somente as guardas do ciclo com
imagens mínimas de fixture.

## Verificações

```bash
npm run check      # sintaxe de todos os módulos (src/, server/, scripts/)
npm run test:logica # regras da dinâmica de plantão (combo, conquistas, rank) — node puro
npm run qa:boot    # gate de boot: capa clicável + cena + anamnese  (precisa do jogo servido)
npm run qa:flow    # smoke PC/TLAC/DSF até voltar ao paciente (SMOKE_URL, SMOKE_LANG, SMOKE_WIDTH/HEIGHT)
npm run qa:flow:matrix # fluxo PC/TLAC/DSF: desktop/celular × PT/EN
npm run qa         # QA completo: capa → menu → fase → chat → decisão → debriefing
npm run qa:dynamics # QA da dinâmica (painel do menu, HUD de combo, chips, debrief) — servido
npm run qa:accessibility:panels # TLAC/DSF/decisão em PT/EN, desktop/celular, teclado e axe
npm run test:chat-transcript # append/rolagem do histórico e estado de digitação
npm run test:game-keyboard # atalhos de decisão, retorno e repetição de fala
npm run test:game-controls # bindings de formulários, botões, chips e cleanup
npm run test:docs-links # destinos locais dos documentos vigentes
npm run test:hidden-fact-guard # bloqueio de segredos ainda não revelados
npm run test:shift-summary # render do encerramento de fase
npm run qa:free-shift # E2E de decisão/debrief e contratos do Expediente Livre — Chromium
npm run qa:free-shift:matrix # repete o E2E em desktop/celular e PT/EN
npm run qa:phase-selection # seleção de fases em Chromium; sobe Vite isolado automaticamente
npm run test:case-selection # regra pura: casos não feitos, sorteio e antirrepetição
npm run qa:audio:browser # fallbacks TTS/cache/cancelamento Chromium, sem endpoint externo
npm run test:voice-assets # integridade e cobertura PT/EN dos clipes locais
npm run qa:audio:assets # reprodução real PT/EN sem voz do sistema
npm run test:tts-server # eSpeak NG local: WAV real PT/EN, limites e erros HTTP (requer espeak-ng)
QA_TTS_ENGINE_URL=http://127.0.0.1:4174 npm run qa:audio:live # playback/cancelamento real no Chromium; servidor local precisa estar ativo
npm run qa:http-server # health/readiness e logs sanitizados em servidor isolado
npm run qa:all     # TODOS os gates em sequência + resumo (--fast = só estáticos)
npm run qa:avatar-cache -- http://127.0.0.1:4181/ # 42 trocas/14 GLBs; resource/cache smoke, não benchmark de aparelho
npm run test:cast-manifest # consistência dos 14 casos, galeria e hashes GLB
npm run test:cast-provenance # etapas, gates Walk/mesh e proveniência do elenco
npm run test:gltf-transform-sdk # paridade do wrapper SDK estático/animado com baseline CLI
npm run sync:cast-provenance # --check read-only; use -- --write só para atualizar hashes existentes
npm run verify     # sintaxe + testes de contrato/regressão + build
```

`sync:cast-provenance` recalcula somente tamanho/SHA-256 dos artefatos já listados.
`npm run sync:cast-provenance -- --write` grava esses metadados atomicamente; não
cria pacientes/etapas nem altera estado de aprovação, revisão ou publicação.

O workflow inicia um servidor Vite temporário em `127.0.0.1:4174`, roda `qa:boot`
(inclui walk-in real em desktop/celular) e executa `qa:flow:matrix` nesse mesmo
servidor; depois o encerra. A matriz cobre desktop 1280×800 e celular 390×844 em PT/EN.
Ela usa `SMOKE_SKIP_ARRIVAL=1` para evitar repetir apenas a animação já coberta pelo
boot; atendimento e PC/TLAC/DSF continuam exercitados nas quatro combinações.
Para executar manualmente, inicie `npm run dev -- --host 127.0.0.1 --port 4174`
em outro terminal. Use `npm run qa:boot -- http://127.0.0.1:4174/` para a chegada
real, `SMOKE_URL=http://127.0.0.1:4174/ npm run qa:flow:matrix` para a matriz ou
`SMOKE_URL=http://127.0.0.1:4174/ SMOKE_LANG=en SMOKE_WIDTH=390 SMOKE_HEIGHT=844 npm run qa:flow`
para um cenário individual em inglês no celular. `qa:flow` valida dimensões inteiras
entre 320×480 e 4096×4096.

**Revisão local de pacientes 3D:** inicie o Vite e abra, por exemplo,
`http://127.0.0.1:4174/?candidateReview=1&candidateCase=clara_cefaleia`. Essa rota
existe apenas em modo de desenvolvimento; `candidateCase` abre um caso direto sem
exigir desbloquear fases. Os IDs são os mesmos do catálogo de casos. A revisão
seleciona os 11 candidatos animados ainda não publicados (Clara, Nelson, Paulo,
João, Helena, Rosa, Carlos, Bia, Carla, Roberto e Cátia) no atendimento real. Todos
passaram os gates locais de rig, Walk/Idle, chegada e cache; a aprovação final de
identidade/movimento segue pendente. Sem o parâmetro, e em build de produção, esses
casos continuam usando o fallback atual aprovado Ana. Para testar
seleção, esqueleto, caminhada de chegada e falha/retry de asset, rode
`QA_OUTPUT=/tmp/case-models.json node scripts/qa_case_models.mjs
http://127.0.0.1:4174/`. A rota de revisão não altera aprovação nem publicação.
Para repetir esse QA em emulação móvel, use `QA_MOBILE=1 QA_WIDTH=390
QA_HEIGHT=844 QA_OUTPUT=/tmp/case-models-mobile.json node
scripts/qa_case_models.mjs http://127.0.0.1:4174/`. Isso valida viewport e runtime
em Chromium, mas não substitui medição de desempenho em aparelho físico.

As automações de Mixamo falham com segurança quando encontram várias abas do domínio.
Marque a aba da tarefa com `window.__farmaMixamoTaskTabId = 'id-da-tarefa'` e rode os
helpers com `MIXAMO_TASK_TAB_ID=id-da-tarefa`; eles selecionam somente essa aba. O teste
`npm run test:mixamo-page-target` cobre seleção única, explícita, ausente e ambígua.
Para abrir um candidato novo, `node scripts/open_mixamo_candidate.mjs
public/models/candidates/arquivo.fbx tarefa-001 /tmp/evidencia-tarefa` cria uma aba marcada,
faz o upload e para em Orient para revisão; não envia o rig.

`npm run verify` também confere links dos documentos vigentes e executa os testes do painel de decisão, transcript de chat, guarda de fatos ocultos, resumo da fase, storage, contrato do Expediente Livre,
factGate/scoring bilíngues, ciclo de vida de avatares e TTS/STT. O projeto fixa Node 20 no Docker e no CI; `npm ci`
falha se o lockfile estiver ausente ou inconsistente.

O [plano ativo](plan.md) reúne as prioridades, os critérios de conclusão e o checkpoint do jogo.

**Recuperação operacional:** antes de qualquer intervenção, consulte `docker ps`,
`docker inspect game_farma --format '{{.State.Health.Status}}'` e
`docker logs --since 15m game_farma`; confira `/healthz` e `/readyz` JSON na porta
interna do container. Sob o prefixo público `/game/ufggame/`, esses caminhos podem
cair no fallback SPA e retornar HTML 200, que não é healthcheck. O DDNS é externo ao
repositório e deve ser diagnosticado separadamente. Para produção, use primeiro `scripts/deploy.sh --dry-run`; não reinicie,
remova ou publique o container sem autorização explícita. Saves ficam no armazenamento
local do navegador e não podem ser recuperados pelo servidor; exporte-os antes de limpar
dados do navegador. Preserve fontes, documentos e ativos versionados via Git e copie
artefatos locais ignorados necessários para um destino de backup separado antes de
limpar ou substituir o workspace. Não use `git clean` como procedimento de recuperação.
Para snapshot local com verificação/restauração e sem sobrescrever destinos existentes,
use `scripts/backup_project.sh`; o formato, as exclusões e o teste de recuperação estão
em [`docs/OPERACAO_BACKUP.md`](docs/OPERACAO_BACKUP.md). Scratch local não substitui
uma cópia durável fora desta máquina.

Os gates de navegador exigem o jogo servido (uma das duas opções acima) e usam
Playwright/Chromium headless. Sem GPU real o WebGL cai para SwiftShader: os tempos
desses testes são piso de sanidade, não benchmark.

