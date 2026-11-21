// Browser E2E for Free Shift: optional case service, canonical local cases and fallback.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { CASES, localizeCase } from '../src/data/cases.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const qaLang = process.env.QA_LANG === 'en' ? 'en' : 'pt';
const viewport = {
  width: Number.parseInt(process.env.QA_WIDTH ?? '1280', 10),
  height: Number.parseInt(process.env.QA_HEIGHT ?? '800', 10),
};
const remoteAndroid = Boolean(process.env.QA_CDP_URL);
const androidSerial = process.env.QA_ANDROID_SERIAL;
const cdpEndpoint = process.env.QA_CDP_URL?.replace(/\/+$/, '');
if (remoteAndroid && !androidSerial) throw new Error('QA_ANDROID_SERIAL is required with QA_CDP_URL');
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)
  || viewport.width < 320 || viewport.width > 2560 || viewport.height < 480 || viewport.height > 1600) {
  throw new Error(`Invalid QA viewport: ${viewport.width}x${viewport.height}`);
}
const portProbe = createServer();
await new Promise((ok, fail) => {
  portProbe.once('error', fail);
  portProbe.listen(0, '127.0.0.1', ok);
});
const port = portProbe.address().port;
await new Promise((ok, fail) => portProbe.close((error) => error ? fail(error) : ok()));
let adbReverseActive = false;
if (remoteAndroid) {
  const reverse = spawnSync('adb', ['-s', androidSerial, 'reverse', `tcp:${port}`, `tcp:${port}`], { encoding: 'utf8' });
  if (reverse.status !== 0) throw new Error(`adb reverse failed: ${reverse.stderr || reverse.stdout}`);
  adbReverseActive = true;
}
const baseUrl = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const expectedCase = CASES.find((item) => item.id === 'ana_coriza');
assert.ok(expectedCase && typeof expectedCase.errosCriticos?.[0]?.teste === 'function', 'fixture case has local deterministic scoring');
const uiCaseSequence = [
  expectedCase.id,
  'marina_amoxicilina',
  ...CASES.map((item) => item.id).filter((id) => id !== expectedCase.id && id !== 'marina_amoxicilina'),
];
assert.equal(uiCaseSequence.length, CASES.length, 'the UI route contains every catalog case');
assert.equal(new Set(uiCaseSequence).size, CASES.length, 'the UI route does not repeat patients');
assert.deepEqual(new Set(uiCaseSequence), new Set(CASES.map((item) => item.id)), 'the UI route matches the complete case catalog');

const requests = [];
let browser;
let context;
let page;
let androidTargetId;

try {
  let ready = false;
  for (let i = 0; i < 300; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is starting */ }
    await wait(100);
  }
  if (!ready) throw new Error(`Vite did not become ready at ${baseUrl} within 30 seconds: ${stderr}`);

  browser = remoteAndroid
    ? await chromium.connectOverCDP(cdpEndpoint)
    : await chromium.launch({ headless: true });
  if (remoteAndroid) {
    context = browser.contexts()[0];
    assert.ok(context, 'Android Chrome exposes its default browser context');
    const existingPages = new Set(context.pages());
    const response = await fetch(`${cdpEndpoint}/json/new?about:blank`, { method: 'PUT' });
    assert.equal(response.status, 200, 'Chrome DevTools opens a temporary isolated game tab');
    androidTargetId = (await response.json()).id;
    for (let attempt = 0; attempt < 50 && !page; attempt++) {
      page = context.pages().find((candidate) => !existingPages.has(candidate) && candidate.url() === 'about:blank');
      if (!page) await wait(100);
    }
    assert.ok(page, 'Playwright attached to the new Android Chrome tab');
    await page.bringToFront();
  } else {
    context = await browser.newContext({ viewport });
    page = await context.newPage();
  }
  await page.addInitScript((language) => {
    localStorage.clear();
    localStorage.setItem('farmacheck:sfx-volume', '0');
    localStorage.setItem('farmacheck:lang', language);
  }, qaLang);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  if (remoteAndroid || process.env.QA_REAL_SCENE === '1' || process.env.QA_MOTION_LIFECYCLE === '1') page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  let testViewport = viewport;
  const androidTouchSession = remoteAndroid ? await context.newCDPSession(page) : null;
  const activate = async (locator, options = {}) => {
    if (!remoteAndroid) return locator.click(options);
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box, 'Android touch target has a visible screen position');
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 2, radiusY: 2, force: 1, id: 1 };
    await androidTouchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await androidTouchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(80);
  };
  await page.route('**/cases/next', async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), body: request.postData() });
    const canonicalCase = CASES.find((item) => item.id === uiCaseSequence[requests.length - 1]);
    assert.ok(canonicalCase, 'fixture case exists in the local catalog');
    // Deliberately untrusted fields must be ignored in favor of the local case definition.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: `${canonicalCase.id}_s${424241 + requests.length}`,
      seed: 424241 + requests.length,
      persona: { nome: 'SERVER MUST NOT REPLACE LOCAL PERSONA' },
      errosCriticos: [{ teste: 'not a function' }],
    }) });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  testViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000, polling: 100 });
  await activate(page.locator('#capa-iniciar'));
  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 90000, polling: 100 });
  await page.waitForFunction(() => window.__farmacheck?.game?.avatar?.modelId === 'ana_clasica', null, {
    timeout: 90000,
    polling: 100,
  });
  if (process.env.QA_MOTION_LIFECYCLE === '1') {
    const motionResult = await page.evaluate(async () => {
      const avatar = window.__farmacheck.game.avatar;
      if (typeof avatar?.cancelMotion !== 'function') throw new Error('Patient avatar does not expose cancelMotion');
      let time = 0;
      const tick = async (frames) => {
        for (let frame = 0; frame < frames; frame++) {
          avatar.update(0.05, time);
          time += 0.05;
          await Promise.resolve();
        }
      };
      const previousLeave = avatar.leave();
      await tick(2);
      const canceled = avatar.cancelMotion({ hide: true });
      const nextEntry = avatar.enter();
      await previousLeave;
      await tick(120);
      await nextEntry;
      return { canceled, visibleAfterNewEntry: avatar.root.visible };
    });
    assert.deepEqual(motionResult, { canceled: true, visibleAfterNewEntry: true }, 'canceling an old leave cannot hide the newly entered avatar');
    console.log('Avatar motion lifecycle: real GLB leave was canceled; its completion did not hide the next entry.');
  }
  if (!remoteAndroid && process.env.QA_REAL_SCENE !== '1') {
    await page.evaluate(() => {
      window.__farmacheck.renderer.setAnimationLoop(null);
      // The scene owns a recursive requestAnimationFrame loop in addition to
      // Three.js's renderer loop. Desktop integration QA asserts UI/state.
      window.requestAnimationFrame = () => 0;
    });
    console.log('Boot and Ana asset loaded; paused continuous scene rendering for desktop integration QA.');
    // Keep the headless run focused on case service; Android QA keeps real arrivals.
    await page.evaluate(() => {
      const game = window.__farmacheck.game;
      let current = game.avatar;
      const skipCosmeticArrival = (model) => {
        if (model && typeof model.enter === 'function') model.enter = async () => {};
        return model;
      };
      current = skipCosmeticArrival(current);
      Object.defineProperty(game, 'avatar', {
        configurable: true,
        enumerable: true,
        get: () => current,
        set: (model) => { current = skipCosmeticArrival(model); },
      });
    });
  } else {
    console.log(`${remoteAndroid ? 'Android Chrome' : 'Chromium'} scene active at ${testViewport.width}x${testViewport.height}; real avatar arrivals enabled.`);
  }
  await page.waitForFunction(() => document.getElementById('menu')?.hidden === false);

  async function startShift(endpoint, phaseIndex = 4) {
    await page.waitForFunction(() => document.getElementById('menu')?.hidden === false);
    await activate(page.locator('#phase-select button').nth(phaseIndex));
    const serviceDetails = page.locator('#cfg-case-endpoint').locator('xpath=ancestor::details');
    if (!(await serviceDetails.evaluate((element) => element.open))) await activate(serviceDetails.locator('summary'));
    await page.locator('#cfg-case-endpoint').fill(endpoint);
    if (remoteAndroid) await page.locator('#cfg-case-endpoint').evaluate((element) => element.blur());
    await activate(page.locator('#btn-iniciar'));
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, {
      timeout: 90000,
      polling: 100,
    });
    if (!remoteAndroid) assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-input', 'desktop keeps chat autofocus on arrival');
    return page.evaluate(() => {
      const game = window.__farmacheck.game;
      return {
        state: game.state,
        phase: game.phaseDef().id,
        id: game.case?.id,
        seed: game.seed,
        name: game.case?.persona?.nome,
        localScoring: typeof game.case?.errosCriticos?.[0]?.teste === 'function',
      };
    });
  }

  async function assertDebriefScore(expectedCaseId) {
    const score = await page.evaluate(() => {
      const game = window.__farmacheck.game;
      const raw = document.getElementById('debrief-pontos').textContent.trim();
      const shown = Number(raw.split('/')[0].trim());
      const breakdownTotal = [...document.querySelectorAll('#debrief-breakdown .scorebar .text-right')]
        .map((node) => Number(node.textContent.trim().replace('−', '-')))
        .reduce((sum, value) => sum + value, 0);
      return {
        caseId: game.case?.id,
        shown,
        expectedFromBreakdown: Math.max(0, Math.min(100, breakdownTotal)),
        stored: game.progress.state.porCaso[game.case?.id],
        reportVisible: !document.getElementById('debrief').hidden,
      };
    });
    assert.equal(score.caseId, expectedCaseId, 'debrief belongs to the active patient');
    assert.equal(score.reportVisible, true, 'score is shown in the patient report');
    assert.ok(Number.isInteger(score.shown) && score.shown >= 0 && score.shown <= 100, 'visible score is bounded from 0 to 100');
    assert.equal(score.shown, score.expectedFromBreakdown, 'visible score equals the clamped sum of its displayed rubric');
    assert.equal(score.stored, score.shown, 'progress saves the same score shown to the player');
    return score.shown;
  }

  async function finishConsultation() {
    if (remoteAndroid) {
      const chatToggle = page.locator('#btn-chat-toggle');
      if (await chatToggle.isVisible() && (await chatToggle.getAttribute('aria-expanded')) === 'false') {
        await activate(chatToggle);
      }
    }
    await page.locator('#chat-input').fill('Olá, estou com sintomas e gostaria de orientação.');
    await activate(page.locator('#btn-send'));
    if (remoteAndroid) await page.locator('#chat-input').evaluate((element) => element.blur());
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE'
      && !window.__farmacheck.game.busy, null, { timeout: 20000, polling: 100 });

    // One guided question exercises the chat-to-decision path; clinical completeness
    // has separate gates and is not asserted by this transport integration test.
    for (let i = 0; i < 1; i++) {
      const chip = page.locator('#chat-chips button[data-q]').first();
      if (!(await chip.count())) break;
      await activate(chip, { force: true, noWaitAfter: true, timeout: 5000 });
      if (remoteAndroid) await page.locator('#chat-input').evaluate((element) => element.blur());
      await page.waitForFunction(() => !window.__farmacheck?.game?.busy, null, { timeout: 20000, polling: 100 });
    }

    if (remoteAndroid) await activate(page.locator('#btn-decisao'));
    else {
      await page.locator('#btn-decisao').focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DECISAO');
    if (!remoteAndroid) assert.equal(await page.evaluate(() => document.activeElement.id), 'decision-titulo', 'decision opens focus on its heading');
    let axe = await new AxeBuilder({ page }).include('#decision').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), [], `decision axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })))}`);
    if (!remoteAndroid) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-input', 'Escape from decision returns focus to chat');
      await page.locator('#btn-decisao').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DECISAO');
    }
    await activate(page.locator('#conduta-cards [data-conduta="encaminhar"]'));
    await activate(page.locator('#btn-confirmar'));
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DEBRIEFING', null, {
      timeout: 30000,
      polling: 100,
    });
    if (!remoteAndroid) assert.equal(await page.evaluate(() => document.activeElement.id), 'debrief-titulo', 'debrief opens focus on its heading');
    assert.equal(await page.locator('#btn-hud-pc').evaluate((el) => Boolean(el.closest('[inert]'))), true, 'debrief disables the background control region');
    axe = await new AxeBuilder({ page }).include('#debrief').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), [], `debrief axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })))}`);
    const firstScore = await assertDebriefScore(expectedCase.id);
    const uiCaseScores = [{ caseId: expectedCase.id, score: firstScore }];
    if (remoteAndroid || process.env.QA_REAL_SCENE === '1') console.log(`Scored ${uiCaseScores.length}/${CASES.length}: ${expectedCase.id} ${firstScore}`);
    if (!remoteAndroid) {
      await page.locator('#btn-fases').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-proximo', 'Tab wraps inside debrief');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-fases', 'Shift+Tab wraps inside debrief');
    }
    await activate(page.locator('#btn-proximo'));
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE'
      && window.__farmacheck.game.case?.id === 'marina_amoxicilina', null, { timeout: 90000, polling: 100 });
    assert.equal(requests.length, 2, 'next patient requests a fresh case from the configured service');
    assert.deepEqual(requests[1], { method: 'POST', body: '{}' }, 'next patient sends the bounded canonical DTO request');
    assert.equal(await page.evaluate(() => window.__farmacheck.game.case.persona.nome),
      localizeCase(CASES.find((item) => item.id === 'marina_amoxicilina'), qaLang).persona.nome,
      'the next patient is localized from the canonical local case');
    assert.notEqual(await page.evaluate(() => window.__farmacheck.game.case.id), expectedCase.id,
      'next patient changes the active case');
    const marinaName = localizeCase(CASES.find((item) => item.id === 'marina_amoxicilina'), qaLang).persona.nome;
    assert.ok((await page.locator('#hud-paciente').innerText()).includes(marinaName), 'the next patient name is visible in the game HUD');
    if (remoteAndroid) await activate(page.locator('#btn-decisao'));
    else {
      await page.locator('#btn-decisao').focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DECISAO');
    await activate(page.locator('#conduta-cards [data-conduta="encaminhar"]'));
    await activate(page.locator('#btn-confirmar'));
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DEBRIEFING', null, { timeout: 30000, polling: 100 });
    const marinaScore = await assertDebriefScore('marina_amoxicilina');
    uiCaseScores.push({ caseId: 'marina_amoxicilina', score: marinaScore });
    if (remoteAndroid || process.env.QA_REAL_SCENE === '1') console.log(`Scored ${uiCaseScores.length}/${CASES.length}: marina_amoxicilina ${marinaScore}`);

    for (const expectedId of uiCaseSequence.slice(2)) {
      await activate(page.locator('#btn-proximo'));
      await page.waitForFunction((caseId) => window.__farmacheck?.game?.state === 'ANAMNESE'
        && window.__farmacheck.game.case?.id === caseId, expectedId, { timeout: 90000, polling: 100 });
      assert.equal(requests.length, uiCaseScores.length + 1, `${expectedId} is selected by the next-patient control`);
      assert.deepEqual(requests.at(-1), { method: 'POST', body: '{}' }, `${expectedId} uses the canonical service request`);
      const patient = localizeCase(CASES.find((item) => item.id === expectedId), qaLang);
      const current = await page.evaluate(() => {
        const game = window.__farmacheck.game;
        return {
          caseId: game.case?.id,
          name: game.case?.persona?.nome,
          localScoring: Array.isArray(game.case?.errosCriticos)
            && game.case.errosCriticos.every((error) => typeof error.teste === 'function'),
        };
      });
      assert.equal(current.caseId, expectedId, `${expectedId} is the active canonical patient`);
      assert.equal(current.name, patient.persona.nome, `${expectedId} uses the canonical local patient data`);
      assert.equal(current.localScoring, true, `${expectedId} retains the local scoring rules`);
      assert.ok((await page.locator('#hud-paciente').innerText()).includes(patient.persona.nome), `${expectedId} is visible in the game HUD`);

      await activate(page.locator('#btn-decisao'));
      await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DECISAO');
      await activate(page.locator('#conduta-cards [data-conduta="encaminhar"]'));
      await activate(page.locator('#btn-confirmar'));
      await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DEBRIEFING', null, {
        timeout: 30000,
        polling: 100,
      });
      const score = await assertDebriefScore(expectedId);
      uiCaseScores.push({ caseId: expectedId, score });
      if (remoteAndroid || process.env.QA_REAL_SCENE === '1') console.log(`Scored ${uiCaseScores.length}/${CASES.length}: ${expectedId} ${score}`);
    }
    assert.equal(uiCaseScores.length, CASES.length, 'all 14 patients reached a scored debrief through the game UI');
    assert.deepEqual(new Set(uiCaseScores.map(({ caseId }) => caseId)), new Set(CASES.map((item) => item.id)), 'each patient was scored exactly once');
    console.log(`Patient scores through the UI (${qaLang.toUpperCase()} ${testViewport.width}x${testViewport.height}): ${JSON.stringify(uiCaseScores)}`);
    await activate(page.locator('#btn-fases'));
    assert.equal(await page.locator('#debrief').isVisible(), false);
    if (!remoteAndroid) assert.equal(await page.evaluate(() => document.activeElement.matches('#phase-select button[aria-pressed="true"]')), true, 'opening the menu moves focus to the current phase');
  }

  // A configured service is not called for a fixed phase.
  if (!remoteAndroid && process.env.QA_REAL_SCENE !== '1') {
    await page.locator('#phase-select button').first().click();
    const serviceDetails = page.locator('#cfg-case-endpoint').locator('xpath=ancestor::details');
    if (!(await serviceDetails.evaluate((element) => element.open))) await serviceDetails.locator('summary').click();
    await page.locator('#cfg-case-endpoint').fill(baseUrl);
    await page.locator('#btn-iniciar').click();
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, { timeout: 30000, polling: 100 }).catch(async (error) => {
      const state = await page.evaluate(() => ({
        state: window.__farmacheck?.game?.state,
        phase: window.__farmacheck?.game?.phaseDef?.().id,
        caseId: window.__farmacheck?.game?.case?.id,
        avatar: window.__farmacheck?.game?.avatar?.modelId,
        avatarError: window.__farmacheck?.game?.lastAvatarError,
        menuHidden: document.getElementById('menu')?.hidden,
        alert: document.getElementById('patient-load-error')?.textContent,
      }));
      throw new Error(`fixed-phase startup timed out: ${JSON.stringify(state)}; ${error.message}`);
    });
    assert.equal(requests.length, 0, 'fixed phase does not call the optional service');
    await page.evaluate(() => window.__farmacheck.game.openMenu());

    const local = await startShift('');
    assert.equal(local.phase, 'livre');
    assert.ok(CASES.some((item) => item.id === local.id), 'unconfigured Free Shift selects a canonical local case');
    assert.equal(local.localScoring, true, 'local case keeps executable scoring rules');
    assert.equal(requests.length, 0, 'unconfigured Free Shift does not contact the optional service');
    await page.evaluate(() => window.__farmacheck.game.openMenu());
    console.log('Unconfigured Free Shift selected a local case with no service request.');
  }

  const remote = await startShift(baseUrl);
  assert.deepEqual(requests[0], { method: 'POST', body: '{}' }, 'Free Shift sends the bounded canonical DTO request');
  assert.equal(remote.phase, 'livre');
  assert.equal(remote.id, expectedCase.id, 'server-suffixed ID maps to the canonical local case');
  assert.equal(remote.seed, 424242, 'valid deterministic seed reaches the game');
  assert.equal(remote.name, localizeCase(expectedCase, qaLang).persona.nome, 'server cannot replace local persona data');
  assert.equal(remote.localScoring, true, 'local scoring functions survive transport');
  await finishConsultation();
  console.log(`Remote Free Shift reached a scored debrief for all ${CASES.length} patients via Próximo cliente.`);

  assert.deepEqual(pageErrors, [], `no uncaught browser errors: ${pageErrors.join(' | ')}`);
  if (remoteAndroid) await page.close();
  else await context.close();
  console.log(`✅ Free Shift browser E2E: ${testViewport.width}x${testViewport.height} ${qaLang.toUpperCase()}${remoteAndroid ? ' Android Chrome' : ''}; canonical patient flow and scoring UI PASS`);
} finally {
  if (remoteAndroid) {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    else if (androidTargetId) await fetch(`${cdpEndpoint}/json/close/${androidTargetId}`).catch(() => {});
    if (adbReverseActive) spawnSync('adb', ['-s', androidSerial, 'reverse', '--remove', `tcp:${port}`], { encoding: 'utf8' });
  } else await browser?.close();
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (vite.exitCode === null) await new Promise((ok) => vite.once('close', ok));
}
if (remoteAndroid) {
  await new Promise((ok) => setTimeout(ok, 250));
  process.exit(0);
}
