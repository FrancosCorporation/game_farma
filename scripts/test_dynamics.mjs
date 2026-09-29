// test_dynamics.mjs — gate determinístico da DINÂMICA DE PLANTÃO (sem browser):
// combo/multiplicador, pontos ganhos, sequências, conquistas (idempotência) e rank.
// Roda em node puro (localStorage em memória) — usado por `npm run test:logica`.
// Sai com código 1 se qualquer assert falhar.
import { createProgressStore, comboMultiplier, rankInfo, COMBO_MIN_NOTA } from '../src/core/progression.js';
import { evaluateAchievements, ACHIEVEMENT_IDS, ACHIEVEMENTS, achievementIcon } from '../src/core/achievements.js';

// ---------- shim de localStorage (node) ----------
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ---------- 1. multiplicador do combo ----------
console.log('\n── combo: multiplicador');
eq(comboMultiplier(0), 1, 'combo 0 → ×1,0');
eq(comboMultiplier(3), 1.3, 'combo 3 → ×1,3');
eq(comboMultiplier(10), 2, 'combo 10 → ×2,0 (teto)');
eq(comboMultiplier(42), 2, 'combo 42 → ×2,0 (capado)');
eq(comboMultiplier(-5), 1, 'combo negativo → ×1,0');

// ---------- 2. rank ----------
console.log('\n── rank: barra de progresso');
const r0 = rankInfo(0);
eq([r0.atual, r0.proximo, r0.faltam, r0.pct], ['Bronze', 'Prata', 250, 0], '0 pts → Bronze, faltam 250');
const r1 = rankInfo(375);
eq([r1.atual, r1.proximo, r1.faltam], ['Prata', 'Ouro', 125], '375 pts → Prata, faltam 125 p/ Ouro');
ok(r1.pct > 0.49 && r1.pct < 0.51, `pct entre ranks ≈ 0,5 (${r1.pct.toFixed(2)})`);
const r2 = rankInfo(1200);
eq([r2.atual, r2.proximo, r2.faltam, r2.pct], ['Diamante', null, 0, 1], '1200 pts → rank máximo');

// ---------- 3. pontos, combo e quebra de sequência ----------
console.log('\n── store: pontos × combo');
const store = createProgressStore();
store.reset();
const c1 = store.registerResult({ faseId: 'aprendiz', casoId: 'caso_a', nota: 90, stars: 3, badges: ['primeiro_dia', 'nota_maxima'] });
eq([c1.mult, c1.ganhos, c1.pontos, c1.combo], [1, 90, 90, 1], '1º caso: ×1,0 → 90 pts, combo 1');
ok(c1.novasBadges.length === 2, '2 conquistas novas no 1º caso');
const c2 = store.registerResult({ faseId: 'aprendiz', casoId: 'caso_b', nota: 80, stars: 3 });
eq([c2.mult, c2.ganhos, c2.pontos, c2.combo], [1.1, 88, 178, 2], '2º caso: ×1,1 → 88 pts (total 178), combo 2');
const c3 = store.registerResult({ faseId: 'aprendiz', casoId: 'caso_c', nota: 60, stars: 1 });
eq([c3.mult, c3.ganhos, c3.combo, c3.comboQuebrou], [1.2, 72, 0, true], 'nota 60 (< %d): zera combo e não premia'.replace('%d', COMBO_MIN_NOTA));
eq(store.state.semReprovar, 3, 'semReprovar conta 3 casos sem dispensa contraindicada');
const c4 = store.registerResult({ faseId: 'aprendiz', casoId: 'caso_d', nota: 100, stars: 3, reprovado: true });
eq([c4.combo, store.state.semReprovar, c4.ganhos], [0, 0, 100], 'reprovado: combo e semReprovar zeram (pontos seguem a nota)');

// ---------- 4. conquistas (predicados puros) ----------
console.log('\n── conquistas: predicados');
const res = (over = {}) => ({
  total: 80, breakdown: [], reprovado: false, dsfOk: true,
  comunicacao: 3, reveladasRF: [], missedRed: [], ...over,
});
const casoBase = { id: 'caso_x', condutaGabarito: { tipo: 'manejo', mips: [] } };
const ctx = (o = {}) => ({ caso: casoBase, decisao: { conduta: 'sugerir', mips: [], redFlags: [] }, result: res(), stars: 2, faseId: 'plantao', combo: 0, semReprovar: 0, tresEstrelas: 0, totalCasos: 1, ...o });
const novas = (o, ja = []) => evaluateAchievements(ctx(o), ja);

ok(novas({}).includes('primeiro_dia'), 'primeiro_dia com 1º caso');
ok(novas({ result: res({ total: 96 }) }).includes('nota_maxima'), 'nota_maxima com 96 pts');
ok(!novas({ result: res({ total: 94 }) }).includes('nota_maxima'), 'nota_maxima NÃO com 94 pts');
ok(novas({ combo: 3 }).includes('combo3') && !novas({ combo: 3 }).includes('combo5'), 'combo3 aos 3; combo5 ainda não');
ok(novas({ combo: 5 }).includes('combo5'), 'combo5 aos 5');
ok(novas({ semReprovar: 5 }).includes('sem_reprovacao'), 'sem_reprovacao aos 5 casos sem dispensa');
ok(novas({ tresEstrelas: 3 }).includes('tres_estrelas_seguidas'), 'trinca de 3 estrelas');
ok(novas({ result: res({ reveladasRF: ['dor'], missedRed: [] }) }).includes('detetive'), 'detetive: red flags completas');
ok(!novas({ result: res({ reveladasRF: ['dor'], missedRed: ['febre'] }) }).includes('detetive'), 'detetive NÃO com alerta não investigado');
ok(novas({ result: res({ comunicacao: 5 }) }).includes('comunicador'), 'comunicador com 5/5');
ok(novas({ result: res({ breakdown: [{ metrica: 'bulario', pontos: 10 }] }) }).includes('bulario_mestre'), 'bulario_mestre (bula + DSF ok)');
ok(novas({ result: res({ breakdown: [{ metrica: 'teste_rapido', pontos: 20 }] }) }).includes('tlac'), 'tlac com teste executado');
ok(novas({ decisao: { conduta: 'encaminhar' }, caso: { id: 'y', condutaGabarito: { tipo: 'encaminhar' } } }).includes('encaminhador'), 'encaminhador com encaminhamento correto');
ok(novas({ totalCasos: 20 }).includes('maratona'), 'maratona aos 20 casos');
eq(novas({}, ['primeiro_dia']), [], 'conquistas já obtidas não repetem (idempotência)');
eq(novas({}, ACHIEVEMENT_IDS), [], 'catálogo inteiro desbloqueado → nada novo');

// catálogo coerente + i18n presente (evita medalha sem rótulo)
console.log('\n── conquistas: catálogo/i18n');
eq(new Set(ACHIEVEMENT_IDS).size, ACHIEVEMENT_IDS.length, `ids únicos (${ACHIEVEMENT_IDS.length} conquistas)`);
ok(ACHIEVEMENTS.every((a) => Boolean(a.icone)), 'todas têm ícone');
const { readFileSync } = await import('node:fs');
const i18nSrc = readFileSync(new URL('../src/ui/i18n.js', import.meta.url), 'utf8');
eq(ACHIEVEMENTS.filter((a) => !i18nSrc.includes(`'badge.${a.id}.nome'`)).map((a) => a.id), [], 'todo id tem badge.<id>.nome no i18n');
eq(ACHIEVEMENTS.filter((a) => !i18nSrc.includes(`'badge.${a.id}.desc'`)).map((a) => a.id), [], 'todo id tem badge.<id>.desc no i18n');

// ---------- 5. fluxo simulado: plantão de 6 casos ----------
console.log('\n── fluxo simulado (6 casos ≥ 70)');
const s2 = createProgressStore();
s2.reset();
const notas = [85, 90, 75, 100, 80, 70];
let esperado = 0;
const badgesSoltas = [];
for (const nota of notas) {
  const pre = s2.previewAfter({ nota, stars: 3, reprovado: false });
  const ids = evaluateAchievements(ctx({ result: res({ total: nota }), stars: 3, ...pre }), s2.unlockedBadges());
  const ret = s2.registerResult({ faseId: 'plantao', casoId: `c${nota}`, nota, stars: 3, badges: ids });
  badgesSoltas.push(...ret.novasBadges);
  esperado += Math.round(nota * ret.mult);
  eq(ret.pontos, esperado, `pts acumulados após nota ${nota}`);
}
eq(s2.state.combo, 6, 'combo 6 ao fim da sequência');
ok(badgesSoltas.includes('combo3') && badgesSoltas.includes('combo5'), 'combo3 e combo5 desbloqueadas no fluxo');
ok(badgesSoltas.includes('tres_estrelas_seguidas'), 'trinca de 3 estrelas no fluxo');
eq(esperado, notas.reduce((acc, n, i) => acc + Math.round(n * comboMultiplier(i)), 0), 'soma dos pontos com multiplicador crescente');
eq(esperado, 621, 'total esperado do plantão simulado (85·1,0 + 90·1,1 + 75·1,2 + 100·1,3 + 80·1,4 + 70·1,5)');

// ---------- 6. persistência, teto do histórico e reset ----------
console.log('\n── persistência/reset');
ok(JSON.parse(mem.get('farmacheck:progress')).pontos === esperado, 'pontos gravados no localStorage');
const s3 = createProgressStore();
eq(s3.state.pontos, esperado, 'novo store lê o save anterior');
eq(s3.unlockedBadges().length, badgesSoltas.length, 'badges persistem no save');
for (let i = 0; i < 45; i++) s3.registerResult({ faseId: 'livre', casoId: `z${i}`, nota: 10, stars: 0 });
eq(s3.state.historico.length, 40, 'histórico capado em 40 entradas');
s3.reset();
eq([s3.state.pontos, s3.state.combo, s3.unlockedBadges().length, s3.state.historico.length], [undefined, 0, 0, 0], 'reset limpa pontos/combo/conquistas/histórico');

console.log(fails ? `\n${fails} FALHA(S)` : '\n✔ TODOS OS CHECKS PASSARAM');
process.exit(fails ? 1 : 0);

