import {decodeErrorResult,encodeFunctionData,keccak256,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

export type ArenaArguments=readonly unknown[]|(()=>readonly unknown[]);
export type ArenaSender={send:(name:string,args?:readonly unknown[])=>Promise<{receipt:any;hash:Hex;result:unknown;latencyMs:number}>};
export type CompactArenaSender={send:(name:string,args?:ArenaArguments)=>ReturnType<ArenaSender['send']>};
/** IndependentArena already binds the limited family key on Monad before delegation.
 * Its actor check enforces that binding, expiry and engine-local revocation. Signing
 * the direct call avoids repeating a second SDK grant inside every transaction.
 * This is NOT a generic replacement for withSession on arbitrary applications. */
export function compactArenaSession(options:{node:PublicClient;abi:Abi;app:Address;key:Hex;match:bigint;expires:bigint;epoch?:bigint;now?:()=>number;gas?:bigint}):CompactArenaSender{
 const {node,abi,app,match,expires}=options,signer=privateKeyToAccount(options.key),now=options.now??Date.now;
 let nonce:number|undefined,busy=false,uncertain=false;
 return {async send(name,args=[]){
  const ready=name==='confirmReady'&&abi.some(item=>item.type==='function'&&item.name==='confirmReady');
  if(busy||uncertain)throw Error('Reconcile the previous game command before sending another');
  const readArgs=()=>{
   const current=typeof args==='function'?args():args;
   const reference=options.epoch===undefined?current[0]===match:options.epoch>0n&&current[0]===options.epoch&&current[1]===match;
   if((!['input','tick','concede'].includes(name)&&!ready)||!reference)throw Error('Compact session only permits this match’s game controls');
   if(BigInt(Math.floor(now()/1000))>=expires)throw Error('Arcade session expired');
   return current;
  };
  readArgs();
  busy=true;const started=now();
  try{
   nonce??=await node.getTransactionCount({address:signer.address});
   let raw:Hex;
   for(;;){
    const data=encodeFunctionData({abi,functionName:name,args:readArgs()});
    raw=await signer.signTransaction({type:'eip1559',chainId:4242,to:app,nonce,data,value:0n,gas:options.gas??15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n});
    // A newer unsent intention may arrive while the nonce or signer awaits.
    // Discard only local, unjournaled bytes. Once handed to the transport below,
    // the exact transaction remains immutable until its receipt is reconciled.
    if(encodeFunctionData({abi,functionName:name,args:readArgs()})===data)break;
   }
   const hash=keccak256(raw);
   // The transport journals before the network call. Any missing/mismatched
   // receipt requires external reconciliation; never sign a nonce replacement.
   uncertain=true;
   const receipt:any=await node.request({method:'interlude_sendTransaction',params:[raw]} as any);
   if(receipt?.transactionHash?.toLowerCase()!==hash.toLowerCase()||!['0x1','0x0','success','reverted'].includes(String(receipt.status)))throw Error('Game command receipt is not confirmed');
   nonce++;uncertain=false;
   if(!['0x1','success'].includes(String(receipt.status))){
    let errorName='GameReverted';try{errorName=decodeErrorResult({abi,data:receipt.output}).errorName;}catch{}
    throw Object.assign(new Error(`${errorName}: reading the current game state`),{name:'AppRevertError',errorName});
   }
   // Readiness is a loading handshake, followed by another actor's start and
   // potentially a long idle interval. Read the live EVM count once at entry
   // into gameplay rather than carrying its cached count across that boundary.
   // Only a verified receipt reaches this branch; uncertainty remains blocked.
   if(ready)nonce=undefined;
   return {receipt,hash,result:undefined,latencyMs:now()-started};
  }finally{busy=false;}
 }};
}
