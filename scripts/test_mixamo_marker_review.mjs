import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createVisualReviewTemplate, MIXAMO_MARKERS, sha256File, validateFrontalMarkerSides, validateVisualReview } from './mixamo_marker_review.mjs';

const root = mkdtempSync(join(tmpdir(), 'mixamo-marker-review-'));
try {
  const evidenceDir = join(root, 'evidence');
  mkdirSync(evidenceDir);
  const screenshotPath = join(evidenceDir, 'markers-review.png');
  writeFileSync(screenshotPath, 'final screenshot bytes');
  const markerScreenshots = Object.fromEntries(MIXAMO_MARKERS.map(({ id }) => {
    const path = join(evidenceDir, `${id}.png`);
    writeFileSync(path, `screenshot for ${id}`);
    return [id, { path, sha256: sha256File(path) }];
  }));
  const placement = {
    targets: {
      chin: [450, 100],
      larm: [600, 200], rarm: [300, 200],
      lelbow: [600, 250], relbow: [300, 250],
      lknee: [600, 350], rknee: [300, 350],
      groin: [450, 300],
    },
    reviewed: false,
    nextClicked: false,
    evidence: {
      finalScreenshot: { path: screenshotPath, sha256: sha256File(screenshotPath) },
      markerScreenshots,
    },
  };
  const reviewPath = join(root, 'visual-review.json');
  const review = createVisualReviewTemplate(placement);
  review.reviewer = 'reviewer de teste';
  review.reviewedAt = new Date().toISOString();
  review.markers = Object.fromEntries(MIXAMO_MARKERS.map(({ id, label }) => [id, {
    label,
    anatomicalLandmarkMatched: true,
    notes: `Centro visual conferido: ${id}`,
  }]));
  writeFileSync(reviewPath, JSON.stringify(review));

  assert.equal(validateVisualReview(placement, review, screenshotPath, reviewPath).screenshotSha256, sha256File(screenshotPath));
  assert.throws(() => validateFrontalMarkerSides({ ...placement.targets, larm: placement.targets.rarm }), /anatomical left must be on screen-right/);
  const duplicatedEvidence = structuredClone(placement);
  const duplicatePath = join(evidenceDir, 'duplicate.png');
  writeFileSync(duplicatePath, 'screenshot for chin');
  duplicatedEvidence.evidence.markerScreenshots.larm = {
    path: duplicatePath,
    sha256: sha256File(duplicatePath),
  };
  assert.throws(() => validateVisualReview(duplicatedEvidence, review, screenshotPath, reviewPath), /screenshot is duplicated/);
  const unchecked = structuredClone(review);
  unchecked.markers.rknee.anatomicalLandmarkMatched = false;
  assert.throws(() => validateVisualReview(placement, unchecked, screenshotPath, reviewPath), /rknee/);
  const changedTargets = structuredClone(review);
  changedTargets.placementTargets.groin[1] += 1;
  assert.throws(() => validateVisualReview(placement, changedTargets, screenshotPath, reviewPath), /coordinates differ/);
  writeFileSync(screenshotPath, 'replaced final screenshot');
  assert.throws(() => validateVisualReview(placement, review, screenshotPath, reviewPath), /screenshot hash/);
  console.log('Mixamo visual review gate tests passed (all eight required; coordinates and screenshot are sealed).');
} finally {
  rmSync(root, { recursive: true, force: true });
}
