import type {Pool,PoolClient} from 'pg';
import type {Address} from 'viem';
import {measuredFetch} from '../../../shared/rpc-metrics';

const INSPECTION_AFTER_MS=300_000;
type Provision={state:string;at:number;attempts:number;retryAt:number;http?:number;url?:string;readyAt?:number;reason?:string};

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
function pending(p:Provision,now:number,reason:string){
 return {...p,state:now-p.at>=INSPECTION_AFTER_MS?'intervention':'uncertain',retryAt:now+10000,reason};
}

/** Persist before POST, look up after an ambiguous response. Only an explicit
 * non-creating refusal permits another POST. A control-plane URL is never an
 * availability certificate: observePoolArenaReady records the actual checks. */
export async function provisionPoolArena(db:Pool,app:Address,epoch:bigint,expected?:string,transport=measuredFetch('interlude','hosted.session')){
 return exclusively(db,app,async c=>{
  await c.query('INSERT INTO agent_pool.lifecycle(app) VALUES($1) ON CONFLICT DO NOTHING',[app.toLowerCase()]);
  const row=(await c.query('SELECT provision_epoch,provisioning FROM agent_pool.lifecycle WHERE app=$1',[app.toLowerCase()])).rows[0];
  let p:Provision|null=String(row.provision_epoch)===String(epoch)?row.provisioning:null;const now=Date.now();
  if(p?.state==='intervention')throw Error('Hosted arena creation needs inspection before another POST');
  if(p&&p.retryAt>now)throw Object.assign(Error('Hosted arena provisioning is cooling down'),{code:'AGENT_HOSTED_COOLDOWN',retryAt:p.retryAt});
  const create=!p||p.state==='rejected';
  if(create){p={state:'sending',at:now,attempts:(p?.attempts??0)+1,retryAt:0};await save(c,app,epoch,p);}
  if(!p)throw Error('Hosted provisioning intent missing');
  let response:Response;
  try{response=await transport(`https://control.interludelayer.xyz/sessions${create?'':'/'+app}`,{method:create?'POST':'GET',headers:{'content-type':'application/json'},
   ...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(10000)});}
  catch{await save(c,app,epoch,pending(p,now,'response-lost'));throw Error('Hosted response lost; the existing creation will be looked up');}
  const body=await response.json().catch(()=>null);
  if(!response.ok){
   const rejected=create&&response.status>=400&&response.status<500&&body?.created===false;
   const header=response.headers.get('retry-after');const seconds=Number(header);
   const wait=header&&Number.isFinite(seconds)&&seconds>0?seconds*1000:header&&Number.isFinite(Date.parse(header))?Math.max(10000,Date.parse(header)-now):10000;
   p={...pending(p,now,'control-plane-http'),state:rejected?'rejected':pending(p,now,'control-plane-http').state,http:response.status,retryAt:now+Math.min(wait,3600000)};
   await save(c,app,epoch,p);throw Error(`Hosted arena ${create?'creation':'lookup'} is pending (HTTP ${response.status})`);
  }
  let url:URL;try{url=new URL(body?.url);}catch{await save(c,app,epoch,pending(p,now,'missing-url'));throw Error('Hosted arena has no verified URL yet');}
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
  if(p.state==='intervention')throw Error('Hosted arena readiness needs inspection');
  const next=ready?{...p,state:'ready',readyAt:now,reason:undefined}:{...pending(p,now,'node-identity-not-ready'),state:now-p.at>=INSPECTION_AFTER_MS?'intervention':'confirmed'};
  await save(c,app,epoch,next);
  if(next.state==='intervention')throw Error('Hosted arena was created but the expected engine never became ready');
 });
}
