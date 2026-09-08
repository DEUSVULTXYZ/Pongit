import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
export const pressureTypes = {
  Pressure: [
    { name: "matchId", type: "uint256" },
    { name: "rally", type: "uint8" },
    { name: "resumeAt", type: "uint64" },
    { name: "paidA", type: "uint128" },
    { name: "paidB", type: "uint128" },
    { name: "sourceBlock", type: "uint64" },
    { name: "checkpoint", type: "bytes32" },
    { name: "expires", type: "uint64" },
  ],
} as const;
export const pressureDomain = (app: Address) => ({
  name: "PONGIT Testnet Pressure",
  version: "1",
  chainId: 10143,
  verifyingContract: app,
});
export function pressureCheckpoint(
  app: Address,
  market: Address,
  id: bigint,
  rally: number,
  resumeAt: bigint,
  block: bigint,
  hash: Hex,
  paidA: bigint,
  paidB: bigint,
) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "uint128" },
        { type: "uint128" },
      ],
      [10143n, app, market, id, rally, resumeAt, block, hash, paidA, paidB],
    ),
  );
}
export const roomsCreditMessage = (
  player: string,
  app: string,
  expires: number,
) =>
  `PONGIT rooms test credits\nPlayer: ${player.toLowerCase()}\nChain: 10143\nGame: ${app.toLowerCase()}\nExpires: ${expires}`;
