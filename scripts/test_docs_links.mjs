import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const currentDocs = [
  'README.md',
  'plan.md',
  'resumo.md',
  'docs/ROADMAP.md',
  'docs/OPERACAO_BACKUP.md',
  'docs/VALIDACAO_CLINICA.md',
];
const linkPattern = /\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g;
const errors = [];
let checked = 0;

for (const source of currentDocs) {
  const content = await readFile(path.join(root, source), 'utf8');
  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].replace(/^<|>$/g, '');
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;

    const [filePart] = target.split('#', 1);
    if (!filePart) continue;
    try {
      target = decodeURIComponent(filePart);
    } catch {
      errors.push(`${source}: link com percent-encoding inválido: ${match[1]}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(path.join(root, source)), target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      errors.push(`${source}: link escapa do workspace: ${match[1]}`);
      continue;
    }
    checked++;
    try {
      await readFile(resolved);
    } catch {
      errors.push(`${source}: destino local ausente: ${match[1]}`);
    }
  }
}

assert.deepEqual(errors, [], errors.join('\n'));
console.log(`✔ docs links: ${checked} destinos locais válidos em ${currentDocs.length} documentos vigentes`);
