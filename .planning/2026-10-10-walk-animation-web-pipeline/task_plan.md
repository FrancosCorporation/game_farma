# Plano: caminhada 3D reutilizável no FarmaCheck

## Objetivo

Entregar a nova Ana com Walk/Idle válidos no navegador e o trajeto real até o balcão; manter o DNS sem a versão estática durante QA; deixar o fluxo reproduzível para as próximas malhas.

## Estado atual (atualização mais recente)

- O runtime e o trajeto estão tecnicamente aprovados em ambiente local, mas a aparência ainda não: a fonte mantém braços/mãos erguidos em Rest/Idle e a passada parece gestual. A versão-base em Walk 25% não mostra as placas do reweight experimental.
- O reweight arm-only v1 tinha um bug: removia os pesos de braço até fora da região geométrica e criava placas; a causa foi corrigida em v3, restringindo a redistribuição aos grupos já existentes e mantendo o delta máximo serializado de massa por lado em 2,22e-16. A QA Rest + Walk 0/25/50/75/100 frente/lado não mostrou placas, mas também não melhorou a pose gestual da base; v3 rejeitada.
- Um diagnóstico de transferência de Walk/Idle de `ana_clasica_parada.glb` encontrou TRS quase iguais (Δtrans máx. 0,001195 m; Δrot 0,000620 rad), mas IBMs divergentes em 7,80; a cópia descartável dos tracks não baixou as mãos. Não ignorar o guard de IBM.
- A compactação estrutural reutilizável removeu 11 vértices órfãos e permitiu sidecar com índice exato; isso resolveu a trava de contagem, não o defeito visual.
- O UniMate do vídeo foi avaliado: serve para gerar movimento em um rig, não para corrigir deformação da malha. Código MIT; checkpoints públicos CC BY-NC 4.0/14,3 GB. Pré-processamento isolado da Ana foi tentado em `/tmp`, mas o ambiente Python/Blender falhou em dependências; sem baixar pesos, alterar asset ou DNS.
- A checagem visual adicional reprovou `ana283_apose.glb` (sem skin/clips e com mãos erguidas) e `ana283_tpose.glb` (geometria aberta/peças aparentando duplicadas); o filename não comprova a pose.
- A rota DNS de preview agora serve `ana_walk_preview.glb` separadamente; o runtime do jogo continua em `ana_clasica`/`v=38`.
- A Tencent anunciou historicamente 20 gerações gratuitas/dia no Hunyuan 3D Global, mas a conta/saldo atual não foi verificado. Browser desta sessão está indisponível (`list=[]`); nenhum upload/cota foi usado. Verificar quota/licença na própria conta antes de gerar.
- A checagem em paralelo concluiu que UniMate não é executável neste host sem instalação/download (AMD RX 6750 XT, Python 3.14, sem Python 3.10/torchvision, Torch falha por CUDA runtime ausente; pesos ausentes) e não corrigiria skinning de qualquer forma. Não prosseguir por esse caminho agora.
- O novo teste `ARMATURE_AUTO` direto na geometria original passou o guard de encaixe do rig, mas o Blender não conseguiu calcular pesos para a malha multipartida e deixou 283.122 vértices sem influência; não houve export. O helper agora valida o retorno do operador e falha fechado. Os caminhos locais de reweight/re-pose já testados continuam sem aprovação visual.
- `ana_clasica`/`v=38` permanece ativo; o DNS publica a candidata somente na rota dedicada de preview.
- O navegador integrado continuou indisponível, mas não foi preciso gerar outra malha: foi possível reaproveitar a candidata Qwen existente e o rig/Walk/Idle locais com igualdade exata de geometria/índices.
- 11/10: a causa da personagem deitada foi localizada nos canais de Hips herdados dos FBXs. O primeiro translation do Walk ficava ~108 unidades fora do bind e a primeira rotação tinha residual de 1,554 rad; no Idle o residual era 1,636 rad. O pipeline agora rebasa a translação na pose de bind e remove o offset de rotação do root preservando a variação do clip.
- Candidata corrigida isolada em `ana_work/ana_qwen_walkidle_rebased_20261011.glb` (1.528.568 bytes; SHA-256 `dec3e0d708b6e3de7e97b0b76b7e480bc7412d2fd92d288bfe1f789d367c0f87`). Preview Walk 0/25/50/75/100 + Idle, incluindo frente/lado, ficou ereto sem as deformações graves anteriores; gate offline, QA real da chegada/passada/Idle e `npm run verify` passaram. Nenhum asset ativo/DNS foi alterado.
- O PO avaliou a candidata no DNS e gostou da melhora. Feedback novo para esta rodada: pés/corpo afundam no chão; cabeça balança demais; persistem imperfeições de forma/deformação entre as pernas e na lateral do tronco sob as axilas.
- O PO esclareceu que o projeto terá um elenco maior; o fluxo de QA/rig precisa ser replicável. Também perguntou se há uma base alternativa de blusa roxa mais fácil de automatizar, a identificar e comparar sem trocar a identidade da Ana às cegas.

## Estado

### 1. Descoberta e contrato — complete
- [x] Ler o runtime, GLBs aprovados, resumo anterior, skills e estado do worktree.
- [x] Encontrar o rig local v53 e comparar a malha visualmente e os 65 joints.
- [x] Confirmar que há uma aba Mixamo no CDP 9222, mas ainda não verificar autenticação nem enviar arquivo sem fonte aprovada.

### 2. Candidato web — complete
- [x] Copiar os clips v53 para uma cópia de trabalho, pinando Walk/Idle no Hips.
- [x] Otimizar para 150 mil triângulos, WebP/Meshopt e ~1,48 MB.
- [x] Gate offline e preview Three.js passam sem erros; Hips motion e offset Walk↔Idle são 0 m.
- [x] Comparar clips aprovados antigos: rest pose compatível, mas contato do pé exigiu 8,7 cm de correção; preferidos os clips locais v53 (1,3 cm).

### 3. Skill e ferramentas — complete
- [x] Criar helpers reusáveis para transplante glTF com verificação do rest pose e preparação do GLB web.
- [x] Atualizar o probe de runtime para medir caminho, ponto final e passada alternada.
- [x] Atualizar Skill J, README e notas de estado; incluir auditoria topológica read-only.

### 4. QA real de chegada — complete
- [x] Rodar em servidor local isolado, sem alterar o GLB de produção.
- [x] Verificar rota monotônica de 5,769 m entre spawn e destino, erro final < 10⁻¹⁵ m.
- [x] Verificar stride relativo detectável (0,747 m), alvo manual e Idle estável.

### 5. Fechamento e publicação — complete
- [x] Retirar do DNS o preview estático antigo; confirmar que o caminho antigo retorna HTML e não GLB.
- [x] Guardar a nova Ana como asset separado `ana_283k_walk`, mantendo `ana_clasica` para rollback.
- [x] Rodar `npm run verify`, gate e preview no asset separado.
- [x] Rodar o probe final com `BOOT_MODEL=ana_283k_walk`.
- [x] Rodar QA completo local (6/6), publicar e confirmar que o novo URL serve o mesmo GLB aprovado; confirmar que o antigo estático não serve modelo.

### 6. Correção estética do skinning — in_progress
- [x] Retirar temporariamente `ana_283k_walk` do runtime, publicar `ana_clasica`/`v=38` e confirmar DNS HTTP 200 + bundle correto.
- [x] Remover a cópia GLB defeituosa do caminho público, preservá-la em `ana_work/` e confirmar que o URL do GLB responde HTML de fallback, não GLB.
- [x] Comparar pose crua com Walk 0%/25% usando a mesma sanitização do runtime; reproduzir artefatos em peito/ombros/axilas/virilha e mão.
- [x] Auditar geometria crua e candidata; não há duplicatas/pontos soltos/não finitos; há somente 2 triângulos degenerados na candidata otimizada.
- [x] Medir a correspondência `NEAREST`; p95=24,991 cm, p99=35,258 cm e 44.040 vértices >10 cm. Rejeitar transferência e smoothing como correção.
- [x] Auditar rigs FBX antigos; as cópias avaliadas têm problemas de orientação/root motion ou identidade incompatível e não serão promovidas.
- [x] Gerar/aplicar pesos voxel por índice em candidato; bind, hierarquia, clips e atributos de vértice passaram invariantes. A primeira rodada ainda falha visualmente nos sapatos.
- [x] Ajustar regionalmente pesos preservando `Foot`/`ToeBase`/pernas inferiores; melhorou as pontas dos sapatos sem regredir torso/axilas/quadril.
- [x] Estender/usar QA visual multi-fase/multi-ângulo e comparar Walk com pose neutra/Idle.
- [x] Validar visualmente ombros/axilas, braços, quadril/virilha e roupas; resultado registrado como reprovado pela pose-base/gesto de braços.
- [x] Atualizar Skill J com critério de inspeção multi-fase/multi-ângulo, auditoria pré-transferência e topologia read-only.
- [x] Testar re-pose local descartável com rotações de braços/antebraços da referência v39, bake de skin, rebasing dos clips e IBM recalculada; carregar no Chromium e inspecionar Rest + Walk em várias fases/ângulos.
- [x] Auditar fontes FBX históricas: `ana283_APOSE.fbx` não tem rig/pesos e já contém mãos erguidas; TPOSE3 está sem rig e tem peças soltas; `ana283_WALK` tem root motion forte.
- [x] Criar auditor read-only de distribuição anatômica de pesos e revalidar no candidato exato; a auditoria apontou influência ausente nas mãos e quase ausente nos antebraços.
- [x] Confirmar segmentos no espaço do runtime e comparar as variantes locais de pesos v1/v2/v3; todas foram reprovadas visualmente.
- [x] Criar um gerador não destrutivo de sidecar anatômica arm-only, preservando a geometria, IBM, hierarquia e clips do GLB base.
- [x] Testar reweight arm-only anatômico no mesh exato após compactação segura; estatísticas melhoraram, mas preview Rest/Walk 0/25/50/75/100 revelou placas triangulares. Rejeitado; a base visual é melhor.
- [x] Testar offsets diagnósticos locais dos braços nos três eixos; não produziram postura natural e não foram incorporados.
- [x] Atualizar Skill J com compactação antes de sidecar por índice e os resultados negativos comprovados do reweight/offset arm-only.
- [x] Diagnosticar e corrigir o bug de remoção global de pesos na v1; testar sidecar v3 limitada a influências existentes, incluindo verificação de massa após o limite VEC4 e render multi-fase.
- [x] Testar cópia descartável de canais de braço de `ana_clasica_parada.glb`; confirmar que não corrige a pose e registrar incompatibilidade de IBM.
- [x] Atualizar Skill J com a causa da regressão v1, critérios seguros para sidecar e reprovação visual da v3.
- [x] Avaliar `ana_qwen_opt.glb` já existente; confirmar identidade e hashes exatos com o rig local; combinar Walk/Idle, rebasing correto de Hips e validar a candidata no preview e no jogo. Não consumir nova geração.

### 7. Preview público isolado — complete
- [x] Publicar apenas o GLB candidato em uma rota/arquivo de preview público, sem trocar `ana_clasica` no runtime.
- [x] Validar por HTTP que a página do preview e o GLB retornem os tipos/conteúdos esperados no DNS.
- [x] Entregar o link DNS testado ao PO.

### 8. Refinamento após feedback visual — in_progress
- [x] Medir a altura dos pés no ciclo e localizar por que a passada parece afundar no chão; corrigir o ground-fix do preview para usar o ciclo completo e publicar/verificar somente o HTML.
- [ ] Reduzir a movimentação excessiva de cabeça sem congelar o pescoço.
- [x] Separar defeitos dinâmicos e estáticos: a dobra da camiseta/axila era amplificada por pesos de `LeftArm` e caiu após transferência localizada; a dobra escura e o fragmento na virilha aparecem quase iguais em Idle e Walk 25%, portanto são resíduos fixos da forma/superfície base e seguem sem correção.
- [x] Isolar a dobra triangular da camiseta sob a axila: congelar apenas `Shoulder` não resolveu; congelar `Arm` resolveu. Auditoria confirmou influência alta de `LeftArm` na lateral da camiseta.
- [x] Corrigir em cópia a região lateral do tórax transferindo influência de `LeftArm` para `Spine1`; gate e QA visual multi-fase/multi-ângulo passaram sem erro de navegador.
- [ ] Investigar os padrões repetitivos de superfície com hipóteses separadas: geometria/topologia, normais/tangentes/UVs, textura/material/shader e iluminação; comparar Rest/Walk e material neutro/original.
- [ ] Localizar a alternativa de blusa roxa e comparar forma, skin, rig, clips e esforço de automatização com a Ana atual.
- [x] Atualizar somente o preview dedicado no DNS e confirmar que o GLB remoto corresponde ao candidato; o jogo ativo continua `ana_clasica`/`v=38`.
- [ ] Aguardar revisão do PO no preview isolado antes de qualquer promoção ao jogo.

### 9. Correção de rachaduras e deformações da calça — pausado por feedback do PO (calça na caminhada está aceitável)
- [ ] Fixar a candidata e comparar com as fontes mesh/rig; confirmar primitive(s), material e pose de bind.
- [ ] Auditar índices, triângulos degenerados/duplicados, componentes desconectados, bordas abertas, vértices coincidentes e normais na calça/virilha.
- [ ] Separar artefato de geometria/sombreamento de deformação: inspecionar Rest e ciclo inteiro, com atenção aos frames de passada oposta.
- [ ] Auditar pesos de Pelvis/Hips, LeftUpLeg/RightUpLeg, joelhos e ossos auxiliares nas regiões afetadas.
- [ ] Implementar correção localizada em cópia; preservar topologia/detalhe legítimo e verificar ausência de novas interseções/fendas.
- [ ] Validar Walk/Idle em frente, lado, costas e por baixo; confirmar integridade do GLB, gate de movimento e runtime do preview isolado.
- [ ] Atualizar o preview dedicado somente após QA local completo; manter o modelo ativo sem alteração.

## Decisões

| Decisão | Motivo |
|---|---|
| Manter rig/clips v53 apenas como candidato de diagnóstico | O gate de movimento passa, mas a revisão visual reprova; os pesos transferidos da referência não correspondem à malha e não podem ser aceitos por semelhança de rig. |
| Manter o asset antigo | Novo candidato separado oferece rollback sem sobrescrever `ana_clasica.glb`. |
| Publicar preview isolado no DNS | Pedido explícito do PO para sempre poder revisar por um link público; não equivale a aprovar ou ativar a candidata no jogo. |
| Não publicar preview estático | O PO pediu a sequência de caminhada até o destino, não só o modelo em repouso. |
| Usar SKILL_BANK para a skill | O fluxo é específico deste jogo e o banco do projeto já é a convenção consumida pelos demais modelos. |
| Suspender o candidato 283k no DNS durante o reparo | A caminhada cumpre o trajeto, mas inspeção visual posterior revelou deformação grave; movimento numérico não é aprovação de skinning. |

## Bloqueios

O candidato 283k está suspenso até correção e QA visual. UniMate não é alternativa prática neste host nem conserta pesos. O teste adicional de bone heat direto falhou na geometria multipartida; as transferências via proxy anteriores também foram reprovadas visualmente. A integração Browser desta sessão está vazia e não permite verificar a conta Hunyuan nem operar Tencent/Mixamo.

### 10. Refinamento anatômico do ombro/axila — in_progress
- [ ] Confirmar a região exata do resíduo vertical triangular na lateral do peito: o mapa categórico confirma uma transição serrilhada de influência na axila, mas falta separar manga/corpo/topologia.
- [x] Validar o mapa de pesos por dominância por lado/frente; a captura RGB inicial saiu preta e foi descartada, mas o mapa categórico corrigido funciona.
- [ ] Ajustar pesos da faixa localizada demonstrada pelo mapa, preservando malha, rig, bind pose e clips.
- [x] Testar avanço/abdução 0°/45°/90°/135°/180° com rotação de clavícula proporcional; o primeiro trial revelou placas a partir de 45° e foi reprovado.
- [ ] Comparar os dois sinais/eixos e avaliar se a pose synthetic corresponde a elevação real antes de ajustar novamente pesos da manga/axila.
- [ ] Comparar ombros esquerdo/direito e Walk/Idle; conferir frente, lado, costas e 3/4.
- [ ] Passar gate estrutural e QA visual; atualizar só o preview isolado se a correção for aprovada localmente.

## Next Step

O ground-fix, torso0,7 e a correção localizada de pesos do tórax estão publicados somente no preview DNS; o GLB remoto tem SHA-256 `b81e07f5123df0e55f039a23d07530875f6071d6d17e1e99a765e6455f661b87`. O jogo ativo continua `ana_clasica`/`v=38`. A calça foi considerada aceitável pelo PO durante a caminhada e a investigação foi pausada. Próximo: auditar a costura dos componentes sob o sweep e comparar sinais/eixos de elevação; ajustar a máscara de pesos somente após separar uma pose válida de manga/topologia.

## Errors Encountered

| Erro | Tentativa | Resolução |
|---|---|---|
| Sidecar de pesos usou nomes Three sem `:` ao aplicar ao GLB | 1 | Mapeados para o namespace glTF preservando os índices dos joints |
| Algumas linhas WEIGHTS_0 U8 normalizadas somavam 1,00392 e excediam a tolerância do applier | 1 | Normalizados os quatro pesos por vértice antes de serializar Float32 |
| `rg --files /tmp` encontrou diretórios temporários privados sem permissão de leitura | 1 | Resultado útil preservado; buscas seguintes ficaram restritas a `/tmp/ana_*` |
| Leitura de `/tmp/ana_shoulder_weight_audit.json` via JSON falhou | 1 | Relatório não é JSON válido; não usado para decisões, medições refeitas via browser runtime |
| O auditor de malha assumia sempre GLB e tentou ordenar `None` ao ler FBX | Primeira extensão para FBX | Adicionada ramificação de importação FBX e saída `gltfMeshNodeNames: null`; nova auditoria do FBX passou e hashes coincidiram. |
| Import dinâmico para o render unlit tentou `/vendor/three/build/three.module.js`, inexistente neste preview | Primeiro screenshot diagnóstico | Inspecionei a rota do viewer e usei `/vendor/three/three.module.js`; captura unlit passou sem erros de navegador. |
| `BufferGeometry.computeVertexNormals()` gravou vetores zero no atributo NORMAL Int8 normalized e gerou tela preta | Primeira tentativa runtime sobre GLB skinned | Diagnóstico corrigido ao substituir NORMAL por Float32 antes do recálculo; resultado smooth válido, só 2 vértices órfãos zerados, sem publicar alteração. |
| `Accessor.setMin()` não existe na versão instalada do glTF-Transform | Primeira geração de smoothing posicional | Removi a chamada; os metadados min/max são opcionais e o writer serializou o array atualizado. Gate/topologia passaram. |
