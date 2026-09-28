import test from 'node:test';
import assert from 'node:assert/strict';
import {localTournamentCursor,ratingContinuationWork} from '../shared/agent-continuation';
const ratings='0x1111111111111111111111111111111111111111',prior='0x2222222222222222222222222222222222222222';
test('new keeper never routes inherited tournament fixtures into the replacement pool',()=>{
 assert.equal(localTournamentCursor(8n,8n,{id:1n,index:2}),null);
 assert.deepEqual(localTournamentCursor(9n,8n,{id:8n,index:2}),{id:9n,index:0});
 assert.deepEqual(localTournamentCursor(10n,8n,{id:9n,index:2}),{id:9n,index:2});
 assert.throws(()=>localTournamentCursor(7n,8n));
});
test('ratings history resumes interrupted correction without inventing unchanged state',async()=>{
 const values:any={predecessor:prior,revision:8n,sourceRevision:8n,synchronizationCursor:0n};
 const read=async(_a:any,_abi:any,method:string)=>values[method];
 assert.equal(await ratingContinuationWork(read,ratings,prior,[]),null);
 assert.equal((await ratingContinuationWork(read,ratings,prior,[],true))?.method,'synchronizeHistory');
 values.revision=9n;assert.equal((await ratingContinuationWork(read,ratings,prior,[]))?.method,'synchronizeHistory');
 values.revision=8n;values.synchronizationCursor=1n;assert((await ratingContinuationWork(read,ratings,prior,[])));
 await assert.rejects(ratingContinuationWork(async()=>{throw Error('offline');},ratings,prior,[]),/offline/);
 values.predecessor=ratings;await assert.rejects(ratingContinuationWork(read,ratings,prior,[]),/mismatch/);
});
