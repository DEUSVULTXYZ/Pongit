// Explicitly approved retirement of two superseded, empty PONGIT deployments.
// No general address parameter; the other old arena still has a game to recover.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_RETIRE_EMPTY,'approved-two-empty-sessions-20260919');
assert.equal(process.getuid?.(),1000,'Preserve private journal ownership');
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const apps=[{app:'0xfd1693294fed77304662f08e827b043b0ba386a3' as Address,epoch:3n,node:'https://il-fd1693294fed7730.fly.dev'},
 {app:'0x065b3d60457eb7c32216d8f64b90f756d51fcfc4' as Address,epoch:1n,node:null}];
const abi=parseAbi(['function activeCount() view returns(uint256)','function operator() view returns(address)',
 'function forceClose(address,bytes32)','function releaseStake(address,bytes32)']);
const manifest=await readFile('/backup/SHA256SUMS','utf8');
assert.equal(createHash('sha256').update(manifest).digest('hex'),process.env.PONG_VERIFIED_BACKUP_MANIFEST,'Off-VPS verified manifest required');
for(const line of manifest.trim().split('\n')){
 const [hash,name]=line.split('  ');assert(/^[a-z0-9.-]+$/i.test(name));
 assert.equal(createHash('sha256').update(await readFile('/backup/'+name)).digest('hex'),hash,'Backup changed');
}
const old=JSON.parse(await readFile('/backup/old-public.json','utf8')),smoke=JSON.parse(await readFile('/backup/old-smoke.json','utf8'));
assert.equal(old.app.toLowerCase(),apps[0].app);assert.equal(smoke.app.toLowerCase(),apps[1].app);assert.equal(smoke.passed,false);
assert.equal(smoke.finishedAt,'2026-09-08T21:42:35.666Z');
const config=await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(10000)}).then(r=>{assert(r.ok);return r.json();});
assert.equal(config.app.toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0','Human production pointer changed');
const prefix='empty-pongit-retirement-20260919',t=await chainTools(prefix),report:any={at:new Date().toISOString(),backupManifest:process.env.PONG_VERIFIED_BACKUP_MANIFEST,rows:[]};
try{
 for(const spec of apps){
  const {app,epoch}=spec,row:any={app,epoch:String(epoch)};report.rows.push(row);
  // Resolve our exact previous transaction before considering a later stage.
  for(const action of ['forceClose','releaseStake'] as const){
   const id=`${app}-${epoch}-${action}`;
   const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${prefix}:${id}`])).rows[0];
   if(job?.status==='pending')row[action+'Hash']=(await t.write(id,hub,abi,action,[app,zeroHash])).transactionHash;
   assert.notEqual(job?.status,'failed','Retirement revert requires review');
  }
  let block=await t.base.getBlock(),d=await readHubDelegation(t.base,hub,app,block.number);
  assert.equal(d.epoch,epoch,'Never retire a replacement epoch');row.before=d.status;assert.equal(d.batchIndex,0n,'Published activity changed');
  assert.equal(await t.base.readContract({address:app,abi,functionName:'activeCount',blockNumber:block.number}),0n,'Published game still active');
  assert.equal((await t.base.readContract({address:app,abi,functionName:'operator'})).toLowerCase(),t.account.address.toLowerCase());
  if(d.status===1){
   assert(block.timestamp>d.expiresAt,'Not an expired deployment');
   const unresolved=(await t.db.query("SELECT count(*)::int AS n FROM il_engine_jobs WHERE lower(app)=$1 AND status NOT IN ('observed','failed','obsolete')",[app])).rows[0].n;
   assert.equal(unresolved,0,'Keep uncertain engine operations');row.unresolved=unresolved;
   if(spec.node){
    const node=createPublicClient({transport:http(spec.node,{retryCount:0,timeout:10000})});
    const session:any=await node.request({method:'interlude_session',params:[]} as any);
    assert.equal(session.app.toLowerCase(),app);assert.equal(BigInt(session.epoch),epoch);
    assert(Array.isArray(session.pendingDiffs));assert.equal(session.pendingDiffs.length,0,'Unpublished changes');
    assert.equal(await node.readContract({address:app,abi,functionName:'activeCount'}),0n,'Live game still active');
    const health=await fetch(spec.node+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
    assert(!health.halted&&health.pendingDiffs===0,'Unhealthy/unpublished predecessor');row.liveEmpty=true;
   }else{
    const hosted=await fetch(`https://control.interludelayer.xyz/sessions/${app}`,{signal:AbortSignal.timeout(10000)});
    assert.equal(hosted.status,404,'Abandoned smoke node reappeared; inspect first');row.abandonedFailedSmoke=true;
   }
   assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash,'Base snapshot reorg');
   row.forceCloseHash=(await t.write(`${app}-${epoch}-forceClose`,hub,abi,'forceClose',[app,zeroHash])).transactionHash;
   d=await readHubDelegation(t.base,hub,app);
  }
  if(d.status===2){
   row.releaseAt=new Date(Number(d.stakeUnlockAt)*1000).toISOString();
   if((await t.base.getBlock()).timestamp>=d.stakeUnlockAt){
    row.releaseStakeHash=(await t.write(`${app}-${epoch}-releaseStake`,hub,abi,'releaseStake',[app,zeroHash])).transactionHash;
    d=await readHubDelegation(t.base,hub,app);
   }
  }
  assert(d.status===0||d.status===2,'Unexpected lifecycle state');row.after=d.status;
 }
}catch(error){
 const e=error as {shortMessage?:string;message?:string};
 report.error=(e.shortMessage??e.message??'Retirement verification failed').split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);
 process.exitCode=1;
}finally{
 await writeFile('/diagnostics/empty-retirement.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));await t.close();
}
