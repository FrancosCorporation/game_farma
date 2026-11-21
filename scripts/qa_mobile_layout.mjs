// Verifica uso real em retrato/paisagem: áreas, toque, conversa e painéis.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4181/';
const output = process.argv[3] || '/tmp/farma-mobile-layout';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failed = false;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    const checks = [];
    const id = `${viewport.width}x${viewport.height}`;
    const check = (name, ok, detail = null) => {
      checks.push({ name, ok, detail });
      if (!ok) failed = true;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`);
    };
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const hit = (selector) => page.locator(selector).evaluate((node) => {
      const r = node.getBoundingClientRect();
      const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return target === node || node.contains(target);
    });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { polling: 100 });
      await page.evaluate(() => document.getElementById('capa-iniciar').click());
      await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 60000, polling: 200 });
      await page.click('#btn-iniciar');
      await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 180000, polling: 200 });
      check('ponteiro de toque detectado', await page.evaluate(() => matchMedia('(pointer: coarse)').matches));
      check('campo não abre teclado ao chegar', await page.evaluate(() => document.activeElement !== document.getElementById('chat-input')));
      await page.locator('#chat-input').click();
      check('campo aceita foco após toque', await page.evaluate(() => document.activeElement === document.getElementById('chat-input')));
      await page.locator('#chat-input').evaluate((element) => element.blur());
      const geometry = await page.evaluate(() => {
        const data = {};
        for (const id of ['hud', 'chat', 'acoes', 'chat-form', 'chat-input', 'btn-send', 'btn-chat-toggle']) {
          const nodes = document.querySelectorAll(`#${id}`);
          const node = nodes[0];
          const r = node.getBoundingClientRect();
          data[id] = { x: r.x, y: r.y, width: r.width, height: r.height, count: nodes.length };
        }
        return data;
      });
      check('elementos únicos e dentro da tela', Object.values(geometry).every((r) => r.count === 1 && r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1), geometry);
      const a = geometry.acoes, c = geometry.chat;
      check('ações separadas da conversa', a.x + a.width <= c.x || c.x + c.width <= a.x || a.y + a.height <= c.y || c.y + c.height <= a.y);
      if (viewport.width < viewport.height) check('área de cena livre acima da conversa', c.y > 200);
      check('enviar recebe toque', await hit('#btn-send'));
      await page.screenshot({ path: join(output, `${id}-atendimento.png`) });
      await page.click('#btn-chat-toggle');
      check('recolher amplia cena', await page.locator('#chat').evaluate((el) => el.getBoundingClientRect().height <= 80) && await page.locator('#btn-chat-toggle').getAttribute('aria-expanded') === 'false');
      await page.screenshot({ path: join(output, `${id}-cena.png`) });
      await page.click('#btn-chat-toggle');
      check('conversa reabre e input fica visível', await page.locator('#chat-input').isVisible() && await page.locator('#btn-chat-toggle').getAttribute('aria-expanded') === 'true');
      await page.click('#btn-hud-pc');
      check('bulário visível acima da conversa', await page.locator('#bulario').isVisible() && await hit('#btn-bulario-fechar'));
      await page.click('#btn-bulario-fechar');
      check('bulário fecha pelo toque', !await page.locator('#bulario').isVisible());
      await page.fill('#chat-input', 'Onde dói e desde quando?');
      const before = await page.locator('#chat-log .bub').count();
      await page.click('#btn-send');
      await page.waitForFunction((n) => document.querySelectorAll('#chat-log .bub').length > n, before, { timeout: 20000, polling: 200 });
      check('chat funciona pelo botão enviar', true);
      check('console limpo', errors.length === 0, errors);
    } catch (error) {
      check('execução do fluxo', false, error.message);
      await page.screenshot({ path: join(output, `${id}-falha.png`) }).catch(() => {});
    } finally {
      results.push({ viewport, checks, errors });
      writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
