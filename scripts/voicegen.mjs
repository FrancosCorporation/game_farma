// Gera assets de voz para TODOS os NPCs (T1 — vozes pré-gravadas por personagem).
// Saída: public/audio/voices/<caseId>/<hash>.{ogg|mp3}
//
// Engines suportadas (escolha via env):
//   1. OpenAI-compat  TTS_URL=http://127.0.0.1:8080/v1/audio/speech  TTS_VOICE=nome
//   2. CLI genérico    TTS_CMD="piper --model pt_BR-female-medium --output_file {out}"  (usa {text} e {out})
//
// Uso:  npm run voicegen
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { CASES } from '../src/data/cases.js';

const OUT = fileURLToPath(new URL('../public/audio/voices/', import.meta.url));
const TTS_URL = process.env.TTS_URL || '';
const TTS_CMD = process.env.TTS_CMD || '';
const TTS_VOICE = process.env.TTS_VOICE || 'pt-BR';
const FORMAT = process.env.TTS_FORMAT || 'ogg';

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function collectLines(c) {
  const set = new Set();
  const add = (t) => t && set.add(String(t).trim().replace(/\s+/g, ' '));
  add(c.abertura);
  for (const f of c.fatos || []) {
    add(f.falaLeiga);
    add(f.falaEvasiva);
  }
  add(c.persona.falaForaDominio);
  add(c.persona.falaRepetida);
  for (const key in c.consequencias || {}) {
    add(c.consequencias[key].titulo);
    add(c.consequencias[key].texto);
  }
  return [...set];
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function synth(text, out, voz) {
  if (TTS_URL) {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: voz, response_format: FORMAT }),
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    return;
  }
  if (TTS_CMD) {
    const cmd = TTS_CMD.replace('{text}', text).replace('{out}', out);
    await new Promise((res, rej) => {
      const p = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
      p.on('close', (code) => (code === 0 ? res() : rej(new Error(`cmd exit ${code}`))));
    });
    return;
  }
  throw new Error('Nenhuma engine definida. Use TTS_URL=... ou TTS_CMD=...');
}

let total = 0,
  ok = 0,
  skip = 0;
for (const c of CASES) {
  const voz = c.persona.voz?.nomeVoz || TTS_VOICE;
  for (const line of collectLines(c)) {
    const dir = join(OUT, c.id);
    const file = join(dir, `${hash(line)}.${FORMAT}`);
    total++;
    if (await exists(file)) {
      skip++;
      continue;
    }
    try {
      await mkdir(dir, { recursive: true });
      await synth(line, file, voz);
      ok++;
      console.log(`+ ${c.id}/${hash(line)}.${FORMAT}`);
    } catch (e) {
      console.error(`✗ ${c.id} — ${e.message}`);
    }
  }
}
console.log(`\nVozes: ${ok} geradas, ${skip} já existentes, ${total} total.`);
console.log('Copie/compile: public/audio/voices/ faz parte do build (vite copia public/).');