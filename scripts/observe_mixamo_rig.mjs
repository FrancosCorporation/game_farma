// Submit once from reviewed markers and record the official rig/monitor outcome.
// Usage: node scripts/observe_mixamo_rig.mjs reviewed-placement.json output.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MIXAMO_MARKERS, validateApprovedVisualReview } from './mixamo_marker_review.mjs';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';
const [placementPath, outputPath] = process.argv.slice(2);
if (!placementPath || !outputPath) throw new Error('Supply reviewed placement and a new result path');
if (existsSync(outputPath)) throw new Error('Result already exists; inspect it before another submission');
const placement = JSON.parse(readFileSync(placementPath, 'utf8'));
if (placement.reviewed !== true || placement.nextClicked !== false) throw new Error('Markers must be reviewed and not yet submitted');
const ids = MIXAMO_MARKERS.map(({ id }) => id);
if (!placement.targets || Object.keys(placement.targets).length !== 8 || ids.some(id => !Array.isArray(placement.targets[id]) || placement.targets[id].length !== 2 || placement.targets[id].some(v => !Number.isFinite(v)))) throw new Error('Expected eight finite marker centers');
if (!placement.overlay || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(placement.overlay[k])) || placement.overlay.width <= 0 || placement.overlay.height <= 0) throw new Error('Expected a finite reviewed overlay');
const visualReviewEvidence = validateApprovedVisualReview(placement);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const report = { placement: resolve(placementPath), visualReview: visualReviewEvidence, state: 'not-submitted', responses: [], uiNotices: [] };
let pending = [];
let page;
try {
  page = await resolveMixamoTaskPage(browser.contexts().flatMap((context) => context.pages()));
  if (!page) throw new Error('Task Mixamo tab is unavailable');
  await page.bringToFront();
  const overlay = await page.locator('.autorig-overlay').boundingBox();
  if (!overlay || ['x', 'y', 'width', 'height'].some(k => Math.abs(overlay[k] - placement.overlay[k]) > 2)) throw new Error('Overlay changed since review');
  if (await page.getByLabel('Use Symmetry', { exact: true }).isChecked().catch(() => true)) throw new Error('Use Symmetry was re-enabled after the independent point review');
  for (const id of ids) {
    const r = await page.locator(`#${id}`).boundingBox();
    const target = placement.targets[id];
    if (!r || !target || Math.hypot(r.x + r.width / 2 - target[0], r.y + r.height / 2 - target[1]) > 2) throw new Error(`${id}: placement changed since review`);
  }
  await page.evaluate(() => {
    window.__farmaRigUiObserver?.disconnect();
    window.__farmaRigUiNotices = [];
    let scheduled = false;
    const scan = () => {
      scheduled = false;
      // Visible status UI only; no cookies, storage, request headers or auth state.
      const selector = '[role="alert"],[class*="alert"],[class*="error"],[class*="danger"],[class*="notification"],[class*="toast"],[class*="growl"],[class*="noty"]';
      for (const el of document.querySelectorAll(selector)) {
        if (!el.getClientRects().length) continue;
        const text = el.innerText?.trim().slice(0, 800);
        if (!text || window.__farmaRigUiNotices.some(n => n.text === text) || window.__farmaRigUiNotices.length >= 30) continue;
        window.__farmaRigUiNotices.push({ text, elapsedAt: Date.now(), color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor });
      }
    };
    window.__farmaRigUiObserver = new MutationObserver(() => {
      if (!scheduled) { scheduled = true; setTimeout(scan, 30); }
    });
    window.__farmaRigUiObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    scan();
  });
  let jobPath;
  const onResponse = response => {
    const path = new URL(response.url()).pathname;
    if (!/^\/api\/v1\/characters\/[^/]+\/(rig|monitor)$/.test(path)) return;
    const task = (async () => {
      let body;
      try { body = await response.json(); } catch { return; }
      const base = path.replace(/\/(rig|monitor)$/, '');
      if (path.endsWith('/rig') && response.request().method() === 'PUT') jobPath = base;
      if (base !== jobPath) return;
      const row = { path, method: response.request().method(), http: response.status(), status: body.status };
      if (body.status === 'failed') row.message = String(body.job_result?.message || body.message || '').slice(0, 500);
      report.responses.push(row);
      if (body.status === 'failed') report.state = 'failed';
      writeFileSync(outputPath, JSON.stringify(report, null, 2));
    })();
    pending.push(task);
  };
  page.on('response', onResponse);
  // Persist before clicking: a timeout or interrupted client must not silently retry.
  report.state = 'submission-attempted';
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  placement.nextClicked = true;
  writeFileSync(placementPath, JSON.stringify(placement, null, 2));
  await page.locator('.modal').getByRole('button', { name: /^next$/i }).click();
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await Promise.allSettled(pending); pending = [];
    report.uiNotices = await page.evaluate(() => window.__farmaRigUiNotices || []);
    if (report.state === 'failed') break;
    if (await page.getByText('Review', { exact: true }).isVisible().catch(() => false)) { report.state = 'review-ready'; break; }
    await page.waitForTimeout(1000);
  }
  page.off('response', onResponse);
  await Promise.allSettled(pending);
  await page.waitForTimeout(250); // Let UI display the completed/failed job notice.
  report.uiNotices = await page.evaluate(() => window.__farmaRigUiNotices || []);
  if (report.state === 'submission-attempted') report.state = 'pending-or-timeout';
  try {
    report.screenshot = resolve(outputPath.replace(/\.json$/, '') + '-ui.png');
    await page.screenshot({ path: report.screenshot, timeout: 15000 });
  } catch (error) { report.screenshotError = String(error.message).slice(0, 200); }
  // Download behind the modal is deliberately not a success condition.
  console.log(JSON.stringify({ state: report.state, responses: report.responses.length, output: resolve(outputPath) }));
} catch (error) {
  report.clientError = String(error.message).slice(0, 500);
  throw error;
} finally {
  if (page) await page.evaluate(() => window.__farmaRigUiObserver?.disconnect()).catch(() => {});
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  await browser.close();
}
