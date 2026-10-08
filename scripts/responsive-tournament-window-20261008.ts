// Read only: choose an actually fresh hosted fixture, never a stale /live row.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {validateAgentPoolManifest} from '../shared/agent-pool';
assert.equal(process.env.PONG_TOURNAMENT_WINDOW,'read-only-public');
const json=async(path:string)=>{const r=await fetch('https://pongit.xyz/api/agents/'+path,{signal:AbortSignal.timeout(10000)});assert(r.ok);return r.json();};
const manifest=validateAgentPoolManifest(await json('config'));
const live=await json('live');const fixture=live.items.find((m:any)=>BigInt(m.tournament??0)>0n);
if(!fixture)console.log(JSON.stringify({fresh:false,reason:'no-tournament'}));
else{
 const ref=fixture.ref,detail=await json(`matches/${ref.app}/${ref.epoch}/${ref.id}`);
 if(!detail.currentBinding||detail.result)console.log(JSON.stringify({fresh:false,reason:'published-or-unbound'}));
 else{
  const observer=await createPoolObserver(manifest,detail,url=>new WebSocket(url));
  try{
   const s=await observer.read(true);
   const summary={phase:s.phase,elapsedUs:String(s.state.t),scoreA:s.state.scoreA,scoreB:s.state.scoreB,pause:s.sync?.pause.status??0};
   console.log(JSON.stringify({fresh:s.phase>0&&s.phase<3&&s.state.t<=10_000_000n&&s.state.scoreA<=1&&s.state.scoreB<=1,
    fixture,summary,at:new Date().toISOString()},(_,v)=>typeof v==='bigint'?String(v):v));
  }finally{observer.close();}
 }
}
