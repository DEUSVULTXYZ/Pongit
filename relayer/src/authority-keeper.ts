import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

const maintenanceAbi = parseAbi([
  "function matchmake(uint8 mode,uint256 budget) returns(uint256)",
  "function expireProposal(uint256 id)",
  "function propose(uint256 room) returns(uint256)",
  "function expireRoom(uint256 room)",
  "function beginRecovery()",
  "function finishRecovery()",
  "function closeCompletedSession(uint256 expectedEpoch)",
  "function openRound(uint256 id)",
  "function tick(uint256 id)",
  "function freezeCheckpoint(uint256 id,uint8 rally)",
  "function finalizeResult(uint256 id)",
  "function claim(uint256 id,address beneficiary)",
  "function retryPayout(bytes32 id)",
]);
export type Maintenance =
  | { kind: "matchmake"; mode: 0 | 1; revision: bigint }
  | { kind: "propose" | "tick"; id: bigint; revision: bigint }
  | { kind: "expireProposal" | "expireRoom" | "finalizeResult"; id: bigint }
  | { kind: "beginRecovery" | "finishRecovery" }
  | { kind: "closeCompletedSession"; epoch: bigint }
  | { kind: "freezeCheckpoint" | "openRound"; id: bigint; rally: number }
  | { kind: "claim"; id: bigint; beneficiary: Address }
  | { kind: "retryPayout"; id: Hex; attempt: bigint };
export type AuthorityTargets = {
  chainId: 10143;
  generation: bigint;
  game: Address;
  finance: Address;
  market: Address;
};
export function maintenanceCall(t: AuthorityTargets, task: Maintenance) {
  let to = t.game;
  let data: Hex;
  switch (task.kind) {
    case "matchmake":
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.mode, 32n],
      });
      break;
    case "beginRecovery":
    case "finishRecovery":
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
      });
      break;
    case "closeCompletedSession":
      if (task.epoch <= 0n)
        throw new Error("A published delegation epoch is required.");
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.epoch],
      });
      break;
    case "freezeCheckpoint":
      to = t.finance;
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id, task.rally],
      });
      break;
    case "openRound":
      to = t.finance;
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id],
      });
      break;
    case "finalizeResult":
      to = t.finance;
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id],
      });
      break;
    case "claim":
      to = t.market;
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id, task.beneficiary],
      });
      break;
    case "retryPayout":
      to = t.market;
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id],
      });
      break;
    default:
      data = encodeFunctionData({
        abi: maintenanceAbi,
        functionName: task.kind,
        args: [task.id],
      });
  }
  // Repeated actions bind the state they were observed against: room cycle,
  // snapshot, rally or payout attempt. A confirmed earlier cycle must not suppress
  // the next one, while an uncertain request in the same cycle must be reconciled.
  const cycle =
    "revision" in task
      ? task.revision
      : "attempt" in task
        ? task.attempt
        : "rally" in task
          ? task.rally
          : "once";
  const requestId = keccak256(
    stringToHex(
      `${t.chainId}:${to.toLowerCase()}:${t.generation}:${data}:${cycle}`,
    ),
  );
  return { to, data, value: 0n, requestId };
}
export type JournalState =
  "missing" | "uncertain" | "submitted" | "confirmed" | "failed";
export interface AuthorityExecutorPort {
  // Uses the SAME persistent nonce journal as the existing sponsor. Never create a second signer.
  journal(id: Hex): Promise<JournalState>;
  reconcile(id: Hex): Promise<JournalState>;
  simulate(call: ReturnType<typeof maintenanceCall>): Promise<void>;
  sponsoredEnqueue(call: ReturnType<typeof maintenanceCall>): Promise<void>;
  sponsorAvailable(): Promise<boolean>;
}
/** Candidate worker, deliberately not imported by production main.ts. Contract chooses the pair. */
export function authorityExecutor(port: AuthorityExecutorPort) {
  const inFlight = new Map<Hex, Promise<string>>();
  return (targets: AuthorityTargets, task: Maintenance): Promise<string> => {
    const call = maintenanceCall(targets, task);
    const existing = inFlight.get(call.requestId);
    if (existing) return existing;
    const work = (async () => {
      let state = await port.journal(call.requestId);
      if (state === "uncertain" || state === "submitted")
        state = await port.reconcile(call.requestId);
      if (state !== "missing" && state !== "failed") return state; // A lost receipt never authorizes replacement.
      if (!(await port.sponsorAvailable())) return "waiting_for_sponsor";
      await port.simulate(call);
      await port.sponsoredEnqueue(call);
      return "submitted";
    })().finally(() => inFlight.delete(call.requestId));
    inFlight.set(call.requestId, work);
    return work;
  };
}
