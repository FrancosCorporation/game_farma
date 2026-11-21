// Make a separate test candidate with adjusted root-walk metadata.
// Usage: node scripts/tune_character_walk_metadata.mjs <input.glb> <output.glb> <walkSpeed> <walkAdvance> [footContact=on|off] [walkStartPhase=0..0.999]
import { access } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, speedArg, advanceArg, footContactArg, walkStartPhaseArg] = process.argv.slice(2);
if (!input || !output || !speedArg || !advanceArg || input === '--help') {
  console.log('Uso: node scripts/tune_character_walk_metadata.mjs <input.glb> <output.glb> <walkSpeed> <walkAdvance> [footContact=on|off] [walkStartPhase=0..0.999]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser um arquivo separado');
const walkSpeed = Number(speedArg);
const walkAdvance = Number(advanceArg);
if (footContactArg && !['on', 'off'].includes(footContactArg)) throw new Error('footContact opcional deve ser on ou off');
const walkStartPhase = walkStartPhaseArg === undefined ? null : Number(walkStartPhaseArg);
if (walkStartPhase !== null && !(walkStartPhase >= 0 && walkStartPhase < 1)) throw new Error('walkStartPhase deve ficar em [0,1)');
if (!(walkSpeed >= 0.5 && walkSpeed <= 2.5)) throw new Error('walkSpeed deve ficar entre 0,5 e 2,5 m/s');
if (!(walkAdvance >= 0.3 && walkAdvance <= 2.5)) throw new Error('walkAdvance deve ficar entre 0,3 e 2,5 m/loop');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const asset = document.getRoot().getAsset();
asset.extras = { ...(asset.extras || {}), walkSpeed, walkAdvance };
if (footContactArg) asset.extras.walkFootContact = footContactArg === 'on';
if (walkStartPhase !== null) asset.extras.walkStartPhase = walkStartPhase;
await io.write(output, document);
console.log(JSON.stringify({ input, output, walkSpeed, walkAdvance, walkStartPhase: asset.extras.walkStartPhase ?? null, walkFootContact: asset.extras.walkFootContact ?? 'runtime default (off)', cycleSeconds: Number((walkAdvance / walkSpeed).toFixed(3)) }, null, 2));
