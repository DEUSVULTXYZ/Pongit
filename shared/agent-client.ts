import {createInterludeClient,decodeSession,storageKey,type SessionStore,type OpenSessionOptions} from '@interludelayer-sdk/sdk';
import {createPublicClient,http,type Abi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {agentActions,agentAuthMessage,validateAgentManifest,type AgentManifest} from './agents';
import {compactRoomsSession} from './compact-rooms-session';
import {engineTransport} from './engine-transport';
import {EngineFeed,TickPilot} from './engine-feed';
import {EngineStream,type EngineState,type StreamSocket} from './engine-stream';
import {readHubDelegation} from './rooms-hub';
import {assertRoomsEngineAvailable} from './rooms-availability';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';
import {recordRpc,measuredFetch} from './rpc-metrics';

export type AgentClientOptions={manifest:AgentManifest;abi:Abi;apiUrl:string;rpcUrl?:string;store:SessionStore;
 commandStore:Pick<Storage,'getItem'|'setItem'>;socket?:(url:string)=>StreamSocket;fetch?:typeof fetch};
/** The same client supports a developer's agent and the explicit Mera grant UI.
 * It never signs with an owner key unless connect() is explicitly requested. */
export function createAgentClient(options:AgentClientOptions){
 const m=validateAgentManifest(options.manifest),fetcher=options.fetch??fetch;
 const journal=new RoomsCommandJournal(options.commandStore,m.app,options.abi);
 const client=createInterludeClient({app:m.app,abi:options.abi,node:m.node,
  base:createPublicClient({chain:monadTestnet,transport:http(options.rpcUrl??'https://testnet-rpc.monad.xyz',{retryCount:0,timeout:8000,fetchFn:measuredFetch('monad')})}),
  store:options.store,expirySeconds:7200,transport:engineTransport(m.node,journal),fastPath:true});
 const stream=new EngineStream(m.node,m.app,options.socket),feed=new EngineFeed(client,stream),pilot=new TickPilot();
 let player:Address|undefined,controls:ReturnType<typeof compactRoomsSession>|undefined,token:string|undefined;
 let movement:{id:bigint;dir:-1|0|1}|undefined,moving:Promise<void>|undefined;
 let lane:Promise<unknown>=Promise.resolve(),recovering:Promise<bigint>|undefined;
 const serial=<T>(fn:()=>Promise<T>)=>{const result=lane.then(fn,fn);lane=result.catch(()=>{});return result;};
 async function api<T=any>(path:string,body?:unknown):Promise<T>{
  const started=Date.now();
  const response=await fetcher(`${options.apiUrl.replace(/\/$/,'')}${path}`,{method:body===undefined?'GET':'POST',
   headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
   body:body===undefined?undefined:JSON.stringify(body,(_,v)=>typeof v==='bigint'?String(v):v),signal:AbortSignal.timeout(15000)});
  recordRpc({at:started,target:'pongit',method:`agents${path}`,status:response.status,ms:Date.now()-started,source:'network'});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??'Agent Arcade is unavailable'),{status:response.status,code:value.code,retryAt:value.retryAt});return value;
 }
 const saved=()=>{if(!player)throw Error('Connect to Agent Arcade first');const s=decodeSession(options.store.get(storageKey(m.app,10143,player)));
  if(!s||s.grant.granter.toLowerCase()!==player.toLowerCase()||s.app.toLowerCase()!==m.app.toLowerCase()||s.grant.expiry<=BigInt(Math.floor(Date.now()/1000)))throw Error('Renew arcade session');return s;};
 async function recoverNow(){
  if(!player)throw Error('Connect to Agent Arcade first');
  const [node,hub]=await Promise.all([client.status(),readHubDelegation(client.base,m.hub,m.app)]);
  assertRoomsEngineAvailable(m.app,node,hub,Math.floor(Date.now()/1000));
  if(String(hub.epoch)!==m.epoch)throw Object.assign(Error('The agent arena renewed. Reload its configuration and reuse the saved grant.'),{code:'AGENT_EPOCH_CHANGED',status:503});
  if(await client.read('RULES_VERSION')!==7n||await client.read('MATCH_DURATION_US')!==300000000n)throw Error('This contract does not implement Agent Arcade rules');
  journal.retirePrevious(player,hub.epoch);
  const s=saved();journal.bindRoomControls(player,s.grant.sessionKey,hub.epoch,s.grant.expiry);
  const pending=journal.pending(player);
  if(pending){
   if(BigInt(pending.epoch)!==hub.epoch)throw Error('Waiting for the previous engine epoch to close');
   const receipt=await client.node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
   if(!receipt)await client.node.request({method:'interlude_sendTransaction',params:[pending.raw]} as any);
   if(journal.pending(player))throw Error('Waiting for the existing command receipt');
  }
  controls=compactRoomsSession({node:client.node,abi:options.abi,app:m.app,stored:s,epoch:hub.epoch});
  feed.invalidate();return hub.epoch;
 }
 function recover(){return recovering??=(serial(recoverNow).finally(()=>{recovering=undefined;}));}
 async function authenticate(){
  const s=saved(),challenge=await api('/auth/challenge',{player});
  // Do not sign arbitrary text supplied by an API server.
  const message=agentAuthMessage(player!,challenge.nonce,challenge.expires,m.app);
  if(message!==challenge.message)throw Error('Unexpected authentication challenge');
  const signature=await privateKeyToAccount(s.privateKey).signMessage({message});
  const result=await api('/auth/session',{player,nonce:challenge.nonce,signature,grant:s.grant,grantSignature:s.signature});token=result.token;return result;
 }
 async function sendNow(name:typeof agentActions[number],args:readonly unknown[]=[]){
  if(!controls||!player)throw Error('Connect to Agent Arcade first');
  const id=name==='acceptMatch'?BigInt((args[0] as any).id):BigInt(args[0] as bigint);
  let result;try{result=await controls.send(name,args);}catch(e){
   // A confirmed revert can race the other player's final point. Its nonce was
   // consumed and journaled. Show the actual terminal state without pretending
   // that a missing receipt or any other rejection is harmless.
   if((e as any).name==='AppRevertError'&&(e as any).errorName==='InvalidMatch'&&!journal.pending(player)){
    const current=await feed.read(id,true);if(current.phase>=3)return {terminal:current};
   }
   throw e;
  }
  await feed.receipt(id,result,name,args,player);return result;
 }
 const send=(name:typeof agentActions[number],args:readonly unknown[]=[])=>serial(()=>sendNow(name,args));
 return {
  manifest:m,client,feed,journal,api,
  get player(){return player;},
  async connect(wallet:OpenSessionOptions['wallet']){
   const session=await client.openSession({wallet,scope:[...agentActions],expirySeconds:7200,assertDigest:true});player=session.granter;
   await recover();await authenticate();return player;
  },
  async resume(owner:Address){player=owner;await client.restoreSession(owner);await recover();await authenticate();return owner;},
  recover,authenticate,send,
  watch(id:bigint,listener:(s:EngineState)=>void){return feed.watch(id,listener);},
  read:(id:bigint,force=false)=>feed.read(id,force),
  async accept(offer:any){
   const current=await feed.read(BigInt(offer.id),true);if(current.phase>=2)return current;
   if(current.phase===1&&player){
    const accepted=Number(await client.read('acceptance',[BigInt(offer.id)]));
    const bit=player.toLowerCase()===current.a.toLowerCase()?1:player.toLowerCase()===current.b.toLowerCase()?2:0;
    if(bit&&(accepted&bit))return current;
   }
   const {signature,...ticket}=offer;for(const field of ['id','expires','rules'])ticket[field]=BigInt(ticket[field]);
   await send('acceptMatch',[ticket,signature as Hex]);return feed.read(ticket.id,true);
  },
  move(id:bigint,dir:-1|0|1){
   movement={id,dir};if(moving)return moving;
   moving=(async()=>{while(movement){const intent=movement;movement=undefined;const s=await feed.read(intent.id);
    if(s.phase!==2||!player)continue;const side=s.a.toLowerCase()===player.toLowerCase()?0:s.b.toLowerCase()===player.toLowerCase()?1:-1;
    if(side<0)throw Error('This account is not playing');
    const confirmed=side===0?s.state.leftDir:s.state.rightDir;if(confirmed===intent.dir)continue;
    await send('input',[intent.id,intent.dir,(side===0?s.nonceA:s.nonceB)+1n,s.head+150n]);
   }})().finally(()=>{moving=undefined;});return moving;
  },
  async tickIfNeeded(id:bigint,monotonicMs:number){
   const s=await feed.read(id);pilot.observe(s,monotonicMs);
   const side=player?.toLowerCase()===s.a.toLowerCase()?0:player?.toLowerCase()===s.b.toLowerCase()?1:-1;
   if(!moving&&pilot.due(side,s,monotonicMs)){pilot.sending(true);try{await send('tick',[id]);pilot.observe(await feed.read(id),monotonicMs,true);}finally{pilot.sending(false);}}
  },
  async disconnect(){
   movement=undefined;await moving?.catch(()=>{});let revocationPending=false;
   try{await serial(()=>controls?.revoke()??Promise.resolve());}catch{revocationPending=true;}
   try{await api('/disconnect',{});}catch{}
   if(player)options.store.remove(storageKey(m.app,10143,player));controls=undefined;player=undefined;token=undefined;stream.stop();return {revocationPending};
  },
  stop(){movement=undefined;stream.stop();},
 };
}
export type AgentClient=ReturnType<typeof createAgentClient>;
