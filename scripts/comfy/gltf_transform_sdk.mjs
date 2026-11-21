#!/usr/bin/env node
/**
 * CLI-compatible subset for scripts/comfy/finalize_assets.py.
 * Implemented against glTF Transform 4.5.1; unknown commands/options fail closed.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  JOIN_DEFAULTS,
  PALETTE_DEFAULTS,
  PRUNE_DEFAULTS,
  SIMPLIFY_DEFAULTS,
  TextureResizeFilter,
  dedup,
  flatten,
  instance,
  join,
  meshopt,
  palette,
  prune,
  resample,
  simplify,
  sparse,
  textureCompress,
  unpartition,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { ready as resampleReady, resample as resampleWASM } from 'keyframe-resample';

function parse(argv) {
  const [command, input, output, ...rest] = argv;
  if (!command || !input || !output) {
    throw new Error('uso: gltf_transform_sdk.mjs <simplify|resize|optimize> <input.glb> <output.glb> [opções]');
  }
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!key.startsWith('--')) throw new Error(`argumento não reconhecido: ${key}`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`valor ausente para ${key}`);
    if (Object.hasOwn(options, key)) throw new Error(`opção duplicada: ${key}`);
    options[key] = value;
    i++;
  }
  const allowed = {
    simplify: new Set(['--ratio', '--error']),
    resize: new Set(['--width', '--height']),
    optimize: new Set(['--compress', '--texture-compress', '--texture-size']),
  }[command];
  if (!allowed) throw new Error(`comando não suportado: ${command}`);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`opção não suportada para ${command}: ${key}`);
  }
  return { command, input, output, options };
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} deve ser inteiro positivo`);
  return parsed;
}

function finiteNumber(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} fora do intervalo`);
  return parsed;
}

if (['--help', '-h'].includes(process.argv[2])) {
  console.log('uso: gltf_transform_sdk.mjs <simplify|resize|optimize> <input.glb> <output.glb> [opções]');
  process.exit(0);
}

function updateMetadata(document) {
  const root = document.getRoot();
  const xmpExtension = root.listExtensionsUsed().find((ext) => ext.extensionName === 'KHR_xmp_json_ld');
  // Match glTF Transform CLI: do not add XMP to documents that did not use it.
  if (!xmpExtension) return;
  const packet = root.getExtension('KHR_xmp_json_ld') || xmpExtension.createPacket();
  const date = new Date().toISOString().substring(0, 10);
  packet
    .setContext({ ...packet.getContext(), xmp: 'http://ns.adobe.com/xap/1.0/' })
    .setProperty('xmp:ModifyDate', date)
    .setProperty('xmp:MetadataDate', date);
}

const [dracoDecoder, dracoEncoder] = await Promise.all([
  draco3d.createDecoderModule(),
  draco3d.createEncoderModule(),
]);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, resampleReady]);

const io = new NodeIO(globalThis.fetch)
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': dracoDecoder,
    'draco3d.encoder': dracoEncoder,
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

async function runSession({ command, input, output, options }) {
  const document = await io.read(input);
  for (const extensionName of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
    if (document.hasExtension(extensionName)) document.disposeExtension(extensionName);
  }

  if (command === 'simplify') {
    await document.transform(simplify({
      simplifier: MeshoptSimplifier,
      ratio: finiteNumber(options['--ratio'] ?? String(SIMPLIFY_DEFAULTS.ratio), '--ratio', 0, 1),
      error: finiteNumber(options['--error'] ?? String(SIMPLIFY_DEFAULTS.error), '--error', 0, 1),
      lockBorder: SIMPLIFY_DEFAULTS.lockBorder,
    }));
  } else if (command === 'resize') {
    const width = positiveInteger(options['--width'], '--width');
    const height = positiveInteger(options['--height'], '--height');
    await document.transform(textureCompress({
      encoder: sharp,
      resize: [width, height],
      resizeFilter: TextureResizeFilter.LANCZOS3,
      pattern: null,
    }));
  } else {
    const compress = options['--compress'] ?? 'meshopt';
    const textureFormat = options['--texture-compress'] ?? 'auto';
    const textureSize = positiveInteger(options['--texture-size'] ?? '2048', '--texture-size');
    if (compress !== 'meshopt') throw new Error(`--compress ${compress} não é suportado`);
    if (!['webp', 'avif', 'auto', 'ktx2'].includes(textureFormat)) {
      throw new Error(`--texture-compress ${textureFormat} não é suportado`);
    }

    // gltf-transform CLI 4.5.1 optimize defaults, preserving its transform order.
    await document.transform(dedup());
    // The CLI's transform is a no-op for animated models and emits a warning.
    // Skip it explicitly for documents with clips so the SDK route stays quiet
    // while preserving the same bytes and never inventing mesh instancing.
    if (document.getRoot().listAnimations().length === 0) {
      await document.transform(instance({ min: 5 }));
    }
    await document.transform(palette({ min: PALETTE_DEFAULTS.min }));
    await document.transform(flatten());
    await document.transform(join({
      keepNamed: JOIN_DEFAULTS.keepNamed,
      keepMeshes: JOIN_DEFAULTS.keepMeshes,
    }));
    await document.transform(weld());
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ...SIMPLIFY_DEFAULTS }));
    await document.transform(resample({ ready: resampleReady, resample: resampleWASM }));
    await document.transform(prune({
      ...PRUNE_DEFAULTS,
      keepAttributes: false,
      keepIndices: false,
      keepLeaves: false,
      keepSolidTextures: false,
    }));
    await document.transform(sparse());
    await document.transform(textureCompress({
      encoder: sharp,
      resize: [textureSize, textureSize],
      targetFormat: textureFormat === 'auto' ? undefined : textureFormat,
      limitInputPixels: true,
    }));
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  }

  await document.transform(updateMetadata);
  await document.transform(unpartition());
  await io.write(output, document);
}

try {
  await runSession(parse(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
