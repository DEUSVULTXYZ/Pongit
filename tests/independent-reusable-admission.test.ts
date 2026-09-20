import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,encodeFunctionResult,recoverAddress,toHex,zeroHash,zeroAddress,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {independentReusableAdmission} from '../relayer/src/independent-reusable-admission';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {reusableAdmissionDigest,reusableBindingHash,type ReusableBinding,type ReusableTicket} from '../shared/reusable-admission';
import type {IndependentManifest} from '../shared/independent';
const at=(n:number)=>toHex(n,{size:20}) as Address;
function fixture(){
 const key=generatePrivateKey(),signer=privateKeyToAccount(key),app=at(1),lobby=at(2);
 const manifest={rulesVersion:14,chainId:10143,lobby,hub:at(3),admissionSigner:signer.address,arenas:[{app,index:0}]} as IndependentManifest;
 const binding:ReusableBinding={id:99n,room:8n,a:at(5),b:at(6),keyA:at(7),keyB:at(8),expiresA:7201n,expiresB:7201n,mode:1,ranked:true,preparedBlock:4n,epoch:7n};
 const ticket:ReusableTicket={authority:lobby,arena:app,epoch:7n,sequence:1n,matchId:99n,bindingHash:reusableBindingHash(binding),issuedAt:100n,expires:220n,sourceBlock:4n,sourceHash:toHex(5,{size:32}),rules:14n};
 const fields=roomsLifecycleHubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const delegation:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
 Object.assign(delegation,{app,status:1,epoch:7n,baseBlock:3n,expiresAt:10000n});
 let now=110n,reorg=false,reserved=99n,current:any=[0n,0n,0n,zeroHash],phase=2n;
 const calls:any[]=[],session={app,chainId:4242,epoch:7,baseBlock:3};
 const base:any={getBlock:async(o:any)=>({number:o?.blockNumber??9n,timestamp:now,hash:o?.blockNumber===4n?ticket.sourceHash:reorg&&o?.blockNumber===9n?zeroHash:toHex(9,{size:32})}),
  request:async()=>encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:delegation}),
  readContract:async(c:any)=>{encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});assert.equal(c.blockNumber,9n);
   return c.functionName==='reservedMatch'?reserved:c.functionName==='ticketOf'?[ticket,binding]:c.functionName==='issuedTicket'?reusableAdmissionDigest(ticket):undefined;}};
 const node:any={request:async()=>session,readContract:async(c:any)=>{encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});
  return c.functionName==='currentAdmission'?current:c.functionName==='getSnapshot'?{phase}:c.functionName==='resultCommitment'?[7n,0,zeroHash]:undefined;}};
 const actor={app,node,reference:()=>({id:99n,epoch:7n}),send:async(name:string,args:readonly unknown[])=>{calls.push({name,args});}};
 return{ticket,binding,key,signer,manifest,actor,calls,session,delegation,run:()=>independentReusableAdmission(base,manifest,key)(actor),
  now:(n:bigint)=>now=n,reorg:()=>reorg=true,reserved:(n:bigint)=>reserved=n,current:(v:any,p=2n)=>{current=v;phase=p;}};
}
test('the human bridge signs only the issued reserved ticket under its exact epoch',async()=>{
 const f=fixture();assert.equal(await f.run(),'admission-submitted');assert.equal(f.calls.length,1);
 const {name,args}=f.calls[0];assert.equal(name,'admit');assert.deepEqual(args.slice(0,2),[f.ticket,f.binding]);
 assert.equal(await recoverAddress({hash:reusableAdmissionDigest(f.ticket),signature:args[2]}),f.signer.address);
 f.current([7n,99n,1n,reusableAdmissionDigest(f.ticket)]);assert.equal(await f.run(),'already-admitted');assert.equal(f.calls.length,1);
});
test('expiry only transports a published cancellation, including expired player permissions',async()=>{
 const f=fixture();f.now(7300n);assert.equal(await f.run(),'cancellation-submitted');assert.equal(f.calls[0].name,'cancelAdmission');
 assert.deepEqual(f.calls[0].args.slice(0,2),[f.ticket,f.binding]);
});
test('the bridge refuses a changed reservation, fork, engine base or active preceding slot',async()=>{
 const cases=[(f:ReturnType<typeof fixture>)=>f.reserved(100n),(f:ReturnType<typeof fixture>)=>f.reorg(),
  (f:ReturnType<typeof fixture>)=>{f.session.baseBlock=2;},(f:ReturnType<typeof fixture>)=>{f.session.epoch=6;},
  (f:ReturnType<typeof fixture>)=>f.current([7n,98n,0n,zeroHash]),(f:ReturnType<typeof fixture>)=>{f.delegation.status=2;}];
 for(const change of cases){const f=fixture();change(f);await assert.rejects(f.run());assert.equal(f.calls.length,0);}
 const f=fixture();f.current([7n,99n,1n,zeroHash]);await assert.rejects(f.run(),/differs/);assert.equal(f.calls.length,0);
});
