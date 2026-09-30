import {decodeEventLog,encodeAbiParameters,keccak256,type Address,type Hex,type PublicClient,type TransactionReceipt} from 'viem';
import {agentChallengesAbi} from './abi-AgentChallenges';
import {reusableAgentPoolAbi} from './abi-ReusableAgentPool';
import type {AgentPoolManifest} from './agent-pool';
import type {AgentMatchRef} from './agents';

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
