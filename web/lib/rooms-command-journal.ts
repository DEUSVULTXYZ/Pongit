import {decodeAbiParameters,decodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress,type Abi,type Address,type Hex} from 'viem';
import {controlProofParameters} from '../../shared/compact-rooms-session';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import type {EngineTransportJournal} from '../../shared/engine-transport';
import {EngineGasCapped,EngineHalted,gasCapRefusal,haltRefusal,refusalReason,retirableRefusal} from '../../shared/engine-halt';
import {engineCommandGas} from '../../shared/engine-gas';

type Job={hash:Hex;raw:Hex;app:Address;player:Address;signer:Address;epoch:string;nonce:number;action:string;match:string;at:number;state:'uncertain'|'confirmed'|'reverted'|'obsolete'|'refused';reason?:string;gasCapCleared?:boolean};
type Store=Pick<Storage,'getItem'|'setItem'>;

/** Only raw, zero-value, scoped gameplay calls are journaled in this tab.
 * Wallet/private-data keys and financial transactions never enter this path. */
export class RoomsCommandJournal implements EngineTransportJournal {
 private epoch?:string;
 private direct?:{key:Address;epoch:string;match:string;expires:bigint};
 private roomControls?:{key:Address;player:Address;epoch:string;expires:bigint};
 private permission?:{key:Address;epoch:string;match:string;data:Hex};
 private key:string;
 constructor(private store:Store,private app:Address,private abi:Abi){this.key=`pongit:commands:${app.toLowerCase()}`;}
 private load():Job[]{return JSON.parse(this.store.getItem(this.key)||'[]');}
 private save(rows:Job[]){this.store.setItem(this.key,JSON.stringify(rows));}
 pending(player:Address){return this.load().find(x=>x.player.toLowerCase()===player.toLowerCase()&&x.state==='uncertain');}
 /** Keep a local refusal across config polls and F5. A healthy relayer has not
  * necessarily sent anything and cannot clear this tab's observed node limit. */
 gasCapBlocked(gas=engineCommandGas()){
  return this.load().some(j=>j.state==='refused'&&!j.gasCapCleared&&gasCapRefusal(new Error(j.reason))&&(parseTransaction(j.raw).gas??0n)<=gas);
 }
 assertGasAllowed(gas=engineCommandGas()){
  if(this.gasCapBlocked(gas))throw new EngineGasCapped();
  // A lower configured/signed limit is a deliberate operator recovery. Preserve
  // the refusal as evidence while removing its gate on subsequent commands.
  const rows=this.load();let changed=false;
  for(const j of rows)if(j.state==='refused'&&!j.gasCapCleared&&gasCapRefusal(new Error(j.reason))&&gas<(parseTransaction(j.raw).gas??0n)){j.gasCapCleared=true;changed=true;}
  if(changed)this.save(rows);
 }
 /** Only call after verifying this independent arena's hub epoch and binding. */
 bindDirect(key:Address,epoch:bigint,match:bigint,expires:bigint){
  if(this.epoch!==String(epoch)||match<=0n)throw Error('Read the current arena before binding direct controls');
  this.direct={key,epoch:String(epoch),match:String(match),expires};
 }
 /** Exact owner-signed arena permission, prepared after binding verification.
  * Does not widen the movement key's scope or permit any financial selector. */
 bindPermission(key:Address,epoch:bigint,match:bigint,data:Hex){
  if(this.epoch!==String(epoch)||match<=0n||!['renewActive','revokeActive'].includes(decodeFunctionData({abi:this.abi,data}).functionName))throw Error('Read the current arena before authorizing this permission');
  this.permission={key,epoch:String(epoch),match:String(match),data};
 }
 /** The SDK grant was checked for this app/account; the contract verifies it
  * again on registration. This is separate from independent-arena bindings. */
 bindRoomControls(player:Address,key:Address,epoch:bigint,expires:bigint){
  if(this.epoch!==String(epoch))throw Error('Read the current arena before binding direct controls');
  this.roomControls={key,player,epoch:String(epoch),expires};
 }
 received(method:string,result:any){
  if(method==='interlude_session'){
   if(result?.app?.toLowerCase()!==this.app.toLowerCase()||result.chainId!==4242)throw Error('Unexpected game deployment');
   this.epoch=String(result.epoch);
  }
  if(method==='interlude_sendTransaction'||method==='eth_getTransactionReceipt'){
   if(!result?.transactionHash||!['0x1','0x0','success','reverted'].includes(String(result.status)))return;
   const rows=this.load(),job=rows.find(x=>x.hash.toLowerCase()===result.transactionHash.toLowerCase());
   if(job){job.state=['0x1','success'].includes(String(result.status))?'confirmed':'reverted';this.save(rows);}
  }
 }
 async beforeSend(raw:unknown){
  if(typeof raw!=='string'||!raw.startsWith('0x02')||this.epoch===undefined)throw Error('Read the game epoch before sending');
  const tx=parseTransaction(raw as Hex);
  if(tx.chainId!==4242||tx.to?.toLowerCase()!==this.app.toLowerCase()||(tx.value??0n)!==0n)throw Error('Only scoped game commands can use this journal');
  const signer=await recoverTransactionAddress({serializedTransaction:raw as `0x02${string}`});
  let wrapped;try{wrapped=decodeFunctionData({abi:delegatableAbi,data:tx.data!});}catch{}
  let player:Address,inner,permissionMatch:string|undefined;
  if(wrapped?.functionName==='withSession'){
   const [grant,,data]=wrapped.args;inner=decodeFunctionData({abi:this.abi,data});
   if(grant.anyFunction||!['input','tick','concede','acceptMatch','cancelMatch'].includes(inner.functionName))throw Error('Non-game permission refused');
   if(signer.toLowerCase()!==grant.sessionKey.toLowerCase())throw Error('Game key mismatch');
   player=grant.granter;
  }else{
   inner=decodeFunctionData({abi:this.abi,data:tx.data!});
   const p=this.permission,r=this.roomControls;
   if(p&&['renewActive','revokeActive'].includes(inner.functionName)){
    if(p.epoch!==this.epoch||signer.toLowerCase()!==p.key.toLowerCase()||tx.data!==p.data)throw Error('Exact owner-signed permission required');
    player=p.key;permissionMatch=p.match;
   }else if(r){
    if(r.epoch!==this.epoch||signer.toLowerCase()!==r.key.toLowerCase()||!['registerControls','revokeControls','input','tick','concede','acceptMatch','cancelMatch'].includes(inner.functionName))throw Error('Scoped game grant required');
    if(inner.functionName==='registerControls'){
     const [g]=decodeAbiParameters(controlProofParameters,inner.args?.[0] as Hex);
     if(g.granter.toLowerCase()!==r.player.toLowerCase()||g.sessionKey.toLowerCase()!==r.key.toLowerCase()||g.expiry!==r.expires||g.anyFunction||g.selectors.length!==5)throw Error('Game key mismatch');
    }
    if(inner.functionName==='revokeControls'&&String(inner.args?.[0]).toLowerCase()!==r.key.toLowerCase())throw Error('Only this arcade key can be revoked');
    if(inner.functionName!=='revokeControls'&&BigInt(Math.floor(Date.now()/1000))>=r.expires&&!this.load().some(j=>j.hash===keccak256(raw as Hex)&&j.state==='uncertain'))throw Error('Arcade session expired');
    player=r.player;
   }else{
   const d=this.direct;
   if(!d||d.epoch!==this.epoch||signer.toLowerCase()!==d.key.toLowerCase()||!['input','tick','concede'].includes(inner.functionName)||String(inner.args?.[0])!==d.match)throw Error('Scoped game grant required');
   // An identical already-journaled call can still be reconciled after expiry.
   if(BigInt(Math.floor(Date.now()/1000))>=d.expires&&!this.load().some(j=>j.hash===keccak256(raw as Hex)&&j.state==='uncertain'))throw Error('Arcade session expired');
   player=d.key;
   }
  }
  const hash=keccak256(raw as Hex);let rows=this.load();const pending=rows.find(x=>x.player.toLowerCase()===player.toLowerCase()&&x.state==='uncertain');
  if(pending){if(pending.hash!==hash||pending.epoch!==this.epoch)throw Error('An uncertain game command must be reconciled before another signature is sent');return;}
  this.assertGasAllowed(tx.gas??0n);
  rows=this.load();
  // Only within one epoch. Had a command of an earlier epoch been committed, the engine would have
  // moved past its nonce and these exact bytes could not be signed again; identical bytes in a newer
  // epoch mean it ran after that epoch's last commit and was lost with it, so it must be sent again.
  // Refusing it left a client signing the same lost command forever (laboratory 20260918-4). Nor
  // bytes the node refused before execution (retireRefused): they never ran, and viem signs
  // deterministically, so the same control at the freed nonce is these very bytes.
  if(rows.some(x=>x.hash===hash&&x.epoch===this.epoch&&x.state!=='refused'))throw Error('This signed game command is already resolved');
  const match=permissionMatch??(inner.functionName==='acceptMatch'?String((inner.args?.[0] as any)?.id):['registerControls','revokeControls'].includes(inner.functionName)?'0':String(inner.args?.[0]));
  // The earlier copy goes, or its receipt lookup by hash would keep finding it instead of this one.
  const current=rows.filter(x=>x.hash!==hash);
  const keep=current.filter(x=>x.state==='uncertain').concat(current.filter(x=>x.state!=='uncertain').slice(-15));
  keep.push({hash,raw:raw as Hex,app:this.app,player,signer,epoch:this.epoch,nonce:tx.nonce!,action:inner.functionName,match,at:Date.now(),state:'uncertain'});
  this.save(keep);
 }
 /** A newer active hub epoch proves the prior delegation was released. */
 retirePrevious(player:Address,verifiedEpoch:bigint){
  const rows=this.load();
  for(const job of rows)if(job.player.toLowerCase()===player.toLowerCase()&&job.state==='uncertain'&&BigInt(job.epoch)<verifiedEpoch)job.state='obsolete';
  // A session response alone is not enough: only the caller's verified active
  // hub epoch allows retrying the old limit against a renewed node.
  for(const job of rows)if(job.state==='refused'&&BigInt(job.epoch)<verifiedEpoch)job.gasCapCleared=true;
  this.save(rows);
 }
 /** Caller verified status=None for this epoch in a stable Monad hub block.
  * Expiry, Exiting and a missing node response are not closure evidence. */
 retireClosed(player:Address,verifiedEpoch:bigint){
  const rows=this.load();
  for(const job of rows)if(job.player.toLowerCase()===player.toLowerCase()&&job.state==='uncertain'&&BigInt(job.epoch)<=verifiedEpoch){
   job.state='obsolete';job.reason='Verified hub epoch closure';
  }
  this.save(rows);
 }
 /** The node refused these exact bytes before execution AND reports their
  * signer's latest transaction count equal to their nonce: they never ran and
  * never will. Only then is the uncertain entry retired, so the next command may
  * be signed at that nonce. The bytes stay recorded as refused until a command
  * replaces them; identical bytes signed again for the freed nonce are accepted
  * (they never ran). Returns whether the entry was retired. */
 retireRefused(hash:Hex,latestNonce:number,reason:string){
  const rows=this.load(),job=rows.find(x=>x.hash.toLowerCase()===hash.toLowerCase());
  if(!job||job.state!=='uncertain'||job.nonce!==latestNonce)return false;
  job.state='refused';job.reason=reason.slice(0,240);this.save(rows);return true;
 }
}

/** Recovery resend of one uncertain entry, the agent arcade's rule on the
 * browser side. Only the journaled bytes are ever sent. When the node refuses
 * them for their gas limit ("gas limit is greater than the cap") or because it
 * is halted, and its latest count for their signer equals their nonce, the entry
 * is retired: its nonce is free and the next command signs it anew, never at a
 * nonce that is still uncertain. A halted node then surfaces as EngineHalted, so
 * the tab stops and shows the halt instead of signing again. A gas-cap refusal
 * returns 'refused' when the limit the relayer now serves is below the refused
 * bytes' (the operator already lowered it), so the tab signs its next control at
 * that limit at once; otherwise it surfaces as EngineGasCapped, and the tab waits
 * for a lower limit instead of signing the same one again. The generic "rejected
 * before execution" alone, a lost response, a timeout, a local cooldown or
 * publication gate, a count that moved or that could not be read: the entry
 * stays uncertain and the error propagates, exactly as before. */
export async function resendJournaled(journal:Pick<RoomsCommandJournal,'retireRefused'>,pending:{hash:Hex;raw:Hex;nonce:number},o:{
 send:(raw:Hex)=>Promise<unknown>;latestNonce:()=>Promise<number>;
 /** The limit the next command would be signed with (engine-gas.ts). */
 commandGas?:()=>bigint;
}):Promise<{kind:'sent';receipt:unknown}|{kind:'refused'}>{
 try{return {kind:'sent',receipt:await o.send(pending.raw)};}
 catch(error){
  if(!retirableRefusal(error))throw error;
  let latest:number;try{latest=Number(await o.latestNonce());}catch{throw error;}
  if(!journal.retireRefused(pending.hash,latest,refusalReason(error)))throw error;
  if(haltRefusal(error))throw new EngineHalted();
  if(gasCapRefusal(error)&&(parseTransaction(pending.raw).gas??0n)<=(o.commandGas??engineCommandGas)())throw new EngineGasCapped();
  return {kind:'refused'};
 }
}
