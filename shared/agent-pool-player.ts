import {createPublicClient,decodeEventLog,keccak256,parseTransaction,zeroHash,type LocalAccount,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {EngineFeed} from './engine-feed';
import {EngineStream,type EngineState} from './engine-stream';
import {engineTransport,engineCooldownMs} from './engine-transport';
import {readHubDelegation} from './rooms-hub';
import {compactArenaSession,type CompactArenaSender,type ArenaArguments} from './compact-arena-session';
import {terminalAfterRevert} from './terminal-command';
import {RoomsCommandJournal,resendJournaled} from '../web/lib/rooms-command-journal';
import {agentPoolArenaAbi} from './agent-pool-abi';
import {readArenaLaunch} from './arena-launch';
import {validateAgentPoolManifest,type AgentPoolManifest,type PoolMatchView} from './agent-pool';
import type {PoolFamilySession} from './agent-pool-family';
import type {PoolSessionStorage} from './agent-pool-sponsor';
import {readPoolPermission} from './agent-pool-permission';
import {preparePoolActive} from './agent-pool-active';
import {hubHasNoLease,hubLeaseValid} from './hub-lease';

export const POOL_PLAYER_GAS=14_800_000n;
export type PoolPlayerTiming={stage:'queue'|'fence'|'snapshot'|'send'|'receipt'|'observation'|'nonce'|'signature'|'transport';startedAt:number;ms:number;command?:string};
class UnsentFenceExpired extends Error {
 constructor(){super('Arena authorization is awaiting a fresh observation');}
}
/** One node connection and tab journal per watched arena. The family permission
 * was bound on Monad before delegation; no root grant travels with movements.
 * Watching/recovering remains possible when admissions or authorization expire.
 * This client never chooses an agent, starts a game or transports financial calls. */
export function createPoolPlayer(manifest:AgentPoolManifest,match:PoolMatchView,session:PoolFamilySession,
 options:{base:PublicClient;storage:PoolSessionStorage;socket:(url:string)=>any;now?:()=>number;onInput?:(input:{id:number;direction:-1|0|1;at:number;acceptedAt?:bigint})=>void;onReconciled?:(state:EngineState)=>void;onTiming?:(sample:PoolPlayerTiming)=>void},runtime?:{node:PublicClient;feed:EngineFeed}){
 const m=validateAgentPoolManifest(manifest),arena=m.arenas.find(a=>a.app.toLowerCase()===match.ref.app.toLowerCase()),player=session.grant.player;
 const abi=agentPoolArenaAbi(m),reusable=m.version>=4;
 if(!arena||match.node!==arena.node||!match.currentBinding||match.result||match.ref.chainId!==10143
  ||!/^\d{1,78}$/.test(match.ref.id)||!/^\d{1,78}$/.test(match.ref.epoch)||BigInt(match.ref.id)<1n||BigInt(match.ref.epoch)<1n
  ||BigInt(match.ref.id)>=2n**256n||BigInt(match.ref.epoch)>=2n**256n||![match.a,match.b].some(a=>a.toLowerCase()===player.toLowerCase())
  ||privateKeyToAccount(session.key).address.toLowerCase()!==session.grant.key.toLowerCase())throw Error('This arcade key is not bound to the requested match');
 const id=BigInt(match.ref.id),epoch=BigInt(match.ref.epoch),journal=new RoomsCommandJournal(options.storage,arena.app,abi),now=options.now??Date.now;
 const node=runtime?.node??createPublicClient({transport:engineTransport(arena.node,journal,m.rulesVersion===16?true:undefined),pollingInterval:1000});
 const stream=new EngineStream(arena.node,arena.app,options.socket,()=>engineCooldownMs(arena.node));
 const feed=runtime?.feed??new EngineFeed({app:arena.app,abi,node},stream);
 let sender:CompactArenaSender|undefined,stopped=false,verifiedAt=0,controlsUntil=0,lane:Promise<unknown>=Promise.resolve();
 let fenceGeneration=0;
 let fencePending:Promise<void>|undefined,fenceTimer:ReturnType<typeof setTimeout>|undefined;
 let identityPending:Promise<void>|undefined;
 const prefetchFence=(retry=false)=>{
  clearTimeout(fenceTimer);if(stopped||!sender)return;
  fenceTimer=setTimeout(()=>{
   if(stopped||!sender)return;
   void refreshFence().then(()=>prefetchFence(),()=>prefetchFence(true));
  // Keep the cadence anchored to the observation start. A 250ms minimum sleep
  // after a 1.4s successful read pushes the next result beyond the 3s fence.
  // Slow reads are single-flight; failures retain the full retry delay.
  },retry?1500:Math.max(0,Math.min(1500,controlsUntil-now()-1500)));
  // Node-side qualification clients must still close explicitly, but a timer
  // alone must not keep a stopped fixture process alive.
  (fenceTimer as any).unref?.();
 };
 let moving:Promise<void>|undefined,intention:{dir:-1|0|1;id:number;at:number}|undefined,inputId=0;
 let receivedInputTime:bigint|undefined;
 let inputReceipt:{sequence:bigint;head:bigint}|undefined;
 let lastWriteAt=0;
 // A receipt acknowledges the latest queued intent, not necessarily the
 // direction of physics still catching up. Never deduplicate against that
 // older direction: doing so drops a release/reversal after a queued input.
 let acceptedDirection:-1|0|1|undefined;
 const listeners=new Set<()=>void>();
 // Opt-in qualification diagnostics contain only durations. A reporter must
 // never affect command ordering, permissions or uncertain nonce ownership.
 const timing=(stage:PoolPlayerTiming['stage'],startedAt:number)=>{try{options.onTiming?.({stage,startedAt,ms:performance.now()-startedAt});}catch{}};
 const timed=<T>(stage:PoolPlayerTiming['stage'],work:()=>Promise<T>):Promise<T>=>{
  if(!options.onTiming)return work();const startedAt=performance.now();return work().finally(()=>timing(stage,startedAt));
 };
 const serial=<T>(work:()=>Promise<T>)=>{const startedAt=options.onTiming?performance.now():0;
  const run=()=>{if(options.onTiming)timing('queue',startedAt);return work();};
  const p=lane.then(run,run);lane=p.catch(()=>{});return p;};
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
 async function identify(force=false,maxAge=10000){
  if(stopped)throw Error('Arena controls have stopped');if(!force&&verifiedAt&&now()-verifiedAt<maxAge)return;
  if(identityPending)return identityPending;
  identityPending=(async()=>{
   const [status,rules]:any[]=await Promise.all([node.request({method:'interlude_session',params:[]} as any),
    node.readContract({address:arena!.app,abi,functionName:'RULES_VERSION'})]);journal.received('interlude_session',status);
   if(String(status.app).toLowerCase()!==arena!.app.toLowerCase()||Number(status.chainId)!==4242)throw Error('Unexpected arena engine identity');
   if(BigInt(status.epoch)!==epoch)throw Error('This match has moved to its published result. Open its original result reference.');
   if(rules!==BigInt(m.rulesVersion))throw Error('Unexpected arena rules');
   if(stopped)throw Error('Arena controls have stopped');
   verifiedAt=now();
  })().finally(()=>{identityPending=undefined;});
  return identityPending;
 }
 async function recoverNow(){
  if(stopped)throw Error('Arena controls have stopped');
  sender=undefined;acceptedDirection=undefined;inputReceipt=undefined;controlsUntil=0;fenceGeneration++;clearTimeout(fenceTimer);
  const started=now();
  const [chainId,block]=await Promise.all([options.base.getChainId(),options.base.getBlock()]);
  if(chainId!==10143)throw Error('Arena authorization requires Monad Testnet');
  if(!block.hash)throw Error('Arena publication has no canonical block');
  // Both mutable lifecycle and immutable code come from the same canonical
  // hash. No trailing header reads, unpinned fallback or renewed validity.
  const pin={blockHash:block.hash,requireCanonical:true as const};
  const [hub,code]=await Promise.all([readHubDelegation(options.base,m.hub,arena!.app,pin),
   options.base.getCode({address:arena!.app,...pin})]);
  // A canonical new epoch is closure evidence even if the old node is down.
  if(hub.epoch>epoch){journal.retirePrevious(session.grant.key,hub.epoch);throw Error('The prior arena epoch is closed. Read its published result.');}
  if(hub.epoch!==epoch)throw Error('Waiting for the assigned arena epoch');
  if(hub.status===0){journal.retireClosed(session.grant.key,epoch);throw Error('The arena epoch is closed. Read its published result.');}
  if(!code||keccak256(code)!==arena!.runtimeHash)throw Error('Arena bytecode differs from the approved deployment');
  await identify(true);
  if(permissionPending()&&hub.status===1&&hubLeaseValid(m.hub,hub.expiresAt,block.timestamp))await reconcilePermission();
  const b=await node.readContract({address:arena!.app,abi,functionName:'boundMatch'});
  if(b.id!==id||b.epoch!==epoch||b.a.toLowerCase()!==match.a.toLowerCase()||b.b.toLowerCase()!==match.b.toLowerCase())throw Error('Arena binding changed');
  const side=b.a.toLowerCase()===player.toLowerCase()?0:1,initial=side===0?b.controlA:b.controlB;
  if(initial.codeHash!==zeroHash)throw Error('Only the bound human participant can use these controls');
  const control=await readPoolPermission(node,arena!.app,id,side,initial,reusable);
  if(control.key.toLowerCase()!==session.grant.key.toLowerCase()||control.expires!==session.grant.expires)
   throw Error('The current arena needs its own confirmed owner authorization');
  journal.bindDirect(session.grant.key,epoch,id,control.expires,reusable);journal.retirePrevious(session.grant.key,epoch);
  const pending=journal.pending(session.grant.key);
  if(pending){
   if(BigInt(pending.epoch)!==epoch)throw Error('A command from another epoch is awaiting closure');
   const receipt=await node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
   if(receipt)journal.received('eth_getTransactionReceipt',receipt);
   else if(hub.status===1&&hubLeaseValid(m.hub,hub.expiresAt,block.timestamp)&&control.expires>block.timestamp&&!control.revoked){
    const outcome=await resendJournaled(journal,pending,{send:raw=>node.request({method:'interlude_sendTransaction',params:[raw]} as any),
     latestNonce:()=>node.getTransactionCount({address:session.grant.key,blockTag:'latest'}),commandGas:()=>POOL_PLAYER_GAS});
    if(outcome.kind==='sent')journal.received('interlude_sendTransaction',outcome.receipt);
   }
   if(journal.pending(session.grant.key))throw Error('The existing command is still being reconciled; your arcade key is saved');
  }
  if(hub.status!==1||!hubLeaseValid(m.hub,hub.expiresAt,block.timestamp))throw Error('This arena is recovering; your arcade key is saved');
  if(control.revoked)throw Error('This arena authorization was revoked by its owner');
  if(control.expires<=block.timestamp)throw Error('Renew the active arena authorization');
  if(stopped)throw Error('Arena controls have stopped');
  // Fence against the hub again shortly. UI health changes must not reset the
  // renderer, session key, last intent or authoritative positions.
  controlsUntil=started+(hubHasNoLease(m.hub,hub.expiresAt)?3000:Math.min(3000,Number(hub.expiresAt-block.timestamp)*1000));
  sender=compactArenaSession({node,abi,app:arena!.app,key:session.key,match:id,...(reusable?{epoch}:{}),expires:control.expires,gas:POOL_PLAYER_GAS,now,onTiming:options.onTiming});
  prefetchFence();
  feed.invalidate();const recovered=verify(await feed.read(id,true));
  options.onReconciled?.(recovered);
  if(intention)options.onInput?.({id:intention.id,direction:intention.dir,at:now()});
  return recovered;
 }
 async function authorizeControls(){
  if(!sender||journal.pending(session.grant.key))await recoverNow();
  if(stopped)throw Error('Arena controls have stopped');
  if(now()<controlsUntil){if(controlsUntil-now()<1500)void refreshFence().catch(()=>{});return;}
  try{
   // The immutable binding and runtime were checked during recovery. Repeating
   // that entire handshake every three seconds stalls input and discards the
   // sender's known nonce. Only the mutable hub fence needs this cadence; the
   // contract still checks active permission/expiry on every signed command.
   const prefetched=!!fencePending;
   await refreshFence();
   // A slow background observation may already be stale when it resolves.
   // Take one new observation instead of treating that local race as a lost
   // command. Never extend the old fence or retry a failed network response.
   if(prefetched&&now()>=controlsUntil)await refreshFence();
   if(now()>=controlsUntil)throw Error('Arena authorization is awaiting a fresh observation');
  }catch(error){throw error;}
 }
 function refreshFence():Promise<void>{
  if(fencePending)return fencePending;
  const started=now(),generation=fenceGeneration;
  const loading=(async()=>{
   // Node identity and the canonical Monad observation are independent reads.
   // Serializing them can exhaust heartbeat credit during periodic refreshes.
   // Both must still pass; neither changes the original three-second fence.
   // Refresh identity before watch()'s ten-second deadline. Starting only after
   // expiry suppressed contiguous frames while the identity RPC completed.
   const [{hub,lifetime}]=await Promise.all([(async()=>{
    if(m.rulesVersion===16&&hubHasNoLease(m.hub,0n)){
     // On the pinned no-lease hub the fence consumes only this one delegation.
     // eth_call at latest reads its fields atomically from canonical state;
     // there is no timestamp/code/second state to join to it. Initial recovery,
     // permissions and uncertain-command retirement still use canonical hashes.
     // This is a version-selected read, never a fallback after a failed pin.
     const hub=await readHubDelegation(options.base,m.hub,arena!.app);
     return {hub,lifetime:hubHasNoLease(m.hub,hub.expiresAt)?3000:0};
    }
    const block=await options.base.getBlock();
    if(!block.hash)throw Error('Arena publication has no canonical block');
    const hub=await readHubDelegation(options.base,m.hub,arena!.app,{blockHash:block.hash,requireCanonical:true});
    return {hub,lifetime:hubHasNoLease(m.hub,hub.expiresAt)?3000:Math.min(3000,Number(hub.expiresAt-block.timestamp)*1000)};
   })(),identify(false,8000)]);
   if(generation!==fenceGeneration||stopped)return;
   // Read-only prefetch must not retire a pending command behind its owner.
   // The serialized recovery path records canonical closure evidence.
   if(hub.epoch!==epoch||hub.status!==1||lifetime<=0){controlsUntil=0;throw Error('This arena is recovering; your arcade key is saved');}
   // Charge read latency to validity: a slow successful RPC is not a new lease.
   controlsUntil=started+lifetime;
  })();
  fencePending=loading.finally(()=>{fencePending=undefined;});return fencePending;
 }
 async function sendNow(name:'input',args:ArenaArguments):Promise<void>;
 async function sendNow(name:'concede'|'confirmReady'|'heartbeat'|'resumeReady',args:ArenaArguments):Promise<EngineState>;
 async function sendNow(name:'input'|'concede'|'confirmReady'|'heartbeat'|'resumeReady',args:ArenaArguments):Promise<EngineState|void>{
  if(stopped)throw Error('Arena controls have stopped');
  await timed('fence',authorizeControls);
  if(stopped)throw Error('Arena controls have stopped');
  let boundArgs:readonly unknown[]=[];
  const latestArgs=()=>{
   if(stopped)throw Error('Arena controls have stopped');
   if(now()>=controlsUntil)throw new UnsentFenceExpired();
   const current=typeof args==='function'?args():args;
   return boundArgs=reusable?[epoch,...current]:current;
  };
  try{
   let result,writeStarted=now();
   try{result=await timed('send',()=>sender!.send(name,latestArgs));}
   catch(error){
    // The nonce read/signature can outlive a valid fence. This typed exception
    // originates only before transport/journaling, so no transaction was sent.
    // Refresh once and retain this sender's nonce and the newest unsent intent.
    // Missing receipts or any remote error still take normal reconciliation.
    if(!(error instanceof UnsentFenceExpired)||journal.pending(session.grant.key))throw error;
    await authorizeControls();
    writeStarted=now();
    result=await timed('send',()=>sender!.send(name,latestArgs));
   }
   if(name==='input'){
    receivedInputTime=undefined;
    for(const log of result.receipt.logs??[])try{
     if(log.address.toLowerCase()!==arena!.app.toLowerCase())continue;
     const event=decodeEventLog({abi,data:log.data,topics:log.topics}) as any;
     if(event.eventName==='ControlQueued'&&event.args.id===id&&event.args.sequence===boundArgs[reusable?3:2])receivedInputTime=event.args.gameTime;
    }catch{}
   }
   // Contractual liveness starts during execution, before the response arrives.
   // Dating it from the acknowledgement could suppress the next heartbeat for
   // another network round trip and create an otherwise avoidable fair pause.
   lastWriteAt=writeStarted;
   const hydration=timed('receipt',()=>feed.receipt(id,result,name,boundArgs,player));
   if(name==='input'&&m.rulesVersion===16&&receivedInputTime!==undefined){
    // The successful matching ControlQueued receipt proves this sequence now.
    // A missed Chaos event may require a full view for draw metadata, but that
    // read must not hold a key release behind another network round trip.
    const acknowledged={sequence:BigInt(boundArgs[reusable?3:2] as bigint),head:BigInt(result.receipt.blockNumber)};
    inputReceipt=acknowledged;
    void hydration.then(verify).catch(()=>{if(inputReceipt===acknowledged)inputReceipt=undefined;feed.invalidate();});
    return;
   }
   const hydrated=verify(await hydration);return name==='input'?undefined:hydrated;
  }
  catch(error){
   const terminal=await terminalAfterRevert(error,id,()=>journal.pending(session.grant.key),async()=>verify(await feed.read(id,true)));
   if(terminal){intention=undefined;return name==='input'?undefined:terminal;}
   sender=undefined;inputReceipt=undefined;throw error;
  }
 }
 function pump(){
  if(moving)return moving;
  moving=(async()=>{while(intention&&!stopped){
   const latest=intention;
   try{await serial(async()=>{
    await timed('fence',authorizeControls);
   // Receipt context changes only the owned sequence and block bound. Physics
   // still comes from the live feed. Never extend its freshness on a receipt:
   // after 500ms without an observed picture, wait for genuine recovery.
   const cached=feed.peek(id);
   const s=verify(inputReceipt&&cached&&cached.phase===2&&now()-cached.observedAt<500?cached:await timed('snapshot',()=>feed.forCommand(id)));if(s.phase!==2){intention=undefined;return;}
    if(stopped)throw Error('Arena controls have stopped');
    // Coalesce again after awaited recovery; never dispatch an obsolete intent.
    let selected=intention??latest;const side=s.a.toLowerCase()===player.toLowerCase()?0:1;
    if(acceptedDirection!==selected.dir){
     await sendNow('input',()=>{
      selected=intention??selected;
      const observed=side===0?s.nonceA:s.nonceB,sequence=inputReceipt&&inputReceipt.sequence>observed?inputReceipt.sequence:observed;
      const head=inputReceipt&&inputReceipt.head>s.head?inputReceipt.head:s.head;
      return[id,selected.dir,sequence+1n,head+150n];
     });
     acceptedDirection=selected.dir;
     if(receivedInputTime!==undefined)options.onInput?.({id:selected.id,direction:selected.dir,at:selected.at,acceptedAt:receivedInputTime});
    }
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
   if(hub.status!==1||hub.epoch!==epoch||!hubLeaseValid(m.hub,hub.expiresAt,block.timestamp))throw Error('Wait for this arena to recover before changing its permission');
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
  async launch(){await identify();return reusable?readArenaLaunch(node,arena.app,id,m.countdownClock):undefined;},
  read(force=false){return timed('observation',async()=>{await identify(force);return verify(await feed.read(id,force));});},
  // An imminent launch needs a fresh state, not a duplicate identity round trip.
  // Keep the existing identity TTL and independent canonical command fence.
  observeLaunch(){return timed('observation',async()=>{
   if(sender&&!journal.pending(session.grant.key))void sender.prepare().catch(()=>{});
   await identify();return verify(await feed.read(id,true));
  });},
  watch(listener:(s:EngineState)=>void){const stop=feed.watch(id,s=>{try{if(!stopped&&verifiedAt&&now()-verifiedAt<10000)listener(verify(s));}catch{feed.invalidate();}});listeners.add(stop);return()=>{stop();listeners.delete(stop);};},
  controlsAvailable(){return !stopped&&!!sender&&now()<controlsUntil&&!journal.pending(session.grant.key);},
  async recover(){const s=await serial(recoverNow);if(s.phase===2)intention??={dir:0,id:++inputId,at:now()};if(intention)await pump();return s;},
  async synchronize(){
   // Periodic observation must not rebuild the signer or discard its confirmed
   // nonce. A missing sender/pending command still takes the full recovery path.
   if(!sender||journal.pending(session.grant.key)){
    // A normal in-flight command owns a pending journal too. Recheck after
    // its lane settles: rebuilding a successfully confirmed sender here used
    // to reset prediction and suspend heartbeats every periodic observation.
    const recovered=await serial(()=>!sender||journal.pending(session.grant.key)?recoverNow():Promise.resolve(undefined));
    if(recovered)return recovered;
   }
   await authorizeControls();
   const generation=fenceGeneration;
   try{
    const side=match.a.toLowerCase()===player.toLowerCase()?0:1;
    const control=await readPoolPermission(node,arena.app,id,side,{key:session.grant.key,expires:session.grant.expires},reusable);
    if(stopped||generation!==fenceGeneration)throw Error('Arena controls changed during observation');
    if(control.revoked){sender=undefined;controlsUntil=0;throw Error('This arena authorization was revoked by its owner');}
    if(control.key.toLowerCase()!==session.grant.key.toLowerCase()||control.expires!==session.grant.expires)
     {sender=undefined;controlsUntil=0;throw Error('The current arena needs its own confirmed owner authorization');}
    return verify(await feed.read(id));
   }catch(error){throw error;}
  },
  move(dir:-1|0|1){
   if(![-1,0,1].includes(dir)||stopped)return Promise.reject(Error('Invalid or stopped arena control'));
   if(intention?.dir===dir)return pump();
   if(!moving&&acceptedDirection===dir)return Promise.resolve();
   intention={dir,id:++inputId,at:now()};options.onInput?.({id:intention.id,direction:dir,at:intention.at});return pump();
  },
  ready(){return serial(async()=>{
   if(!reusable)return verify(await feed.read(id));
   await authorizeControls();const state=verify(await feed.read(id,true));
   if(state.phase!==1)return state;
   const [mask]=await node.readContract({address:arena.app,abi,functionName:'readiness',args:[id]});
   const side=state.a.toLowerCase()===player.toLowerCase()?0:1;
   const ready=mask&(1<<side)?state:await sendNow('confirmReady',[id]);
   if(sender&&!journal.pending(session.grant.key))void sender.prepare().catch(()=>{});
   return ready;
  });},
  heartbeat(resume=false){return serial(async()=>{
   if(m.friendlyPause!=='heartbeat-v1')throw Error('This arena does not support friendly pauses');
   await timed('fence',authorizeControls);
   const state=verify(await timed('snapshot',()=>feed.forCommand(id)));
   if(state.phase!==2||!state.sync?.pause.human)return state;
   // A working write channel alone must not let a blind player keep losing.
   // Require a recently received, identified state before renewing liveness.
   if(now()-state.observedAt>500)throw Error('Waiting for a fresh arena observation');
   if(resume&&state.sync.pause.status===2)return sendNow('resumeReady',[id]);
   // A queued movement renews the same liveness credit. Do not put a
   // redundant heartbeat ahead of it when a slow receipt released the lane.
   if(intention&&intention.dir!==acceptedDirection)return state;
   // The loop wakes every 200ms. Skipping a pulse 150ms after an input can
   // leave 350ms between writes and only 150ms for the next transport. Public
   // match 868 then paused on one 222ms receipt. Coalesce only same-frame
   // writes (50ms), keeping up to 250ms of the unchanged 500ms credit in reserve.
   if(now()-lastWriteAt<50)return state;
   return sendNow('heartbeat',[id]);
  });},
  concede(){intention=undefined;return serial(()=>sendNow('concede',[id]));},
  renew:(owner:Pick<LocalAccount,'address'|'signTypedData'>)=>permission(owner,'renew'),
  revoke:(owner:Pick<LocalAccount,'address'|'signTypedData'>)=>permission(owner,'revoke'),
  close(){stopped=true;fenceGeneration++;controlsUntil=0;clearTimeout(fenceTimer);intention=undefined;for(const stop of listeners)stop();listeners.clear();stream.stop();(node.transport as any)?.closeSend?.();},
 };
}
