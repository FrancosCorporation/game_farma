# Checkpoint mais recente — correção da axila/ombro da Ana

- **Atualizado:** 11/10/2026, antes do reinício do servidor solicitado pelo PO
- **Projeto:** `/home/servidor/Git/game_farma`
- **Pedido atual:** preservar o progresso em `resumo.md` para que a próxima sessão/agente retome sabendo o que já foi diagnosticado e o que falta.

## Estado atual em uma frase

A falha visual do ombro/axila ainda não está resolvida nem publicada. A causa mais provável já foi isolada na interação entre a rotação do osso `RightArm` e os pesos locais da camiseta. A variante que mais reduziu a faixa triangular até agora reduz a amplitude de `RightArm` para 25%, mas ainda precisa passar por avaliação de corpo inteiro e não deve ser promovida sem QA visual completo.

## Pedido visual do PO

Durante o movimento do braço para frente e para trás, a camiseta forma uma linha/faixa vertical de triângulos e vincos entre o ombro e a lateral do peito, deslocada para o lado do tórax em vez de acompanhar a axila anatomicamente. Investigar bind pose/pivô, pesos, topologia e geometria. Não mascarar com luz/material e não mover os ossos isoladamente sem preservar bind pose e inverse bind matrices. O PO também observou anteriormente que a personagem parece flutuar um pouco; o problema prioritário agora é a deformação do ombro/axila.

## Diagnóstico comprovado até aqui

- Rig/malha da candidata: 1 mesh skinned, 65 joints, aproximadamente 111.050 vértices e 149.996 triângulos.
- O pivô e a bind pose parecem plausíveis: residual matricial medido em torno de `2,2e-5`. Não há evidência que justifique deslocar pivôs.
- A auditoria da região da camiseta não encontrou aberturas reais: componentes analisados ficam fechados após weld posicional; não foram encontrados edges com mais de duas faces incidentes nem faces duplicadas na área investigada. Portanto, a faixa triangular em movimento não foi demonstrada como rasgo da geometria base.
- A varredura de triângulos/raycast mostrou variação muito brusca de influência de `RightArm` em triângulos visíveis na lateral do peito: há faces com pesos de braço entre zero e aproximadamente 0,56 entre vértices da mesma face. Isso sustenta uma transição de skinning problemática.
- Teste de isolamento decisivo: congelar somente a rotação de `RightArm` no Walk quase elimina a faixa vertical; congelar somente `RightShoulder` não reduz a faixa de forma comparável. O gatilho imediato é a rotação de `RightArm`, embora os pesos da camiseta possam ser a causa estrutural subjacente.
- A amplitude original de `RightArm` já estava bastante amortecida no GLB em preview (aprox. 5,9° de desvio máximo em relação à bind). O candidato experimental de 25% reduz isso para aproximadamente 1,5°. `RightForeArm` e os demais ossos continuam animados; isso mantém algum movimento distal, mas pode deixar o braço superior rígido demais.
- Não há confirmação visual ainda de que reduzir a animação seja uma correção final aceitável. Preferir encontrar pesos/forma de transição apropriados se isso puder ser feito sem criar novas placas.

## Variantes tentadas e decisão

Todas as variantes listadas abaixo são experimentais em `ana_work/` e nenhuma foi publicada:

- Reweight bilateral obtido espelhando a correção antiga do lado esquerdo: `..._mirroredDelta01_20261011.glb` e `..._mirroredDelta02_20261011.glb`. O primeiro passou os invariantes estruturais, mas deixou a faixa principal e criou pequeno pico perto do ombro; o segundo piorou as dobras. Rejeitadas.
- Máscara analítica ancorada em raycast/poses Walk (`..._stripe01_20261011.glb`): 3.627 edições diretas + cópias de seam; passou gate estrutural, mas espalhou triângulos pelo alto do ombro. Rejeitada.
- Suavização geométrica (`..._weldedSmooth03_20261011.glb`): sem melhora visual relevante. Rejeitada.
- Ajuste somente do eixo Z (`..._rightArmZ015_20261011.glb`): a fase inicial melhorou parcialmente, mas fase posterior ainda mostrou dobra funda. Pior que a redução uniforme; rejeitada.
- `RightArm` a 50% (`..._rightArmMotion05_20261011.glb`): reduziu parte da dobra, mas a faixa continuou bem evidente. Gate passou, visual não suficiente; rejeitada.
- **Melhor candidata experimental neste momento:** `ana_work/ana_qwen_walkidle_armdamped02_torso07_chestweights_rightArmMotion025_20261011.glb`, SHA-256 `b6b1667a7fb8e2e9c67ddfcc2e8031e0d4023c5b807049a65caf55942afcc943`. Gate estrutural passou. Em close-up, nas fases Walk 25/75%, a faixa triangular/dobra diminuiu muito, mas ainda há resíduo. Falta avaliar as capturas de corpo inteiro para verificar se o braço ficou rígido ou assimétrico demais e fazer QA por ângulos/poses antes de qualquer publicação.

Capturas de corpo inteiro já geradas para a candidata 25% e a base, fases 0/25/50/75/99%:

- Base: `/tmp/ana_shoulder_motion025_full_base_000.png`, `_025.png`, `_050.png`, `_075.png`, `_099.png`.
- Candidata: `/tmp/ana_shoulder_motion025_full_candidate_000.png`, `_025.png`, `_050.png`, `_075.png`, `_099.png`.

Capturas close-up da candidata e demais experimentos estão em `/tmp/ana_shoulder*`. Elas podem desaparecer após reinício/limpeza; se sumirem, recapturar a partir dos GLBs mantidos em `ana_work/`.

## Preview e preservação dos assets

- O GLB público isolado atual `public/models/ana_walk_preview.glb` tem SHA-256 `b81e07f5123df0e55f039a23d07530875f6071d6d17e1e99a765e6455f661b87`. Ele representa o último preview anterior aprovado, ainda com a deformação de ombro pendente.
- Runtime do jogo `ana_clasica`, `v=38`, continua sem alteração. Nenhum candidato de ombro foi copiado para o jogo ativo ou para o preview público.
- O preview público DNS anteriormente usado é `https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full`. O serviço pode ficar indisponível durante/depois do reinício solicitado pelo PO.
- Servidores locais de comparação estavam nos ports: `4201` base/preview público anterior; `4226` smooth rejeitado; `4227` mirroredDelta01; `4228` mirroredDelta02; `4229` motion05; `4230` stripe01; `4231` motion025 (melhor candidata); `4232` Z015. `ss` confirmou listeners Node nos ports na última observação, antes do reinício. Não presumir que continuarão vivos.
- Quando os serviços forem retomados, se a candidata motion025 ainda estiver disponível no servidor local: `http://127.0.0.1:4231/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full`.
- Não substituir o GLB público até terminar QA e concluir que a amplitude reduzida não deixa o movimento artificial. Mesmo depois de corrigir o preview isolado, ativação no jogo requer aprovação explícita do PO.

## Próximos passos para retomar

1. Ler este checkpoint primeiro, depois revisar os arquivos ativos em `.planning/2026-10-10-walk-animation-web-pipeline/` e o estado do worktree. A anotação de pausa em seções antigas é histórica e não bloqueia a retomada atual.
2. O PO pretende reiniciar o servidor. Confirmar depois do reinício quais URLs/ports voltaram; não assumir que as sessões Node antigas sobreviveram.
3. Inspecionar comparativamente as 10 capturas full-body listadas acima, principalmente se o braço direito ficou excessivamente estático nas fases 0/25/50/75/99. Comparar com a base para movimento geral, equilíbrio bilateral e marcha.
4. Se a candidata motion025 parecer aceitável em corpo inteiro, completar QA de close-up frente, lado e costas, incluindo Walk 0/25/50/75/100, movimento progressivo do braço e Idle/Rest. Inspecionar ombro, axila, manga, lateral do peito e também que a caminhada/pés não regrediram. Confirmar também o defeito de flutuação sem confundi-lo com a correção de ombro.
5. Se 25% ficar rígido ou o resíduo de dobra continuar inaceitável, não publicar. Retomar a investigação de pesos/topologia da faixa no lado direito com hipótese comprovável; não repetir espelhamento cego, suavização nem o mask stripe já rejeitado.
6. Só depois de inspeção visual completa e gate passar, atualizar o **preview isolado** e validar o DNS servido. Preservar `ana_clasica`/`v=38` e os arquivos do usuário.
7. Registrar novas evidências e a decisão final em `resumo.md` e nos arquivos de planejamento. O próximo objetivo pendente continua sendo uma correção estrutural/visual aprovada para a camiseta do ombro/axila, além do ajuste de flutuação observado pelo PO.

## Limite da conclusão atual

A causa imediata do artefato está isolada na animação `RightArm`; o diagnóstico estrutural de pesos é forte, mas ainda não foi corrigido de modo visualmente aprovado. A candidata motion025 reduz o sintoma e é apenas candidata de QA. **Não dizer ao PO que os bugs de ombro foram resolvidos e não afirmar que já pode ver uma nova versão no preview público.**

---

# Handoff da sessão — personagem 3D, caminhada web e pipeline do elenco

**Atualizado em:** 11/10/2026
**Projeto:** `/home/servidor/Git/game_farma`
**Nota histórica:** o pedido de pausa registrado nesta versão antiga foi superado pela retomada mais recente. Para o estado atual, prevalece a seção “Checkpoint mais recente” no início deste arquivo.

## Objetivo e preferências do PO

O primeiro personagem é a Ana. Ela precisa caminhar de forma visualmente convincente no jogo web, sem deformações, clipping ou afundamento; depois o mesmo processo será usado para criar uma gama maior de personagens 3D. O objetivo não é apenas fazer o jogo compilar: revisar a malha visualmente, corrigir as causas reais, validar no browser e deixar um procedimento reutilizável para os próximos assets.

O PO autorizou conduzir o melhor caminho, inclusive experimentar métodos novos, mas pediu para ser avisado honestamente se houver impasse ou se não estiver havendo progresso. Ele não quer ficar aprovando cada alteração. Para revisão, prefere sempre o preview no DNS, pois links locais dificultam o acesso. A publicação em preview isolado não significa autorização para trocar o personagem ativo do jogo. Preservar identidade, rosto, proporções, cabelo, roupa e cores; não esconder defeitos com câmera/luz/material nem trocar pela personagem roxa sem confirmação.

Essa orientação era válida na sessão anterior e foi superada pela retomada posterior. O PO agora informou que vai reiniciar o servidor; este checkpoint foi preparado para essa retomada. Não interpretar esta frase histórica como bloqueio do trabalho futuro.

## Estado do jogo e do preview

- O personagem ativo e rollback de produção continua `ana_clasica`, `v=38` em `src/app.js`. Não foi alterado nesta fase.
- O preview isolado da caminhada está no DNS: [Abrir Ana caminhando no preview](https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full).
- **Registro histórico:** naquele ponto, `public/models/ana_walk_preview.glb` era cópia de `ana_work/ana_qwen_walkidle_armdamped02_20261011.glb` (SHA `0ef2d253ce43bf6f33afe7f4f45a2a6bc224ff583f094f63669e2789d861b92b`). O estado mais recente do arquivo público é o descrito no checkpoint inicial deste documento (SHA `b81e07f5123df0e55f039a23d07530875f6071d6d17e1e99a765e6455f661b87`). O runtime ativo permaneceu inalterado.
- URL DNS do preview e seu GLB já responderam HTTP 200 em validação anterior. A página pública ainda contém o ground-fix antigo, pois a correção de HTML feita nesta sessão **ainda não foi copiada para o container nem verificada no DNS**.
- O navegador integrado não estava conectado para operar serviços externos. Não houve upload ao Mixamo, nova geração no Hunyuan nem consumo de quota nesta etapa. Não contornar login com automação externa.

## De onde veio o candidato atual

Havia uma malha Qwen local (`ana_qwen_opt.glb`) com geometria/ordem de índices exatamente compatíveis com um rig Mixamo local de 65 ossos. A mesma malha foi encontrada em FBX animados históricos, então Walk/Idle puderam ser reaproveitados sem reweight/retarget. O Hips tinha offsets fixos de FBX que deixavam o personagem deitado: `scripts/prepare_animated_character_web.mjs` foi corrigido para manter translação do Hips na bind pose e rebater os quaternions à rotação de bind, preservando a variação do ciclo.

- Candidato rebased sem amortecimento de braços: `ana_work/ana_qwen_walkidle_rebased_20261011.glb`; SHA-256 `dec3e0d708b6e3de7e97b0b76b7e480bc7412d2fd92d288bfe1f789d367c0f87`.
- A camiseta/axila ficava com placa severa quando Walk animava ombros/braços. O candidato público atual usa amortecimento das rotações de `Shoulder`, `Arm` e `ForeArm` para 20% da amplitude original (factor `0.2`), sem tocar em geometria, pesos, Hips ou pernas. Isso melhorou claramente a forma do tronco/axila e preservou a passada. Foi o progresso visual que o PO reconheceu.
- Estrutura do candidato atual: 1 mesh/skin, 65 joints, ~111.050 vértices, 149.996 triângulos, clips `Walk` e `Idle`; após a sanitização do runtime, Walk tem 22 rotações vivas e Idle 16. Metadados `walkSpeed=1.684`, `walkAdvance=1.7402`.
- Gate estrutural e QA da chegada passaram anteriormente: deslocamento de rota 5,769 m, chegada monotônica ao alvo, passada alternada (stride ~0,743–0,747 m), Hips in-place e Idle estável. Isso valida o contrato de movimento, não basta para aprovar qualidade visual.

## Feedback visual pendente do PO

O PO gostou bastante da melhora, mas ainda percebeu:

- personagem/pés afundando no chão;
- cabeça balançando demais (quer movimento menor, mas não congelado);
- artefatos entre as pernas/virilha;
- forma lateral do torso sob as axilas ainda precisa de refinamento.

Depois acrescentou uma lista técnica mais ampla: triângulos/rasgos em ombros e peito; deformações de axila, mangas, quadril e virilha; linhas repetitivas/sombreamento no rosto, cabelo, pele e roupa; verificar geometria, skinning, bind/IBMs, normais, tangentes, UV, texturas, materiais, shader e renderização. Corrigir causas comprovadas e comparar Rest/Walk, ângulos e material original/neutro. As quatro imagens citadas nessa última mensagem não vieram como anexos visíveis nesta sessão; os defeitos específicos descritos no texto não devem ser registrados como reproduzidos sem comparar as imagens ou os arquivos correspondentes.

## Descoberta principal desta sessão: causa do afundamento

Foi medida a superfície skinned inteira do candidato em 121 fases do ciclo, usando o GLTFLoader do Three.js, após normalização do preview:

- menor `minY` global: `+0,004437 m`, na fase `0,5583`;
- piso do preview de auditoria: `-0,008 m`; a superfície não atravessa o piso nessa amostragem e mantém ~1,24 cm de folga;
- em fase `~0,333`, o menor ponto está em `~+0,079 m` porque o pé está em swing.

A página `public/char-preview.html` antiga fazia um ground-fix 2,5 s após carregar, amostrando a malha em **uma única pose animada**. Se o timer caísse perto da fase 0,333, ele deslocava o modelo para baixo usando ~7,9 cm quando o apoio mais baixo do ciclo precisava de ~5 mm. Isso explica o pé atravessar o chão nas outras fases. É um defeito do algoritmo do preview, não evidência de que o GLB tenha o pé curto.

Implementação local já feita em `public/char-preview.html`: o ground-fix agora amostra o ciclo Walk completo em 61 fases, até ~12 mil vértices uniformes por fase, e fixa folga-alvo de 5 mm em vez de calibrar uma pose isolada. QA local Chromium passou: `minYBefore=0,00477 m`, correção `+0,00023 m`, mínimo previsto pós-ajuste `0,005 m`, sem erros de browser; screenshot `/tmp/ana_groundfix_test.png`.

**Importante:** a correção local ainda não foi publicada. O DNS pode continuar mostrando o defeito. Na retomada, depois de confirmar o estado do container, copiar somente o HTML do preview para o diretório servido e validar o link DNS. Não fazer rebuild/restart amplo nem trocar o GLB ativo.

## Cabeça: medição e experimento não aprovado

Auditoria densa da candidata base estima movimento de cabeça no Walk: posição do osso varia ~5 cm em X e ~2,4 cm em Z; rotação relativa à pelve chega a ~8,11° do início do ciclo. Em Idle a rotação da cabeça relativa ao início é ~1,63°.

Foi criado `/tmp/ana_head_damped55.glb`, reduzindo Neck/Head para 55% do movimento original (45% de amortecimento). Os canais passaram de 0,098→0,054 rad (Neck) e 0,078→0,043 rad (Head), e o gate estrutural passou. Porém a posição continuou praticamente igual e a métrica densa relativa à pelve foi 8,88° (vs 8,11° base); a inspeção não comprovou melhora natural. **Variante rejeitada, não publicar.** Próximo: identificar contribuição de `Spine`, `Spine1`, `Spine2` e movimentos globais antes de alterar mais canais; comparar close-up e manter alguma oscilação natural.

## Geometria, topologia e aparência global

`gltf-transform inspect` mostra um único mesh/primitiva e um material PBR double-sided, com base-color texture e normal map WebP 1024×1024. Não há materiais separados para corpo, roupa e cabelo, então o atlas/material compartilhado pode contribuir para aparência global, mas isso ainda precisa ser demonstrado.

Auditoria source-level do GLB atual: 0 triângulos duplicados, 0 com índices repetidos, 0 índices fora do intervalo, 0 vértices não referenciados; 13 triângulos com área efetivamente zero/quase-zero após quantização (não comprovados como causa visual; não remover sem localizar efeito). Normais/tangentes/UV e skin weights ainda precisam de auditoria específica.

Foi criado `scripts/diagnose_gltf_without_normal_map.mjs` e gerada cópia diagnóstica `/tmp/ana_without_normal.glb`, que remove só a referência ao normal map. Captura em corpo inteiro na mesma pose não mostrou melhora visual óbvia; o mapa não foi removido da candidata. Próximo: comparar face/torso em close-up, com material neutro e material original, e inspecionar normais/tangentes/UV. Não afirmar que a lista de “linhas repetitivas” está corrigida.

O candidato histórico provável da blusa roxa é `ana_v40_aprovado.glb` (cabelo escuro preso, polo lilás). Em Walk 25/50/75% apresenta braços erguidos/gestuais e placas poligonais evidentes entre antebraço/mão e torso. A virilha parece um pouco mais limpa nos quadros observados, mas não é globalmente mais fácil de automatizar nem tem a mesma identidade da Ana atual. Não trocar sem decisão explícita do PO. `ana_v39_canon.glb` também foi descartado como base da Ana: deformação lateral/placas graves no torso/axila/quadril.

## Mudanças feitas nesta sessão (não confundir com publicação)

- `public/char-preview.html`: ground-fix agora considera o ciclo completo; local, ainda não implantado no serviço DNS.
- `scripts/qa_character_preview_ground_fix.mjs`: novo teste local de browser para o ground-fix.
- `scripts/preview_character_glb.mjs`: auditoria aumentada para 121 fases e todos os vértices skinned; reporta mínimo de superfície, penetração e métricas de cabeça Walk/Idle.
- `scripts/dampen_character_walk_upper_body.mjs`: aceita opcionalmente alvo `arms|head`; o default anterior `arms` e o candidato aprovado não mudaram. Teste head 0,55 ficou rejeitado.
- `scripts/diagnose_gltf_without_normal_map.mjs`: ferramenta diagnóstica, não altera a fonte.
- Arquivos de planejamento em `.planning/2026-10-10-walk-animation-web-pipeline/` foram atualizados; fase 8 segue `in_progress`.
- `npm run check` passou: 80 arquivos JS, sem erros de sintaxe. Gate do candidato head-damped também passou; isso não o torna aprovado visualmente.
- Nenhuma dessas alterações muda `ana_clasica`, o GLB candidato público, o jogo ativo ou o DNS nesta sessão.

## Skill e repetibilidade para os próximos personagens

A skill de projeto é `SKILL_BANK/SKILL_J_PERSONAGEM_WEB_WALK.md` (catálogo em `SKILL_BANK/README.md`). Ela já reúne preparação web, guard de bind pose, root motion/Hips, gates, preview multipose, topologia read-only, casos de sidecar e critérios para rejeitar reweight visualmente ruim. Ainda falta atualizar a skill com:

1. medição de superfície skinned em muitas fases e ground-fix pelo ciclo completo;
2. comparação material original vs neutro/normal map isolado e auditoria de normais/tangentes/UV;
3. os resultados desta rodada e os experimentos rejeitados;
4. um perfil por personagem, separado do pipeline-base do elenco.

Pipeline-base para o elenco futuro: verificar licença/fonte → aprovar identidade e pose de bind/Idle → auditar topologia e atributos → rig/skinning e compatibilidade de bind → normalizar clips/root → gate glTF/web → preview multi-fase/ângulo + auditoria de superfície → QA de percurso no runtime → publicar somente preview isolado. Reutilizar scripts e critérios; não copiar pesos/clips automaticamente por nomes de ossos nem misturar identidades.

## Próximos passos quando o PO retomar

1. Ler este arquivo e os três arquivos ativos de planejamento (`task_plan.md`, `findings.md`, `progress.md`); conferir `git status --short` e preservar o worktree sujo.
2. Validar que o ground-fix local está no `public/char-preview.html`; implantar somente esse HTML no serviço que entrega `/game/ufggame/char-preview.html` e testar via DNS que a alteração está ativa. A permissão para rodar o comando local `node scripts/qa_character_preview_ground_fix.mjs` foi aprovada/salva; o teste Chromium já passou.
3. Reabrir o preview DNS acima e confirmar com o PO se o afundamento desapareceu. Se ainda aparecer, auditar o chão/altura do runtime real sem mexer em `ana_clasica`.
4. Continuar a investigação de cabeça, virilha, axilas e linhas globais com as capturas fornecidas e close-ups comparativos. Testar uma mudança por vez e manter candidatos em quarentena.
5. Atualizar Skill J e plano com evidências. Só substituir o GLB de preview depois de gate + validação visual. Nunca ativar a nova Ana no jogo sem aprovação explícita.

## Experimentos já rejeitados ou não repetir sem nova hipótese

- Reweight por nearest entre malhas distintas: distância p95 ~24,99 cm, p99 ~35,26 cm; 44.040 vértices >10 cm. Não transferir/suavizar por proximidade.
- `ARMATURE_AUTO`/bone heat direto na malha multipartida não encontrou solução e deixou 283.122 vértices sem grupos; helper foi corrigido para falhar fechado.
- Sidecar arm-only v1 criou placas por remover pesos fora da região; v2 teve delta VEC4; v3 preservou massa mas não corrigiu pose. Não repetir esse algoritmo sem mudar a hipótese.
- Cópia de tracks upper-body de outra Ana tinha IBMs divergentes e não baixou as mãos.
- UniMate do vídeo gera movimento para rigs (código MIT; checkpoints CC BY-NC 4.0 e não comerciais), não corrige topologia/skinning. Ambiente local sem runtime compatível e sem checkpoints; não é caminho rápido para esta deformação.
- A origem `ana283`/v53 e as variantes reweighted foram rejeitadas por pose/placas; não reativar.
- Não gastar geração Tencent/Mixamo até ter acesso Browser autenticado e hipótese/identidade confirmadas; nenhuma geração foi consumida nesta sessão.

## Estado do worktree

O worktree já estava bastante sujo antes desta sessão, com mudanças do projeto e artefatos do usuário/agentes. Preservar tudo; não usar `git reset`, `checkout` destrutivo nem limpeza ampla. Verificar o status antes de qualquer alteração futura. `ana_work/` contém derivados históricos, muitos ignorados pelo Git. Os arquivos em `/tmp` são apenas diagnósticos e a maioria não persiste entre sessões.
