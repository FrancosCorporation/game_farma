# Handoff da sessão — personagem 3D, caminhada web e pipeline do elenco

**Atualizado em:** 11/10/2026
**Projeto:** `/home/servidor/Git/game_farma`
**Estado ao interromper:** o PO pediu para parar o trabalho e retomar em outra sessão. Este arquivo substitui o resumo anterior e é o ponto de retomada.

## Objetivo e preferências do PO

O primeiro personagem é a Ana. Ela precisa caminhar de forma visualmente convincente no jogo web, sem deformações, clipping ou afundamento; depois o mesmo processo será usado para criar uma gama maior de personagens 3D. O objetivo não é apenas fazer o jogo compilar: revisar a malha visualmente, corrigir as causas reais, validar no browser e deixar um procedimento reutilizável para os próximos assets.

O PO autorizou conduzir o melhor caminho, inclusive experimentar métodos novos, mas pediu para ser avisado honestamente se houver impasse ou se não estiver havendo progresso. Ele não quer ficar aprovando cada alteração. Para revisão, prefere sempre o preview no DNS, pois links locais dificultam o acesso. A publicação em preview isolado não significa autorização para trocar o personagem ativo do jogo. Preservar identidade, rosto, proporções, cabelo, roupa e cores; não esconder defeitos com câmera/luz/material nem trocar pela personagem roxa sem confirmação.

O PO pediu agora para encerrar o terminal/sessão e continuar depois. **Não continue testes, deploy, geração ou alterações além deste handoff até ele retomar.**

## Estado do jogo e do preview

- O personagem ativo e rollback de produção continua `ana_clasica`, `v=38` em `src/app.js`. Não foi alterado nesta fase.
- O preview isolado da caminhada está no DNS: [Abrir Ana caminhando no preview](https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana_walk_preview&anim=Walk&play=1&cam=full).
- O asset `public/models/ana_walk_preview.glb` é uma cópia do candidato `ana_work/ana_qwen_walkidle_armdamped02_20261011.glb`; SHA-256 `0ef2d253ce43bf6f33afe7f4f45a2a6bc224ff583f094f63669e2789d861b92b`, ~1,63 MB. Em sessão anterior ele foi copiado isoladamente para `/app/dist/models/ana_walk_preview.glb` do container `game_farma`; download DNS e local eram byte a byte iguais. O runtime ativo permaneceu inalterado.
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
