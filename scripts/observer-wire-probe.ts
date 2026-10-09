// Bounded, read-only applied stream. No signing, session creation or node writes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const [app,run]=process.argv.slice(2);
assert(/^0x[\da-f]{40}$/i.test(app)&&/^[a-z0-9-]+$/.test(run));
const node=`https://il2-eu-${app.slice(2,18).toLowerCase()}.fly.dev`;
const response=await fetch(node,{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method:'interlude_session',params:[]}),signal:AbortSignal.timeout(5000)});
const session=(await response.json()).result;
assert.equal(session.app.toLowerCase(),app.toLowerCase());assert.equal(Number(session.epoch),1);assert.equal(Number(session.chainId),4242);
const report={app,node,epoch:1,startedAt:new Date().toISOString(),deadline:new Date(Date.now()+90_000).toISOString(),
 readOnly:true,frames:[] as {hash:string;head:string;receivedAt:number}[],errors:[] as string[],passed:false,finishedAt:''};
const socket=new WebSocket(node.replace('https:','wss:'));
socket.addEventListener('open',()=>socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'interlude_subscribe',params:['applied']})));
socket.addEventListener('message',e=>{const at=Date.now();try{
 const frame=JSON.parse(String(e.data)).params?.result;
 if(frame?.app?.toLowerCase()!==app.toLowerCase()||!/^0x[\da-f]{64}$/i.test(frame.hash))return;
 report.frames.push({hash:frame.hash,head:String(frame.blockNumber),receivedAt:at});
}catch{report.errors.push('Undecodable public frame');}});
socket.addEventListener('error',()=>report.errors.push('Socket transport error'));
await new Promise(resolve=>setTimeout(resolve,90_000));socket.close();
report.finishedAt=new Date().toISOString();report.passed=report.frames.length>0&&report.errors.length===0;
await writeFile(`artifacts/responsive-20261009-match1509/${run}.json`,JSON.stringify(report)+'\n',{flag:'wx'});
console.log(JSON.stringify({run,readOnly:true,frames:report.frames.length,passed:report.passed}));
