import {decodeEventLog,encodeAbiParameters,keccak256,type Address,type Hex,type PublicClient,type TransactionReceipt} from 'viem';
import {agentChallengesAbi} from './abi-AgentChallenges';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';
import type {AgentPoolManifest,PoolMatchView} from './agent-pool';
import type {AgentMatchRef} from './agents';
import {readHubDelegation} from './rooms-hub';
import {hubHasNoLease} from './hub-lease';
import {usableEntryObservation,type AgentEntryObservation} from './agent-entry-observation';

/** Resolve only this player's accepted challenge. The pool may admit an older
 * request in the same transaction, so an Assigned event alone is insufficient.
 * This is navigation evidence, never permission to start or control a game. */
export function challengeRefFromReceipt(m:AgentPoolManifest,receipt:TransactionReceipt,player:Address,
 expected:{agent:Address;mode:0|1}):AgentMatchRef|null{
 if(m.version!==5||receipt.status!=='success')return null;
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
 const changes=receipt.logs.filter(l=>same(l.address,m.challenges)).flatMap(l=>{
  try{const e=decodeEventLog({abi:agentChallengesAbi,data:l.data,topics:l.topics});
   return e.eventName==='ChallengeChanged'&&e.args.status===2&&same(e.args.player,player)&&same(e.args.agent,expected.agent)?[e.args]:[];
  }catch{return [];}
 });
 if(changes.length!==1||changes[0].id<1n)return null;
 const admissions=receipt.logs.filter(l=>same(l.address,m.pool)).flatMap(l=>{
  try{const e=decodeEventLog({abi:reusableAgentPoolAbi,data:l.data,topics:l.topics});return e.eventName==='AdmissionIssued'?[e.args]:[];}catch{return [];}
 }).filter(e=>{
  const b=e.binding,t=e.ticket;
  return same(b.a,player)&&same(b.b,expected.agent)&&b.mode===expected.mode&&!b.ranked&&b.tournament===0n
   &&b.id>0n&&b.epoch===e.epoch&&e.epoch>0n&&t.matchId===b.id&&t.epoch===e.epoch&&t.rules===BigInt(m.rulesVersion)
   &&same(t.authority,m.pool)&&same(t.arena,e.arena)&&m.arenas.some(a=>same(a.app,e.arena))
   &&keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],
    [BigInt(m.chainId),e.arena,e.epoch,b.id]))===e.ref;
 });
 if(admissions.length!==1)return null;
 const e=admissions[0];
 return{chainId:m.chainId,app:e.arena,epoch:String(e.epoch),id:String(e.binding.id)};
}

/** A confirmed sponsor reply does not establish canonicality of its receipt.
 * On absence, reorganisation or timeout callers keep their ordinary queue
 * observer. They must never submit a replacement challenge on this basis. */
export async function readChallengeAdmission(client:PublicClient,m:AgentPoolManifest,hash:Hex,player:Address,
 expected:{agent:Address;mode:0|1}):Promise<AgentMatchRef|null>{
 if(m.version!==5)return null;
 const receipt=await client.getTransactionReceipt({hash});
 if(receipt.transactionHash!==hash)return null;
 const ref=challengeRefFromReceipt(m,receipt,player,expected);if(!ref)return null;
 const block=await client.getBlock({blockNumber:receipt.blockNumber});
 return block.hash===receipt.blockHash?ref:null;
}

/** The same canonical admission can hydrate its destination once. It does not
 * authorize controls: the player still verifies the fresh lease, code, binding
 * and session. Old receipts and incomplete/mismatching assignments use the API. */
export function challengeViewFromReceipt(m:AgentPoolManifest,receipt:TransactionReceipt,player:Address,
 expected:{agent:Address;mode:0|1}):PoolMatchView|null{
 const ref=challengeRefFromReceipt(m,receipt,player,expected);if(!ref)return null;
 const key=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],
  [BigInt(ref.chainId),ref.app,BigInt(ref.epoch),BigInt(ref.id)]));
 const assigned=receipt.logs.filter(l=>l.address.toLowerCase()===m.pool.toLowerCase()).flatMap(l=>{
  try{const e=decodeEventLog({abi:reusableAgentPoolAbi,data:l.data,topics:l.topics});
   return e.eventName==='Assigned'&&e.args.ref===key?[e.args]:[];
  }catch{return [];}
 });
 if(assigned.length!==1)return null;
 const a=assigned[0],arena=m.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase());
 if(a.arena.toLowerCase()!==ref.app.toLowerCase()||a.tournament!==0n||a.lane<1||a.lane>=m.maxMatches||!arena?.node)return null;
 return{ref,a:player,b:expected.agent,mode:expected.mode,ranked:false,tournament:'0',lane:a.lane,node:arena.node,
  currentBinding:true,regulationSeconds:300,overtimeSeconds:0,result:null};
}

export async function readChallengeEntry(client:PublicClient,m:AgentPoolManifest,hash:Hex,player:Address,
 expected:{agent:Address;mode:0|1},clock:number|(()=>number)=Date.now):Promise<{ref:AgentMatchRef;view:PoolMatchView|null;observation?:AgentEntryObservation}|null>{
 if(m.version!==5)return null;
 const receipt=await client.getTransactionReceipt({hash});if(receipt.transactionHash!==hash)return null;
 const ref=challengeRefFromReceipt(m,receipt,player,expected);if(!ref)return null;
 const now=typeof clock==='function'?clock:()=>clock,started=now();
 const arena=m.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase())!;
 const pin={blockHash:receipt.blockHash,requireCanonical:true as const};
 // The receipt hash is already known: lifecycle/code can overlap its canonical
 // header check. A failed optional preload leaves the ordinary recovery path;
 // it never authorizes a command or creates a replacement challenge.
 const preload=m.rulesVersion===17&&hubHasNoLease(m.hub,0n)?Promise.all([
  client.getChainId(),readHubDelegation(client,m.hub,ref.app,pin),client.getCode({address:ref.app,...pin}),
 ]).catch(()=>null):Promise.resolve(null);
 const [block,loaded]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),preload]);
 if(block.hash!==receipt.blockHash)return null;
 const age=now()-Number(block.timestamp)*1000,view=age>=-5000&&age<=30000?challengeViewFromReceipt(m,receipt,player,expected):null;
 const candidate:AgentEntryObservation|undefined=loaded&&loaded[2]?{
  ref,hub:m.hub,runtimeHash:keccak256(loaded[2]),blockHash:block.hash!,timestamp:block.timestamp,
  observedAt:started,validUntil:Math.min(started+3000,Number(block.timestamp)*1000+3000),chainId:loaded[0],delegation:loaded[1],
 }:undefined;
 const observation=view?usableEntryObservation(candidate,m,ref,now()):null;
 return{ref,view,...(observation?{observation}:{})};
}
