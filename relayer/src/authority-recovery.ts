import type { Hex } from "viem";
import {
  decideRecovery,
  executionReporter,
  type ExecutionObservation,
  type RecoveryDecision,
  type recoveryDiagnostic,
} from "../../shared/authority-recovery";

export type RecoveryJournal =
  "missing" | "submitted" | "uncertain" | "confirmed" | "failed";
export type RecoveryFault = {
  event: "pongit.execution.worker-unavailable";
  stage: "observation" | "journal" | "sponsor" | "submission";
  preferred: "Interlude";
  admissions: false;
};
export interface RecoveryPort {
  // Read controller and hub at ONE canonical Monad block; no node overlay here.
  observe(): Promise<ExecutionObservation>;
  canonical(block: bigint, hash: Hex): Promise<boolean>;
  sponsorAvailable(): Promise<boolean>;
  journal(id: string): Promise<RecoveryJournal>;
  reconcile(id: string): Promise<RecoveryJournal>;
  // Must use the existing persistent operator/sponsor nonce journal. Record the
  // signed bytes before sending; this module has no wallet and cannot pick one.
  enqueue(
    id: string,
    action: "beginRecovery" | "finishRecovery" | "closeCompletedSession",
    expectedEpoch: bigint,
  ): Promise<Hex | undefined>;
  log(
    level: "info" | "warn",
    data: ReturnType<typeof recoveryDiagnostic> | RecoveryFault,
  ): void;
}

/** No automatic return to Interlude. Reopening is an explicit administrator action. */
export function recoveryWorker(port: RecoveryPort) {
  const report = executionReporter((level, data) => port.log(level, data));
  let working:
    Promise<{ decision?: RecoveryDecision; status: string }> | undefined;
  let lastBlock = -1n;
  let stage: RecoveryFault["stage"] = "observation";
  let fault: RecoveryFault["stage"] | undefined;
  const run = async () => {
    stage = "observation";
    const o = await port.observe();
    const decision = decideRecovery(o);
    if (!(await port.canonical(o.block, o.blockHash)))
      return { status: "observation_reorganized" };
    if (o.block < lastBlock) return { status: "observation_behind" };
    lastBlock = o.block;
    if (!decision.action) {
      report(o, decision);
      return { decision, status: "observing" };
    }
    const id = `${o.chainId}:${o.app.toLowerCase()}:${o.generation}:${o.hub.epoch}:${decision.action}`;
    stage = "journal";
    let state = await port.journal(id);
    if (state === "submitted" || state === "uncertain")
      state = await port.reconcile(id);
    if (state !== "missing") {
      report(o, decision, undefined, state);
      return { decision, status: state }; // Failed recovery requires inspection, never a blind loop.
    }
    stage = "sponsor";
    if (!(await port.sponsorAvailable())) {
      report(o, decision, undefined, "waiting_for_sponsor");
      return { decision, status: "waiting_for_sponsor" };
    }
    // Recheck after journal/network work. The contract independently enforces the
    // hub guard; this also avoids submitting work for a superseded generation.
    stage = "observation";
    const fresh = await port.observe();
    if (
      fresh.app.toLowerCase() !== o.app.toLowerCase() ||
      fresh.generation !== o.generation ||
      fresh.hub.epoch !== o.hub.epoch ||
      fresh.block < o.block ||
      !(await port.canonical(fresh.block, fresh.blockHash)) ||
      decideRecovery(fresh).action !== decision.action
    )
      return { decision, status: "observation_changed" };
    stage = "submission";
    const hash = await port.enqueue(id, decision.action, fresh.hub.epoch);
    // This is only a requested transition. Wait for the next canonical controller
    // state before routing any game command to Monad.
    report(fresh, decideRecovery(fresh), hash, "requested");
    return { decision, status: "submitted" };
  };
  return () => {
    if (working) return working;
    working = run()
      .then((result) => {
        fault = undefined;
        return result;
      })
      .catch(() => {
        // No raw exception: it can contain RPC URLs, signed bytes or credentials.
        if (fault !== stage)
          port.log("warn", {
            event: "pongit.execution.worker-unavailable",
            stage,
            preferred: "Interlude",
            admissions: false,
          });
        fault = stage;
        return { status: "recovery_check_unavailable" };
      })
      .finally(() => {
        working = undefined;
      });
    return working;
  };
}
