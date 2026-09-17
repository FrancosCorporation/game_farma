// QA visual do avatar realista: abre o jogo (vite preview deve estar rodando),
// força o load do paciente_real.glb e tira screenshots das 3 poses + walk-in.
// Uso: node scripts/qa_realista.mjs http://127.0.0.1:4317/
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4317/';
const OUT = '/tmp/opencode/farmacheck_qa';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2500);

// pula a capa + menu direto pro atendimento (determinístico)
await page.evaluate(() => {
  document.getElementById('capa').hidden = true;
  document.getElementById('menu').hidden = true;
  const g = window.__farmacheck?.game;
  if (g) {
    g.llm = { chat: async () => ({ text: 'ok' }), probe: async () => true, ok: true };
    g.startCase(g.cases[0]);
  }
});
await page.waitForTimeout(3000); // deixa o modelo carregar e entrar

await page.screenshot({ path: `${OUT}/10_real_idle.png` });

// pose: mão no peito (dor torácica)
await page.evaluate(() => {
  const g = window.__farmacheck?.game;
  g?.avatar?.setPose?.('mao_no_peito');
  g?.avatar?.setMood?.('dolorido');
});
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/11_real_mao_no_peito.png` });

// pose: cabeça baixa
await page.evaluate(() => {
  const g = window.__farmacheck?.game;
  g?.avatar?.setPose?.('cabeca_baixa');
});
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/12_real_cabeca_baixa.png` });

// volta ao idle
await page.evaluate(() => {
  const g = window.__farmacheck?.game;
  g?.avatar?.setPose?.('idle');
  g?.avatar?.setMood?.('neutro');
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/13_real_idle2.png` });

console.log('screenshots em', OUT);
console.log('erros JS:', errors.length ? errors : 'nenhum');
console.log('avatar tipo:', await page.evaluate(() => window.__farmacheck?.game?.avatar?.constructor?.name || typeof window.__farmacheck?.game?.avatar));
await browser.close();
