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
 version:2;chainId:10143;engineChainId:4242;rulesVersion:10;hub:Address;pool:Address;catalog:Address;
 tournaments:Address;ratings:Address;challenges:Address;qualifications:Address;family:Address;arenas:PoolArena[];
 enabled:boolean;tournamentsEnabled:boolean;verifiedCapacity:0|2;qualificationEvidence:Hex|null;
 durationSeconds:300;overtimeSeconds:60;intervalSeconds:60;maxMatches:2;
};
export function validateAgentPoolManifest(m:AgentPoolManifest,humanApps:readonly string[]=[]):AgentPoolManifest {
 if(m.version!==2||m.chainId!==10143||m.engineChainId!==4242||m.rulesVersion!==10
  ||m.durationSeconds!==300||m.overtimeSeconds!==60||m.intervalSeconds!==60||m.maxMatches!==2)throw Error('Unsupported Agent Arcade pool rules');
 if(typeof m.enabled!=='boolean'||typeof m.tournamentsEnabled!=='boolean')throw Error('Explicit boolean admission gates required');
 const contracts=[m.hub,m.pool,m.catalog,m.tournaments,m.ratings,m.challenges,m.qualifications,m.family];
 if(contracts.some(x=>!isAddress(x)||BigInt(x)===0n))throw Error('Invalid common contract address');
 if(new Set(contracts.map(x=>x.toLowerCase())).size!==contracts.length)throw Error('Common contracts must be distinct');
 if(!Array.isArray(m.arenas)||m.arenas.length<3||m.arenas.length>32)throw Error('Independent arena pool requires 3 to 32 configured arenas');
 const forbidden=new Set([...humanApps,...contracts].map(x=>x.toLowerCase())),seen=new Set<string>();
 for(const a of m.arenas){
  if(!isAddress(a.app)||BigInt(a.app)===0n||forbidden.has(a.app.toLowerCase())||seen.has(a.app.toLowerCase()))throw Error('Arena is duplicated or belongs to another space');
  seen.add(a.app.toLowerCase());const url=new URL(a.node);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Arena node must be a credential-free HTTPS origin');
  if(!/^0x[\da-f]{64}$/i.test(a.runtimeHash))throw Error('Missing arena runtime hash');
 }
 if(m.verifiedCapacity!==0&&m.verifiedCapacity!==2)throw Error('Unsupported verified capacity');
 if(m.enabled&&(m.verifiedCapacity!==2||!m.qualificationEvidence||!/^0x[\da-f]{64}$/i.test(m.qualificationEvidence)||BigInt(m.qualificationEvidence)===0n))throw Error('Public Agent Arcade requires a reviewed capacity qualification');
 if(m.tournamentsEnabled&&!m.enabled)throw Error('Tournaments cannot open while Agent Arcade is closed');
 if(m.qualificationEvidence!==null&&!/^0x[\da-f]{64}$/i.test(m.qualificationEvidence))throw Error('Invalid qualification reference');
 // Deployment journals may contain operator state next to these fields. Never
 // serialize unknown fields or nested arena properties to a browser.
 return {version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:m.hub,pool:m.pool,catalog:m.catalog,tournaments:m.tournaments,
  ratings:m.ratings,challenges:m.challenges,qualifications:m.qualifications,family:m.family,arenas:m.arenas.map(a=>({app:a.app,node:a.node,runtimeHash:a.runtimeHash})),
  enabled:m.enabled,tournamentsEnabled:m.tournamentsEnabled,verifiedCapacity:m.verifiedCapacity,qualificationEvidence:m.qualificationEvidence,
  durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
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
export const normalizedAgent=(value:string)=>getAddress(value);
