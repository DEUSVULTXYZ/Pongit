import { indexer } from 'envio';
const zero = '0x0000000000000000000000000000000000000000';
indexer.onEvent({ contract:'Game', event:'MatchCreated' },async({event,context})=>{
  const p=event.params;const id=p.matchId.toString();
  context.Match.set({id,playerA:p.playerA.toLowerCase(),playerB:p.playerB.toLowerCase(),tournamentId:p.tournamentId.toString(),status:1,winner:zero,block:BigInt(event.block.number)});
  const pairId=[p.playerA.toLowerCase(),p.playerB.toLowerCase()].sort().join(':');
  const previous=await context.Pair.get(pairId);const count=(previous?.matches||0)+1;
  context.Pair.set({id:pairId,matches:count});
  if(count>=10)context.Alert.set({id:`pair:${pairId}`,kind:'repeated_pair',detail:`${pairId}: ${count} matches; review concentration, do not auto-ban.`,block:BigInt(event.block.number)});
});
indexer.onEvent({contract:'Game',event:'Snapshot'},async({event,context})=>{
  const p=event.params;context.Frame.set({id:`${p.matchId}:${p.version}`,matchId:p.matchId.toString(),version:p.version,state:p.state,clock:p.clock,nextAt:p.nextAt,nextKind:Number(p.nextKind),block:BigInt(event.block.number)});
  const match=await context.Match.get(p.matchId.toString());if(match&&match.status===1)context.Match.set({...match,status:2});
});
indexer.onEvent({contract:'Game',event:'RatingUpdated'},async({event,context})=>{
  const p=event.params;const value={address:p.player.toLowerCase(),season:p.season,elo:Number(p.elo),played:Number(p.played),wins:Number(p.wins)};
  context.Player.set({id:value.address,...value});context.SeasonRating.set({id:`${p.season}:${value.address}`,...value});
});
indexer.onEvent({contract:'Market',event:'BetPlaced'},async({event,context})=>{
  const p=event.params;context.Bet.set({id:`${event.block.hash}:${event.logIndex}`,matchId:p.matchId.toString(),player:p.player.toLowerCase(),side:Number(p.side),shares:p.shares,cost:p.cost});
});
indexer.onEvent({contract:'Game',event:'MatchEnded'},async({event,context})=>{
  const p=event.params;const match=await context.Match.get(p.matchId.toString());if(!match)return;
  context.Match.set({...match,status:Number(p.status),winner:p.winner.toLowerCase()});
  if(Number(p.status)!==3)return;
  const bets=await context.Bet.getWhere({matchId:{_eq:match.id}});
  const loser=p.winner.toLowerCase()===match.playerA?match.playerB:match.playerA;
  const winners=new Set(bets.filter(b=>b.side===(loser===match.playerA?1:0)).map(b=>b.player));
  for(const bettor of winners){const id=`${bettor}:${loser}`;const old=await context.Pattern.get(id);const occurrences=(old?.occurrences||0)+1;
    context.Pattern.set({id,bettor,opponent:loser,occurrences});
    if(occurrences>=3)context.Alert.set({id:`fixing:${id}`,kind:'possible_match_fixing',detail:`${bettor} profited against ${loser} in ${occurrences} matches. Signal only; identities are not proven.`,block:BigInt(event.block.number)});
  }
});
indexer.onEvent({contract:'Market',event:'Claimed'},async()=>{});
indexer.onEvent({contract:'Tournaments',event:'TournamentCreated'},async({event,context})=>{const p=event.params;context.Tournament.set({id:p.tournamentId.toString(),closesAt:p.closesAt,capacity:Number(p.capacity),fee:p.fee,prize:p.prize,round:0n,status:1,winner:zero,bracket:[]});});
indexer.onEvent({contract:'Tournaments',event:'Registered'},async()=>{});
indexer.onEvent({contract:'Tournaments',event:'BracketUpdated'},async({event,context})=>{const p=event.params;const t=await context.Tournament.get(p.tournamentId.toString());if(t)context.Tournament.set({...t,round:p.round,status:2,bracket:[...p.bracket]});});
indexer.onEvent({contract:'Tournaments',event:'TournamentEnded'},async({event,context})=>{const p=event.params;const t=await context.Tournament.get(p.tournamentId.toString());if(t)context.Tournament.set({...t,status:Number(p.status),winner:p.winner,prize:p.prize});});
