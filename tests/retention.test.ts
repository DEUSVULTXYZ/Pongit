import test from "node:test";
import assert from "node:assert/strict";
import {retainFinished,snapshotScores} from "../indexer/src/retention";
import {encodeAbiParameters} from "viem";
import {stateComponents,initial} from "../shared/physics-v2";
function fixture(){const context:any={};for(const name of ["Match","RecentReplays","Frame","Handicap","Bet","Payout"]){const rows=new Map<string,any>();context[name]={rows,get:async(id:string)=>rows.get(id),set:(v:any)=>rows.set(v.id,v),deleteUnsafe:(id:string)=>rows.delete(id),getWhere:async(q:any)=>[...rows.values()].filter(v=>v.matchId===q.matchId._eq)};}return context;}
test("three per player across modes and deployments; shared replay survives until both participants release it",async()=>{
 const c=fixture();let n=0;
 const end=async(id:string,a:string,b:string,played=true)=>{const match={id,playerA:a,playerB:b,played,status:3,mode:n%2,scoreA:7,scoreB:3};c.Match.set(match);c.Frame.set({id:id+":1",matchId:id});c.Handicap.set({id:id+":h",matchId:id});await retainFinished(c,match,String(++n).padStart(20,"0"));};
 await end("v1:1","alice","bob");
 for(let i=1;i<=3;i++)await end(`v${i+1}:2`,"alice",`rival${i}`);
 assert.equal(c.Match.rows.get("v1:1").replayAvailability,"available");assert.equal(c.RecentReplays.rows.get("alice").matches.length,3);
 for(let i=1;i<=3;i++)await end(`v4:${i+3}`,"bob",`rival${i}`);
 assert.equal(c.Match.rows.get("v1:1").replayAvailability,"pruned");assert.equal(c.Frame.rows.has("v1:1:1"),false);assert.equal(c.Handicap.rows.has("v1:1:h"),false);assert.equal(c.Match.rows.get("v1:1").scoreA,7);
 const before=[...c.RecentReplays.rows.get("alice").matches];await end("v4:999","alice","bob",false);assert.deepEqual(c.RecentReplays.rows.get("alice").matches,before);
 // Simulate Envio restoring an earlier entity snapshot on reorg, then replay.
 const restored=fixture();await retainFinished(restored,{id:"v1:1",playerA:"alice",playerB:"bob",played:true,status:3},"001");assert.deepEqual(restored.RecentReplays.rows.get("alice").matches,["v1:1"]);
});
test("retention preserves financial entities and deterministic score summary decoding",()=>{
 const s={...initial(`0x${"01".repeat(32)}`,1),scoreA:7,scoreB:5};const encoded=encodeAbiParameters([{type:"tuple",components:stateComponents}],[s]);assert.deepEqual(snapshotScores(encoded),{scoreA:7,scoreB:5});assert.throws(()=>snapshotScores("0x00"));
});
