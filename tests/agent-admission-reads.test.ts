import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,multicall3Abi,toHex,zeroAddress,zeroHash,type Address} from 'viem';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
import {agentAdmissionReads} from '../shared/agent-admission-reads';
const at=(n:number)=>toHex(n,{size:20}) as Address,pool=at(20),hash=toHex(30,{size:32});
const refs=Array.from({length:5},(_,i)=>({chainId:10143n,arena:at(i+1),epoch:1n,id:BigInt(i+1)}));
function fixture(){
 let calls=0,headers=0,failed=-1,reorg=false,wrong=false,short=false,release!:()=>void;
 const base:any={request:async(request:any)=>{
  calls++;assert.deepEqual(request.params[1],{blockHash:hash,requireCanonical:true});
  if(reorg)throw Error('Canonical hash rejected');
  const decoded=decodeFunctionData({abi:multicall3Abi,data:request.params[0].data});
  assert.equal(decoded.functionName,'aggregate3');if(decoded.functionName!=='aggregate3')throw Error();
  const rows=decoded.args[0].map((call,i)=>{
   assert.equal(call.target.toLowerCase(),pool);
   const decoded=decodeFunctionData({abi,data:call.callData});assert.equal(decoded.functionName,'ticketOf');
   if(decoded.functionName!=='ticketOf')throw Error();const r=decoded.args[0];
   const control={codeHash:zeroHash,memoryWord:0n,house:0,key:at(90),expires:7200n};
   const binding={id:r.id,epoch:r.epoch,preparedBlock:40n,tournament:0n,a:at(80),b:at(81),mode:0,ranked:false,overtime:false,controlA:control,controlB:control};
   const ticket={authority:pool,arena:r.arena,epoch:r.epoch,sequence:1n,matchId:wrong?999n:r.id,bindingHash:zeroHash,issuedAt:100n,expires:220n,sourceBlock:40n,sourceHash:hash,rules:17n};
   return {success:i!==failed,returnData:encodeFunctionResult({abi,functionName:'ticketOf',result:[ticket,binding]})};
  });
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:short?rows.slice(1):rows});
 },getBlock:async({blockNumber}:any)=>{headers++;await new Promise<void>(r=>release=r);return{number:blockNumber,hash};}};
 return {base,read:agentAdmissionReads(base,pool,refs.map(r=>r.arena)),counts:()=>({calls,headers}),
  fail:(i:number)=>failed=i,reorg:(v:boolean)=>reorg=v,wrong:()=>wrong=true,short:()=>short=true,release:()=>release()};
}
test('five newly assigned tickets share one canonical request and unchanged engine cache',async()=>{
 const f=fixture(),lanes=refs.map(ref=>({ref}));
 const values=await Promise.all(refs.map(r=>f.read.ticket(r,lanes,{hash})));
 assert.equal(f.counts().calls,1);assert.deepEqual(values.map(v=>v[0].matchId),refs.map(r=>r.id));
 await f.read.ticket(refs[0],lanes,{hash});assert.equal(f.counts().calls,1);
 const next={...refs[0],id:7n};assert.equal((await f.read.ticket(next,[{ref:next}],{hash}))[0].matchId,7n);
 assert.equal(f.counts().calls,2);
});
test('failed lanes retry without discarding healthy tickets or silently accepting a partial batch',async()=>{
 const f=fixture(),lanes=refs.map(ref=>({ref}));f.fail(2);
 const rows=await Promise.allSettled(refs.map(r=>f.read.ticket(r,lanes,{hash})));
 assert.equal(rows.filter(r=>r.status==='fulfilled').length,4);
 assert.equal(rows[2].status,'rejected');f.fail(-1);
 assert.equal((await f.read.ticket(refs[2],lanes,{hash}))[0].matchId,3n);assert.equal(f.counts().calls,2);
 const g=fixture();g.short();await assert.rejects(g.read.ticket(refs[0],lanes,{hash}),/Incomplete/);
});
test('wrong reference or canonical failure cannot produce an admission ticket',async()=>{
 const lanes=refs.map(ref=>({ref})),f=fixture();f.reorg(true);
 await assert.rejects(f.read.ticket(refs[0],lanes,{hash}),/Canonical/);f.reorg(false);
 assert.equal((await f.read.ticket(refs[0],lanes,{hash}))[0].matchId,1n);assert.equal(f.counts().calls,2);
 const g=fixture();g.wrong();await assert.rejects(g.read.ticket(refs[0],lanes,{hash}),/reference mismatch/);
 for(const ref of [{...refs[0],arena:zeroAddress},{...refs[0],chainId:1n},{...refs[0],id:0n}])
  await assert.rejects(f.read.ticket(ref,lanes,{hash}),/Invalid/);
 await assert.rejects(f.read.ticket(refs[0],lanes,{hash:null}),/Invalid/);
 await assert.rejects(f.read.ticket(refs[0],lanes,{hash:'latest'}),/Invalid/);
 assert.equal(f.counts().calls,2);
});
test('matching source blocks share only an in-flight header and never a persistent canonical assumption',async()=>{
 const f=fixture(),first=Promise.all([f.read.source(40n),f.read.source(40n)]);
 assert.equal(f.counts().headers,1);f.release();assert.equal((await first)[0].hash,hash);
 const next=f.read.source(40n);assert.equal(f.counts().headers,2);f.release();await next;
});

test('four admission proofs share one canonical issued-ticket read and one source header',async()=>{
 const f=fixture(),lanes=refs.map(ref=>({ref}));
 const pairs=await Promise.all(refs.map(r=>f.read.ticket(r,lanes,{hash})));
 let calls=0,fail=-1;
 f.base.request=async(request:any)=>{
  calls++;assert.deepEqual(request.params[1],{blockHash:hash,requireCanonical:true});
  const decoded=decodeFunctionData({abi:multicall3Abi,data:request.params[0].data});
  assert.equal(decoded.functionName,'aggregate3');if(decoded.functionName!=='aggregate3')throw Error();
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:decoded.args[0].map((c,i)=>{
   const d=decodeFunctionData({abi,data:c.callData});assert.equal(d.functionName,'issuedTicket');
   assert.equal(c.target.toLowerCase(),pool);
   return{success:i!==fail,returnData:encodeFunctionResult({abi,functionName:'issuedTicket',result:hash})};
  })});
 };
 const pending=Promise.all(pairs.map(p=>f.read.proof(p[0],{hash})));
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(f.counts().headers,1);
 f.release();assert((await pending).every(p=>p.issuedDigest===hash&&p.source.hash===hash));
 // A later attempt must recheck canonicality, not reuse the old proof forever.
 const again=f.read.proof(pairs[0][0],{hash});await new Promise(r=>setImmediate(r));
 assert.equal(calls,2);f.release();await again;
 fail=2;
 const retries=Promise.allSettled(pairs.map(p=>f.read.proof(p[0],{hash})));
 await new Promise(r=>setImmediate(r));f.release();
 const results=await retries;assert.equal(results.filter(r=>r.status==='fulfilled').length,4);assert.equal(results[2].status,'rejected');
});

test('a failed canonical proof or foreign ticket cannot authorize an admission',async()=>{
 const f=fixture(),[t]=await f.read.ticket(refs[0],[],{hash});
 f.base.request=async()=>{throw Error('Canonical hash rejected');};
 const proof=assert.rejects(f.read.proof(t,{hash}),/Canonical/);await new Promise(r=>setImmediate(r));f.release();
 await proof;
 await assert.rejects(f.read.proof({...t,arena:zeroAddress},{hash}),/Invalid/);
 await assert.rejects(f.read.proof(t,{hash:null}),/Invalid/);
});
