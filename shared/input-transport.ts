import { hashTypedData, type Address } from "viem";
import { domain, inputTypes } from "./protocol";
export const intentTypes = { InputIntent: [
  { name: "inputHash", type: "bytes32" }, { name: "sequence", type: "uint64" },
] } as const;
export type GameInput = { matchId: bigint; player: Address; direction: number; nonce: bigint; observedBlock: bigint; validUntilBlock: bigint };
export function intentMessage(input: GameInput, sequence: bigint, chainId: number, game: Address) {
  return { inputHash: hashTypedData({ domain: domain("PONG", chainId, game), types: inputTypes, primaryType: "Input", message: input }), sequence };
}
export function inputState(status: string) {
  return ({ queued: "accepted", signed: "submitted", sent: "submitted", succeeded: "confirmed", superseded: "superseded", failed: "failed" } as Record<string,string>)[status] || status;
}
