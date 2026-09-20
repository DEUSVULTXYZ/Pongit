import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,keccak256,zeroHash,type Abi,type Address,type Hex} from 'viem';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as humanAbi} from '../shared/abi-independent-ReusableEventsArena';
import {reusableResults,reusableSlotResult} from '../shared/reusable-results';
import {resultFixture} from './fixtures/reusable-result';
import {publishedResultLeaf,PublishedResultIndex,verifyPublishedResult} from '../shared/published-result-tree';
const app='0x1111111111111111111111111111111111111111',a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333';
function log(abi:Abi,name:string,args:any){const e=abi.find(x=>x.type==='event'&&x.name===name) as any;return{address:app as Address,topics:encodeEventTopics({abi,eventName:name,args} as any) as Hex[],data:encodeAbiParameters(e.inputs.filter((x:any)=>!x.indexed),e.inputs.filter((x:any)=>!x.indexed).map((x:any)=>args[x.name]))};}
for(const [rules,abi] of [[14,humanAbi],[15,reusableAgentArenaAbi]] as const)test(`rules ${rules} retain a canonical result and reject partial or substituted publication logs`,()=>{
 const ref={chainId:10143n,arena:app as Address,epoch:2n},ticketHash=keccak256('0x1234');
 const common={a,b,winner:a,mode:1,status:3,scoreA:7,scoreB:6,hash:keccak256('0xabcd')};
 const match_=rules===14?{...common,arena:app,epoch:2n,id:91n,ranked:false}:{...common,ref:{...ref,id:91n},elapsedUs:200000n,finality:false};
 const result={match_,rules:BigInt(rules),elapsedUs:200000n,finishedAt:1000n,brainA:0n,brainB:0n};
 const output=abi.find(x=>x.type==='function'&&x.name==='publishedResult') as any;
 const canonical=encodeAbiParameters(output.outputs,[result]),resultHash=keccak256(canonical),leaf=publishedResultLeaf(ref,91n,ticketHash,resultHash);
 let root=leaf,empty:Hex=zeroHash;for(let i=0;i<16;i++){root=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[root,empty]));empty=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[empty,empty]));}
 const commit={epoch:2n,matchId:91n,index:0,ticketHash,resultHash,leaf,root};
 const logs=[log(abi,'ResultCommitted',commit),log(abi,'Completed',{epoch:2n,id:91n,result})];
 const frame={app:app as Address,head:10n,hash:keccak256('0x99'),logs};
 const [candidate]=reusableResults(abi,app,rules,frame);assert.equal(candidate.canonical,canonical);assert.equal(candidate.ticketHash,ticketHash);
 const index=new PublishedResultIndex();index.append(candidate.index,candidate.leaf,candidate.root);
 assert(verifyPublishedResult({root,count:1},0,leaf,index.proof(0,{root,count:1})));
 assert.throws(()=>reusableResults(abi,app,rules,{...frame,logs:logs.slice(0,1)}),/Incomplete/);
 assert.throws(()=>reusableResults(abi,app,rules,{...frame,logs:logs.slice(1)}),/missing/);
 assert.throws(()=>reusableResults(abi,app,rules,{...frame,logs:[log(abi,'ResultCommitted',{...commit,resultHash:zeroHash}),logs[1]]}),/differs/);
 assert.throws(()=>reusableResults(abi,app,rules,{...frame,logs:[...logs,logs[1]]}),/Repeated/);
 assert.throws(()=>reusableResults(abi,app,rules===14?15:14,frame),/mismatched/);
 assert.throws(()=>index.proof(0,{root:zeroHash,count:1}),/differs/,'An emitted root cannot stand in for the authoritative Monad root');
});
test('reconnect can retain the current terminal slot without inventing a receipt',()=>{
 const f=resultFixture(),slot=reusableSlotResult(f.abi,f.ref,15,91n,f.ticketHash,1n,f.result,[f.ref.epoch,1,f.root]);
 assert.equal(slot.canonical,f.canonical);assert.equal(slot.leaf,f.leaf);assert(!('transactionHash' in slot));
 for(const [id,epoch,count,status] of [[92n,2n,1,3],[91n,3n,1,3],[91n,2n,2,3],[91n,2n,1,2]] as const)
  assert.throws(()=>reusableSlotResult(f.abi,f.ref,15,id,f.ticketHash,1n,{...f.result,match_:{...f.result.match_,status}},[epoch,count,f.root]),/differs/);
});
