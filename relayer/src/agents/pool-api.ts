import type {AgentPoolReader} from './pool-read';
import {poolNotFound} from './pool-read';
import {isAddress,type Address} from 'viem';
import {PoolReplays,replayRevision} from './pool-replays';

/** Coalesces readers across spectators. Errors are never cached as empty data,
 * requests never keep stale entries alive, and unbounded query strings cannot
 * turn this into an unbounded memory cache. */
export class PoolReadCache {
 private entries=new Map<string,{until:number;pending:boolean;promise:Promise<any>}>();
 constructor(readonly now=Date.now,readonly ttl=2000,readonly maxEntries=128){}
 get<T>(key:string,load:()=>Promise<T>):Promise<T>{
  const now=this.now(),entry=this.entries.get(key);if(entry&&(entry.pending||entry.until>now))return entry.promise;
  this.entries.delete(key);for(const [k,e] of this.entries)if(!e.pending&&e.until<=now)this.entries.delete(k);
  if(this.entries.size>=this.maxEntries){
   const completed=[...this.entries].find(([,e])=>!e.pending);
   if(!completed)throw Object.assign(Error('Published reads are busy'),{status:503,code:'AGENT_READ_BUSY'});
   this.entries.delete(completed[0]);
  }
  const promise=load().then(value=>{const e=this.entries.get(key);if(e?.promise===promise){e.pending=false;e.until=this.now()+this.ttl;}return value;})
   .catch(error=>{if(this.entries.get(key)?.promise===promise)this.entries.delete(key);throw error;});
  this.entries.set(key,{until:now+this.ttl,pending:true,promise});return promise;
 }
}
function unsigned(value:string|null,fallback:bigint,max=2n**64n-1n){
 if(value===null)return fallback;
 if(!/^\d{1,20}$/.test(value)||BigInt(value)>max)throw Object.assign(Error('Invalid page or record number'),{status:400,code:'AGENT_PAGE_BOUNDS'});
 return BigInt(value);
}
function matchNumber(value:string|null){
 if(!value||!/^\d{1,78}$/.test(value)||BigInt(value)<1n||BigInt(value)>2n**256n-1n)throw poolNotFound();
 return BigInt(value);
}
export function poolRoutes(reader:AgentPoolReader,cache=new PoolReadCache(),replays?:PoolReplays){
 return async(url:URL)=>{
  const path=url.pathname.replace(/^\/agents(?=\/|$)/,''),offset=unsigned(url.searchParams.get('offset'),0n),limit=Number(unsigned(url.searchParams.get('limit'),16n,32n));
  if(!limit)throw Object.assign(Error('Page limit must be positive'),{status:400,code:'AGENT_PAGE_BOUNDS'});
  if(path==='/config')return cache.get('config',()=>reader.config());
  if(path==='/catalog')return cache.get(`catalog:${offset}:${limit}`,()=>reader.catalog(offset,limit));
  if(path==='/live')return cache.get('live',()=>reader.live());
  if(path==='/replay'){
   const app=url.searchParams.get('app'),epoch=matchNumber(url.searchParams.get('epoch')),id=matchNumber(url.searchParams.get('id'));
   if(!app||!isAddress(app)||epoch<1n||id<1n)throw poolNotFound();
   return cache.get(`replay:${app.toLowerCase()}:${epoch}:${id}`,async()=>{
    const observed=await reader.match({chainId:10143,app,epoch:String(epoch),id:String(id)});
    const value=replays?await replays.read(observed.value):{ref:observed.value.ref,rulesVersion:reader.manifest.rulesVersion,availability:'unavailable',frames:[],frameCount:0};
    return {...observed,value,revision:replayRevision(value)};
   });
  }
  const challenge=/^\/challenges\/(0x[\da-fA-F]{40})$/.exec(path);
  if(challenge){if(!isAddress(challenge[1]))throw poolNotFound();
   return cache.get(`challenge:${challenge[1].toLowerCase()}`,()=>reader.challenge(challenge[1] as Address));}
  const match=/^\/matches\/(0x[\da-fA-F]{40})\/(\d{1,78})\/(\d{1,78})$/.exec(path);
  if(match){
   if(!isAddress(match[1]))throw poolNotFound();
   return cache.get(`match:${match[1].toLowerCase()}:${BigInt(match[2])}:${BigInt(match[3])}`,
    ()=>reader.match({chainId:10143,app:match[1] as Address,epoch:String(matchNumber(match[2])),id:String(matchNumber(match[3]))}));
  }
  if(path==='/tournaments')return cache.get(`tournaments:${offset}:${limit}`,()=>reader.tournaments(offset,limit));
  const tournament=/^\/tournaments\/(\d{1,20})$/.exec(path);
  if(tournament){const id=unsigned(tournament[1],0n);return cache.get(`tournament:${id}`,()=>reader.tournament(id));}
  if(path==='/rankings'){
   const mode=Number(unsigned(url.searchParams.get('mode'),0n,1n)) as 0|1;
   const at=url.searchParams.has('block')?unsigned(url.searchParams.get('block'),0n):undefined;
   return cache.get(`rankings:${mode}:${offset}:${limit}:${at??'latest'}`,()=>reader.rankings(mode,offset,limit,at));
  }
  throw poolNotFound();
 };
}
