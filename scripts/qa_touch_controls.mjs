// QA de tela cheia e navegação por toque no fluxo real do jogo.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4181/';
const output = process.argv[3] || '/tmp/farma-touch-controls';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = { url, viewports: [], errors: [], checks: [] };
const check = (name, ok, detail = null) => {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
  assert.ok(ok, name);
};

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => results.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') results.errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000 });
  await page.locator('#capa-iniciar').click();
  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 60000 });
  check('tablet touch reconhecido acima de 1024 px', await page.evaluate(() => matchMedia('(pointer: coarse)').matches));
  check('botão de tela cheia aparece no menu do tablet', await page.locator('#btn-fullscreen').isVisible());
  check('botão oferece saída acessível', await page.locator('#btn-fullscreen').getAttribute('aria-label') === 'Entrar em tela cheia');

  await page.locator('#cfg-quality').selectOption('low');
  await page.locator('#btn-iniciar').click();
  await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, { timeout: 180000, polling: 200 });
  check('direcional de toque disponível no atendimento', await page.locator('#touch-movement').isVisible());
  check('voltar ao balcão tem nome claro', (await page.locator('#btn-hud-paciente').textContent()).includes('Voltar ao balcão'));

  await page.locator('#btn-hud-pc').click();
  check('tela cheia continua acessível com painel aberto', await page.locator('#btn-fullscreen').isVisible());

  // Verifica entrada e saída reais da Fullscreen API por interação do usuário.
  await page.locator('#btn-fullscreen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 10000 });
  check('tela cheia foi ativada', await page.evaluate(() => Boolean(document.fullscreenElement)));
  check('saída da tela cheia continua visível', await page.locator('#btn-fullscreen').isVisible());
  check('rótulo muda para sair', await page.locator('#btn-fullscreen').getAttribute('aria-label') === 'Sair da tela cheia');
  await page.locator('#btn-fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 10000 });
  check('usuário consegue sair da tela cheia', await page.evaluate(() => !document.fullscreenElement));
  await page.locator('#btn-bulario-fechar').click();
  await page.locator('#btn-hud-paciente').click();
  await page.waitForFunction(() => window.__farmacheck.pov.zonaAtual() === 'paciente', null, { timeout: 3000, polling: 100 });
  // Stabilize the camera before measuring touch movement in SwiftShader.
  await page.evaluate(() => window.__farmacheck.pov.irPara('paciente', { instantaneo: true }));

  // Toque mantido no direcional: usa Pointer Events e a câmera/colisões reais.
  const cdp = await context.newCDPSession(page);
  const walkRight = await page.locator('[data-touch-move="d"]').boundingBox();
  const start = await page.evaluate(() => ({ x: window.__farmacheck.camera.position.x, z: window.__farmacheck.camera.position.z }));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 17, x: walkRight.x + walkRight.width / 2, y: walkRight.y + walkRight.height / 2, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await page.waitForFunction(() => document.querySelector('[data-touch-move="d"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 3000 });
  await page.waitForTimeout(1700);
  const held = await page.locator('[data-touch-move="d"]').getAttribute('aria-pressed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const movedRight = await page.evaluate(() => ({ x: window.__farmacheck.camera.position.x, z: window.__farmacheck.camera.position.z }));
  await page.waitForFunction(() => document.querySelector('[data-touch-move="d"]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 3000 });
  check('toque mantido move a câmera e soltar interrompe o direcional', held === 'true' && movedRight.x > start.x + 0.1, { start, movedRight, released: await page.locator('[data-touch-move="d"]').getAttribute('aria-pressed') });

  await page.locator('#btn-hud-pc').click();
  check('retorno ao balcão fica visível fora do ponto do paciente', await page.locator('#btn-hud-paciente').isVisible());
  await page.locator('#btn-hud-paciente').click();
  check('retorno ao balcão responde ao toque', await page.evaluate(() => window.__farmacheck.pov.zonaAtual() === 'paciente'));

  for (const viewport of [
    { width: 1024, height: 768, name: 'tablet-paisagem' },
    { width: 390, height: 844, name: 'celular-retrato' },
    { width: 844, height: 390, name: 'celular-paisagem' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' };
      };
      return { fullscreen: rect('#btn-fullscreen'), controls: rect('#touch-movement'), hud: rect('#hud'), chat: rect('#chat'), actions: rect('#acoes') };
    });
    const inside = (r) => r && r.visible && r.x >= 0 && r.y >= 0 && r.right <= viewport.width && r.bottom <= viewport.height;
    check(`${viewport.name}: tela cheia e direcional dentro da tela`, inside(layout.fullscreen) && inside(layout.controls), layout);
    const separated = (a, b) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
    check(`${viewport.name}: direcional sem cobrir conversa ou ações`, separated(layout.controls, layout.chat) && separated(layout.controls, layout.actions), layout);
    await page.screenshot({ path: join(output, `${viewport.name}.png`) });
    results.viewports.push({ ...viewport, layout });
  }

  check('sem erros de página/console', results.errors.length === 0, results.errors);
  await context.close();
} catch (error) {
  results.failure = error.message;
  throw error;
} finally {
  writeFileSync(join(output, 'report.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
