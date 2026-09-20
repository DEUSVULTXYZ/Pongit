import {createPublicClient,type PublicClient} from 'viem';
import {EngineFeed} from './engine-feed';
import {EngineStream,type EngineState} from './engine-stream';
import {engineTransport,engineCooldownMs} from './engine-transport';
import {agentPoolArenaAbi} from './agent-pool-abi';
import {readArenaLaunch} from './arena-launch';
import {validateAgentPoolManifest,type AgentPoolManifest,type PoolMatchView} from './agent-pool';

/** Read-only spectator, bound to one complete reference. No wallet, session key,
 * signing SDK or permissionless game ticks are created by watching an arena. */
export async function createPoolObserver(manifest:AgentPoolManifest,match:PoolMatchView,
 socket:(url:string)=>any,runtime?:{node:PublicClient;feed:EngineFeed}){
 const m=validateAgentPoolManifest(manifest),arena=m.arenas.find(a=>a.app.toLowerCase()===match.ref.app.toLowerCase());
 const abi=agentPoolArenaAbi(m);
 if(!arena||!match.node||match.node!==arena.node||!match.currentBinding||match.result
  ||match.ref.chainId!==10143||!/^\d{1,78}$/.test(match.ref.id)||!/^\d{1,78}$/.test(match.ref.epoch)
  ||BigInt(match.ref.id)<1n||BigInt(match.ref.epoch)<1n||BigInt(match.ref.id)>=2n**256n||BigInt(match.ref.epoch)>=2n**256n)throw Error('This reference is available as a published summary only');
 const node=runtime?.node??createPublicClient({transport:engineTransport(arena.node),pollingInterval:1000});
 const stream=new EngineStream(arena.node,arena.app,socket,()=>engineCooldownMs(arena.node));
 const feed=runtime?.feed??new EngineFeed({app:arena.app,abi,node},stream);let checkedAt=0,stopped=false;
 const validate=async(force=false)=>{
  if(stopped)throw Error('Arena observation has stopped');if(!force&&Date.now()-checkedAt<10000)return;
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  if(String(session.app).toLowerCase()!==arena.app.toLowerCase()||BigInt(session.epoch)!==BigInt(match.ref.epoch)||session.chainId!==4242)
   throw Error('This arena has changed epoch. Reading its published result.');
  if(await node.readContract({address:arena.app,abi,functionName:'RULES_VERSION'})!==BigInt(m.rulesVersion))throw Error('Unsupported agent arena rules');
  checkedAt=Date.now();
 };
 const verify=(s:EngineState)=>{
  if(s.id!==BigInt(match.ref.id)||s.a.toLowerCase()!==match.a.toLowerCase()||s.b.toLowerCase()!==match.b.toLowerCase())throw Error('Arena state belongs to another match');
  return s;
 };
 await validate(true);const watchers=new Set<()=>void>();
 return{
  async launch(){await validate();return m.version===4?readArenaLaunch(node,arena.app,BigInt(match.ref.id)):undefined;},
  async read(force=false){await validate(force);return verify(await feed.read(BigInt(match.ref.id),force));},
  watch(listener:(s:EngineState)=>void){
   const stop=feed.watch(BigInt(match.ref.id),s=>{try{if(!stopped&&Date.now()-checkedAt<10000)listener(verify(s));}catch{feed.invalidate();}});
   watchers.add(stop);return()=>{stop();watchers.delete(stop);};
  },
  close(){stopped=true;for(const stop of watchers)stop();watchers.clear();},
 };
}
