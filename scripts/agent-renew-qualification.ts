// Real hosted grant renewal while the previous authorization is still valid.
// Uses only an existing synthetic human-browser test identity, never a user key.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {createAgentClient} from '../shared/agent-client';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
assert.equal(process.env.PONG_AGENT_RENEW_TEST,'isolated-vps');
const m=JSON.parse(readFileSync('/metadata/manifest.json','utf8'));assert.equal(m.app,'0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9');assert(!m.enabled&&!m.qualified);
const fixture=JSON.parse(readFileSync('/fixtures/chaos-events-browser-9.json','utf8'));const owner=privateKeyToAccount(fixture.people[0].key);
const file='/secrets/renewal-test-state.json';let values:Record<string,string>={};try{values=JSON.parse(readFileSync(file,'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
const save=()=>{writeFileSync(file+'.next',JSON.stringify(values),{mode:0o600});renameSync(file+'.next',file);};
const store={get:(k:string)=>values[k]??null,set:(k:string,v:string)=>{values[k]=v;save();},remove:(k:string)=>{delete values[k];save();}};
const wallet=createWalletClient({account:owner,chain:monadTestnet,transport:http()});let signatures=0;
const sign=wallet.signTypedData.bind(wallet);wallet.signTypedData=((...args:any[])=>{signatures++;return (sign as any)(...args);}) as any;
const client=createAgentClient({manifest:m,abi,apiUrl:'http://pongit-agent-service-20260913:4100',store,commandStore:{getItem:store.get,setItem:store.set}});
const saved=()=>decodeSession(store.get(storageKey(m.app,10143,owner.address)))!;
try{
 await client.connect(wallet);const first=saved(),before=signatures;assert(first.grant.expiry>BigInt(Math.floor(Date.now()/1000)+600));
 await client.connect(wallet);assert.equal(saved().grant.sessionKey,first.grant.sessionKey);assert.equal(signatures,before);
 await client.connect(wallet,{renew:true});const next=saved();assert.notEqual(next.grant.sessionKey,first.grant.sessionKey);assert.equal(signatures,before+1);assert.equal(next.grant.selectors.length,5);assert(!next.grant.anyFunction);
 await client.api('/heartbeat',{});await client.resume(owner.address);assert.equal(saved().grant.sessionKey,next.grant.sessionKey);assert.equal(signatures,before+1);
 const result={at:new Date().toISOString(),app:m.app,scope:'Real hosted SDK and authenticated API with a synthetic test owner',ordinaryConnectReusedGrant:true,explicitRenewRotatedKey:true,ownerSignaturesForRenewal:1,limitedSelectors:5,resumeDidNotSign:true,passed:true};
 await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/grant-renewal.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{client.stop();save();}
