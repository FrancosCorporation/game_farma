import assert from 'node:assert/strict';
import { resolveQuality, shouldRenderFrame } from '../src/scene/qualitySettings.js';

const low = resolveQuality('low', { devicePixelRatio: 2 });
assert.equal(low.maxFps, 30);
assert.equal(low.pixelRatio, 1);
assert.equal(low.shadows, false);
assert.equal(low.postProcessing, false);

const balanced = resolveQuality('balanced', { devicePixelRatio: 2 });
assert.equal(balanced.maxFps, 60);
assert.equal(balanced.pixelRatio, 1.5);

const high = resolveQuality('high', { devicePixelRatio: 2 });
assert.equal(high.maxFps, 60);
assert.equal(high.pixelRatio, 2);

assert.equal(shouldRenderFrame(100, Number.NEGATIVE_INFINITY, 30), true, 'first frame renders immediately');
assert.equal(shouldRenderFrame(116, 100, 30), false, 'Leve skips frames before its 30 FPS interval');
assert.equal(shouldRenderFrame(133, 100, 30), true, 'Leve renders when its interval elapses');
assert.equal(shouldRenderFrame(117, 100, 60), true, 'balanced/high render when the 60 FPS interval elapses');
assert.equal(shouldRenderFrame(116, 100, 0), true, 'invalid cap does not stall rendering');

console.log('PASS quality settings: low preset caps rendering at 30 FPS without changing geometry; balanced/high allow 60 FPS');
