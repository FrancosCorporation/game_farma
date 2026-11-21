// Copy Walk and Idle onto a mesh only after exact skeleton/rest/bind checks.
// Usage (combined source): node scripts/transplant_character_clips.mjs target.glb source-with-Walk-and-Idle.glb output.glb [--in-place]
// Usage (separate actions): node scripts/transplant_character_clips.mjs target.glb walk.glb idle.glb output.glb [--in-place]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const args = process.argv.slice(2);
if (args[0] === '--help') {
  console.log('Uso: node scripts/transplant_character_clips.mjs alvo.glb fonte-com-Walk-e-Idle.glb saida.glb [--in-place]');
  console.log('  ou: node scripts/transplant_character_clips.mjs alvo.glb walk.glb idle.glb saida.glb [--in-place]');
  process.exit(0);
}
const normalizeWalkRoot = args.at(-1) === '--in-place';
const positionalArgs = normalizeWalkRoot ? args.slice(0, -1) : args;
if (![3, 4].includes(positionalArgs.length)) throw new Error('Quantidade inválida de argumentos. Use --help.');
const [targetPath, walkPath, idleOrOutputPath, maybeOutputPath] = positionalArgs;
const outputPath = positionalArgs.length === 3 ? idleOrOutputPath : maybeOutputPath;
const sourcePathByClip = positionalArgs.length === 3
  ? { Walk: walkPath, Idle: walkPath }
  : { Walk: walkPath, Idle: idleOrOutputPath };
if (outputPath === targetPath || Object.values(sourcePathByClip).includes(outputPath)) {
  throw new Error('Use a separate output path to preserve the source candidates.');
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const sourcePaths = [...new Set(Object.values(sourcePathByClip))];
const [targetDoc, ...sourceDocs] = await Promise.all([targetPath, ...sourcePaths].map((path) => io.read(path)));
const sourceDocByPath = new Map(sourcePaths.map((path, index) => [path, sourceDocs[index]]));
const targetRoot = targetDoc.getRoot();
const targetSkin = targetRoot.listSkins()[0];
if (!targetSkin) throw new Error('o GLB alvo precisa ter uma skin');
const targetJoints = targetSkin.listJoints();
const targetByName = new Map(targetJoints.map((node) => [node.getName(), node]));
if (targetByName.size !== targetJoints.length) throw new Error('nomes de joints duplicados no GLB alvo');

const parents = (root) => {
  const map = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) map.set(child, node);
  return map;
};
const targetParents = parents(targetRoot);
const targetSkinnedNodes = targetRoot.listNodes().filter((node) => node.getSkin());
if (targetSkinnedNodes.length !== 1) throw new Error('esperada uma única malha skinned no alvo');
const targetMeshWorld = targetSkinnedNodes[0].getWorldMatrix();
const targetIBM = targetSkin.getInverseBindMatrices()?.getArray();
if (!targetIBM) throw new Error('inverse-bind matrices ausentes no alvo');

const clipSources = new Map();
const reports = [];
for (const name of ['Walk', 'Idle']) {
  const sourceDoc = sourceDocByPath.get(sourcePathByClip[name]);
  const sourceRoot = sourceDoc.getRoot();
  const sourceSkin = sourceRoot.listSkins()[0];
  if (!sourceSkin) throw new Error(`${name}: a fonte precisa ter uma skin para provar o bind`);
  const sourceJoints = sourceSkin.listJoints();
  if (sourceJoints.length !== targetJoints.length) {
    throw new Error(`${name}: contagem de joints diferente: alvo=${targetJoints.length}, fonte=${sourceJoints.length}`);
  }
  const sourceParents = parents(sourceRoot);
  let maxTranslationDelta = 0;
  let maxRotationDelta = 0;
  let maxScaleDelta = 0;
  let maxWorldMatrixDelta = 0;
  for (const sourceNode of sourceJoints) {
    const targetNode = targetByName.get(sourceNode.getName());
    if (!targetNode) throw new Error(`${name}: joint ausente no alvo: ${sourceNode.getName()}`);
    if ((sourceParents.get(sourceNode)?.getName() ?? null) !== (targetParents.get(targetNode)?.getName() ?? null)) {
      throw new Error(`${name}: hierarquia incompatível em ${sourceNode.getName()}`);
    }
    const dt = Math.hypot(...sourceNode.getTranslation().map((value, i) => value - targetNode.getTranslation()[i]));
    const sr = sourceNode.getRotation(), tr = targetNode.getRotation();
    const dot = Math.min(1, Math.abs(sr.reduce((sum, value, i) => sum + value * tr[i], 0)));
    const dr = 2 * Math.acos(dot);
    const ds = Math.max(...sourceNode.getScale().map((value, i) => Math.abs(value - targetNode.getScale()[i])));
    const sourceWorld = sourceNode.getWorldMatrix();
    const targetWorld = targetNode.getWorldMatrix();
    const worldDelta = Math.max(...Array.from(sourceWorld, (value, i) => Math.abs(value - targetWorld[i])));
    maxTranslationDelta = Math.max(maxTranslationDelta, dt);
    maxRotationDelta = Math.max(maxRotationDelta, dr);
    maxScaleDelta = Math.max(maxScaleDelta, ds);
    maxWorldMatrixDelta = Math.max(maxWorldMatrixDelta, worldDelta);
    if (dt > 0.1 || dr > 0.01 || ds > 0.01 || worldDelta > 1e-4) {
      throw new Error(`${name}: rest/bind incompatível em ${sourceNode.getName()}: Δt=${dt.toFixed(4)}, Δr=${dr.toFixed(4)}rad, Δs=${ds.toFixed(4)}, Δworld=${worldDelta.toExponential(2)}`);
    }
  }
  const sourceIBM = sourceSkin.getInverseBindMatrices()?.getArray();
  if (!sourceIBM || sourceIBM.length !== targetIBM.length) {
    throw new Error(`${name}: inverse-bind matrices ausentes ou com dimensões diferentes`);
  }
  let maxIBMDelta = 0;
  for (let index = 0; index < sourceIBM.length; index++) {
    maxIBMDelta = Math.max(maxIBMDelta, Math.abs(sourceIBM[index] - targetIBM[index]));
  }
  if (maxIBMDelta > 1e-4) throw new Error(`${name}: inverse-bind matrices incompatíveis; max Δ=${maxIBMDelta.toExponential(2)}`);

  const sourceSkinnedNodes = sourceRoot.listNodes().filter((node) => node.getSkin());
  if (sourceSkinnedNodes.length !== 1) throw new Error(`${name}: esperada uma única malha skinned na fonte`);
  const sourceMeshWorld = sourceSkinnedNodes[0].getWorldMatrix();
  const maxMeshWorldDelta = Math.max(...Array.from(sourceMeshWorld, (value, i) => Math.abs(value - targetMeshWorld[i])));
  if (maxMeshWorldDelta > 1e-4) throw new Error(`${name}: frame global da malha incompatível; max Δ=${maxMeshWorldDelta.toExponential(2)}`);

  const animation = sourceRoot.listAnimations().find((item) => item.getName().toLowerCase() === name.toLowerCase());
  if (!animation) throw new Error(`clip ${name} ausente em ${sourcePathByClip[name]}`);
  clipSources.set(name, { animation, targetByName, sourceParents });
  reports.push({ name, maxTranslationDelta, maxRotationDelta, maxScaleDelta, maxWorldMatrixDelta, maxIBMDelta, maxMeshWorldDelta });
}

for (const animation of [...targetRoot.listAnimations()]) animation.dispose();
const buffer = targetRoot.listBuffers()[0] || targetDoc.createBuffer('transplanted-animation-data');
for (const name of ['Walk', 'Idle']) {
  const { animation: sourceAnimation, sourceParents } = clipSources.get(name);
  const animation = targetDoc.createAnimation(name);
  let normalizedRootTranslation = null;
  for (const [index, sourceChannel] of sourceAnimation.listChannels().entries()) {
    const sourceNode = sourceChannel.getTargetNode();
    const targetNode = targetByName.get(sourceNode?.getName());
    if (!targetNode) throw new Error(`${name}: node de animação ausente no alvo: ${sourceNode?.getName()}`);
    const sourceSampler = sourceChannel.getSampler();
    const sourceInput = sourceSampler?.getInput();
    const sourceOutput = sourceSampler?.getOutput();
    if (!sourceSampler || !sourceInput?.getArray() || !sourceOutput?.getArray()) {
      throw new Error(`${name}: canal sem sampler/accessor em ${sourceNode.getName()}`);
    }
    const input = targetDoc.createAccessor(`${name}_${index}_time`, buffer)
      .setType(sourceInput.getType())
      .setArray(new Float32Array(sourceInput.getArray()));
    let outputValues = new Float32Array(sourceOutput.getArray());
    if (normalizeWalkRoot && name === 'Walk' && /hips$/i.test(sourceNode?.getName() || '') && sourceChannel.getTargetPath() === 'translation') {
      if (sourceOutput.getType() !== 'VEC3' || outputValues.length < 3 || outputValues.length % 3 !== 0) {
        throw new Error('Walk Hips translation cannot be normalized: expected VEC3 samples');
      }
      const parent = sourceParents.get(sourceNode);
      const parentWorld = parent?.getWorldMatrix();
      const axisVerticality = parentWorld
        ? [0, 1, 2].map((axis) => Math.abs(parentWorld[axis * 4 + 1]))
        : [0, 1, 0];
      const preserveAxis = axisVerticality.indexOf(Math.max(...axisVerticality));
      const frozenAxes = [0, 1, 2].filter((axis) => axis !== preserveAxis);
      const base = [outputValues[0], outputValues[1], outputValues[2]];
      for (let sample = 0; sample < outputValues.length / 3; sample++) {
        for (const axis of frozenAxes) outputValues[sample * 3 + axis] = base[axis];
      }
      normalizedRootTranslation = {
        bone: sourceNode.getName(),
        baseTranslation: base,
        samples: outputValues.length / 3,
        preservedLocalAxis: ['X', 'Y', 'Z'][preserveAxis],
        frozenLocalAxes: frozenAxes.map((axis) => ['X', 'Y', 'Z'][axis]),
        localAxisWorldUpAlignment: axisVerticality,
      };
    }
    const output = targetDoc.createAccessor(`${name}_${index}_value`, buffer)
      .setType(sourceOutput.getType())
      .setArray(outputValues);
    const sampler = targetDoc.createAnimationSampler(`${name}_${index}`)
      .setInput(input)
      .setOutput(output)
      .setInterpolation(sourceSampler.getInterpolation() || 'LINEAR');
    const channel = targetDoc.createAnimationChannel(`${name}_${index}`)
      .setTargetPath(sourceChannel.getTargetPath())
      .setTargetNode(targetNode)
      .setSampler(sampler);
    animation.addSampler(sampler).addChannel(channel);
  }
  if (name === 'Walk' && normalizeWalkRoot && !normalizedRootTranslation) {
    throw new Error('Walk não contém canal de translação do Hips; não foi possível confirmar o perfil In Place');
  }
  console.log(`[clips] ${name}: ${animation.listChannels().length} canais copiados${normalizedRootTranslation ? `; raiz in-place=${JSON.stringify(normalizedRootTranslation)}` : ''}`);
}

console.log(`[clips] joints=${targetJoints.length} bindCompatibility=${JSON.stringify(reports)}`);
await io.write(outputPath, targetDoc);
console.log(`[clips] output=${outputPath}`);
