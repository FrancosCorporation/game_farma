import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MIXAMO_MARKERS = [
  ['chin', 'queixo (ciano)'],
  ['larm', 'pulso anatômico esquerdo (verde)'],
  ['rarm', 'pulso anatômico direito (verde)'],
  ['lelbow', 'cotovelo anatômico esquerdo (amarelo)'],
  ['relbow', 'cotovelo anatômico direito (amarelo)'],
  ['lknee', 'centro do joelho anatômico esquerdo (laranja)'],
  ['rknee', 'centro do joelho anatômico direito (laranja)'],
  ['groin', 'junção central da virilha (rosa)'],
].map(([id, label]) => ({ id, label }));

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function validateFrontalMarkerSides(targets) {
  const pairs = [
    ['larm', 'rarm', 'pulsos'],
    ['lelbow', 'relbow', 'cotovelos'],
    ['lknee', 'rknee', 'joelhos'],
  ];
  for (const [anatomicalLeft, anatomicalRight, label] of pairs) {
    if (!Array.isArray(targets?.[anatomicalLeft]) || !Array.isArray(targets?.[anatomicalRight])
        || targets[anatomicalLeft].length !== 2 || targets[anatomicalRight].length !== 2
        || !targets[anatomicalLeft].every(Number.isFinite) || !targets[anatomicalRight].every(Number.isFinite)) {
      throw new Error(`Frontal marker side validation requires finite ${label} coordinates.`);
    }
    if (targets[anatomicalLeft][0] <= targets[anatomicalRight][0]) {
      throw new Error(`Frontal view side mismatch for ${label}: anatomical left must be on screen-right.`);
    }
  }
}

export function createVisualReviewTemplate(placement) {
  return {
    schemaVersion: 1,
    reviewer: '',
    reviewedAt: '',
    placementTargets: structuredClone(placement.targets),
    screenshot: structuredClone(placement.evidence.finalScreenshot),
    markers: Object.fromEntries(MIXAMO_MARKERS.map(({ id, label }) => [id, {
      label,
      anatomicalLandmarkMatched: false,
      notes: '',
    }])),
  };
}

export function validateVisualReview(placement, review, screenshotPath, reviewPath) {
  const fail = message => { throw new Error(`Visual review invalid: ${message}`); };
  if (placement.reviewed !== false || placement.nextClicked !== false) fail('placement must still be unreviewed and unsubmitted');
  if (review?.schemaVersion !== 1) fail('unsupported review schema');
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) fail('reviewer is required');
  if (typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))) fail('review timestamp is required');
  if (JSON.stringify(review.placementTargets) !== JSON.stringify(placement.targets)) fail('review coordinates differ from the captured placement');
  try { validateFrontalMarkerSides(placement.targets); } catch (error) { fail(error.message); }

  const evidence = placement.evidence?.finalScreenshot;
  if (!evidence?.path || !evidence?.sha256) fail('final screenshot evidence is missing');
  if (resolve(evidence.path) !== resolve(screenshotPath)) fail('review references a different screenshot');
  const actualScreenshotHash = sha256File(screenshotPath);
  if (actualScreenshotHash !== evidence.sha256 || review.screenshot?.sha256 !== actualScreenshotHash) fail('reviewed screenshot hash does not match the captured image');
  if (resolve(review.screenshot?.path || '') !== resolve(screenshotPath)) fail('review screenshot path differs from captured evidence');

  const recordedEvidence = placement.evidence.markerScreenshots || {};
  const markerPaths = new Set();
  const markerHashes = new Set();
  for (const { id } of MIXAMO_MARKERS) {
    const markerEvidence = recordedEvidence[id];
    if (!markerEvidence?.path || !markerEvidence?.sha256) fail(`${id}: per-marker screenshot is missing`);
    const markerPath = resolve(markerEvidence.path);
    if (markerPaths.has(markerPath)) fail(`${id}: per-marker screenshot path is duplicated`);
    markerPaths.add(markerPath);
    const markerHash = sha256File(markerEvidence.path);
    if (markerHash !== markerEvidence.sha256) fail(`${id}: per-marker screenshot changed`);
    if (markerHashes.has(markerHash)) fail(`${id}: per-marker screenshot is duplicated; capture each marker separately`);
    markerHashes.add(markerHash);
  }

  if (!review.markers || Object.keys(review.markers).length !== MIXAMO_MARKERS.length) fail('review must cover exactly the eight markers');
  for (const { id, label } of MIXAMO_MARKERS) {
    const item = review.markers[id];
    if (!item || item.label !== label || item.anatomicalLandmarkMatched !== true) fail(`${id}: visual landmark match was not approved`);
    if (typeof item.notes !== 'string' || item.notes.trim().length < 3) fail(`${id}: record what was visually checked`);
  }

  return {
    path: resolve(reviewPath),
    sha256: sha256File(reviewPath),
    screenshotPath: resolve(screenshotPath),
    screenshotSha256: actualScreenshotHash,
  };
}

export function validateApprovedVisualReview(placement) {
  if (placement.reviewed !== true || placement.nextClicked !== false) {
    throw new Error('Markers need a sealed visual review and must not have been submitted yet.');
  }
  const sealed = placement.visualReview;
  if (!sealed?.path || !sealed?.sha256) throw new Error('Sealed per-marker visual review is missing.');
  if (sha256File(sealed.path) !== sealed.sha256) throw new Error('Visual review artifact changed after approval.');
  const review = JSON.parse(readFileSync(sealed.path, 'utf8'));
  const verified = validateVisualReview(
    { ...placement, reviewed: false, nextClicked: false },
    review,
    sealed.screenshotPath,
    sealed.path,
  );
  if (verified.screenshotSha256 !== sealed.screenshotSha256) throw new Error('Sealed screenshot evidence changed after review.');
  return verified;
}
