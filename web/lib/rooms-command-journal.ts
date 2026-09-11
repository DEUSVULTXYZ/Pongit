import {decodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress,type Abi,type Address,type Hex} from 'viem';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import type {EngineTransportJournal} from '../../shared/engine-transport';

type Job={hash:Hex;raw:Hex;app:Address;player:Address;signer:Address;epoch:string;nonce:number;action:string;match:string;at:number;state:'uncertain'|'confirmed'|'reverted'|'obsolete'};
type Store=Pick<Storage,'getItem'|'setItem'>;

/** Only raw, zero-value, scoped gameplay calls are journaled in this tab.
 * Wallet/private-data keys and financial transactions never enter this path. */
export class RoomsCommandJournal implements EngineTransportJournal {
 private epoch?:string;
 private key:string;
 constructor(private store:Store,private app:Address,private abi:Abi){this.key=`pongit:commands:${app.toLowerCase()}`;}
 private load():Job[]{return JSON.parse(this.store.getItem(this.key)||'[]');}
 private save(rows:Job[]){this.store.setItem(this.key,JSON.stringify(rows));}
 pending(player:Address){return this.load().find(x=>x.player.toLowerCase()===player.toLowerCase()&&x.state==='uncertain');}
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
  const wrapped=decodeFunctionData({abi:delegatableAbi,data:tx.data!});
  if(wrapped.functionName!=='withSession')throw Error('Scoped game grant required');
  const [grant,,data]=wrapped.args;
  const inner=decodeFunctionData({abi:this.abi,data});
  if(grant.anyFunction||!['input','tick','concede','acceptMatch','cancelMatch'].includes(inner.functionName))throw Error('Non-game permission refused');
  const signer=await recoverTransactionAddress({serializedTransaction:raw as `0x02${string}`});
  if(signer.toLowerCase()!==grant.sessionKey.toLowerCase())throw Error('Game key mismatch');
  const hash=keccak256(raw as Hex),rows=this.load(),pending=rows.find(x=>x.player.toLowerCase()===grant.granter.toLowerCase()&&x.state==='uncertain');
  if(pending){if(pending.hash!==hash||pending.epoch!==this.epoch)throw Error('An uncertain game command must be reconciled before another signature is sent');return;}
  if(rows.some(x=>x.hash===hash))throw Error('This signed game command is already resolved');
  const match=inner.functionName==='acceptMatch'?String((inner.args?.[0] as any)?.id):String(inner.args?.[0]);
  const keep=rows.filter(x=>x.state==='uncertain').concat(rows.filter(x=>x.state!=='uncertain').slice(-15));
  keep.push({hash,raw:raw as Hex,app:this.app,player:grant.granter,signer,epoch:this.epoch,nonce:tx.nonce!,action:inner.functionName,match,at:Date.now(),state:'uncertain'});
  this.save(keep);
 }
 /** A newer active hub epoch proves the prior delegation was released. */
 retirePrevious(player:Address,verifiedEpoch:bigint){
  const rows=this.load();
  for(const job of rows)if(job.player.toLowerCase()===player.toLowerCase()&&job.state==='uncertain'&&BigInt(job.epoch)<verifiedEpoch)job.state='obsolete';
  this.save(rows);
 }
}
