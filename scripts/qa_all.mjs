// qa_all.mjs — GATE ÚNICO: roda todos os gates na ordem (estáticos → browser) e
// imprime um resumo com tempos. Ver docs/ROADMAP.md §5.
//   node scripts/qa_all.mjs            # tudo (precisa do jogo servido p/ os de browser)
//   node scripts/qa_all.mjs --fast     # só estáticos (check + test:logica + build)
//   QA_URL=http://127.0.0.1:4174/ node scripts/qa_all.mjs
// Sai com código 1 se qualquer gate falhar (SKIP de browser não conta como falha).
import { spawnSync } from 'node:child_process';

const FAST = process.argv.includes('--fast');
const URL = process.env.QA_URL || 'http://127.0.0.1:4174/';

const ESTATICOS = [
  { id: 'check', bin: 'npm', args: ['run', 'check'], cobre: 'sintaxe de src/, server/, scripts/' },
  { id: 'test:logica', bin: 'npm', args: ['run', 'test:logica'], cobre: 'dinâmica: combo, conquistas, rank, persistência' },
  { id: 'build', bin: 'npm', args: ['run', 'build'], cobre: 'bundle Vite (dist/)' },
];
const BROWSER = [
  { id: 'qa:boot', bin: 'npm', args: ['run', 'qa:boot', '--', URL], cobre: 'capa → menu → cena → anamnese' },
  { id: 'qa:dynamics', bin: 'npm', args: ['run', 'qa:dynamics', '--', URL], cobre: 'painel, HUD, chips, cobertura, atalhos, debrief' },
  { id: 'qa', bin: 'npm', args: ['run', 'qa', '--', URL], cobre: 'fluxo completo (18 checks)' },
];

async function servidorDePe() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(URL, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return r.ok || r.status === 200;
  } catch { return false; }
}

const linhas = [];
function roda(step) {
  const t0 = Date.now();
  const r = spawnSync(step.bin, step.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const saida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  const ok = r.status === 0;
  linhas.push({ id: step.id, ok, seg, cobre: step.cobre, saida });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.id.padEnd(12)} ${seg.padStart(6)}s  ${step.cobre}`);
  if (!ok) console.log('  └─ ' + saida.split('\n').slice(-6).join('\n  └─ '));
  return ok;
}

console.log(`\n=== qa:all — ${FAST ? 'modo --fast (só estáticos)' : 'completo'} · ${new Date().toISOString()}\n`);
let falhas = 0;
for (const s of ESTATICOS) if (!roda(s)) falhas++;

if (!FAST) {
  const up = await servidorDePe();
  if (!up) {
    console.log(`SKIP  gates de browser — servidor ausente em ${URL} (rode: npm run build && npm run serve)`);
  } else {
    for (const s of BROWSER) if (!roda(s)) falhas++;
  }
}

const total = linhas.length;
const pass = linhas.filter((l) => l.ok).length;
const tempo = linhas.reduce((a, l) => a + Number(l.seg), 0).toFixed(1);
console.log(`\n=== RESUMO: ${pass}/${total} PASS · ${falhas} falha(s) · ${tempo}s${FAST ? ' (--fast)' : ''}`);
for (const l of linhas.filter((x) => !x.ok)) console.log(`  ✗ ${l.id} — ver saída acima`);
process.exit(falhas ? 1 : 0);
