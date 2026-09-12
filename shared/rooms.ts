import type { Address, Hex } from "viem";
export type RoomKind = "group" | "duel" | "ranked";
export type RoomMember = {
  player: string;
  joined: number;
  position: number;
  away: boolean;
  seen: number;
};
export type MatchOffer = {
  mode?: 0 | 1;
  id: bigint;
  room: Hex;
  a: Address;
  b: Address;
  ranked: boolean;
  expires: bigint;
  rules: bigint;
  entropy: Hex;
};
export const offerTypes = {
  MatchOffer: [
    { name: "id", type: "uint256" },
    { name: "room", type: "bytes32" },
    { name: "a", type: "address" },
    { name: "b", type: "address" },
    { name: "ranked", type: "bool" },
    { name: "expires", type: "uint64" },
    { name: "rules", type: "uint256" },
    { name: "entropy", type: "bytes32" },
  ],
} as const;
export const roomAuthMessage = (
  player: string,
  nonce: string,
  expires: number,
  app: string,
) =>
  `PONGIT Interlude social session\nPlayer: ${player.toLowerCase()}\nNonce: ${nonce}\nExpires: ${expires}\nChain: 10143\nGame: ${app.toLowerCase()}\nScope: contacts, profiles, rooms, invitations and matchmaking. No funds.`;
export function rotateMembers(
  members: RoomMember[],
  a: string,
  b: string,
  winner: string,
) {
  const last = Math.max(0, ...members.map((m) => m.position));
  return members.map((m) =>
    m.player === (winner === a ? b : a) ? { ...m, position: last + 1 } : m,
  );
}
export function nextPair(
  members: RoomMember[],
  winner?: string,
  now = Date.now(),
) {
  const eligible = members
    .filter((m) => !m.away && now - m.seen < 30000)
    .sort((a, b) => a.position - b.position || a.joined - b.joined);
  const champion = eligible.find((m) => m.player === winner);
  return (
    champion ? [champion, ...eligible.filter((m) => m !== champion)] : eligible
  ).slice(0, 2);
}
export type LobbyOffer = {
  mode?: 0 | 1;
  id: string;
  room: string;
  a: string;
  b: string;
  ranked: boolean;
  expires: string;
  rules: string;
  entropy: string;
  signature: string;
  accepted: string[];
  /** UI readiness is not an engine consent. Both signatures still create the match. */
  launch?: {ready:string[];at?:number};
  status: "offered" | "submitted" | "active" | "complete" | "cancelled";
};
export type LobbyRoom = {
  mode?: 0 | 1;
  id: string;
  host: string;
  kind: RoomKind;
  members: RoomMember[];
  offer?: LobbyOffer;
  winner?: string;
  status: string;
  created: number;
  activity: number;
};
