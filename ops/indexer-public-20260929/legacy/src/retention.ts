// Entity writes/deletes participate in Envio rollback. No external DB writes
// or background deletion can resurrect an inconsistent retention list.
export function snapshotScores(encoded:string){
  if(!/^0x[\da-fA-F]+$/.test(encoded)||encoded.length<2+13*64)throw new Error("Invalid physics snapshot");
  return {scoreA:Number(BigInt("0x"+encoded.slice(2+9*64,2+10*64))),scoreB:Number(BigInt("0x"+encoded.slice(2+10*64,2+11*64)))};
}
export async function retainFinished(context:any,match:any,endedAt:string){
  const ended={...match,endedAt,replayAvailability:match.played?"available":"not-played"};
  context.Match.set(ended);
  if(!match.played)return;
  const evicted=new Set<string>();
  for(const player of new Set<string>([match.playerA,match.playerB])){
    const old=await context.RecentReplays.get(player);
    const refs=[...new Set<string>([...(old?.matches||[]),match.id])];
    const records=await Promise.all(refs.map(async id=>id===match.id?ended:await context.Match.get(id)));
    const ordered=records.filter(Boolean).sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||b.id.localeCompare(a.id));
    const keep=ordered.slice(0,3).map(m=>m.id);
    context.RecentReplays.set({id:player,matches:keep});
    for(const m of ordered.slice(3))evicted.add(m.id);
  }
  for(const id of evicted){
    const old=await context.Match.get(id);if(!old)continue;
    const [a,b]=await Promise.all([context.RecentReplays.get(old.playerA),context.RecentReplays.get(old.playerB)]);
    if(a?.matches.includes(id)||b?.matches.includes(id))continue;
    const [frames,handicaps]=await Promise.all([context.Frame.getWhere({matchId:{_eq:id}}),context.Handicap.getWhere({matchId:{_eq:id}})]);
    for(const f of frames)context.Frame.deleteUnsafe(f.id);
    for(const h of handicaps)context.Handicap.deleteUnsafe(h.id);
    context.Match.set({...old,replayAvailability:"pruned"});
  }
}
