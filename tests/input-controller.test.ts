import test from "node:test";
import assert from "node:assert/strict";
import { InputController } from "../web/lib/input-controller";
import { predictPaddle, boundedClock } from "../web/lib/presentation";
import {sharesInputEstimate} from "../relayer/src/inputs";
import {transitionGas} from "../relayer/src/transition-gas";
const turn=()=>new Promise<void>(r=>setImmediate(r));
test("an estimate can follow the latest direction only within the same nonce and gameplay scope",()=>{
 const before={deployment:"v4",contract:"game",functionName:"submitInput",value:"0",args:[{matchId:"1",player:"0xabc",nonce:"2",direction:0,observedBlock:"100",validUntilBlock:"116"},"sig"]};
 const latest={...before,args:[{...before.args[0] as any,direction:1,observedBlock:"101",validUntilBlock:"117"},"newSig"]};
 assert(sharesInputEstimate(before,latest,101n));
 for(const changed of [{...latest,value:"1"},{...latest,contract:"vault"},{...latest,deployment:"v3"},{...latest,args:[{...latest.args[0] as any,nonce:"3"},"sig"]},{...latest,args:[{...latest.args[0] as any,validUntilBlock:"99"},"sig"]}])assert.equal(sharesInputEstimate(before,changed,101n),false);
 assert(transitionGas("submitInput",100000n)>=140000n);
});
test("stop and reversal reach the server while the first receipt is unresolved; only ACK gates sending",async()=>{
  const sent:any[]=[];const receipts=new Map<string,(v:any)=>void>();let seq=0n;
  const c=new InputController({state:async()=>({nextNonce:1,nextSequence:1}),post:async(body:any)=>{sent.push(body);return {accepted:true,id:String(++seq),nextNonce:seq===1n?2:2,nextSequence:seq+1n};},wait:id=>new Promise(r=>receipts.set(id,r)),pending:()=>{},ack:()=>{},confirmed:()=>{},error:message=>assert.fail(message)});
  const ctx={key:"game:player:key",direction:1,head:200n,sign:async(nonce:bigint,sequence:bigint,direction:number)=>({nonce,sequence,direction})};
  c.update(ctx);await turn();c.update({...ctx,direction:0});await turn();c.update({...ctx,direction:-1});await turn();
  assert.deepEqual(sent.map(s=>s.direction),[1,0,-1]);assert.deepEqual(sent.map(s=>s.nonce),[1n,2n,2n]);
  assert.equal(receipts.size,3);receipts.get("2")!({status:"superseded"});receipts.get("1")!({status:"succeeded"});receipts.get("3")!({status:"succeeded"});await turn();c.reset();
});
test("server nonce races are re-signed, old account responses are discarded",async()=>{
  const sent:any[]=[];let accept=false,signs=0,confirmed=0;
  const c=new InputController({state:async()=>({nextNonce:1,nextSequence:1}),post:async(body:any)=>{sent.push(body);return {accepted:accept,id:"job",nextNonce:2,nextSequence:3};},wait:async()=>({status:"succeeded"}),pending:()=>{},ack:()=>{},confirmed:()=>confirmed++,error:assert.fail});
  const context={key:"one",direction:1,head:10n,sign:async(nonce:bigint,sequence:bigint,direction:number)=>{signs++;return {nonce,sequence,direction};}};
  c.update(context);await turn();accept=true;c.update(context);await turn();assert.equal(sent[1].nonce,2n);assert.equal(signs,2);assert.equal(confirmed,1);
  c.reset();c.update({...context,key:"two",sign:async()=>{c.reset();return {};}});await turn();assert.equal(sent.length,2);
});
test("reconstruction applies only unconfirmed latest intentions and freezes old snapshots",()=>{
  const inputs=[{nonce:1n,direction:1,at:100000n},{nonce:2n,direction:1,at:200000n},{nonce:2n,direction:0,at:300000n}];
  assert.equal(predictPaddle(288,0,48,0n,600000n,0n,inputs),324);
  assert.equal(predictPaddle(324,0,48,300000n,600000n,2n,inputs),324);
  assert.equal(predictPaddle(80,-1,36,0n,600000n,0n,[]),36);
  assert.equal(boundedClock(1000000n,100,50000).target,1600000n);
  assert.equal(boundedClock(1000000n,100,50000).stale,true);
});
