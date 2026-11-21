// Usage: node scripts/place_mixamo_markers.mjs targets.json [CDP endpoint] [output dir]
// Config: {"chin":[x,y],"larm":[x,y],"rarm":[x,y],...}; page pixels from reviewed screenshot.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createVisualReviewTemplate, validateFrontalMarkerSides } from './mixamo_marker_review.mjs';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';

const [config, endpoint = 'http://127.0.0.1:9222', output = '/tmp/mixamo-markers'] = process.argv.slice(2);
if (!config) throw new Error('Supply a reviewed targets.json; no universal anatomical coordinates.');
const ids = ['chin', 'larm', 'rarm', 'lelbow', 'relbow', 'lknee', 'rknee', 'groin'];
const targets = JSON.parse(readFileSync(config, 'utf8'));
if (Object.keys(targets).length !== 8 || ids.some(id => !Array.isArray(targets[id]) || targets[id].length !== 2 || targets[id].some(v => !Number.isFinite(v)))) {
  throw new Error('Expected eight anatomical markers with finite x,y page coordinates.');
}
validateFrontalMarkerSides(targets);
const url = new URL(endpoint);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('CDP must be loopback.');
const outputDir = resolve(output);
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.connectOverCDP(endpoint);
try {
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = await resolveMixamoTaskPage(pages);
  if (!page) throw new Error('Open Mixamo in the task-owned authenticated browser first.');
  await page.bringToFront();
  const overlay = await page.locator('.autorig-overlay').boundingBox();
  if (!overlay) throw new Error('Place markers is not open.');
  for (const [id, [x, y]] of Object.entries(targets)) {
    if (x <= overlay.x || x >= overlay.x + overlay.width || y <= overlay.y || y >= overlay.y + overlay.height) throw new Error(`${id}: target outside overlay`);
    if (!await page.locator(`#${id}`).isVisible()) throw new Error(`${id}: marker unavailable`);
  }
  await page.getByLabel('Use Symmetry', { exact: true }).uncheck();
  // Keep evidence to the rig viewport; a full-page capture can include account UI.
  await page.screenshot({ path: join(outputDir, 'before.png'), clip: overlay });
  const markerScreenshots = {};
  for (const id of ids) {
    const [x, y] = targets[id];
    const r = await page.locator(`#${id}`).boundingBox();
    const from = [r.x + r.width / 2, r.y + r.height / 2];
    await page.mouse.move(...from);
    await page.mouse.down();
    for (let i = 1; i <= 22; i++) {
      const t = i / 22, s = t * t * (3 - 2 * t);
      await page.mouse.move(from[0] + (x - from[0]) * s, from[1] + (y - from[1]) * s);
    }
    await page.mouse.up();
    const placed = await page.locator(`#${id}`).boundingBox();
    if (Math.hypot(placed.x + placed.width / 2 - x, placed.y + placed.height / 2 - y) > 2) throw new Error(`${id}: drop did not reach target`);
    const screenshotPath = join(outputDir, `${id}.png`);
    await page.mouse.move(overlay.x + 12, overlay.y + 12);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(120);
    const markerClip = {
      x: Math.max(overlay.x, x - 90),
      y: Math.max(overlay.y, y - 90),
      width: Math.min(180, overlay.x + overlay.width - Math.max(overlay.x, x - 90)),
      height: Math.min(180, overlay.y + overlay.height - Math.max(overlay.y, y - 90)),
    };
    await page.screenshot({ path: screenshotPath, clip: markerClip });
    markerScreenshots[id] = {
      path: screenshotPath,
      sha256: createHash('sha256').update(readFileSync(screenshotPath)).digest('hex'),
    };
  }
  // This is the single image the reviewer inspects for all eight final positions.
  await page.mouse.move(overlay.x + 12, overlay.y + 12);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
  const finalScreenshotPath = join(outputDir, 'markers-review.png');
  await page.screenshot({ path: finalScreenshotPath, clip: overlay });
  const placement = {
    config: resolve(config),
    overlay,
    targets,
    reviewed: false,
    nextClicked: false,
    evidence: {
      finalScreenshot: {
        path: finalScreenshotPath,
        sha256: createHash('sha256').update(readFileSync(finalScreenshotPath)).digest('hex'),
      },
      markerScreenshots,
    },
  };
  writeFileSync(join(outputDir, 'placement.json'), JSON.stringify(placement, null, 2) + '\n');
  writeFileSync(join(outputDir, 'visual-review.template.json'), JSON.stringify(createVisualReviewTemplate(placement), null, 2) + '\n');
  console.log(`Eight markers placed; final image and eight per-marker captures saved in ${outputDir}. Inspect every marker and complete visual-review.template.json before approving or clicking Next.`);
} finally {
  await browser.close(); // Disconnect CDP client; keep the host browser/profile alive.
}
