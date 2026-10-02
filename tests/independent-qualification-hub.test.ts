import test from 'node:test';
import assert from 'node:assert/strict';
import {independentQualificationHub} from '../shared/independent-qualification-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {LEGACY_HOSTED_HUB} from '../shared/hosted-control';
test('v3 human deployment requires explicit fresh qualification and preserves legacy selection',()=>{
 assert.equal(independentQualificationHub(14,undefined,false),LEGACY_HOSTED_HUB);
 assert.equal(independentQualificationHub(14,undefined,true),LEGACY_HOSTED_HUB);
 assert.equal(independentQualificationHub(14,'isolated-testnet',false),NO_LEASE_HUB);
 for(const rules of [4,12,13])assert.throws(()=>independentQualificationHub(rules,'isolated-testnet',false));
 assert.throws(()=>independentQualificationHub(14,'isolated-testnet',true));
 assert.throws(()=>independentQualificationHub(14,'true',false));
});
