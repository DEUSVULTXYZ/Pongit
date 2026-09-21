import {createHash} from 'node:crypto';
import {encodeAbiParameters,keccak256,zeroAddress,zeroHash,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {agentArenaPoolAbi as poolAbi} from '../../../shared/abi-AgentArenaPool';
import {agentSeriesPoolAbi as seriesPoolAbi} from '../../../shared/abi-AgentSeriesPool';
import {seriesAgentArenaAbi as seriesArenaAbi} from '../../../shared/abi-SeriesAgentArena';
import {reusableAgentPoolAbi} from '../../../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi} from '../../../shared/abi-ReusableAgentArena';
import {agentCatalogAbi as catalogAbi} from '../../../shared/abi-AgentCatalog';
import {agentTournamentsAbi as tournamentAbi} from '../../../shared/abi-AgentTournaments';
import {agentPublishedRatingsAbi as ratingsAbi} from '../../../shared/abi-AgentPublishedRatings';
import {pooledAgentArenaAbi as arenaAbi} from '../../../shared/abi-PooledAgentArena';
import {agentChallengesAbi as challengeAbi} from '../../../shared/abi-AgentChallenges';
import type {PoolChallengeView} from '../../../shared/agent-pool';
import {pooledHouseBots,tournamentStatuses,validateAgentPoolManifest,type AgentPoolManifest,type TournamentView,type PoolMatchView} from '../../../shared/agent-pool';
import type {AgentMatchRef} from '../../../shared/agents';
import {houseInstanceAbi,verifyHouseInstanceAuthorities} from '../../../shared/agent-house-instances';

type Ref={chainId:bigint;arena:Address;epoch:bigint;id:bigint};
const refView=(r:Ref):AgentMatchRef=>({chainId:10143,app:r.arena,epoch:String(r.epoch),id:String(r.id)});
const refKey=(r:Ref)=>keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],[r.chainId,r.arena,r.epoch,r.id]));
export const poolJson=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
export const poolNotFound=()=>Object.assign(Error('Agent Arcade record not found'),{status:404,code:'AGENT_NOT_FOUND'});
const pageBounds=(offset:bigint,limit:number)=>{
 if(offset<0n||!Number.isInteger(limit)||limit<1||limit>32)throw Object.assign(Error('Use a non-negative offset and a limit from 1 to 32'),{status:400,code:'AGENT_PAGE_BOUNDS'});
};

/** A bounded, block-consistent view of the common contracts. No database is a
 * source of scores, standings, identities or qualification. No engine calls,
 * signatures or operator key are needed to reconstruct these pages. */
export class AgentPoolReader {
 readonly manifest:AgentPoolManifest;
 constructor(readonly client:PublicClient,manifest:AgentPoolManifest,humanApps:readonly string[]=[]){
  this.manifest=validateAgentPoolManifest(manifest,humanApps);
 }
 private get poolAbi():Abi{return this.manifest.version===4?reusableAgentPoolAbi:this.manifest.version===3?seriesPoolAbi:poolAbi;}
 private get arenaAbi():Abi{return this.manifest.version===4?reusableAgentArenaAbi:this.manifest.version===3?seriesArenaAbi:arenaAbi;}
 private async snapshot<T>(work:(read:<R=any>(address:Address,abi:Abi,fn:string,args?:readonly unknown[])=>Promise<R>,block:bigint)=>Promise<T>,at?:bigint){
  const block=await this.client.getBlock(at===undefined?{}:{blockNumber:at});
  const read=<R=any>(address:Address,abi:Abi,functionName:string,args:readonly unknown[]=[])=>
   this.client.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<R>;
  const value=await work(read,block.number);
  const confirmed=await this.client.getBlock({blockNumber:block.number});
  if(confirmed.hash!==block.hash)throw Object.assign(Error('Published state changed during synchronization'),{status:503,code:'AGENT_PUBLICATION_CHANGED'});
  return {value,observedBlock:String(block.number),observedHash:block.hash,observedTimestamp:String(block.timestamp),
   revision:createHash('sha256').update(JSON.stringify(value,(k,v)=>k==='observedBlock'?undefined:typeof v==='bigint'?String(v):v)).digest('hex')};
 }
 async config(){
  const m=this.manifest;
  return this.snapshot(async read=>{
   await verifyHouseInstanceAuthorities(read,m);
   const [admissions,publicAdmissions,evidence,tournamentsOpen,arenas]=await Promise.all([
    read<boolean>(m.pool,this.poolAbi,'admissions'),read<boolean>(m.pool,this.poolAbi,'publicAdmissions'),
    read<string>(m.pool,this.poolAbi,'capacityEvidence'),read<boolean>(m.tournaments,tournamentAbi,'admissions'),
    read<Address[]>(m.pool,this.poolAbi,'arenaPage'),
   ]);
   if(arenas.length!==m.arenas.length||arenas.some((a,i)=>a.toLowerCase()!==m.arenas[i].app.toLowerCase()))
    throw Error('Configured arenas differ from the common contract');
   const qualified=m.verifiedCapacity===2&&!!m.qualificationEvidence&&evidence.toLowerCase()===m.qualificationEvidence.toLowerCase();
   const preview=m.releaseStage==='testnet-preview'&&!!m.previewEvidence&&evidence.toLowerCase()===m.previewEvidence.toLowerCase();
   const enabled=m.enabled&&(qualified||preview)&&admissions&&publicAdmissions;
   return {...m,enabled,qualified,tournamentsEnabled:enabled&&m.tournamentsEnabled&&tournamentsOpen,
    registration:{strategies:true,realtime:false},financial:false,validation:qualified?'qualified':preview?'testnet-preview':'private-qualification'};
  });
 }
 async catalog(offset=0n,limit=16){
  pageBounds(offset,limit);const m=this.manifest;
  return this.snapshot(async read=>{
   const total=await read<bigint>(m.catalog,catalogAbi,'count');
   const size=Number(total>offset?(total-offset>BigInt(limit)?BigInt(limit):total-offset):0n);
   const addresses=await Promise.all(Array.from({length:size},(_,i)=>read<Address>(m.catalog,catalogAbi,'at',[offset+BigInt(i)])));
   const items=await Promise.all(addresses.map(async agent=>{
    const [p,participation,playing]=await Promise.all([
     read(m.catalog,catalogAbi,'identity',[agent]),read(m.catalog,catalogAbi,'participation',[agent]),read(m.pool,this.poolAbi,'playing',[agent]),
    ]);
    const official=p.house>0&&p.house<=8&&String(await read(m.catalog,catalogAbi,'house',[p.house-1])).toLowerCase()===agent.toLowerCase();
    const bot=official?pooledHouseBots[p.house-1]:null;
    const instances=m.houseInstances&&official?await Promise.all([0,1].map(mode=>read<boolean>(m.challenges,houseInstanceAbi,'houseInstanceEligible',[agent,mode]))):[false,false];
    return {agent,creator:p.creator,controllerHash:p.codeHash,metadata:p.metadata,kind:official?'pongit':'strategy',official,
     name:bot?.name??`${agent.slice(0,6)}…${agent.slice(-4)}`,avatar:bot?.avatar??9,difficulty:bot?.difficulty??'Community strategy',
     modes:[0,1].filter(mode=>(p.modes&(1<<mode))!==0),qualification:{0:(p.qualified&1)!==0,1:(p.qualified&2)!==0},
     available:p.available,participation,playing,waiting:participation!==zeroHash&&!instances.some(Boolean),
     friendlyInstances:{0:instances[0],1:instances[1]},lastTournament:String(p.lastTournament)};
   }));
   return {items,total:String(total),offset:String(offset),next:offset+BigInt(size)<total?String(offset+BigInt(size)):null};
  });
 }
 async tournaments(offset=0n,limit=8){
  pageBounds(offset,limit);const m=this.manifest;
  return this.snapshot(async read=>{
   const total=await read<bigint>(m.tournaments,tournamentAbi,'count');
   const size=Number(total>offset?(total-offset>BigInt(limit)?BigInt(limit):total-offset):0n);
   const items=await Promise.all(Array.from({length:size},async(_,i)=>{
    const id=total-offset-BigInt(i),t=await read(m.tournaments,tournamentAbi,'tournament',[id]);
    return {id:String(id),mode:t.mode,format:t.league?'championship':'elimination',status:tournamentStatuses[t.status],
     revision:t.revision,champion:t.champion,startedAt:String(t.startedAt),completedAt:String(t.completedAt),participants:t.selected};
   }));
   return {items,total:String(total),offset:String(offset),next:offset+BigInt(size)<total?String(offset+BigInt(size)):null,
    nextAt:String(await read<bigint>(m.tournaments,tournamentAbi,'nextAt'))};
  });
 }
 async tournament(id:bigint){
  if(id<1n||id>2n**64n-1n)throw poolNotFound();const m=this.manifest;
  return this.snapshot(async(read,block):Promise<TournamentView>=>{
   const [t,count,nextAt]=await Promise.all([read(m.tournaments,tournamentAbi,'tournament',[id]),
    read<bigint>(m.tournaments,tournamentAbi,'count'),read<bigint>(m.tournaments,tournamentAbi,'nextAt')]);
   if(!t.status||id>count)throw poolNotFound();
   const [fixtures,standings]=await Promise.all([
    Promise.all(Array.from({length:t.league?28:7},async(_,index)=>{
     const f=await read(m.tournaments,tournamentAbi,'fixture',[id,index]),r=f.published;
     return {index,ref:f.bound?refView(f.ref):null,a:f.a,b:f.b,advanced:f.advanced,resolved:f.resolved,
      administrative:f.administrative,attempt:f.attempt,result:r.hash!==zeroHash?{hash:r.hash,winner:r.winner,status:r.status,
       scoreA:r.scoreA,scoreB:r.scoreB,elapsedUs:String(r.elapsedUs),finality:r.finality}:null};
    })),read(m.tournaments,tournamentAbi,'standings',[id]),
   ]);
   // Unbound future fixtures have no participants stored yet. Derive them from
   // the same deterministic bracket, without displaying invalidated old seats.
   for(const f of fixtures)if(!f.ref){
    if(t.league){let n=0;for(let a=0;a<7;a++)for(let b=a+1;b<8;b++)if(n++===f.index){f.a=t.agents[a];f.b=t.agents[b];}}
    else if(f.index<4){f.a=t.agents[f.index*2];f.b=t.agents[f.index*2+1];}
    else{const first=f.index===6?4:(f.index-4)*2;
     f.a=fixtures[first].resolved?fixtures[first].advanced:zeroAddress;
     f.b=fixtures[first+1].resolved?fixtures[first+1].advanced:zeroAddress;
    }
   }
   return {id:String(id),mode:t.mode,format:t.league?'championship':'elimination',status:tournamentStatuses[t.status],revision:t.revision,
    champion:t.champion,startedAt:t.startedAt?String(t.startedAt):null,completedAt:t.completedAt?String(t.completedAt):null,
    entrants:t.agents.map((agent:Address,i:number)=>({agent,controllerHash:t.controllers[i],initialElo:t.seeds[i]})).filter((e:{agent:Address})=>e.agent!==zeroAddress),
    fixtures,standings,observedBlock:String(block),published:true,nextAt:id===count&&nextAt?String(nextAt):null};
  });
 }
 async live(){
  const m=this.manifest;
  return this.snapshot(async read=>{
   if(m.version===4){
    const records=await Promise.all([0,1].map(lane=>read(m.pool,this.poolAbi,'laneRecord',[lane])));
    const items=await Promise.all(records.filter(r=>r.ref.id&&!r.captured).map(async r=>{
     const arena=m.arenas.find(a=>a.app.toLowerCase()===r.ref.arena.toLowerCase());if(!arena)throw Error('Assigned arena is outside this deployment');
     const [,b]=await read(m.pool,this.poolAbi,'ticketOf',[r.ref]);
     if(b.id!==r.ref.id||b.epoch!==r.ref.epoch||b.a.toLowerCase()!==r.a.toLowerCase()||b.b.toLowerCase()!==r.b.toLowerCase())throw Error('Admission binding differs from its assignment');
     return{ref:refView(r.ref),node:arena.node,a:r.a,b:r.b,mode:b.mode,ranked:r.ranked,tournament:String(r.tournament),
      lane:r.lane===0?'tournament':b.controlA.codeHash!==zeroHash?'qualification':'challenge',source:'published-admission',liveConfirmed:false};
    }));
    return{items};
   }
   const series=m.version===3;
   const lanes=series?await Promise.all(['activeSeries','qualificationSeries'].map(fn=>read<string>(m.pool,seriesPoolAbi,fn)))
    :await Promise.all([0,1].map(i=>read<string>(m.pool,this.poolAbi,'laneMatch',[BigInt(i)])));
   const bindings=await Promise.all(m.arenas.map(async arena=>({arena,b:await read(arena.app,arenaAbi,'boundMatch')})));
   const captured=new Set(series?(await Promise.all(bindings.filter(x=>x.b.id).map(async({b})=>{
    const record=await read(m.pool,seriesPoolAbi,'record',[b.id]);return record.captured?String(b.id):'';
   }))).filter(Boolean):[]);
   return {items:bindings.flatMap(({arena,b})=>{
    if(!b.id||captured.has(String(b.id)))return[];const r={chainId:10143n,arena:arena.app,epoch:b.epoch,id:b.id},key=refKey(r),
     lane=lanes.findIndex(value=>value.toLowerCase()===(series?arena.app:key).toLowerCase());
    return lane<0?[]:[{ref:refView(r),node:arena.node,a:b.a,b:b.b,mode:b.mode,ranked:b.ranked,tournament:String(b.tournament),
     lane:lane===0?'tournament':b.controlA.codeHash!==zeroHash?'qualification':'challenge',source:'published-admission',liveConfirmed:false}];
   })};
 });
 }
 async challenge(player:Address){
  const m=this.manifest;
  return this.snapshot(async(read):Promise<{request:PoolChallengeView|null}>=>{
   const id=await read<bigint>(m.challenges,challengeAbi,'pending',[player]);if(!id)return{request:null};
   const request=await read(m.challenges,challengeAbi,'requests',[id]);
   // Public mapping getter returns a tuple, unlike the struct-returning methods.
   const [owner,agent,mode,status,at]=request;
   if(owner.toLowerCase()!==player.toLowerCase()||![1,2].includes(status))throw Error('Challenge participation changed');
   let ref:AgentMatchRef|null=null;
   if(status===2){
    const playing=await read<string>(m.pool,this.poolAbi,'playing',[player]);
    if(m.version===4){
     const r=await read(m.pool,this.poolAbi,'laneRecord',[1]);
     if(!r.ref.id||refKey(r.ref)!==playing||r.a.toLowerCase()!==player.toLowerCase()||r.b.toLowerCase()!==agent.toLowerCase()
      ||await read<bigint>(m.pool,this.poolAbi,'challengeOf',[playing])!==id)throw Error('The active challenge has no matching arena reference');
     if(!m.arenas.some(a=>a.app.toLowerCase()===r.ref.arena.toLowerCase()))throw Error('Challenge arena is outside this deployment');
     ref=refView(r.ref);
    }else{
    const bindings=await Promise.all(m.arenas.map(async arena=>({arena,b:await read(arena.app,arenaAbi,'boundMatch')})));
    for(const {arena,b} of bindings){
     const r={chainId:10143n,arena:arena.app,epoch:b.epoch,id:b.id};
     if(b.id&&refKey(r)===playing&&b.a.toLowerCase()===player.toLowerCase()&&b.b.toLowerCase()===agent.toLowerCase()
      &&await read<bigint>(m.pool,m.version===3?seriesPoolAbi:poolAbi,'challengeOf',[m.version===3?b.id:playing])===id){ref=refView(r);break;}
    }
    if(!ref)throw Error('The active challenge has no matching arena reference');
    }
   }
   let waitReason:PoolChallengeView['waitReason'],tournamentId:string|undefined;
   if(status===1&&m.version===4){
    const independent=m.houseInstances&&await read<boolean>(m.challenges,houseInstanceAbi,'houseInstanceEligible',[agent,mode]);
    if(independent)waitReason='arena';
    else{
    const [identity,participation,playing]=await Promise.all([read(m.catalog,catalogAbi,'identity',[agent]),
     read<string>(m.catalog,catalogAbi,'participation',[agent]),read<string>(m.pool,this.poolAbi,'playing',[agent])]);
    waitReason=playing!==zeroHash?'match':'arena';
    if(identity.lastTournament>0n&&participation===await read<string>(m.tournaments,tournamentAbi,'token',[identity.lastTournament])){
     waitReason='tournament';tournamentId=String(identity.lastTournament);
    }
    }
   }
   return{request:{id:String(id),player:owner,agent,mode,status,at:String(at),ref,...(waitReason?{waitReason,tournamentId}:{})}};
  });
 }
 async match(ref:AgentMatchRef):Promise<{value:PoolMatchView;observedBlock:string;observedHash:Hex;observedTimestamp:string;revision:string}>{
  const m=this.manifest,arena=m.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase());
  if(!arena){
   const predecessor=m.history?.find(prior=>prior.arenas.some(a=>a.app.toLowerCase()===ref.app.toLowerCase()));
   if(predecessor){
    const old=await new AgentPoolReader(this.client,predecessor).match(ref);
    // An old URL always resolves to its original authority. Never treat a
    // restored retired node as a new live game or authorize controls there.
    if(!old.value.result)throw Object.assign(Error('Historical match has no published result'),{status:503,code:'AGENT_HISTORY_UNPUBLISHED'});
    const value:PoolMatchView={...old.value,node:null,currentBinding:false};
    return {...old,value,revision:createHash('sha256').update(poolJson(value)).digest('hex')};
   }
  }
  if(!arena||ref.chainId!==10143||!/^\d{1,78}$/.test(ref.epoch)||!/^\d{1,78}$/.test(ref.id)
   ||BigInt(ref.epoch)<1n||BigInt(ref.id)<1n||BigInt(ref.epoch)>=2n**256n||BigInt(ref.id)>=2n**256n)throw poolNotFound();
  const wanted:Ref={chainId:10143n,arena:arena.app,epoch:BigInt(ref.epoch),id:BigInt(ref.id)};
  return this.snapshot(async(read):Promise<PoolMatchView>=>{
   const series=m.version===3;
   const record=await read(m.pool,this.poolAbi,'record',[series?wanted.id:wanted]);
   if(record.ref.arena.toLowerCase()!==arena.app.toLowerCase()||record.ref.id!==wanted.id||record.ref.epoch!==wanted.epoch||record.ref.chainId!==10143n)throw poolNotFound();
   const binding=await read(arena.app,this.arenaAbi,'boundMatch');let current=binding.id===wanted.id&&binding.epoch===wanted.epoch;
   const own=m.version===4?(await read(m.pool,this.poolAbi,'ticketOf',[wanted]))[1]:series?await read(arena.app,seriesArenaAbi,'bindingFor',[wanted.id]):binding;
   if(m.version===4&&(own.id!==wanted.id||own.epoch!==wanted.epoch||own.a.toLowerCase()!==record.a.toLowerCase()||own.b.toLowerCase()!==record.b.toLowerCase()))throw poolNotFound();
   if(series&&(own.id!==wanted.id||own.epoch!==wanted.epoch))throw poolNotFound();
   const r=record.captured?await read(m.pool,this.poolAbi,'result',[wanted]):null;
   // The current Monad assignment authorizes observation before the engine's
   // new binding is republished. The observer still verifies the engine epoch,
   // logical match and both participants before accepting any snapshot.
   if(m.version===4)current=!r&&await read<string>(m.pool,this.poolAbi,'arenaMatch',[arena.app])===refKey(wanted);
   if(m.version===2&&!current&&!r)throw Error('An archived arena reference has no verified result yet');
   // An old link always reads its immutable pool record. It never follows the
   // node into the replacement match when this physical arena is reused.
   return{ref:{chainId:10143,app:arena.app,epoch:String(wanted.epoch),id:String(wanted.id)},a:record.a,b:record.b,
    mode:r?.mode??own.mode,ranked:record.ranked,tournament:String(record.tournament),lane:series?(record.tournament===0n?1:0):record.lane,
    node:current&&!r?arena.node:null,currentBinding:current,regulationSeconds:300,
    overtimeSeconds:record.tournament!==0n&&!(await read(m.tournaments,tournamentAbi,'tournament',[record.tournament])).league?60:0,
    result:r?{hash:r.hash,winner:r.winner,status:r.status,scoreA:r.scoreA,scoreB:r.scoreB,elapsedUs:String(r.elapsedUs),finality:r.finality}:null};
  });
 }
 async rankings(mode:0|1,offset=0n,limit=32,at?:bigint){
  pageBounds(offset,limit);if(mode!==0&&mode!==1)throw Error('Invalid mode');const m=this.manifest;
  return this.snapshot(async read=>{
   const [page,total]=await read<readonly [Address[],bigint]>(m.ratings,ratingsAbi,'playerPage',[mode,offset,BigInt(limit)]);
   const items=await Promise.all(page.map(async agent=>({agent,...await read(m.ratings,ratingsAbi,'ratingOf',[agent,mode])})));
   return {items,total:String(total),offset:String(offset),next:offset+BigInt(page.length)<total?String(offset+BigInt(page.length)):null,
    // Discovery pages are not global ranks. The client must collect all pages,
    // then sort ELO descending and address ascending at one observed block.
    order:'registry',mode,source:'published',finality:'includes-contestable-results',
    correcting:(await read<bigint>(m.ratings,ratingsAbi,'buildGeneration'))!==0n};
  },at);
 }
}
