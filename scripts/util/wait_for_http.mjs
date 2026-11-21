export async function waitForHttp(url, {
  processRef = null,
  timeoutMs = 30_000,
  intervalMs = 200,
  requestTimeoutMs = 2_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no successful HTTP response';

  while (Date.now() < deadline) {
    if (processRef && processRef.exitCode !== null) {
      throw new Error(`server exited early with code ${processRef.exitCode}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      if (response.ok) {
        await response.body?.cancel();
        return response.status;
      }
      lastError = `HTTP ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      lastError = error.message;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`HTTP server did not become ready at ${url} within ${timeoutMs}ms (${lastError})`);
}
