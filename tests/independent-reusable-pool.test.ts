import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {encodeFunctionData,encodeFunctionResult,decodeFunctionData,keccak256,toHex,zeroAddress,zeroHash,type Address} from 'viem';
import {independentReusablePool} from '../relayer/src/independent-reusable-pool';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
const at=(n:number)=>toHex(n,{size:20}) as Address;
async function fixture(t:any,withBudget=true){
 const apps=[at(1),at(2),at(3)],m:any={rulesVersion:14,hub:at(5),lobby:at(6),arenas:apps.map(app=>({app}))};
 const fields=roomsLifecycleHubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const ds=apps.map(app=>({...Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n])),
  app,status:1,epoch:2n,baseBlock:3n,expiresAt:10000n,batchIndex:100n}));
 const health=apps.map(app=>({app,epoch:'2',stage:'available',online:true})),reserved=[0n,0n,0n],jobs:any[]=[];let enabled=true,openFailure:Error|undefined;
 const base:any={getCode:async()=> '0x1234',getBlock:async(c:any)=>({number:20n,timestamp:c?.blockNumber===3n?1n:1000n}),
  request:async(c:any)=>{const call=decodeFunctionData({abi:roomsLifecycleHubAbi,data:c.params[0].data}),app=call.args![0];
   return encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:ds[apps.indexOf(app as Address)] as any});},
  readContract:async(c:any)=>{encodeFunctionData({abi:c.abi,functionName:c.functionName,args:c.args});
   switch(c.functionName){case 'reservedMatch':return reserved[apps.indexOf(c.args[0])];case 'defaultValidator':return at(9);
    case 'termsOf':return{delegationFee:5n};default:throw Error('Unexpected read');}
  }};
 let path='';
 if(withBudget){const dir=await mkdtemp(join(tmpdir(),'pongit-budget-'));path=join(dir,'budget.json');
  await writeFile(path,JSON.stringify({rulesVersion:14,maxBatches:50000,matchReserveBatches:20000,rotationLeadSeconds:1860,serviceSeconds:7200,evidence:toHex(2,{size:32}),runtimeHashes:[keccak256('0x1234')]}));
  t.after(async()=>{await unlink(path);await rmdir(dir);});
 }
 const worker=await independentReusablePool(base,m,async(at,abi,name,args,value)=>{
  encodeFunctionData({abi,functionName:name,args});jobs.push({at,name,args,value});if(name==='openReusableArena'&&openFailure)throw openFailure;},()=>health,()=>enabled,path);
 return{apps,worker,ds,health,reserved,jobs,base,disable:()=>enabled=false,failOpening:(error:Error)=>openFailure=error};
}

test('an absent reviewed budget cannot reserve capacity or admit a human match',async t=>{
 const f=await fixture(t,false);assert.equal(f.worker.qualified,false);assert.equal(await f.worker.admissionReady(),false);assert.equal(f.jobs.length,0);
});
test('contract-selected candidates must all have an observed healthy epoch and publication reserve',async t=>{
 const f=await fixture(t);assert.equal(await f.worker.admissionReady(),true);
 f.health[1].epoch='1';assert.equal(await f.worker.admissionReady(),false);f.health[1].epoch='2';
 f.ds[2].batchIndex=30000n;assert.equal(await f.worker.admissionReady(),false);assert.equal(f.jobs[0].name,'closeReusableArena');
 assert.deepEqual(f.jobs[0].args,[f.apps[2]]);
});
test('rotation never closes an occupied arena and creates only a released unreserved replacement',async t=>{
 const f=await fixture(t);f.ds[0].expiresAt=2000n;f.reserved[0]=77n;
 f.ds[2].status=0;f.health[2].stage='released';f.health[2].online=false;
 assert.equal(await f.worker.admissionReady(),true);assert.equal(f.jobs[0].name,'openReusableArena');assert.deepEqual(f.jobs[0].args,[f.apps[2]]);
 assert.equal(f.jobs[0].value,5n);assert(!f.jobs.some(j=>j.name==='closeReusableArena'));
 f.disable();assert.equal(await f.worker.admissionReady(),false);assert.equal(f.jobs.length,1);
});
test('an idle session retires before its remaining time is too short for a human match',async t=>{
 const f=await fixture(t);f.ds[1].expiresAt=2860n;assert.equal(await f.worker.admissionReady(),false);
 assert.equal(f.jobs[0].name,'closeReusableArena');assert.deepEqual(f.jobs[0].args,[f.apps[1]]);
});

test('age-based rotation waits for the replacement engine, not only its hub admission',async t=>{
 const f=await fixture(t);f.base.getBlock=async(c:any)=>({number:20n,timestamp:c?.blockNumber===3n?1n:8000n});
 for(const d of f.ds)d.expiresAt=100000n;
 f.health[2].stage='starting';f.health[2].online=false;
 assert.equal(await f.worker.admissionReady(),false);assert.equal(f.jobs.length,0);
 f.health[2].stage='available';f.health[2].online=true;
 assert.equal(await f.worker.admissionReady(),false);assert.equal(f.jobs[0].name,'closeReusableArena');
 assert.deepEqual(f.jobs[0].args,[f.apps[0]]);
});

test('age rotation selects the oldest epoch rather than starving the last registered arena',async t=>{
 const f=await fixture(t);
 f.ds[0].baseBlock=20n;f.ds[1].baseBlock=10n;f.ds[2].baseBlock=3n;
 for(const d of f.ds)d.expiresAt=100000n;
 f.base.getBlock=async(c:any)=>({number:30n,timestamp:c?.blockNumber===20n?5000n:c?.blockNumber===10n?100n:c?.blockNumber===3n?1n:8000n});
 assert.equal(await f.worker.admissionReady(),false);
 assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].name,'closeReusableArena');
 assert.deepEqual(f.jobs[0].args,[f.apps[2]]);
});

test('a refused reserve cannot close admission on an existing healthy arena or trigger a retry storm',async t=>{
 const f=await fixture(t);f.ds[2].status=0;f.health[2].stage='released';f.health[2].online=false;
 f.failOpening(Error('ValidatorAtCapacity'));t.mock.method(console,'warn',()=>{});
 assert.equal(await f.worker.admissionReady(),true);
 assert.equal(await f.worker.admissionReady(),true);
 assert.equal(f.jobs.filter(j=>j.name==='openReusableArena').length,1);
 f.health[0].epoch='1';assert.equal(await f.worker.admissionReady(),false,'Reserve failure does not relax actual epoch validation');
 f.health[0].epoch='2';f.ds[1].batchIndex=40000n;
 assert.equal(await f.worker.admissionReady(),false,'Publication budget still blocks an exhausted live arena');
 assert(f.jobs.some(j=>j.name==='closeReusableArena'));
});

test('reserve RPC failure does not disable an independent observed live epoch',async t=>{
 const f=await fixture(t);f.ds[2].status=0;f.health[2].stage='released';f.health[2].online=false;
 const original=f.base.readContract;f.base.readContract=async(c:any)=>{if(c.functionName==='defaultValidator')throw Error('RPC timeout');return original(c);};
 t.mock.method(console,'warn',()=>{});
 assert.equal(await f.worker.admissionReady(),true);assert.equal(f.jobs.length,0);
 f.health[1].online=false;assert.equal(await f.worker.admissionReady(),false);
});
