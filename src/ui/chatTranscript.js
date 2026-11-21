export function scrollChatTranscript(log) {
  log.scrollTop = log.scrollHeight;
}

export function appendChatTranscriptEntry(log, entry) {
  log.appendChild(entry);
  scrollChatTranscript(log);
  return entry;
}

export function setChatTypingIndicator(status, visible) {
  status.classList.toggle('hidden', !visible);
}
