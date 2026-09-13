import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {encodeFunctionData,parseAbi,zeroHash,type Address} from 'viem';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {readHubDelegation} from '../shared/rooms-hub';
import {chainTools} from './independent-chain-tools';
import {abi as arenaAbi} from '../shared/abi-independent-IndependentArena';
const path='/secrets/compact-rooms-20260913.json',r=JSON.parse(await readFile(path,'utf8'));
const app=(r.app||r.error?.match(/delegateAll reverted on (0x[\da-f]{40})/i)?.[1]) as Address;assert(app);
const t=await chainTools('compact-rooms-20260913');
try{
 const hub=await t.base.readContract({address:app,abi,functionName:'hub'}),d=await readHubDelegation(t.base,hub,app);
 const control=await fetch('https://control.interludelayer.xyz/sessions/'+app);const body:any=await control.json();
 const owner=await t.base.readContract({address:app,abi,functionName:'owner'});
 let simulation:any;try{await t.base.call({account:owner,to:app,data:encodeFunctionData({abi,functionName:'delegateAll'})});simulation='ok';}catch(e){const x=e as any;simulation={message:x.message,data:x.cause?.data||x.data,causes:[x.cause,x.cause?.cause,x.cause?.cause?.cause].map(c=>c&&({name:c.name,message:c.message,data:c.data,code:c.code}))};}
 console.log(JSON.stringify({app,hub,owner,delegation:d,control:{http:control.status,...body},simulation},(_,v)=>typeof v==='bigint'?String(v):v));
 const references=JSON.parse(await readFile('docs/evidence/independent/compact-verification.json','utf8')).matches;
 for(const ref of references){const status=await readHubDelegation(t.base,hub,ref.app);const bound:any=await t.base.readContract({address:ref.app,abi:arenaAbi,functionName:'boundMatch'});const hash=await t.base.readContract({address:ref.app,abi:arenaAbi,functionName:'resultHashes',args:[BigInt(ref.id)]});console.log(JSON.stringify({fixture:ref.app,status:status.status,epoch:String(status.epoch),unlockAt:String(status.stakeUnlockAt),reference:{id:ref.id,epoch:ref.epoch,hash:ref.hash},bound,hash},(_,v)=>typeof v==='bigint'?String(v):v));}
 if(process.env.PONG_COMPACT_RECOVER==='owned-finished-fixture'){
  const ref=references.find((x:any)=>x.app.toLowerCase()==='0x39259f34e209cf00d12e1576f9f9ed9ca75ca69a');assert(ref&&ref.mode===1);
  const before=await readHubDelegation(t.base,hub,ref.app);
  if(before.status!==0){
   assert.equal(before.status,2);assert.equal(String(before.epoch),ref.epoch);assert((await t.base.getBlock()).timestamp>=before.stakeUnlockAt);
   const b:any=await t.base.readContract({address:ref.app,abi:arenaAbi,functionName:'boundMatch'});assert.equal(String(b.id),ref.id);assert.equal(String(b.epoch),ref.epoch);
   assert.equal(await t.base.readContract({address:ref.app,abi:arenaAbi,functionName:'resultHashes',args:[BigInt(ref.id)]}),ref.hash);
   await t.write('release-completed-chaos-fixture',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[ref.app,zeroHash]);
  }
  assert.equal((await readHubDelegation(t.base,hub,ref.app)).status,0);
  if((await readHubDelegation(t.base,hub,app)).status===0)await t.write('open-compact-delegation',app,abi,'renewEngine');
  const opened=await readHubDelegation(t.base,hub,app);assert.equal(opened.status,1);assert.equal(opened.epoch,1n);
  r.app=app;r.openedEpoch=String(opened.epoch);
  const save=async()=>{await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);};
  const lookup=await fetch('https://control.interludelayer.xyz/sessions/'+app);let served:any=await lookup.json();
  if(lookup.status===404){
   assert(!r.nodeRequestAt,'Prior node request needs reconciliation');r.nodeRequestAt=new Date().toISOString();r.state='node-requested';await save();
   const response=await fetch('https://control.interludelayer.xyz/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app}),signal:AbortSignal.timeout(60000)});served=await response.json();r.nodeHttp=response.status;await save();assert(response.ok,JSON.stringify(served));
  }else assert(lookup.ok);
  r.node=served.url||served.node;assert(typeof r.node==='string'&&r.node.startsWith('https://'));
  r.state='answered';await save();console.log(JSON.stringify({app,node:r.node,epoch:r.openedEpoch}));
 }
}finally{await t.close();}
