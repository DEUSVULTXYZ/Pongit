import {
  encodeAbiParameters,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

export const authorityReadAbi = parseAbi([
  "function generation() view returns(uint256)",
  "function executionState() view returns(uint8)",
  "function participation(address player) view returns(uint256)",
  "function queuedPlayer(address player) view returns(uint8 mode,uint64 since,uint64 expires)",
  "function rankedPlayers(uint8 mode,uint256 offset,uint256 limit) view returns(address[] players,uint256 total)",
  "function ratingOf(address player,uint8 mode) view returns((uint32 elo,uint32 played,uint32 wins,uint32 season))",
  "event ExecutionChanged(uint8 previous,uint8 next,uint256 generation,bytes32 reason,uint64 at)",
]);
export type MatchReference = {
  chainId: 10143;
  deployment: Address;
  id: bigint;
};
export const matchReference = (r: MatchReference) =>
  `${r.chainId}:${r.deployment.toLowerCase()}:${r.id}`;
export const executionNames = [
  "Interlude",
  "Recovery",
  "Monad",
  "Returning",
] as const;
export type Rating = {
  elo: number;
  played: number;
  wins: number;
  season: number;
};
export type LeaderboardPort = {
  snapshot(): Promise<{ revision: bigint; generation: bigint }>;
  page(
    mode: 0 | 1,
    offset: bigint,
    limit: bigint,
    revision: bigint,
  ): Promise<readonly [readonly Address[], bigint]>;
  rating(player: Address, mode: 0 | 1, revision: bigint): Promise<Rating>;
};
/** All pages and values must use the same chain block / engine snapshot. No PostgreSQL discovery. */
export async function readAuthorityLeaderboard(
  port: LeaderboardPort,
  mode: 0 | 1,
  signal?: AbortSignal,
) {
  const snapshot = await port.snapshot();
  const rows: Array<Rating & { player: Address }> = [];
  const seen = new Set<string>();
  let total = 1n;
  for (let offset = 0n; offset < total; offset += 100n) {
    signal?.throwIfAborted();
    const [players, count] = await port.page(
      mode,
      offset,
      100n,
      snapshot.revision,
    );
    total = count;
    if (players.length === 0 && offset < total)
      throw new Error("Leaderboard snapshot is discontinuous. Reload it.");
    // Bounded concurrency keeps a large board from flooding the RPC.
    for (let i = 0; i < players.length; i += 8) {
      const group = players.slice(i, i + 8);
      rows.push(
        ...(await Promise.all(
          group.map(async (player) => {
            const key = player.toLowerCase();
            if (seen.has(key)) throw new Error("Duplicate leaderboard entry.");
            seen.add(key);
            return {
              player,
              ...(await port.rating(player, mode, snapshot.revision)),
            };
          }),
        )),
      );
    }
  }
  return {
    ...snapshot,
    rows: rows.sort(
      (a, b) =>
        b.elo - a.elo ||
        (a.player.toLowerCase() < b.player.toLowerCase()
          ? -1
          : a.player.toLowerCase() > b.player.toLowerCase()
            ? 1
            : 0),
    ),
  };
}
export type ArcadeGrant = {
  player: Address;
  key: Address;
  generation: bigint;
  epoch: bigint;
  expires: bigint;
};
export const arcadeTypes = {
  ArcadeGrant: [
    { name: "player", type: "address" },
    { name: "key", type: "address" },
    { name: "generation", type: "uint256" },
    { name: "epoch", type: "uint256" },
    { name: "expires", type: "uint64" },
  ],
  ArcadeCommand: [
    { name: "grantHash", type: "bytes32" },
    { name: "dataHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
export const arcadeDomain = (contract: Address) =>
  ({
    name: "PONGIT Autonomous Arcade",
    version: "1",
    chainId: 10143,
    verifyingContract: contract,
  }) as const;
export function authorityGrantHash(g: ArcadeGrant) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint64" },
      ],
      [
        keccak256(
          new TextEncoder().encode(
            "ArcadeGrant(address player,address key,uint256 generation,uint256 epoch,uint64 expires)",
          ),
        ),
        g.player,
        g.key,
        g.generation,
        g.epoch,
        g.expires,
      ],
    ),
  );
}
export function commandMessage(
  g: ArcadeGrant,
  data: Hex,
  nonce: bigint,
  deadline: bigint,
) {
  if (deadline > g.expires) throw new Error("Renew arcade session");
  return {
    grantHash: authorityGrantHash(g),
    dataHash: keccak256(data),
    nonce,
    deadline,
  };
}
export type Transition = {
  previous: number;
  next: number;
  generation: bigint;
  reason: Hex;
  at: bigint;
  transactionHash?: Hex;
};
export function transitionNotice(t: Transition) {
  if (!executionNames[t.previous] || !executionNames[t.next])
    throw new Error("Unknown execution state");
  return {
    previous: executionNames[t.previous],
    next: executionNames[t.next],
    generation: t.generation.toString(),
    reason: t.reason,
    utc: new Date(Number(t.at) * 1000).toISOString(),
    transactionHash: t.transactionHash,
  };
}
/** A caller may use this output for Admin and console; never attach grants or request bodies. */
export function logTransition(
  t: Transition,
  logger: (
    message: string,
    value: ReturnType<typeof transitionNotice>,
  ) => void = t.next === 1 || t.next === 2 ? console.warn : console.info,
) {
  logger("PONGIT execution transition", transitionNotice(t));
}
