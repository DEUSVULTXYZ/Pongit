// One bounded hosting recovery of four NEW, empty, never-published arenas.
// A directory-confirmed stopped machine is distinct from an uncertain creation.
// No close, undelegate, replacement contract, game command or repeated POST.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {Pool} from 'pg';
import {readHubDelegation} from '../shared/rooms-hub';
import {canonicalHostedConsent} from '../shared/hosted-provisioner';
import {hostedControl,hostedArenaOrigin} from '../shared/hosted-control';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
assert.equal(process.env.PONG_EMPTY_NODE_RECOVERY,'responsive-20261008-r2');
const m=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert.equal(m.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
assert.equal(r.prefix,'reusable-agents-20261008-2');assert(!m.enabled&&!m.tournamentsEnabled);
const targets=['0x077df08fa9ff9bbfcba2a3c6879bcf3b21efd3df','0xcc4fbf1df9b4bf61353660c40e8f05c5135c3b23',
 '0x4e9fa437576b1b2b386fe1ec24d26839434effb2','0x21a573b3c39265d27ad98f70e8942fd55af54391'] as Address[];
const out='/diagnostics/empty-node-recovery-20261008-1.json';
const report:any={at:new Date().toISOString(),passed:false,delegationClosures:0,chainWrites:0,requests:[]};
await writeFile(out,JSON.stringify(report),{flag:'wx',mode:0o600});
const save=()=>writeFile(out,JSON.stringify(report,null,2)+'\n');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const base=createPublicClient({transport:http(process.env.RPC_URL,{timeout:10000,retryCount:0})});
const account=privateKeyToAccount(JSON.parse(await readFile('/run/pongit-agent-pool/provisioning.json','utf8')).privateKey);
const clean=(e:any)=>String(e.shortMessage??e.message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);
try{
 assert.equal(await base.readContract({address:m.pool,abi:poolAbi,functionName:'publicAdmissions'}),false);
 await db.query(`CREATE TABLE IF NOT EXISTS agent_pool.empty_hosted_recovery(
  app text NOT NULL,epoch text NOT NULL,attempt text NOT NULL,status text NOT NULL,detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,epoch,attempt))`);
 for(const app of targets){
  const c=await db.connect();let locked=false;
  const row:any={app,epoch:'1',status:'checking'};report.requests.push(row);await save();
  try{
   for(let i=0;i<30&&!locked;i++){
    locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,701351)) ok',[app])).rows[0].ok;
    if(!locked)await new Promise(resolve=>setTimeout(resolve,500));
   }
   assert(locked,'Existing provisioning reconciliation owns this arena');
   const d=await readHubDelegation(base,m.hub,app);
   assert(d.status===1&&d.epoch===1n&&d.batchIndex===0n&&d.expiresAt===0n,'Only a new empty epoch qualifies');
   assert.equal((await base.readContract({address:app,abi:arenaAbi,functionName:'boundMatch'})).id,0n);
   const a=m.arenas.find((x:any)=>x.app.toLowerCase()===app);assert(a);
   const control=await hostedControl(m.hub,fetch),origin=hostedArenaOrigin(m.hub,app);
   const response=await fetch(control+'/sessions/'+app,{redirect:'error',signal:AbortSignal.timeout(8000)});
   assert(response.ok);const directory=await response.json();
   assert.equal(directory.app.toLowerCase(),app);assert.equal(directory.status,'stopped');assert.equal(new URL(directory.url).origin,origin);
   assert.equal((await c.query('SELECT count(*)::int n FROM agent_pool.engine_jobs WHERE app=$1 AND status=$2',[app,'pending'])).rows[0].n,0);
   const dispatch=await canonicalHostedConsent(base,{hub:m.hub,app,epoch:1n,owner:r.provisioningOwner,runtimeHash:a.runtimeHash},account,control,fetch);
   row.status='sending';row.directoryStatus=directory.status;row.origin=origin;row.at=new Date().toISOString();
   // Unique intent survives an uncertain HTTP response. This operation cannot
   // be replayed by restarting the script or by resetting its evidence file.
   await c.query('INSERT INTO agent_pool.empty_hosted_recovery(app,epoch,attempt,status,detail) VALUES($1,$2,$3,$4,$5)',[app,'1','responsive-20261008-r2','sending',row]);await save();
   try{
    const result=await dispatch(control+'/sessions',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
     body:JSON.stringify({app,region:'eu'}),signal:AbortSignal.timeout(30000)});
    const body=await result.json().catch(()=>null);row.http=result.status;
    if(!result.ok){row.status='uncertain';row.reason='control-http';}
    else{
     assert.equal(String(body?.app).toLowerCase(),app);assert.equal(new URL(body.url).origin,origin);
     row.status='acknowledged';row.directoryAfter=body.status??null;
    }
   }catch(e){row.status='uncertain';row.reason=clean(e);}
   await c.query('UPDATE agent_pool.empty_hosted_recovery SET status=$4,detail=$5 WHERE app=$1 AND epoch=$2 AND attempt=$3',
    [app,'1','responsive-20261008-r2',row.status,row]);await save();
  }finally{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,701351))',[app]);c.release();}
 }
 report.passed=report.requests.every((r:any)=>r.status==='acknowledged');
 report.scope='Hosting acknowledgement only; actual session identity and publication still required';
}catch(e){report.error=clean(e);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await db.end();console.log(JSON.stringify(report));}
