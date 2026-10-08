// Bounded public reads only. No session, signer, game call or provider change.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const [label,file]=process.argv.slice(2);
assert(['windows-36','vps-36'].includes(label)&&file);
assert.equal(process.env.PONG_NODE_PATH_PROBE,'read-only-public');
assert(Number(process.versions.node.split('.')[0])>=22);
const started=Date.now(),deadline=started+240000;
const report={label,startedAt:new Date(started).toISOString(),deadline:new Date(deadline).toISOString(),
 scope:'Read-only public block number over HTTP/WebSocket every 500ms; health every 2s. Eight nodes. No signed calls or session changes.',rows:[],passed:false};
await writeFile(file,JSON.stringify(report)+'\n',{flag:'wx'});
const response=await fetch('https://pongit.xyz/api/agents/config',{signal:AbortSignal.timeout(8000)});
const config=await response.json();
assert.equal(config.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
assert.equal(config.arenas.length,8);
await Promise.all(config.arenas.map(async arena=>{
 const endpoint=new URL(arena.node);assert(endpoint.protocol==='https:'&&endpoint.hostname.endsWith('.fly.dev'));
 const socket=new WebSocket(endpoint.href.replace('https:','wss:'));
 const callbacks=new Map();let id=0,nextHealth=0;
 socket.addEventListener('message',event=>{const value=JSON.parse(String(event.data));callbacks.get(value.id)?.(value);callbacks.delete(value.id);});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('socket-open-timeout')),2500);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve();});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('socket-error'));});});
  while(Date.now()<deadline){
   const at=Date.now(),row={app:arena.app,at};
   const body={jsonrpc:'2.0',id:++id,method:'eth_blockNumber',params:[]};
   const measure=async(name,read)=>{const began=performance.now();try{const value=await read();
    assert(!value.error&&/^0x[\da-f]+$/i.test(value.result));row[name]={ms:performance.now()-began,receivedAt:Date.now(),block:value.result};
   }catch{row[name]={ms:performance.now()-began,receivedAt:Date.now(),failed:true};}};
   const health=async()=>{
    const began=performance.now();try{
     const value=await(await fetch(new URL('/health',endpoint),{signal:AbortSignal.timeout(2000)})).json();
     assert(value.app.toLowerCase()===arena.app.toLowerCase()&&value.epoch===1);
     row.health={ms:performance.now()-began,receivedAt:Date.now(),block:value.ephemeralBlock,timestamp:value.execTimestamp,
      pendingDiffs:value.pendingDiffs,batches:value.committedBatches,ok:value.ok,sendGated:value.sendGated,
      clock:{ageMs:value.clock?.ageMs,lagMs:value.clock?.lagMs,fenced:value.clock?.fenced,failures:value.clock?.failures,
       refreshes:value.clock?.refreshes,readMs:value.clock?.readMs},lock:value.lock,reads:value.reads,commits:value.commits};
    }catch{row.health={ms:performance.now()-began,receivedAt:Date.now(),failed:true};}
   };
   const reads=[
    measure('ws',()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{callbacks.delete(body.id);reject(Error('socket-read-timeout'));},2000);
     callbacks.set(body.id,value=>{clearTimeout(timer);resolve(value);});socket.send(JSON.stringify(body));})),
    measure('http',async()=>await(await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)})).json()),
   ];
   if(at>=nextHealth){nextHealth=at+2000;reads.push(health());}
   await Promise.all(reads);report.rows.push(row);
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,500-(Date.now()-at))));
  }
 }catch{report.rows.push({app:arena.app,at:Date.now(),failed:true});}finally{socket.close();}
}));
report.finishedAt=new Date().toISOString();report.passed=true;
await writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({label,samples:report.rows.length,finishedAt:report.finishedAt,
 slow:report.rows.filter(row=>row.failed||['ws','http','health'].some(key=>row[key]?.failed||row[key]?.ms>500))
  .map(row=>({app:row.app,at:row.at,...Object.fromEntries(['ws','http','health'].filter(k=>row[k]).map(k=>[k,{ms:row[k].ms,failed:row[k].failed}]))}))}));
