import {
  json,
  type Deployment,
  type RelayRequest,
} from "../../shared/protocol";
import type { State } from "../../shared/physics";
export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const WS = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : json(body),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status >= 500) throw new Error("Service reconnecting. Please retry in a moment.");
  const result = await response.json().catch(() => { throw new Error("Connection interrupted. Please retry."); });
  if (!response.ok || result.error)
    throw new Error(result.error || "Service unavailable");
  return result;
}
export async function relay(request: RelayRequest) {
  const job = await api("/relay", request);
  return waitJob(job.id);
}
const completedJobs = new Map<string, any>();
const jobListeners = new Map<string, Set<(job: any) => void>>();
export function notifyJob(job: any) {
  if (!["succeeded", "failed"].includes(job.status)) return;
  completedJobs.set(job.id, job);
  if (completedJobs.size > 100) completedJobs.delete(completedJobs.keys().next().value!);
  for (const listener of jobListeners.get(job.id) || []) listener(job);
}
export async function waitJob(id: string) {
  return new Promise<any>((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const finish = (job: any) => {
      if (done || !["succeeded", "failed"].includes(job.status)) return;
      done = true;
      clearTimeout(timer);
      jobListeners.get(id)?.delete(finish);
      if (!jobListeners.get(id)?.size) jobListeners.delete(id);
      if (job.status === "succeeded") resolve(job);
      else reject(new Error(job.error || "Transaction reverted"));
    };
    const listeners = jobListeners.get(id) || new Set();
    listeners.add(finish); jobListeners.set(id, listeners);
    const poll = async () => {
      if (done) return;
      try { finish(completedJobs.get(id) || await api(`/jobs/${id}`)); }
      catch { /* WebSocket can still deliver the receipt during a failed HTTP read. */ }
      if (done) return;
      if (Date.now() - started > 90000) return finish({ status: "failed", error: `Transaction still pending. Receipt: ${id}` });
      timer = setTimeout(poll, 800);
    };
    void poll();
  });
}
export function stateFromJson(s: any): State {
  return {
    ...s,
    ...Object.fromEntries(
      ["x", "y", "vx", "vy", "left", "right", "t"].map((k) => [
        k,
        BigInt(s[k]),
      ]),
    ),
    leftDir: Number(s.leftDir),
    rightDir: Number(s.rightDir),
    scoreA: Number(s.scoreA),
    scoreB: Number(s.scoreB),
  };
}
export type Config = Deployment & { localDev: boolean; relayer: string; serverTimeMs: number };
export const short = (address: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
