import test from 'node:test';
import assert from 'node:assert/strict';
import {localTournamentCursor,ratingContinuationWork,ratingFinalityPage} from '../shared/agent-continuation';
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
 values.revision=9n;assert.equal((await ratingContinuationWork(read,ratings,prior,[]))?.method,'synchronizeHistory');
 values.revision=8n;values.synchronizationCursor=1n;assert((await ratingContinuationWork(read,ratings,prior,[])));
 await assert.rejects(ratingContinuationWork(async()=>{throw Error('offline');},ratings,prior,[]),/offline/);
 values.predecessor=ratings;await assert.rejects(ratingContinuationWork(read,ratings,prior,[]),/mismatch/);
});

function history(size:number){
 const entries=Array.from({length:size},(_,i)=>({first:{id:BigInt(i+1),arena:prior,epoch:1n},finality:true}));
 const ours=structuredClone(entries),calls:{method:string;args:readonly any[]}[]=[];
 const read=async(address:any,_abi:any,method:string,args:readonly any[]=[])=>{
  calls.push({method,args});
  if(method==='sourceCount'||method==='count')return BigInt(size);
  if(method==='resultPage')return[[...entries].reverse().slice(Number(args[0]),Number(args[0]+args[1])),BigInt(size)];
  if(method==='entry'&&address===ratings)return ours.find(e=>e.first.id===args[0]);
  throw Error('Unexpected finality read');
 };
 return{entries,ours,calls,read};
}
test('unchanged historical finality is read-only and scans bounded pages through wraparound',async()=>{
 const h=history(70);
 assert.deepEqual(await ratingFinalityPage(h.read,ratings,prior,[]),{changed:false,next:32n});
 assert.equal(h.calls.filter(c=>c.method==='entry').length,32);
 assert.deepEqual(await ratingFinalityPage(h.read,ratings,prior,[],32n),{changed:false,next:64n});
 assert.deepEqual(await ratingFinalityPage(h.read,ratings,prior,[],64n),{changed:false,next:0n});
 // A later source finalization is noticed on a future pass without a revision.
 h.ours[69].finality=false;
 assert.deepEqual(await ratingFinalityPage(h.read,ratings,prior,[]),{changed:true,next:32n});
});
test('empty history needs no transaction and an invalid persisted offset resumes safely',async()=>{
 assert.deepEqual(await ratingFinalityPage(history(0).read,ratings,prior,[]),{changed:false,next:0n});
 assert.deepEqual(await ratingFinalityPage(history(3).read,ratings,prior,[],100n),{changed:false,next:0n});
});
test('nonfinal source history does not request synchronization until finality advances',async()=>{
 const h=history(2);h.entries[0].finality=false;h.ours[0].finality=false;
 assert.equal((await ratingFinalityPage(h.read,ratings,prior,[])).changed,false);
 h.entries[0].finality=true;
 assert.equal((await ratingFinalityPage(h.read,ratings,prior,[])).changed,true);
});
test('failed, incomplete, changed or misbound historical reads never become unchanged verdicts',async()=>{
 const h=history(2);
 await assert.rejects(ratingFinalityPage(async(...args)=>{
  if(args[2]==='entry')throw Error('RPC offline');return h.read(...args);
 },ratings,prior,[]),/RPC offline/);
 await assert.rejects(ratingFinalityPage(async(...args)=>args[2]==='count'?3n:h.read(...args),ratings,prior,[]),/history changed/);
 await assert.rejects(ratingFinalityPage(async(...args)=>args[2]==='resultPage'?[[],2n]:h.read(...args),ratings,prior,[]),/Incomplete/);
 h.ours[0].first.epoch=2n;
 await assert.rejects(ratingFinalityPage(h.read,ratings,prior,[]),/identity mismatch/);
});
