# Validação Clínica - Game Farma
## Casos Validados (14 casos reais de src/data/cases.js)

### 1. nelson_infarto - Infarto do miocárdio
- **Paciente:** Seu Nelson, 58 anos
- **Queixa principal:** Queimação no peito desde cedo, piora ao esforço, irradiação para braço esquerdo
- **Achados/sinais de alerta:** Caráter opressivo, irradiação braço/queixo, sudorese fria, dispneia ao esforço, náusea leve, HAS mal controlada, tabagismo há 40 anos, episódios prévios de azia autotratada
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** AAS 500 mg efervescente (prateleira[0])
- **Contraindicações:** História de úlcera péptica (tag ulcera_prev, relutante, redFlag no código)
- **Linguagem (chips usados):** Há quanto tempo? Onde dói? Como é a dor? Irradia? Piora com comida? Outros sintomas? Remédios? Já teve antes?
- **Observações clínicas:** Pacote com histórico de tabagismo intenso, HAS mal controlada, queixa de azia há 40 anos; decisão de encaminhamento depende de investigação de caráter/irradiação/sintomas associados; código possui redFlag em caracter, irradiacao, associados, fatores.

### 2. marina_amoxicilina - Faringite viral
- **Paciente:** Marina, 29 anos
- **Queixa principal:** Garganta inflamada há 2 dias, coriza, tosse seca
- **Achados/sinais de alerta:** Odinofagia, início há 2 dias, queimação leve/moderada, febre negada, coriza e tosse seca, sem placas/pus, sem disfagia, sem adenomegalia
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: dipirona)
- **Medicação/dose:** Amoxicilina 500 mg (prateleira[0] — exige receita)
- **Contraindicações:** Venda de antimicrobiano sem receita (erro crítico: vender_sem_receita)
- **Linguagem (chips usados):** Há quanto tempo? Febre? Como é a dor? Outros sintomas? Engolir? Remédios? Alergia?
- **Observações clínicas:** Quadro clássico de faringite viral sem sinais de alarme; código não indica antimicrobiano; decisão baseada na ausência de placas/pus, dispagia, adenomegalia e febre; MIP dipirona para conforto.

### 3. jose_gripe - Resfriado viral
- **Paciente:** Seu José, 44 anos
- **Queixa principal:** Dor no corpo, nariz escorrendo, tosse, solicita injeção de antibiótico
- **Achados/sinais de alerta:** Mialgia generalizada, início há ~3 dias, febre baixa <38°C, coriza e espirros, tosse seca, sem dispneia, sem secreção purulenta
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: paracetamol)
- **Medicação/dose:** Paracetamol 750 mg (prateleira[1])
- **Contraindicações:** Venda/administração de antimicrobiano para quadro viral clássico (erro crítico: vender_ab)
- **Linguagem (chips usados):** Há quanto tempo? Febre? Tosse? Outros sintomas? Remédios? Alergia?
- **Observações clínicas:** Quadro clássico de resfriado viral; código alerta contra antibiótico; decisão baseada na associação coriza/espirros/tosse sem secreção purulenta nem dispneia; MIP paracetamol para sintomático.

### 4. ana_coriza - Rinite alérgica
- **Paciente:** Ana, 21 anos
- **Queixa principal:** Nariz entupido há 2 dias, coceira, espirros
- **Achados/sinais de alerta:** Congestão nasal bilateral, início há 2 dias, secreção clara e fluida, febre negada, espirros e coceira no nariz, sem dor facial, sem secreção purulenta, histórico de rinite alérgica, alergia à poeira
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: loratadina)
- **Medicação/dose:** Loratadina 10 mg (prateleira[1])
- **Contraindicações:** Descongestionante tópico sem orientar uso curto (máx. 3 dias) (erro crítico: vender_descong)
- **Linguagem (chips usados):** Há quanto tempo? Febre? O que escorre? Coceira? Já teve antes? Remédios? Alergia?
- **Observações clínicas:** Rinite alérgica conhecida; código indica loratadina + lavagem nasal; decisão baseada em secreção clara/fluida, coceira, histórico de rinite, negação de febre/dor facial/pus; alerta sobre limite de 3 dias do descongestionante tópico.

### 5. clara_cefaleia - Cefaleia tensional
- **Paciente:** Clara, 33 anos
- **Queixa principal:** Dor de cabeça desde o meio da tarde, caráter de aperto bilateral frontal
- **Achados/sinais de alerta:** Dor frontal em aperto, início no meio da tarde, intensidade ~5/10, sem náusea/vômito, sem fotofobia/fonofobia, sem aura, sem rigidez de nuca, febre negada, piora em dias de estresse, episódio recorrente
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: paracetamol)
- **Medicação/dose:** Dipirona injetável (prateleira[0] — código alerta: via parenteral não é atribuição do balcão)
- **Contraindicações:** Dispensar dipirona injetável no balcão (via parenteral exige avaliação)
- **Linguagem (chips usados):** Há quanto tempo? Onde dói? Como é a dor? De 0 a 10? Outros sintomas? Pescoço rígido? Febre? Remédios?
- **Observações clínicas:** Cefaleia tensional sem sinais de alarme; código alerta contra via parenteral no balcão; decisão baseada na ausência de náusea/vômito, fotofobia/fonofobia, aura, rigidez de nuca; MIP paracetamol com orientação de pausa do estresse e compressa fria.

### 6. paulo_dor_lombar - Lombar mecânica
- **Paciente:** Paulo, 47 anos
- **Queixa principal:** Dor nas costas após levantar peso na obra, solicita relaxante muscular injetável
- **Achados/sinais de alerta:** Dor lombar baixa, início ontem após esforço, tipo contratura, sem irradiação para perna, sem formigamento/dormência, força preservada nas pernas, febre negada, sem trauma direto, sem perda de urina/fezes
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: diclofenaco)
- **Medicação/dose:** Diclofenaco sódico 50 mg (prateleira[1])
- **Contraindicações:** Dispensar relaxante muscular injetável no balcão (via parenteral exige avaliação)
- **Linguagem (chips usados):** Onde dói? Há quanto tempo? Irradia? Formigamento? Força? Banheiro? Febre? Remédios?
- **Observações clínicas:** Lombar mecânica sem bandeiras vermelhas; código alerta contra relaxante injetável no balcão; decisão baseada na ausência de irradiação, formigamento, perda de força/urina; MIP diclofenaco oral + orientação de repouso relativo e compressa quente.

### 7. joao_queimacao - Gastrite/úlcera
- **Paciente:** João, 39 anos
- **Queixa principal:** Queimação no estômago desde ontem à noite, piora com comida gordurosa
- **Achados/sinais de alerta:** Queimação epigástrica, início ontem à noite, piora com comida gordurosa, episódios prévios de dispepsia, história prévia de úlcera péptica (relutante, redFlag), sem melena/fezes escuras (relutante, redFlag), sem vômitos com sangue (relutante, redFlag), febre negada, usa antiácido eventual
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: omeprazol)
- **Medicação/dose:** AAS 500 mg efervescente (prateleira[0] — contraindicado no caso: história de úlcera)
- **Contraindicações:** AAS contraindicado em história de úlcera péptica (risco de sangramento digestivo, erro crítico: vender_aas)
- **Linguagem (chips usados):** Há quanto tempo? Onde queima? Piora com comida? Já teve antes? Úlcera? Sangramento? Remédios?
- **Observações clínicas:** História de úlcera péptica relutante; AAS contraindicado é o erro crítico do caso; decisão baseia na pergunta sobre úlcera/sangramento antes de liberar AAS; MIP omeprazol + orientação de fracionar refeições e evitar gordura/álcool à noite.

### 8. helena_avc - Suspeita de AVC
- **Paciente:** Dona Helena, 68 anos
- **Queixa principal:** Tontura desde cedo, fala embolada, filha preocupada
- **Achados/sinais de alerta:** Tontura início ~6h atrás, disartria (fala arrastada), assimetria facial, fraqueza de um lado do corpo, início súbito dos sintomas, HAS em uso, anti-hipertensivo em uso, febre negada
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** Ginkgo biloba / "circulação" (prateleira[0] — código alerta: inócuo e perigoso no caso)
- **Contraindicações:** Vender "remédio para circulação" diante de quadro sugestivo de AVC (erro crítico: vender_pedido)
- **Linguagem (chips usados):** O que sente? Há quanto tempo? Fala? Rosto? Braços? Pressão? Remédios?
- **Observações clínicas:** AVC suspeito com tríade disartria+assimetria facial+fraqueza unilateral de início súbito; código alerta que venda de "remédio para circulação" é erro crítico; decisão baseada na observação da boca torta, fala embolada, fraqueza de um lado; encaminhamento SAMU com registro de horário de início é conduta gabarito.

### 9. dona_rosa_hipotensao - Hipotensão idosa
- **Paciente:** Dona Rosa, 72 anos
- **Queixa principal:** Tontura ao levantar, quase desmaiou, solicita tônico para dar força
- **Achados/sinais de alerta:** Tontura ao levantar, início de manhã, episódio de síncope/queda, sensação de pulso fraco/lento, mudou anti-hipertensivo há 2 dias (redFlag), anti-hipertensivo em uso, diabética em uso de metformina, febre negada, sem dor no peito
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** Tônico/complexo vitamínico (prateleira[0])
- **Contraindicações:** Vender tônico a idosa com síncope recente e possível hipotensão por mudança de anti-hipertensivo (erro crítico: vender_pedido)
- **Linguagem (chips usados):** O que sente? Há quanto tempo? Desmaiou? Coração? Remédios? Pressão? Febre?
- **Observações clínicas:** Idosa com síncope recente após mudança de anti-hipertensivo; código alerta que queda em idoso é evento-sentinela; decisão baseia na associação tontura ao levantar + mudança de medicação + pulso fraco; não vender tônico sem avaliação da pressão e da cartela de remédios.

### 10. carlos_asma - Crise asmática
- **Paciente:** Carlos, 30 anos
- **Queixa principal:** Falta de ar desde a madrugada, peito chiando, solicita xarope expectorante
- **Achados/sinais de alerta:** Sibilância (peito chiando), início na madrugada, dispneia que impede falar frases completas (relutante, redFlag), tosse seca contínua, febre negada, asma conhecida sem manutenção, usa broncodilatador de resgate (bombinha) que não aliviou, crises prévias com PS
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** Xarope expectorante (prateleira[0] — código alerta: ineficaz na crise asmática)
- **Contraindicações:** Vender xarope expectorante para crise asmática com dispneia de repouso e sibilância que não responde à bombinha (erro crítico: vender_pedido)
- **Linguagem (chips usados):** O que sente? Há quanto tempo? Respirar? Chiado? Lábios? Asma? Remédios?
- **Observações clínicas:** Crise asmática moderada a grave com dispneia de repouso e bombinha que não alivia; código alerta que expectorante é ineficaz via aérea; decisão baseada em fala entrecortada, chiado persistente, bombinha sem efeito; encaminhamento SAMU com paciente sentado, oxigênio e broncodilatador nebulizado são conduta gabarito.

### 11. bia_apendicite - Apendicite aguda
- **Paciente:** Bia, 22 anos
- **Queixa principal:** Dor abdominal começou periumbilical, migrou para fossa ilíaca direita, náusea/vômito, anorexia, febre 37,8°C
- **Achados/sinais de alerta:** Dor iniciou periumbilical, migração para fossa ilíaca direita, anorexia (relutante, redFlag), náusea com 1 episódio de vômito (relutante, redFlag), febre 37,8°C (relutante, redFlag), constipação leve, dor piora ao andar e rir
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** Analgésico (prateleira[0] — código alerta: pode mascarar evolução)
- **Contraindicações:** Vender analgésico e antiemético para dor abdominal migratória com febre e anorexia (erro crítico: vender_pedido)
- **Linguagem (chips usados):** Onde começou? Onde dói agora? Fome? Enjoo? Febre? O que melhora? Banheiro? Remédios?
- **Observações clínicas:** Padrão clássico de apendicite: dor periumbilical que migra para fossa ilíaca direita + anorexia + náusea/vômito + febre; código alerta que analgésico mascara evolução; decisão baseia na tríade dor migratória + anorexia + febre; NÃO vender analgésico/antiemético; orientar jejum e encaminhamento imediato.

### 12. carla_dengue - Dengue suspeita
- **Paciente:** Carla, 24 anos
- **Queixa principal:** Dor no corpo e dor de cabeça
- **Achados/sinais de alerta:** Dor no corpo e dor de cabeça, início hoje, dor atrás dos olhos, corpo "moído" (mialgia intensa), febre alta de início súbito (39°C), trabalha em hospital, primeiro episódio, sem medicação hoje, alergias negativas, sem sangramento
- **Conduta esperada:** encaminhar (gabarito: tipo encaminhar)
- **Medicação/dose:** Sonrisal (AAS 500 mg efervescente) (prateleira[0])
- **Contraindicações:** AAS (Sonrisal) é contraindicado em suspeita de dengue — risco de sangramento e quadro hemorrágico
- **Linguagem (chips usados):** O que sente? Há quanto tempo? Como é a dor? Febre? Sangramento? Trabalho? Remédios? Alergia?
- **Observações clínicas:** Suspeita de dengue com febre alta súbita + mialgia + dor retroocular; código possui testeRapido (Dengue NS1/IgM) e campo contraindicado: AAS é contraindicado; decisão baseia na associação febre alta + corpo moído + dor atrás dos olhos; NÃO vender AAS; orientar hidratação, vigilância de sinais de alarme e teste rápido; DSF de encaminhamento urgente ao PS.

### 13. roberto_dispepsia - Dispepsia pós-exagero alimentar
- **Paciente:** Roberto, 30 anos
- **Queixa principal:** Queimação no estômago desde o almoço de ontem
- **Achados/sinais de alerta:** Queimação no estômago (epigástrio), início desde o almoço de ontem, relaciona com exagero alimentar (evento social), já melhorou com antiácido em episódios passados, sem fezes escuras, sem perda de peso, sem dor irradiada a braço/queixo, sem vômito/sangue, sem medicação em uso, alergias negadas
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: antiacido)
- **Medicação/dose:** Antiácido/"estomacal" forte
- **Contraindicações:** vender_sem_investigar - necessidade de confirmar ausência de sinais de alarme antes de dispensar
- **Linguagem (chips usados):** Onde dói? Há quanto tempo? O que piora? Irradia? Fezes escuras? Peso? Remédios? Alergia?
- **Observações clínicas:** Dispepsia pós-exagero alimentar sem sinais de alarme; código indica MIP antiácido + DSF com orientações alimentares; decisão baseia na ausência de fezes escuras, perda de peso, dor irradiada; DSF orienta retorno se piorar, vomitar sangue ou fezes escuras; orientação sobre refeições menores e evitar gordura/álcool.

### 14. catia_dermatite - Dermatite de contato
- **Paciente:** Cátia, 45 anos
- **Queixa principal:** Coceira e vermelhidão nos braços
- **Achados/sinais de alerta:** Coceira e vermelhidão nos braços, início há ~3 dias, exposição a produtos de limpeza novos, placas secas/áridas, sem bolhas nem pus, sem falta de ar, sem inchaço em lábios/rosto, sem febre, primeiro episódio, sem medicação em uso, alergias conhecidas: nega
- **Conduta esperada:** manejo (gabarito: tipo manejo, mips: emoliente)
- **Medicação/dose:** Pomada para "alergia"
- **Contraindicações:** Nenhum (contraindicado: null)
- **Linguagem (chips usados):** Onde coça? Há quanto tempo? Como é a pele? Produtos? Respirar? Febre? Remédios? Alergia?
- **Observações clínicas:** Dermatite de contato leve e autolimitada causada por produtos novos de limpeza sem luvas; código indica emoliente tópico + DSF com orientação de luvas; decisão baseia em coceira/vermelhidão, exposição a produtos novos, ausência de bolhas/pus/falta de ar/inchaço/febre; orientação sobre proteção com luvas, água morna e sabonete suave; DSF orienta retorno se piorar, surgir falta de ar ou inchaço.

## Pontos de atenção por caso

### Nelson (infarto)
- Verificar caráter opressivo e irradiação para braço/queixo (pergunta chips: "Irradia?")
- Verificar sudorese fria e dispneia ao esforço
- Confirmar HAS mal controlada e tabagismo há 40 anos
- Questionar episódios prévios de azia autotratada

### Marina (faringite viral)
- Confirmar ausência de placas/pus e disfagia (pergunta chips: "Engolir?")
- Descartar adenomegalia
- Verificar febre negada e duração ≤ 2 dias
- Orientar MIP dipirona + líquidos mornos e repouso vocal

### José (gripe)
- Confirmar ausência de secreção purulenta e dispneia (pergunta chips: "Tosse? Falta de ar?")
- Descartar antibiótico; gripe é viral
- Orientar MIP paracetamol + hidratação + repouso

### Ana (rinite alérgica)
- Confirmar histórico de rinite e alergia à poeira (pergunta chips: "Já teve antes? Alergia?")
- Verificar secreção clara e fluida, coceira, negação de febre/dor facial/pus
- Alertar sobre limite de 3 dias do descongestionante tópico
- Orientar lavagem nasal com soro e cabeceira elevada

### Clara (cefaleia tensional)
- Confirmar ausência de náusea/vômito, fotofobia/fonofobia, aura, rigidez de nuca (pergunta chips: "Pescoço rígido? Febre?")
- Verificar intensidade ~5/10, caráter de aperto bilateral, piora em dias de estresse
- Orientar MIP paracetamol + pausa do estresse + compressa fria

### Paulo (lombar mecânica)
- Confirmar ausência de irradiação para perna, formigamento, perda de força/urina (pergunta chips: "Irradia? Formigamento? Força? Banheiro?")
- Verificar febre negada, trauma direto não relatado
- Orientar MIP diclofenaco oral + repouso relativo + compressa quente

### João (gastrite/úlcera)
- Perguntar sobre história de úlcera antes de liberar AAS (pergunta chips: "Úlcera? Sangramento?")
- Verificar melena/fezes escuras e vômitos com sangue (relutante no código)
- Orientar MIP omeprazol + fracionar refeições + evitar gordura/álcool à noite

### Helena (AVC suspeito)
- Observar tríade: disartria + assimetria facial + fraqueza unilateral (pergunta chips: "Fala? Rosto? Braços?")
- Registrar horário de início dos sintomas (janela de trombólise)
- NÃO vender "remédio para circulação"; encaminhar SAMU imediatamente

### Dona Rosa (hipotensão idosa)
- Associar tontura ao levantar + mudança de anti-hipertensivo + pulso fraco (pergunta chips: "Desmaiou? Coração? Pressão?")
- NÃO vender tônico sem avaliação da pressão e da cartela de remédios
- Encaminhar para medir PA e avaliar síncope

### Carlos (crise asmática)
- Verificar dispneia de repouso e bombinha que não alivia (pergunta chips: "Respirar? Chiado? Lábios? Asma?")
- Confirmar fala entrecortada, chiado persistente
- NÃO vender xarope expectorante; encaminhar SAMU com paciente sentado

### Bia (apendicite)
- Confirmar tríade: dor periumbilical que migra + anorexia + náusea/vômito + febre (pergunta chips: "Onde começou? Onde dói agora? Fome? Enjoo? Febre?")
- NÃO vender analgésico/antiemético (mascara evolução)
- Orientar jejum e encaminhamento imediato

### Carla (dengue)
- Associar febre alta súbita + mialgia + dor retroocular (pergunta chips: "Como é a dor? Febre? Sangramento? Trabalho? Remédios? Alergia?")
- Solicitar teste rápido Dengue NS1/IgM antes de recusar AAS
- NÃO vender AAS (risco de sangramento); orientar hidratação + vigilância de sinais de alarme + DSF encaminhamento urgente

### Roberto (dispepsia)
- Confirmar ausência de sinais de alarme: fezes escuras, perda de peso, dor irradiada (pergunta chips: "Fezes escuras? Peso? Irradia?")
- dispensar MIP antiácido + orientações alimentares (refeições menores, evitar gordura/álcool, não deitar após comer)
- DSF orienta retorno se piorar, vomitar sangue ou fezes escuras

### Cátia (dermatite de contato)
- Confirmar exposição a produtos novos de limpeza sem luvas (pergunta chips: "Produtos? Respirar? Febre? Alergia?")
- Dispensar emoliente tópico + orientar proteção com luvas, água morna e sabonete suave
- DSF orienta retorno se piorar, surgir bolhas, falta de ar ou inchaço no rosto

## Checklist de Assinatura (PO Jhuly - Farmacêutico Validador)

| Caso | Conduta | Assinatura Farmacêutico | CRM | Data |
|------|---------|-------------------------|-----|------|
| nelson_infarto | encaminhar | _______________ | _______________ | ____/____/____ |
| marina_amoxicilina | manejo | _______________ | _______________ | ____/____/____ |
| jose_gripe | manejo | _______________ | _______________ | ____/____/____ |
| ana_coriza | manejo | _______________ | _______________ | ____/____/____ |
| clara_cefaleia | manejo | _______________ | _______________ | ____/____/____ |
| paulo_dor_lombar | manejo | _______________ | _______________ | ____/____/____ |
| joao_queimacao | manejo | _______________ | _______________ | ____/____/____ |
| helena_avc | encaminhar | _______________ | _______________ | ____/____/____ |
| dona_rosa_hipotensao | encaminhar | _______________ | _______________ | ____/____/____ |
| carlos_asma | encaminhar | _______________ | _______________ | ____/____/____ |
| bia_apendicite | encaminhar | _______________ | _______________ | ____/____/____ |
| carla_dengue | encaminhar | _______________ | _______________ | ____/____/____ |
| roberto_dispepsia | manejo | _______________ | _______________ | ____/____/____ |
| catia_dermatite | manejo | _______________ | _______________ | ____/____/____ |

---

## Lacunas ("não definido no jogo")

Os seguintes campos não são definidos automaticamente no código e requerem julgamento clínico do farmacêutico:

1. **Avaliação de gravidade em tempo real** — O código verifica fatos revelados, mas a decisão de urgência vs. não-urgência depende de contexto não modelado (ex.: estado nutricional, acesso a transporte, acompanhamento familiar).

2. **Interação medicamentosa completa** — As contraindicações listadas são específicas por caso (`contraindicado.item`), mas a checagem de interações entre múltiplos fármacos em uso simultâneo não está no modelo.

3. **Fatores sociais e de adesão** — Histórico de tabagismo, adesão ao tratamento, condições de vida (ex.: "sozinho em casa" no caso Nelson) influenciam conduta mas não são dados estruturados no jogo.

4. **Idade e peso para posologia** — As doses fixas no código (AAS 500mg, Paracetamol 750mg, etc.) são ilustrativas; cálculo posológico baseado em peso/idade não está integrado.

5. **Alergias cruzadas e intolerâncias** — O campo `alergias` captura apenas nega/positivo simples; reações específicas (ex.: excipientes, corantes) não são modeladas.

6. **Gestante e lactante** — Nenhum dos 14 casos considera gravidez ou amamentação; ajustes de conduta nesses casos não estão no código.

7. **Saúde bucal e capacidade de deglutição** — Para casos que envolvem spray/soluções orais, a capacidade do paciente de usar corretamente não é avaliada pelo sistema.

8. **Resistência antimicrobiana local** — Diretrizes de uso de antibióticos consideram padrões locais de resistência, que o código não consulta.

9. **Disponibilidade de testes rápidos** — A ordem de teste rápido (ex.: dengue, COVID, estreptococo) depende de disponibilidade de kits e protocolos locais, não modelada no jogo.

10. **Follow-up e reavaliação** — O código não rastreia se o paciente retornou ou evoluiu após a conduta inicial; lacuna importante para segurança do paciente.

14. **Consentimento informado e educação em saúde** — A qualidade da explicação ao paciente (chips/comunicação) é avaliada heurísticamente no scoring, mas não há métrica estruturada de "paciente compreendeu" no modelo.

---

**Documento gerado a partir de src/data/cases.js, src/core/scoring.js e src/core/factGate.js — zero dado inventado.**