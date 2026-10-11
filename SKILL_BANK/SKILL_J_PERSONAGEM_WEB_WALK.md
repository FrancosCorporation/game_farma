---
name: SKILL_J_PERSONAGEM_WEB_WALK
description: Pipeline de personagem humanoide estilizado com rig Mixamo, clips Walk/Idle e validação para renderização no FarmaCheck Web (Three.js). Use para preparar ou substituir um avatar; não use para props, personagens sem animação ou rig manual fora do runtime atual.
variants:
  - personagem_novo
  - troca_de_malha_com_rig_mixamo
  - diagnostico_walk_idle_web
setup:
  - Repositório game_farma e dependências npm instaladas.
  - Para auto-rig no Mixamo, navegador com sessão Adobe autenticada; não contorne login nem reenvie arquivo sem verificar o estado da página.
ports: {}
---

# Skill J — Personagem humanoide: Walk/Idle para Web

## Papel

Entregar uma malha humanoide estilizada que mantenha sua silhueta/traços de design, seja deformada por um rig válido e renderize no jogo com caminhada e idle coerentes. Um GLB que apenas abre no viewer não está pronto: precisa passar no contrato do runtime e no QA visual isolado.

## Quando usar

- Um personagem novo precisa de rig e animações para o FarmaCheck Web.
- Um GLB abre, mas fica estático, deslocado, invertido, esticado, com fita de sombra ou com passada deslizando.
- Antes de apontar o jogo para um GLB substituto.

## Fonte de verdade no repositório

Antes de alterar algo, leia o código e confirme os nomes/valores atuais:

- `src/scene/patient.js`: orientação Z-up→Y-up quando necessário, normalização para 1,72 m, centralização/assentamento, escolha de clips pelo nome, cadência e movimento de root.
- `src/scene/glbLoader.js`: MeshoptDecoder e sanitização de canais de ossos de ponta que causam fitas.
- `src/app.js`: personagem ativo e cache-bust. Não troque o avatar ativo durante QA.
- `scripts/gate_character_walk.mjs`: gate offline para o contrato Mixamo atual.
- `public/models/ana_clasica.glb` e `public/models/ana_coriza.glb`: referências aprovadas para comparação, não arquivos de trabalho.

O contrato atual é Three.js vanilla + GLTFLoader com Meshopt, clips chamados `Walk` e `Idle`, um skin Mixamo com 65 joints e avanço in-place do Hips. O gate atual é específico a esse contrato. Se a equipe escolher outro rig, atualize explicitamente o gate e o runtime; não reduza os limites nem force 65 joints por conveniência.

## Fluxo

1. **Inspecione antes de regenerar.** Leia `resumo.md`, alterações locais, contrato de trabalho e o GLB candidato; confira tamanho, triângulos, eixo, escala, pose, materiais, texturas, skin e clips. Preserve arquivos do usuário. Confirme se scripts e assets citados por skills antigas realmente existem — nomes `tmp_*` e caminhos `/tmp` podem ser históricos.
2. **Proteja a identidade visual e aprove a pose-base antes do rig.** Use `docs/DIRETRIZES_ARTE_ESTILIZADA.md` e a referência aprovada. Preserve proporções, rosto, cabelo, roupa e silhueta. A pose de bind/rig deve ser frontal e simétrica, em A-pose confortável: braços afastados do tronco e inclinados um pouco para baixo, cotovelos quase estendidos, dedos visíveis e pernas ligeiramente separadas. Confira a malha sem animação nessa A-pose e o clip `Idle` separadamente: no jogo, o Idle deve trazer os braços para perto do corpo, mãos relaxadas junto às coxas e sem gesto de aceno/pare. Se a malha-fonte já vier com braços acima dos ombros, mãos erguidas/palmas para a frente ou cotovelos muito flexionados, não tente esconder isso com pesos ou troca de clip; repose a malha ou gere uma nova versão antes do rig.
   Não confie no nome do arquivo nem no rótulo “A-pose”: renderize a fonte sem animação e confira visualmente pose, peças soltas, identidade e silhueta antes de riggear. Um arquivo chamado `APOSE` pode não estar em A-pose nem ter esqueleto/pesos.
   Se considerar um gerador externo, confirme na própria conta se a geração está disponível e sem cobrança, confira a licença dos modelos para o uso pretendido (inclusive comercial) e verifique termos de envio antes de carregar arquivos. Cotas/preços encontrados em anúncios ou documentação antiga não garantem o saldo atual. Não consuma cota paga nem envie material sensível sem autorização; mantenha o resultado isolado até a aprovação visual.
3. **Audite o encaixe antes de transferir pesos.** Se o rig vem de outra malha, não confie apenas em nomes de bones, cobertura ou pesos normalizados: meça a distância dos vértices da malha alvo à superfície de referência, por região e em repouso. Use o diagnóstico sem escrita:

   ```bash
   /snap/bin/blender -b --python scripts/audit_character_weight_map.py -- \
     /caminho/para/referencia_rigged.glb /caminho/para/alvo_cru.glb
   ```

   A medição deve ser feita no mesmo frame, escala e pose. Como heurística conservadora, interrompa o `NEAREST` se o p95 passar de 5 cm ou se houver regiões contínuas acima de 10 cm; confirme ombros, axilas, virilha e roupa separadamente. Esses valores não substituem inspeção visual. Se a pose/rest do rig não corresponde à malha, prefira auto-rig da própria malha; não tente compensar um encaixe ruim com smoothing global.

   Antes/depois da otimização, faça também uma auditoria topológica read-only:

   ```bash
   /snap/bin/blender -b --python scripts/audit_character_mesh.py -- /caminho/para/candidato.glb
   npm run qa:character-topology -- /caminho/para/candidato.glb
   ```

   O Node auditor lê os índices do GLB antes de qualquer importer; o Blender mede bordas/componentes após importar. Compare faces degeneradas/duplicadas, vértices soltos, winding inconsistente e componentes entre o bruto e o candidato. Bordas abertas e componentes separados podem ser intencionais em roupa/cabelo; não os apague automaticamente nem trate uma contagem alta como prova de defeito. A auditoria estrutural não detecta interseção entre superfícies e não substitui o preview.

   Se for calcular pesos no Blender e reaplicá-los ao GLB por índice, confirme antes que Blender e GLB têm exatamente a mesma contagem e ordem de vértices. Importadores podem descartar vértices sem triângulos incidentes, deslocando todos os índices seguintes. Para uma única primitive skinned em TRIANGLES, compacte uma cópia por seus índices antes do sidecar:

   ```bash
   node scripts/compact_gltf_unused_vertices.mjs \
     /tmp/candidato.glb /tmp/candidato_compact.glb
   npm run qa:character-topology -- /tmp/candidato_compact.glb
   ```

   O helper remapeia em conjunto POSITION, NORMAL, UV, JOINTS/WEIGHTS e morph targets; verifica os valores de cada accessor e o conjunto de triângulos com winding, sem sobrescrever a origem. Exija zero vértices não referenciados na auditoria fonte e igualdade da contagem importada pelo Blender com POSITION antes de gerar o sidecar. Meshopt pode reordenar triângulos ao serializar; compare geometria/indexação renderizada, não a sequência byte a byte dos índices. Essa compactação corrige correspondência estrutural, não os pesos nem a pose.

   Audite também a **distribuição anatômica dos pesos**, não só soma 1, índices válidos ou quantidade de joints. Mapeie cada índice de `JOINTS_n` ao nome em `skin.joints` e considere todos os pares `JOINTS_n`/`WEIGHTS_n` do GLB. Para cada membro e peça de roupa, confira em pose de bind quais ossos realmente influenciam a região: antebraço no antebraço, mão/dedos nas mãos, braço/clavícula/torso na transição do ombro, e pelve/coxa na virilha. Um relatório útil registra massa total por joint, máximo/percentis, vértices com influência relevante e sua localização; um mapa de cores por joint ajuda a revelar pesos concentrados no membro errado. Peso zero ou quase zero no osso que deveria mover uma região é falha crítica: pare antes de ajustar o clip, re-posear bones ou fazer smoothing. Não fixe uma porcentagem universal de influência: anatomia estilizada, roupas, topologia e rig mudam a distribuição esperada. Confirme a interpretação no preview da malha exata, em repouso e em movimento.

4. **Otimize uma cópia e prepare o FBX em área temporária.** Se o bruto exceder os budgets, use glTF-Transform em uma cópia e compare o preview antes de aceitar a redução. No candidato Ana, a variante de 150 mil tris (25% abaixo da versão inicial de 200 mil) ficou visualmente equivalente no preview 1000×900, preservando a altura e reduzindo o bruto de 40,8 MB para 1,13 MB:

   ```bash
   node_modules/.bin/gltf-transform optimize bruto.glb /tmp/candidato_webopt.glb \
     --compress meshopt --meshopt-level high --simplify-ratio 0.3 \
     --simplify-error 0.001 --texture-size 1024 --texture-compress webp \
     --flatten false --join false --instance false --palette false
   ```

   Esses parâmetros são um ponto inicial, não garantia para outras topologias. Rode `npm run preview:character -- /tmp/candidato_webopt.glb /tmp/candidato.png`, inspecione silhueta/rosto/roupa e confira `glb_info.mjs` antes de continuar. Converta e centre o pivô com o helper versionado; ele não sobrescreve a saída:

   ```bash
   /snap/bin/blender -b --python scripts/prepare_character_fbx.py -- \
     /tmp/candidato_webopt.glb /tmp/candidato_mixamo.fbx
   ```

   Confirme o chão, a origem central e a assinatura FBX antes do upload. Nunca sobrescreva o GLB aprovado.
5. **Faça auto-rig no Mixamo.** Verifique a sessão autenticada antes de upload. Coloque os marcadores nos marcos anatômicos, valide simetria e pose pela página, então processe e baixe FBX Binary em T-pose. Uma página sem sessão requer login humano; não tente contornar autenticação. Se Chrome estiver indisponível, peça a reconexão do Browser em **Settings → Computer use**; não substitua a sessão por Playwright/CDP externo nem leia cookies/perfis. Respeite o contrato de tentativas registrado para a tarefa e pare se o upload continuar bloqueado.
6. **Monte os clips no nível glTF, não via NLA do Blender.** Se houver um rig local confiável, confira 65 joints, nomes, hierarquia, TRS local e global, frame da malha e inverse-bind matrices. O helper abaixo aborta se o bind/frame não casar e só então copia canais por nome:

   ```bash
   node scripts/transplant_character_clips.mjs \
     /tmp/malha_com_rig.glb public/models/ana_coriza.glb \
     /tmp/malha_com_clips.glb
   ```

   O resultado ainda não está aprovado: compatibilidade do esqueleto é necessária, mas não suficiente. Mesmo TRS local quase idêntico não prova compatibilidade do bind. Faça preview de Walk/Idle e QA do chão, da deformação e da passada. No ensaio da Ana, a exportação Blender mudou as inverse-bind matrices em até 7,80 e o transplante simples de canais gerou uma malha explodida; a validação deve interromper esse caso antes de produzir um candidato. Se não existir rig/frame realmente compatível, siga o auto-rig Mixamo da Skill H.

   Com clips aprovados no candidato, normalize uma cópia para o contrato web:

   ```bash
   node scripts/prepare_animated_character_web.mjs \
     /tmp/malha_com_clips.glb /tmp/personagem_web.glb \
     <walkSpeed_m_s> <walkAdvance_m_loop> 0.3
   ```

   O helper pinna a translação do Hips na translação de bind do node, não no primeiro valor do clip; isso remove o root motion sem deixar um offset absoluto de FBX preso ao corpo. Também rebasa a rotação do Hips para a rotação de bind, removendo a orientação constante do primeiro key e preservando a variação relativa do clip. Depois reduz a malha, comprime texturas WebP até 2048 px e aplica Meshopt/quantização. Revise o relatório dos offsets e confira Walk/Idle no preview: esse rebasing só é correto para clips in-place, com movimento do personagem tratado pelo root do jogo. Informe velocidade e avanço medidos/calibrados para este clip; `1.684` e `1.7402` são os valores específicos da Ana atual, não defaults para novos personagens. O ratio `0.3` é um ponto inicial: confirme a contagem de triângulos e a silhueta depois da simplificação.
7. **Valide o contrato offline.** Rode:

   ```bash
   npm run qa:character-walk -- /caminho/para/candidato.glb
   ```

   O gate verifica estrutura GLB, skin/joints Mixamo, triângulos, valores finitos, canais Walk/Idle vivos **depois da mesma sanitização de bones de ponta usada pelo runtime**, presença dos tracks de Hips, extensões não suportadas e cadência compatível. Bounds offline são apenas informativos: não os converta em escala/métrica de runtime, pois accessor bounds de uma malha com skin não equivalem ao `THREE.Box3` deformado. Aviso de tamanho acima de 8 MB pede revisão; o limite atual é 15 MB. O gate não julga estética, pés deslizando, clipping nem qualidade de deformação.

   Como camada complementar, se o CLI oficial **Khronos glTF-Validator** já estiver disponível, valide também o GLB e revise o relatório de estrutura, buffers, accessors e samplers de animação. Isso detecta problemas de conformidade glTF, mas não sabe se o antebraço está ponderado anatomicamente nem se a caminhada parece boa; mantenha os gates e previews do projeto. Não instale uma dependência só para substituir QA visual ou o contrato específico do runtime.
8. **Faça preview no Three.js e QA visual fora do caminho ativo.** O harness carrega o candidato com GLTFLoader/Meshopt, aplica a mesma normalização por `THREE.Box3` usada no runtime e os mesmos filtros de `sanitizeClips`, e produz PNG. Se houver clips Walk/Idle e Hips, também amostra ambos em 31 tempos para medir em metros o movimento do Hips e o offset inicial Walk↔Idle. Para ver uma pose da passada, use a fase de animação e ângulo da câmera:

   ```bash
   node scripts/preview_character_glb.mjs /caminho/para/candidato.glb /tmp/candidato_walk.png Walk 0.25 0
   ```

   O preview falha se o Hips mover mais de 0,05 m em qualquer clip ou se o offset inicial entre Walk e Idle passar de 0,05 m. GLBs sem o par Walk/Idle (por exemplo, uma malha crua pré-rig) recebem `not-run` para auditoria de animação, sem falhar por isso. A aprovação visual exige corpo inteiro em Walk 0%, 25%, 50%, 75% e 100%, de frente, lado e costas, mais Idle; inspecione especialmente ombros/axilas, cotovelos, quadril/virilha, joelhos, pés e mãos. Uma pose/ângulo único não passa. Examine também o conjunto sem movimento para separar defeito de malha/sombreamento do defeito de skinning. Depois use build/servidor isolado e o runtime real:

   Para diagnosticar uma pose sem alterar o GLB, o harness aceita no 7º argumento offsets temporários por osso, em graus, como JSON. Eles só afetam a imagem de preview; não são correção nem exportação de animação:

   ```bash
   node scripts/preview_character_glb.mjs /tmp/candidato.glb /tmp/teste.png Walk 0.25 0 \
     '{"mixamorig:LeftArm":[0,0,-10],"mixamorig:RightArm":[0,0,10]}'
   ```

   Use isso apenas para diagnosticar eixos/pose. Não adote offsets manuais se produzirem clipping, assimetria ou se o bind/weights estiverem errados.

   ```bash
   npm run build
   # Faça backup do dist/models/<avatar-ativo>.glb antes de trocar só a cópia em dist/.
   cp /tmp/personagem_web.glb dist/models/<avatar-ativo>.glb
   PORT=4180 npm run serve
   node scripts/qa_character_walk.mjs http://127.0.0.1:4180/
   ```

   O probe registra a rota real de entrada até o destino, confirma o ponto final, mede cada pé no espaço local do avatar e exige passada alternada. Não faça essa substituição em `public/` durante QA. Capture a fase de entrada e a chegada; confira pés, escala, crossfade e câmera. Um frame isolado pode parecer parado.
9. **Troque o personagem somente após aprovação.** Aponte o runtime ao candidato apenas em ambiente isolado. Rode checks/build e QA aplicáveis. Não faça deploy nem altere o modelo ativo/produção sem pedido explícito separado.

## Contrato numérico observado no asset aprovado

Use como baseline para diagnóstico, não como lei universal para outros rigs:

| Medida | Baseline atual |
|---|---:|
| Altura normalizada no jogo | 1,72 m |
| Skin Mixamo | 1 skin / 65 joints |
| Triângulos | ~150 mil |
| Walk / Idle | mínimo 15 / 8 canais vivos no gate; asset pode ter mais |
| Hips durante os clips | deslocamento ≤ 0,05 m após escala do runtime |
| Salto de Hips Walk↔Idle | ≤ 0,05 m após escala do runtime |
| Velocidade/avanço | `asset.extras.walkSpeed` e `walkAdvance`; legados usam fallback no runtime |
| Arquivo | acima de 8 MB gera aviso; acima de 15 MB falha no gate |

Bounds de accessor calculados offline podem ser muito diferentes da caixa real do `THREE.Box3` para uma malha com skin. Eles são informativos e não devem ser usados para calcular metros. A escala e as métricas em metros vêm do preview real com GLTFLoader, após a normalização aplicada pelo runtime. Não compare a translação absoluta local do Hips com a posição de repouso do node: o contrato relevante é o movimento mundial do Hips e o offset inicial entre clips após normalização.

## Falhas já conhecidas

- **Modelo aparece de lado/fora do enquadramento:** confira eixo up, pivô e centralização antes de mexer na câmera.
- **Rest fica em pé, mas aplicar Walk/Idle deita ou desloca o personagem:** compare os primeiros valores dos canais translation/rotation do Hips com o TRS de bind do próprio node. Um offset constante do FBX pode exceder 100 unidades e ~90°; fixar a translação no primeiro key preserva o erro, em vez de corrigir. Para clips in-place, rebase a translação no valor de bind e remova o offset inicial da rotação preservando a variação relativa; depois renderize todas as fases e rode o QA real. Não tente resolver isso alterando a malha, pesos ou câmera.
- **Walk não se move:** confirme nome do clip, canais vivos, rig alvo e mixer; canal existente com valores constantes não é animação funcional.
- **Auditoria diz que rotações não variam, mas o preview mostra movimento:** verifique `normalized` e o `componentType` do accessor de saída antes de medir quaternions; decodifique valores int8/uint8/int16/uint16 para float e, em `CUBICSPLINE`, compare apenas o valor de cada chave (não as tangentes).
- **Personagem desliza:** meça avanço por loop e duração; o `walkSpeed` do asset precisa concordar com a cadência. Confirme visualmente também — o gate só checa coerência numérica.
- **Fitas esticadas:** revise weights em bones de ponta e a sanitização existente em `glbLoader.js`; não tente mascarar com material/sombra.
- **Pula ao trocar Walk/Idle:** investigue translação do Hips dos dois clips e o mesmo espaço/orientação de rig. Não compare o valor absoluto ao rest pose como um teste universal.
- **Clips quebram depois da fusão:** confira compatibilidade de skeleton/rest pose e use glTF-Transform. O caminho NLA do Blender 5.2 já produziu clips vazios neste projeto. Compatibilidade de TRS não garante bom contato dos pés: observe `ground-fix` no log e a transição de chegada→Idle.
- **Pesos parecem válidos, mas a roupa vira pontas:** a soma 1.0 e 65 joints só provam a estrutura. Meça a distância alvo→referência; uma malha em outra pose/silhueta pode fazer `NEAREST` ligar axila/virilha a vértices de outro membro.
- **`ARMATURE_AUTO` não atribui pesos:** confira o retorno do operador e a cobertura de grupos antes de dizer que o cálculo concluiu. No teste Ana 283k em 11/10/2026, o Blender alertou `Bone Heat Weighting: failed to find solution for one or more bones`; 283.122 vértices ficaram sem pesos e nenhum GLB foi exportado. A malha combina partes difíceis para bone heat direto. O helper `scripts/rebind_character_polyinterp.py` agora falha explicitamente se o operador não retornar `FINISHED`, além de validar vértices cobertos; não remova esses guards. Um proxy pode permitir resolver bone heat, mas a transferência proxy→alvo ainda exige auditoria de distância e QA visual completa.
- **Sidecar por índice rejeitado por contagem diferente:** não force nem ignore o guard de vertexCount. Audite vértices não referenciados no GLB; compacte uma cópia preservando/remapeando todos os atributos, reimporte no Blender e regenere o sidecar para o SHA dessa cópia. Igualdade de contagem é necessária, e a política de ordenação do importer também deve estar comprovada.
- **Clips de antebraço/mão quase não mudam a silhueta:** audite a distribuição espacial de pesos por joint em todos os pares `JOINTS_n`/`WEIGHTS_n`. No candidato de diagnóstico Ana 283k, o par `JOINTS_0`/`WEIGHTS_0` concentrava massa nos ossos de braço superior (8.910 à esquerda; 7.528 à direita), enquanto antebraços tinham pouca massa (145/132; influência individual máxima ~0,12) e mãos não apareciam nesse par. O re-pose dos bones, portanto, quase não alterou a malha. Esses números são evidência daquele arquivo e daquele conjunto de atributos, não metas para outros modelos; confirme todos os conjuntos de pesos e a localização das influências antes de decidir entre corrigir skinning ou substituir a fonte.
- **Pose estática limpa, Walk gera fragmentos:** priorize revisar pose de repouso/bind e correspondência dos pesos. Se o p95 do mapa alvo→referência estourar o limite, descarte o mapa; não tente esconder a falha com smoothing, material ou iluminação.
- **Malha já nasce com braços/mãos erguidos:** reprove a pose-base antes de riggear. Um Walk melhor não corrige a geometria/skin bind em repouso; peça uma malha em A-pose confortável e faça o Idle voltar a uma pose relaxada. A-pose para rig não significa braços levantados durante o jogo.
- **Trocar só os canais dos braços não muda a silhueta:** isso não prova que faltam mais curvas; a malha pode ter bind pose, inverse binds ou pesos incompatíveis com o clip. Preserve o GLB e investigue a pose/skin antes de continuar a transferência.
- **Re-pose de bind matematicamente válida, mas braços continuam erguidos no preview:** nomes/contagem de joints, residual de IBM baixo e clips carregando não bastam. O experimento `scripts/repose_gltf_bind_from_reference.mjs` rebasa malha e animações numa cópia; no asset atual os checks passaram, mas a silhueta quase não mudou. Reprove visualmente, não ajuste mais quaternions às cegas; obtenha/repose a geometria da malha exata em A-pose confortável e riggue essa mesma malha.
- **Fonte chamada `APOSE`/`TPOSE` sem rig:** confira a imagem e os grupos de vértices, não confie no nome. No conjunto `ana283`, `ana283_APOSE.fbx` já tinha mãos erguidas e zero pesos; `ana283_TPOSE3.fbx` não tinha rig e trazia peças largas soltas. Não são fontes aprovadas só pelo filename.
- **Caso Ana 283k (10/10/2026):** reweight voxel no mesh exato, preservando pesos originais da perna inferior, reduziu spikes graves, mas não corrigiu braços/mãos erguidos que já existiam no bind/Idle. Um teste parcial de tracks com `ana_coriza` foi rejeitado: as inverse-bind matrices diferiam em até 7,80 e a imagem não melhorou. Não extrapole esse método como correção universal; a lição reutilizável é reprovar a pose-fonte e não confiar só em TRS/nome de joint.
- **Sidecar arm-only — falha de implementação e recuperação (Ana 283k):** a v1 removia todos os pesos de ossos de braço antes de testar a distância; assim, até vértices fora do raio perdiam influências originais (39.457 vértices tiveram massa de braço removida), criando placas. Não copie esse padrão. Se precisar de um experimento arm-only, calcule a queda geométrica, exija massa de braço existente do mesmo lado, redistribua somente entre os ossos que já influenciavam aquele vértice e só então serialize VEC4. A v3, em cópia compactada, teve delta máximo de massa por lado de `2,22e-16` após serialização e passou a invariância de geometria/bind/hierarquia/clips. QA visual em Rest e Walk 0/25/50/75/100, frente e lado: as placas da v1 desapareceram, mas a pose de mãos abertas/erguidas e a caminhada gestual não melhoraram em relação à base; portanto a v3 também foi rejeitada. Métrica de pesos não substitui preview.
- **UniMate / geração de movimento por texto:** é uma alternativa de animação para um rig já existente, não uma ferramenta de reparo de skinning. O `rig_preprocess` oficial aceita GLB/glTF/FBX rigado, pede revisão dos labels dos joints e da direção, e o modelo divulgado admite até 70 joints (71 slots internos). A saída é um clip de 60 frames/30 fps com rotações articuladas e trajetória do root. Não corrige topologia, weight paint, bind pose ou proporções; bones que já deslizam/esticam mantêm seus comprimentos incorretos. A documentação afirma que vários rigs/movimentos ainda falham, então toda saída precisa de QA isolado em multi-fase/multi-ângulo. Antes de usar pesos, verificar a licença vigente: o código do repositório é MIT, mas os checkpoints publicados estão em CC BY-NC 4.0 (sem uso comercial). O checkpoint consultado tinha 14,3 GB. Neste workspace não há checkpoint baixado; o host é AMD RX 6750 XT e não tem Python 3.10/torchvision nem runtime CUDA/ROCm pronto. O `torch` presente falha na importação por falta de `libcudart.so.13`, enquanto a instalação oficial consultada exige Python 3.10 e PyTorch/CUDA 12.4. Não tentar instalar/baixar pesos para este reparo: além do custo de tempo/armazenamento, UniMate só mudaria o movimento, não consertaria a deformação do mesh.
- **Ana 283k sem deformação extrema, mas ainda com gesto de “pare”:** na captura Rest do GLTFLoader, bones de braço/antebraço/mão ficam em posições descendentes, mas a geometria visível mantém as mãos acima do peito; a auditoria anterior também encontrou massa praticamente ausente em ForeArm/Hand. Copiar os canais upper-body de `ana_clasica_parada.glb` não mudou a silhueta (apesar de TRS de joints próximos: Δtrans máx. 0,001195 m e Δrot 0,000620 rad); as inverse-bind matrices, porém, divergem em até 7,80. Reprove a cópia e não ignore esse guard para promoção. Para preservar a identidade e obter uma caminhada natural, a próxima intervenção precisa corrigir a pose/fonte e o skinning da malha exata ou autorar um novo rig para uma versão visualmente aprovada em A-pose; não continue reweight/quaternion/track transfer às cegas.
- **Rotações quantizadas parecem constantes:** não conclua que um clip é estático usando os números crus do accessor. Decodifique a normalização antes de comparar as chaves; uma auditoria com valores crus pode clonar falsamente todos os deslocamentos para zero.
- **Auditoria mostra muitas bordas abertas/componentes:** compare com o GLB cru e inspecione visualmente as peças. Não faça weld/delete em lote sem confirmar que são superfícies realmente duplicadas ou soltas.
- **Preview passa, mas o jogo ainda deforma:** confirme que o preview usa a sanitização de clips do runtime e amostre várias fases/ângulos; o gate estrutural não julga skinning.
- **Malha fica boa, mas muito pesada:** revise textura/triângulos e otimize uma cópia. Não reduza detalhe de rosto/silhueta sem comparação visual aprovada.
- **Correção comprovada do offset de root (Ana Qwen, 11/10/2026):** a Rest pose do GLB ficava em pé, mas o Walk/Idle exportado do FBX deitava a personagem. No Walk, o primeiro Hips translation era `[-0,139; -0,573; -106,427]` contra bind `[0; 8,587; 1,529]`, e o primeiro Hips rotation tinha residual de `1,554 rad`; o Idle tinha `1,636 rad`. Pinning no primeiro translation key manteve o corpo fora da bind pose. Rebase de Hips translation/rotation no helper restaurou Walk/Idle em pé. O candidato isolado passou QA do jogo: chegada 5,769 m no destino, passada alternada (stride relativo `0,743 m`), pés com mínimo Y de `0,090 m`, Idle Hips ≤ `0,0024 m`; nenhuma alteração foi publicada no modelo ativo/DNS. Estes valores são diagnóstico desta Ana, não limites universais.
- **Rest limpa, mas Walk cria uma placa na camiseta/axila (Ana Qwen, 11/10/2026):** renderize Rest e a mesma fase de Walk com câmera/escala iguais. Se a placa aparece só com o braço em movimento, faça um teste numa cópia amortecendo por slerp as rotações `Shoulder`, `Arm` e `ForeArm` em direção ao TRS de bind; deixe geometria, pesos, Hips e pernas intactos. `scripts/dampen_character_walk_upper_body.mjs <entrada.glb> <nova-saída.glb> <motionFactor>` aceita fator de movimento entre 0 e 1 (ex.: 0,2 deixa 20% da amplitude original) e não sobrescreve a fonte. Ele decodifica accessors normalizados, opera em clips LINEAR/STEP e recusa CUBICSPLINE. No caso observado, 0,4 reduziu a placa; 0,2 eliminou a placa severa preservando passada e balanço leve, com gate offline/runtime aprovados. Isso é uma mitigação específica, não correção universal de pesos. Revise Walk 0/25/50/75/100 de frente e lado; se a forma persistir em Rest/baixa amplitude, ou se o braço precisar ficar quase congelado, investigue peso/rig/geometria e reprove. Não afirme aprovação com base apenas no gate/runtime.
- **Dobra sob a axila localizada em Walk (Ana Qwen, 11/10/2026):** compare braço inteiro, ombro isolado e braço superior isolado em cópias; neste mesh, congelar `Shoulder` não removeu a prega, mas congelar `Arm` removeu a dobra forte. O mapa de pesos mostrou influência alta de `LeftArm` na lateral da camiseta. Uma redistribuição espacial suave de `LeftArm` para `Spine1` em ~4.153 vértices reduziu a dobra sem alterar POSITION, clips, Hips ou pernas; a candidata passou QA e foi enviada somente ao preview isolado. É um caso específico, não uma faixa-meta de pesos. Antes de repetir em outro personagem, confirme topologia/posição/nomes e mapa anatômico daquele GLB, use cópia com assinatura da fonte e revise visualmente Rest e Walk 0/25/50/75/100 frente/lado/costas; interrompa se aparecer costura, manga presa ao tronco ou assimetria nova.

## Restrições

- Não editar `public/models/ana_clasica.glb` ou `ana_coriza.glb` durante preparação de candidato.
- Não substituir o modelo ativo, fazer deploy, limpar arquivos de trabalho ou apagar artefatos sem autorização específica.
- Não instalar ferramentas globalmente nem expor cookies/sessões para resolver login.
- Se a integração Browser não estiver conectada, pausar upload/geração Tencent/Mixamo e pedir a conexão em **Settings → Computer use**; não substituir por perfil/cookies ou automação externa.
- Não declarar aprovado com base apenas em parse de GLB, gate ou screenshot único.
- Se faltar autenticação externa, um arquivo de origem ou compatibilidade entre rigs, concluir as validações offline e reportar exatamente o bloqueio restante.

## Checklist de entrega

- [ ] Silhueta e traços do design preservados.
- [ ] Pose de bind aprovada em A-pose confortável e `Idle` separado aprovado com braços/mãos relaxados junto às coxas, sem gesto involuntário.
- [ ] Pesos anatomicamente coerentes por membro/peça, incluindo antebraços, mãos e transições de ombro/quadril; nenhum osso essencial com influência ausente ou espacialmente deslocada.
- [ ] FBX/GLB candidato separado dos assets aprovados.
- [ ] Rig e clips compatíveis; Walk/Idle não constantes.
- [ ] `npm run qa:character-walk -- <arquivo>` passa ou cada falha tem diagnóstico explícito.
- [ ] QA isolado do jogo confirma entrada até o destino, passada alternada e Idle sem salto do Hips.
- [ ] QA com o runtime real: pose, eixo, escala, chão, crossfade e ciclo completos; multi-fase/multi-ângulo sem pontas nem clipping.
- [ ] Build/check pertinentes passam.
- [ ] Modelo ativo/produção permanecem intactos até aprovação explícita.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_J_PERSONAGEM_WEB_WALK.md`
- **Status:** Ativa
- **Complementa:** `SKILL_H_RIG_MIXAMO_AUTO.md`; esta skill contém o contrato web atual e critérios de parada.
- **Gate estrutural offline:** `scripts/gate_character_walk.mjs`
- **Preview Three.js + auditoria de animação:** `scripts/preview_character_glb.mjs`
- **Transplante glTF com validação da rest pose:** `scripts/transplant_character_clips.mjs`
- **Preparação final Web (pin, simplificação, WebP, Meshopt):** `scripts/prepare_animated_character_web.mjs`
- **QA de entrada/destino e passada no jogo:** `scripts/qa_character_walk.mjs`
- **Preparação FBX:** `scripts/prepare_character_fbx.py`
- **Auditoria topológica read-only:** `scripts/audit_character_mesh.py`
- **Auditoria topológica fonte GLB:** `scripts/audit_gltf_topology.mjs`
- **Compactação segura antes de sidecar por índice:** `scripts/compact_gltf_unused_vertices.mjs`
- **Auditoria de correspondência de pesos:** `scripts/audit_character_weight_map.py`
- **Diagnóstico controlado de transferência das rotações de braços/mãos (não substitui QA visual):** `scripts/transfer_gltf_upper_body_tracks.mjs`
- **Experimento isolado de amplitude dos braços/ombros/torso no Walk (gera outro arquivo; não substitui QA):** `scripts/dampen_character_walk_upper_body.mjs`
- **Preview interativo isolado de um GLB candidato (não publica nem substitui o modelo ativo):** `scripts/preview_candidate_server.mjs`
- **Re-pose local de bind em cópia diagnóstica (não usar como correção aprovada sem revisão visual):** `scripts/repose_gltf_bind_from_reference.mjs`
