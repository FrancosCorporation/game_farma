#!/usr/bin/env node
// Add Idle from a separately exported, same-rig GLB to a target containing Walk.
// Verifies joint order, parentage, rest TRS, and inverse-bind matrices first.
// Usage: node scripts/combine_character_clips.mjs <walk-target.glb> <idle-source.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { access } from 'node:fs/promises';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [walkPath, idlePath, outputPath] = process.argv.slice(2);
if (!walkPath || !idlePath || !outputPath || walkPath === '--help') {
  console.log('Uso: node scripts/combine_character_clips.mjs <walk-target.glb> <idle-source.glb> <output.glb>');
  process.exit(walkPath ? 0 : 2);
}
if (walkPath === outputPath || idlePath === outputPath) throw new Error('output não pode sobrescrever um GLB de entrada');
try {
  await access(outputPath);
  throw new Error(`output já existe; escolha outro caminho: ${outputPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [walkDoc, idleDoc] = await Promise.all([io.read(walkPath), io.read(idlePath)]);
const walkRoot = walkDoc.getRoot();
const idleRoot = idleDoc.getRoot();
const walkSkin = walkRoot.listSkins()[0];
const idleSkin = idleRoot.listSkins()[0];
if (!walkSkin || !idleSkin) throw new Error('Walk e Idle precisam ter skin.');
const walkJoints = walkSkin.listJoints();
const idleJoints = idleSkin.listJoints();
if (walkJoints.length !== 65 || idleJoints.length !== walkJoints.length) {
  throw new Error(`joints incompatíveis: Walk=${walkJoints.length}, Idle=${idleJoints.length}`);
}
const idleByName = new Map(idleJoints.map((joint) => [joint.getName(), joint]));
const walkByName = new Map(walkJoints.map((joint) => [joint.getName(), joint]));
if (walkByName.size !== walkJoints.length) throw new Error('Walk tem nomes de joint duplicados.');
const parentNames = (root) => {
  const parents = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  return parents;
};
const walkParents = parentNames(walkRoot);
const idleParents = parentNames(idleRoot);

let maxTranslationDelta = 0;
let maxRotationDelta = 0;
let maxScaleDelta = 0;
let maxWorldMatrixDelta = 0;
for (let index = 0; index < walkJoints.length; index++) {
  const walkJoint = walkJoints[index];
  const idleJoint = idleJoints[index];
  if (walkJoint.getName() !== idleJoint.getName()) {
    throw new Error(`ordem de joints diferente em ${index}: ${walkJoint.getName()} vs ${idleJoint.getName()}`);
  }
  if ((walkParents.get(walkJoint)?.getName() ?? null) !== (idleParents.get(idleJoint)?.getName() ?? null)) {
    throw new Error(`parentage incompatível em ${walkJoint.getName()}`);
  }
  const dt = Math.hypot(...walkJoint.getTranslation().map((value, axis) => value - idleJoint.getTranslation()[axis]));
  const wr = walkJoint.getRotation(), ir = idleJoint.getRotation();
  const dot = Math.min(1, Math.abs(wr.reduce((sum, value, axis) => sum + value * ir[axis], 0)));
  const dr = 2 * Math.acos(dot);
  const ds = Math.max(...walkJoint.getScale().map((value, axis) => Math.abs(value - idleJoint.getScale()[axis])));
  const walkWorld = walkJoint.getWorldMatrix();
  const idleWorld = idleJoint.getWorldMatrix();
  const worldDelta = Math.max(...Array.from(walkWorld, (value, axis) => Math.abs(value - idleWorld[axis])));
  maxTranslationDelta = Math.max(maxTranslationDelta, dt);
  maxRotationDelta = Math.max(maxRotationDelta, dr);
  maxScaleDelta = Math.max(maxScaleDelta, ds);
  maxWorldMatrixDelta = Math.max(maxWorldMatrixDelta, worldDelta);
  if (dt > 0.001 || dr > 0.001 || ds > 0.001 || worldDelta > 1e-4) {
    throw new Error(`rest/bind frame incompatível em ${walkJoint.getName()}: Δt=${dt}, Δr=${dr}, Δs=${ds}, Δworld=${worldDelta}`);
  }
}
const walkIBM = walkSkin.getInverseBindMatrices()?.getArray();
const idleIBM = idleSkin.getInverseBindMatrices()?.getArray();
if (!walkIBM || !idleIBM || walkIBM.length !== idleIBM.length) throw new Error('inverse-bind matrices ausentes ou incompatíveis.');
let maxIBMDelta = 0;
for (let index = 0; index < walkIBM.length; index++) maxIBMDelta = Math.max(maxIBMDelta, Math.abs(walkIBM[index] - idleIBM[index]));
if (maxIBMDelta > 1e-4) throw new Error(`inverse-bind matrices diferem; max Δ=${maxIBMDelta}`);
const walkSkinnedNodes = walkRoot.listNodes().filter((node) => node.getSkin());
const idleSkinnedNodes = idleRoot.listNodes().filter((node) => node.getSkin());
if (walkSkinnedNodes.length !== 1 || idleSkinnedNodes.length !== 1) {
  throw new Error('esperado um único node skinned em Walk e Idle.');
}
const walkMeshWorld = walkSkinnedNodes[0].getWorldMatrix();
const idleMeshWorld = idleSkinnedNodes[0].getWorldMatrix();
const maxMeshWorldDelta = Math.max(...Array.from(walkMeshWorld, (value, axis) => Math.abs(value - idleMeshWorld[axis])));
if (maxMeshWorldDelta > 1e-4) throw new Error(`frame global da malha difere; max Δ=${maxMeshWorldDelta}`);

const walkMap = new Map(walkRoot.listAnimations().map((animation) => [animation.getName().toLowerCase(), animation]));
const idleMap = new Map(idleRoot.listAnimations().map((animation) => [animation.getName().toLowerCase(), animation]));
const walkAnimation = walkMap.get('walk');
const idleAnimation = idleMap.get('idle');
if (!walkAnimation || !idleAnimation) throw new Error('esperado clip Walk no alvo e clip Idle na fonte.');
for (const animation of [...walkRoot.listAnimations()]) {
  if (animation.getName().toLowerCase() === 'idle') animation.dispose();
}

const buffer = walkRoot.listBuffers()[0] || walkDoc.createBuffer('combined-animation-data');
const combinedIdle = walkDoc.createAnimation('Idle');
for (const [index, channel] of idleAnimation.listChannels().entries()) {
  const sourceNode = channel.getTargetNode();
  const targetNode = walkByName.get(sourceNode?.getName());
  if (!targetNode) throw new Error(`Idle aponta a joint ausente no Walk: ${sourceNode?.getName()}`);
  const sourceSampler = channel.getSampler();
  const sourceInput = sourceSampler?.getInput();
  const sourceOutput = sourceSampler?.getOutput();
  if (!sourceInput?.getArray() || !sourceOutput?.getArray()) throw new Error(`Idle sem accessor em ${sourceNode.getName()}`);
  const input = walkDoc.createAccessor(`Idle_${index}_time`, buffer)
    .setType(sourceInput.getType()).setArray(new Float32Array(sourceInput.getArray()));
  const output = walkDoc.createAccessor(`Idle_${index}_value`, buffer)
    .setType(sourceOutput.getType()).setArray(new Float32Array(sourceOutput.getArray()));
  const sampler = walkDoc.createAnimationSampler(`Idle_${index}`)
    .setInput(input).setOutput(output).setInterpolation(sourceSampler.getInterpolation() || 'LINEAR');
  const combinedChannel = walkDoc.createAnimationChannel(`Idle_${index}`)
    .setTargetPath(channel.getTargetPath()).setTargetNode(targetNode).setSampler(sampler);
  combinedIdle.addSampler(sampler).addChannel(combinedChannel);
}

await io.write(outputPath, walkDoc);
console.log(`[clips] Walk=${walkAnimation.listChannels().length} Idle=${combinedIdle.listChannels().length} joints=${walkJoints.length}`);
console.log(`[clips] maxDelta={translation:${maxTranslationDelta},rotation:${maxRotationDelta},scale:${maxScaleDelta},world:${maxWorldMatrixDelta},IBM:${maxIBMDelta},meshWorld:${maxMeshWorldDelta}}`);
console.log(`[clips] output=${outputPath}`);
