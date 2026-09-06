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
export async function waitJob(id: string) {
  for (let i = 0; i < 180; i++) {
    const job = await api(`/jobs/${id}`);
    if (job.status === "succeeded") return job;
    if (job.status === "failed")
      throw new Error(job.error || "Transaction reverted");
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Transaction still pending. Receipt: ${id}`);
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
