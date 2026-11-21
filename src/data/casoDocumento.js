// Documento de referência do caso ativo — extraído de
// `Downloads/modelos_aserarrumado.docx` (Relatório Clínico e Parâmetros de
// Desenvolvimento — Caso Mariana), entregue pelo usuário em 24/10/2026.
//
// O usuário pediu que o LLM RECEBA este documento como base, para responder às
// perguntas do aluno "com exatidão". Ele entra no system prompt do ator (e no
// preceptor) apenas quando o caso ativo é este — os demais 13 casos continuam
// no catálogo, fora do fluxo jogável.
//
// Guardrails (não são clínica nova, só repartição de papéis):
// - Seção 1 (perfil/história) é vivida pela paciente e pode ser contada;
// - Seção 2 (conduta esperada) é DO FARMACÊUTICO: a paciente nunca a ensina,
//   nunca dá diagnóstico, nunca afirma resultado de exame (NS1) — o que só o
//   motor libera via Fact Gate continua valendo sobre o texto do documento.
// Nenhuma decisão clínica foi inventada aqui: tudo é transcrição do .docx.

export const CASO_DOCUMENTO = Object.freeze({
  caseId: 'carla_dengue',
  fonte: 'Downloads/modelos_aserarrumado.docx — "Relatório Clínico e Parâmetros de Desenvolvimento — Caso Mariana (FarmaCheck)"',
  sha256: '80f8516b5ce9ed80e95d9b3853af9c029a44676eb05b8edf925a585fd5249a7b',
  pt: [
    'RELATÓRIO CLÍNICO — CASO MARIANA (FarmaCheck)',
    '',
    '1. PERFIL E HISTÓRIA',
    'Nome: Geovana de Souza Troian (Mariana). 25 anos, sexo feminino, 62 kg.',
    'Ocupação: técnica de enfermagem em ambiente hospitalar, com atuação predominante em plantões noturnos.',
    'História: rotina exaustiva por causa dos plantões noturnos; prepara a própria alimentação em casa e leva marmitas para o trabalho; nega alterações recentes ou drásticas na dieta habitual e nega consumo de alimentos atípicos ou estragados.',
    'Início do quadro: há aproximadamente dois dias — febre aguda (cerca de 38 °C), cefaleia intensa, mialgia generalizada (forte incidência nos membros), náuseas e um episódio de diarreia.',
    'Automedicação: usou dipirona por conta própria para controlar febre e dores, obtendo alívio temporário. Após a dipirona, percebeu manchas avermelhadas (exantema), principalmente na região do pescoço, o que levanta hipótese de reação de hipersensibilidade (farmacodermia).',
    'Pedido no balcão: medicamento efervescente (Sonrisal) para aliviar as náuseas e o mal-estar gástrico.',
    '',
    '2. CONDUTA CLÍNICA ESPERADA NO BALCÃO (é a do farmacêutico, não a da paciente)',
    'NÃO dispensar o Sonrisal: contém Ácido Acetilsalicílico (AAS), estritamente contraindicado diante da suspeita de dengue ou outras arboviroses, pois interfere na agregação plaquetária e eleva drasticamente o risco de hemorragias.',
    'NÃO dispensar anti-inflamatórios não esteroidais (ibuprofeno, nimesulida, diclofenaco) nem corticoides, pelo mesmo motivo hemostático.',
    'NÃO ignorar os sintomas sistêmicos tratando apenas a queixa gástrica isolada.',
    'Anamnese estruturada: cronologia, histórico de uso de medicamentos, febre, mialgia, exantema e rastreio ativo de sinais de alarme (dor abdominal intensa, vômitos persistentes, sangramentos, hipotensão postural).',
    'Teste rápido de triagem (TLAC) para detecção do antígeno NS1 da Dengue.',
    'Paracetamol 750 mg via oral a cada 6 horas em caso de febre ou dor, respeitando a dose máxima diária, sob suspensão temporária da dipirona devido à suspeita de farmacodermia.',
    'Medidas não farmacológicas: reidratação oral intensiva de aproximadamente 60 mL/kg/dia (cerca de 3,6 L/dia), divididos em 1/3 de SRO e 2/3 de líquidos caseiros (água, água de coco e sucos), e repouso relativo.',
    'Encaminhamento formal à Unidade Básica de Saúde (UBS) ou serviço de pronto atendimento para avaliação médica complementar e exames laboratoriais (hemograma).',
    'Emissão da Declaração de Serviços Farmacêuticos (DSF) conforme RDC ANVISA nº 44/2009 e Resoluções CFF nº 585/2013 e nº 586/2013, registrando explicitamente os achados clínicos e a conduta.',
  ].join('\n'),
  en: [
    'CLINICAL REPORT — MARIANA CASE (FarmaCheck)',
    '',
    '1. PROFILE AND HISTORY',
    'Name: Geovana de Souza Troian (Mariana). 25 years old, female, 62 kg.',
    'Occupation: nursing technician in a hospital setting, mostly on night shifts.',
    'History: exhausting routine because of the night shifts; she cooks her own meals at home and takes packed lunches to work; denies any recent or drastic change in her usual diet and denies eating atypical or spoiled food.',
    'Onset: about two days ago — acute fever (around 38 °C), intense headache, widespread muscle pain (mainly in the limbs), nausea and one episode of diarrhea.',
    'Self-medication: she took dipirona on her own for the fever and pain, with only temporary relief. After the dipirona she noticed red spots (rash), mainly on the neck, raising the hypothesis of a hypersensitivity reaction (drug eruption).',
    'Counter request: an effervescent medicine (Sonrisal) to relieve the nausea and gastric discomfort.',
    '',
    '2. EXPECTED PHARMACY CONDUCT (this is the pharmacist’s, not the patient’s)',
    'DO NOT dispense Sonrisal: it contains acetylsalicylic acid (ASA), strictly contraindicated when dengue or other arboviruses are suspected, because it impairs platelet aggregation and sharply raises bleeding risk.',
    'DO NOT dispense NSAIDs (ibuprofen, nimesulide, diclofenac) or corticosteroids, for the same hemostatic reason.',
    'DO NOT ignore the systemic symptoms by treating only the gastric complaint.',
    'Structured anamnesis: timeline, medication history, fever, myalgia, rash and active screening for warning signs (severe abdominal pain, persistent vomiting, bleeding, postural hypotension).',
    'Rapid screening test (dipstick) for the Dengue NS1 antigen.',
    'Paracetamol 750 mg orally every 6 hours in case of fever or pain, respecting the maximum daily dose, while temporarily suspending dipirona because of the suspected drug eruption.',
    'Non-pharmacological measures: intensive oral rehydration of about 60 mL/kg/day (around 3.6 L/day), one third ORS and two thirds homemade fluids (water, coconut water, juices), plus relative rest.',
    'Formal referral to a primary care unit or emergency service for complementary medical assessment and laboratory tests (complete blood count).',
    'Issue the Pharmaceutical Services Declaration (DSF) under ANVISA RDC 44/2009 and CFF resolutions 585/2013 and 586/2013, explicitly recording the clinical findings and the conduct.',
  ].join('\n'),
});

/** Texto do documento para o caso/idioma informados (null fora do caso ativo). */
export function casoDocumento(caseId, lang = 'pt') {
  if (caseId !== CASO_DOCUMENTO.caseId) return null;
  return lang === 'en' ? CASO_DOCUMENTO.en : CASO_DOCUMENTO.pt;
}
