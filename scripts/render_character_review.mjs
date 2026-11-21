// Render multiple poses through the same renderer and runtime clip sanitation.
// Usage: node scripts/render_character_review.mjs model.glb samples.json
// samples: [{ output, animation, phase, yaw, distance?, targetY?, cameraY?, offsets? }]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [model, spec] = process.argv.slice(2);
if (!model || !spec) throw new Error('Usage: node scripts/render_character_review.mjs model.glb samples.json');
const samples = JSON.parse(readFileSync(spec, 'utf8'));
if (!Array.isArray(samples) || !samples.length) throw new Error('samples must be a nonempty array');
const result = spawnSync(process.execPath, [new URL('./preview_character_glb.mjs', import.meta.url).pathname, resolve(model), resolve(samples[0].output), 'Rest', '0', '0'], {
  env: { ...process.env, PREVIEW_BATCH: resolve(spec) }, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
