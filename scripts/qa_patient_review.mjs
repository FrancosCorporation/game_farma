import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4187/';
const output = process.argv[3] || '/tmp/farma-patient-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  ...(process.env.QA_SOFTWARE === '1'
    ? { args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const results = [];
const errors = [];

function watchErrors(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function waitForModel(page, model) {
  await page.waitForFunction(() => window.__patientReviewPreview?.__model, null, { timeout: 90000 });
  assert.match(await page.locator('#viewer #hud').innerText(), new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

async function selectAndCheckWalk(page, patient) {
  await page.selectOption('#patient', patient.id);
  await waitForModel(page, patient.model);
  assert.equal(await page.locator('#animations').isVisible(), true, `${patient.id}: controles de animação`);
  await page.click('[data-animation="Walk"]');
  await page.waitForFunction(() => /walk/i.test(window.__patientReviewPreview?.__anim || ''), null, { timeout: 90000 });
  await page.waitForFunction(() => window.__patientReviewPreview?.__groundFixData, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__patientReviewPreview.__groundFixData.status), 'pass', `${patient.id}: contato com o chão`);
  await page.click('[data-animation="Idle"]');
  await page.waitForFunction(() => /idle/i.test(window.__patientReviewPreview?.__anim || ''), null, { timeout: 90000 });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watchErrors(page);
  const registryResponse = await page.request.get(new URL('patient-review.json', base).href);
  assert.equal(registryResponse.status(), 200);
  const registry = await registryResponse.json();
  assert.equal(registry.patients.length, 14);
  assert.equal(registry.patients.filter((patient) => patient.model).length, 14);

  await page.goto(new URL('patient-review.html?patient=ana_coriza', base).href);
  await page.waitForFunction(() => !document.getElementById('patient').disabled);
  assert.equal(await page.locator('#patient option').count(), 14);
  assert.equal(await page.locator('#patient').inputValue(), 'ana_coriza');
  assert.match(await page.locator('#status').innerText(), /3D · no jogo/);
  assert.match(await page.locator('#count').innerText(), /14 pacientes disponíveis.*14 modelos 3D carregáveis.*3 publicados no jogo.*11 aguardam aprovação/);

  const marina = registry.patients.find((patient) => patient.id === 'marina_amoxicilina');
  await selectAndCheckWalk(page, marina);
  await page.getByRole('button', { name: 'Referência 1', exact: true }).click();
  await page.waitForFunction(() => {
    const image = document.querySelector('#viewer img');
    return image?.complete && image.naturalWidth > 0;
  });
  assert.match(await page.locator('#viewer img').getAttribute('src'), /marina.*01/);

  await page.goto(new URL('patient-review.html?patient=carlos_asma', base).href);
  await page.waitForFunction(() => !document.getElementById('patient').disabled);
  assert.equal(await page.locator('#patient').inputValue(), 'carlos_asma');
  assert.match(await page.locator('#status').innerText(), /animação em revisão/);
  await waitForModel(page, registry.patients.find((patient) => patient.id === 'carlos_asma').model);
  await page.click('[data-animation="Walk"]');
  await page.waitForFunction(() => /walk/i.test(window.__patientReviewPreview?.__anim || ''), null, { timeout: 90000 });
  await page.screenshot({ path: `${output}/1280x800-carlos-walk.png`, fullPage: true, timeout: 30000 });

  for (const patient of registry.patients) await selectAndCheckWalk(page, patient);
  assert.deepEqual(errors, []);
  results.push({ scenario: '14 pacientes, modelos, Idle/Walk e contato', status: 'PASS', count: registry.patients.length });
  console.log('PASS desktop: 14/14 modelos carregam; Idle, Walk e contato aprovados; Ana/Carlos abrem pelo parâmetro');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watchErrors(mobile);
  await mobile.goto(new URL('patient-review.html?patient=carlos_asma', base).href);
  await mobile.waitForFunction(() => !document.getElementById('patient').disabled);
  assert.equal(await mobile.locator('#patient').inputValue(), 'carlos_asma');
  await waitForModel(mobile, registry.patients.find((patient) => patient.id === 'carlos_asma').model);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const next = mobile.locator('#next');
  await next.scrollIntoViewIfNeeded();
  assert.equal(await next.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return rect.height >= 44 && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
  }), true);
  await mobile.screenshot({ path: `${output}/390x844-carlos.png`, fullPage: true, timeout: 30000 });
  assert.deepEqual(errors, []);
  results.push({ scenario: 'Carlos em viewport móvel', status: 'PASS', viewport: '390x844' });
  console.log('PASS mobile 390x844: link direto para Carlos, sem overflow e navegação utilizável');
  await mobile.close();

  const fallback = await browser.newPage();
  await fallback.goto(new URL('patient-review.html?patient=nao_existe', base).href);
  await fallback.waitForFunction(() => !document.getElementById('patient').disabled);
  assert.equal(await fallback.locator('#patient').inputValue(), 'ana_coriza');
  results.push({ scenario: 'parâmetro inválido usa Ana como base', status: 'PASS' });
  console.log('PASS fallback: Ana é a base para parâmetros ausentes ou inválidos');
  await fallback.close();
} finally {
  await browser.close();
}

assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, errors }, null, 2));
