import {
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

export const normalSessionClosureReason = keccak256(
  stringToHex("MATCH_SESSION_CLOSED"),
);

export const preferredExecution = "Interlude" as const;
export type ExecutionMode = "Interlude" | "Recovery" | "Monad" | "Returning";
export type HubPhase = "None" | "Active" | "Exiting" | "Challenged";
export type ExecutionObservation = {
  chainId: 10143;
  app: Address;
  generation: bigint;
  block: bigint;
  blockHash: Hex;
  timestamp: bigint;
  execution: ExecutionMode;
  transitionReason: Hex;
  closure: { drainingEpoch: bigint; sealedEpoch: bigint };
  hub: {
    phase: HubPhase;
    epoch: bigint;
    lastCommitAt: bigint;
    maxBatchInterval: bigint;
    expiresAt: bigint;
    stakeUnlockAt: bigint;
  };
  // Only these normalized fields may reach diagnostics, never a raw RPC error.
  health: {
    kind:
      | "healthy"
      | "rate_limited"
      | "unreachable"
      | "publication_failed"
      | "epoch_mismatch";
    consecutiveFailures: number;
    unhealthySince: bigint;
  };
};
export type RecoveryReason =
  | "INTERLUDE_HEALTHY"
  | "INTERLUDE_RATE_LIMITED"
  | "INTERLUDE_RECONNECTING"
  | "WAITING_PROTOCOL_EXIT"
  | "DELEGATION_EXPIRED"
  | "PUBLICATION_STOPPED"
  | "DELEGATION_CLOSED"
  | "CHALLENGE_PENDING"
  | "CHALLENGE_WINDOW_PENDING"
  | "RECOVERY_READY"
  | "MONAD_FALLBACK_ACTIVE"
  | "ADMIN_RETURN_PENDING"
  | "SESSION_DRAINING"
  | "SESSION_SEALED"
  | "SESSION_RENEWAL_PENDING"
  | "EXECUTION_STATE_INCONSISTENT";
export type RecoveryDecision = {
  execution: ExecutionMode;
  admissions: boolean;
  reason: RecoveryReason;
  action?: "beginRecovery" | "finishRecovery" | "closeCompletedSession";
  retryAt?: bigint;
};
export type RecoveryStatus =
  | "observing"
  | "requested"
  | "waiting_for_sponsor"
  | "submitted"
  | "uncertain"
  | "confirmed"
  | "failed";

/** A transport error never authorizes base-chain execution. The hub owns that boundary. */
export function decideRecovery(o: ExecutionObservation): RecoveryDecision {
  if (
    o.chainId !== 10143 ||
    !isAddress(o.app) ||
    o.generation < 1n ||
    o.block < 0n ||
    !/^0x[0-9a-f]{64}$/i.test(o.blockHash) ||
    !/^0x[0-9a-f]{64}$/i.test(o.transitionReason) ||
    typeof o.closure?.drainingEpoch !== "bigint" ||
    o.closure.drainingEpoch < 0n ||
    typeof o.closure?.sealedEpoch !== "bigint" ||
    o.closure.sealedEpoch < 0n ||
    (o.closure.sealedEpoch !== 0n &&
      o.closure.sealedEpoch !== o.closure.drainingEpoch) ||
    o.timestamp < 0n ||
    o.timestamp > 8_640_000_000_000n ||
    !["Interlude", "Recovery", "Monad", "Returning"].includes(o.execution) ||
    !["None", "Active", "Exiting", "Challenged"].includes(o.hub.phase) ||
    Object.entries(o.hub).some(
      ([k, v]) =>
        k !== "phase" &&
        (typeof v !== "bigint" || v < 0n || v > 8_640_000_000_000n),
    ) ||
    ![
      "healthy",
      "rate_limited",
      "unreachable",
      "publication_failed",
      "epoch_mismatch",
    ].includes(o.health.kind) ||
    !Number.isSafeInteger(o.health.consecutiveFailures) ||
    o.health.consecutiveFailures < 0 ||
    o.health.unhealthySince < 0n ||
    o.health.unhealthySince > o.timestamp
  )
    throw new Error("Invalid execution observation");
  const result = (
    reason: RecoveryReason,
    rest: Partial<RecoveryDecision> = {},
  ): RecoveryDecision => ({
    execution: o.execution,
    admissions: false,
    reason,
    ...rest,
  });
  const d = o.hub;
  if (d.phase === "Challenged") return result("CHALLENGE_PENDING");
  if (o.execution === "Monad") {
    if (d.phase !== "None") return result("EXECUTION_STATE_INCONSISTENT");
    return result("MONAD_FALLBACK_ACTIVE", { admissions: true });
  }
  if (o.execution === "Recovery") {
    if (d.phase === "None")
      return result("RECOVERY_READY", { action: "finishRecovery" });
    if (d.phase === "Exiting") {
      if (o.timestamp < d.stakeUnlockAt)
        return result("CHALLENGE_WINDOW_PENDING", { retryAt: d.stakeUnlockAt });
      return result("RECOVERY_READY", { action: "finishRecovery" });
    }
    return result("EXECUTION_STATE_INCONSISTENT");
  }
  // A planned close is not an outage. Keep the room generation intact while
  // its administrator renews the delegation after financial finalization.
  if (
    o.execution === "Returning" &&
    o.transitionReason === normalSessionClosureReason
  ) {
    return result(
      "SESSION_RENEWAL_PENDING",
      d.phase === "Exiting" && o.timestamp < d.stakeUnlockAt
        ? { retryAt: d.stakeUnlockAt }
        : {},
    );
  }
  if (
    o.execution === "Interlude" &&
    d.phase === "Active" &&
    o.closure.sealedEpoch === d.epoch &&
    d.epoch !== 0n
  ) {
    return result("SESSION_SEALED", { action: "closeCompletedSession" });
  }
  if (d.phase === "None" || d.phase === "Exiting")
    return result("DELEGATION_CLOSED", { action: "beginRecovery" });
  if (o.timestamp > d.expiresAt)
    return result("DELEGATION_EXPIRED", { action: "beginRecovery" });

  // A lone 429 or a slow request closes admissions briefly, but cannot close the
  // delegation. Both sustained failure and the hub's silence window are required.
  const sustained =
    o.health.kind !== "healthy" &&
    o.health.kind !== "rate_limited" &&
    o.health.consecutiveFailures >= 3 &&
    o.health.unhealthySince > 0n &&
    o.timestamp >= o.health.unhealthySince + 15n;
  const silent = o.timestamp > d.lastCommitAt + d.maxBatchInterval;
  if (sustained && silent)
    return result("PUBLICATION_STOPPED", { action: "beginRecovery" });
  if (o.execution === "Returning") return result("ADMIN_RETURN_PENDING");
  if (o.closure.drainingEpoch !== 0n) {
    if (o.closure.drainingEpoch !== d.epoch)
      return result("EXECUTION_STATE_INCONSISTENT");
    return result(
      o.closure.sealedEpoch !== 0n ? "SESSION_SEALED" : "SESSION_DRAINING",
    );
  }
  if (o.health.kind === "healthy")
    return result("INTERLUDE_HEALTHY", { admissions: true });
  if (o.health.kind === "rate_limited") return result("INTERLUDE_RATE_LIMITED");
  if (sustained)
    return result("WAITING_PROTOCOL_EXIT", {
      retryAt: d.lastCommitAt + d.maxBatchInterval + 1n,
    });
  return result("INTERLUDE_RECONNECTING");
}

export function recoveryDiagnostic(
  o: ExecutionObservation,
  d: RecoveryDecision,
  hash?: Hex,
  status: RecoveryStatus = "observing",
) {
  return {
    event: "pongit.execution",
    preferred: preferredExecution,
    actual: o.execution,
    requested:
      d.action === "beginRecovery"
        ? "Recovery"
        : d.action === "finishRecovery"
          ? "Monad"
          : d.action === "closeCompletedSession"
            ? "Returning"
            : undefined,
    reason: d.reason,
    admissions: d.admissions,
    status,
    chainId: o.chainId,
    app: o.app,
    generation: o.generation.toString(),
    epoch: o.hub.epoch.toString(),
    block: o.block.toString(),
    blockHash: o.blockHash,
    utc: new Date(Number(o.timestamp) * 1000).toISOString(),
    retryAt:
      d.retryAt === undefined
        ? undefined
        : new Date(Number(d.retryAt) * 1000).toISOString(),
    transactionHash: hash,
  };
}

/** Shared by the browser and service. Errors/fallbacks are warnings, not a claim of a completed switch. */
export function executionReporter(
  log: (
    level: "info" | "warn",
    data: ReturnType<typeof recoveryDiagnostic>,
  ) => void,
) {
  let previous = "";
  return (
    o: ExecutionObservation,
    d = decideRecovery(o),
    hash?: Hex,
    status: RecoveryStatus = "observing",
  ) => {
    const identity = `${o.app.toLowerCase()}:${o.generation}:${o.execution}:${o.hub.epoch}:${d.reason}:${d.admissions}:${status}:${hash ?? ""}`;
    if (identity === previous) return;
    previous = identity;
    log(
      d.reason === "INTERLUDE_HEALTHY" ? "info" : "warn",
      recoveryDiagnostic(o, d, hash, status),
    );
  };
}
