import type {Pool} from 'pg';
import type {Address} from 'viem';
import type {EngineState} from '../../../shared/engine-stream';
import {randomUUID} from 'node:crypto';

export async function initializePoolObservations(db:Pool){await db.query(`
 CREATE TABLE IF NOT EXISTS agent_pool.observations(
  app text NOT NULL,epoch numeric(78,0) NOT NULL,match_id numeric(78,0) NOT NULL,
  mode smallint NOT NULL,phase smallint NOT NULL,revision numeric(78,0) NOT NULL,time_us numeric(78,0) NOT NULL,
  score_a smallint NOT NULL,score_b smallint NOT NULL,effects smallint[] NOT NULL DEFAULT '{}',resets integer NOT NULL DEFAULT 0,
  first_at timestamptz NOT NULL,last_at timestamptz NOT NULL,progress_at timestamptz NOT NULL,PRIMARY KEY(app,epoch,match_id));
 ALTER TABLE agent_pool.observations ADD COLUMN IF NOT EXISTS observers jsonb NOT NULL DEFAULT '{}';
 DELETE FROM agent_pool.observations WHERE last_at<now()-interval '7 days';
 `);}

/** Compact private evidence, never the authority for results or availability.
 * One pending write replaces intermediate samples while retaining observed
 * effects. No frames, controls, player secrets or signed payloads are retained. */
export class PoolObservations {
 private effects=new Set<number>();private resets=0;
 private observer=randomUUID();
 private last?:{revision:bigint;time:bigint;phase:number;score:string};
 private writtenAt=0;private pending?:any[];private writing?:Promise<void>;private failed=false;
 constructor(private db:Pick<Pool,'query'>,private app:Address,private ref:{epoch:bigint;id:bigint},private now=Date.now,
  private onError=()=>console.error(JSON.stringify({at:new Date().toISOString(),service:'pool-observations',error:'Private observation write failed'}))){}
 observe(s:EngineState){
  if(s.id!==this.ref.id||s.phase<1||s.phase>4)return;
  const prior=this.last;if(prior&&!s.reset&&s.revision<prior.revision)return;
  const at=this.now(),before=this.effects.size;
  if(s.chaos)for(const effect of s.chaos.physics.effects){
   const ms=s.chaos.physics.t/1000n;
   if(effect.id>=1&&effect.id<=24&&ms>=BigInt(effect.startsAt)&&ms<BigInt(effect.expiresAt))this.effects.add(effect.id);
  }
  const score=`${s.state.scoreA}:${s.state.scoreB}`;
  const reset=!!s.reset&&(!prior||s.revision!==prior.revision||s.state.t!==prior.time);
  if(reset)this.resets++;
  const material=!prior||reset||s.phase!==prior.phase||score!==prior.score||before!==this.effects.size;
  if(!material&&!this.failed&&at-this.writtenAt<1000)return;
  this.last={revision:s.revision,time:s.state.t,phase:s.phase,score};this.writtenAt=at;
  this.pending=[this.app.toLowerCase(),String(this.ref.epoch),String(s.id),s.state.mode,s.phase,String(s.revision),String(s.state.t),
   s.state.scoreA,s.state.scoreB,[...this.effects].sort((a,b)=>a-b),this.resets,new Date(at).toISOString(),this.observer];
  this.drain();
 }
 private drain(){
  if(this.writing)return;
  this.writing=(async()=>{while(this.pending){const row=this.pending;this.pending=undefined;
   try{await this.db.query(`INSERT INTO agent_pool.observations AS o
    (app,epoch,match_id,mode,phase,revision,time_us,score_a,score_b,effects,resets,first_at,last_at,progress_at,observers)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12,jsonb_build_object($13::text,$11::int))
    ON CONFLICT(app,epoch,match_id) DO UPDATE SET
     mode=EXCLUDED.mode,phase=EXCLUDED.phase,revision=EXCLUDED.revision,time_us=EXCLUDED.time_us,
     score_a=EXCLUDED.score_a,score_b=EXCLUDED.score_b,last_at=EXCLUDED.last_at,
     progress_at=CASE WHEN EXCLUDED.time_us<>o.time_us OR EXCLUDED.phase<>o.phase THEN EXCLUDED.last_at ELSE o.progress_at END,
     effects=ARRAY(SELECT DISTINCT e FROM unnest(o.effects||EXCLUDED.effects) e ORDER BY e),
     resets=o.resets+GREATEST(0,$11::int-COALESCE((o.observers->>$13::text)::int,0)),
     observers=o.observers||EXCLUDED.observers
    WHERE EXCLUDED.revision>=o.revision OR $11::int>COALESCE((o.observers->>$13::text)::int,0)`,row);this.failed=false;
   }catch{this.failed=true;this.onError();}
  }})().finally(()=>{this.writing=undefined;if(this.pending)this.drain();});
 }
 async flush(){while(this.writing)await this.writing;if(this.failed)throw Error('Private observation evidence is incomplete');}
}
