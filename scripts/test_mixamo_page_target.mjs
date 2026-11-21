import assert from 'node:assert/strict';
import { resolveMixamoTaskPage } from './mixamo_page_target.mjs';

const page = (host, id = null) => ({
  url: () => `https://${host}/`,
  evaluate: async () => id,
});

const untagged = page('www.mixamo.com');
const taggedCarlos = page('www.mixamo.com', 'carlos-control');
const taggedBia = page('www.mixamo.com', 'bia-attempt-007');
const gmail = page('mail.google.com', 'bia-attempt-007');

assert.equal(await resolveMixamoTaskPage([untagged]), untagged);
assert.equal(await resolveMixamoTaskPage([taggedCarlos, taggedBia], 'bia-attempt-007'), taggedBia);
assert.equal(await resolveMixamoTaskPage([taggedBia, gmail], 'bia-attempt-007'), taggedBia);
await assert.rejects(() => resolveMixamoTaskPage([taggedCarlos, taggedBia]), /2 Mixamo tabs/);
await assert.rejects(() => resolveMixamoTaskPage([taggedCarlos], 'missing'), /found 0/);
await assert.rejects(() => resolveMixamoTaskPage([taggedCarlos, taggedBia], 'duplicate'), /found 0/);

console.log('Mixamo task-tab resolver tests passed (single, tagged, ambiguous, and missing tabs).');
