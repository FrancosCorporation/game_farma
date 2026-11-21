import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Return true only when the server returns its JSON readiness contract. */
export async function probeReadiness({ port = process.env.PORT || 3000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/readyz`, { signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      await response.body?.cancel();
      return false;
    }
    const payload = await response.json();
    return payload?.status === 'ready';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  process.exitCode = await probeReadiness() ? 0 : 1;
}
