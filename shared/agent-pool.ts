import {getAddress,isAddress,type Address,type Hex} from 'viem';
import {houseBots,type AgentMatchRef} from './agents';

// Legacy deployments keep their three-entry catalogue and decoder. New official
// identities are the eight addresses in AgentCatalog.house(), never these names.
export const pooledHouseBots=[
 ...houseBots,
 {name:'VECTOR',difficulty:'Wall reader',avatar:2,reactionMs:120,error:12,deadZone:7},
 {name:'DRIFT',difficulty:'Mobile defender',avatar:4,reactionMs:110,error:20,deadZone:9},
 {name:'ECHO',difficulty:'Adaptive',avatar:7,reactionMs:140,error:15,deadZone:8},
 {name:'GLITCH',difficulty:'Unpredictable aim',avatar:9,reactionMs:130,error:42,deadZone:8},
 {name:'VIPER',difficulty:'Edge chaser',avatar:11,reactionMs:105,error:10,deadZone:5},
] as const;
export type PoolArena={app:Address;node:string;runtimeHash:Hex};
export type AgentPoolManifest={
 releaseStage?:'testnet-preview';previewEvidence?:Hex;
 countdownClock?:'engine-ticks-v1';
 houseInstances?:'official-v1';
 // Read-only retired authorities. They never supply an admission, signing
 // target, capacity slot or engine origin for the current deployment.
 history?:AgentPoolManifest[];
 version:2|3|4;chainId:10143;engineChainId:4242;rulesVersion:10|11|15;hub:Address;pool:Address;catalog:Address;
 tournaments:Address;ratings:Address;challenges:Address;qualifications:Address;family:Address;arenas:PoolArena[];
 enabled:boolean;tournamentsEnabled:boolean;verifiedCapacity:0|2;qualificationEvidence:Hex|null;
 durationSeconds:300;overtimeSeconds:60;intervalSeconds:60;maxMatches:2;
};
export function validateAgentPoolManifest(m:AgentPoolManifest,humanApps:readonly string[]=[]):AgentPoolManifest {
 const preview=m.releaseStage==='testnet-preview';
 if(m.releaseStage!==undefined&&!preview)throw Error('Unsupported release stage');
 if(preview&&(m.version!==4||m.verifiedCapacity!==0||m.qualificationEvidence!==null||!m.previewEvidence||!/^0x[\da-f]{64}$/i.test(m.previewEvidence)||BigInt(m.previewEvidence)===0n))throw Error('Testnet preview must retain incomplete qualification and explicit review evidence');
 if(!preview&&m.previewEvidence!==undefined)throw Error('Preview evidence requires the preview stage');
 if(m.countdownClock!==undefined&&(m.version!==4||m.countdownClock!=='engine-ticks-v1'))throw Error('Unsupported countdown clock');
 if(m.houseInstances!==undefined&&(m.version!==4||m.houseInstances!=='official-v1'))throw Error('Unsupported house instances');
 if(!(m.version===2&&m.rulesVersion===10||m.version===3&&m.rulesVersion===11||m.version===4&&m.rulesVersion===15)||m.chainId!==10143||m.engineChainId!==4242
  ||m.durationSeconds!==300||m.overtimeSeconds!==60||m.intervalSeconds!==60||m.maxMatches!==2)throw Error('Unsupported Agent Arcade pool rules');
 if(typeof m.enabled!=='boolean'||typeof m.tournamentsEnabled!=='boolean')throw Error('Explicit boolean admission gates required');
 const contracts=[m.hub,m.pool,m.catalog,m.tournaments,m.ratings,m.challenges,m.qualifications,m.family];
 if(contracts.some(x=>!isAddress(x)||BigInt(x)===0n))throw Error('Invalid common contract address');
 if(new Set(contracts.map(x=>x.toLowerCase())).size!==contracts.length)throw Error('Common contracts must be distinct');
 const minimum=m.version===3?2:3,maximum=m.version===3?16:32;
 if(!Array.isArray(m.arenas)||m.arenas.length<minimum||m.arenas.length>maximum)throw Error(`Independent arena pool requires ${minimum} to ${maximum} configured arenas`);
 const forbidden=new Set([...humanApps,...contracts].map(x=>x.toLowerCase())),seen=new Set<string>();
 for(const a of m.arenas){
  if(!isAddress(a.app)||BigInt(a.app)===0n||forbidden.has(a.app.toLowerCase())||seen.has(a.app.toLowerCase()))throw Error('Arena is duplicated or belongs to another space');
  seen.add(a.app.toLowerCase());const url=new URL(a.node);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Arena node must be a credential-free HTTPS origin');
  if(!/^0x[\da-f]{64}$/i.test(a.runtimeHash))throw Error('Missing arena runtime hash');
 }
 if(m.verifiedCapacity!==0&&m.verifiedCapacity!==2)throw Error('Unsupported verified capacity');
 if(m.enabled&&!preview&&(m.verifiedCapacity!==2||!m.qualificationEvidence||!/^0x[\da-f]{64}$/i.test(m.qualificationEvidence)||BigInt(m.qualificationEvidence)===0n))throw Error('Public Agent Arcade requires a reviewed capacity qualification');
 if(m.tournamentsEnabled&&!m.enabled)throw Error('Tournaments cannot open while Agent Arcade is closed');
 if(m.qualificationEvidence!==null&&!/^0x[\da-f]{64}$/i.test(m.qualificationEvidence))throw Error('Invalid qualification reference');
 let history:AgentPoolManifest[]|undefined;
 if(m.history!==undefined){
  if(!Array.isArray(m.history)||m.history.length<1||m.history.length>8)throw Error('Retired authority bounds');
  const pools=new Set([m.pool.toLowerCase()]),allArenas=new Set(seen);
  history=m.history.map(prior=>{
   if(prior.history!==undefined||prior.enabled!==false||prior.tournamentsEnabled!==false)throw Error('Historical authorities must be flat and read-only');
   const safe=validateAgentPoolManifest(prior,humanApps);
   if(pools.has(safe.pool.toLowerCase()))throw Error('Duplicate historical authority');pools.add(safe.pool.toLowerCase());
   for(const arena of safe.arenas){
    if(allArenas.has(arena.app.toLowerCase()))throw Error('Ambiguous historical arena');allArenas.add(arena.app.toLowerCase());
   }
   return safe;
  });
 }
 // Deployment journals may contain operator state next to these fields. Never
 // serialize unknown fields or nested arena properties to a browser.
 return {version:m.version,...(preview?{releaseStage:'testnet-preview' as const,previewEvidence:m.previewEvidence}:{}),...(m.countdownClock?{countdownClock:m.countdownClock}:{}),...(m.houseInstances?{houseInstances:m.houseInstances}:{}),...(history?{history}:{}),chainId:10143,engineChainId:4242,rulesVersion:m.rulesVersion,hub:m.hub,pool:m.pool,catalog:m.catalog,tournaments:m.tournaments,
  ratings:m.ratings,challenges:m.challenges,qualifications:m.qualifications,family:m.family,arenas:m.arenas.map(a=>({app:a.app,node:a.node,runtimeHash:a.runtimeHash})),
  enabled:m.enabled,tournamentsEnabled:m.tournamentsEnabled,verifiedCapacity:m.verifiedCapacity,qualificationEvidence:m.qualificationEvidence,
  durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
}
/** An explicit preview review does not claim completed capacity/soak qualification. */
export function agentPoolReleaseEvidence(m:AgentPoolManifest):Hex|null{
 return m.releaseStage==='testnet-preview'?m.previewEvidence??null:m.verifiedCapacity===2?m.qualificationEvidence:null;
}
export type TournamentFormat='elimination'|'championship';
export const tournamentStatuses=['none','selecting','playing','complete','repair-waiting'] as const;
export type TournamentStatus=typeof tournamentStatuses[number];
export function scheduledTournament(id:bigint):{mode:0|1;format:TournamentFormat}{
 if(id<1n)throw Error('Invalid tournament id');return{mode:Number((id-1n)%2n) as 0|1,format:(id-1n)%4n>=2n?'championship':'elimination'};
}
export type TournamentEntrant={agent:Address;controllerHash:Hex;initialElo:number};
export type TournamentFixture={index:number;ref:AgentMatchRef|null;a:Address;b:Address;advanced:Address;resolved:boolean;administrative:boolean;
 attempt:number;result:{hash:Hex;winner:Address;status:number;scoreA:number;scoreB:number;elapsedUs:string;finality:boolean}|null};
export type TournamentView={id:string;mode:0|1;format:TournamentFormat;status:TournamentStatus;revision:number;startedAt:string|null;completedAt:string|null;
 champion:Address;entrants:TournamentEntrant[];fixtures:TournamentFixture[];standings:{agent:Address;points:number;difference:number;wins:number;initialElo:number}[];
 observedBlock:string;published:true;nextAt:string|null};
export type PoolMatchView={ref:AgentMatchRef;a:Address;b:Address;mode:0|1;ranked:boolean;tournament:string;lane:number;
 node:string|null;currentBinding:boolean;regulationSeconds:300;overtimeSeconds:0|60;
 result:NonNullable<TournamentFixture['result']>|null};
export type PoolChallengeView={id:string;player:Address;agent:Address;mode:0|1;status:1|2|3|4;at:string;ref:AgentMatchRef|null;waitReason?:'tournament'|'match'|'arena';tournamentId?:string};
export const normalizedAgent=(value:string)=>getAddress(value);
