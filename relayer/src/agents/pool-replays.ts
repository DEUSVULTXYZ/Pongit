import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import type {Pool,PoolClient} from 'pg';
import {isAddress} from 'viem';
import type {AgentMatchRef} from '../../../shared/agents';
import type {PoolMatchView} from '../../../shared/agent-pool';
import type {EngineState} from '../../../shared/engine-stream';

const json=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
const MAX_FRAMES=4000,MAX_BYTES=16_000_000,MAX_STORAGE=256_000_000;
export function poolReplayKey(ref:AgentMatchRef){
 if(ref.chainId!==10143||!isAddress(ref.app)||!/^\d{1,78}$/.test(ref.id)||!/^\d{1,78}$/.test(ref.epoch)||BigInt(ref.id)<1n||BigInt(ref.epoch)<1n)throw Error('Invalid replay reference');
 return `10143:${ref.app.toLowerCase()}:${BigInt(ref.epoch)}:${BigInt(ref.id)}`;
}
export type RetentionRecord={id:string;playerA:string;playerB:string;scoreA:number;scoreB:number;status:number;replayAvailability:string};
export type PoolReplayRetention=(ids:string[])=>Promise<RetentionRecord[]>;
export async function initializePoolReplays(db:Pool){await db.query(`
 CREATE SCHEMA IF NOT EXISTS agent_pool;
 CREATE TABLE IF NOT EXISTS agent_pool.replays(
  ref text PRIMARY KEY,app text NOT NULL,epoch numeric(78,0) NOT NULL,match_id numeric(78,0) NOT NULL,
  rules smallint NOT NULL,availability text NOT NULL DEFAULT 'recording',incomplete boolean NOT NULL DEFAULT false,
  last_revision numeric(78,0),first_time numeric(78,0),last_time numeric(78,0),terminal jsonb,
  result_hash text,frame_count integer NOT NULL DEFAULT 0,byte_count integer NOT NULL DEFAULT 0,packed bytea,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS agent_pool.replay_frames(
  ref text NOT NULL REFERENCES agent_pool.replays(ref),revision numeric(78,0) NOT NULL,time_us numeric(78,0) NOT NULL,
  frame jsonb NOT NULL,PRIMARY KEY(ref,revision));
 `);}

/** Accepted engine snapshots, never an authority for scores. Every public read
 * checks the published contract result and the shared rollback-aware index.
 * Slow replay I/O cannot hold up controls; bounded queue loss is explicitly partial. */
export class PoolReplays {
 private pending:{ref:AgentMatchRef;rules:number;s:EngineState;frame:string}[]=[];
 private writing?:Promise<void>;private gaps=new Set<string>();
 private scanAfter='';
 private last=new Map<string,{revision:bigint;time:bigint;phase:number;score:string}>();
 constructor(private db:Pool,private retention?:PoolReplayRetention,private onError=()=>console.error(JSON.stringify({service:'pool-replays',error:'Replay recording incomplete'}))){}
 async resumeRecorder(){
  // After a crash, an unobserved interval cannot be called a complete replay.
  await this.db.query("UPDATE agent_pool.replays SET incomplete=true WHERE availability='recording' AND last_revision IS NOT NULL");
 }
 capture(ref:AgentMatchRef,rules:10|11,s:EngineState){
  const key=poolReplayKey(ref);if(s.id!==BigInt(ref.id)||s.phase<2||s.phase>4)return;
  const prior=this.last.get(key),score=`${s.state.scoreA}:${s.state.scoreB}`;
  if(!s.reset&&prior&&(s.revision<=prior.revision||s.phase===prior.phase&&score===prior.score&&s.state.t-prior.time<100000n))return;
  this.last.set(key,{revision:s.revision,time:s.state.t,phase:s.phase,score});
  const frame=json({version:1,...s});
  if(frame.length>65536){this.gaps.add(key);return;}
  if(this.pending.length>=64){const dropped=this.pending.shift()!;this.gaps.add(poolReplayKey(dropped.ref));}
  this.pending.push({ref,rules,s:structuredClone(s),frame});this.drain();
 }
 private drain(){
  if(this.writing)return;
  this.writing=(async()=>{while(this.pending.length){const x=this.pending.shift()!,key=poolReplayKey(x.ref);let c:PoolClient|undefined;
   try{
    c=await this.db.connect();
    await c.query('BEGIN');
    if(!(await c.query('SELECT 1 FROM agent_pool.replays WHERE ref=$1',[key])).rowCount){
     await c.query('SELECT pg_advisory_xact_lock(701359)');
     // Reserve the full per-match budget for in-progress recordings. Index
     // outages preserve retained history but cannot fill the VPS indefinitely.
     const used=(await c.query("SELECT COALESCE(sum(CASE WHEN availability='recording' THEN $1::bigint ELSE COALESCE(octet_length(packed),0) END),0)::text bytes FROM agent_pool.replays",[MAX_BYTES])).rows[0];
     if(BigInt(used.bytes)+BigInt(MAX_BYTES)>BigInt(MAX_STORAGE)){
      await c.query("INSERT INTO agent_pool.replays(ref,app,epoch,match_id,rules,availability,incomplete) VALUES($1,$2,$3,$4,$5,'unavailable',true) ON CONFLICT DO NOTHING",[key,x.ref.app.toLowerCase(),x.ref.epoch,x.ref.id,x.rules]);
      await c.query('COMMIT');continue;
     }
    }
    await c.query('INSERT INTO agent_pool.replays(ref,app,epoch,match_id,rules) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
     [key,x.ref.app.toLowerCase(),x.ref.epoch,x.ref.id,x.rules]);
    let row=(await c.query('SELECT * FROM agent_pool.replays WHERE ref=$1 FOR UPDATE',[key])).rows[0];
    if(row.availability!=='recording'){await c.query('COMMIT');continue;}
    if(x.s.reset){
     await c.query('DELETE FROM agent_pool.replay_frames WHERE ref=$1 AND (revision>=$2 OR time_us>=$3)',[key,String(x.s.revision),String(x.s.state.t)]);
     const count=(await c.query('SELECT count(*)::int n,COALESCE(sum(octet_length(frame::text)),0)::int bytes FROM agent_pool.replay_frames WHERE ref=$1',[key])).rows[0];
     row={...row,last_revision:null,frame_count:count.n,byte_count:count.bytes};
    }
    if(row.last_revision!==null&&BigInt(row.last_revision)>=x.s.revision){await c.query('COMMIT');continue;}
    const fits=row.frame_count<MAX_FRAMES&&row.byte_count+x.frame.length<=MAX_BYTES;
    if(fits)await c.query('INSERT INTO agent_pool.replay_frames(ref,revision,time_us,frame) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
     [key,String(x.s.revision),String(x.s.state.t),x.frame]);
    await c.query(`UPDATE agent_pool.replays SET last_revision=$2,first_time=COALESCE(first_time,$3),last_time=$3,
     terminal=$4,frame_count=$5,byte_count=$6,incomplete=incomplete OR $7,updated_at=now() WHERE ref=$1`,
     [key,String(x.s.revision),String(x.s.state.t),x.s.phase>=3?JSON.parse(x.frame):null,row.frame_count+(fits?1:0),row.byte_count+(fits?x.frame.length:0),
      !fits||this.gaps.has(key)||row.first_time===null&&x.s.state.t>200000n]);
    await c.query('COMMIT');
   }catch{await c?.query('ROLLBACK').catch(()=>{});this.gaps.add(key);this.onError();}finally{c?.release();}
  }})().catch(()=>{for(const x of this.pending)this.gaps.add(poolReplayKey(x.ref));this.onError();})
   .finally(()=>{this.writing=undefined;if(this.pending.length)this.drain();});
 }
 async flush(){while(this.writing)await this.writing;}
 async finish(view:PoolMatchView){
  if(!view.result)return;await this.flush();const key=poolReplayKey(view.ref),c=await this.db.connect();
  try{
   await c.query('BEGIN');const row=(await c.query('SELECT * FROM agent_pool.replays WHERE ref=$1 FOR UPDATE',[key])).rows[0];
   if(!row||row.availability!=='recording'){await c.query('COMMIT');return;}
   const terminal=row.terminal,valid=terminal&&Number(terminal.phase)===view.result.status&&terminal.a.toLowerCase()===view.a.toLowerCase()
    &&terminal.b.toLowerCase()===view.b.toLowerCase()&&terminal.winner.toLowerCase()===view.result.winner.toLowerCase()
    &&terminal.state.scoreA===view.result.scoreA&&terminal.state.scoreB===view.result.scoreB&&String(terminal.state.t)===view.result.elapsedUs;
   const rows=(await c.query('SELECT frame FROM agent_pool.replay_frames WHERE ref=$1 ORDER BY revision',[key])).rows.map(x=>x.frame);
   const encoded=json(rows);const availability=!valid?'corrected':row.incomplete||this.gaps.has(key)?'partial':'available';
   await c.query('UPDATE agent_pool.replays SET availability=$2,packed=$3,result_hash=$4,updated_at=now() WHERE ref=$1',
    [key,encoded.length<=MAX_BYTES&&rows.length?availability:'unavailable',valid&&encoded.length<=MAX_BYTES?gzipSync(encoded):null,view.result.hash]);
   await c.query('DELETE FROM agent_pool.replay_frames WHERE ref=$1',[key]);await c.query('COMMIT');this.last.delete(key);this.gaps.delete(key);
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }
 async read(view:PoolMatchView){
  const key=poolReplayKey(view.ref),empty=(availability:string,rules=11)=>({ref:view.ref,rulesVersion:rules,availability,frames:[],frameCount:0});
  if(!view.result)return empty('recording');
  // An absent/lagging index or RPC failure is never permission to delete frames.
  if(!this.retention)return empty('indexing');
  const indexed=(await this.retention([key])).find(x=>x.id===key);
  if(!indexed||indexed.playerA!==view.a.toLowerCase()||indexed.playerB!==view.b.toLowerCase()||indexed.status!==view.result.status
   ||indexed.scoreA!==view.result.scoreA||indexed.scoreB!==view.result.scoreB)return empty('indexing');
  if(['pruned','not-played'].includes(indexed.replayAvailability)){await this.retire([key],indexed.replayAvailability);return empty(indexed.replayAvailability);}
  await this.finish(view);const row=(await this.db.query('SELECT * FROM agent_pool.replays WHERE ref=$1',[key])).rows[0];
  if(!row)return empty('unavailable');
  if(row.result_hash!==view.result.hash)return empty('corrected',row.rules);
  return {ref:view.ref,rulesVersion:row.rules,availability:row.availability,
   frames:row.packed&&['available','partial'].includes(row.availability)?JSON.parse(gunzipSync(row.packed,{maxOutputLength:MAX_BYTES}).toString()):[],frameCount:row.frame_count};
 }
 private async retire(keys:string[],availability:string){const c=await this.db.connect();try{await c.query('BEGIN');
  await c.query('UPDATE agent_pool.replays SET availability=$2,packed=NULL,updated_at=now() WHERE ref=ANY($1)',[keys,availability]);
  await c.query('DELETE FROM agent_pool.replay_frames WHERE ref=ANY($1)',[keys]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
 async reconcile(lookup:(ref:AgentMatchRef)=>Promise<PoolMatchView>){
  const rows=(await this.db.query("SELECT ref,app,epoch,match_id FROM agent_pool.replays WHERE availability='recording' AND ref>$1 ORDER BY ref LIMIT 8",[this.scanAfter])).rows;
  this.scanAfter=rows.length===8?rows.at(-1).ref:'';
  for(const r of rows)try{await this.finish(await lookup({chainId:10143,app:r.app,epoch:r.epoch,id:r.match_id}));}catch{this.onError();}
  if(!this.retention)return;
  const candidates=(await this.db.query("SELECT ref FROM agent_pool.replays WHERE packed IS NOT NULL OR availability='recording'")).rows;
  for(let at=0;at<candidates.length;at+=64){
   const ids=candidates.slice(at,at+64).map(r=>r.ref),data=await this.retention(ids);
   for(const state of ['pruned','not-played']){const keys=data.filter(r=>ids.includes(r.id)&&r.replayAvailability===state).map(r=>r.id);if(keys.length)await this.retire(keys,state);}
  }
 }
}
export const replayRevision=(value:unknown)=>createHash('sha256').update(json(value)).digest('hex');

/** The shared Envio history is the sole retention authority across deployments. */
export function poolReplayRetention(url:string,headers:Record<string,string>={}):PoolReplayRetention{
 return async ids=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},signal:AbortSignal.timeout(10000),
  body:JSON.stringify({query:'query($ids:[String!]!){Match(where:{id:{_in:$ids}}){id playerA playerB scoreA scoreB status replayAvailability}}',variables:{ids}})});
  if(!response.ok)throw Error('Shared replay index unavailable');const body=await response.json();if(body.errors||!Array.isArray(body.data?.Match))throw Error('Shared replay index unavailable');return body.data.Match;
 };
}
