// Seal a per-marker visual inspection before the one-shot Mixamo submission.
// Usage: node scripts/approve_mixamo_marker_review.mjs placement.json visual-review.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateVisualReview } from './mixamo_marker_review.mjs';

const [placementArg, reviewArg] = process.argv.slice(2);
if (!placementArg || !reviewArg) throw new Error('Supply placement.json and completed visual-review.json');
const placementPath = resolve(placementArg);
const reviewPath = resolve(reviewArg);
const placement = JSON.parse(readFileSync(placementPath, 'utf8'));
const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
const evidence = validateVisualReview(placement, review, placement.evidence?.finalScreenshot?.path || '', reviewPath);
placement.reviewed = true;
placement.reviewedAt = review.reviewedAt;
placement.visualReview = evidence;
writeFileSync(placementPath, JSON.stringify(placement, null, 2) + '\n');
console.log(JSON.stringify({ approved: true, reviewer: review.reviewer, markers: 8, screenshot: evidence.screenshotPath }));
