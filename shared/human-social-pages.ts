import assert from 'node:assert/strict';
import type {Hex} from 'viem';

export type SocialEventRef={transactionHash:Hex;blockHash:Hex;blockNumber:string;logIndex:number};
export type SocialPageCache={schema:string;snapshotHash:Hex;first:string;next:string;events:SocialEventRef[]};
export type SocialAnchor={snapshotHash:Hex;block:bigint;hash:Hex;lobby:string;family:string;chainId:number};

/** A newer migration snapshot may reuse only a canonical, contiguous prefix.
 * Receipts and command nonce coverage are still reverified by the auditor. */
export async function resumeSocialPages(cache:SocialPageCache,current:SocialAnchor,first:bigint,
 previous:SocialAnchor|undefined,canonicalHash:(block:bigint)=>Promise<Hex|null>):Promise<SocialPageCache>{
 assert.equal(cache.schema,'responsive-social-pages-v1');
 assert.equal(cache.first,String(first));
 const next=BigInt(cache.next);
 assert(next>=first&&next<=current.block+1n&&Array.isArray(cache.events));
 const seen=new Set<string>();
 for(const event of cache.events){
  assert(BigInt(event.blockNumber)>=first&&BigInt(event.blockNumber)<next);
  assert(Number.isSafeInteger(event.logIndex)&&event.logIndex>=0);
  const id=event.transactionHash+':'+event.logIndex;assert(!seen.has(id),'Duplicate cached event');seen.add(id);
 }
 if(cache.snapshotHash!==current.snapshotHash){
  assert(previous,'Previous exact snapshot required to extend history');
  assert.equal(cache.snapshotHash,previous.snapshotHash);
  assert.equal(current.chainId,previous.chainId);
  for(const key of ['lobby','family'] as const)assert.equal(current[key].toLowerCase(),previous[key].toLowerCase());
  assert(previous.block<=current.block&&next<=previous.block+1n,'Cached prefix exceeds its verified anchor');
  assert.equal(await canonicalHash(previous.block),previous.hash,'Previous social snapshot reorganized');
 }
 return {...cache,snapshotHash:current.snapshotHash,events:[...cache.events]};
}
