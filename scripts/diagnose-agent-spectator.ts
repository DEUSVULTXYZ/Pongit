// Read-only public observation. No keys, authorizations, writes or invented states.
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket} from 'ws';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {projectLive} from '../web/lib/presentation';
const get=async(path:string)=>{const r=await fetch('https://pongit.xyz/api/agents/'+path);if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();};
const config=await get('config'),live=await get('live');
if(!live.items.length)throw Error('No actual live match');
const ref=live.items[0].ref,match=await get(`matches/${ref.app}/${ref.epoch}/${ref.id}`);
const observer=await createPoolObserver(config,match,u=>new WebSocket(u));
const rows:any[]=[];let pushes=0;const stop=observer.watch(()=>pushes++);
try{for(let i=0;i<40;i++){
 const at=Date.now(),s=await observer.read(),p=projectLive(s.state,s.clock);
 rows.push({at:new Date().toISOString(),readMs:Date.now()-at,pushes,revision:s.revision,phase:s.phase,clock:s.clock,t:s.state.t,
  lagMs:Number(s.clock-s.state.t)/1000,ageMs:Date.now()-s.observedAt,x:Number(s.state.x)/1e6,y:Number(s.state.y)/1e6,
  vx:Number(s.state.vx)/1e6,vy:Number(s.state.vy)/1e6,projectedX:Number(p.state.x)/1e6,projectedY:Number(p.state.y)/1e6,waiting:p.waiting,chaos:!!s.chaos});
 await new Promise(r=>setTimeout(r,250));
}}finally{stop();observer.close();}
await mkdir('/diagnostics/agent-spectator',{recursive:true});
await writeFile('/diagnostics/agent-spectator/before.json',JSON.stringify({ref,rows},(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({ref,samples:rows.length,pushes,first:rows[0],last:rows.at(-1),lagRange:[Math.min(...rows.map(r=>r.lagMs)),Math.max(...rows.map(r=>r.lagMs))],outside:rows.filter(r=>r.projectedX<0||r.projectedX>1024||r.projectedY<0||r.projectedY>576).length},(_,v)=>typeof v==='bigint'?String(v):v));
