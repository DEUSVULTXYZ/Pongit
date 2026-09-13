import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {writeFile} from 'node:fs/promises';
import {roomsEventsHistory} from '../relayer/src/rooms-events-history';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {chaosLegacy} from '../shared/chaos-codec';
import {engineState} from '../shared/engine-stream';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'pongit-chaos-history');assert.equal(url.pathname,'/chaos_test');
const schema=`chaos_history_${Date.now()}`;
const db=new Pool({connectionString:url.href,options:`-c search_path=${schema}`}),app='0x1111111111111111111111111111111111111111',a='0x2222222222222222222222222222222222222222',b='0x3333333333333333333333333333333333333333';
await db.query(`CREATE SCHEMA ${schema}`);
const availability=new Map<string,string>();
await db.query('CREATE TABLE il_results(app text,id text,a text,b text,phase integer,verified boolean,published boolean,mode integer,score_a integer,score_b integer,ended_at timestamptz,PRIMARY KEY(app,id));CREATE TABLE financial_rights(id text PRIMARY KEY,amount bigint);INSERT INTO financial_rights VALUES(\'old-vault\',123);');
const h=await roomsEventsHistory(db,app,async(q,v)=>v.player?{RecentReplays:[{matches:['v4:1',ref(3),ref(4)]}]}:q.includes('rawId')?{Match:v.ids.map((id:string)=>({id,rawId:id.split(':').at(-1),deployment:id.startsWith('v4')?'v4':`10143:${app}`,mode:1,scoreA:7,scoreB:5,replayAvailability:'available'}))}:{Match:v.ids.flatMap((id:string)=>availability.has(id)?[{id,replayAvailability:availability.get(id)}]:[])});
h.stop();
const frame=(id:number,revision=1)=>{const p=initialChaosEvents(`0x${'01'.repeat(32)}`);p.t=30000000n;p.score={a:7,b:5,rally:12,finished:true,winner:0};return engineState([BigInt(id),BigInt(revision),3n,a,b,b,a,123n,p.t,0n,0n,0n,chaosLegacy(p),{physics:p,request:1n,pending:0n,collisions:[]}]);};
const ref=(id:number)=>`10143:${app}:1:${id}`;
try{
 for(let id=1;id<=4;id++){
  h.record(1n,frame(id));await h.flush();
  await db.query('INSERT INTO il_results VALUES($1,$2,$3,$4,3,true,false,1,7,5,now()+$5*interval \'1 second\')',[app,String(id),a,b,id]);
 }
 assert.equal((await h.replay(app,1n,1n,-1n)).availability,'awaiting-publication');
 await db.query('UPDATE il_results SET published=true');await h.retain();
 assert.equal((await db.query('SELECT COUNT(*) FROM il_replay_frames')).rows[0].count,'4','An indexer delay cannot delete frames');
 for(let id=1;id<=4;id++)availability.set(ref(id),id===1?'pruned':'available');await h.retain();
 assert.equal((await h.replay(app,1n,1n,-1n)).availability,'pruned');
 assert.equal((await h.replay(app,1n,2n,-1n)).frames.length,1);
 const recent=await h.recent(a);assert.equal(recent.length,3);assert.equal(recent[0].legacy,'v4');assert.equal(recent[1].ref,ref(3));
 h.record(1n,frame(1,2));await h.flush();assert.equal((await db.query("SELECT COUNT(*) FROM il_replay_frames WHERE id='1'")).rows[0].count,'0','A late observation cannot restore a retired replay');
 const next=frame(2,2);h.record(1n,next);await h.flush();assert.equal((await h.replay(app,1n,2n,1n)).frames.length,1,'Pagination is strictly after the cursor');
 h.record(1n,{...frame(2,1),reset:true});await h.flush();assert.equal((await h.replay(app,1n,2n,1n)).frames.length,0,'An explicit engine reset discards later revisions');
 await db.query("UPDATE il_results SET phase=2,published=false WHERE id='2'");assert.equal((await h.replay(app,1n,2n,-1n)).availability,'awaiting-publication');
 await db.query("UPDATE il_results SET phase=4,published=true WHERE id='2'");availability.set(ref(2),'not-played');await h.retain();assert.equal((await h.replay(app,1n,2n,-1n)).availability,'pruned','A cancellation without play does not retain frames indefinitely');
 assert.equal((await db.query('SELECT amount FROM financial_rights')).rows[0].amount,'123');assert.equal((await db.query('SELECT COUNT(*) FROM il_results')).rows[0].count,'4');
 const report={at:new Date().toISOString(),passed:true,scope:'Disposable PostgreSQL and mocked Envio retention response',scenarios:['delayed publication','delayed indexer','three retained records','tombstone after late snapshot','strict cursor','engine reset','corrected result','unplayed cancellation','financial preservation']};
 await writeFile('artifacts/drand/history-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{h.stop();await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
