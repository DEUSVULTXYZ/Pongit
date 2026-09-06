import { indexer } from 'envio';
const zero = '0x0000000000000000000000000000000000000000';
for(const {version,game,market,tournaments} of [
  {version:"v1",game:"Game",market:"Market",tournaments:"Tournaments"},
  {version:"v2",game:"GameV2",market:"MarketV2",tournaments:"TournamentsV2"},
  {version:"v3",game:"GameV3",market:"MarketV3",tournaments:"TournamentsV3"},
  {version:"v4",game:"GameV4",market:"MarketV4",tournaments:"TournamentsV4"},
] as const) {
indexer.onEvent({ contract:game, event:'MatchCreated' },async({event,context})=>{
  const p=event.params;const id=`${version}:${p.matchId}`;
  context.Match.set({id,deployment:version,rawId:p.matchId.toString(),mode:"mode" in p?Number(p.mode):0,ranked:"ranked" in p?Boolean(p.ranked):true,rulesVersion:"rulesVersion" in p?Number(p.rulesVersion):1,playerA:p.playerA.toLowerCase(),playerB:p.playerB.toLowerCase(),tournamentId:p.tournamentId.toString(),status:1,winner:zero,block:BigInt(event.block.number)});
  const pairId=version+":"+[p.playerA.toLowerCase(),p.playerB.toLowerCase()].sort().join(':');
  const previous=await context.Pair.get(pairId);const count=(previous?.matches||0)+1;
  context.Pair.set({id:pairId,matches:count});
  if(count>=10)context.Alert.set({id:`pair:${pairId}`,kind:'repeated_pair',detail:`${pairId}: ${count} matches; review concentration, do not auto-ban.`,block:BigInt(event.block.number)});
});
indexer.onEvent({contract:game,event:'Snapshot'},async({event,context})=>{
  const p=event.params;context.Frame.set({id:`${version}:${p.matchId}:${p.version}`,matchId:`${version}:${p.matchId}`,version:p.version,state:p.state,clock:p.clock,nextAt:p.nextAt,nextKind:Number(p.nextKind),block:BigInt(event.block.number)});
  const match=await context.Match.get(`${version}:${p.matchId}`);if(match&&match.status===1)context.Match.set({...match,status:2});
});
indexer.onEvent({contract:game,event:'RatingUpdated'},async({event,context})=>{
  const p=event.params;const mode="mode" in p?Number(p.mode):0;const value={deployment:version,mode,address:p.player.toLowerCase(),season:p.season,elo:Number(p.elo),played:Number(p.played),wins:Number(p.wins)};
  context.Player.set({id:`${version}:${mode}:${value.address}`,...value});context.SeasonRating.set({id:`${version}:${mode}:${p.season}:${value.address}`,...value});
});
indexer.onEvent({contract:market,event:'BetPlaced'},async({event,context})=>{
  const p=event.params;context.Bet.set({id:`${event.block.hash}:${event.logIndex}`,matchId:`${version}:${p.matchId}`,player:p.player.toLowerCase(),side:Number(p.side),shares:p.shares,cost:p.cost});
});
indexer.onEvent({contract:game,event:'MatchEnded'},async({event,context})=>{
  const p=event.params;const match=await context.Match.get(`${version}:${p.matchId}`);if(!match)return;
  context.Match.set({...match,status:Number(p.status),winner:p.winner.toLowerCase()});
  const bets=await context.Bet.getWhere({matchId:{_eq:match.id}});
  if(version==="v4" && Number(p.status)>=3) for(const player of new Set(bets.map(b=>b.player))) await candidate(context,event,"market",0,p.matchId.toString(),player);
  if(Number(p.status)!==3)return;
  const loser=p.winner.toLowerCase()===match.playerA?match.playerB:match.playerA;
  const winners=new Set(bets.filter(b=>b.side===(loser===match.playerA?1:0)).map(b=>b.player));
  for(const bettor of winners){const id=`${bettor}:${loser}`;const old=await context.Pattern.get(id);const occurrences=(old?.occurrences||0)+1;
    context.Pattern.set({id,bettor,opponent:loser,occurrences});
    if(occurrences>=3)context.Alert.set({id:`fixing:${id}`,kind:'possible_match_fixing',detail:`${bettor} profited against ${loser} in ${occurrences} matches. Signal only; identities are not proven.`,block:BigInt(event.block.number)});
  }
});
indexer.onEvent({contract:market,event:'Claimed'},async()=>{});
indexer.onEvent({contract:tournaments,event:'TournamentCreated'},async({event,context})=>{const p=event.params;context.Tournament.set({id:`${version}:${p.tournamentId}`,closesAt:p.closesAt,capacity:Number(p.capacity),fee:p.fee,prize:p.prize,round:0n,status:1,winner:zero,bracket:[]});});
indexer.onEvent({contract:tournaments,event:'Registered'},async({event,context})=>{if(version==="v4")context.TournamentEntry.set({id:`v4:${event.params.tournamentId}:${event.params.player.toLowerCase()}`,tournamentId:`v4:${event.params.tournamentId}`,recipient:event.params.player.toLowerCase()});});
indexer.onEvent({contract:tournaments,event:'BracketUpdated'},async({event,context})=>{const p=event.params;const t=await context.Tournament.get(`${version}:${p.tournamentId}`);if(t)context.Tournament.set({...t,round:p.round,status:2,bracket:[...p.bracket]});});
indexer.onEvent({contract:tournaments,event:'TournamentEnded'},async({event,context})=>{const p=event.params;const t=await context.Tournament.get(`${version}:${p.tournamentId}`);if(t)context.Tournament.set({...t,status:Number(p.status),winner:p.winner,prize:p.prize});
  if(version==="v4" && Number(p.status)===4)for(const e of await context.TournamentEntry.getWhere({tournamentId:{_eq:`v4:${p.tournamentId}`}}))await candidate(context,event,"tournaments",2,p.tournamentId.toString(),e.recipient);});

}
for(const [version,game] of [["v2","GameV2"],["v3","GameV3"],["v4","GameV4"]] as const) indexer.onEvent({contract:game,event:"HandicapSet"},async({event,context})=>{
 const p=event.params;
 context.Handicap.set({id:`${version}:${p.matchId}:${event.block.number}:${event.logIndex}`,matchId:`${version}:${p.matchId}`,halfA:p.halfA,halfB:p.halfB,paidA:p.paidA,paidB:p.paidB,clock:p.at,block:BigInt(event.block.number)});
});

async function candidate(context:any,event:any,module:string,kind:number,sourceId:string,recipient:string) {
  recipient=recipient.toLowerCase();const id=`v4:${module}:${kind}:${sourceId}:${recipient}`;
  if(!await context.PayoutCandidate.get(id))context.PayoutCandidate.set({id,deployment:"v4",module,kind,sourceId,recipient,cursor:`${String(event.block.number).padStart(20,"0")}:${String(event.logIndex).padStart(10,"0")}:${id}`});
}
for(const [module,contract] of [["market","MarketV4"],["tournaments","TournamentsV4"]] as const) {
 indexer.onEvent({contract,event:"PayoutCreated"},async({event,context})=>{const p=event.params;await candidate(context,event,module,Number(p.kind),p.sourceId.toString(),p.recipient);context.Payout.set({id:`v4:${module}:${p.payoutId}`,deployment:"v4",module,payoutId:p.payoutId,sourceId:p.sourceId.toString(),recipient:p.recipient.toLowerCase(),kind:Number(p.kind),amount:p.amount,status:"pending",attempts:0,block:BigInt(event.block.number),txHash:event.transaction.hash});});
 indexer.onEvent({contract,event:"PayoutPaid"},async({event,context})=>{const id=`v4:${module}:${event.params.payoutId}`,p=await context.Payout.get(id);if(p)context.Payout.set({...p,status:"paid",attempts:Math.max(1,p.attempts),block:BigInt(event.block.number),txHash:event.transaction.hash});});
 indexer.onEvent({contract,event:"PayoutDeferred"},async({event,context})=>{const id=`v4:${module}:${event.params.payoutId}`,p=await context.Payout.get(id);if(p)context.Payout.set({...p,status:"delayed",attempts:Number(event.params.attempts),block:BigInt(event.block.number),txHash:event.transaction.hash});});
}
