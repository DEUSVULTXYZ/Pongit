import {isAddress} from 'viem';
import {publicIndependentManifest,type IndependentManifest} from './independent';

/** Historical contracts stay explicitly addressed; a repeated numeric id is not a match identity. */
export function previousIndependentManifests(raw:unknown,current:IndependentManifest){
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>8)throw Error('Invalid historical human manifests');
 const seen=new Set([current.lobby.toLowerCase()]);
 return raw.map(item=>{
  const m=publicIndependentManifest(item),key=m.lobby.toLowerCase();
  if(seen.has(key))throw Error('Duplicate historical human lobby');seen.add(key);
  return m;
 });
}
export function independentScope(current:IndependentManifest,previous:readonly IndependentManifest[],lobby?:string|null){
 if(!lobby)return current;
 if(!isAddress(lobby))throw Error('Invalid human history scope');
 const m=[current,...previous].find(m=>m.lobby.toLowerCase()===lobby.toLowerCase());
 if(!m)throw Error('Unknown human history scope');return m;
}
export function mergeIndependentRecent(groups:readonly any[][]){
 const rows=new Map<string,any>();for(const group of groups)for(const row of group)rows.set(row.ref,row);
 return [...rows.values()].sort((a,b)=>BigInt(a.endedBlock)===BigInt(b.endedBlock)?b.ref.localeCompare(a.ref):BigInt(a.endedBlock)>BigInt(b.endedBlock)?-1:1).slice(0,3);
}
