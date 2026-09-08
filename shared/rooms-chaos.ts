import type { Address, Hex } from "viem";
import type { MatchOffer } from "./rooms";

// Candidate protocol only. The current manifest and rooms API continue to use rules 3.
// Do not reuse a v1 admission signature for these mode-bound rules.
export const CHAOS_ROOMS_RULES = 4n;
export type RoomsMode = 0 | 1;
export type ChaosRoomsOffer = MatchOffer & { mode: RoomsMode };
export const chaosOfferDomain = (chainId: number, verifyingContract: Address) => ({
  name: "PONGIT Rooms",
  version: "2",
  chainId,
  verifyingContract,
}) as const;
export const chaosOfferTypes = {
  MatchOffer: [
    { name: "id", type: "uint256" },
    { name: "room", type: "bytes32" },
    { name: "a", type: "address" },
    { name: "b", type: "address" },
    { name: "mode", type: "uint8" },
    { name: "ranked", type: "bool" },
    { name: "expires", type: "uint64" },
    { name: "rules", type: "uint256" },
    { name: "entropy", type: "bytes32" },
  ],
} as const;

/** A verified checkpoint must be scoped to the deployment and exact rally boundary. */
export type ChaosPressureBoundary = {
  chainId: number;
  app: Address;
  matchId: bigint;
  rally: number;
  resumeAtUs: bigint;
};
export type VerifiedChaosPressure = ChaosPressureBoundary & {
  // Gross MON paid, cumulative across claims; no platform liquidity.
  paidA: bigint;
  paidB: bigint;
  checkpoint: Hex;
};
