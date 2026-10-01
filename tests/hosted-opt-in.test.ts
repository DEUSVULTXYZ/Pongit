import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {recoverMessageAddress} from 'viem';
import {hostedOptInTransport} from '../shared/hosted-opt-in';
// Public, test-only vector. Never used for a network account.
const signer=privateKeyToAccount('0x'+'11'.repeat(32) as `0x${string}`),app='0x00000000000000000000000000000000000000Aa',control='https://interlude-control.fly.dev';
const scope={app,epoch:3n,owner:signer.address,control,sign:(message:string)=>signer.signMessage({message})} as const;
test('provision consent binds the actual owner, lowercase app and exact epoch only to its intended POST',async()=>{
 const calls:any[]=[];const transport=await hostedOptInTransport({...scope,transport:(async(url,init)=>{calls.push({url,init});return Response.json({});}) as typeof fetch});
 await transport(control+'/config');assert.equal(calls[0].init,undefined);
 await transport(control+'/sessions/'+app,{method:'GET'});assert.equal(calls[1].init.body,undefined);
 await transport(control+'/sessions',{method:'POST',redirect:'error',body:JSON.stringify({app,region:'eu'})});
 const body=JSON.parse(calls[2].init.body);
 assert.equal((await recoverMessageAddress({message:`interlude:provision:${app.toLowerCase()}:3`,signature:body.signature})),signer.address);
 assert.notEqual((await recoverMessageAddress({message:`interlude:provision:${app.toLowerCase()}:4`,signature:body.signature})),signer.address);
});
test('consent cannot be sent to another app, origin, arbitrary POST or redirect',async()=>{
 let sent=0;const transport=await hostedOptInTransport({...scope,transport:(async()=>{sent++;return Response.json({});}) as typeof fetch});
 for(const [url,init] of [
  ['https://control.interludelayer.xyz/sessions',{method:'POST',redirect:'error',body:JSON.stringify({app})}],
  [control+'/sessions',{method:'POST',redirect:'follow',body:JSON.stringify({app})}],
  [control+'/sessions',{method:'POST',redirect:'error',body:JSON.stringify({app:'0x1'})}],
  [control+'/sessions',{method:'POST',redirect:'error',body:JSON.stringify({app,signature:'changed'})}],
 ] as [string,RequestInit][])await assert.rejects(transport(url,init),/Hosted consent/);
 assert.equal(sent,0);
 await assert.rejects(hostedOptInTransport({...scope,owner:'0x0000000000000000000000000000000000000001',transport}),/not owner/);
 await assert.rejects(hostedOptInTransport({...scope,epoch:0n,transport}),/Invalid/);
});
