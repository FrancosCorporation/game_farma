import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BOOT_MODEL, CASE_MODELS } from '../src/data/patientAssets.js';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs']);
const STATIC_CANDIDATE_MODEL = /models\/(candidates\/[A-Za-z0-9_./-]+\.glb)(?=[?'" \x60]|$)/g;

async function walkFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function safeModelPath(modelId) {
  if (typeof modelId !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(modelId)) {
    throw new Error('Invalid public model id: ' + String(modelId));
  }
  return 'models/' + modelId + '.glb';
}

async function assertPublicFile(publicDir, relativePath, source) {
  const absolutePath = path.resolve(publicDir, relativePath);
  if (!absolutePath.startsWith(path.resolve(publicDir) + path.sep)) {
    throw new Error('Public asset escapes publicDir: ' + relativePath);
  }
  const info = await stat(absolutePath).catch(() => null);
  if (!info?.isFile()) throw new Error('Missing public model ' + relativePath + ' (' + source + ')');
}

export async function collectProductionPublicAssetPlan({ root, publicDir = path.join(root, 'public') }) {
  const candidateFiles = new Set();
  const modelFiles = new Set();
  const modelChecks = [];
  const addModelId = (modelId, source) => {
    const relativePath = safeModelPath(modelId);
    modelFiles.add(relativePath);
    if (relativePath.startsWith('models/candidates/')) candidateFiles.add(relativePath);
    modelChecks.push({ relativePath, source });
  };

  const manifestPath = path.join(publicDir, 'patient-review.json');
  const reviewManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const modelId of new Set([BOOT_MODEL, ...Object.values(CASE_MODELS)])) {
    addModelId(modelId, 'src/data/patientAssets.js');
  }
  for (const patient of reviewManifest.patients ?? []) {
    if (patient.model) addModelId(patient.model, 'public/patient-review.json');
  }
  for (const relativePath of Object.keys(reviewManifest.modelSha256 ?? {})) {
    if (!relativePath.startsWith('models/') || relativePath.includes('..')) {
      throw new Error('Invalid modelSha256 path in patient-review.json: ' + relativePath);
    }
    modelFiles.add(relativePath);
    if (relativePath.startsWith('models/candidates/')) candidateFiles.add(relativePath);
    modelChecks.push({ relativePath, source: 'public/patient-review.json:modelSha256' });
  }

  const sourceFiles = await walkFiles(path.join(root, 'src'));
  for (const absolutePath of sourceFiles) {
    if (!TEXT_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) continue;
    const contents = await readFile(absolutePath, 'utf8');
    for (const match of contents.matchAll(STATIC_CANDIDATE_MODEL)) {
      const relativePath = 'models/' + match[1];
      candidateFiles.add(relativePath);
      modelFiles.add(relativePath);
      modelChecks.push({ relativePath, source: path.relative(root, absolutePath) });
    }
  }

  for (const check of modelChecks) {
    await assertPublicFile(publicDir, check.relativePath, check.source);
  }

  const sourceCandidateFiles = (await walkFiles(path.join(publicDir, 'models/candidates')))
    .map((absolutePath) => path.relative(publicDir, absolutePath).split(path.sep).join('/'));
  const sourceCandidateSet = new Set(sourceCandidateFiles);
  const missingFromSource = [...candidateFiles].filter((relativePath) => !sourceCandidateSet.has(relativePath));
  if (missingFromSource.length) {
    throw new Error('Candidate model references are outside public/models/candidates: ' + missingFromSource.join(', '));
  }

  return {
    publicDir: path.resolve(publicDir),
    modelFiles,
    candidateFiles,
    sourceCandidateFiles: sourceCandidateSet,
    reviewModelHashes: reviewManifest.modelSha256 ?? {},
  };
}

export async function copyProductionPublicAssets({ root, publicDir = path.join(root, 'public'), outDir = path.join(root, 'dist') }) {
  const plan = await collectProductionPublicAssetPlan({ root, publicDir });
  const files = await walkFiles(plan.publicDir);
  const outputDir = path.resolve(outDir);
  let copiedBytes = 0;
  let copiedFiles = 0;
  let excludedCandidateBytes = 0;
  let excludedCandidateFiles = 0;

  for (const sourcePath of files) {
    const relativePath = path.relative(plan.publicDir, sourcePath).split(path.sep).join('/');
    if (relativePath.startsWith('models/candidates/') && !plan.candidateFiles.has(relativePath)) {
      excludedCandidateBytes += (await stat(sourcePath)).size;
      excludedCandidateFiles += 1;
      continue;
    }

    const destination = path.join(outputDir, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
    copiedBytes += (await stat(sourcePath)).size;
    copiedFiles += 1;
  }

  return {
    copiedFiles,
    copiedBytes,
    candidateFilesCopied: plan.candidateFiles.size,
    candidateFilesExcluded: excludedCandidateFiles,
    candidateBytesExcluded: excludedCandidateBytes,
    sourceCandidateFiles: plan.sourceCandidateFiles.size,
    plan,
  };
}

export async function auditProductionPublicAssets({ root, publicDir = path.join(root, 'public'), outDir = path.join(root, 'dist') }) {
  const plan = await collectProductionPublicAssetPlan({ root, publicDir });
  const outputDir = path.resolve(outDir);
  const outputCandidates = (await walkFiles(path.join(outputDir, 'models/candidates')))
    .map((absolutePath) => path.relative(outputDir, absolutePath).split(path.sep).join('/'))
    .sort();
  const expectedCandidates = [...plan.candidateFiles].sort();
  const outputCandidateSet = new Set(outputCandidates);
  const missing = expectedCandidates.filter((relativePath) => !outputCandidateSet.has(relativePath));
  const extra = outputCandidates.filter((relativePath) => !plan.candidateFiles.has(relativePath));
  if (missing.length || extra.length) {
    throw new Error('Built candidate assets differ from runtime roster; missing='
      + (missing.join(', ') || 'none') + '; extra=' + (extra.join(', ') || 'none'));
  }

  for (const relativePath of plan.modelFiles) {
    const info = await stat(path.join(outputDir, relativePath)).catch(() => null);
    if (!info?.isFile()) throw new Error('Built public model is missing: ' + relativePath);
  }

  const checkedHashes = [];
  for (const [relativePath, expectedHash] of Object.entries(plan.reviewModelHashes)) {
    const actualHash = createHash('sha256')
      .update(await readFile(path.join(outputDir, relativePath)))
      .digest('hex');
    if (actualHash !== expectedHash) throw new Error('Built review model hash mismatch: ' + relativePath);
    checkedHashes.push(relativePath);
  }

  const excludedSourceFiles = [...plan.sourceCandidateFiles].filter((relativePath) => !plan.candidateFiles.has(relativePath));
  if (excludedSourceFiles.length) {
    const preservedSource = await Promise.all(excludedSourceFiles.map(async (relativePath) => {
      const info = await stat(path.join(plan.publicDir, relativePath)).catch(() => null);
      return info?.isFile();
    }));
    if (preservedSource.some((exists) => !exists)) {
      throw new Error('Filtered build modified or removed source candidate assets.');
    }
  }

  return {
    candidateFilesCopied: outputCandidates.length,
    candidateFilesExcludedFromBuild: excludedSourceFiles.length,
    reviewModelHashesChecked: checkedHashes.length,
    requiredModelFiles: plan.modelFiles.size,
  };
}
