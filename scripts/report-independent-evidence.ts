// Reduces public-only test traces. Never reads the private authenticator journals.
import {readFile,writeFile} from 'node:fs/promises';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const report:any={generatedAt:new Date().toISOString(),scope:'Browser HTTP RPC only on hosted Fly endpoints. Does not include VPS, WebSocket frames, Monad, or other users. Setup and failed recovery are included; these are not comparable throughput benchmarks.',runs:[]};
for(const [mode,path] of [['classic','artifacts/independent-candidate/browser-v2-classic.json'],['chaos','artifacts/independent-candidate/browser-chaos-fresh1.json']]){
 const source=await json(path),rows=source.network.sort((a:any,b:any)=>a.at-b.at);
 const peaks=Object.fromEntries([1,10,60].map(seconds=>{let peak=0,left=0;for(let right=0;right<rows.length;right++){while(rows[right].at-rows[left].at>=seconds*1000)left++;peak=Math.max(peak,right-left+1);}return [`${seconds}s`,{requests:peak,averageRequestsPerSecond:peak/seconds}];}));
 const methods:Record<string,any>={};
 for(const row of rows){const value=methods[row.method]??={requests:0,httpFailures:0,rpcFailures:0};value.requests++;if(row.status>=400)value.httpFailures++;if(row.rpcError)value.rpcFailures++;}
 const rpcErrors=[...new Set(rows.filter((r:any)=>r.rpcError).map((r:any)=>r.rpcError.message))];
 report.runs.push({mode,startedAt:source.startedAt,finishedAt:source.finishedAt,passed:source.passed,error:source.error,checks:source.checks.filter((c:any)=>typeof c==='string'),viewports:source.viewports,requests:rows.length,firstRequestAt:new Date(rows[0].at).toISOString(),lastRequestAt:new Date(rows.at(-1).at).toISOString(),peaks,methods,http429:rows.filter((r:any)=>r.status===429).length,rpcErrors,maximumBrowserRequestBytes:Math.max(...rows.map((r:any)=>r.requestBytes||0))||null,passkeyAssertions:source.passkeyAssertions});
}
const rehearsal=await json('docs/evidence/independent/v1-hosted-qualification.json'),times=rehearsal.measurements.map((v:any)=>v.ms).sort((a:number,b:number)=>a-b);
report.v1Latency={scope:'VPS SDK latency, 17 controlled commands in the earlier isolated-session rehearsal. Not browser latency, sustained load, or a complete natural Chaos game.',samples:times.length,p50:times[Math.ceil(times.length*.5)-1],p95:times[Math.ceil(times.length*.95)-1],p99:times[Math.ceil(times.length*.99)-1]};
await writeFile('docs/evidence/independent/browser-load.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.runs.map((r:any)=>({mode:r.mode,requests:r.requests,peaks:r.peaks,http429:r.http429,rpcErrorKinds:r.rpcErrors.length}))));
