/** Mirrors the published ReusableAgentPool._idle predicate for a read-only
 * sample pinned to one Monad block. Hosted readiness is checked separately. */
export function publishedReusableIdle(v: {
  status: number; epoch: bigint; expires: bigint; now: bigint;
  resultEpoch: bigint; resultCount: number; prior: boolean; captured: boolean;
  currentEpoch: bigint; currentId: bigint; priorId: bigint; priorStatus: number;
}) {
  if (v.status !== 1 || v.expires <= v.now + 420n || v.resultEpoch !== v.epoch || v.resultCount >= 65536) return false;
  if (v.prior && !v.captured) return false;
  return v.currentId === 0n || v.currentEpoch === v.epoch && v.prior && v.priorId === v.currentId && v.priorStatus >= 3;
}
