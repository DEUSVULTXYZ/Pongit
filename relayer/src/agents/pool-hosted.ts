import type {Pool,PoolClient} from 'pg';
import type {Address} from 'viem';
import {measuredFetch} from '../../../shared/rpc-metrics';
import {HOME_REGION} from '../../../shared/interlude-regions';

const INSPECTION_AFTER_MS=300_000,ALERT_EVERY_MS=600_000;
type Provision={state:string;at:number;attempts:number;retryAt:number;http?:number;url?:string;readyAt?:number;reason?:string;stalledAt?:number;alertedAt?:number};

async function exclusively<T>(db:Pool,app:Address,action:(c:PoolClient)=>Promise<T>):Promise<T>{
 const c=await db.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,701351)) AS ok',[app.toLowerCase()])).rows[0].ok;
  if(!locked)throw Error('Another process is already reconciling hosted creation');
  return await action(c);
 }finally{try{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,701351))',[app.toLowerCase()]);}finally{c.release();}}
}
async function save(c:PoolClient,app:Address,epoch:bigint,p:Provision){
 // Preserve evidence of older epochs before replacing the current view.
 // Neither this view nor its journal contains request credentials or grants.
 await c.query('BEGIN');
 try{
  await c.query('UPDATE agent_pool.lifecycle SET provision_epoch=$2,provisioning=$3 WHERE app=$1',[app.toLowerCase(),String(epoch),p]);
  await c.query('INSERT INTO agent_pool.lifecycle_events(app,epoch,stage,detail) VALUES($1,$2,$3,$4)',[app.toLowerCase(),String(epoch),p.state,p]);
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error;}
}
// Ambiguity keeps looking up: a GET never creates, so it is always safe and it
// adopts the session as soon as control answers. Past INSPECTION_AFTER_MS the
// state is flagged for operators instead of freezing every later lookup; only a
// changed identity or URL stops provisioning.
function pending(p:Provision,now:number,reason:string,app:Address,epoch:bigint):Provision{
 const next:Provision={...p,state:'uncertain',retryAt:now+10000,reason};
 if(now-p.at>=INSPECTION_AFTER_MS){
  next.stalledAt=p.stalledAt??now;
  if(p.alertedAt===undefined||now-p.alertedAt>=ALERT_EVERY_MS){next.alertedAt=now;console.warn(JSON.stringify({event:'hosted-provisioning-stalled',app,epoch:String(epoch),
   since:new Date(p.at).toISOString(),reason,attempts:p.attempts}));}
 }
 return next;
}
const terminal=(p:Provision|null)=>p?.state==='intervention'&&p.reason==='identity-or-url';

/** Persist before POST, look up after an ambiguous response. Only an explicit
 * non-creating refusal permits another POST. A control-plane URL is never an
 * availability certificate: observePoolArenaReady records the actual checks. */
export async function provisionPoolArena(db:Pool,app:Address,epoch:bigint,expected?:string,transport=measuredFetch('interlude','hosted.session')){
 return exclusively(db,app,async c=>{
  await c.query('INSERT INTO agent_pool.lifecycle(app) VALUES($1) ON CONFLICT DO NOTHING',[app.toLowerCase()]);
  const row=(await c.query('SELECT provision_epoch,provisioning FROM agent_pool.lifecycle WHERE app=$1',[app.toLowerCase()])).rows[0];
  let p:Provision|null=String(row.provision_epoch)===String(epoch)?row.provisioning:null;const now=Date.now();
  if(terminal(p))throw Error('Hosted arena identity or URL changed; operator inspection required');
  // An older intervention came from ambiguity alone: resume safe lookups.
  if(p?.state==='intervention')p={...p,state:'uncertain',retryAt:0};
  if(p&&p.retryAt>now)throw Object.assign(Error('Hosted arena provisioning is cooling down'),{code:'AGENT_HOSTED_COOLDOWN',retryAt:p.retryAt});
  const create=!p||p.state==='rejected';
  if(create){p={state:'sending',at:now,attempts:(p?.attempts??0)+1,retryAt:0};await save(c,app,epoch,p);}
  if(!p)throw Error('Hosted provisioning intent missing');
  let response:Response;
  try{response=await transport(`https://control.interludelayer.xyz/sessions${create?'':'/'+app}`,{method:create?'POST':'GET',headers:{'content-type':'application/json'},
   // Without a region, Interlude places the node near the caller (this VPS), not the players.
   ...(create?{body:JSON.stringify({app,region:HOME_REGION})}:{}),signal:AbortSignal.timeout(10000)});}
  catch{await save(c,app,epoch,pending(p,now,'response-lost',app,epoch));throw Error('Hosted response lost; the existing creation will be looked up');}
  const body=await response.json().catch(()=>null);
  if(!response.ok){
   const rejected=create&&response.status>=400&&response.status<500&&body?.created===false;
   const header=response.headers.get('retry-after');const seconds=Number(header);
   const wait=header&&Number.isFinite(seconds)&&seconds>0?seconds*1000:header&&Number.isFinite(Date.parse(header))?Math.max(10000,Date.parse(header)-now):10000;
   // A 404 after a lost POST is still ambiguous: never create again on it.
   p={...pending(p,now,'control-plane-http',app,epoch),state:rejected?'rejected':'uncertain',http:response.status,retryAt:now+Math.min(wait,3600000)};
   await save(c,app,epoch,p);throw Error(`Hosted arena ${create?'creation':'lookup'} is pending (HTTP ${response.status})`);
  }
  let url:URL;try{url=new URL(body?.url);}catch{await save(c,app,epoch,pending(p,now,'missing-url',app,epoch));throw Error('Hosted arena has no verified URL yet');}
  const pinned=expected??p.url;
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'
   ||body.app&&String(body.app).toLowerCase()!==app.toLowerCase()||pinned&&url.origin!==new URL(pinned).origin){
   await save(c,app,epoch,{...p,state:'intervention',retryAt:0,reason:'identity-or-url'});throw Error('Hosted arena identity or URL changed');
  }
  p={...p,state:p.readyAt?'ready':'confirmed',url:url.origin,retryAt:now+10000};await save(c,app,epoch,p);return url.origin;
 });
}

/** Called after checking the node's app, epoch, chain and rules. A stale node
 * cannot loop forever behind successful control-plane lookups. */
export async function observePoolArenaReady(db:Pool,app:Address,epoch:bigint,ready:boolean){
 return exclusively(db,app,async c=>{
  const row=(await c.query('SELECT provision_epoch,provisioning FROM agent_pool.lifecycle WHERE app=$1',[app.toLowerCase()])).rows[0];
  if(!row||String(row.provision_epoch)!==String(epoch)||!row.provisioning)throw Error('Hosted epoch changed during readiness checks');
  const p:Provision=row.provisioning,now=Date.now();
  if(terminal(p))throw Error('Hosted arena readiness needs inspection');
  // A slow node keeps being checked; an operator is alerted instead of the arena freezing.
  const next=ready?{...p,state:'ready',readyAt:now,reason:undefined,stalledAt:undefined}:{...pending(p,now,'node-identity-not-ready',app,epoch),state:'confirmed'};
  await save(c,app,epoch,next);
 });
}
