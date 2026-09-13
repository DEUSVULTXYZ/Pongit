// House controllers only. Community agents execute on their creators' machines.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {createWalletClient,http,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {decodeSession,storageKey} from '@interludelayer-sdk/sdk';
import {createAgentClient} from '../shared/agent-client';
import {AgentController} from '../shared/agent-controller';
import {agentMetadata,agentRegistrationTypes,type AgentManifest} from '../shared/agents';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {engineReadRetryMs} from '../shared/engine-read';
import {takeRpcSamples} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_AGENT_WORKER,'dedicated-authorized');
const m=JSON.parse(readFileSync(process.env.PONG_AGENT_MANIFEST!,'utf8')) as AgentManifest;
const secrets=JSON.parse(readFileSync(process.env.PONG_AGENT_KEYS!,'utf8'));
assert(secrets.bots.length===3&&m.app.toLowerCase()!=='0x78d3341e3452d7ec1add9371de3008639eed8eb0');
const root=process.env.PONG_AGENT_STATE!;assert(root.startsWith('/secrets/'));mkdirSync(root,{recursive:true,mode:0o700});
const apiUrl=process.env.PONG_AGENT_API!;assert(apiUrl);let stopping=false;
const closeMetrics=process.env.PONG_AGENT_DIAGNOSTICS?await agentMetrics(process.env.PONG_AGENT_DIAGNOSTICS,'bots'):async()=>{};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
process.on('SIGTERM',()=>{stopping=true;});

await Promise.all(secrets.bots.map(async(bot:any,index:0|1|2)=>{
 const owner=privateKeyToAccount(bot.key as Hex),creator=privateKeyToAccount(secrets.creator as Hex),file=`${root}/${index}.json`;
 let record:Record<string,string>={};try{record=JSON.parse(readFileSync(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const save=()=>{writeFileSync(file+'.next',stringify(record),{mode:0o600});renameSync(file+'.next',file);};
 const store={get:(k:string)=>record[k]??null,set:(k:string,v:string)=>{record[k]=v;save();},remove:(k:string)=>{delete record[k];save();}};
 const client=createAgentClient({manifest:m,abi,apiUrl,rpcUrl:process.env.RPC_URL,store,commandStore:{getItem:store.get,setItem:store.set}});
 const wallet=createWalletClient({account:owner,chain:monadTestnet,transport:http(process.env.RPC_URL)}),controller=new AgentController(index);
 let connected=false,registered=false,currentId:bigint|undefined,unwatch:(()=>void)|undefined,lastHeartbeat=0,lastLobby=0,match:any,reconnected=false,errorAt=0,frames=0;
 try{while(!stopping){
  try{
   if(!registered){
    const catalog=await client.api('/catalog');
    if(!catalog.agents.some((x:any)=>x.agent.toLowerCase()===owner.address.toLowerCase())){
     const metadata=agentMetadata(bot.name,bot.avatar),expires=BigInt(Math.floor(Date.now()/1000)+300);
     const registration={creator:creator.address,agent:owner.address,modes:3,metadata,expires};
     const typed={domain:{name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:m.app},types:agentRegistrationTypes,primaryType:'AgentRegistration' as const,message:registration};
     const [creatorProof,agentProof]=await Promise.all([creator.signTypedData(typed),owner.signTypedData(typed)]);
     await client.api('/register',{...registration,name:bot.name,avatar:bot.avatar,creatorProof,agentProof});
    }
    registered=true;
   }
   if(!connected){
    const stored=decodeSession(store.get(storageKey(m.app,10143,owner.address)));
    if(stored&&stored.grant.expiry>BigInt(Math.floor(Date.now()/1000)+30))await client.resume(owner.address);else await client.connect(wallet);
    await client.api('/availability',{available:true});
    // Mode qualification is a service protocol, never a self-awarded ELO.
    for(const mode of [0,1])await client.api('/qualification',{mode});
    connected=true;lastLobby=0;
   }
   const now=Date.now();
   if(now-lastHeartbeat>=10000){await client.api('/heartbeat',{});lastHeartbeat=now;}
   if(now-lastLobby>=1000){match=(await client.api('/me')).match;lastLobby=now;}
   if(!match){
    if(currentId){unwatch?.();unwatch=undefined;currentId=undefined;controller.reset();}
    const stored=decodeSession(store.get(storageKey(m.app,10143,owner.address)));
    if(stored&&stored.grant.expiry<BigInt(Math.floor(now/1000)+360)){
     await client.connect(wallet);lastHeartbeat=0;
    }
    await sleep(200);continue;
   }
   const id=BigInt(match.id);
   if(currentId!==id){unwatch?.();currentId=id;unwatch=client.watch(id,()=>{frames++;});controller.reset();reconnected=false;}
   if(match.offer&&['offered','preparing'].includes(match.status))await client.accept(match.offer);
   const snapshot=await client.read(id);const side=snapshot.a.toLowerCase()===owner.address.toLowerCase()?0:1;
   if(snapshot.phase===2){
    const nonce=side===0?snapshot.nonceA:snapshot.nonceB;
    if(match.kind==='qualification'&&!reconnected&&nonce>=2n){
     await client.api('/qualification/checkpoint',{});
     unwatch?.();unwatch=undefined;await client.resume(owner.address);
     unwatch=client.watch(id,()=>{frames++;});await client.read(id,true);
     await client.api('/qualification/checkpoint',{});reconnected=true;
    }
    const direction=controller.decide(snapshot,side,performance.now());await client.move(id,direction);await client.tickIfNeeded(id,performance.now());
   }
   await sleep(55);
  }catch(e){
   if((e as any).status===401)connected=false;
   if(Date.now()-errorAt>10000){errorAt=Date.now();console.log(stringify({at:new Date().toISOString(),bot:bot.name,status:'synchronizing',error:String((e as any).shortMessage||(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160)}));}
   await sleep(Math.max(1000,engineReadRetryMs(e)));
   if(connected){try{await client.recover();}catch(recovery){if(/expired|Renew arcade session/.test(String((recovery as Error).message)))connected=false;}}
  }
 }}finally{unwatch?.();client.stop();save();console.log(stringify({at:new Date().toISOString(),bot:bot.name,frames,rpc:takeRpcSamples(200).map(x=>({target:x.target,method:x.method,ms:x.ms,status:x.status,source:x.source}))}));}
}));
await closeMetrics();
