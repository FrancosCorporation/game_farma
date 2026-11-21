import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { verticalAxisCorrection } from '../src/scene/characterOrientation.js';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const assets = [
  'public/models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb',
  'public/models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb',
];

assert.equal(verticalAxisCorrection({ x: 0.6, y: 0.3, z: 1.7 }), -Math.PI / 2,
  'a runtime box with Z as its vertical axis must be rotated into Y-up');
assert.equal(verticalAxisCorrection({ x: 0.6, y: 1.7, z: 0.3 }), 0,
  'a runtime box already oriented Y-up must remain unchanged');

for (const path of assets) {
  const document = await io.read(path);
  const skinnedNodes = document.getRoot().listNodes().filter((node) => node.getSkin());
  const idleClip = document.getRoot().listAnimations().some((animation) => /^idle$/i.test(animation.getName()));
  assert.ok(skinnedNodes.length > 0, `${path} must contain a skinned character`);
  assert.ok(idleClip, `${path} must contain an Idle clip`);
  console.log(`PASS ${path}: ${skinnedNodes.length} skinned node(s), Idle clip; runtime orientation and dimensions are asserted by qa:pharmacy-props`);
}
