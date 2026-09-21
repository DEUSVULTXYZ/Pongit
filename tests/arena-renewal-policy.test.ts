import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {arenaRenewalExclusions} from '../shared/arena-renewal-policy';
const pool=toHex(1,{size:20}),apps=[2,3,4].map(n=>toHex(n,{size:20}));
const policy={pool,arenas:[apps[1]],reason:'Release an owned idle slot for a replacement qualification',requestedAt:'2026-09-21T15:35:00Z'};
test('renewal exclusions are scoped to the exact pool and known owned arenas',()=>{
 const excluded=arenaRenewalExclusions(policy,pool,apps);assert.deepEqual([...excluded],[apps[1]]);
 assert.equal(excluded.has(apps[0]),false);assert.equal(excluded.has(apps[2]),false);
 for(const change of [{pool:apps[0]},{arenas:[toHex(999,{size:20})]},{arenas:[apps[1],apps[1]]},{arenas:[]},{reason:''},{requestedAt:'tomorrow'},{requestedAt:'2026-09-21T17:35:00+02:00'}])
  assert.throws(()=>arenaRenewalExclusions({...policy,...change},pool,apps));
 assert.throws(()=>arenaRenewalExclusions(undefined,pool,apps));
});
