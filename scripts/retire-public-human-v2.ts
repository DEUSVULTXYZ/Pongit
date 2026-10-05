// Normally retire only the three empty, obsolete public human epochs. No force
// close, game cancellation, new opening or hosted POST exists in this worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {independentReader} from '../shared/independent-read';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {roomsLifecycleHubAbi as hubAbi} from '../shared/abi-rooms-lifecycle';
assert.equal(process.env.PONG_PUBLIC_HUMAN_MIGRATION,'public-human-v3-20261005');
const snapshot=JSON.parse(await readFile('/secrets/source-snapshot.json','utf8')),m=snapshot.source;
assert.equal(m.lobby.toLowerCase(),'0x5dbea9692d443e04e1bd0b74fb307b079a5cb212');assert.equal(m.arenas.length,3);
const path='/evidence/legacy-retirement.json';
let report:any;
try{report=JSON.parse(await readFile(path,'utf8'));assert(!report.finishedAt,'Preserve completed retirement');}
catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
report??={startedAt:new Date().toISOString(),deadline:Date.now()+78*60000,sourceLobby:m.lobby,arenas:[],passed:false};
const save=async()=>{await writeFile(path+'.next',JSON.stringify(report,null,2)+'\n');await rename(path+'.next',path);};
const t=await chainTools('public-human-v3-20261005:retire-legacy'),r=independentReader(t.base,m);
const write=(...a:Parameters<typeof t.write>)=>retryOperatorContention(()=>{assert(Date.now()<report.deadline,'Original retirement deadline');return t.write(...a);});
try{
 assert.equal(String(await r.ratings('count')),snapshot.count);assert.equal(await r.ratings('revision'),BigInt(snapshot.revision));
 for(const e of snapshot.results)assert((await r.ratings('entry',[BigInt(e.latest.id)])).finality);
 for(const i of [0n,1n])assert.equal(await r.lobby('slot',[i]),0n);
 for(const a of m.arenas){
  assert.equal(await r.lobby('reservedMatch',[a.app]),0n);
  const d=await readHubDelegation(t.base,m.hub,a.app),[epoch,count,root]=await r.arena(a.app,'resultCommitment');
  let row=report.arenas.find((x:any)=>x.app===a.app);
  if(!row){assert.equal(d.status,1);assert.equal(epoch,d.epoch);assert.equal(count,0,'Only empty obsolete epochs may retire');row={app:a.app,epoch:String(epoch),count,root};report.arenas.push(row);await save();}
  assert.equal(String(d.epoch),row.epoch);assert.equal(root,row.root);assert.equal(count,row.count);
  if(d.status===1){row.close=(await write('close-'+a.app+'-'+row.epoch,m.lobby,lobbyAbi,'closeReusableArena',[a.app])).transactionHash;await save();}
 }
 while(Date.now()<report.deadline){
  const block=await t.base.getBlock();
  for(const row of report.arenas){
   let d=await readHubDelegation(t.base,m.hub,row.app);assert.equal(String(d.epoch),row.epoch);
   if(d.status===2){row.releaseAt=String(d.stakeUnlockAt);if(block.timestamp>=d.stakeUnlockAt){row.release=(await write('release-'+row.app+'-'+row.epoch,m.hub,hubAbi,'releaseStake',[row.app,zeroHash])).transactionHash;d=await readHubDelegation(t.base,m.hub,row.app);}}
   if(d.status===0){
    let final=await t.base.readContract({address:m.resultVerifier,abi:verifierAbi,functionName:'finalizedRoots',args:[row.app as Address,BigInt(row.epoch)]});
    if(final[0]===zeroHash){row.seal=(await write('seal-'+row.app+'-'+row.epoch,m.resultVerifier,verifierAbi,'sealReleased',[row.app])).transactionHash;final=await t.base.readContract({address:m.resultVerifier,abi:verifierAbi,functionName:'finalizedRoots',args:[row.app as Address,BigInt(row.epoch)]});}
    assert.equal(final[0],row.root);assert.equal(Number(final[1]),row.count);row.released=true;
   }else assert.equal(d.status,2,'Unexpected legacy epoch state');
  }
  report.observedAt=new Date().toISOString();await save();if(report.arenas.every((v:any)=>v.released)){report.passed=true;break;}
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert(report.passed,'Original retirement deadline elapsed');
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,250);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify(report));}
