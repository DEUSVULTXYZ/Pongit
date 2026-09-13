import {retainFinished} from './retention';

/** Handler body isolated from the running indexer for correction tests. */
export async function applyChaosArchive(context:any,event:any){
 const p=event.params,id=`10143:${p.app.toLowerCase()}:${p.epoch}:${p.id}`,previous=await context.Match.get(id);
 const endedAt=previous?.endedAt||`${String(event.block.number).padStart(20,'0')}:${String(event.logIndex).padStart(10,'0')}`;
 const value={id,deployment:`10143:${p.app.toLowerCase()}`,rawId:String(p.id),mode:Number(p.mode),ranked:p.ranked,rulesVersion:6,
  playerA:p.a.toLowerCase(),playerB:p.b.toLowerCase(),tournamentId:'0',status:Number(p.status),winner:p.winner.toLowerCase(),
  played:p.played,scoreA:Number(p.scoreA),scoreB:Number(p.scoreB),endedAt,replayAvailability:previous?.replayAvailability||'recording',block:BigInt(event.block.number)};
 const terminal=value.status>=3;
 if(!previous&&terminal)await retainFinished(context,value,endedAt);else context.Match.set(value);
 if(!previous||previous.status===value.status&&previous.winner===value.winner&&previous.scoreA===value.scoreA&&previous.scoreB===value.scoreB&&previous.played===value.played)return;
 // A protocol correction is a new event. Envio separately rolls back L1 reorgs.
 const evicted=new Set<string>();
 for(const player of new Set([value.playerA,value.playerB])){
  const old=await context.RecentReplays.get(player);
  const [a,b]=await Promise.all([context.Match.getWhere({playerA:{_eq:player}}),context.Match.getWhere({playerB:{_eq:player}})]);
  const records=[...new Map<string,any>([...a,...b,value].map((m:any)=>[m.id,m])).values()];
  const keep=records.filter(m=>m.played&&m.status>=3).sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||b.id.localeCompare(a.id)).slice(0,3).map(m=>m.id);
  context.RecentReplays.set({id:player,matches:keep});
  for(const ref of old?.matches||[])if(!keep.includes(ref)&&ref!==id)evicted.add(ref);
 }
 for(const ref of evicted){
  const old=await context.Match.get(ref);if(!old||old.replayAvailability==='pruned')continue;
  const [a,b]=await Promise.all([context.RecentReplays.get(old.playerA),context.RecentReplays.get(old.playerB)]);
  if(a?.matches.includes(ref)||b?.matches.includes(ref))continue;
  const [frames,handicaps]=await Promise.all([context.Frame.getWhere({matchId:{_eq:ref}}),context.Handicap.getWhere({matchId:{_eq:ref}})]);
  for(const frame of frames)context.Frame.deleteUnsafe(frame.id);
  for(const handicap of handicaps)context.Handicap.deleteUnsafe(handicap.id);
  context.Match.set({...old,replayAvailability:'pruned'});
 }
 context.Alert.set({id:`chaos-correction:${id}:${event.block.hash}`,kind:'published_result_corrected',detail:`${id}: published result changed. Existing payments are not sent again.`,block:BigInt(event.block.number)});
 // Never claim that deleted frames reappeared after a correction.
 if(value.replayAvailability!=='pruned')context.Match.set({...value,replayAvailability:terminal?(value.played?'available':'not-played'):'recording'});
}
