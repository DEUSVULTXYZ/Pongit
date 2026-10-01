import type {Address,Hex} from 'viem';
import {recoverMessageAddress} from 'viem';

/** Control's documented, epoch-bound EIP-191 consent. This is not a game or
 * financial signature. Callers must first read owner()/hub/session canonically.
 * Never persist the returned transport or log its POST body. */
export async function hostedOptInTransport(options:{app:Address;epoch:bigint;owner:Address;control:string;
 sign:(message:string)=>Promise<Hex>;transport:typeof fetch}):Promise<typeof fetch>{
 const {app,epoch,owner,control,transport}=options;
 if(epoch<=0n||!['https://interlude-control.fly.dev','https://control.interludelayer.xyz'].includes(control))
  throw Error('Invalid hosted consent scope');
 const message=`interlude:provision:${app.toLowerCase()}:${epoch}`;
 const signature=await options.sign(message);
 if((await recoverMessageAddress({message,signature})).toLowerCase()!==owner.toLowerCase())throw Error('Hosted consent signer is not owner()');
 return (async(input,init)=>{
  if(init?.method?.toUpperCase()!=='POST')return transport(input,init);
  if(String(input)!==control+'/sessions'||init.redirect!=='error')throw Error('Hosted consent destination changed');
  let body:any;try{body=JSON.parse(String(init.body));}catch{throw Error('Invalid hosted consent request');}
  if(body.app?.toLowerCase()!==app.toLowerCase()||Object.keys(body).some(k=>!['app','region'].includes(k)))throw Error('Hosted consent application changed');
  return transport(input,{...init,body:JSON.stringify({...body,signature})});
 }) as typeof fetch;
}
