// A reviewed, immutable testnet game. Creation is journaled before HTTP and never blindly repeated.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {keccak256} from 'viem';
assert.equal(process.env.PONG_REALTIME_PROVISION,'authorized-testnet');
const path=process.env.PONG_REALTIME_JOURNAL!;assert(path?.startsWith('/secrets/'));
const name=process.env.PONG_REALTIME_RELEASE||'PongRoomsRealtimeRelease';assert(['PongRoomsRealtimeRelease','PongRoomsCompactRelease'].includes(name));
const artifact=JSON.parse(await readFile(`contracts/out/${name.replace('Release','')}.sol/${name}.json`,'utf8'));
const codeHash=keccak256(artifact.bytecode.object);assert((artifact.deployedBytecode.object.length-2)/2<=24576);
let record:any;
try{record=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(record){assert.equal(record.codeHash,codeHash);assert(record.app,'Creation remains uncertain; inspect the existing attempt');console.log(JSON.stringify(record));}
else{
 record={purpose:name,chainId:10143,codeHash,state:'sending',at:new Date().toISOString()};
 const save=async()=>{await writeFile(path+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(path+'.next',path);};await save();
 try{
  const response=await fetch('https://control.interludelayer.xyz/apps',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,bytecode:artifact.bytecode.object,abi:artifact.abi.filter((x:any)=>x.type==='constructor'||x.type==='function'&&x.name==='delegateAll')}),signal:AbortSignal.timeout(120000)});
  const body:any=await response.json().catch(()=>null);
  record.http=response.status;record.app=body?.app;record.node=body?.url;record.state=response.ok&&record.app?'answered':'inspection';
  record.error=typeof body?.error==='string'?body.error.replace(/0x[\da-f]{130,}/gi,'[hex omitted]').slice(0,300):undefined;
  await save();console.log(JSON.stringify(record));assert(response.ok&&record.app&&record.node,'Hosted creation not confirmed');
 }catch(e){if(record.state==='sending'){record.state='uncertain';await save();}throw e;}
}
