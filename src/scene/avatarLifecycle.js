/** Move a cache hit to the newest position in a Map-based LRU cache. */
export function touchCachedAvatar(cache, modelId) {
  if (!cache.has(modelId)) return null;
  const avatar = cache.get(modelId);
  cache.delete(modelId);
  cache.set(modelId, avatar);
  return avatar;
}

/** Evict least-recently-used avatars except identities that must stay alive. */
export function trimAvatarCache(cache, limit, protectedIds = [], onEvict = () => {}) {
  const protectedSet = new Set(protectedIds);
  const evicted = [];
  while (cache.size > limit) {
    const candidate = [...cache.keys()].find((modelId) => !protectedSet.has(modelId));
    if (candidate === undefined) break;
    const avatar = cache.get(candidate);
    cache.delete(candidate);
    evicted.push({ modelId: candidate, avatar });
    onEvict(avatar, candidate);
  }
  return evicted;
}

function collectTextures(value, textures, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  if (value.isTexture) {
    textures.add(value);
    return;
  }
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectTextures(child, textures, seen);
  }
}

/** Dispose GPU-backed resources owned by one patient instance, without a renderer. */
export function disposeAvatarResources({ root, model, mixer, beforeDispose } = {}) {
  beforeDispose?.();
  mixer?.stopAllAction?.();
  if (model) mixer?.uncacheRoot?.(model);

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  const seenTextureValues = new Set();
  root?.traverse?.((object) => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    if (object.skeleton?.dispose) skeletons.add(object.skeleton);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (!material?.dispose) continue;
      materials.add(material);
      collectTextures(material, textures, seenTextureValues);
    }
  });

  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root?.removeFromParent?.();
}

/** Make avatar disposal idempotent for cache eviction and error recovery. */
export function createAvatarDisposer(resources) {
  let disposed = false;
  return () => {
    if (disposed) return false;
    disposed = true;
    disposeAvatarResources(resources);
    return true;
  };
}
