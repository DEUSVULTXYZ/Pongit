import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import {HOME_REGION,INTERLUDE_REGIONS,isInterludeRegion,latencyBucket} from '../../shared/interlude-regions';

// Browsers report the Interlude region nearest to them and two rounded latencies
// (see web/lib/region-probe.ts). Only daily counts per bucket are kept: no address,
// no timestamp finer than a day, nothing that could single out a player.
type Query={query:(sql:string,args:unknown[])=>Promise<{rows:any[]}>};
type Dependencies={db:Query;readBody:(req:IncomingMessage)=>Promise<any>;send:(res:ServerResponse,value:unknown,status?:number)=>void;now?:()=>Date};
type Row={region:string;ms:number|string;home_ms:number|string;samples:number|string};

export const PROBE_RETENTION_DAYS=90;
/** Past this round trip a paddle visibly trails the key: the arenas are too far away. */
export const SLOW_HOME_MS=100;
const Sample=z.object({region:z.string().refine(isInterludeRegion,'Unknown region'),ms:z.number().finite().min(0).max(60000),homeMs:z.number().finite().min(0).max(60000)});

export async function initializeRegionProbe(db:Query){
 await db.query('CREATE TABLE IF NOT EXISTS region_probe_daily (day date NOT NULL,region text NOT NULL,ms smallint NOT NULL,home_ms smallint NOT NULL,samples integer NOT NULL,PRIMARY KEY(day,region,ms,home_ms))',[]);
}

const day=(at:Date,offsetDays=0)=>new Date(at.getTime()+offsetDays*86400000).toISOString().slice(0,10);
/** Lower median of weighted values; null when nothing was weighed. */
function median(weighted:[number,number][]){
 const sorted=weighted.filter(([,w])=>w>0).sort((a,b)=>a[0]-b[0]);
 const total=sorted.reduce((n,[,w])=>n+w,0);
 let seen=0;
 for(const [value,w] of sorted)if((seen+=w)*2>=total)return value;
 return null;
}

/** The operator table: where players are, and how much an arena in their region would save them. */
export function summarizeRegionProbes(rows:Row[]){
 const all=rows.map(r=>({region:r.region,ms:Number(r.ms),home:Number(r.home_ms),n:Number(r.samples)}));
 const samples=all.reduce((n,r)=>n+r.n,0);
 const slow=all.filter(r=>r.home>=SLOW_HOME_MS).reduce((n,r)=>n+r.n,0);
 const regions=INTERLUDE_REGIONS.map(({region,city})=>{
  const mine=all.filter(r=>r.region===region),count=mine.reduce((n,r)=>n+r.n,0);
  return {region,city,samples:count,share:samples?count/samples:0,
   medianMs:median(mine.map(r=>[r.ms,r.n])),
   medianHomeMs:median(mine.map(r=>[r.home,r.n])),
   medianGainMs:median(mine.map(r=>[r.home-r.ms,r.n]))};
 }).sort((a,b)=>b.samples-a.samples);
 return {home:HOME_REGION,samples,slowHomeShare:samples?slow/samples:0,regions};
}

export function regionProbeRoutes(d:Dependencies){
 const now=d.now??(()=>new Date());
 return async(req:IncomingMessage,res:ServerResponse,path:string):Promise<boolean>=>{
  if(path!=='/region-probe')return false;
  if(req.method==='POST'){
   const sample=Sample.parse(await d.readBody(req));
   await d.db.query('INSERT INTO region_probe_daily (day,region,ms,home_ms,samples) VALUES ($1,$2,$3,$4,1) ON CONFLICT (day,region,ms,home_ms) DO UPDATE SET samples=region_probe_daily.samples+1',
    [day(now()),sample.region,latencyBucket(sample.ms),latencyBucket(sample.homeMs)]);
   d.send(res,{ok:true});
   return true;
  }
  if(req.method==='GET'){
   const asked=Math.floor(Number(new URL(req.url||'/','http://localhost').searchParams.get('days')??30))||30;
   const days=Math.min(PROBE_RETENTION_DAYS,Math.max(1,asked));
   await d.db.query('DELETE FROM region_probe_daily WHERE day<$1',[day(now(),-PROBE_RETENTION_DAYS)]);
   const {rows}=await d.db.query('SELECT region,ms,home_ms,sum(samples)::int AS samples FROM region_probe_daily WHERE day>=$1 GROUP BY region,ms,home_ms',[day(now(),1-days)]);
   d.send(res,{days,...summarizeRegionProbes(rows)});
   return true;
  }
  return false;
 };
}
