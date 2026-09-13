import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoomsPublicationHealth} from '../relayer/src/rooms-publication-health';
import {EnginePublicationUnavailable,publicationFailureDetails} from '../shared/service-error';

const failure={cause:{details:'this session is over and the node is no longer accepting transactions: batch 29 could not be settled (commit relay failed: 413 Payload Too Large: {"error":"body too large"})'}};
function database(){
 let row:any=null;
 return {query:async(sql:string,args?:any[])=>{
  if(sql.startsWith('SELECT'))return {rows:row?[{incident:structuredClone(row)}]:[]};
  if(sql.startsWith('INSERT'))row=structuredClone(args![1]);
  if(sql.startsWith('DELETE')&&JSON.stringify(row)===JSON.stringify(args![1]))row=null;
  return {rows:[]};
 }};
}
test('publication failure survives healthy reads and coordinator restart until both layers publish the failed batch',async()=>{
 const db=database() as any;let now=1000;
 let health=await createRoomsPublicationHealth(db,'app',()=>now);
 await health.fail(new EnginePublicationUnavailable(failure),1,28);
 assert.deepEqual(health.status(),{epoch:'1',batch:'29',reason:'payload_too_large',relayStatus:413,failedAt:1000});
 now=60000;health=await createRoomsPublicationHealth(db,'app',()=>now);
 assert(health.status(),'restarting a process cannot repair a publication');
 assert.equal(await health.observe({epoch:1,committedBatches:28},{epoch:1n,batchIndex:28n}),false);
 assert.equal(await health.observe({epoch:1,committedBatches:29},{epoch:1n,batchIndex:28n}),false);
 assert.equal(await health.observe({epoch:1,committedBatches:28},{epoch:1n,batchIndex:29n}),false);
 assert.equal(await health.observe({epoch:1,committedBatches:29},{epoch:1n,batchIndex:29n}),true);
 assert.equal((await createRoomsPublicationHealth(db,'app',()=>now)).status(),null);
});
test('only one immutable-command retry is admitted per thirty seconds; cooldown errors preserve cause',async()=>{
 const db=database() as any;let now=1000;const health=await createRoomsPublicationHealth(db,'app',()=>now);
 await health.fail(failure,1,28);assert.equal(health.claimRetry(),false);
 now=31000;assert.equal(health.claimRetry(),true);assert.equal(health.claimRetry(),false);
 await health.fail(new EnginePublicationUnavailable(),1,28);
 assert.equal(health.status()!.reason,'payload_too_large');assert.equal(health.status()!.failedAt,1000);
 now=61000;assert.equal(health.claimRetry(),true);
});
test('an older or mismatched epoch does not erase the incident',async()=>{
 const health=await createRoomsPublicationHealth(database() as any,'app');await health.fail(failure,2,28);
 assert.equal(await health.observe({epoch:1,committedBatches:99},{epoch:1n,batchIndex:99n}),false);
 assert.equal(await health.observe({epoch:3,committedBatches:0},{epoch:2n,batchIndex:29n}),false);
 assert.equal(await health.observe({epoch:3,committedBatches:1},{epoch:3n,batchIndex:0n}),false);
 assert.equal(await health.observe({epoch:3,committedBatches:0},{epoch:3n,batchIndex:0n}),true);
});
test('diagnostics never include signed bytes, request bodies or authentication details',()=>{
 const secrets='Bearer secret; '+`0x${'ab'.repeat(200)}`;
 const diagnostic=publicationFailureDetails({message:'batch 7 could not be settled (commit relay failed: 401 Unauthorized: '+secrets+')'});
 assert.deepEqual(diagnostic,{batch:'7',relayStatus:401,reason:'relay_authentication'});
 assert(!JSON.stringify(diagnostic).includes(secrets));
});
