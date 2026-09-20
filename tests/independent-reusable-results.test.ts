import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeFunctionData,keccak256,toHex,zeroHash,type Address,type Hex} from 'viem';
import {independentReusableResults} from '../relayer/src/independent-reusable-results';
import {reusableAdmissionDigest,type ReusableTicket} from '../shared/reusable-admission';
import {publishedResultLeaf,verifyPublishedResult} from '../shared/published-result-tree';
import type {IndependentManifest} from '../shared/independent';
import {resultFixture} from './fixtures/reusable-result';
const at=(n:number)=>toHex(n,{size:20}) as Address;
function fixture(){
 const f=resultFixture(14),ticket:ReusableTicket={authority:at(2),arena:f.ref.arena,epoch:2n,sequence:1n,matchId:91n,
  bindingHash:keccak256('0x42'),issuedAt:100n,expires:220n,sourceBlock:4n,sourceHash:toHex(5,{size:32}),rules:14n};
 const leaf=publishedResultLeaf(f.ref,91n,reusableAdmissionDigest(ticket),f.resultHash);
 let root=leaf,empty:Hex=zeroHash;for(let i=0;i<16;i++){
  root=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[root,empty]));
  empty=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[empty,empty]));
 }
 const m={rulesVersion:14,chainId:10143,lobby:at(2),ratings:at(3),resultVerifier:at(4),arenas:[{app:f.ref.arena,index:0}]} as IndependentManifest;
 let count=1,finality=false,previous:any=null,body:any=f.result,change=false,read=0,fail=false;
 const rows:any[]=[],calls:any[]=[],nodeReads:string[]=[];
 const db:any={query:async(sql:string,args:any[])=>{
  if(fail)throw Error('archive unavailable');
  if(sql.startsWith('INSERT INTO il_reusable_slot_results')){
   const [chain_id,app,epoch,position,leaf,root,match_id,rules,ticket_hash,result_hash,canonical]=args;
   rows.push({chain_id,app,epoch,position,leaf,root,match_id,rules,ticket_hash,result_hash,canonical});return{rows:[{leaf}],rowCount:1};
  }
  if(sql.includes('UNION SELECT'))return{rows:rows.filter(r=>r.position<args[3])};
  throw Error('Unexpected archive operation');
 }};
 const base:any={getBlock:async()=>({number:20n,timestamp:500n}),readContract:async(c:any)=>{
  encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});assert.equal(c.blockNumber,20n);
  switch(c.functionName){case 'ticketOf':return[ticket,{}];case 'currentRoot':return[{count,hash:root},finality];
   case 'indexOf':return previous?1n:0n;case 'entry':return previous;default:throw Error('Unexpected base read');}
 }};
 const actor={app:f.ref.arena,reference:()=>({id:91n,epoch:2n}),node:{readContract:async(c:any)=>{
  encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});nodeReads.push(c.functionName);
  if(c.functionName==='resultCommitment')return[2n,change&&++read>1?2:1,root];
  if(c.functionName==='publishedResult')return body;throw Error('Unexpected node read');
 }} as any};
 const service=independentReusableResults(db,base,m,async(address,abi,name,args)=>{
  encodeFunctionData({abi,functionName:name,args});calls.push({address,name,args});
 });
 return{...f,service,ticket,root,leaf,rows,calls,actor,nodeReads,
  published:(n:number,final=false)=>{count=n;finality=final;},previous:(p:any)=>previous=p,
  body:(b:any)=>body=b,change:()=>change=true,fail:()=>fail=true};
}

test('reusable human result survives slot reuse and captures only its canonical published prefix',async()=>{
 const f=fixture();assert.equal(await f.service.archiveSlot(f.actor),true);assert.equal(f.rows.length,1);
 assert(!('transaction_hash' in f.rows[0]),'A slot observation does not manufacture a receipt');
 f.body({});f.nodeReads.length=0;
 assert.equal(await f.service.capture(91n),true);assert.deepEqual(f.nodeReads,[],'History never reads the new physical slot');
 assert.equal(f.calls[0].name,'captureProof');const [id,complete,proof]=f.calls[0].args;
 assert.equal(id,91n);assert.equal(complete.match_.hash,f.result.match_.hash);
 assert(verifyPublishedResult({root:f.root,count:1},0,f.leaf,proof));
 f.previous({latest:f.result.match_,finality:false});assert.equal(await f.service.capture(91n),false);
 f.published(1,true);assert.equal(await f.service.capture(91n),true,'Finality upgrades remain observable');
});

test('missing receipts or incomplete publications never prove a cancellation',async()=>{
 const f=fixture();f.published(0);assert.equal(await f.service.capture(91n),false);assert.equal(f.calls.length,0);
 f.published(1);await assert.rejects(f.service.capture(91n),/gap/);assert.equal(f.calls.length,0);
 f.published(0,true);assert.equal(await f.service.capture(91n),true);assert.equal(f.calls[0].name,'captureMissing');
 f.previous({latest:{status:4},finality:true});assert.equal(await f.service.capture(91n),false);
});

test('slot archiving rejects a racing result, wrong identity, nonterminal state and unavailable storage',async()=>{
 const race=fixture();race.change();await assert.rejects(race.service.archiveSlot(race.actor),/changed/);assert.equal(race.rows.length,0);
 for(const patch of [{id:92n},{epoch:3n},{status:2}]){
  const f=fixture();f.body({...f.result,match_:{...f.result.match_,...patch}});
  await assert.rejects(f.service.archiveSlot(f.actor),/differs/);assert.equal(f.rows.length,0);
 }
 const failed=fixture();failed.fail();await assert.rejects(failed.service.archiveSlot(failed.actor),/unavailable/);assert.equal(failed.calls.length,0);
});

test('a published alternative ticket is not submitted as the original reservation',async()=>{
 const f=fixture();await f.service.archiveSlot(f.actor);f.ticket.bindingHash=keccak256('0x43');
 await assert.rejects(f.service.capture(91n),/issued ticket/);assert.equal(f.calls.length,0);
});
