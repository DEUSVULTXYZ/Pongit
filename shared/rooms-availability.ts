/** These checks concern the shared engine, never a player's passkey grant. */
export class RoomsEngineUnavailable extends Error {
  source = "interlude_rpc";
  status = 503;
  retryMs = 30000;
  constructor(public code: string, message: string) { super(message); }
}

export function assertRoomsEngineAvailable(
  app: string,
  node: { app: string; chainId: number; epoch: number | bigint },
  delegation: { status: number; expiresAt: bigint; epoch: bigint },
  now: number,
) {
  if (node.app.toLowerCase() !== app.toLowerCase() || node.chainId !== 4242)
    throw new RoomsEngineUnavailable("ENGINE_DEPLOYMENT_MISMATCH", "The game service is connected to a different deployment. Operator recovery is required.");
  if (delegation.status !== 1)
    throw new RoomsEngineUnavailable("ENGINE_DELEGATION_INACTIVE", "The game service delegation is not active. Your arcade session is saved while the service recovers.");
  if (delegation.expiresAt <= BigInt(now))
    throw new RoomsEngineUnavailable("ENGINE_DELEGATION_EXPIRED", "The game service delegation has expired. Recovery must complete before play resumes. Reconnecting your passkey will not fix this.");
  if (BigInt(node.epoch) !== delegation.epoch)
    throw new RoomsEngineUnavailable("ENGINE_EPOCH_MISMATCH", "The game node has not loaded the current delegation. Waiting for service synchronization.");
  if (delegation.expiresAt <= BigInt(now + 40))
    throw new RoomsEngineUnavailable("ENGINE_DELEGATION_ENDING", "The game service delegation is ending. Waiting for a safe renewal before play resumes.");
}

export function roomsDrainBlocker(expired: boolean, active: bigint, pendingDiffs: number, epochMatches: boolean) {
  if (!epochMatches) return "Hosted engine epoch differs from Monad; reconcile before renewal";
  if (expired && (active > 0n || pendingDiffs > 0))
    return "Delegation expired with unfinished engine state; operator publication recovery is required before renewal";
  if (active > 0n) return "Waiting for active matches to finish before renewal";
  if (pendingDiffs > 0) return "Waiting for engine publication before renewal";
  return "";
}
