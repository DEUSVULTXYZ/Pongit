import {test} from 'node:test';import assert from 'node:assert/strict';
import {qualificationRules} from '../scripts/chaos-qualification-record';
test('human qualification keeps old and corrected contracts in separate journals',()=>{
 assert.equal(qualificationRules('chaos-events-rules8-20260919'),8);
 assert.equal(qualificationRules('chaos-events-rules9-20260919'),9);
 for(const wrong of ['chaos-events-production-20260913','chaos-events-rules10-test','chaos-events-rules9-../secrets','rules9'])assert.throws(()=>qualificationRules(wrong));
});
