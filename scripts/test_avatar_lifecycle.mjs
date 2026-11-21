import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatarDisposer, touchCachedAvatar, trimAvatarCache } from '../src/scene/avatarLifecycle.js';

// LRU cache: touching promotes an entry, and evictions spare the mounted identity.
const removed = [];
const cache = new Map([
  ['ana', { id: 'ana' }],
  ['marina', { id: 'marina' }],
  ['jose', { id: 'jose' }],
]);
assert.equal(touchCachedAvatar(cache, 'marina').id, 'marina');
assert.deepEqual([...cache.keys()], ['ana', 'jose', 'marina']);
trimAvatarCache(cache, 2, ['marina'], (avatar) => removed.push(avatar.id));
assert.deepEqual([...cache.keys()], ['jose', 'marina']);
assert.deepEqual(removed, ['ana']);
assert.equal(touchCachedAvatar(cache, 'marina').id, 'marina');
assert.deepEqual([...cache.keys()], ['jose', 'marina']);

// Simulate many distinct case swaps: residency stays bounded at two entries.
const stressCache = new Map();
const disposeCountsById = new Map();
let activeId = null;
for (let index = 0; index < 40; index++) {
  const modelId = `patient-${index}`;
  stressCache.set(modelId, { id: modelId });
  const keep = [activeId, modelId].filter(Boolean);
  trimAvatarCache(stressCache, 2, keep, (avatar) => {
    disposeCountsById.set(avatar.id, (disposeCountsById.get(avatar.id) || 0) + 1);
  });
  activeId = modelId;
  trimAvatarCache(stressCache, 2, [activeId], (avatar) => {
    disposeCountsById.set(avatar.id, (disposeCountsById.get(avatar.id) || 0) + 1);
  });
  assert.ok(stressCache.size <= 2);
}
assert.equal(stressCache.has(activeId), true);
assert.ok([...disposeCountsById.values()].every((count) => count === 1));
const cachedAgain = [...stressCache.keys()][0];
assert.equal(touchCachedAvatar(stressCache, cachedAgain).id, cachedAgain);
activeId = cachedAgain;
trimAvatarCache(stressCache, 2, [activeId]);
assert.ok(stressCache.size <= 2);

// Resource cleanup is CPU-only, deduplicates shared resources, and is idempotent.
const scene = new THREE.Scene();
const root = new THREE.Group();
const model = new THREE.Group();
const geometry = new THREE.BufferGeometry();
const texture = new THREE.Texture();
const material = new THREE.MeshBasicMaterial({ map: texture });
const skeleton = { disposeCount: 0, dispose() { this.disposeCount++; } };
const firstMesh = new THREE.Mesh(geometry, material);
const secondMesh = new THREE.SkinnedMesh(geometry, material);
secondMesh.skeleton = skeleton;
const disposeCounts = { geometry: 0, material: 0, texture: 0, mixerStop: 0, uncache: 0, before: 0 };
geometry.addEventListener('dispose', () => disposeCounts.geometry++);
material.addEventListener('dispose', () => disposeCounts.material++);
texture.addEventListener('dispose', () => disposeCounts.texture++);
scene.add(root);
root.add(model, firstMesh, secondMesh);
const disposer = createAvatarDisposer({
  root,
  model,
  mixer: {
    stopAllAction() { disposeCounts.mixerStop++; },
    uncacheRoot(target) { assert.equal(target, model); disposeCounts.uncache++; },
  },
  beforeDispose() { disposeCounts.before++; },
});
assert.equal(disposer(), true);
assert.equal(disposer(), false);
assert.deepEqual(disposeCounts, {
  geometry: 1, material: 1, texture: 1, mixerStop: 1, uncache: 1, before: 1,
});
assert.equal(skeleton.disposeCount, 1);
assert.equal(root.parent, null);

console.log('PASS: cache LRU e descarte idempotente de recursos de avatar (CPU-only)');
