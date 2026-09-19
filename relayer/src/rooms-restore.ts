import type {LobbyOffer,LobbyRoom} from '../../shared/rooms';

/** The part of the lobby document a contested match's restoration touches. */
export type LobbyState={rooms:Record<string,LobbyRoom>;queue:{player:string}[]};
/** A recorded result's row, and the signed offer kept for it in il_offers. */
export type RecordedResult={id:string;room:string;ranked:boolean};
export type SavedOffer={room:string;offer:LobbyOffer};
/** What the live node shows for the match: phase, and players a and b. */
export type LiveMatch={phase:bigint;a:string;b:string};

export type LobbyRestore=
 |{kind:'restored'|'recreated'}
 |{kind:'refused';reason:string};

/** Puts a match the node shows live (phase 1 or 2) back into its lobby room, so
 * the maintenance loop watches and ticks it again. Mutates `s`.
 *
 * - The room exists: the players are moved back into it (the contract owns
 *   participation) and its offer is the saved one again.
 * - The room is gone: a closed room is deleted 24 hours after its last activity
 *   (48 hours never applied), and the running release does so even while its
 *   result is unpublished. It is recreated from the signed offer kept in il_offers,
 *   under the same id, with the two players as its members.
 * - Refused, with the lobby unchanged: the saved offer is not this match's, the
 *   room already holds another unfinished match, or moving the players in would
 *   exceed eight members. The caller then watches the match by id alone. */
export function restoreIntoLobby(s:LobbyState,saved:SavedOffer,live:LiveMatch,now:number):LobbyRestore{
 const players=[live.a.toLowerCase(),live.b.toLowerCase()];
 const offer=saved.offer;
 if(offer.a.toLowerCase()!==players[0]||offer.b.toLowerCase()!==players[1])return {kind:'refused',reason:'the saved offer names other players'};
 let r=s.rooms[saved.room];
 if(r?.offer&&r.offer.id!==offer.id&&!['complete','cancelled'].includes(r.offer.status))
  return {kind:'refused',reason:'its room holds another unfinished match'};
 if(r&&r.members.filter(m=>!players.includes(m.player)).length+2>8)
  return {kind:'refused',reason:'its room would exceed eight members'};
 const recreated=!r;
 if(!r){
  r={id:saved.room,host:players[0],kind:offer.ranked?'ranked':'duel',mode:offer.mode??0,members:[],status:'waiting',created:now,activity:now};
  s.rooms[r.id]=r;
 }
 r.winner=undefined;
 // The contract owns participation. Roll back derived room occupancy to it.
 for(const other of Object.values(s.rooms))
  if(other.id!==r.id){
   other.members=other.members.filter(m=>!players.includes(m.player));
   if(other.offer&&players.some(p=>[other.offer!.a,other.offer!.b].includes(p))&&!['complete','cancelled'].includes(other.offer.status)){
    other.offer.status='cancelled';other.status='waiting';
   }
   if(!other.members.some(m=>m.player===other.host))
    other.host=[...other.members].sort((a,b)=>a.joined-b.joined)[0]?.player||'';
  }
 s.queue=s.queue.filter(q=>!players.includes(q.player));
 for(const p of players){
  const member=r.members.find(m=>m.player===p);
  if(member)member.away=false;
  else r.members.push({player:p,joined:now,position:r.members.length,seen:0,away:false});
 }
 r.offer={...offer,status:live.phase===2n?'active':'submitted'};
 r.status=live.phase===2n?'playing':'offer';
 r.activity=now;
 return {kind:recreated?'recreated':'restored'};
}

export type ContestedOutcome=
 /** Back in its (possibly recreated) room: the stale row may go. */
 |'restored'
 /** Live, but no room could take it: it is watched and ticked by id, and its row stays. */
 |'orphaned'
 /** Ended on the node differently from the row: its actual end is recorded again. */
 |'terminal'
 /** The node knows no such match. The row stays for review. */
 |'absent';

/** One il_results row whose recorded hash differs from the live node's.
 * The row is deleted only once the match is back in a lobby room: a deleted row
 * with nothing watching its match would leave it active on Monad for good (both
 * players ArenaBusy, every drain and renewal blocked). */
export async function reconcileContestedResult(o:{
 row:RecordedResult;
 live:()=>Promise<LiveMatch>;
 savedOffer:()=>Promise<SavedOffer|undefined>;
 /** Runs `fn` on the lobby document inside its transaction. */
 lobby:(fn:(s:LobbyState)=>LobbyRestore)=>Promise<LobbyRestore>;
 /** Queues the row for re-recording from the live node (il_result_pending). */
 recordEnd:()=>Promise<void>;
 deleteRow:()=>Promise<void>;
 /** The match stays live with no room: watch and tick it by id. */
 orphan:(reason:string)=>void;
 restored:(kind:'restored'|'recreated')=>void;
 now:()=>number;
}):Promise<ContestedOutcome>{
 const live=await o.live();
 if(live.phase===0n)return 'absent';
 if(live.phase>=3n){await o.recordEnd();return 'terminal';}
 const saved=await o.savedOffer();
 if(!saved){o.orphan('no signed offer on record');return 'orphaned';}
 const result=await o.lobby(s=>restoreIntoLobby(s,saved,live,o.now()));
 if(result.kind==='refused'){o.orphan(result.reason);return 'orphaned';}
 o.restored(result.kind);
 await o.deleteRow();
 return 'restored';
}

/** Live matches the lobby does not hold. The maintenance loop watches and ticks
 * them by id like a room's match, until they end; their end is then recorded
 * against the row's room. Each is reported once per process. */
export class OrphanMatches {
 private matches=new Map<string,{room:string;ranked:boolean;reason:string;since:number}>();
 private reported=new Set<string>();
 constructor(private now=Date.now){}
 /** True the first time this match is reported. */
 add(row:RecordedResult,reason:string){
  const known=this.matches.get(row.id);
  this.matches.set(row.id,{room:row.room,ranked:row.ranked,reason,since:known?.since??this.now()});
  if(this.reported.has(row.id))return false;
  this.reported.add(row.id);return true;
 }
 delete(id:string){this.matches.delete(id);}
 has(id:string){return this.matches.has(id);}
 entries(){return [...this.matches.entries()].map(([id,m])=>({id,...m}));}
 get size(){return this.matches.size;}
}

/** The matches the maintenance loop observes: every room's unfinished offer
 * (and a cancelled one while its ticket can still be submitted), then every
 * orphan no room holds. */
export function maintenanceTargets(rooms:readonly LobbyRoom[],orphans:readonly {id:string;room:string;ranked:boolean}[],now:number){
 const targets:({id:string;room:LobbyRoom;orphan?:undefined}|{id:string;room?:undefined;orphan:{room:string;ranked:boolean}})[]=[];
 const seen=new Set<string>();
 for(const room of rooms){
  const offer=room.offer;
  if(!offer||offer.status==='complete'||(offer.status==='cancelled'&&Number(offer.expires)*1000+30000<now))continue;
  targets.push({id:offer.id,room});seen.add(offer.id);
 }
 for(const o of orphans)if(!seen.has(o.id)){targets.push({id:o.id,orphan:{room:o.room,ranked:o.ranked}});seen.add(o.id);}
 return targets;
}
