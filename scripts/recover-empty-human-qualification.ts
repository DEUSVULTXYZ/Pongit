// Recovery of the two specifically identified, empty v3 qualification epochs.
// No user game, force-close, new opening or production manifest is permitted.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {roomsLifecycleHubAbi as hubAbi} from '../shared/abi-rooms-lifecycle';
assert.equal(process.env.PONG_EMPTY_HUMAN_RECOVERY,'reviewed-private-20261002');
const action=process.env.PONG_EMPTY_HUMAN_ACTION;assert(action==='close'||action==='release');
const m=JSON.parse(await readFile('/secrets/manifest.json','utf8'));
assert(m.production===false&&m.status==='sealed'&&m.prefix==='independent-qualification-sync-v3-20261002');
assert.equal(m.lobby.toLowerCase(),'0xf10db99c564fe2af535f755ed8e1d239186f767c');
const expected=['0x2114c8e3d23e96ba0b1a020a4438e48ba0f08a57','0xee1b0a4a8dfeea4e494594425fbe873a20673de2'];
assert.deepEqual(m.arenas.slice(0,2).map((a:any)=>a.app.toLowerCase()),expected);
const failed=JSON.parse(await readFile('/evidence/provisioning-failure-1.json','utf8'));
assert(!failed.passed&&!failed.gamesStarted&&failed.assignments.length===0&&failed.workers.every((s:any)=>s.Status==='exited'));
const path=`/evidence/empty-recovery-${action}-1.json`;
let report:any;
try{report=JSON.parse(await readFile(path,'utf8'));assert(!report.finishedAt,'Retain completed recovery');}
catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
report??={startedAt:new Date().toISOString(),action,arenas:[],passed:false};
const save=async()=>{await writeFile(path+'.next',JSON.stringify(report,null,2));await rename(path+'.next',path);};
const t=await chainTools(m.prefix+':empty-recovery');
const read=(address:Address,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args}) as Promise<any>;
const write=(...args:Parameters<typeof t.write>)=>retryOperatorContention(()=>t.write(...args));
try{
 for(const app of expected as Address[]){
  const d=await readHubDelegation(t.base,m.hub,app),[epoch,count,root]=await read(app,arenaAbi,'resultCommitment');
  assert.equal(epoch,1n);assert.equal(count,0);assert.deepEqual(await read(app,arenaAbi,'currentMatch'),[0n,0n]);
  assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[app]),0n);assert.equal(d.batchIndex,0n);
  let row=report.arenas.find((a:any)=>a.app===app);
  if(!row){row={app,epoch:'1',count:0,root};report.arenas.push(row);await save();}
  assert.equal(row.root,root);
  if(action==='close'){
   assert(d.status===1||d.status===2);
   const receipt=await write('close-'+app,m.lobby,lobbyAbi,'closeReusableArena',[app]);row.close=receipt.transactionHash;
   const after=await readHubDelegation(t.base,m.hub,app);assert.equal(after.status,2);row.releaseAt=Number(after.stakeUnlockAt)*1000;
  }else{
   assert(d.status===2||d.status===0);
   if(d.status===2){assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'Wait for the real hub deadline');
    row.release=(await write('release-'+app,m.hub,hubAbi,'releaseStake',[app,zeroHash])).transactionHash;}
   assert.equal((await readHubDelegation(t.base,m.hub,app)).status,0);
   row.seal=(await write('seal-'+app,m.resultVerifier,verifierAbi,'sealReleased',[app])).transactionHash;
   const final=await read(m.resultVerifier,verifierAbi,'finalizedRoots',[app,1n]);assert.deepEqual(final,[root,0]);
   row.recover=(await write('recover-'+app,m.lobby,lobbyAbi,'recoverReleased',[app])).transactionHash;
  }
  await save();
 }
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({passed:report.passed,action,error:report.error}));}
