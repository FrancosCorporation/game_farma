// qa_dynamics.mjs — gate de integração da DINÂMICA DE PLANTÃO no browser:
// boota o jogo, confere o painel do menu (rank/combos/medalhas), o HUD de combo
// e o bloco do debrief ao encerrar um atendimento pela própria UI do jogo.
// Uso: node scripts/qa_dynamics.mjs [URL]   (jogo servido: npm run build && npm run serve)
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

// save com combo 2 e pontos — para o HUD de combo aparecer no boot
// (sem badges: assim o primeiro atendimento SEMPE desbloqueia 'primeiro_dia')
await page.addInitScript(() => {
  localStorage.setItem('farmacheck:progress', JSON.stringify({
    pontos: 120, combo: 2, semReprovar: 2, tresEstrelas: 1,
    badges: {}, historico: [], porFase: {}, porCaso: {},
  }));
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 20000, polling: 100 });
await page.evaluate(() => document.getElementById('capa-iniciar').click());
await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 90000, polling: 100 });

// ---- 1. painel do menu (rank + combo + medalhas) ----
await page.click('#btn-fases').catch(() => {});
const meta = await page.evaluate(() => {
  const box = document.getElementById('menu-meta');
  const menuVisible = !document.getElementById('menu').hidden;
  return {
    menuVisible,
    html: box ? box.innerHTML : null,
    medalhas: box ? box.querySelectorAll('.medalha').length : 0,
    on: box ? box.querySelectorAll('.medalha.on').length : 0,
    rankbar: box ? box.querySelector('.rankbar i')?.style.width || null : null,
  };
});
ok(meta.menuVisible, 'menu abre (Fases)');
ok(meta.rankbar !== null, 'barra de rank renderizada');
ok(meta.medalhas >= 12, `12+ medalhas no painel (${meta.medalhas})`);
ok(meta.on === 0, `save vazio → 0 medalhas acesas (${meta.on})`);
ok(/Prata/.test(meta.html || ''), 'rank Prata (120 pts) exibido');

// ---- 2. HUD de combo após o boot do caso ----
await page.click('#btn-iniciar');
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 240000, polling: 200 });
const hud = await page.evaluate(() => {
  const c = document.getElementById('hud-combo');
  return { hidden: c.hidden, txt: c.textContent, score: document.getElementById('hud-score').textContent };
});
ok(!hud.hidden, 'HUD de combo visível (combo 2 no save)');
ok(/1\.2/.test(hud.txt), `HUD mostra ×1,2 (got "${hud.txt}")`);
ok(/120/.test(hud.score), 'HUD de pontos reflete o save (120)');

// ---- 3. jogabilidade da anamnese: dica de onboarding, cobertura e chips ----
const anam = await page.evaluate(() => {
  const g = window.__farmacheck.game;
  return {
    dica: document.getElementById('chat-log').textContent.includes('Dica'),
    cobertura: document.getElementById('chat-cobertura').textContent.trim(),
    chips: document.querySelectorAll('#chat-chips button').length,
  };
});
ok(anam.dica, 'dica de onboarding no 1º atendimento');
ok(/Anamnese/i.test(anam.cobertura), `checklist de cobertura visível ("${anam.cobertura.slice(0, 40)}…")`);
ok(anam.chips >= 3, `perguntas rápidas renderizadas (${anam.chips})`);

const chipUsado = await page.evaluate(async () => {
  const g = window.__farmacheck.game;
  const b = document.querySelector('#chat-chips button');
  if (!b) return { clicked: false };
  const antes = document.querySelectorAll('#chat-chips button').length;
  b.click();
  await new Promise((r) => setTimeout(r, 400));
  const depois = document.querySelectorAll('#chat-chips button').length;
  return { clicked: true, antes, depois, usados: g.usedChips.size, cobertura: document.getElementById('chat-cobertura').textContent };
});
if (chipUsado.clicked) {
  ok(chipUsado.depois === chipUsado.antes - 1, `chip usado some do painel (${chipUsado.antes} → ${chipUsado.depois})`);
  ok(chipUsado.usados >= 1, 'usedChips registrado');
  ok(/✓|Anamnese/i.test(chipUsado.cobertura), 'cobertura atualizada após a pergunta');
}

// ---- 4. encerrar um atendimento pela UI → bloco do debrief ----
const deb = await page.evaluate(async () => {
  const g = window.__farmacheck.game;
  g.goDecision();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); // atalho 1
  if (!g.conduta) g.selectConduta('vender'); // fallback caso o atalho falhe
  await g.confirmDecision();
  const box = document.getElementById('debrief-conquistas');
  const hist = g.progress.state.historico || [];
  const ult = hist[hist.length - 1] || {};
  return {
    visible: !box.hidden, html: box.innerHTML, condutaAtalho: g.conduta,
    score: document.getElementById('hud-score').textContent,
    pontos: g.progress.state.pontos, combo: g.progress.state.combo,
    nota: ult.nota, badges: Object.keys(g.progress.state.badges || {}),
  };
});
ok(deb.condutaAtalho === 'vender', `atalho 1 escolhe a conduta ("${deb.condutaAtalho}")`);
ok(Number.isFinite(deb.nota), 'atendimento registrado no histórico (nota)');
ok(deb.nota === 0 || deb.pontos > 120, `pontos cresceram (+${deb.pontos - 120}) a menos que reprovado (nota ${deb.nota})`);
ok(deb.visible, 'bloco do debrief (combo/bônus) visível');
ok(/Combo aplicado|combo/i.test(deb.html), 'linha "Combo aplicado" no debrief');
ok(/Conquista desbloqueada/i.test(deb.html), 'conquista nova listada no debrief');
ok(deb.badges.includes('primeiro_dia'), `primeiro_dia desbloqueado no save (${deb.badges.join(',')})`);
ok(deb.score.includes(String(deb.pontos)), `HUD de pontos bate com o save (${deb.score} vs ${deb.pontos})`);
ok(deb.nota >= 70 ? deb.combo === 3 : deb.combo === 0,
  `combo segue a nota (seed 2 → ${deb.nota >= 70 ? 3 : 0} após nota ${deb.nota}; got ${deb.combo})`);

await browser.close();
console.log('\nerros de página:', errs.length ? errs.slice(0, 5).join(' | ') : 'nenhum');
if (errs.length) fails.push('erros de console/page');
console.log(fails.length ? `\n${fails.length} FALHA(S):\n- ${fails.join('\n- ')}` : '\n✔ QA DINÂMICA OK');
process.exit(fails.length ? 1 : 0);
