const LS_KEY = 'farmacheck:case-service';

export function normalizeCaseServerURL(value) {
  if (typeof value !== 'string' || value.trim().length > 512) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function loadCaseServiceConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    return { baseUrl: normalizeCaseServerURL(value?.baseUrl) };
  } catch {
    return { baseUrl: '' };
  }
}

export function saveCaseServiceConfig(config = {}) {
  const baseUrl = normalizeCaseServerURL(config.baseUrl);
  try {
    if (!baseUrl) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify({ baseUrl }));
    return true;
  } catch {
    return false;
  }
}
