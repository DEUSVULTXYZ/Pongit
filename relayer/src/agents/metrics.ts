import {appendFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {setRpcMetricSink,type RpcMetric} from '../../../shared/rpc-metrics';

/** Seven days of bounded aggregate diagnostics, without payloads or identities. */
export async function agentMetrics(directory:string,role:string){
 if(!directory.startsWith('/diagnostics/'))throw Error('Agent diagnostics require a private mounted directory');
 await mkdir(directory,{recursive:true,mode:0o700});
 let groups=new Map<string,{count:number;errors:number;bytes:number;maxBytes:number;latencies:number[];seconds:Map<number,number>}>(),closed=false,writing=Promise.resolve();
 const sample=(s:RpcMetric)=>{
  const key=[s.target,s.method,s.source,s.status].join('|');let g=groups.get(key);
  if(!g){if(groups.size>=500)return;g={count:0,errors:0,bytes:0,maxBytes:0,latencies:[],seconds:new Map()};groups.set(key,g);}
  g.count++;if(s.status===0||s.status>=400)g.errors++;
  g.bytes+=s.requestBytes??0;g.maxBytes=Math.max(g.maxBytes,s.requestBytes??0);
  // Bound memory even if a client unexpectedly generates excessive traffic.
  if(g.latencies.length<20000)g.latencies.push(s.ms);
  const second=Math.floor(s.at/1000);g.seconds.set(second,(g.seconds.get(second)||0)+1);
 };
 setRpcMetricSink(sample);
 async function flush(){
  const batch=groups;groups=new Map();const at=new Date(),day=at.toISOString().slice(0,10);
  const rows=[...batch].map(([key,g])=>{const ms=g.latencies.sort((a,b)=>a-b),p=(v:number)=>ms[Math.max(0,Math.ceil(ms.length*v)-1)]??0;
   const counts=[...g.seconds];const peak=(window:number)=>Math.max(0,...counts.map(([s])=>counts.reduce((n,[t,c])=>n+(t>s-window&&t<=s?c:0),0)));
   return {at:at.toISOString(),role,key,count:g.count,errors:g.errors,requestBytes:g.bytes,maxRequestBytes:g.maxBytes,p50:p(.5),p95:p(.95),p99:p(.99),sampled:ms.length,peak1s:peak(1),peak10s:peak(10),peak60s:peak(60)};});
  if(rows.length)await appendFile(join(directory,`${day}-${role}.ndjson`),rows.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
  const oldest=Date.now()-7*86400000;
  for(const name of await readdir(directory))if(/^\d{4}-\d{2}-\d{2}-[a-z]+\.ndjson$/.test(name)&&Date.parse(name.slice(0,10)+'T23:59:59Z')<oldest)await unlink(join(directory,name));
 }
 const enqueue=()=>{writing=writing.then(flush).catch(()=>{console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-metrics',error:'Private diagnostics write failed'}));});};
 const timer=setInterval(enqueue,60000);timer.unref();
 return async()=>{if(closed)return;closed=true;clearInterval(timer);setRpcMetricSink(undefined);enqueue();await writing;};
}
