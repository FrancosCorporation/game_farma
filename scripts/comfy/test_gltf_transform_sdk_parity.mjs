import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = path.join(root, 'scripts/comfy/gltf_transform_sdk.mjs');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'farmacheck-sdk-parity-'));
const io = new NodeIO(globalThis.fetch)
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);

const fixtures = [
  {
    id: 'clara-static',
    file: 'public/models/candidates/clara_cefaleia_mesh_v001.glb',
    inputSha256: '1e70decfac14b706324e3f4493bc1500709c6f97e63743f56c9a61818234187e',
    stages: [
      ['simplify', ['--ratio', '1', '--error', '0.01'], 'e071f3c514c15cce650f9c8543cc52925db5cb9398926b8bc8c41d004ac39dd9'],
      ['resize', ['--width', '2048', '--height', '2048'], 'a6737c5d332299485cd6d8f5e8b7beb1a836d34e9411fceaa092ef6df7f4d926'],
      ['optimize', ['--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '2048'], 'bf8803cdc37526428cb3dd8da19101eba15f6ea757162969db3bd53126193159'],
    ],
  },
  {
    id: 'clara-walk',
    file: 'public/models/candidates/clara_cefaleia_walk_v001.glb',
    inputSha256: '94f770ee9a28436c1422a75842acc92bd8faa29ea3f61d48ca4181629a820fd7',
    stages: [
      ['simplify', ['--ratio', '1', '--error', '0.01'], '92d50cc7608bf90a03df270753eb1b33e854dcbbc1c3025e542674b0d0ec99b9'],
      ['resize', ['--width', '2048', '--height', '2048'], '152f08bffc3c47a1bcaef999732c751bfaed10206e658c4afcd2f62aadbecffb'],
      ['optimize', ['--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '2048'], '7fb5db98fc354a67d3bdab9ecaaca317e8e199c6d7fbd35437b857247065fd0d'],
    ],
  },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readGlbJson(buffer) {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'glTF', 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB v2');
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, 'JSON chunk type');
  return {
    document: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim()),
    binaryOffset: 20 + jsonLength + 8,
  };
}

async function inverseBindValues(file) {
  const document = await io.read(file);
  const accessor = document.getRoot().listSkins()[0]?.getInverseBindMatrices();
  assert.ok(accessor, 'skin has inverse bind matrices');
  return Array.from(accessor.getArray());
}

function motionSummary(document) {
  return (document.animations || []).map((animation) => {
    const durations = animation.samplers.map((sampler) => {
      const input = document.accessors[sampler.input];
      return input.max?.[0] ?? null;
    });
    return {
      name: animation.name,
      channels: animation.channels.length,
      durations,
    };
  });
}

try {
  for (const fixture of fixtures) {
    const input = path.join(root, fixture.file);
    const inputBuffer = await readFile(input);
    assert.equal(sha256(inputBuffer), fixture.inputSha256, `${fixture.id} fixture hash`);
    let previous = input;
    const outputs = [];

    for (const [command, args, expectedSha256] of fixture.stages) {
      const output = path.join(scratch, `${fixture.id}-${command}.glb`);
      const result = spawnSync(process.execPath, [sdk, command, previous, output, ...args], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${fixture.id}/${command} failed: ${result.stderr || result.stdout}`);
      assert.doesNotMatch(`${result.stdout || ''}\n${result.stderr || ''}`, /Instancing is not currently supported for animated models/i,
        `${fixture.id}/${command} must not emit the animated-instancing warning`);
      const bytes = await readFile(output);
      assert.equal(sha256(bytes), expectedSha256, `${fixture.id}/${command} matches frozen CLI parity output`);
      outputs.push({ bytes, parsed: readGlbJson(bytes) });
      previous = output;
    }

    const { bytes: finalBytes, parsed: finalGlb } = outputs.at(-1);
    const finalDocument = finalGlb.document;
    const source = readGlbJson(inputBuffer);
    if (fixture.id === 'clara-static') {
      assert.equal(finalDocument.skins?.length || 0, 0);
      assert.equal(finalDocument.animations?.length || 0, 0);
    } else {
      assert.deepEqual(finalDocument.asset.extras, source.document.asset.extras, 'runtime metadata is preserved');
      assert.equal(finalDocument.skins.length, source.document.skins.length);
      assert.equal(finalDocument.skins[0].joints.length, 57, 'all 57 joints are preserved');
      assert.deepEqual(
        finalDocument.skins[0].joints.map((index) => finalDocument.nodes[index]?.name),
        source.document.skins[0].joints.map((index) => source.document.nodes[index]?.name),
        'joint identity and order are preserved',
      );
      assert.deepEqual(await inverseBindValues(previous), await inverseBindValues(input),
        'decoded inverse bind matrices are unchanged');
      assert.deepEqual(motionSummary(finalDocument), motionSummary(source.document),
        'Walk/Idle names, channels and durations are unchanged');
      assert.deepEqual(finalDocument.animations.map((clip) => clip.channels.length), [23, 23]);
      for (const extension of ['EXT_meshopt_compression', 'EXT_texture_webp']) {
        assert.ok(finalDocument.extensionsUsed.includes(extension), `${extension} is present`);
      }
    }
    console.log(`PASS ${fixture.id}: simplify/resize/optimize byte parity and GLB contracts`);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log('✔ glTF Transform SDK parity: static and animated fixtures');
