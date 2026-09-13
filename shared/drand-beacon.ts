import {sha256,type Hex} from 'viem';
import {DRAND_CHAIN_HASH} from './chaos-draw';

export type DrandBeacon={round:bigint;signature:Hex;randomness:Hex};
/** Public transport only. A returned value is NOT a verified game event. The
 * immutable contract must verify the BLS signature and the committed round. */
export class DrandBeaconTransport {
 private pending=new Map<string,Promise<DrandBeacon>>();
 private cache=new Map<string,DrandBeacon>();
 private retry=new Map<string,number>();
 constructor(private options:{fetch?:typeof fetch;now?:()=>number;endpoints?:readonly string[];timeoutMs?:number}={}){}
 async read(round:bigint):Promise<DrandBeacon>{
  if(round<=0n||round>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported drand round');
  const key=round.toString(),cached=this.cache.get(key);if(cached)return cached;
  const pending=this.pending.get(key);if(pending)return pending;
  const request=this.load(round).then(beacon=>{
   this.cache.set(key,beacon);while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value!);return beacon;
  }).finally(()=>this.pending.delete(key));
  this.pending.set(key,request);return request;
 }
 private async load(round:bigint):Promise<DrandBeacon>{
  const now=this.options.now??Date.now,fetcher=this.options.fetch??fetch;
  let retryAt=now()+2000,source='drand',code='BEACON_UNAVAILABLE';
  for(const endpoint of this.options.endpoints??['https://api.drand.sh','https://api2.drand.sh','https://api3.drand.sh']){
   const url=new URL(endpoint);if(url.protocol!=='https:')throw Error('Drand transport requires HTTPS');
   const blockedUntil=this.retry.get(endpoint)??0;
   if(blockedUntil>now()){retryAt=Math.max(retryAt,blockedUntil);continue;}
   try{
    const response=await fetcher(`${url.origin}/${DRAND_CHAIN_HASH.slice(2)}/public/${round}`,{signal:AbortSignal.timeout(this.options.timeoutMs??5000)});
    source=url.hostname;
    if(response.status===429){
     const header=response.headers.get('Retry-After');
     const parsed=header&&/^\d+(\.\d+)?$/.test(header)?now()+Number(header)*1000:header?Date.parse(header):NaN;
     const until=Number.isFinite(parsed)?Math.max(now()+1000,parsed):now()+10000;
     this.retry.set(endpoint,until);retryAt=Math.max(retryAt,until);code='DRAND_RATE_LIMIT';continue;
    }
    if(!response.ok){this.retry.set(endpoint,now()+(response.status===404?1000:3000));continue;}
    if(Number(response.headers.get('Content-Length')||0)>4096)throw Error('Oversized beacon response');
    // Bound even a chunked response before parsing; never accept arbitrary JSON.
    const reader=response.body?.getReader();if(!reader)throw Error('Empty beacon body');
    const parts:Uint8Array[]=[];let bytes=0;
    try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>4096)throw Error('Oversized beacon response');parts.push(next.value);}}
    finally{await reader.cancel();}
    const body=new Uint8Array(bytes);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
    const value=JSON.parse(new TextDecoder().decode(body));
    if(!Number.isSafeInteger(value.round)||BigInt(value.round)!==round||typeof value.signature!=='string'||!/^[\da-f]{128}$/i.test(value.signature)||typeof value.randomness!=='string'||!/^[\da-f]{64}$/i.test(value.randomness))throw Error('Invalid beacon envelope');
    const signature=`0x${value.signature.toLowerCase()}` as Hex,randomness=`0x${value.randomness.toLowerCase()}` as Hex;
    if(sha256(signature)!==randomness)throw Error('Beacon digest mismatch');
    return {round,signature,randomness};
   }catch{
    // Another mirror can transport the SAME committed round. Never choose an
    // older round or substitute locally generated randomness on failure.
    this.retry.set(endpoint,Math.max(this.retry.get(endpoint)??0,now()+2000));
   }
  }
  throw Object.assign(new Error('Waiting for the committed random beacon.'),{code,source,retryAt});
 }
}
