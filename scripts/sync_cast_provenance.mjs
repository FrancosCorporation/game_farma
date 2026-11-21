import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const ledgerPath = resolve(root, 'docs/elenco_proveniencia.json');

/** Recalculate only size and digest metadata for artifact IDs already in the ledger. */
export async function refreshArtifactDigests(artifacts, repositoryRoot) {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    throw new TypeError('artifacts deve ser um objeto de registros');
  }

  const canonicalRoot = await realpath(repositoryRoot);
  const refreshed = {};
  const changes = [];

  for (const [artifactId, artifact] of Object.entries(artifacts)) {
    if (!artifact || typeof artifact.path !== 'string' || !artifact.path.trim()) {
      throw new Error(`${artifactId}: path ausente ou inválido`);
    }
    if (isAbsolute(artifact.path) || artifact.path.includes('\\')) {
      throw new Error(`${artifactId}: path precisa ser relativo ao repositório`);
    }

    const absolutePath = resolve(canonicalRoot, artifact.path);
    const relativePath = relative(canonicalRoot, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`${artifactId}: path escapa do repositório`);
    }

    const canonicalPath = await realpath(absolutePath).catch(() => null);
    if (!canonicalPath) throw new Error(`${artifactId}: arquivo não encontrado (${artifact.path})`);
    const canonicalRelativePath = relative(canonicalRoot, canonicalPath);
    if (canonicalRelativePath === '..' || canonicalRelativePath.startsWith(`..${sep}`) || isAbsolute(canonicalRelativePath)) {
      throw new Error(`${artifactId}: caminho real escapa do repositório`);
    }
    if (!(await stat(canonicalPath)).isFile()) throw new Error(`${artifactId}: caminho não é arquivo regular`);

    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(canonicalPath)) {
      bytes += chunk.length;
      digest.update(chunk);
    }
    const sha256 = digest.digest('hex');
    refreshed[artifactId] = { ...artifact, bytes, sha256 };
    if (artifact.bytes !== bytes || artifact.sha256 !== sha256) {
      changes.push({ id: artifactId, path: artifact.path, beforeBytes: artifact.bytes, bytes, beforeSha256: artifact.sha256, sha256 });
    }
  }

  return { artifacts: refreshed, changes };
}

/** Persist refreshed hashes atomically without changing stage or review state. */
export async function persistRefreshedLedger(ledgerPath, ledger, artifacts, now = new Date()) {
  const updatedLedger = {
    ...ledger,
    updated: now.toISOString().slice(0, 10),
    verification: { ...ledger.verification, checkedAt: now.toISOString() },
    artifacts,
  };
  const temporaryPath = `${ledgerPath}.tmp-${process.pid}-${now.getTime()}`;
  try {
    const modeBits = (await stat(ledgerPath)).mode & 0o777;
    await writeFile(temporaryPath, `${JSON.stringify(updatedLedger, null, 2)}\n`, { mode: modeBits, flag: 'wx' });
    await rename(temporaryPath, ledgerPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return updatedLedger;
}

async function run() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--check';
  if (args.length > 1 || !['--check', '--write'].includes(mode)) {
    console.error('Uso: node scripts/sync_cast_provenance.mjs [--check|--write]');
    process.exitCode = 2;
    return;
  }

  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  const { artifacts, changes } = await refreshArtifactDigests(ledger.artifacts, root);
  if (!changes.length) {
    console.log(`PASS ledger sem drift: ${Object.keys(artifacts).length} artefatos, tamanhos e SHA-256 atuais`);
    return;
  }

  if (mode === '--check') {
    for (const change of changes) {
      console.error(`DRIFT ${change.id} (${change.path}): ${change.beforeBytes}/${change.beforeSha256} → ${change.bytes}/${change.sha256}`);
    }
    console.error(`${changes.length} digest(s) desatualizado(s); revise os artefatos e rode com --write para atualizar somente os metadados do ledger.`);
    process.exitCode = 1;
    return;
  }

  const updatedLedger = await persistRefreshedLedger(ledgerPath, ledger, artifacts);
  console.log(`PASS ledger atualizado: ${changes.length} artefato(s) recalculado(s); estados, paths e listas de etapa preservados`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  run().catch((error) => {
    console.error(`ERRO sync_cast_provenance: ${error.message}`);
    process.exitCode = 1;
  });
}
