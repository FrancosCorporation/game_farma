// Checagem de sintaxe de TODOS os módulos do jogo (src/ + server/ + scripts QA).
// Uso: npm run check
// Motivo: um erro de sintaxe em qualquer módulo derruba o boot inteiro (o Vite
// serve o módulo quebrado e a página fica em branco) — o `check` antigo olhava
// só 3 arquivos e deixava passar quebra em ui/, audio/, ai/, scene/.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'server', 'scripts'];

function arquivosJs(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivosJs(p));
    else if (/\.(m?js)$/.test(nome) && !nome.endsWith('.tmp.mjs')) out.push(p);
  }
  return out;
}

const alvos = DIRS.flatMap((d) => {
  try { return arquivosJs(join(RAIZ, d)); } catch { return []; }
});

const falhas = [];
for (const f of alvos) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    falhas.push(`${relative(RAIZ, f)}\n${(e.stderr || '').toString().trim()}`);
  }
}

if (falhas.length) {
  console.error(`❌ sintaxe: ${falhas.length} de ${alvos.length} arquivo(s) com erro\n`);
  for (const f of falhas) console.error(f + '\n');
  process.exit(1);
}
console.log(`✅ sintaxe OK — ${alvos.length} arquivos (src/, server/, scripts/)`);
