import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaOutage,quietRetry} from '../relayer/src/independent-service-policy';
import {streamRetryMs} from '../shared/engine-stream';
import {requestHostedRenewal} from '../relayer/src/rooms-hosted-renewal';
import {provisionPoolArena} from '../relayer/src/agents/pool-hosted';

test('an outage means every pooled arena is offline, never a busy or partly healthy pool',()=>{
 assert.equal(arenaOutage(true,[{online:false},{online:false},{online:false}]),true);
 assert.equal(arenaOutage(true,[{online:false},{online:true},{online:false}]),false,'one arena still serves');
 assert.equal(arenaOutage(false,[{online:false}]),false,'legacy single arenas keep their own rules');
 assert.equal(arenaOutage(true,[]),false);
});

test('only the cooldown itself is kept out of the retry log',()=>{
 assert.equal(quietRetry('Hosted engine retry is cooling down'),true);
 assert.equal(quietRetry('Hosted session exists but the new engine epoch is still unavailable; still checking'),false);
});

test('a dropped engine stream reconnects within two seconds, like the Interlude SDK',()=>{
 assert.deepEqual([0,1,2,3,4,9].map(streamRetryMs),[250,500,1000,2000,2000,2000]);
});

test('a new hosted session is always requested in the arenas home region',async()=>{
 const bodies:any[]=[];
 const row={provision_epoch:'0',provisioning:null as any};
 const db={query:async(sql:string,args:any[])=>{if(sql.startsWith('SELECT'))return {rows:[{...row}]};row.provision_epoch=args[1];row.provisioning=structuredClone(args[2]);return {rowCount:1};}} as any;
 const url='https://test-engine.example';
 await requestHostedRenewal(db,'0x0000000000000000000000000000000000000011',2n,url,(async(_:any,o:any)=>{bodies.push(o.body&&JSON.parse(o.body));return Response.json({url});}) as typeof fetch,1000);
 const lock={rows:[{ok:true}]},pool:any={provision_epoch:null,provisioning:null};
 const agents:any={connect:async()=>({release(){},query:async(sql:string,a:any[]=[])=>{
  if(sql.includes('pg_try_advisory_lock'))return lock;if(sql.startsWith('SELECT'))return{rows:[pool]};
  if(sql.startsWith('UPDATE')){pool.provision_epoch=a[1];pool.provisioning=structuredClone(a[2]);}return{rows:[]};}})};
 await provisionPoolArena(agents,'0x0000000000000000000000000000000000000012',1n,undefined,(async(_:any,o:any)=>{bodies.push(o.body&&JSON.parse(o.body));return Response.json({url});}) as typeof fetch);
 assert.deepEqual(bodies,[{app:'0x0000000000000000000000000000000000000011',region:'eu'},{app:'0x0000000000000000000000000000000000000012',region:'eu'}]);
});
