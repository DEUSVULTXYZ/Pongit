import {decodeEventLog, type Abi} from "viem";
import type {LobbyOffer, LobbyRoom} from "./rooms";

export const MATCH_INTRO_MS=3000;
/** Persisted once per offer, separately from receipt-confirmed acceptances. */
export function prepareRoomLaunch(offer:LobbyOffer,player:string,now:number){
 if(![offer.a,offer.b].includes(player)||offer.status!=="offered"||Number(offer.expires)*1000<=now)throw Error("This duel is no longer available.");
 const ready=[...new Set([...(offer.launch?.ready??[]),...offer.accepted,player])].filter(p=>p===offer.a||p===offer.b);
 let at=offer.launch?.at;
 if(ready.length===2&&!at){
  if(Number(offer.expires)*1000<=now+MATCH_INTRO_MS+1000)throw Error("Not enough time to start this duel. Rejoin the queue.");
  at=now+MATCH_INTRO_MS;
 }
 offer.launch={ready,...(at?{at}:{})};
 return offer.launch;
}
export function assertRoomLaunchReady(offer:LobbyOffer,now:number){
 if(offer.launch&&(!offer.launch.at||offer.launch.ready.length!==2||now<offer.launch.at))throw Error("Waiting for the countdown before starting the duel.");
}

/** A failed/preflight-only acceptance cannot automatically renew its ticket. */
export function expireUnstartedRoomOffer(room: LobbyRoom, enginePhase: bigint | undefined, now: number) {
  const offer = room.offer;
  if (!offer || offer.status !== "offered" || enginePhase !== 0n || Number(offer.expires) * 1000 + 3000 >= now) return false;
  for (const member of room.members)
    if ([offer.a, offer.b].includes(member.player)) member.away = true;
  offer.accepted = [];
  offer.status = "cancelled";
  room.status = "waiting";
  return true;
}

/** An HTTP preflight is not a player's engine consent. Verify its receipt. */
export function confirmsRoomAcceptance(receipt: {
  status: unknown; transactionHash: string;
  logs: readonly {address: string; data: `0x${string}`; topics: readonly `0x${string}`[]; removed?: boolean}[];
}, abi: Abi, app: string, offer: LobbyOffer, player: string, hash: string) {
  if (!["success", "0x1", "1"].includes(String(receipt.status)) || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) return false;
  return receipt.logs.some(log => {
    if (log.removed || log.address.toLowerCase() !== app.toLowerCase()) return false;
    try {
      const event = decodeEventLog({abi, eventName: "MatchAccepted", data: log.data, topics: [...log.topics] as any});
      const a = event.args as any;
      return String(a.id) === offer.id && a.room.toLowerCase() === offer.room.toLowerCase()
        && a.player.toLowerCase() === player.toLowerCase()
        && a.a.toLowerCase() === offer.a.toLowerCase() && a.b.toLowerCase() === offer.b.toLowerCase()
        && a.ranked === offer.ranked && Number(a.mode || 0) === (offer.mode || 0);
    } catch { return false; }
  });
}
