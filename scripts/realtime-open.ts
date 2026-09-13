import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
const app='0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5',file='/secrets/realtime-20260913.json';
const record=JSON.parse(await readFile(file,'utf8'));assert(record.error?.includes(app)||record.app===app);
const t=await chainTools('realtime-20260913');
try{
 const a=await t.artifact('PongRoomsRealtime'),hub=await t.base.readContract({address:app,abi:a.abi,functionName:'hub'}) as `0x${string}`;
 assert.equal(await t.base.readContract({address:app,abi:a.abi,functionName:'RULES_VERSION'}),5n);
 assert.equal((await t.base.readContract({address:app,abi:a.abi,functionName:'operator'}) as string).toLowerCase(),t.account.address.toLowerCase());
 if((await readHubDelegation(t.base,hub,app)).status===0)await t.write('open-recovered-candidate',app,a.abi,'renewEngine');
 const d=await readHubDelegation(t.base,hub,app);assert.equal(d.status,1);
 record.app=app;record.epoch=String(d.epoch);
 const save=async()=>{await writeFile(file+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(file+'.next',file);};
 const create=!record.hostedRequest;
 if(create){record.hostedRequest={state:'sending',at:new Date().toISOString()};await save();}
 const response=await fetch('https://control.interludelayer.xyz/sessions'+(create?'':'/'+app),{method:create?'POST':'GET',headers:{'content-type':'application/json'},...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(45000)});
 const body:any=await response.json();record.hostedRequest.state=response.ok?'answered':'uncertain';record.hostedRequest.http=response.status;
 if(body.url){record.node=body.url;record.state='answered';}await save();
 console.log(JSON.stringify({app,epoch:record.epoch,http:response.status,node:record.node,error:body.error}));assert(response.ok&&record.node);
}finally{await t.close();}
