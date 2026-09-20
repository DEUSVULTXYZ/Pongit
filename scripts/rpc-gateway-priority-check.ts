// Real HTTP queue integration, with an isolated local upstream, no blockchain
// endpoint and no host port. Run only in the temporary VPS test container.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';

assert.equal(process.env.PONG_GATEWAY_QUALIFICATION,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const sent:Array<{method:string;params:unknown[];at:number}>=[];
const upstream=createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part;
 const input=JSON.parse(body);sent.push({method:input.method,params:input.params,at:performance.now()});
 res.setHeader('content-type','application/json');
 res.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result:{fixture:true,method:input.method,params:input.params}}));
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const address=upstream.address();assert(address&&typeof address==='object');
const url=`http://127.0.0.1:${address.port}`;
const gateway=spawn(process.execPath,['--import','tsx','relayer/src/rpc-gateway.ts'],{
 env:{PATH:process.env.PATH,NODE_ENV:'test',RPC_UPSTREAM:url,RPC_UPSTREAM_FALLBACK:url,RPC_PORT:'18545',RPC_SPACING_MS:'60'},
 stdio:['ignore','pipe','pipe'],
});
let stderr='';gateway.stderr.on('data',chunk=>stderr+=String(chunk));
const report:{passed:boolean;scope:string;checks:string[];sent?:typeof sent;error?:string}={passed:false,scope:'Actual isolated gateway HTTP queue with synthetic local RPC upstream; no hosted performance claim',checks:[]};
async function rpc(method:string,params:unknown[]){
 const response=await fetch('http://127.0.0.1:18545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
 const value=await response.json() as any;assert(!value.error);return value.result;
}
try{
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Isolated gateway did not start')),10000);
  gateway.once('error',reject);gateway.once('exit',()=>reject(Error('Gateway stopped before readiness')));
  gateway.stdout.on('data',chunk=>{if(String(chunk).includes('Private RPC gateway listening')){clearTimeout(timer);resolve();}});
 });
 const old=Array.from({length:20},(_,i)=>rpc('eth_getBlockByNumber',[`0x${(1000+i).toString(16)}`,false]));
 const deadline=Date.now()+5000;
 for(;;){
  const health=await fetch('http://127.0.0.1:18545/health').then(r=>r.json()) as any;
  if(health.queued.history>=15)break;
  assert(Date.now()<deadline,'Backfill queue never became observable');await new Promise(r=>setTimeout(r,10));
 }
 const prior=sent.length;
 const current=rpc('eth_getBlockByNumber',['latest',false]);
 const recovery=rpc('eth_getTransactionByHash',['0x1234']);
 await Promise.all([...old,current,recovery]);
 const header=sent.findIndex(v=>v.params[0]==='latest'),hash=sent.findIndex(v=>v.method==='eth_getTransactionByHash');
 report.sent=sent.map(v=>({...v,at:Math.round(v.at-sent[0].at)}));
 assert(header>=prior&&header<prior+5,'Current header was held behind historical blocks');
 assert(hash>=prior&&hash<prior+5,'Uncertain transaction recovery was held behind historical blocks');
 assert.equal(sent.length,22);
 // CPU throttling can make the upstream observe buffered requests together.
 // Enforce total burst pacing here; the scheduler's fake-clock test checks
 // every dispatch interval independently of HTTP arrival timing.
 assert(sent.at(-1)!.at-sent[0].at>=(sent.length-1)*45,'Interactive requests bypassed the shared burst budget');
 assert.equal(sent.filter(v=>v.method==='eth_getBlockByNumber'&&v.params[0]!=='latest').length,20,'History was starved');
 report.checks.push('Current grant/deadline header overtakes backfill','Transaction hash reconciliation overtakes backfill','All twenty archive reads complete','Shared upstream pacing preserved');
 report.passed=true;
}catch(error){report.error=error instanceof Error?error.message:'Gateway integration failed';process.exitCode=1;}
finally{
 if(gateway.exitCode===null&&gateway.signalCode===null){const exited=once(gateway,'exit');gateway.kill('SIGTERM');await exited.catch(()=>{});}
 upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));
 await mkdir('artifacts/gateway-priority',{recursive:true});await writeFile('artifacts/gateway-priority/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,childError:stderr.slice(0,200)}));
}
