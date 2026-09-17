---
name: SKILL_G_PRINCIPIOS_MODELAGEM_3D
description: Princípio norteador para modelar QUALQUER objeto 3D — começar simples e funcional, mapear o "esqueleto" (eixos de articulação) antes da forma, pesquisar o domínio quando não souber como o objeto funciona, e derivar variações por parâmetros sobre uma base universal.
variants:
  - humanoide
  - veiculo
  - prop_articulado
  - dominio_desconhecido
setup: []
ports: {}
---

# Skill G — Princípios de Modelagem 3D (Anatomia antes da Forma)

> Diretriz do PO (11/09/2026). Aplica-se a TODA criação de objeto 3D e a TODA skill
> nova de modelagem. Antes de abrir o Blender ou chamar um gerador, passe por este
> checklist mental: **o que esse objeto FAZ? o que nele se MOVE?**

> **Direção de arte (14/09/2026):** o alvo é **3D estilizado casual mobile**
> (Pixar-like), não fotorrealista. As âncoras — `stylized 3D render, Pixar style,
> casual mobile game art, smooth PBR, clean textures, soft global illumination` —
> valem para todo asset. Ver `docs/DIRETRIZES_ARTE_ESTILIZADA.md`.

## Papel

Você é o **Anatomista de Objetos 3D**. Sua função é entender como o objeto funciona
no mundo real (função + articulações + regras de comportamento), modelar uma base
simples e funcional, validar visualmente, e só então derivar variações.
**Nunca comece pela aparência: comece pelo esqueleto.**

## Quando Usar

- Antes de modelar qualquer objeto novo (personagem, veículo, máquina, móvel articulado).
- Antes de escrever uma skill nova de modelagem (esta skill é o molde das skills D/A).
- Quando um objeto "parece errado" e não se sabe por quê → quase sempre é estrutura,
  não textura.

## Os 4 Princípios

### 1. Simples primeiro, funcional sempre
Comece com a versão mínima que **funciona** (move, encaixa, escala certa). Só depois
detalhe. Um bloco funcional vale mais que um modelo bonito quebrado.

> **Passo zero obrigatório (Blender):** toda cena nova do Blender nasce com
> **Cubo + Câmera + Luz** default. Antes de modelar, delete os 3 (ou reutilize
> câmera/luz no preview). Se esquecer, o cubo default vai junto no `.glb`
> exportado. Snippet: `bpy.data.objects.remove(o, do_unlink=True) for o in
> list(bpy.data.objects)`.

### 2. Todo objeto tem um "esqueleto" — mapeie os eixos ANTES de modelar
O que muda de posição/ângulo? Esses são os eixos (joints). O esqueleto de uma
**classe** de objetos é universal; o que varia entre indivíduos é só a **escala**.

- **Humano** (vale para TODO ser humano — só muda o tamanho):
  | Joint | Eixo principal | Movimento |
  |---|---|---|
  | Cabeça/pescoço | Y (yaw) + X (pitch) | olhar/assentir |
  | Ombro L/R | bola (X/Y/Z) | levantar/abrir braço |
  | Cotovelo L/R | X | dobrar antebraço |
  | Punho L/R | X/Y | flexão/rotação mão |
  | Coluna (tronco) | X (curvar) + Y (torcer) | postura curvado/ereto |
  | Quadril L/R | bola | passo/sentar |
  | Joelho L/R | X | dobrar perna |
  | Tornozelo L/R | X | ponta/calcanhar |

  → **1 rig humanoide base serve para TODOS os personagens**; varia-se apenas
  altura, proporções, roupa, cor. Nunca re-rigue um humano do zero.

- **Carro** (o "esqueleto" veicular): chassi rígido + 4 rodas. As 4 rodas **giram**
  (eixo de rolagem) e **só as 2 dianteiras esterçam** (yaw ESQ/DIR). O carro anda
  "de frente" — faróis e frente do chassi definem a direção de deslocamento.

- Qualquer máquina/móvel: identifique as partes móveis (porta=girar no eixo da
  dobradiça, gaveta=translação, etc.) e documente eixo + amplitude.

### 3. Não sabe como funciona? Pesquise o domínio ANTES de abrir o Blender
Se o objeto pertence a um domínio que você não domina (trânsito, anatomia,
mecânica, aviação...), busque na web **como funciona** — não só imagens de
referência. Exemplo (diretriz do PO): **trânsito** = carros param no vermelho,
esperam o verde, fluxo cruzado alternado, veículo desloca-se de frente (faróis
para a frente). Sem essa regra, o modelador criaria carros andando errado mesmo
com modelos perfeitos. Não precisamos disso neste jogo, mas o método vale para
qualquer objeto futuro.

### 4. Base universal + variações por parâmetro
Invista em **1 base correta** (rig + malha parametrizada por script Blender) e
derive variações por parâmetros (escala, proporção, cor, acessórios). Proibido
re-modelar do zero o que é só variação de tamanho/roupa.

### 5. Geráção por IA (imagem→3D): sempre vem de OTIMIZAÇÃO obrigatória
Aprendizado (vídeo Willian Designer — "Crie Assets 3D e Jogos com IA no Piloto
Automático", 11/09/2026): o fluxo **imagem → 3D** (Hunyuan3D, Pixal, etc.) gera
**malha PODRE** — o exemplo dele tinha **400k vértices / ~700k tris** num machado.
Regras:
- **Topologia gerada é SEMPRE poluída** (interior de carro inventado, malha caótica).
  Nunca use direto no jogo.
- **Otimizar é obrigatório:** `DecimateMesh`/`RemeshMesh` ou decimate do Blender até
  o budget (game engine só lê triângulo).
- **Anti-alucinação:** gere **1 vista primeiro** (frente); se inventar coisa (ex:
  gato de 6 patas), mande **imagens de outros ângulos** (perfil) — multi-view reduz
  alucinação.
- **Texturas ainda exigem retoque manual** (IA não resolve pele/tecido 100%).
- Assets simples (props, armas, móveis) = ótimo. Veículos com interior e humanos
  realistas ainda são limitados → precisam de retopo/manual. **No nosso alvo
  estilizado isso deixa de ser problema**: formas grandes e superfícies limpas são
  exatamente onde a IA entrega melhor.

### 6. Anatomia canônica: a IA precisa da "âncora" do objeto
Antes de gerar, DEFINA as **características canônicas** do objeto e dê pra IA
como âncora (pra ela "fitar" a forma e "scrapping" o que fugir). É o complemento
do esqueleto (§2): o esqueleto é a **hierarquia de eixos**, a anatomia canônica é
a **lista de invariantes** que não pode ser violada. Exemplos:
- **Humano:** 1 cabeça, 2 olhos, 1 nariz, 1 boca, 2 orelhas, 2 braços, 2 mãos com
  **5 dedos cada**, 2 pernas, 2 pés, 1 tronco, simetria bilateral. NUNCA 6 dedos
  nem 3 pernas.
- **Gato:** 4 patas (não 6), 2 orelhas, 1 cauda, 1 focinho.
- **Carro:** 4 rodas, 2 faróis dianteiros, sem interior (se não quiser).
- **Mesa/cadeira:** nº de pés fixo, tampo único.
Uso prático: (a) escrever essas invariantes no prompt/referência; (b) depois de
gerar, **auditar** o resultado contra a lista (é o "fit"): contar membros/dedos,
checar simetria. O desvio da âncora é o que denuncia alucinação e guia o retoque.

## Fluxo Padronizado

```
1. DEFINIR a função do objeto em 1 frase ("o que ele faz? o que se move?")
2. PESQUISAR o domínio se não souber como funciona (web, refs técnicas)
3. MAPEAR o esqueleto: tabela joint → eixo → amplitude (ver §2)
4. MODELAR a base SIMPLES e funcional (1 indivíduo, tamanho real)
5. VALIDAR: screenshot + juiz de visão antes de qualquer variação
6. DERIVAR variações por parâmetros (escala/proporção/cor) — nunca re-modelar
```

## Regras de Negócio

1. **Nunca modele o que você não entende** — pesquise primeiro.
2. **Um esqueleto por classe** (humanoide, veículo, porta) — reuse sempre.
3. **Bloco funcional > detalhe quebrado.** Simples e validado antes de evoluir.
4. Toda articulação precisa de **eixo + amplitude** definidos antes do rig.
5. Valide com screenshot + juiz **antes** de gerar variações.
6. Variações são por **parâmetro**, nunca re-modelagem.

## Checklist

- [ ] Função do objeto descrita em 1 frase
- [ ] Domínio pesquisado (se assunto novo) — regras de comportamento anotadas
- [ ] Esqueleto mapeado: tabela joint/eixo/amplitude
- [ ] **Anatomia canônica escrita** (IA): lista de invariantes (nº de membros/dedos/etc.)
- [ ] Base simples funcionando (screenshot + juiz OK)
- [ ] Se gerado por IA: auditado contra a anatomia canônica (fit) + otimizado (decimate)
- [ ] Variações derivadas por parâmetro (escala/roupa/cor)

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_G_PRINCIPIOS_MODELAGEM_3D.md`
- **Data de criação:** 2026-09-11
- **Status:** Ativa
- **Origem:** diretriz verbal do PO na sessão de 11/09/2026
- **Aplica a:** SKILL_A, SKILL_D e qualquer skill futura de modelagem/asset
