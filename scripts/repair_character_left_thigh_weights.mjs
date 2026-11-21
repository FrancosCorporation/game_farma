// Repair opposite-thigh spill and a discontinuous left knee weight transition.
// Coordinates come from the actual bind deformation, normalized like the viewer.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error('Usage: input.glb separate-output.glb');
try { await access(output); throw new Error('Output exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input), root = doc.getRoot();
const nodes = root.listNodes().filter(n => n.getSkin() && n.getMesh());
if (nodes.length !== 1 || root.listSkins().length !== 1) throw new Error('Expected one skinned mesh');
const node = nodes[0], skin = node.getSkin(), primitives = node.getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error('Expected one primitive');
const p = primitives[0], pos = p.getAttribute('POSITION'), joints = p.getAttribute('JOINTS_0'), weights = p.getAttribute('WEIGHTS_0');
if (p.getAttribute('WEIGHTS_1') || !(weights.getArray() instanceof Uint16Array) || !weights.getNormalized()) throw new Error('Expected normalized Uint16 weights');
const names = skin.listJoints().map(j => j.getName()), left = names.indexOf('mixamorig:LeftUpLeg'), right = names.indexOf('mixamorig:RightUpLeg'), lower = names.indexOf('mixamorig:LeftLeg');
if (left < 0 || right < 0 || lower < 0) throw new Error('Missing leg joints');
const hash = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const signature = d => JSON.stringify({
  asset: d.getRoot().getAsset(),
  nodes: d.getRoot().listNodes().map(n => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale(), n.listChildren().map(c => c.getName())]),
  skins: d.getRoot().listSkins().map(s => [s.listJoints().map(j => j.getName()), hash(s.getInverseBindMatrices().getArray())]),
  clips: d.getRoot().listAnimations().map(a => [a.getName(), a.listChannels().map(c => [c.getTargetNode().getName(), c.getTargetPath(), c.getSampler().getInterpolation(), hash(c.getSampler().getInput().getArray()), hash(c.getSampler().getOutput().getArray())])]),
  attrs: d.getRoot().listMeshes().flatMap(m => m.listPrimitives().map(p => [hash(p.getIndices().getArray()), p.listSemantics().filter(s => s !== 'WEIGHTS_0').map(s => [s, hash(p.getAttribute(s).getArray())])])),
  materials: d.getRoot().listMaterials().map(m => [m.getName(), m.getBaseColorFactor(), m.getRoughnessFactor(), m.getMetallicFactor(), m.getDoubleSided()]),
  textures: d.getRoot().listTextures().map(t => hash(t.getImage())),
});
const before = signature(doc), sourceWeights = weights.getArray(), result = sourceWeights.slice();
const ibm = skin.getInverseBindMatrices(), matrices = skin.listJoints().map((j, i) => new THREE.Matrix4().fromArray(j.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ibm.getElement(i, []))));
const rest = [], box = new THREE.Box3(), rotate = new THREE.Matrix4();
for (let i = 0; i < pos.getCount(); i++) {
  const point = new THREE.Vector3().fromArray(pos.getElement(i, [])), js = joints.getElement(i, []), ws = weights.getElement(i, []), v = new THREE.Vector3();
  for (let k = 0; k < 4; k++) v.addScaledVector(point.clone().applyMatrix4(matrices[js[k]]), ws[k]);
  rest.push(v); box.expandByPoint(v);
}
if (box.getSize(new THREE.Vector3()).z > box.getSize(new THREE.Vector3()).y * 1.5) rotate.makeRotationX(-Math.PI / 2);
box.applyMatrix4(rotate); const center = box.getCenter(new THREE.Vector3()), scale = 1.72 / box.getSize(new THREE.Vector3()).y;
const smooth = (v, a, b) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
let changed = 0, kneeChanged = 0, transferred = 0, maxTransfer = 0, maxRestDelta = 0;
const kneePoint = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[lower].getWorldMatrix())).applyMatrix4(rotate);
const kneeY = (kneePoint.y - box.min.y) * scale;
const mask = [], edited = [];
for (let i = 0; i < pos.getCount(); i++) {
  const v = rest[i].clone().applyMatrix4(rotate); v.set((v.x - center.x) * scale, (v.y - box.min.y) * scale, (v.z - center.z) * scale);
  const js = joints.getElement(i, []), ws = weights.getElement(i, []);
  const ownLeg = js.reduce((sum, j, k) => sum + (/mixamorig:Left(UpLeg|Leg)$/.test(names[j]) ? ws[k] : 0), 0);
  const pants = ownLeg > .5 && v.x > .008 && v.y > .32 && v.y < .94;
  mask.push(pants ? 1 : 0);
  const ls = js.indexOf(left), rs = js.indexOf(right), ks = js.indexOf(lower);
  if (!pants || ls < 0) continue;
  const amount = smooth(v.x, .008, .035) * smooth(v.y, .68, .73) * (1 - smooth(v.y, .81, .90));
  const units = rs < 0 ? 0 : Math.round(sourceWeights[i * 4 + rs] * amount);
  if (units) { result[i * 4 + rs] -= units; result[i * 4 + ls] += units; }
  let kneeDelta = 0;
  if (ks >= 0 && ws[ks] + ws[ls] > .999) {
    // Fitted proxy + preserved donor calf weights introduced a ~0.5 jump
    // across short edges. Replace only the joint band, keeping outer weights.
    const blend = smooth(v.y, kneeY - .08, kneeY - .055) * (1 - smooth(v.y, kneeY + .055, kneeY + .08));
    const pair = result[i * 4 + ls] + result[i * 4 + ks];
    const target = pair * (1 - smooth(v.y, kneeY - .075, kneeY + .075));
    kneeDelta = Math.round(blend * (target - result[i * 4 + ks]));
    result[i * 4 + ks] += kneeDelta; result[i * 4 + ls] -= kneeDelta;
    if (kneeDelta) kneeChanged++;
  }
  if (!units && !kneeDelta) continue;
  const point = new THREE.Vector3().fromArray(pos.getElement(i, [])), delta = new THREE.Vector3();
  for (let k = 0; k < 4; k++) delta.addScaledVector(point.clone().applyMatrix4(matrices[js[k]]), (result[i * 4 + k] - sourceWeights[i * 4 + k]) / 65535);
  maxRestDelta = Math.max(maxRestDelta, delta.length() * scale); changed++; transferred += units / 65535; maxTransfer = Math.max(maxTransfer, units / 65535);
  edited.push(i);
}
if (!changed || maxRestDelta > 1e-6) throw new Error(`Invalid edit: changed=${changed}, restDelta=${maxRestDelta}`);
weights.setArray(result);
if (signature(doc) !== before) throw new Error('Unexpected invariant change');
const staged = output + '.staging.glb'; await io.write(staged, doc);
const check = await io.read(staged);
if (signature(check) !== before || hash(check.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('WEIGHTS_0').getArray()) !== hash(result)) throw new Error('Serialization changed invariants');
await rename(staged, output);
const report = { input, output, sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex'), changed, kneeChanged, kneeY, transferred, maxTransfer, runtimeScale: scale, maxRestDeltaMeters: maxRestDelta, rightLegUnchanged: true, geometryBindClipsMaterialsUnchanged: true, edited };
await writeFile(output + '.audit.json', JSON.stringify(report, null, 2));
await writeFile(output + '.mask.json', JSON.stringify({ sourceSha256: createHash('sha256').update(await readFile(output)).digest('hex'), runtimeScale: scale, vertexCount: pos.getCount(), mask }));
console.log(JSON.stringify({ ...report, edited: undefined }));
