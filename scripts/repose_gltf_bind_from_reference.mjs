#!/usr/bin/env node
// Repose a skinned GLB into the local arm rotations of a compatible reference.
// Geometry is baked through the target's own weights + inverse binds; target
// identity, topology, materials, and non-selected rig bones are preserved.
// Animation rotations on selected bones are rebased to the new rest pose.
// This is a diagnostic candidate generator, not an approval or deploy step.
// Usage: node scripts/repose_gltf_bind_from_reference.mjs <target.glb> <pose-reference.glb> <output.glb>
import { access, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

const [targetPath, referencePath, outputPath] = process.argv.slice(2);
if (!targetPath || !referencePath || !outputPath || targetPath === '--help') {
  console.log('Uso: node scripts/repose_gltf_bind_from_reference.mjs <target.glb> <pose-reference.glb> <output.glb>');
  process.exit(targetPath ? 0 : 2);
}
if (targetPath === outputPath || referencePath === outputPath) throw new Error('a saída não pode sobrescrever nenhuma entrada');
await Promise.all([stat(targetPath), stat(referencePath)]);
try {
  await access(outputPath);
  throw new Error(`a saída já existe; escolha outro caminho: ${outputPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});
const [targetDoc, referenceDoc] = await Promise.all([io.read(targetPath), io.read(referencePath)]);
// Reading meshopt-compressed input decodes its accessors but retains the
// writer extension on the document. Dispose that extension on the disposable
// candidate so the diagnostic GLB is serialized as ordinary uncompressed data.
for (const document of [targetDoc, referenceDoc]) {
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  }
}
const targetRoot = targetDoc.getRoot();
const referenceRoot = referenceDoc.getRoot();
const targetSkins = targetRoot.listSkins();
const referenceSkins = referenceRoot.listSkins();
const targetSkinnedNodes = targetRoot.listNodes().filter((node) => node.getSkin());
if (targetSkins.length !== 1 || referenceSkins.length !== 1 || targetSkinnedNodes.length !== 1) {
  throw new Error(`esperada uma skin/reference e um node skinned; target skins=${targetSkins.length}, reference skins=${referenceSkins.length}, nodes=${targetSkinnedNodes.length}`);
}
const targetSkin = targetSkins[0];
const referenceSkin = referenceSkins[0];
const targetNode = targetSkinnedNodes[0];
const mesh = targetNode.getMesh();
if (!mesh) throw new Error('node skinned sem mesh');

const normalizeName = (name) => name.replaceAll(':', '').toLowerCase();
const parentMap = (root) => {
  const parents = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  return parents;
};
const parentName = (root, node) => parentMap(root).get(node)?.getName() ?? '';
const targetJoints = targetSkin.listJoints();
const referenceJoints = referenceSkin.listJoints();
const referenceNodes = new Map(referenceRoot.listNodes().map((node) => [normalizeName(node.getName()), node]));
const referenceJointNames = new Set(referenceJoints.map((node) => normalizeName(node.getName())));
if (targetJoints.length !== referenceJoints.length
  || targetJoints.some((joint) => !referenceJointNames.has(normalizeName(joint.getName())))) {
  throw new Error('rigs incompatíveis: names/count dos joints diferem');
}
for (const joint of targetJoints) {
  const refJoint = referenceNodes.get(normalizeName(joint.getName()));
  if (!refJoint || normalizeName(parentName(targetRoot, joint)) !== normalizeName(parentName(referenceRoot, refJoint))) {
    throw new Error(`hierarquia incompatível em ${joint.getName()}`);
  }
}

const selectedNames = [
  'mixamorig:LeftArm', 'mixamorig:LeftForeArm',
  'mixamorig:RightArm', 'mixamorig:RightForeArm',
];
const targetNodes = new Map(targetRoot.listNodes().map((node) => [normalizeName(node.getName()), node]));
const selected = new Map();
for (const name of selectedNames) {
  const key = normalizeName(name);
  const current = targetNodes.get(key);
  const reference = referenceNodes.get(key);
  if (!current || !reference || !targetJoints.includes(current) || !referenceJoints.includes(reference)) {
    throw new Error(`bone-alvo ausente/inválido: ${name}`);
  }
  selected.set(current, {
    name,
    oldRotation: current.getRotation().map(Number),
    newRotation: reference.getRotation().map(Number),
  });
}

const readAccessor = (accessor) => {
  const array = accessor?.getArray();
  if (!array) throw new Error('accessor sem dados');
  if (!accessor.getNormalized()) return Array.from(array, Number);
  const divisors = ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 })[accessor.getComponentType()];
  if (!divisors) throw new Error(`componentType normalizado não suportado: ${accessor.getComponentType()}`);
  const signed = accessor.getComponentType() === 5120 || accessor.getComponentType() === 5122;
  return Array.from(array, (value) => signed ? Math.max(-1, Number(value) / divisors) : Number(value) / divisors);
};
const normalizedQuat = (q) => new Quaternion(q[0], q[1], q[2], q[3]).normalize();
const matrixWorld = (node) => new Matrix4().fromArray(node.getWorldMatrix());
const maxMatrixDelta = (a, b) => Math.max(...a.elements.map((value, index) => Math.abs(value - b.elements[index])));

const oldIBMAccessor = targetSkin.getInverseBindMatrices();
if (!oldIBMAccessor || oldIBMAccessor.getType() !== 'MAT4' || oldIBMAccessor.getCount() !== targetJoints.length) {
  throw new Error('inverse-bind matrices ausentes ou com dimensões inválidas');
}
const oldIBMValues = readAccessor(oldIBMAccessor);
const oldIBM = targetJoints.map((_, index) => new Matrix4().fromArray(oldIBMValues.slice(index * 16, index * 16 + 16)));
const oldWorld = targetJoints.map(matrixWorld);
let maxRestResidual = 0;
let worstRestJoint = '';
for (let i = 0; i < targetJoints.length; i++) {
  const residual = maxMatrixDelta(oldWorld[i].clone().multiply(oldIBM[i]), new Matrix4());
  if (residual > maxRestResidual) { maxRestResidual = residual; worstRestJoint = targetJoints[i].getName(); }
}
if (maxRestResidual > 0.15) throw new Error(`bind original excessivamente inconsistente com o runtime GLTFLoader: ${worstRestJoint} residual=${maxRestResidual.toFixed(5)}`);

// Change only local Arm/ForeArm rest rotations. Preserve target joint positions
// and scales, so the reference supplies posture rather than body proportions.
const offsets = new Map();
for (const [node, pose] of selected) {
  const oldQ = normalizedQuat(pose.oldRotation);
  const newQ = normalizedQuat(pose.newRotation);
  const offset = newQ.clone().multiply(oldQ.clone().invert()).normalize();
  offsets.set(node, offset);
  node.setRotation(newQ.toArray());
}
const makeNormalMatrix = (matrix) => new Matrix3().setFromMatrix4(matrix);
const newWorld = targetJoints.map(matrixWorld);
const newSkinMatrices = targetJoints.map((_, index) => newWorld[index].clone().multiply(oldIBM[index]));
const newSkinNormalMatrices = newSkinMatrices.map(makeNormalMatrix);

const buffer = targetRoot.listBuffers()[0] || targetDoc.createBuffer('reposed-character-data');
const makeAccessor = (name, type, values) => targetDoc.createAccessor(name, buffer)
  .setType(type).setArray(Float32Array.from(values));
const jointAttributes = (primitive) => {
  const sets = [];
  for (let set = 0; set < 2; set++) {
    const joints = primitive.getAttribute(`JOINTS_${set}`);
    const weights = primitive.getAttribute(`WEIGHTS_${set}`);
    if (!joints && !weights) continue;
    if (!joints || !weights || joints.getType() !== 'VEC4' || weights.getType() !== 'VEC4') {
      throw new Error('pares JOINTS/WEIGHTS devem existir juntos em VEC4');
    }
    sets.push({ joints: readAccessor(joints), weights: readAccessor(weights) });
  }
  if (!sets.length) throw new Error('primitive sem JOINTS_0/WEIGHTS_0');
  return sets;
};

let movedVertices = 0;
for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
  if (primitive.listTargets().length) throw new Error('morph targets não são suportados por este bake');
  const positionAccessor = primitive.getAttribute('POSITION');
  if (!positionAccessor || positionAccessor.getType() !== 'VEC3') throw new Error('POSITION VEC3 ausente');
  const positions = readAccessor(positionAccessor);
  const vertexCount = positionAccessor.getCount();
  const attributes = jointAttributes(primitive);
  for (const set of attributes) if (set.joints.length !== vertexCount * 4 || set.weights.length !== vertexCount * 4) {
    throw new Error(`JOINTS/WEIGHTS count inválido em ${mesh.getName()}[${primitiveIndex}]`);
  }

  const normalAccessor = primitive.getAttribute('NORMAL');
  const tangentAccessor = primitive.getAttribute('TANGENT');
  const normals = normalAccessor ? readAccessor(normalAccessor) : null;
  const tangents = tangentAccessor ? readAccessor(tangentAccessor) : null;
  if (normals && normals.length !== vertexCount * 3) throw new Error('NORMAL count inválido');
  if (tangents && tangents.length !== vertexCount * 4) throw new Error('TANGENT count inválido');

  const nextPositions = new Float32Array(positions.length);
  const nextNormals = normals ? new Float32Array(normals.length) : null;
  const nextTangents = tangents ? new Float32Array(tangents.length) : null;
  const sourcePosition = new Vector3();
  const sourceDirection = new Vector3();
  const result = new Vector3();
  const directionResult = new Vector3();
  const temp = new Vector3();
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    sourcePosition.fromArray(positions, vertex * 3);
    result.set(0, 0, 0);
    if (normals) { sourceDirection.fromArray(normals, vertex * 3).normalize(); directionResult.set(0, 0, 0); }
    const tangent = tangents ? new Vector3().fromArray(tangents, vertex * 4).normalize() : null;
    const tangentResult = tangent ? new Vector3() : null;
    let totalWeight = 0;
    const influences = [];
    for (const set of attributes) for (let k = 0; k < 4; k++) {
      const offset = vertex * 4 + k;
      const jointIndex = Math.round(set.joints[offset]);
      const weight = set.weights[offset];
      if (weight <= 1e-8) continue;
      if (jointIndex < 0 || jointIndex >= targetJoints.length) throw new Error(`joint index fora do range no vertex ${vertex}`);
      influences.push({ jointIndex, weight });
      totalWeight += weight;
    }
    if (!(totalWeight > 0.98 && totalWeight < 1.02)) throw new Error(`peso total inválido (${totalWeight.toFixed(4)}) no vertex ${vertex}`);
    for (const { jointIndex, weight: rawWeight } of influences) {
      const weight = rawWeight / totalWeight;
      const skinMatrix = newSkinMatrices[jointIndex];
      temp.copy(sourcePosition).applyMatrix4(skinMatrix);
      result.addScaledVector(temp, weight);
      if (normals) {
        temp.copy(sourceDirection).applyMatrix3(newSkinNormalMatrices[jointIndex]);
        directionResult.addScaledVector(temp, weight);
      }
      if (tangent && tangentResult) {
        temp.copy(tangent).applyMatrix3(newSkinNormalMatrices[jointIndex]);
        tangentResult.addScaledVector(temp, weight);
      }
    }
    result.toArray(nextPositions, vertex * 3);
    if (normals && nextNormals) directionResult.normalize().toArray(nextNormals, vertex * 3);
    if (tangent && tangentResult && nextTangents) {
      tangentResult.normalize().toArray(nextTangents, vertex * 4);
      nextTangents[vertex * 4 + 3] = tangents[vertex * 4 + 3];
    }
    movedVertices++;
  }
  primitive.setAttribute('POSITION', makeAccessor(`${mesh.getName()}_reposed_POSITION_${primitiveIndex}`, 'VEC3', nextPositions));
  if (nextNormals) primitive.setAttribute('NORMAL', makeAccessor(`${mesh.getName()}_reposed_NORMAL_${primitiveIndex}`, 'VEC3', nextNormals));
  if (nextTangents) primitive.setAttribute('TANGENT', makeAccessor(`${mesh.getName()}_reposed_TANGENT_${primitiveIndex}`, 'VEC4', nextTangents));
}

// Rebase selected animation curves with qNewRest * inverse(qOldRest), applying
// the same quaternion-linear map to CUBICSPLINE tangents and key values.
let rebasedChannels = 0;
for (const animation of targetRoot.listAnimations()) for (const channel of animation.listChannels()) {
  const node = channel.getTargetNode();
  const offset = node && offsets.get(node);
  if (!offset || channel.getTargetPath() !== 'rotation') continue;
  const sampler = channel.getSampler();
  const input = sampler.getInput()?.getArray();
  const outputAccessor = sampler.getOutput();
  if (!input?.length || outputAccessor?.getType() !== 'VEC4') throw new Error(`${animation.getName()}: canal incompleto em ${node.getName()}`);
  const values = readAccessor(outputAccessor);
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
  const valuesPerKey = cubic ? 12 : 4;
  if (values.length !== input.length * valuesPerKey) throw new Error(`${animation.getName()}: chaves inválidas em ${node.getName()}`);
  const out = new Float32Array(values.length);
  const qOffset = [offset.x, offset.y, offset.z, offset.w];
  const multiplyRaw = (q) => [
    qOffset[3] * q[0] + qOffset[0] * q[3] + qOffset[1] * q[2] - qOffset[2] * q[1],
    qOffset[3] * q[1] - qOffset[0] * q[2] + qOffset[1] * q[3] + qOffset[2] * q[0],
    qOffset[3] * q[2] + qOffset[0] * q[1] - qOffset[1] * q[0] + qOffset[2] * q[3],
    qOffset[3] * q[3] - qOffset[0] * q[0] - qOffset[1] * q[1] - qOffset[2] * q[2],
  ];
  for (let key = 0; key < input.length; key++) {
    const base = key * valuesPerKey;
    for (let component = 0; component < valuesPerKey; component += 4) {
      const q = multiplyRaw(values.slice(base + component, base + component + 4));
      const isKeyValue = !cubic || component === 4;
      const finalQ = isKeyValue ? normalizedQuat(q).toArray() : q;
      finalQ.forEach((value, i) => { out[base + component + i] = value; });
    }
  }
  sampler.setOutput(makeAccessor(`${animation.getName()}_${node.getName()}_reposed_rotation`, 'VEC4', out));
  rebasedChannels++;
}

// New inverse binds make the rebased mesh pose the identity state at rest.
const newIBMValues = [];
let maxNewBindResidual = 0;
for (const [index, joint] of targetJoints.entries()) {
  const inverse = newWorld[index].clone().invert();
  maxNewBindResidual = Math.max(maxNewBindResidual, maxMatrixDelta(newWorld[index].clone().multiply(inverse), new Matrix4()));
  newIBMValues.push(...inverse.elements);
}
targetSkin.setInverseBindMatrices(makeAccessor(`${targetSkin.getName()}_reposed_inverseBindMatrices`, 'MAT4', newIBMValues));

// Do not run meshopt() here: this project has observed that transform pruning
// can detach skins/accessors during direct skin edits. The diagnostic output is
// intentionally uncompressed; optimization is a separate later step.
await io.write(outputPath, targetDoc);

// Read back the serialized result and verify bind identity, skin structure, and
// clip presence before treating the render candidate as useful.
const checked = await io.read(outputPath);
const checkedRoot = checked.getRoot();
const checkedSkin = checkedRoot.listSkins()[0];
if (checkedRoot.listSkins().length !== 1 || checkedSkin.listJoints().length !== targetJoints.length
  || checkedRoot.listAnimations().length !== targetRoot.listAnimations().length) {
  throw new Error('verificação pós-export alterou skin, joints ou clips');
}
const checkedIBM = readAccessor(checkedSkin.getInverseBindMatrices());
let checkedResidual = 0;
for (const [index, joint] of checkedSkin.listJoints().entries()) {
  const inverse = new Matrix4().fromArray(checkedIBM.slice(index * 16, index * 16 + 16));
  checkedResidual = Math.max(checkedResidual, maxMatrixDelta(matrixWorld(joint).multiply(inverse), new Matrix4()));
}
if (checkedResidual > 1e-4) throw new Error(`bind novo falhou pós-export: residual=${checkedResidual.toExponential(2)}`);
console.log(`[repose] bones=${selected.size} vertices=${movedVertices} channels=${rebasedChannels}`);
console.log(`[repose] bind residual antes=${maxRestResidual.toExponential(2)} depois=${maxNewBindResidual.toExponential(2)} recheck=${checkedResidual.toExponential(2)}`);
console.log(`[repose] saída=${outputPath} bytes=${(await stat(outputPath)).size}; candidato apenas, QA visual pendente`);
