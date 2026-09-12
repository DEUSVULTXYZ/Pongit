import {maxUint256,zeroAddress,type Abi,type Address,type PublicClient} from 'viem';
import {abi as lobbyAbi} from './abi-independent-IndependentLobby';
import {abi as familyAbi} from './abi-independent-ArcadeFamily';
import {abi as arenaAbi} from './abi-independent-IndependentArena';
import {abi as ratingsAbi} from './abi-independent-PublishedRatings';
import {abi as profilesAbi} from './abi-independent-ProfileRegistry';
import type {IndependentManifest} from './independent';
import {engineState} from './engine-stream';
import {readHubDelegation} from './rooms-hub';

export function independentReader(base:PublicClient,m:IndependentManifest,blockNumber?:bigint){
 const call=(address:Address,abi:Abi,name:string,args:readonly unknown[]=[]):Promise<any>=>base.readContract({address,abi,functionName:name,args,blockNumber} as any);
 return {
  lobby:(name:string,args:readonly unknown[]=[])=>call(m.lobby,lobbyAbi,name,args),
  family:(name:string,args:readonly unknown[]=[])=>call(m.family,familyAbi,name,args),
  ratings:(name:string,args:readonly unknown[]=[])=>call(m.ratings,ratingsAbi,name,args),
  profiles:(name:string,args:readonly unknown[]=[])=>call(m.profiles,profilesAbi,name,args),
  arena:(app:Address,name:string,args:readonly unknown[]=[])=>{
   if(!m.arenas.some(a=>a.app.toLowerCase()===app.toLowerCase()))throw Error('Unknown arena deployment');
   return call(app,arenaAbi,name,args);
  },
 };
}
/** A view is pinned to one base block. No database invents occupancy, consent or capacity. */
export async function readIndependentLobby(base:PublicClient,m:IndependentManifest,player?:Address,requestedRoom?:bigint,lastMatch?:{app:Address;id:bigint;epoch:bigint}){
 const block=await base.getBlock(),r=independentReader(base,m,block.number);
 const [occupancy,active,grant]=player?await Promise.all([r.lobby('occupancy',[player]),r.lobby('activeMatchOf',[player]),r.family('grantOf',[player])]):[0n,0n,null];
 const id=occupancy>0n&&occupancy!==maxUint256?occupancy:requestedRoom;
 const [room,queue,inbox]=await Promise.all([
  id?r.lobby('room',[id]):null,
  player&&occupancy===maxUint256?r.lobby('queueOf',[player]):null,
  player?r.lobby('invitationPage',[player,false,0n,50n]):[[],0n],
 ]);
 const invitationRows=await Promise.all((inbox[0] as bigint[]).map(id=>r.lobby('invitation',[id])));
 const invitations=invitationRows.filter(i=>i.status===1&&BigInt(i.expires)>=block.timestamp);
 const proposal=room?.proposal?r.lobby('proposal',[room.proposal]):null;
 const p=await proposal;
 const app=active?await r.lobby('arenaOf',[active]):p?.id?await r.lobby('arenaOf',[p.id]):zeroAddress;
 const binding=app!==zeroAddress?await r.arena(app,'boundMatch'):null;
 const visibleMatch=binding?.id===active||binding?.id===p?.id?binding:null;
 const delegation=visibleMatch?.epoch?await readHubDelegation(base,m.hub,app,block.number):null;
 // A closing node may already be offline. Reconnect through the canonical base
 // snapshot without pretending a partial score is a result or enabling inputs.
 const recoverySnapshot=delegation&&delegation.status!==1?engineState(await r.arena(app,'getSnapshot',[visibleMatch.id])):null;
 if(recoverySnapshot&&recoverySnapshot.id!==visibleMatch.id)throw Error('Recovery snapshot belongs to another match');
 const addresses=[...new Set([player,...(room?.members??[]).map((x:any)=>x.player),...invitations.flatMap(i=>[i.sender,i.recipient])].filter(Boolean))] as Address[];
 const profiles=Object.fromEntries(await Promise.all(addresses.map(async a=>[a.toLowerCase(),await r.profiles('profileOf',[a])])));
 const terminalId=p?.id&&p.status>=3?p.id:!active&&!p?.id&&lastMatch?lastMatch.id:0n;
 const published=terminalId&&await r.ratings('indexOf',[terminalId])?await r.ratings('entry',[terminalId]):null;
 let publishedSnapshot=null;
 if(published&&lastMatch&&published.first.id===lastMatch.id&&published.first.arena.toLowerCase()===lastMatch.app.toLowerCase()&&published.first.epoch===lastMatch.epoch){
  const b=await r.arena(lastMatch.app,'boundMatch');
  if(b.id===lastMatch.id&&b.epoch===lastMatch.epoch){
   const s=engineState(await r.arena(lastMatch.app,'getSnapshot',[lastMatch.id]));
   if(s.id===lastMatch.id&&s.phase>=3&&s.winner===published.latest.winner&&s.state.scoreA===published.latest.scoreA&&s.state.scoreB===published.latest.scoreB)publishedSnapshot=s;
  }
 }
 return {block:block.number,now:block.timestamp,occupancy,active,grant,queue,room,proposal:p,invitations,profiles,binding:visibleMatch,app:visibleMatch?app:null,delegation,recoverySnapshot,published,publishedSnapshot};
}
export async function readIndependentRanking(base:PublicClient,m:IndependentManifest,mode:number){
 if(mode!==0&&mode!==1)throw Error('Unknown mode');
 const block=await base.getBlockNumber(),r=independentReader(base,m,block);
 const rows:any[]=[];let offset=0n,total=0n;
 do{
  const page=await r.ratings('playerPage',[mode,offset,100n]);total=page[1];
  rows.push(...await Promise.all(page[0].map(async (player:Address)=>({player,...await r.ratings('ratingOf',[player,mode]),profile:await r.profiles('profileOf',[player])}))));
  offset+=100n;
 }while(offset<total);
 rows.sort((a,b)=>Number(b.elo)-Number(a.elo)||a.player.toLowerCase().localeCompare(b.player.toLowerCase()));
 return {block,mode,rows,generation:await r.ratings('generation'),rebuilding:await r.ratings('buildGeneration')};
}
