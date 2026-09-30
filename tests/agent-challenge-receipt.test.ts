import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,keccak256,zeroHash,type Address,type Hex,type PublicClient,type TransactionReceipt} from 'viem';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {challengeRefFromReceipt,readChallengeAdmission} from '../shared/agent-challenge-receipt';
import type {AgentPoolManifest} from '../shared/agent-pool';

const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const m={version:5,chainId:10143,rulesVersion:15,pool:addr(1),challenges:addr(2),arenas:[{app:addr(3)}]} as AgentPoolManifest;
const player=addr(4),agent=addr(5),hash=`0x${'11'.repeat(32)}` as Hex,blockHash=`0x${'22'.repeat(32)}` as Hex;
const expected={agent,mode:1 as const};
const control={codeHash:zeroHash,memoryWord:0n,house:0,key:addr(6),expires:999n};
const binding={id:239n,epoch:12n,preparedBlock:44n,tournament:0n,a:player,b:agent,mode:1,ranked:false,overtime:false,controlA:control,controlB:control};
const ticket={authority:m.pool,arena:addr(3),epoch:12n,sequence:1n,matchId:239n,bindingHash:zeroHash,issuedAt:100n,expires:999n,sourceBlock:43n,sourceHash:zeroHash,rules:15n};
const ref=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'}],[10143n,addr(3),12n,239n]));
function changed(owner=player,status=2){return{address:m.challenges,data:encodeAbiParameters([{type:'uint8'}],[status]),
 topics:encodeEventTopics({abi:agentChallengesAbi,eventName:'ChallengeChanged',args:{id:48n,player:owner,agent}})};}
function admission(b={...binding},t={...ticket},emitter=m.pool){
 const event=reusableAgentPoolAbi.find(e=>e.type==='event'&&e.name==='AdmissionIssued')!;
 if(event.type!=='event')throw Error();
 return{address:emitter,data:encodeAbiParameters(event.inputs.filter(i=>!i.indexed),[t,b]),
  topics:encodeEventTopics({abi:reusableAgentPoolAbi,eventName:'AdmissionIssued',args:{ref,arena:addr(3),epoch:12n}})};
}
function receipt(logs=[changed(),admission()]):TransactionReceipt{return{transactionHash:hash,blockHash,blockNumber:44n,status:'success',logs} as unknown as TransactionReceipt;}
test('confirmed atomic receipt identifies only the accepted player, mode and full reference',()=>{
 assert.deepEqual(challengeRefFromReceipt(m,receipt(),player,expected),{chainId:10143,app:addr(3),epoch:'12',id:'239'});
 // A best-effort admission may instead assign the older request in the queue.
 assert.equal(challengeRefFromReceipt(m,receipt([changed(player,1),changed(addr(10)),admission({...binding,a:addr(10)})]),player,expected),null);
 assert.equal(challengeRefFromReceipt(m,receipt([changed(player,1)]),player,expected),null);
});
test('other emitters, modes, epochs, rules and ambiguous admissions never redirect',()=>{
 for(const logs of [
  [{...changed(),address:addr(99)},admission()],
  [changed(),admission({...binding},ticket,addr(99))],
  [changed(),admission({...binding,mode:0})],
  [changed(),admission({...binding,epoch:13n})],
  [changed(),admission({...binding,b:addr(9)})],
  [changed(),admission({...binding,ranked:true})],
  [changed(),admission({...binding,tournament:11n})],
  [changed(),admission({...binding,id:240n})],
  [changed(),admission(binding,{...ticket,authority:addr(9)})],
  [changed(),admission(binding,{...ticket,rules:14n})],
  [changed(),changed(),admission()],
  [changed(),admission(),admission()],
 ])assert.equal(challengeRefFromReceipt(m,receipt(logs),player,expected),null);
 assert.equal(challengeRefFromReceipt({...m,arenas:[]},receipt(),player,expected),null);
 assert.equal(challengeRefFromReceipt(m,{...receipt(),status:'reverted'},player,expected),null);
});
test('receipt shortcut verifies its canonical block and does not guess after a lost read',async()=>{
 let observed=blockHash;let reads=0;
 const client={getTransactionReceipt:async({hash:h}:any)=>{assert.equal(h,hash);return receipt();},
  getBlock:async({blockNumber}:any)=>{assert.equal(blockNumber,44n);reads++;return{hash:observed};}} as unknown as PublicClient;
 assert.equal((await readChallengeAdmission(client,m,hash,player,expected))?.id,'239');assert.equal(reads,1);
 observed=zeroHash;assert.equal(await readChallengeAdmission(client,m,hash,player,expected),null);
 const missing={...client,getTransactionReceipt:async()=>{throw Error('lost RPC response');}} as PublicClient;
 await assert.rejects(readChallengeAdmission(missing,m,hash,player,expected),/lost RPC response/);
 assert.equal(await readChallengeAdmission({...client,getTransactionReceipt:async()=>({...receipt(),transactionHash:zeroHash})} as PublicClient,m,hash,player,expected),null);
});
