// Bounded read-only comparison. No signer, session creation or game call.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {encodeFunctionData} from 'viem';
const label=process.argv[2];assert(/^r2-node-[1-9]$/.test(label));
const file=`artifacts/responsive-20261008-r2/${label}.json`;
const started=Date.now(),deadline=started+60000;
const config=await(await fetch('https://pongit.xyz/api/agents/config')).json();
assert.equal(config.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
const arenas=config.arenas.filter((a:any)=>['077df08f','4e9fa437'].some(p=>a.app.toLowerCase().startsWith('0x'+p)));assert.equal(arenas.length,2);
const report:any={startedAt:new Date(started).toISOString(),deadline:new Date(deadline).toISOString(),scope:'Read-only RULES_VERSION HTTP/WebSocket and public health, five samples per second per two nodes. No signed calls or provider modifications.',rows:[]};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const data=encodeFunctionData({abi:[{type:'function',name:'RULES_VERSION',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'RULES_VERSION'});
await Promise.all(arenas.map(async(a:any)=>{
 const socket=new WebSocket(a.node.replace('https:','wss:'));let id=0;
 const callbacks=new Map<number,(v:any)=>void>();
 socket.addEventListener('message',e=>{const v=JSON.parse(String(e.data));callbacks.get(v.id)?.(v);callbacks.delete(v.id);});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket open deadline')),4000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Socket unavailable'));});});
  while(Date.now()<deadline){
   const at=Date.now(),row:any={app:a.app,at};
   const body={jsonrpc:'2.0',id:++id,method:'eth_call',params:[{to:a.app,data},'latest']};
   const measure=async(name:string,read:()=>Promise<any>)=>{const began=performance.now();try{const value=await read();assert(!value.error&&BigInt(value.result)===17n);row[name]=performance.now()-began;}catch{row[name+'Error']=true;}};
   await Promise.all([
    measure('wsMs',()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{callbacks.delete(body.id);reject(Error('Socket read deadline'));},1500);callbacks.set(body.id,v=>{clearTimeout(timer);resolve(v);});socket.send(JSON.stringify(body));})),
    measure('httpMs',async()=>await(await fetch(a.node,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(1500)})).json()),
    (async()=>{const began=performance.now();try{const h=await(await fetch(a.node+'/health',{signal:AbortSignal.timeout(1500)})).json();assert.equal(h.app.toLowerCase(),a.app.toLowerCase());assert.equal(h.epoch,1);row.healthMs=performance.now()-began;row.health={block:h.ephemeralBlock,timestamp:h.execTimestamp,pendingDiffs:h.pendingDiffs,batches:h.committedBatches,sendGated:h.sendGated,clock:h.clock?{ageMs:h.clock.ageMs,lagMs:h.clock.lagMs,fenced:h.clock.fenced,failures:h.clock.failures,refreshes:h.clock.refreshes}:undefined,lock:h.lock};}catch{row.healthError=true;}})(),
   ]);
   report.rows.push(row);await new Promise(r=>setTimeout(r,Math.max(0,200-(Date.now()-at))));
  }
 }catch{report.rows.push({app:a.app,error:'read-only-probe-failed'});}finally{socket.close();}
}));
report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(arenas.map((a:any)=>{const rows=report.rows.filter((r:any)=>r.app===a.app);return {app:a.app,samples:rows.length,maxWsMs:Math.max(...rows.map((r:any)=>r.wsMs??0)),maxHttpMs:Math.max(...rows.map((r:any)=>r.httpMs??0)),errors:rows.filter((r:any)=>r.error||r.wsMsError||r.httpMsError||r.healthError).length};})));
