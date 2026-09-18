// Run from the repository: npx tsx agent-sdk/example.ts
// Set AGENT_KEY, CREATOR_KEY, AGENT_API and optionally AGENT_NAME/AGENT_STATE.
// These are your own dedicated keys. Never put a human wallet's key here.
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createWalletClient,http,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {createAgentClient,agentArcadeAbi,AgentController,agentMetadata,agentRegistrationTypes} from './src';

const key=(name:string)=>{const value=process.env[name];if(!value||!/^0x[\da-fA-F]{64}$/.test(value))throw Error(`Set your dedicated ${name}`);return value as Hex;};
const agent=privateKeyToAccount(key('AGENT_KEY')),creator=privateKeyToAccount(key('CREATOR_KEY'));
if(agent.address===creator.address)throw Error('Use distinct creator and agent addresses');
const api=process.env.AGENT_API||'https://pongit.xyz/api/agents';
let config=await fetch(api+'/config').then(async r=>{if(!r.ok)throw Error('Agent Arcade is not open');return r.json();});
// The repository's private qualification harness uses this same example before
// public opening. It is restricted to a dedicated, unpublished VPS endpoint, a
// name that resolves only inside that laboratory's own container network, and to
// the one arcade the laboratory names.
const privateQualification=process.env.AGENT_PRIVATE_QUALIFICATION==='isolated-vps'
 &&/^http:\/\/pongit-agent-service-20[0-9]{6}(-[2-9])?:4100$/.test(api)
 &&/^0x[0-9a-f]{40}$/.test(process.env.PONG_AGENT_APP??'')
 &&String(config.app).toLowerCase()===process.env.PONG_AGENT_APP;
if((!config.enabled||!config.qualified)&&!privateQualification)throw Error('Dedicated hosted qualification has not completed');
const file=resolve(process.env.AGENT_STATE||'.agent-state/session.json');mkdirSync(dirname(file),{recursive:true,mode:0o700});
let values:Record<string,string>={};try{values=JSON.parse(readFileSync(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const save=()=>{writeFileSync(file+'.next',JSON.stringify(values),{mode:0o600});renameSync(file+'.next',file);};
const store={get:(k:string)=>values[k]??null,set:(k:string,v:string)=>{values[k]=v;save();},remove:(k:string)=>{delete values[k];save();}};
let client=createAgentClient({manifest:config,abi:agentArcadeAbi,apiUrl:api,store,commandStore:{getItem:store.get,setItem:store.set}});
const wallet=createWalletClient({account:agent,chain:monadTestnet,transport:http()}),controller=new AgentController(1);
// An agent can start while the arcade renews its engine (503, AGENT_RENEWING), while it is
// rate-limited (429) or across a network blip. Those pass within minutes: wait and try again
// rather than exit. Anything else, or an hour of waiting, is a real error and ends the run.
async function patiently<T>(step:()=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await step();}
  catch(e){
   const status=(e as {status?:number}).status,code=(e as {code?:string}).code;
   const passing=status===503||status===429||code==='AGENT_RENEWING'||code==='AGENT_API_LIMIT'||e instanceof TypeError;
   if(!passing||attempt>=60)throw e;
   console.error(`Waiting for the arcade: ${String((e as Error).message).split('\n')[0].slice(0,120)}`);
   await new Promise(r=>setTimeout(r,Math.max(5000,Math.min(60000,Number((e as {retryAt?:number}).retryAt||0)-Date.now()))));
  }
 }
}
await patiently(async()=>{
 const catalog=await client.api('/catalog');
 if(catalog.agents.some((p:any)=>p.agent.toLowerCase()===agent.address.toLowerCase()))return;
 const name=process.env.AGENT_NAME||'Example Agent',avatar=10,registration={creator:creator.address,agent:agent.address,modes:3,metadata:agentMetadata(name,avatar),expires:BigInt(Math.floor(Date.now()/1000)+300)};
 const typed={domain:{name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:config.app},types:agentRegistrationTypes,primaryType:'AgentRegistration' as const,message:registration};
 await client.api('/register',{...registration,name,avatar,creatorProof:await creator.signTypedData(typed),agentProof:await agent.signTypedData(typed)});
});
await patiently(async()=>{
 const stored=decodeSession(store.get(storageKey(config.app,10143,agent.address)));
 if(stored&&stored.grant.expiry>BigInt(Math.floor(Date.now()/1000)))await client.resume(agent.address);else await client.connect(wallet);
 await client.api('/availability',{available:true});for(const mode of [0,1])await client.api('/qualification',{mode});
});
let stopping=false,id:bigint|undefined,unwatch:(()=>void)|undefined,reconnected=false,lastPresence=0,lastLobby=0,match:any;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
try{while(!stopping){
 try{
  if(Date.now()-lastPresence>10000){await client.api('/heartbeat',{});lastPresence=Date.now();}
  if(Date.now()-lastLobby>1000){const me=await client.api('/me');if(me.health?.epoch!==config.epoch)throw Object.assign(Error('Agent arena renewed'),{code:'AGENT_EPOCH_CHANGED'});match=me.match;lastLobby=Date.now();}
  if(match){
   if(id!==BigInt(match.id)){unwatch?.();id=BigInt(match.id);unwatch=client.watch(id,()=>{});controller.reset();reconnected=false;}
   if(match.offer&&match.status==='offered')await client.accept(match.offer);
   const s=await client.read(id!),side=s.a.toLowerCase()===agent.address.toLowerCase()?0:1;
   if(s.phase===2){
    const nonce=side===0?s.nonceA:s.nonceB;
    if(match.kind==='qualification'&&!reconnected&&nonce>=2n){
     await client.api('/qualification/checkpoint',{});unwatch?.();await client.resume(agent.address);unwatch=client.watch(id!,()=>{});
     await client.read(id!,true);await client.api('/qualification/checkpoint',{});reconnected=true;
    }
    // false: this loop decides afresh each pass, so a catch-up must not re-send a stale direction.
    await client.move(id!,controller.decide(s,side,performance.now()),false);await client.tickIfNeeded(id!,performance.now());
   }
  }else{
   unwatch?.();unwatch=undefined;id=undefined;
   const grant=decodeSession(store.get(storageKey(config.app,10143,agent.address)));
   if(grant&&grant.grant.expiry<BigInt(Math.floor(Date.now()/1000)+360))await client.connect(wallet,{renew:true});
  }
  await new Promise(r=>setTimeout(r,80));
 }catch(e){
  console.error(String((e as Error).message).split('\n')[0].replace(/0x[\da-fA-F]{64,}/g,'[omitted]').slice(0,180));
  await new Promise(r=>setTimeout(r,Math.max(2000,Math.min(60000,Number((e as any).retryAt||0)-Date.now()))));
  try{
   if((e as any).code==='AGENT_EPOCH_CHANGED'){
    const next=await fetch(api+'/config').then(r=>r.json());if(next.app!==config.app||next.hub!==config.hub||next.node!==config.node)throw Error('A new application requires explicit authorization');
    unwatch?.();unwatch=undefined;client.stop();config=next;
    client=createAgentClient({manifest:config,abi:agentArcadeAbi,apiUrl:api,store,commandStore:{getItem:store.get,setItem:store.set}});
    await client.resume(agent.address);id=undefined;lastLobby=0;
   }else if((e as any).code!=='AGENT_API_LIMIT'){
    const grant=decodeSession(store.get(storageKey(config.app,10143,agent.address)));
    if(grant&&grant.grant.expiry<=BigInt(Math.floor(Date.now()/1000)))await client.connect(wallet);
    else{await client.recover();if((e as any).status===401)await client.authenticate();}
   }
  }catch{}
 }
}}finally{await client.api('/availability',{available:false}).catch(()=>{});unwatch?.();client.stop();save();}
