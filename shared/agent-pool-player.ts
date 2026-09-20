import {createPublicClient,keccak256,parseTransaction,zeroHash,type LocalAccount,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {EngineFeed} from './engine-feed';
import {EngineStream,type EngineState} from './engine-stream';
import {engineTransport,engineCooldownMs} from './engine-transport';
import {readHubDelegation} from './rooms-hub';
import {compactArenaSession,type ArenaSender} from './compact-arena-session';
import {terminalAfterRevert} from './terminal-command';
import {RoomsCommandJournal,resendJournaled} from '../web/lib/rooms-command-journal';
import {agentPoolArenaAbi} from './agent-pool-abi';
import {readArenaLaunch} from './arena-launch';
import {validateAgentPoolManifest,type AgentPoolManifest,type PoolMatchView} from './agent-pool';
import type {PoolFamilySession} from './agent-pool-family';
import type {PoolSessionStorage} from './agent-pool-sponsor';
import {readPoolPermission} from './agent-pool-permission';
import {preparePoolActive} from './agent-pool-active';

export const POOL_PLAYER_GAS=14_800_000n;
/** One node connection and tab journal per watched arena. The family permission
 * was bound on Monad before delegation; no root grant travels with movements.
 * Watching/recovering remains possible when admissions or authorization expire.
 * This client never chooses an agent, starts a game or transports financial calls. */
export function createPoolPlayer(manifest:AgentPoolManifest,match:PoolMatchView,session:PoolFamilySession,
 options:{base:PublicClient;storage:PoolSessionStorage;socket:(url:string)=>any;now?:()=>number},runtime?:{node:PublicClient;feed:EngineFeed}){
 const m=validateAgentPoolManifest(manifest),arena=m.arenas.find(a=>a.app.toLowerCase()===match.ref.app.toLowerCase()),player=session.grant.player;
 const abi=agentPoolArenaAbi(m),reusable=m.version===4;
 if(!arena||match.node!==arena.node||!match.currentBinding||match.result||match.ref.chainId!==10143
  ||!/^\d{1,78}$/.test(match.ref.id)||!/^\d{1,78}$/.test(match.ref.epoch)||BigInt(match.ref.id)<1n||BigInt(match.ref.epoch)<1n
  ||BigInt(match.ref.id)>=2n**256n||BigInt(match.ref.epoch)>=2n**256n||![match.a,match.b].some(a=>a.toLowerCase()===player.toLowerCase())
  ||privateKeyToAccount(session.key).address.toLowerCase()!==session.grant.key.toLowerCase())throw Error('This arcade key is not bound to the requested match');
 const id=BigInt(match.ref.id),epoch=BigInt(match.ref.epoch),journal=new RoomsCommandJournal(options.storage,arena.app,abi),now=options.now??Date.now;
 const node=runtime?.node??createPublicClient({transport:engineTransport(arena.node,journal),pollingInterval:1000});
 const stream=new EngineStream(arena.node,arena.app,options.socket,()=>engineCooldownMs(arena.node));
 const feed=runtime?.feed??new EngineFeed({app:arena.app,abi,node},stream);
 let sender:ArenaSender|undefined,stopped=false,verifiedAt=0,controlsUntil=0,lane:Promise<unknown>=Promise.resolve();
 let moving:Promise<void>|undefined,intention:{dir:-1|0|1}|undefined;
 const listeners=new Set<()=>void>();
 const serial=<T>(work:()=>Promise<T>)=>{const p=lane.then(work,work);lane=p.catch(()=>{});return p;};
 const verify=(s:EngineState)=>{if(s.id!==id||s.a.toLowerCase()!==match.a.toLowerCase()||s.b.toLowerCase()!==match.b.toLowerCase())throw Error('Arena state belongs to another match');return s;};
 const permissionPending=()=>{const p=journal.pending(session.grant.key);return p&&['renewActive','revokeActive'].includes(p.action)?p:undefined;};
 async function reconcilePermission(){
  const p=permissionPending();if(!p)return;
  if(p.epoch!==String(epoch)||p.match!==String(id))throw Error('A permission belongs to another arena epoch');
  let receipt:any=await node.getTransactionReceipt({hash:p.hash}).catch(()=>null);
  if(receipt)journal.received('eth_getTransactionReceipt',receipt);
  else{
   journal.bindPermission(session.grant.key,epoch,id,parseTransaction(p.raw).data!);
   const outcome=await resendJournaled(journal,p,{send:raw=>node.request({method:'interlude_sendTransaction',params:[raw]} as any),latestNonce:()=>node.getTransactionCount({address:session.grant.key,blockTag:'latest'}),commandGas:()=>POOL_PLAYER_GAS});
   if(outcome.kind==='sent'){receipt=outcome.receipt;journal.received('interlude_sendTransaction',receipt);}
   else throw Error('The owner permission was refused before execution. Retry after reviewing the node limit.');
  }
  if(journal.pending(session.grant.key))throw Error('The owner permission is awaiting its exact receipt');
  if(!receipt||!['0x1','success'].includes(String(receipt.status)))throw Error('The owner permission reverted. Read its current revision before retrying.');
 }
 async function identify(force=false){
  if(stopped)throw Error('Arena controls have stopped');if(!force&&verifiedAt&&now()-verifiedAt<10000)return;
  const status:any=await node.request({method:'interlude_session',params:[]} as any);journal.received('interlude_session',status);
  if(String(status.app).toLowerCase()!==arena!.app.toLowerCase()||Number(status.chainId)!==4242)throw Error('Unexpected arena engine identity');
  if(BigInt(status.epoch)!==epoch)throw Error('This match has moved to its published result. Open its original result reference.');
  if(await node.readContract({address:arena!.app,abi,functionName:'RULES_VERSION'})!==BigInt(m.rulesVersion))throw Error('Unexpected arena rules');
  verifiedAt=now();
 }
 async function recoverNow(){
  if(stopped)throw Error('Arena controls have stopped');
  sender=undefined;
  if(await options.base.getChainId()!==10143)throw Error('Arena authorization requires Monad Testnet');
  const block=await options.base.getBlock(),hub=await readHubDelegation(options.base,m.hub,arena!.app,block.number);
  // A new hub epoch is closure evidence even when the old node is unavailable.
  // Verify the pinned block before retiring any uncertain command.
  if((await options.base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arena publication changed during authorization');
  if(hub.epoch>epoch){journal.retirePrevious(session.grant.key,hub.epoch);throw Error('The prior arena epoch is closed. Read its published result.');}
  if(hub.epoch!==epoch)throw Error('Waiting for the assigned arena epoch');
  if(hub.status===0){journal.retireClosed(session.grant.key,epoch);throw Error('The arena epoch is closed. Read its published result.');}
  await identify(true);
  if(permissionPending()&&hub.status===1&&hub.expiresAt>block.timestamp)await reconcilePermission();
  const b=await node.readContract({address:arena!.app,abi,functionName:'boundMatch'});
  if(b.id!==id||b.epoch!==epoch||b.a.toLowerCase()!==match.a.toLowerCase()||b.b.toLowerCase()!==match.b.toLowerCase())throw Error('Arena binding changed');
  const side=b.a.toLowerCase()===player.toLowerCase()?0:1,initial=side===0?b.controlA:b.controlB;
  if(initial.codeHash!==zeroHash)throw Error('Only the bound human participant can use these controls');
  const code=await options.base.getCode({address:arena!.app,blockNumber:block.number});
  if(!code||keccak256(code)!==arena!.runtimeHash)throw Error('Arena bytecode differs from the approved deployment');
  if((await options.base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arena publication changed during authorization');
  const control=await readPoolPermission(node,arena!.app,id,side,initial,reusable);
  if(control.key.toLowerCase()!==session.grant.key.toLowerCase()||control.expires!==session.grant.expires)
   throw Error('The current arena needs its own confirmed owner authorization');
  journal.bindDirect(session.grant.key,epoch,id,control.expires,reusable);journal.retirePrevious(session.grant.key,epoch);
  const pending=journal.pending(session.grant.key);
  if(pending){
   if(BigInt(pending.epoch)!==epoch)throw Error('A command from another epoch is awaiting closure');
   const receipt=await node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
   if(receipt)journal.received('eth_getTransactionReceipt',receipt);
   else if(hub.status===1&&hub.expiresAt>block.timestamp&&control.expires>block.timestamp&&!control.revoked){
    const outcome=await resendJournaled(journal,pending,{send:raw=>node.request({method:'interlude_sendTransaction',params:[raw]} as any),
     latestNonce:()=>node.getTransactionCount({address:session.grant.key,blockTag:'latest'}),commandGas:()=>POOL_PLAYER_GAS});
    if(outcome.kind==='sent')journal.received('interlude_sendTransaction',outcome.receipt);
   }
   if(journal.pending(session.grant.key))throw Error('The existing command is still being reconciled; your arcade key is saved');
  }
  if(hub.status!==1||hub.expiresAt<=block.timestamp)throw Error('This arena is recovering; your arcade key is saved');
  if(control.revoked)throw Error('This arena authorization was revoked by its owner');
  if(control.expires<=block.timestamp)throw Error('Renew the active arena authorization');
  if(stopped)throw Error('Arena controls have stopped');
  // Fence against the hub again shortly. UI health changes must not reset the
  // renderer, session key, last intent or authoritative positions.
  controlsUntil=now()+Math.min(3000,Number(hub.expiresAt-block.timestamp)*1000);
  sender=compactArenaSession({node,abi,app:arena!.app,key:session.key,match:id,...(reusable?{epoch}:{}),expires:control.expires,gas:POOL_PLAYER_GAS,now});
  feed.invalidate();return verify(await feed.read(id,true));
 }
 async function authorizeControls(){
  if(!sender||journal.pending(session.grant.key)){await recoverNow();return;}
  if(stopped)throw Error('Arena controls have stopped');
  if(now()<controlsUntil)return;
  try{
   // The immutable binding and runtime were checked during recovery. Repeating
   // that entire handshake every three seconds stalls input and discards the
   // sender's known nonce. Only the mutable hub fence needs this cadence; the
   // contract still checks active permission/expiry on every signed command.
   const block=await options.base.getBlock(),hub=await readHubDelegation(options.base,m.hub,arena!.app,block.number);
   if((await options.base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arena publication changed during authorization');
   if(hub.epoch>epoch){journal.retirePrevious(session.grant.key,hub.epoch);throw Error('The prior arena epoch is closed. Read its published result.');}
   if(hub.epoch===epoch&&hub.status===0){journal.retireClosed(session.grant.key,epoch);throw Error('The arena epoch is closed. Read its published result.');}
   if(hub.epoch!==epoch||hub.status!==1||hub.expiresAt<=block.timestamp)throw Error('This arena is recovering; your arcade key is saved');
   await identify();
   if(stopped)throw Error('Arena controls have stopped');
   controlsUntil=now()+Math.min(3000,Number(hub.expiresAt-block.timestamp)*1000);
  }catch(error){sender=undefined;throw error;}
 }
 async function sendNow(name:'input'|'concede'|'confirmReady',args:readonly unknown[]){
  if(stopped)throw Error('Arena controls have stopped');
  await authorizeControls();
  if(stopped)throw Error('Arena controls have stopped');
  const boundArgs=reusable?[epoch,...args]:args;
  try{const result=await sender!.send(name,boundArgs);return verify(await feed.receipt(id,result,name,boundArgs,player));}
  catch(error){
   const terminal=await terminalAfterRevert(error,id,()=>journal.pending(session.grant.key),async()=>verify(await feed.read(id,true)));
   if(terminal){intention=undefined;return terminal;}
   sender=undefined;throw error;
  }
 }
 function pump(){
  if(moving)return moving;
  moving=(async()=>{while(intention&&!stopped){
   const latest=intention;
   try{await serial(async()=>{
    await authorizeControls();
   const s=verify(await feed.read(id));if(s.phase!==2){intention=undefined;return;}
    if(stopped)throw Error('Arena controls have stopped');
    // Coalesce again after awaited recovery; never dispatch an obsolete intent.
    const selected=intention??latest,side=s.a.toLowerCase()===player.toLowerCase()?0:1;
    if((side===0?s.state.leftDir:s.state.rightDir)!==selected.dir)await sendNow('input',[id,selected.dir,(side===0?s.nonceA:s.nonceB)+1n,s.head+150n]);
    if(intention===selected)intention=undefined;
   });}catch(error){throw error;}
  }})().finally(()=>{moving=undefined;});return moving;
 }
 async function permission(owner:Pick<LocalAccount,'address'|'signTypedData'>,kind:'renew'|'revoke'){
  if(stopped)throw Error('Arena controls have stopped');
  if(owner.address.toLowerCase()!==player.toLowerCase())throw Error('Use this participant’s passkey');
  intention=undefined;sender=undefined;
  return serial(async()=>{
   if(await options.base.getChainId()!==10143)throw Error('Arena authorization requires Monad Testnet');
   const block=await options.base.getBlock(),hub=await readHubDelegation(options.base,m.hub,arena!.app,block.number);
   if(hub.status!==1||hub.epoch!==epoch||hub.expiresAt<=block.timestamp)throw Error('Wait for this arena to recover before changing its permission');
   await identify(true);const b=await node.readContract({address:arena!.app,abi,functionName:'boundMatch'});
   if(b.id!==id||b.epoch!==epoch||b.a.toLowerCase()!==match.a.toLowerCase()||b.b.toLowerCase()!==match.b.toLowerCase())throw Error('Arena binding changed');
   const code=await options.base.getCode({address:arena!.app,blockNumber:block.number});
   if(!code||keccak256(code)!==arena!.runtimeHash||(await options.base.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Arena publication changed during authorization');
   const savedPermission=permissionPending();
   if(savedPermission){await reconcilePermission();if(savedPermission.action!==`${kind}Active`)throw Error('The previous permission was resolved. Retry the selected action.');return;}
   if(journal.pending(session.grant.key))throw Error('Resolve the existing game command before changing its permission');
   const data=await preparePoolActive(node,arena!.app,{epoch,id},owner,kind==='revoke'?{kind}:{kind,key:session.grant.key,expires:session.grant.expires},reusable);
   journal.bindPermission(session.grant.key,epoch,id,data);
   const nonce=await node.getTransactionCount({address:session.grant.key,blockTag:'latest'});
   if(nonce!==await node.getTransactionCount({address:session.grant.key,blockTag:'pending'}))throw Error('An arena command is still in flight');
   if(stopped)throw Error('Arena controls have stopped');
   const raw=await privateKeyToAccount(session.key).signTransaction({type:'eip1559',chainId:4242,to:arena!.app,nonce,data,value:0n,gas:POOL_PLAYER_GAS,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
   const receipt:any=await node.request({method:'interlude_sendTransaction',params:[raw]} as any);
   if(receipt?.transactionHash?.toLowerCase()!==keccak256(raw).toLowerCase()||!['0x1','success','0x0','reverted'].includes(String(receipt.status)))throw Error('The owner permission is awaiting its exact receipt');
   journal.received('interlude_sendTransaction',receipt);
   if(!['0x1','success'].includes(String(receipt.status)))throw Error('The owner permission reverted. Read its current revision before retrying.');
   feed.invalidate();
  });
 }
 return{
  player,journal,
  async launch(){await identify();return reusable?readArenaLaunch(node,arena.app,id):undefined;},
  async read(force=false){await identify(force);return verify(await feed.read(id,force));},
  watch(listener:(s:EngineState)=>void){const stop=feed.watch(id,s=>{try{if(!stopped&&verifiedAt&&now()-verifiedAt<10000)listener(verify(s));}catch{feed.invalidate();}});listeners.add(stop);return()=>{stop();listeners.delete(stop);};},
  async recover(){const s=await serial(recoverNow);if(intention)await pump();return s;},
  async synchronize(){return serial(async()=>{
   // Periodic observation must not rebuild the signer or discard its confirmed
   // nonce. A missing sender/pending command still takes the full recovery path.
   await authorizeControls();
   try{
    const side=match.a.toLowerCase()===player.toLowerCase()?0:1;
    const control=await readPoolPermission(node,arena.app,id,side,{key:session.grant.key,expires:session.grant.expires},reusable);
    if(control.revoked)throw Error('This arena authorization was revoked by its owner');
    if(control.key.toLowerCase()!==session.grant.key.toLowerCase()||control.expires!==session.grant.expires)
     throw Error('The current arena needs its own confirmed owner authorization');
    return verify(await feed.read(id));
   }catch(error){sender=undefined;throw error;}
  });},
  move(dir:-1|0|1){if(![-1,0,1].includes(dir)||stopped)return Promise.reject(Error('Invalid or stopped arena control'));intention={dir};return pump();},
  ready(){return serial(async()=>{
   if(!reusable)return verify(await feed.read(id));
   await authorizeControls();const state=verify(await feed.read(id,true));
   if(state.phase!==1)return state;
   const [mask]=await node.readContract({address:arena.app,abi,functionName:'readiness',args:[id]});
   const side=state.a.toLowerCase()===player.toLowerCase()?0:1;
   return mask&(1<<side)?state:sendNow('confirmReady',[id]);
  });},
  concede(){intention=undefined;return serial(()=>sendNow('concede',[id]));},
  renew:(owner:Pick<LocalAccount,'address'|'signTypedData'>)=>permission(owner,'renew'),
  revoke:(owner:Pick<LocalAccount,'address'|'signTypedData'>)=>permission(owner,'revoke'),
  close(){stopped=true;intention=undefined;for(const stop of listeners)stop();listeners.clear();stream.stop();},
 };
}
