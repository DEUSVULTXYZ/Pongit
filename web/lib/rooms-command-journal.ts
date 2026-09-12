import {decodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress,type Abi,type Address,type Hex} from 'viem';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import type {EngineTransportJournal} from '../../shared/engine-transport';

type Job={hash:Hex;raw:Hex;app:Address;player:Address;signer:Address;epoch:string;nonce:number;action:string;match:string;at:number;state:'uncertain'|'confirmed'|'reverted'|'obsolete'};
type Store=Pick<Storage,'getItem'|'setItem'>;

/** Only raw, zero-value, scoped gameplay calls are journaled in this tab.
 * Wallet/private-data keys and financial transactions never enter this path. */
export class RoomsCommandJournal implements EngineTransportJournal {
 private epoch?:string;
 private direct?:{key:Address;epoch:string;match:string;expires:bigint};
 private key:string;
 constructor(private store:Store,private app:Address,private abi:Abi){this.key=`pongit:commands:${app.toLowerCase()}`;}
 private load():Job[]{return JSON.parse(this.store.getItem(this.key)||'[]');}
 private save(rows:Job[]){this.store.setItem(this.key,JSON.stringify(rows));}
 pending(player:Address){return this.load().find(x=>x.player.toLowerCase()===player.toLowerCase()&&x.state==='uncertain');}
 /** Only call after verifying this independent arena's hub epoch and binding. */
 bindDirect(key:Address,epoch:bigint,match:bigint,expires:bigint){
  if(this.epoch!==String(epoch)||match<=0n)throw Error('Read the current arena before binding direct controls');
  this.direct={key,epoch:String(epoch),match:String(match),expires};
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
  let player:Address,inner;
  if(wrapped?.functionName==='withSession'){
   const [grant,,data]=wrapped.args;inner=decodeFunctionData({abi:this.abi,data});
   if(grant.anyFunction||!['input','tick','concede','acceptMatch','cancelMatch'].includes(inner.functionName))throw Error('Non-game permission refused');
   if(signer.toLowerCase()!==grant.sessionKey.toLowerCase())throw Error('Game key mismatch');
   player=grant.granter;
  }else{
   const d=this.direct;inner=decodeFunctionData({abi:this.abi,data:tx.data!});
   if(!d||d.epoch!==this.epoch||signer.toLowerCase()!==d.key.toLowerCase()||!['input','tick','concede'].includes(inner.functionName)||String(inner.args?.[0])!==d.match)throw Error('Scoped game grant required');
   // An identical already-journaled call can still be reconciled after expiry.
   if(BigInt(Math.floor(Date.now()/1000))>=d.expires&&!this.load().some(j=>j.hash===keccak256(raw as Hex)&&j.state==='uncertain'))throw Error('Arcade session expired');
   player=d.key;
  }
  const hash=keccak256(raw as Hex),rows=this.load(),pending=rows.find(x=>x.player.toLowerCase()===player.toLowerCase()&&x.state==='uncertain');
  if(pending){if(pending.hash!==hash||pending.epoch!==this.epoch)throw Error('An uncertain game command must be reconciled before another signature is sent');return;}
  if(rows.some(x=>x.hash===hash))throw Error('This signed game command is already resolved');
  const match=inner.functionName==='acceptMatch'?String((inner.args?.[0] as any)?.id):String(inner.args?.[0]);
  const keep=rows.filter(x=>x.state==='uncertain').concat(rows.filter(x=>x.state!=='uncertain').slice(-15));
  keep.push({hash,raw:raw as Hex,app:this.app,player,signer,epoch:this.epoch,nonce:tx.nonce!,action:inner.functionName,match,at:Date.now(),state:'uncertain'});
  this.save(keep);
 }
 /** A newer active hub epoch proves the prior delegation was released. */
 retirePrevious(player:Address,verifiedEpoch:bigint){
  const rows=this.load();
  for(const job of rows)if(job.player.toLowerCase()===player.toLowerCase()&&job.state==='uncertain'&&BigInt(job.epoch)<verifiedEpoch)job.state='obsolete';
  this.save(rows);
 }
}
