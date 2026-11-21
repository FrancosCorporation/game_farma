import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve(process.env.QA_ARTIFACT_DIR || '.planning/2026-10-12-melhoria-integral/implementation/20261024_report_improvements');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const result = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#capa').screenshot({ path: resolve(output, `${name}-capa.png`) });
    await page.locator('#capa-iniciar').click();
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.locator('#phase-select .phase-card').first().waitFor({ state: 'visible', timeout: 90000 });
    await page.locator('#menu').screenshot({ path: resolve(output, `${name}-menu.png`) });
    const state = await page.evaluate(() => {
      const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
      const light = (el) => {
        if (!el) return false;
        const color = getComputedStyle(el).color;
        // Tailwind v4 emite cores em oklch/lab; CSS puro sai em rgb.
        const first = Number((color.match(/-?\d*\.?\d+/) || [NaN])[0]);
        if (color.startsWith('oklch')) return first >= 0.7;
        if (color.startsWith('lab')) return first >= 70;
        const [r, g, b] = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        return [r, g, b].every((c) => c >= 180); // texto claro sobre fundo escuro
      };
      const desc = document.querySelector('#phase-select .phase-card .ph-info small');
      const title = document.querySelector('#phase-select .phase-card .ph-info b');
      const disclaimer = document.querySelector('[data-i18n="menu.disclaimer"]');
      const keys = document.querySelector('[data-i18n="menu.keys"]');
      return {
        menuBlur: getComputedStyle(document.getElementById('menu')).backdropFilter,
        coverImage: getComputedStyle(document.querySelector('.capa-stage')).backgroundImage,
        menuBackVisible: !!document.getElementById('btn-menu-capa').getClientRects().length,
        resetVisible: !!document.getElementById('btn-zerar-progresso').getClientRects().length,
        oldReviewLinks: document.querySelectorAll('#btn-review-capa, #btn-review-patients').length,
        micLabel: document.getElementById('btn-mic').textContent.trim(),
        phaseCount: document.querySelectorAll('#phase-select .phase-card').length,
        phaseDescriptions: [...document.querySelectorAll('#phase-select .phase-card .ph-info small')]
          .map((node) => node.textContent.trim()),
        intro: document.querySelector('#menu-intro')?.textContent.trim() ||
          document.querySelector('[data-i18n="menu.intro.a"]')?.parentElement?.textContent.trim() || '',
        startEnabled: !document.getElementById('btn-iniciar').disabled,
        scrollWidth: document.getElementById('menu').scrollWidth,
        viewportWidth: innerWidth,
        // Tipografia/contraste (relatório §2): descrição dos níveis e legendas de rodapé.
        type: {
          phaseDescPx: px(desc), phaseTitlePx: px(title),
          disclaimerPx: px(disclaimer), keysPx: px(keys),
          phaseDescLight: light(desc), disclaimerLight: light(disclaimer), keysLight: light(keys),
        },
      };
    });
    await page.locator('#btn-menu-capa').click();
    state.backWorked = await page.locator('#capa').isVisible() && await page.locator('#menu').isHidden();
    result.push({ viewport: name, ...state, errors });
    await page.close();
  }
  const pass = result.every((item) => item.menuBlur === 'none' && item.menuBackVisible
    && item.resetVisible && item.oldReviewLinks === 0 && item.backWorked
    && item.scrollWidth <= item.viewportWidth && item.errors.length === 0
    && item.phaseCount === 5 && item.startEnabled
    && item.phaseDescriptions[0]?.includes('Mariana')
    && item.phaseDescriptions[4]?.includes('Mariana')
    && !/Três clientes|Casos mistos|Mais clientes|Three simple|Mixed cases|More patients/i.test(item.phaseDescriptions.join(' '))
    && item.intro.includes('Mariana')
    && item.coverImage.includes('inicio_game_sem_borrao_v2.webp') && item.micLabel !== 'Mic'
    && item.type.phaseDescPx >= 14 && item.type.phaseTitlePx >= 16
    && item.type.disclaimerPx >= 14 && item.type.keysPx >= 14
    && item.type.phaseDescLight && item.type.disclaimerLight && item.type.keysLight);
  writeFileSync(resolve(output, 'entry-qa.json'), JSON.stringify({ pass, result }, null, 2));
  console.log(JSON.stringify({ pass, result }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
