import {http, type Transport} from "viem";
import {engineReadRetryMs} from "./engine-read";

/** One cooldown for all methods on a node, including SDK reads and writes.
 * Reject locally while throttled. Never queue or replay a signed transaction. */
export function engineRequestGate(now = Date.now) {
  let until = 0;
  return async <T>(send: () => Promise<T>): Promise<T> => {
    if (now() < until) {
      const error = new Error("The game node is limiting requests. Waiting to synchronize.");
      Object.assign(error, {status: 429, headers: {"retry-after": String((until - now()) / 1000)}});
      throw error;
    }
    try { return await send(); }
    catch (error) {
      const delay = engineReadRetryMs(error);
      if (delay) until = Math.max(until, now() + delay);
      throw error;
    }
  };
}

export function engineTransport(url: string): Transport {
  const gate = engineRequestGate();
  return options => {
    const transport = http(url, {retryCount: 0, timeout: 4000})(options);
    return {...transport, request: args => gate(() => transport.request(args))};
  };
}
