import test from "node:test";
import assert from "node:assert/strict";
import { requestHostedRenewal } from "../relayer/src/rooms-hosted-renewal";
const app="0x0000000000000000000000000000000000000011",url="https://test-engine.example";
function journal(){const row={provision_epoch:"0",provisioning:null as any};return {query:async(sql:string,args:any[])=>{
  if(sql.startsWith("SELECT"))return {rows:[{...row}]};row.provision_epoch=args[1];row.provisioning=structuredClone(args[2]);return {rowCount:1};
}} as any;}
test("confirmed creation is looked up; only a new epoch creates again",async()=>{
  const db=journal(),calls:string[]=[];
  const transport=(async(_:any,o:any)=>{calls.push(o.method);return Response.json({url});}) as typeof fetch;
  await requestHostedRenewal(db,app,2n,url,transport,1000);
  await requestHostedRenewal(db,app,2n,url,transport,12000);
  await requestHostedRenewal(db,app,3n,url,transport,23000);
  assert.deepEqual(calls,["POST","GET","POST"]);
});
test("lost POST and repeated 404 keep being looked up, alert once and never create twice",async()=>{
  const db=journal(),calls:string[]=[],warned:string[]=[],original=console.warn;console.warn=(line:unknown)=>{warned.push(String(line));};
  try{
    let served=false;
    const transport=(async(_:any,o:any)=>{calls.push(o.method);if(o.method==="POST")throw Error("lost");return served?Response.json({url}):Response.json({}, {status:404});}) as typeof fetch;
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,1000),/response lost/);
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,12000),/404/);
    // Past five minutes the renewal is flagged for operators and keeps looking up.
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,302000),/404/);
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,400000),/404/);
    assert.equal(warned.filter(w=>w.includes("hosted-provisioning-stalled")).length,1);
    // Control finally reports the session the lost POST created. It is found by
    // lookup; the engine itself then proves availability to the lifecycle observer.
    served=true;await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,500000),/still checking/);
    assert.deepEqual(calls,["POST","GET","GET","GET","GET"]);
  }finally{console.warn=original;}
});
test("explicit non-creation retries with backoff; unqualified 503 does not",async()=>{
  for(const [status,body,expected] of [[429,{created:false},"POST"],[503,{},"GET"]] as const){
    const db=journal(),calls:string[]=[];
    const transport=(async(_:any,o:any)=>{calls.push(o.method);return calls.length===1?Response.json(body,{status}):Response.json({url});}) as typeof fetch;
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,1000));
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,2000),/cooling down/);
    await requestHostedRenewal(db,app,2n,url,transport,12000);
    assert.deepEqual(calls,["POST",expected]);
  }
});
test("different endpoint is never silently adopted and stays terminal",async()=>{
  const db=journal();
  await assert.rejects(requestHostedRenewal(db,app,2n,url,(async()=>Response.json({url:"https://another.example"})) as typeof fetch),/URL changed/);
  let calls=0;
  await assert.rejects(requestHostedRenewal(db,app,2n,url,(async()=>{calls++;return Response.json({url});}) as typeof fetch,5000),/identity changed/);
  assert.equal(calls,0);
});

test("an intervention from an older release without a reason resumes safe lookups",async()=>{
  const db=journal(),calls:string[]=[];
  await db.query("UPDATE",[app,"2",{epoch:"2",state:"intervention",attemptedAt:1000,retryAt:0,attempts:1}]);
  const original=console.warn;console.warn=()=>{};
  try{
    // The session is found; its engine is still being validated, which is not terminal.
    await assert.rejects(requestHostedRenewal(db,app,2n,url,(async(_:any,o:any)=>{calls.push(o.method);return Response.json({url});}) as typeof fetch,900000),/still checking/);
  }finally{console.warn=original;}
  assert.deepEqual(calls,["GET"],"resumed by lookup, never by a new creation");
});

test("a live control record cannot hide an unavailable epoch indefinitely",async()=>{
  const db=journal(),calls:string[]=[];
  const transport=(async(_:any,o:any)=>{calls.push(o.method);return Response.json({app,url,status:'live'});}) as typeof fetch;
  await requestHostedRenewal(db,app,2n,url,transport,1000);
  const original=console.warn;console.warn=()=>{};
  try{
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,302000),/new engine epoch is still unavailable/);
    // A slow engine keeps being checked instead of freezing the arena.
    await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,400000),/new engine epoch is still unavailable/);
  }finally{console.warn=original;}
  assert.deepEqual(calls,['POST','GET','GET']);
});

test("an unrelated application in a lookup is rejected",async()=>{
  await assert.rejects(requestHostedRenewal(journal(),app,2n,url,(async()=>Response.json({app:'0x22',url})) as typeof fetch),/another application/);
});
