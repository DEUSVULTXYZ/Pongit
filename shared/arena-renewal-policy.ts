import {isAddress} from 'viem';

/** Operator-reviewed retirement of owned capacity. This policy only prevents
 * a new opening; it never closes a match, releases a nonce or proves a result. */
export function arenaRenewalExclusions(value:unknown,pool:string,arenas:readonly string[]):ReadonlySet<string>{
 const p=value as {pool?:string;arenas?:string[];reason?:string;requestedAt?:string};
 if(!p||!isAddress(p.pool??'')||p.pool!.toLowerCase()!==pool.toLowerCase()
  ||!Array.isArray(p.arenas)||p.arenas.length<1||p.arenas.length>arenas.length
  ||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>240
  ||typeof p.requestedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(p.requestedAt)||!Number.isFinite(Date.parse(p.requestedAt)))throw Error('Invalid arena renewal policy');
 const known=new Set(arenas.map(a=>a.toLowerCase())),excluded=new Set<string>();
 for(const app of p.arenas){
  if(typeof app!=='string'||!isAddress(app)||!known.has(app.toLowerCase())||excluded.has(app.toLowerCase()))throw Error('Renewal policy names an unknown or duplicate arena');
  excluded.add(app.toLowerCase());
 }
 return excluded;
}
