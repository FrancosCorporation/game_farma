import assert from 'node:assert/strict';
import {
  appendChatTranscriptEntry,
  scrollChatTranscript,
  setChatTypingIndicator,
} from '../src/ui/chatTranscript.js';

const entries = [];
const log = {
  scrollTop: 0,
  get scrollHeight() { return entries.length * 32; },
  appendChild(entry) { entries.push(entry); },
};
const first = { textContent: 'pergunta' };
assert.equal(appendChatTranscriptEntry(log, first), first);
assert.deepEqual(entries, [first]);
assert.equal(log.scrollTop, 32, 'anexa e mantém a entrada recém-adicionada visível');

const streamed = { textContent: 'resposta parcial' };
entries.push(streamed);
log.scrollHeight;
scrollChatTranscript(log);
assert.equal(log.scrollTop, 64, 'atualiza a rolagem enquanto a resposta cresce');

const classes = new Set(['hidden']);
const status = { classList: { toggle(name, force) { force ? classes.add(name) : classes.delete(name); } } };
setChatTypingIndicator(status, true);
assert.equal(classes.has('hidden'), false, 'indicador aparece durante a resposta');
setChatTypingIndicator(status, false);
assert.equal(classes.has('hidden'), true, 'indicador some após a resposta');

console.log('✔ transcript appends, scrolls and toggles typing state');
