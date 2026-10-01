import type {Address} from 'viem';

export const LEGACY_HOSTED_HUB:Address='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
export const PREVIOUS_HOSTED_ORIGIN='https://control.interludelayer.xyz';
// Pinned from interlude-sdk 7b3fde219d196e3851b14f1d1b0ff80c1417833f,
// docs/DEPLOYMENTS.md. The public hostname now serves hub v3. Its session
// directory does not forward the older partner hub's requests.
const controls:Record<string,{origin:string;validator:string}>={
 [LEGACY_HOSTED_HUB.toLowerCase()]:{origin:'https://interlude-control.fly.dev',validator:'0xB28E684815b095aB5Fb324214cfEa63d76F3d691'},
 '0x98922c6e5e4bea62761c71d2401c7ec2c26ec43e':{origin:PREVIOUS_HOSTED_ORIGIN,validator:'0xa375CF27eD39491dB8302Ffc3dF4210Ad263eF43'},
};
const cache=new WeakMap<typeof fetch,Map<string,{until:number;request:Promise<string>}>>();
/** Check the control plane's chain, hub and validator before using its session
 * API. A failed check cannot create a node. This verifies routing only; the
 * hosted node must still prove its own epoch, base block, code and publication.
 * Coalesce concurrent checks without caching a failure or an arbitrary origin. */
export async function hostedControl(hub:Address,transport:typeof fetch,now=Date.now()){
 const selected=controls[hub.toLowerCase()];if(!selected)throw Error('Unsupported hosted hub; no session request sent');
 let entries=cache.get(transport);if(!entries){entries=new Map();cache.set(transport,entries);}
 const old=entries.get(hub.toLowerCase());if(old&&old.until>now)return old.request;
 const entry={until:now+30000,request:Promise.resolve('')};
 entry.request=(async()=>{
  const response=await transport(selected.origin+'/config',{method:'GET',signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)throw Error('Hosted control configuration unavailable');
  const body=await response.json();
  if(body?.chainId!==10143||typeof body?.hub!=='string'||body.hub.toLowerCase()!==hub.toLowerCase()
   ||typeof body?.validator!=='string'||body.validator.toLowerCase()!==selected.validator.toLowerCase())
   throw Error('Hosted control configuration does not match the delegation hub');
  return selected.origin;
 })();
 entries.set(hub.toLowerCase(),entry);
 entry.request.catch(()=>{if(entries!.get(hub.toLowerCase())===entry)entries!.delete(hub.toLowerCase());});
 return entry.request;
}
