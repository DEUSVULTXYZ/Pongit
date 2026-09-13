import type {Pool} from 'pg';
import type {Address} from 'viem';
import type {EngineState} from '../../shared/engine-stream';
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
/** Bounded snapshot replay cache. Results and all financial journals are separate.
 * Pruned tombstones stop late/reconnected observers from restoring removed frames. */
export async function roomsEventsHistory(db:Pool,app:Address,graphql:(q:string,v?:any)=>Promise<any>){
 await db.query(`CREATE TABLE IF NOT EXISTS il_replays(app text NOT NULL,epoch bigint NOT NULL,id text NOT NULL,a text NOT NULL,b text NOT NULL,availability text NOT NULL DEFAULT 'recording',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,epoch,id));
 CREATE TABLE IF NOT EXISTS il_replay_frames(app text NOT NULL,epoch bigint NOT NULL,id text NOT NULL,revision bigint NOT NULL,snapshot jsonb NOT NULL,PRIMARY KEY(app,epoch,id,revision));`);
 const buffer=new Map<string,{epoch:bigint;s:EngineState}>();let writing=false,retaining=false;
 function record(epoch:bigint,s:EngineState){if(epoch>0n&&s.phase>=2)buffer.set(`${epoch}:${s.id}`,{epoch,s});}
 async function flush(){if(writing)return;writing=true;try{
  for(const [key,item] of buffer){const {epoch,s}=item,c=await db.connect();try{
   await c.query('BEGIN');
   await c.query('INSERT INTO il_replays(app,epoch,id,a,b) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[app,String(epoch),String(s.id),s.a.toLowerCase(),s.b.toLowerCase()]);
   const row=(await c.query('SELECT availability FROM il_replays WHERE app=$1 AND epoch=$2 AND id=$3 FOR UPDATE',[app,String(epoch),String(s.id)])).rows[0];
   if(row.availability!=='pruned'){
    if(s.reset)await c.query('DELETE FROM il_replay_frames WHERE app=$1 AND epoch=$2 AND id=$3 AND revision>=$4',[app,String(epoch),String(s.id),String(s.revision)]);
    await c.query('INSERT INTO il_replay_frames VALUES($1,$2,$3,$4,$5) ON CONFLICT(app,epoch,id,revision) DO NOTHING',[app,String(epoch),String(s.id),String(s.revision),json(s)]);
    await c.query("UPDATE il_replays SET updated_at=now() WHERE app=$1 AND epoch=$2 AND id=$3",[app,String(epoch),String(s.id)]);
   }
   await c.query('COMMIT');if(buffer.get(key)===item)buffer.delete(key);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 }finally{writing=false;}}
 async function recent(player:string){
  const recent=await graphql('query($player:String!){RecentReplays(where:{id:{_eq:$player}}){matches}}',{player:player.toLowerCase()}),ids=recent.RecentReplays[0]?.matches||[];
  if(!ids.length)return [];
  const data=await graphql('query($ids:[String!]!){Match(where:{id:{_in:$ids}},order_by:[{endedAt:desc},{id:desc}],limit:3){id rawId deployment mode scoreA scoreB replayAvailability}}',{ids});
  return Promise.all(data.Match.map(async(m:any)=>{
   const match=/^10143:(0x[\da-f]{40}):(\d+):(\d+)$/.exec(m.id);
   const row=match?(await db.query('SELECT availability FROM il_replays WHERE app=$1 AND epoch=$2 AND id=$3',[match[1],match[2],match[3]])).rows[0]:null;
   return {ref:m.id,id:m.rawId,app:match?.[1],epoch:match?.[2],legacy:/^v[1-4]$/.test(m.deployment)?m.deployment:undefined,mode:m.mode,score_a:m.scoreA,score_b:m.scoreB,published:true,
    replay_availability:m.replayAvailability==='pruned'?'pruned':row?.availability||'not-recorded'};
  }));
 }
 async function retain(){if(retaining)return;retaining=true;try{
  const rows=(await db.query(`SELECT p.*,r.phase,r.verified,r.published FROM il_replays p JOIN il_results r ON r.app=p.app AND r.id=p.id WHERE p.availability!='pruned' AND r.verified AND r.published AND r.phase>=3`)).rows;
  for(let offset=0;offset<rows.length;offset+=100){
   const chunk=rows.slice(offset,offset+100),ids=chunk.map(row=>`10143:${row.app}:${row.epoch}:${row.id}`);
   // Envio owns the single retention list across V1-V4 and the new games. Its
   // rollback-aware result events can retire either participant's older replays.
   const indexed=await graphql('query($ids:[String!]!){Match(where:{id:{_in:$ids}}){id replayAvailability}}',{ids});
   for(const row of chunk){const item=indexed.Match.find((x:any)=>x.id===`10143:${row.app}:${row.epoch}:${row.id}`);if(!item)continue;
    if(item.replayAvailability==='available'){await db.query("UPDATE il_replays SET availability='available' WHERE app=$1 AND epoch=$2 AND id=$3 AND availability!='pruned'",[row.app,row.epoch,row.id]);continue;}
    if(!['pruned','not-played'].includes(item.replayAvailability))continue;
    const c=await db.connect();try{await c.query('BEGIN');await c.query("UPDATE il_replays SET availability='pruned' WHERE app=$1 AND epoch=$2 AND id=$3",[row.app,row.epoch,row.id]);await c.query('DELETE FROM il_replay_frames WHERE app=$1 AND epoch=$2 AND id=$3',[row.app,row.epoch,row.id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   }
  }
 }finally{retaining=false;}}
 async function replay(arena:Address,epoch:bigint,id:bigint,after:bigint){
  const row=(await db.query('SELECT p.*,r.verified,r.published,r.phase FROM il_replays p LEFT JOIN il_results r ON r.app=p.app AND r.id=p.id WHERE p.app=$1 AND p.epoch=$2 AND p.id=$3',[arena.toLowerCase(),String(epoch),String(id)])).rows[0];
  if(!row)return {availability:'not-recorded',frames:[]};
  if(row.availability==='pruned')return {availability:'pruned',frames:[]};
  if(!row.verified||!row.published||row.phase<3)return {availability:'awaiting-publication',frames:[]};
  const frames=(await db.query('SELECT snapshot FROM il_replay_frames WHERE app=$1 AND epoch=$2 AND id=$3 AND revision>$4 ORDER BY revision LIMIT 250',[arena.toLowerCase(),String(epoch),String(id),String(after)])).rows.map(x=>x.snapshot);
  return {availability:'available',ref:`10143:${arena}:${epoch}:${id}`,frames};
 }
 let lastDiagnostic=0;
 const failed=(stage:string)=>{if(Date.now()-lastDiagnostic>60000){lastDiagnostic=Date.now();console.error(JSON.stringify({at:new Date().toISOString(),code:'REPLAY_CACHE_UNAVAILABLE',app,stage}));}};
 const timer=setInterval(()=>void flush().catch(()=>failed('flush')),250),maintenance=setInterval(()=>void retain().catch(()=>failed('retention')),15000);timer.unref();maintenance.unref();
 return {record,recent,replay,flush,retain,stop:()=>{clearInterval(timer);clearInterval(maintenance);}};
}
