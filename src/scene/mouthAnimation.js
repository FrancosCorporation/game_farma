/**
 * Current patient GLBs have no facial morph targets or jaw bones. Keep speech
 * animation disabled until an asset with a facial rig is integrated; a mesh
 * overlay cannot be attached convincingly to these heads.
 */
export function createMouthAnimation(root) {
  const diagnostics = {
    status: 'unavailable',
    reason: 'Current patient models have no facial morph targets or jaw bone; floating mouth overlay disabled.',
  };
  root.userData.speechMouth = diagnostics;

  return {
    diagnostics,
    start() {},
    setProgress() {},
    update() {},
    stop() {},
    dispose() {},
  };
}
