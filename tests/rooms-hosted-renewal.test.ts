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
test("lost POST and repeated 404 escalates without duplicate creation",async()=>{
  const db=journal(),calls:string[]=[];
  const transport=(async(_:any,o:any)=>{calls.push(o.method);if(o.method==="POST")throw Error("lost");return Response.json({}, {status:404});}) as typeof fetch;
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,1000),/response lost/);
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,12000),/404/);
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,302000),/inspection required/);
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,400000),/ambiguous/);
  assert.deepEqual(calls,["POST","GET","GET"]);
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
test("different endpoint is never silently adopted",async()=>{
  await assert.rejects(requestHostedRenewal(journal(),app,2n,url,(async()=>Response.json({url:"https://another.example"})) as typeof fetch),/URL changed/);
});

test("a live control record cannot hide an unavailable epoch indefinitely",async()=>{
  const db=journal(),calls:string[]=[];
  const transport=(async(_:any,o:any)=>{calls.push(o.method);return Response.json({app,url,status:'live'});}) as typeof fetch;
  await requestHostedRenewal(db,app,2n,url,transport,1000);
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,302000),/new engine epoch is still unavailable/);
  await assert.rejects(requestHostedRenewal(db,app,2n,url,transport,400000),/inspection|ambiguous/);
  assert.deepEqual(calls,['POST','GET']);
});

test("an unrelated application in a lookup is rejected",async()=>{
  await assert.rejects(requestHostedRenewal(journal(),app,2n,url,(async()=>Response.json({app:'0x22',url})) as typeof fetch),/another application/);
});
