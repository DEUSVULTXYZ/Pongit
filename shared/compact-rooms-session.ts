import {decodeErrorResult,encodeAbiParameters,encodeFunctionData,keccak256,type Abi,type Address,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {StoredSession} from '@interludelayer-sdk/sdk';
import type {ArenaSender} from './compact-arena-session';
import {engineCommandTransaction} from './engine-gas';

export const compactRoomActions=['acceptMatch','input','tick','cancelMatch','concede'] as const;
export const controlProofParameters=[{type:'tuple',components:[{name:'granter',type:'address'},{name:'sessionKey',type:'address'},{name:'expiry',type:'uint64'},{name:'epoch',type:'uint64'},{name:'anyFunction',type:'bool'},{name:'selectors',type:'bytes4[]'}]},{type:'bytes'}] as const;
/** Only PongRoomsCompact verifies and caches this SDK grant. Other applications
 * must continue to use withSession. One signer owns setup and game nonces alike. */
export function compactRoomsSession(options:{node:PublicClient;abi:Abi;app:Address;stored:StoredSession;epoch:bigint;now?:()=>number}):ArenaSender & {revoke:()=>Promise<void>} {
 const {node,abi,app,stored,epoch}=options,{grant,signature}=stored,signer=privateKeyToAccount(stored.privateKey),now=options.now??Date.now;
 if(stored.app.toLowerCase()!==app.toLowerCase()||stored.baseChainId!==10143||signer.address.toLowerCase()!==grant.sessionKey.toLowerCase()||grant.anyFunction)throw Error('Invalid compact game authorization');
 let nonce:number|undefined,busy=false,uncertain=false,registered=false;
 async function rawSend(name:string,args:readonly unknown[]){
  nonce??=await node.getTransactionCount({address:signer.address});
  const data=encodeFunctionData({abi,functionName:name,args}),started=now();
  // Every control, not only tick, input and concede, is signed with
  // ENGINE_COMMAND_GAS (30,000,000, the node's maximum; see engine-gas.ts). Those
  // three advance the Chaos clock and need the headroom. acceptMatch, cancelMatch
  // and the grant writes never simulate, but gas is free here and the limit is
  // only a ceiling, so one limit costs them nothing and leaves no command behind
  // if a future rule makes it advance.
  const raw=await signer.signTransaction(engineCommandTransaction(app,nonce,data));
  const hash=keccak256(raw);uncertain=true;
  // The caller's transport persists these exact bytes before sending. Never
  // replace this nonce when the response may have been lost after execution.
  const receipt:any=await node.request({method:'interlude_sendTransaction',params:[raw]} as any);
  if(receipt?.transactionHash?.toLowerCase()!==hash.toLowerCase()||!['0x1','0x0','success','reverted'].includes(String(receipt.status)))throw Error('Game command receipt is not confirmed');
  nonce++;uncertain=false;
  if(!['0x1','success'].includes(String(receipt.status))){
   let errorName='GameReverted';try{errorName=decodeErrorResult({abi,data:receipt.output}).errorName;}catch{}
   throw Object.assign(new Error(`${errorName}: reading the current game state`),{name:'AppRevertError',errorName});
  }
  return {receipt,hash,result:undefined,latencyMs:now()-started};
 }
 async function exclusive<T>(fn:()=>Promise<T>){
  if(busy||uncertain)throw Error('Reconcile the previous game command before sending another');
  busy=true;try{return await fn();}finally{busy=false;}
 }
 return {
  send:async(name,args=[])=>exclusive(async()=>{
   if(!(compactRoomActions as readonly string[]).includes(name))throw Error('Compact session only permits game controls');
   if(BigInt(Math.floor(now()/1000))>=grant.expiry)throw Error('Arcade session expired');
   if(!registered){
    const expected=BigInt(grant.granter)|(grant.expiry<<160n)|(epoch<<224n);
    const binding=await node.readContract({address:app,abi,functionName:'controlBinding',args:[signer.address]}) as bigint;
    if(binding!==expected)await rawSend('registerControls',[encodeAbiParameters(controlProofParameters,[grant,signature])]);
    registered=true;
   }
   return rawSend(name,args);
  }),
  revoke:()=>exclusive(async()=>{
   // No registration on disconnect. Revocation remains available after expiry.
   const binding=await node.readContract({address:app,abi,functionName:'controlBinding',args:[signer.address]}) as bigint;
   if(binding!==0n && ((binding>>160n)&((1n<<64n)-1n))!==0n)await rawSend('revokeControls',[signer.address]);
   registered=false;
  }),
 };
}
