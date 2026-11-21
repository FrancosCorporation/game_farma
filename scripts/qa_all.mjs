// qa_all.mjs — GATE ÚNICO: roda todos os gates na ordem (estáticos → browser) e
// imprime um resumo com tempos. Ver docs/ROADMAP.md §5.
//   node scripts/qa_all.mjs            # tudo (precisa do jogo servido p/ os de browser)
//   node scripts/qa_all.mjs --fast     # só estáticos (check + test:logica + build)
//   node scripts/qa_all.mjs --dev-only # só os gates que precisam de Vite DEV
//   QA_URL=http://127.0.0.1:4174/ node scripts/qa_all.mjs
// Sai com código 1 se qualquer gate falhar (SKIP de browser não conta como falha).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const FAST = process.argv.includes('--fast');
const DEV_ONLY = process.argv.includes('--dev-only');
const URL = process.env.QA_URL || 'http://127.0.0.1:4174/';
const ARTIFACT_DIR = process.env.QA_ARTIFACT_DIR ? resolve(process.env.QA_ARTIFACT_DIR) : null;
if (ARTIFACT_DIR) mkdirSync(ARTIFACT_DIR, { recursive: true });
const artifactPath = (name) => ARTIFACT_DIR ? join(ARTIFACT_DIR, name) : null;

const ESTATICOS = [
  { id: 'check', bin: 'npm', args: ['run', 'check'], cobre: 'sintaxe de src/, server/, scripts/' },
  { id: 'test:logica', bin: 'npm', args: ['run', 'test:logica'], cobre: 'dinâmica: combo, conquistas, rank, persistência' },
  { id: 'qa:llm-stream', bin: 'npm', args: ['run', 'qa:llm-stream'], cobre: 'stream normal, DONE e timeout depois dos headers' },
  { id: 'build', bin: 'npm', args: ['run', 'build'], cobre: 'bundle Vite (dist/)' },
  { id: 'qa:character-walk', bin: 'npm', args: ['run', 'qa:character-walk', '--', 'public/models/ana_walk_preview.glb'], cobre: 'contrato offline Walk/Idle do candidato isolado' },
  { id: 'qa:character-topology', bin: 'npm', args: ['run', 'qa:character-topology', '--', 'public/models/ana_walk_preview.glb'], cobre: 'topologia renderizável do candidato isolado' },
];
const BROWSER = [
  { id: 'qa:boot', bin: 'npm', args: ['run', 'qa:boot', '--', URL], cobre: 'capa → menu → cena → anamnese' },
  { id: 'qa:references', bin: 'npm', args: ['run', 'qa:references', '--', URL], cobre: 'referências PT/EN, foco modal, Escape, fechamento e axe' },
  { id: 'qa:accessibility:panels', bin: 'npm', args: ['run', 'qa:accessibility:panels'], cobre: 'foco, Escape e axe em TLAC/DSF/decisão (desktop/celular × PT/EN)' },
  { id: 'qa:mobile-layout', bin: 'npm', args: ['run', 'qa:mobile-layout', '--', URL, ...(artifactPath('mobile-layout') ? [artifactPath('mobile-layout')] : [])], cobre: 'retrato/paisagem, toque, conversa e painéis sem sobreposição' },
  { id: 'qa:pharmacy-props', bin: 'npm', args: ['run', 'qa:pharmacy-props', '--', URL, ...(artifactPath('pharmacy-props') ? [artifactPath('pharmacy-props')] : [])], cobre: 'cinco gôndolas, recursos compartilhados e fallback de rede' },
  { id: 'qa:dynamics', bin: 'npm', args: ['run', 'qa:dynamics', '--', URL], cobre: 'painel, HUD, chips, cobertura, atalhos, debrief' },
  { id: 'qa:audio:browser', bin: 'npm', args: ['run', 'qa:audio:browser'], cobre: 'TTS Chromium: fallbacks, cache por idioma e cancelamento' },
  { id: 'qa:patient-review', bin: 'npm', args: ['run', 'qa:patient-review', '--', URL, artifactPath('patient-review') || '/tmp/farma-patient-review'], env: { QA_SOFTWARE: '1' }, cobre: 'galeria de pacientes em desktop/retrato/paisagem e falha do manifesto' },
  { id: 'qa:free-shift:matrix', bin: 'npm', args: ['run', 'qa:free-shift:matrix'], cobre: 'Expediente Livre, retorno Escape e debrief em desktop/celular × PT/EN' },
  { id: 'qa', bin: 'npm', args: ['run', 'qa', '--', URL, ...(artifactPath('game-flow') ? [artifactPath('game-flow')] : [])], cobre: 'fluxo completo (18 checks)' },
  { id: 'qa:character-walk:runtime', bin: 'npm', args: ['run', 'qa:character-walk:runtime', '--', URL, 'public/models/ana_walk_preview.glb'], env: ARTIFACT_DIR ? { WALK_QA_OUTPUT_DIR: artifactPath('character-walk'), WALK_QA_TRACE: artifactPath('character-walk/trace.json') } : undefined, cobre: 'rota de entrada e Walk do candidato no runtime' },
];
const DEV_BROWSER = [
  { id: 'qa:case-models', args: ['run', 'qa:case-models', '--'], env: ARTIFACT_DIR ? { QA_OUTPUT: artifactPath('case-models.json') } : undefined, cobre: 'fallback aprovado, 14 modelos em revisão, chegada e retry de rede' },
  { id: 'qa:avatar-cache', args: ['run', 'qa:avatar-cache', '--'], env: { QA_SOFTWARE: '1', ...(ARTIFACT_DIR ? { QA_REPORT_PATH: artifactPath('avatar-cache.json') } : {}) }, cobre: '42 trocas de elenco, limite LRU e preservação dos props' },
];
const BROWSER_LOCAL = [
  { id: 'qa:character-preview', bin: 'npm', args: ['run', 'qa:character-preview', ...(artifactPath('character-preview.png') ? ['--', 'public/models/ana_walk_preview.glb', artifactPath('character-preview.png')] : [])], cobre: 'preview isolado e calibração do piso no ciclo' },
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
  const r = spawnSync(step.bin, step.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    ...(step.env ? { env: { ...process.env, ...step.env } } : {}) });
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const saida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  const ok = r.status === 0;
  linhas.push({ id: step.id, ok, seg, cobre: step.cobre, saida });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.id.padEnd(12)} ${seg.padStart(6)}s  ${step.cobre}`);
  if (!ok) console.log('  └─ ' + saida.split('\n').slice(-6).join('\n  └─ '));
  return ok;
}

async function rodaGatesDev() {
  const probe = createServer();
  await new Promise((ok, fail) => {
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', ok);
  });
  const port = probe.address().port;
  await new Promise((ok, fail) => probe.close((error) => error ? fail(error) : ok()));

  const target = `http://127.0.0.1:${port}/`;
  const vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (vite.exitCode !== null) throw new Error(`Vite DEV encerrou antes do QA (${vite.exitCode}): ${stderr}`);
      try {
        const response = await fetch(target);
        if (response.status === 200) { ready = true; break; }
      } catch { /* Vite está iniciando. */ }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    if (!ready) throw new Error(`Vite DEV não respondeu em ${target}: ${stderr}`);
    for (const step of DEV_BROWSER) {
      if (!roda({ ...step, bin: 'npm', args: [...step.args, target] })) falhas++;
    }
  } catch (error) {
    falhas++;
    const mensagem = `qa:dev-server — ${error.message}`;
    linhas.push({ id: 'qa:dev-server', ok: false, seg: '0.0', cobre: 'instrumentação DEV para revisão/cache de avatares', saida: mensagem });
    console.log(`FAIL  qa:dev-server  ${mensagem}`);
  } finally {
    if (vite.exitCode === null) {
      const encerrado = new Promise((ok) => vite.once('exit', ok));
      vite.kill('SIGTERM');
      await encerrado;
    }
  }
}

const modo = FAST ? 'modo --fast (só estáticos)' : DEV_ONLY ? 'modo --dev-only' : 'completo';
console.log(`\n=== qa:all — ${modo} · ${new Date().toISOString()}\n`);
let falhas = 0;
if (!DEV_ONLY) for (const s of ESTATICOS) if (!roda(s)) falhas++;

if (!FAST) {
  if (DEV_ONLY) {
    await rodaGatesDev();
  } else {
    const up = await servidorDePe();
    if (!up) {
      console.log(`SKIP  gates de browser — servidor ausente em ${URL} (rode: npm run build && npm run serve)`);
    } else {
      for (const s of BROWSER) if (!roda(s)) falhas++;
    }
    // A rota local de revisão e as métricas do cache são intencionalmente DEV-only.
    // Rode os gates contra Vite em vez do build estático usado pelo restante do QA.
    await rodaGatesDev();
    for (const s of BROWSER_LOCAL) if (!roda(s)) falhas++;
  }
}

const total = linhas.length;
const pass = linhas.filter((l) => l.ok).length;
const tempo = linhas.reduce((a, l) => a + Number(l.seg), 0).toFixed(1);
console.log(`\n=== RESUMO: ${pass}/${total} PASS · ${falhas} falha(s) · ${tempo}s${FAST ? ' (--fast)' : DEV_ONLY ? ' (--dev-only)' : ''}`);
for (const l of linhas.filter((x) => !x.ok)) console.log(`  ✗ ${l.id} — ver saída acima`);
process.exit(falhas ? 1 : 0);
