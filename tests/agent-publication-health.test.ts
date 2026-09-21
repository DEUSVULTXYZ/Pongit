import test from 'node:test';
import assert from 'node:assert/strict';
import {agentPublicationHealth,agentTickInterval} from '../shared/agent-publication-health';
import {publicationFailureDetails} from '../shared/service-error';
const app='0x7fb78a8fbfd597daadbe6971c106720eb1510d7d';
const health={app,epoch:2,ok:false,committedBatches:3599,
 halted:'batch 3600 could not be settled (commit relay failed: 429 Too Many Requests: {"error":"too many commits this hour"})'};
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
 for(const change of [{app:'0xwrong'},{epoch:3},{ok:undefined},{committedBatches:-1},{committedBatches:'3599'}])
  assert.throws(()=>agentPublicationHealth({...health,...change},app,2n));
});
test('tick comparison is explicit and bounded without changing the normal cadence',()=>{
 assert.equal(agentTickInterval(),300);assert.equal(agentTickInterval('1500'),1500);
 for(const n of ['0','299','5001','NaN','301.5'])assert.throws(()=>agentTickInterval(n));
});
