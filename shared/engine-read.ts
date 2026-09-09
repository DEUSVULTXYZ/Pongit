/** Coalesce overlapping reads without hiding a write behind an earlier read.
 * Keep the original value (including its observation time), never retimestamp a cache hit. */
export function engineRead<T>(load: () => Promise<T>, ttlMs = 100, now = Date.now) {
  let pending: Promise<T> | undefined;
  let cached: {value: T; at: number} | undefined;
  let generation = 0;
  return (fresh = false): Promise<T> => {
    if (fresh) { generation++; pending = undefined; cached = undefined; }
    if (pending) return pending;
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    const version = generation;
    const request = load().then(value => {
      if (version === generation) cached = {value, at: now()};
      return value;
    }).finally(() => { if (pending === request) pending = undefined; });
    pending = request;
    return request;
  };
}

/** Reads may back off. This does not retry or change a signed transaction. */
export function engineReadRetryMs(error: unknown): number {
  let cause: any = error;
  for (let i = 0; cause && i < 8; i++, cause = cause.cause) {
    if (cause.status !== 429) continue;
    const value = cause.headers?.get?.("retry-after") ?? cause.headers?.["retry-after"];
    const seconds = Number(value);
    return value && Number.isFinite(seconds) && seconds >= 0
      ? Math.min(60000, Math.max(1000, seconds * 1000)) : 10000;
  }
  return 0;
}
