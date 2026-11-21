import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, localizeCase } from '../src/data/cases.js';
import { setLang, t } from '../src/ui/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'docs/pacote-revisao-clinica.json');
const mode = process.argv[2] || '--check';

if (!['--check', '--write'].includes(mode)) {
  throw new Error('Uso: node scripts/clinical_review_packet.mjs [--check|--write]');
}

// i18n.js only needs these browser globals when switching locale; no browser,
// network, storage, or application state is used to prepare the review packet.
globalThis.document ??= { documentElement: {}, dispatchEvent() {} };

const sourceFiles = [
  ['src/data/cases.js', 'Canonical Portuguese cases, facts, requested products and expected outcomes.'],
  ['src/data/cases.en.js', 'English overlays applied by localizeCase().'],
  ['src/core/factGate.js', 'Question classification and fact reveal rules.'],
  ['src/core/hiddenFactGuard.js', 'Protection against revealing hidden case facts.'],
  ['src/ai/patientReply.js', 'Patient response construction and deterministic fallback.'],
  ['src/core/scoring.js', 'Disposition, contraindication, rapid-test and DSF scoring.'],
  ['src/core/testeRapidoMessage.js', 'Rapid-test conversation/result contract.'],
  ['src/core/game.js', 'Application flow that records case actions and scoring inputs.'],
  ['src/ui/bulario.js', 'Visible package-insert panel.'],
  ['src/ui/tlac.js', 'Visible rapid-test flow.'],
  ['src/ui/dsf.js', 'Visible DSF form, quick entries and printable output.'],
  ['src/ui/i18n.js', 'Visible PT/EN clinical and educational interface strings.'],
];

const surfaceKeys = [
  'guide.steps',
  'refs.disclaimer', 'refs.biblio.heading', 'refs.biblio.dengue',
  'refs.biblio.dispepsia', 'refs.biblio.dermatite', 'refs.stamp',
  'bulario.pedido', 'bulario.prateleira', 'bulario.diretrizes',
  'bulario.contraindicado', 'bulario.teste', 'bulario.dir1', 'bulario.dir2', 'bulario.dir3',
  'tlac.title', 'tlac.naoIndicado', 'tlac.passo1', 'tlac.passo2', 'tlac.passo3',
  'tlac.passo4', 'tlac.passo5', 'tlac.executar', 'tlac.aguardando',
  'tlac.resultado', 'tlac.registrado',
  'dsf.title', 'dsf.rapidas', 'dsf.conduta', 'dsf.orientacoes', 'dsf.encaminhamento',
  'dsf.naoNecessario', 'dsf.er', 'dsf.doc.title', 'dsf.doc.sub', 'dsf.stamp',
  'dsf.rapida.recusa', 'dsf.rapida.mip', 'dsf.rapida.hidratacao', 'dsf.rapida.retorno',
  'debrief.reprovado', 'debrief.testePerdidoPre', 'debrief.testePerdidoPos', 'debrief.dsf',
];

async function sha256(relativePath) {
  const bytes = await readFile(path.join(root, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

function projectFact(fact) {
  return Object.fromEntries(Object.entries(fact).filter(([, value]) => typeof value !== 'function'));
}

function projectCase(caseDef, locale) {
  const shelfById = new Map(caseDef.prateleira.map((item) => [item.id, item.nome]));
  const missingExpectedItems = caseDef.condutaGabarito.mips.filter((itemId) => !shelfById.has(itemId));
  assert.deepEqual(missingExpectedItems, [], `${caseDef.id}/${locale}: gabarito usa item ausente da prateleira`);

  return {
    id: caseDef.id,
    version: caseDef.version,
    temRedFlag: caseDef.temRedFlag,
    title: caseDef.titulo,
    persona: {
      name: caseDef.persona.nome,
      age: caseDef.persona.idade,
      summary: caseDef.persona.resumo,
      openingStyle: caseDef.persona.falaForaDominio,
      repeatedSpeech: caseDef.persona.falaRepetida,
    },
    customerRequest: caseDef.pedido,
    opening: caseDef.abertura,
    facts: caseDef.fatos.map(projectFact),
    checklistDomains: [...caseDef.checklistDominios],
    redFlagDomains: [...caseDef.redFlagDominios],
    expectedDispositionFromCode: {
      type: caseDef.condutaGabarito.tipo,
      medicationIds: [...caseDef.condutaGabarito.mips],
      medicationNames: caseDef.condutaGabarito.mips.map((itemId) => shelfById.get(itemId)),
      nonDrugGuidanceCanonicalPt: [...caseDef.condutaGabarito.naoFarm],
    },
    shelf: caseDef.prateleira.map((item) => ({ ...item })),
    guidance: [...caseDef.orientacoes],
    criticalErrors: caseDef.errosCriticos.map(({ id, msg }) => ({ id, message: msg })),
    outcomes: Object.fromEntries(Object.entries(caseDef.consequencias).map(([key, value]) => [key, { ...value }])),
    quickQuestions: caseDef.chips.map((chip) => ({ ...chip })),
    contraindicated: caseDef.contraindicado ? { ...caseDef.contraindicado } : null,
    rapidTest: caseDef.testeRapido ? { ...caseDef.testeRapido } : null,
    dsf: caseDef.dsf ? { ...caseDef.dsf } : null,
  };
}

function projectProductReview(ptCase, enCase) {
  const englishShelfById = new Map(enCase.shelf.map((item) => [item.id, item.nome]));
  return ptCase.shelf.map((item) => {
    assert(englishShelfById.has(item.id), `${ptCase.id}: item ${item.id} sem rótulo EN`);
    return {
      itemId: item.id,
      labelPt: item.nome,
      labelEn: englishShelfById.get(item.id),
      exactIdentity: {
        productName: null,
        manufacturer: null,
        anvisaRegistrationNumber: null,
        activeIngredients: null,
        strengthAndDosageForm: null,
        officialLeafletUrl: null,
      },
      decision: null,
      rationale: null,
    };
  });
}

function projectSurfaceStrings(locale) {
  setLang(locale);
  return Object.fromEntries(surfaceKeys.map((key) => [key, t(key)]));
}

const sourceIntegrity = await Promise.all(sourceFiles.map(async ([file, scope]) => ({
  file,
  scope,
  sha256: await sha256(file),
})));

const cases = CASES.map((base) => {
  const english = localizeCase(base, 'en');
  const pt = projectCase(base, 'pt');
  const en = projectCase(english, 'en');
  assert.deepEqual(en.facts.map((fact) => fact.tag), pt.facts.map((fact) => fact.tag), `${base.id}: PT/EN fact parity`);
  assert.equal(en.expectedDispositionFromCode.type, pt.expectedDispositionFromCode.type, `${base.id}: PT/EN disposition type parity`);
  assert.deepEqual(en.expectedDispositionFromCode.medicationIds, pt.expectedDispositionFromCode.medicationIds, `${base.id}: PT/EN disposition medication parity`);
  return {
    id: base.id,
    sourceVersion: base.version,
    pt,
    en,
    review: {
      status: 'pending_professional_review',
      reviewerName: null,
      professionalRegistration: null,
      reviewedOn: null,
      decision: null,
      notes: null,
      productChecklist: projectProductReview(pt, en),
    },
  };
});

assert.equal(new Set(cases.map((item) => item.id)).size, CASES.length, 'IDs de caso duplicados');
assert.equal(cases.length, 14, 'O pacote deve cobrir os 14 casos do escopo FC-006');

const editorialDoc = await readFile(path.join(root, 'docs/VALIDACAO_CLINICA.md'), 'utf8');
const editorialCaseIds = [...editorialDoc.matchAll(/^### \d+\. ([a-z0-9_]+) -/gm)].map((match) => match[1]);
assert.deepEqual(editorialCaseIds, CASES.map((caseDef) => caseDef.id), 'Inventário editorial deve conter os 14 IDs na ordem do código');
assert.match(editorialDoc, /\]\(pacote-revisao-clinica\.json\)/, 'Inventário deve apontar para o snapshot reproduzível');
assert.match(editorialDoc, /revisor\(a\) a identificar/, 'Inventário não deve atribuir aceite a uma pessoa não confirmada');
assert.doesNotMatch(editorialDoc, /Checklist de Assinatura \(PO Jhuly|CRM \| Data/, 'Inventário não deve presumir PO como profissional nem usar o campo CRM');

const packet = {
  schema: 'farmacheck-clinical-review-packet/v2',
  purpose: 'Snapshot técnico do conteúdo e comportamento apresentados pelo FarmaCheck para revisão profissional.',
  status: 'pending_professional_review',
  notice: {
    pt: 'Este pacote reproduz dados do código. Gabaritos, medicamentos, doses, testes, mensagens e desfechos não foram validados clinicamente por este processo.',
    en: 'This packet reproduces code data. Answer keys, medicines, doses, tests, messages, and outcomes have not been clinically validated by this process.',
  },
  scope: {
    caseCount: cases.length,
    locales: ['pt', 'en'],
    note: 'Os campos expectedDispositionFromCode e rapidTest são estado atual da implementação, não recomendação clínica aprovada.',
    reviewTemplate: 'Por caso e superfície: aprovado, corrigir ou não aplicável; registrar motivo, nome/registro profissional e data antes de alterar o gabarito publicado. Para cada item de prateleira, identificar produto, fabricante, registro Anvisa, princípios ativos, concentração/apresentação e bula oficial; decidir e justificar. Campos vazios são pendências, não validação.',
  },
  sourceIntegrity,
  visibleClinicalStrings: {
    pt: projectSurfaceStrings('pt'),
    en: projectSurfaceStrings('en'),
  },
  cases,
};

const serialized = `${JSON.stringify(packet, null, 2)}\n`;

if (mode === '--write') {
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`✔ pacote clínico atualizado: ${path.relative(root, outputPath)} (${cases.length} casos × 2 idiomas)`);
} else {
  const current = await readFile(outputPath, 'utf8');
  assert.equal(current, serialized, 'Pacote clínico desatualizado; execute npm run update:clinical-review-packet e revise o delta.');
  console.log(`✔ pacote clínico sincronizado: ${cases.length} casos × 2 idiomas, ${sourceIntegrity.length} fontes SHA-256, superfícies PT/EN`);
}
