# FarmaCheck | Plano ativo de otimização
Atualizado em 22/11/2026. Entrega desta rodada: correções solicitadas do jogo (FC-107/FC-108), com validação em candidato e publicação autorizada após os gates. FC-101 segue parcial para medições comparativas. Mariana (`carla_dengue`) é o único caso jogável. Preservar o elenco de revisão, o conteúdo clínico, os saves e os assets aprovados. O [plano de outubro](docs/historico/plan-antes-da-auditoria-20261121.md) é histórico.

## Catálogo e sequência de execução

| ID | Entrega | Prioridade | Ponto de intervenção | Dependência | Critério de saída | Estado |
|---|---|---|---|---|---|---|
| FC-101 | Reproduzir o jogo localmente | P0 | `public/`, lockfile, `scripts/public_build_assets.mjs` | — | Build íntegro e primeiro atendimento local | Parcial |
| FC-102 | Corrigir cadência em telas de alta frequência | P1 | `src/scene/scene.js`, `qualitySettings.js` | — | Cadências simuladas corretas e chegada estável no navegador | Pendente |
| FC-106 | Propagar falha de abertura do atendimento | P1 | `src/app.js`, `src/core/game.js` | FC-101 | GLB ausente indica falha e retry abre o mesmo caso | Pendente |
| FC-103 | Reduzir espera até Mariana | P1 | `src/app.js`, `src/data/patientAssets.js` | FC-101 | Comparação fria e quente até primeiro atendimento | Pendente |
| FC-104 | Revisar a aparência no enquadramento de jogo | P2 | `src/scene/glbLoader.js`, iluminação e câmera da cena | FC-101 | Comparação visual e custo registrados | Pendente |
| FC-105 | Tornar finita a seleção de repetição | P2 | `src/core/caseSelection.js` | — | Casos unitários, duplicados e aleatórios cobertos | Pendente |
| FC-107 | Concretizar correções do PDF e da chegada | P1 | `src/ui/tlac.js`, `src/ui/dsf.js`, `src/scene/patient.js`, respostas e pontuação | FC-101 | Sem resposta antecipada nas opções; marcações avaliadas no relatório; Walk cessa; DSF salva e recuperável; fluxo público conferido | Concluído |
| FC-108 | Garantir fallback de IA pela NVIDIA | P1 | `src/app.js`, `src/ai/llm.js`, `server/index.mjs` | FC-101 | Modelo local indisponível produz resposta LLM via NVIDIA no jogo; chave só no servidor | Concluído |
| FC-109 | Corrigir e validar controles touch em tablet | P1 | `src/styles.css`, tela de menu e QA touch público | FC-101 | Botão de tela cheia disponível no menu; fluxo e layout de tablet/celular conferidos na versão pública | Concluído |

**9 objetivos de game no catálogo ativo.** Prioridades: **P0: 1, P1: 6, P2: 2, P3: 0**. Estados dos objetivos de game: **Pendente: 5, Parcial: 1, Bloqueado externo: 0, Concluído: 3**

### FC-101 · Recuperar a base de comparação

O checkout está sem `public/`, `dist/`, `node_modules/` e as evidências em `.planning/`. O contêiner local `game_farma` responde HTTP 200 e contém 180 MiB em `/app/dist`. Usar seu manifesto e arquivos servidos como referência de runtime. Buscar as fontes e a proveniência no backup disponível em `/media/servidor/Backup/farmacheck-autonomy-20261018-current-candidate.tar.zst`. Ele antecede a escolha final da Mariana. Restaurar em diretório separado, inventariar diferenças e conferir hashes antes de combinar com o código atual. Rodar `npm ci`, `npm run verify`, `qa:boot` e `qa:flow:matrix` na cópia. Registrar separadamente qualquer evidência histórica irrecuperável. Medir cinco entradas frias e cinco quentes na mesma máquina, com viewport, GPU, preset e cache registrados. Capturar tempo até ANAMNESE, bytes transferidos e p95 do intervalo entre quadros na chegada e durante o atendimento.

### FC-102 · Compensar o intervalo excedente entre quadros

O loop grava `lastFrameAt = now` a cada render. Simulando dez segundos com a função do jogo e alvo de 60 FPS, callbacks de 90 e 144 Hz produzem 45 e 48 quadros/s. Em 60 e 120 Hz dão 60. Preservar a fração de intervalo acumulada e tratar pausas longas sem rajada de atualização. Acrescentar essas quatro frequências a `test:quality-settings`, com alvos 30 e 60 e tolerância de um quadro em dez segundos. Validar Walk, câmera e preferência de movimento reduzido em navegador. Os números acima medem o agendamento idealizado, não a GPU.

### FC-106 · Corrigir o retorno quando o avatar falha

No catch do carregamento, o wrapper de startCase abre o painel de erro e retorna undefined. O chamador compara o resultado com false, portanto informa sucesso mesmo quando nenhum atendimento começou. Retornar falha explícita e revisar quem consome o resultado. Simular a falha de rede do GLB ativo, conferir resultado false, ausência de avanço na pontuação e retry do mesmo caso com uma única montagem. Diagnóstico por leitura do fluxo.

### FC-103 · Dar prioridade ao avatar do primeiro atendimento

O boot solicita Ana (3.038.408 bytes no contêiner). O primeiro atendimento solicita Marina (2.204.856 bytes), que representa Mariana. Medir a sobreposição com o carregamento da farmácia. Comparar a versão atual com um candidato que pré-carregue o modelo do caso ativo pelo cache existente. Preservar a apresentação aprovada de Ana onde for exibida, as rotas de revisão e a tentativa após falha de GLB. Escolher a variante somente se reduzir a mediana até ANAMNESE além da variação entre rodadas e preservar o orçamento de resposta da capa. Verificar bytes efetivamente transferidos e identidade após reiniciar.

### FC-104 · Avaliar o modelo visível antes de editar a malha

A rota normal resolve para `candidates/marina_patient_v001`. O GLB do contêiner tem SHA-256 `0d075417ed9f947a3fd942eba647441aee3f36b69e253e466753e621a23fd321`. A rota de revisão da Carla usa outro modelo. Capturar Mariana de frente e em três quartos no Walk, em Idle e no contato do teste rápido, em desktop e celular. Fixar câmera, fase de animação e geração decorativa para comparar rosto, mãos, contato dos pés e exposição. Se houver falha visível, testar uma alteração por candidato, começando por câmera, material ou luz conforme a causa. Registrar par de imagens, hashes, p95 e aceite visual. Se as capturas estiverem boas, encerrar a revisão com o GLB atual.

### FC-105 · Limitar o sorteio sem alterar a campanha

A função prioriza o primeiro caso ainda não concluído. No replay, o laço de rejeição pode continuar indefinidamente se todas as entradas forem o ID anterior. Em ensaio com dois IDs iguais e concluídos, o gerador de teste interrompeu após mil tentativas. O elenco atual de um único item já termina normalmente. Filtrar alternativas elegíveis uma vez antes de sortear, preservar a ordem de inéditos e definir retorno para lista vazia e lista com um único ID distinto. Rodar `test:case-selection` e `test:phase-selection`, incluindo RNG constante. Manter a variação estética independente da seleção clínica.

## Checkpoint da auditoria

Sintaxe aprovada em 263 arquivos de src, server e scripts. A lógica passou e o verify parou no teste de colisões pela ausência de three. O teste isolado de manifesto encontrou ENOENT em public/patient-review.json. Passaram separadamente seleção de caso, qualidade, resposta do paciente, pontuação e revelação de fatos, persistência, serviço opcional, fallback de voz e idioma do ditado. A aceitação clínica e a experiência em celular físico exigem validação própria. Próxima entrega de implementação: FC-101. Sem publicação nesta auditoria.

O teste do catálogo passou. O verificador documental encontrou cinco imagens históricas ausentes em resumo.md. A sondagem Chrome ao contêiner não observou os marcadores de capa nem de ANAMNESE; a entrada jogável e a aparência ficam sem confirmação nesta rodada.

Limpeza do checkout em 21/11/2026. Capturas, caches, documentos e experimentos desativados foram retirados. Os nove GLBs locais de future_projects foram conferidos por SHA-256 antes e depois. O código procedural usado pela cena continua necessário. A recuperação de public/ permanece em FC-101.

Atualização Version-1.1. Os assets públicos de execução foram recuperados do contêiner. npm ci, build e manifesto dos 14 modelos passaram. FC-101 segue aberto para a matriz de navegador e as medições comparativas.
O verify integral passou com CAST_PROVENANCE_MODE=checkout. O QA Chromium em português chegou ao atendimento, abriu o bulário e executou o TLAC. O smoke antigo exige resultado positivo e conflita com o roteiro neutro de Mariana. Revisar as expectativas do smoke para TLAC e DSF antes de usar a matriz como aceite.

Checkpoint 22/11/2026 — correções FC-107/FC-108 publicadas em `game_farma:release-20261122-correcoes-final` (`sha256:0191a7bc55d9975a754848e9c5259c4da8595640c8093d7ad68310e8e8241b8a`). O teste rápido da Mariana registra a execução sem inventar um resultado NS1. As opções de sinais de alarme têm rótulos neutros; os acertos das marcações são calculados após confirmar a conduta e explicados no relatório. A DSF salva e reabre dentro do jogo no navegador do jogador. A paciente para de caminhar no balcão. O servidor do jogo usa llama.cpp primeiro e NVIDIA como fallback, com a chave apenas no servidor.

Gates: verify integral PASS; build e contêiner saudáveis; matriz neutra 4/4 PT/EN × desktop/celular PASS; boot em contêiner desktop/celular PASS; acessibilidade 4/4 PASS; fluxo público completo PASS; HTML/chunks públicos idênticos ao build local; `/healthz` e `/readyz` 200; resposta gerada pela NVIDIA na URL pública PASS. Detalhes e hashes em `docs/evidencias/correcoes-jogo-20261122.md`. FC-101 segue parcial apenas para medições comparativas. Aceite visual em aparelho físico e revisão clínica ampla dos 14 casos permanecem separados desta entrega.

Checkpoint 22/11/2026 — FC-109: QA em Chromium touch reconheceu tablet 1280×800 e confirmou tela cheia, retorno ao balcão, direcional por toque e layouts sem sobreposição em tablet 1024×768, celular 390×844 e 844×390. A versão pública anterior ocultava o botão de tela cheia no menu. A regra CSS foi corrigida e a release 1.3.0 publicada; healthcheck e smoke público passaram. Os 19 checks funcionais e de layout touch passaram na URL pública; o roteiro reportou um 404 de recurso no console sem identificar a URL, então a limpeza total de console permanece parcial. Capturas e relatório em `docs/evidencias/tablet-touch-qa-20261122/`. Aceite visual em aparelho físico ainda requer aparelho real.
