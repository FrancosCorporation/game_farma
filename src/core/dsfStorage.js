const KEY = 'farmacheck:dsf:v1';

export function listSavedDsf(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.caseId === 'string') : [];
  } catch { return []; }
}

export function saveDsf(record, storage = localStorage) {
  const entries = listSavedDsf(storage);
  const id = record.id || crypto.randomUUID();
  const entry = { ...record, id, savedAt: new Date().toISOString() };
  const updated = [entry, ...entries.filter((item) => item.id !== id)];
  try {
    storage.setItem(KEY, JSON.stringify(updated));
    return entry;
  } catch { return null; }
}
