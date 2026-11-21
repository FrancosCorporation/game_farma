// Apply only baked Walk kinematics; preserve exact mesh, bind, and other clips.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { readFile, access, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [input, output, file] = process.argv.slice(2);
if (!file || resolve(input) === resolve(output)) throw new Error('Usage: input.glb separate-output.glb bake.json');
try { await access(output); throw new Error('Output exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const bake = JSON.parse(await readFile(file, 'utf8'));
if (bake.times.length !== 241 || !bake.summary || Object.values(bake.summary).some(s => s.backwardSamples)) throw new Error('Invalid gait bake');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input), root = doc.getRoot();
const hash = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const changed = [];
const key = c => c.getTargetNode().getName().replaceAll(':', '') + '.' + ({ rotation: 'quaternion', translation: 'position' }[c.getTargetPath()] || c.getTargetPath());
const targets = new Set(Object.keys(bake.tracks));
const walk = root.listAnimations().find(a => a.getName() === 'Walk');
if (!walk || !Number.isFinite(bake.duration) || bake.duration <= 0) throw new Error('Missing Walk/duration');
const originalTimes = new Map(walk.listChannels().map(c => [key(c), Array.from(c.getSampler().getInput().getArray())]));
const sourceDuration = Math.max(...Array.from(originalTimes.values(), times => times.at(-1)));
const timeScale = bake.duration / sourceDuration;
const retimed = Math.abs(timeScale - 1) > 1e-6;

const signature = d => JSON.stringify({
  nodes: d.getRoot().listNodes().map(n => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale(), n.listChildren().map(c => c.getName())]),
  skins: d.getRoot().listSkins().map(s => [s.listJoints().map(j => j.getName()), hash(s.getInverseBindMatrices().getArray())]),
  meshes: d.getRoot().listMeshes().map(m => m.listPrimitives().map(p => [hash(p.getIndices().getArray()), p.listSemantics().map(s => [s, hash(p.getAttribute(s).getArray())])])),
  textures: d.getRoot().listTextures().map(t => hash(t.getImage())),
  clips: d.getRoot().listAnimations().map(a => [a.getName(), a.listChannels().filter(c => a.getName() !== 'Walk' || !targets.has(key(c))).map(c => [key(c), c.getSampler().getInterpolation(), a.getName() === 'Walk' && retimed ? 'retimed:checked-separately' : hash(c.getSampler().getInput().getArray()), hash(c.getSampler().getOutput().getArray())])]),
});
const original = signature(doc);
// Retime every Walk channel together; copying inputs and samplers avoids
// modifying shared accessors/samplers used by Idle or another animation.
if (retimed) {
  const inputs = new Map();
  for (const channel of walk.listChannels()) {
    if (targets.has(key(channel))) continue;
    const source = channel.getSampler(), input = source.getInput();
    if (!inputs.has(input)) {
      inputs.set(input, doc.createAccessor('WalkRetimed', root.listBuffers()[0]).setType('SCALAR')
        .setArray(new Float32Array(Array.from(input.getArray(), t => t * timeScale))));
    }
    const sampler = doc.createAnimationSampler().setInput(inputs.get(input))
      .setOutput(source.getOutput()).setInterpolation(source.getInterpolation());
    walk.addSampler(sampler); channel.setSampler(sampler);
  }
}

const times = doc.createAccessor('GaitTimes', root.listBuffers()[0]).setType('SCALAR').setArray(new Float32Array(bake.times));
for (const channel of walk.listChannels()) {
  const name = key(channel); if (!targets.has(name)) continue;
  const values = bake.tracks[name], size = channel.getTargetPath() === 'rotation' ? 4 : 3;
  if (values.length !== bake.times.length * size || values.some(v => !Number.isFinite(v))) throw new Error('Invalid track: ' + name);
  const data = new Float32Array(values);
  if (size === 4) for (let i = 0; i < bake.times.length; i++) {
    const q = data.subarray(i * 4, i * 4 + 4); if (Math.abs(Math.hypot(...q) - 1) > .001) throw new Error('Invalid quaternion');
    if (i && q.reduce((sum, v, k) => sum + v * data[(i - 1) * 4 + k], 0) < 0) for (let k = 0; k < 4; k++) q[k] *= -1;
  }
  const outputAccessor = doc.createAccessor(name + 'Gait', root.listBuffers()[0]).setType(size === 4 ? 'VEC4' : 'VEC3').setArray(data);
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(outputAccessor).setInterpolation('LINEAR');
  walk.addSampler(sampler); channel.setSampler(sampler); changed.push(name);
}
if (changed.length !== targets.size) throw new Error('Missing target channels');
const asset = root.getAsset(); asset.extras = { ...asset.extras, walkAdvance: bake.config.advance, walkSpeed: bake.config.advance / bake.duration, walkStartPhase: bake.config.walkStartPhase, walkCrossfadeWarp: false, walkCrossfadeSeconds: bake.config.walkCrossfadeSeconds, walkFootContact: false };
const staged = output + '.staging.glb'; await io.write(staged, doc);
const check = await io.read(staged);
if (signature(check) !== original) throw new Error('Unexpected change outside Walk target channels');
for (const c of check.getRoot().listAnimations().find(a => a.getName() === 'Walk').listChannels()) {
  if (!c.getSampler().getInput() || !c.getSampler().getOutput()) throw new Error('Invalid serialized channel');
  const values = c.getSampler().getInput().getArray();
  const expected = targets.has(key(c)) ? bake.times : originalTimes.get(key(c)).map(t => retimed ? t * timeScale : t);
  if (values.length !== expected.length || values.some((t, i) => !Number.isFinite(t) || Math.abs(t - expected[i]) > 1e-6)) throw new Error('Walk timestamp drift: ' + key(c));
}

await rename(staged, output);
const report = { input, output, changed, summary: bake.summary, config: bake.config, sourceDuration, duration: bake.duration, walkTimeScale: timeScale, unchangedWalkChannelValuesPreserved: true, meshBindRigOtherClipsUnchanged: true };
await writeFile(output + '.audit.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
