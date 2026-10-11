// Copy Walk/Idle from a known-good GLB onto a new mesh using node names.
// Allowed only when both skins share the same Mixamo joints and nearly identical rest transforms.
// Usage: node scripts/transplant_character_clips.mjs <target-mesh.glb> <approved-clips.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [targetPath, sourcePath, outputPath] = process.argv.slice(2);
if (!targetPath || !sourcePath || !outputPath || targetPath === '--help') {
  console.log('Uso: node scripts/transplant_character_clips.mjs <target-mesh.glb> <approved-clips.glb> <output.glb>');
  process.exit(targetPath ? 0 : 2);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [targetDoc, sourceDoc] = await Promise.all([io.read(targetPath), io.read(sourcePath)]);
const targetRoot = targetDoc.getRoot();
const sourceRoot = sourceDoc.getRoot();
const targetSkin = targetRoot.listSkins()[0];
const sourceSkin = sourceRoot.listSkins()[0];
if (!targetSkin || !sourceSkin) throw new Error('os dois GLBs precisam ter uma skin');

const targetJoints = targetSkin.listJoints();
const sourceJoints = sourceSkin.listJoints();
const targetByName = new Map(targetJoints.map((node) => [node.getName(), node]));
if (targetByName.size !== targetJoints.length) throw new Error('nomes de joints duplicados no GLB alvo');
if (sourceJoints.length !== targetJoints.length) throw new Error(`contagem de joints diferente: alvo=${targetJoints.length}, fonte=${sourceJoints.length}`);

const parents = (root) => {
  const map = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) map.set(child, node);
  return map;
};
const targetParents = parents(targetRoot);
const sourceParents = parents(sourceRoot);

let maxTranslationDelta = 0;
let maxRotationDelta = 0;
let maxScaleDelta = 0;
let maxWorldMatrixDelta = 0;
for (const sourceNode of sourceJoints) {
  const targetNode = targetByName.get(sourceNode.getName());
  if (!targetNode) throw new Error(`joint ausente no alvo: ${sourceNode.getName()}`);
  if ((sourceParents.get(sourceNode)?.getName() ?? null) !== (targetParents.get(targetNode)?.getName() ?? null)) {
    throw new Error(`hierarquia incompatível em ${sourceNode.getName()}`);
  }
  const dt = Math.hypot(...sourceNode.getTranslation().map((v, i) => v - targetNode.getTranslation()[i]));
  const sr = sourceNode.getRotation(), tr = targetNode.getRotation();
  const dot = Math.min(1, Math.abs(sr.reduce((sum, v, i) => sum + v * tr[i], 0)));
  const dr = 2 * Math.acos(dot);
  const ds = Math.max(...sourceNode.getScale().map((v, i) => Math.abs(v - targetNode.getScale()[i])));
  const sourceWorld = sourceNode.getWorldMatrix();
  const targetWorld = targetNode.getWorldMatrix();
  const worldDelta = Math.max(...Array.from(sourceWorld, (value, i) => Math.abs(value - targetWorld[i])));
  maxTranslationDelta = Math.max(maxTranslationDelta, dt);
  maxRotationDelta = Math.max(maxRotationDelta, dr);
  maxScaleDelta = Math.max(maxScaleDelta, ds);
  maxWorldMatrixDelta = Math.max(maxWorldMatrixDelta, worldDelta);
  if (dt > 0.1 || dr > 0.01 || ds > 0.01 || worldDelta > 1e-4) {
    throw new Error(`rest/bind frame incompatível em ${sourceNode.getName()}: Δt=${dt.toFixed(4)}, Δr=${dr.toFixed(4)}rad, Δs=${ds.toFixed(4)}, Δworld=${worldDelta.toExponential(2)}`);
  }
}

const sourceIBM = sourceSkin.getInverseBindMatrices()?.getArray();
const targetIBM = targetSkin.getInverseBindMatrices()?.getArray();
if (!sourceIBM || !targetIBM || sourceIBM.length !== targetIBM.length) {
  throw new Error('inverse-bind matrices ausentes ou com dimensões diferentes');
}
let maxIBMDelta = 0;
for (let index = 0; index < sourceIBM.length; index++) {
  maxIBMDelta = Math.max(maxIBMDelta, Math.abs(sourceIBM[index] - targetIBM[index]));
}
if (maxIBMDelta > 1e-4) throw new Error(`inverse-bind matrices incompatíveis; max Δ=${maxIBMDelta.toExponential(2)}`);

const sourceSkinnedNodes = sourceRoot.listNodes().filter((node) => node.getSkin());
const targetSkinnedNodes = targetRoot.listNodes().filter((node) => node.getSkin());
if (sourceSkinnedNodes.length !== 1 || targetSkinnedNodes.length !== 1) {
  throw new Error('esperado um único node skinned na fonte e no alvo');
}
const sourceMeshWorld = sourceSkinnedNodes[0].getWorldMatrix();
const targetMeshWorld = targetSkinnedNodes[0].getWorldMatrix();
const maxMeshWorldDelta = Math.max(...Array.from(sourceMeshWorld, (value, i) => Math.abs(value - targetMeshWorld[i])));
if (maxMeshWorldDelta > 1e-4) throw new Error(`frame global da malha incompatível; max Δ=${maxMeshWorldDelta.toExponential(2)}`);

const sourceAnimations = new Map(sourceRoot.listAnimations().map((a) => [a.getName().toLowerCase(), a]));
for (const name of ['Walk', 'Idle']) {
  if (!sourceAnimations.has(name.toLowerCase())) throw new Error(`clip aprovado ausente: ${name}`);
}
for (const animation of [...targetRoot.listAnimations()]) animation.dispose();

const buffer = targetRoot.listBuffers()[0] || targetDoc.createBuffer('transplanted-animation-data');
for (const name of ['Walk', 'Idle']) {
  const sourceAnimation = sourceAnimations.get(name.toLowerCase());
  const animation = targetDoc.createAnimation(name);
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
    const output = targetDoc.createAccessor(`${name}_${index}_value`, buffer)
      .setType(sourceOutput.getType())
      .setArray(new Float32Array(sourceOutput.getArray()));
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
  console.log(`[clips] ${name}: ${animation.listChannels().length} canais copiados`);
}

console.log(`[clips] joints=${targetJoints.length} maxRestDelta={translation:${maxTranslationDelta.toFixed(5)},rotation:${maxRotationDelta.toFixed(5)}rad,scale:${maxScaleDelta.toFixed(5)},world:${maxWorldMatrixDelta.toExponential(2)},IBM:${maxIBMDelta.toExponential(2)},meshWorld:${maxMeshWorldDelta.toExponential(2)}}`);
await io.write(outputPath, targetDoc);
console.log(`[clips] output=${outputPath}`);
