import {API} from './api';
import {HOME_REGION,INTERLUDE_REGIONS,type InterludeRegion} from '../../shared/interlude-regions';

/** One visit in five times a request to each Interlude region, in the background,
 * so we learn where players are before opening arenas elsewhere. Only the nearest
 * region and two latencies leave the browser: no address, no cookie, nothing stored. */
export const PROBE_SAMPLE_RATE=0.2;
export type Ping=(url:string)=>Promise<number>;

/** The first request pays for DNS and TLS, so it only warms the connection;
 * the best of the timed ones is the round trip. Undefined when unreachable. */
export async function regionLatency(url:string,ping:Ping,timed=2):Promise<number|undefined>{
 try{
  await ping(url);
  let best=Infinity;
  for(let i=0;i<timed;i++)best=Math.min(best,await ping(url));
  return best;
 }catch{return undefined;}
}

/** Regions are timed one after another so they never compete for the line.
 * `active` turning false (the tab was hidden, timers throttled) discards the run. */
export async function probeRegions(ping:Ping,active:()=>boolean=()=>true){
 const latency=new Map<InterludeRegion,number>();
 for(const {region,node} of INTERLUDE_REGIONS){
  if(!active())return undefined;
  const ms=await regionLatency(`${node}/health`,ping);
  if(ms!==undefined)latency.set(region,ms);
 }
 const home=latency.get(HOME_REGION);
 let nearest:[InterludeRegion,number]|undefined;
 for(const entry of latency)if(!nearest||entry[1]<nearest[1])nearest=entry;
 return active()&&nearest&&home!==undefined?{region:nearest[0],ms:Math.round(nearest[1]),homeMs:Math.round(home)}:undefined;
}

const fetchPing:Ping=async url=>{
 const start=performance.now();
 const response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(3000)});
 const elapsed=performance.now()-start;
 await response.arrayBuffer(); // drained so the next timed request reuses the connection
 return elapsed;
};

let scheduled=false;
export function scheduleRegionProbe(random=Math.random){
 if(scheduled||typeof window==='undefined')return;
 scheduled=true;
 if(random()>=PROBE_SAMPLE_RATE)return;
 if((navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData)return;
 let visible=document.visibilityState==='visible';
 const hidden=()=>{if(document.visibilityState!=='visible')visible=false;};
 document.addEventListener('visibilitychange',hidden);
 const run=async()=>{
  try{
   const sample=await probeRegions(fetchPing,()=>visible);
   if(sample)await fetch(`${API}/region-probe`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample),credentials:'omit',referrerPolicy:'no-referrer',keepalive:true});
  }catch{}
  finally{document.removeEventListener('visibilitychange',hidden);}
 };
 // Long after the page has settled, and only once the browser is idle.
 setTimeout(()=>'requestIdleCallback' in window?requestIdleCallback(()=>void run(),{timeout:10000}):void run(),8000);
}
