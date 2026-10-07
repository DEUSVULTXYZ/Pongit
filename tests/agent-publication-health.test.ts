import test from 'node:test';
import assert from 'node:assert/strict';
import {agentPublicationHealth,agentTickInterval,agentTickPause,agentRecoveryPause} from '../shared/agent-publication-health';
import {publicationFailureDetails} from '../shared/service-error';
const app='0x7fb78a8fbfd597daadbe6971c106720eb1510d7d';
const health={app,epoch:2,ok:false,committedBatches:3599,
 halted:'batch 3600 could not be settled (commit relay failed: 429 Too Many Requests: {"error":"too many commits this hour"})'};
test('the control-plane hourly gas budget is neither wallet insolvency nor RPC traffic',()=>{
 const value=agentPublicationHealth({...health,committedBatches:189,
  halted:'batch 190 could not be settled (commit relay failed: 429 Too Many Requests: {"error":"the control plane has spent its gas budget for this hour. try again later","retryAfterMs":548382,"token":"never-copy"})'},app,2n);
 assert.equal(value.reason,'hourly_publication_gas_budget');assert.equal(value.relayStatus,429);
 assert.equal(value.batch,'190');assert.equal(value.healthy,false);
 assert(!JSON.stringify(value).includes('never-copy'));assert(!('retryAt' in value));
 // A relative retry embedded in an old halt must not slide a deadline forward
 // on every health read. Only new matching healthy evidence resumes commands.
 assert.equal(agentPublicationHealth({...health,ok:true,halted:null},app,2n).healthy,true);
});
test('hourly publications are diagnosed separately from generic RPC throttling',()=>{
 const p=agentPublicationHealth({...health,privateToken:'never-copy',pendingDiffs:['do-not-copy']},app,2n);
 assert.equal(p.healthy,false);assert.equal(p.batch,'3600');assert.equal(p.relayStatus,429);assert.equal(p.reason,'hourly_commit_limit');
 assert(!JSON.stringify(p).includes('never-copy'));assert(!JSON.stringify(p).includes('pendingDiffs'));
 assert.equal(publicationFailureDetails(new Error('commit relay failed: 429 Too Many Requests')).reason,'publication_rate_limit');
});
test('only matching explicitly healthy hosted epochs clear publication holds',()=>{
 assert.equal(agentPublicationHealth({...health,ok:true},app,2n).healthy,false);
 assert.equal(agentPublicationHealth({...health,halted:null},app,2n).healthy,false);
 assert.equal(agentPublicationHealth({...health,ok:true,halted:null,committedBatches:3601},app,2n).healthy,true);
 assert.equal(agentPublicationHealth({...health,ok:true,halted:true},app,2n).healthy,false);
 for(const change of [{app:'0xwrong'},{epoch:3},{ok:undefined},{committedBatches:-1},{committedBatches:'3599'}])
  assert.throws(()=>agentPublicationHealth({...health,...change},app,2n));
});

test('a thirty-second write hold does not delay recovery health; RPC Retry-After still applies',()=>{
 assert.equal(agentRecoveryPause(true,0,31000,1000),2000);
 assert.equal(agentRecoveryPause(true,9000,31000,1000),9000);
 assert.equal(agentRecoveryPause(false,0,31000,1000),30000);
 assert.equal(agentRecoveryPause(false,0,0,1000),1000);
});
test('tick comparison is explicit and bounded without changing the normal cadence',()=>{
 assert.equal(agentTickInterval(),300);assert.equal(agentTickInterval('1500'),1500);
 assert.equal(agentTickInterval('150'),150);assert.equal(agentTickInterval('100'),100);
 for(const n of ['0','99','5001','NaN','301.5'])assert.throws(()=>agentTickInterval(n));
});

test('responsive ticks spend the remaining 50ms budget and reject a stale deployment override',()=>{
 assert.equal(agentTickInterval(undefined,17),50);assert.equal(agentTickInterval('50',17),50);
 for(const interval of ['0','49','51','100','300'])assert.throws(()=>agentTickInterval(interval,17));
 for(const elapsed of [0,10,30,40,49])assert.equal(elapsed+agentTickPause(50,elapsed),50);
 assert.equal(agentTickPause(50,90),1,'An overdue round yields instead of catching up in bursts');
 assert.equal(agentTickPause(50,90,true),100,'An outstanding command still owns the lane');
});

test('serial ticks spend only the remaining interval after the receipt and journal',()=>{
 const starts:number[]=[];let now=0,lastProgress=-150;
 for(let i=0;i<30;i++){
  if(now-lastProgress>=150){starts.push(now);lastProgress=now;now+=130;}
  now+=agentTickPause(150,now-lastProgress);
 }
 assert.equal(starts.length,30);
 assert(starts.slice(1).every((t,i)=>t-starts[i]===150));
 // With the former fixed 100 ms sleep each serial round took 230 ms.
 assert.equal(agentTickPause(150,130),20);
});

test('new player progress postpones a tick and a slow iteration cannot cause catch-up bursts',()=>{
 let now=125,lastProgress=120,ticks=0;
 while(now<270){
  assert(now-lastProgress<150);
  now+=agentTickPause(150,now-lastProgress);
 }
 assert.equal(now,270);
 if(now-lastProgress>=150){ticks++;lastProgress=now;now+=500;}
 assert.equal(ticks,1);assert.equal(agentTickPause(150,now-lastProgress),20);
 assert.equal(agentTickPause(100,130),20); // Serial work sets the real achievable cadence.
 assert.equal(agentTickPause(150,-100),100); // A backwards wall-clock change does not spin.
});

test('proofs and an occupied command journal retain the bounded wait',()=>{
 assert.equal(agentTickPause(100,1000,true),100);
 assert.equal(agentTickPause(150,140,true),100);
});

test('an unfunded publisher is distinguished from RPC throttling without copying relay contents',()=>{
 const value=agentPublicationHealth({...health,halted:'batch 915 could not be settled (commit relay failed: 502 Bad Gateway: Signer had insufficient balance)'},app,2n);
 assert.equal(value.reason,'publisher_unfunded');assert.equal(value.relayStatus,502);assert.equal(value.batch,'915');
 assert.equal(value.healthy,false);assert(!JSON.stringify(value).includes('Signer had'));
});

test('rejected relay tokens are not classified as RPC traffic or commit quota',()=>{
 const value=agentPublicationHealth({...health,committedBatches:0,halted:'batch 1 could not be settled (commit relay failed: 429 Too Many Requests: {"error":"too many rejected tokens from you this hour"})'},app,2n);
 assert.equal(value.reason,'relay_authentication_throttled');assert.equal(value.relayStatus,429);
 assert.equal(value.healthy,false);assert.equal(value.batch,'1');
 assert(!JSON.stringify(value).includes('rejected tokens from you'));
 assert.equal(publicationFailureDetails(new Error('commit relay failed: 401 Unauthorized: missing or wrong bearer token')).reason,'relay_authentication');
});
