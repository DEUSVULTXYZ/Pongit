// Exact candidate release/root sealing. No operator/admin protocol overrides.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {decodeAbiParameters,getAbiItem,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {retryOperatorContention} from '../shared/operator-contention';
import {PublishedResultIndex} from '../shared/published-result-tree';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';

assert.equal(process.env.PONG_REUSABLE_QUALIFICATION,'isolated-vps');
const manifest=process.env.PONG_INDEPENDENT_MANIFEST!;assert(manifest.startsWith('/secrets/'));
const m=JSON.parse(await readFile(manifest,'utf8')),state=JSON.parse(await readFile('/secrets/reuse-live.json','utf8'));
assert.equal(m.production,false);assert.equal(m.rulesVersion,14);assert.equal(state.app,m.arenas[0].app);assert.equal(state.lobby,m.lobby);
assert.equal(state.epoch,'1');assert.equal(state.results.length,2);assert(state.matches.every((x:any)=>x.captured));
const t=await chainTools(m.prefix+':reusable-renewal'),app=state.app;
const out='artifacts/reusable-candidate/renewal.json';await mkdir('artifacts/reusable-candidate',{recursive:true});
try{await rename(out,out.replace('.json','-prior-'+Date.now()+'.json'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
const r:any={startedAt:new Date().toISOString(),app,epoch:'1',checks:[],passed:false};
const flush=async()=>{await writeFile(out+'.next',JSON.stringify(r,(_,x)=>typeof x==='bigint'?String(x):x,2));await rename(out+'.next',out);};
const write=(...args:Parameters<typeof t.write>)=>retryOperatorContention(()=>t.write(...args));
try{
 let d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.epoch,1n);assert([0,2].includes(d.status));
 const index=new PublishedResultIndex();for(const entry of state.results)index.append(entry.index,entry.leaf,entry.root);
 const expected=await t.base.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'});
 assert.deepEqual(expected,[1n,index.count,index.root]);
 const end=Date.now()+90*60_000;
 while(d.status===2){
  const block=await t.base.getBlock();r.releaseAt=String(d.stakeUnlockAt);r.observedAt=new Date().toISOString();await flush();
  assert(Date.now()<end,'Release did not become eligible within fixture budget');
  if(block.timestamp>=d.stakeUnlockAt)break;
  await new Promise(resolve=>setTimeout(resolve,Math.min(30_000,Number(d.stakeUnlockAt-block.timestamp)*1000)));
  d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.epoch,1n);assert([0,2].includes(d.status),'Challenge requires explicit review');
 }
 const id=m.prefix+':reusable-renewal:release-epoch1';
 if(d.status===0)assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',[id])).rowCount,'Unjournaled release needs review');
 const receipt=await write('release-epoch1',m.hub,hubAbi,'releaseStake',[app,zeroHash]);
 d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.status,0);r.release={hash:receipt.transactionHash,gasUsed:receipt.gasUsed};
 await write('seal-epoch1',m.resultVerifier,verifierAbi,'sealReleased',[app]);
 const sealed=await t.base.readContract({address:m.resultVerifier,abi:verifierAbi,functionName:'finalizedRoots',args:[app,1n]});
 assert.deepEqual(sealed,[index.root,index.count]);
 await write('recover-released-epoch1',m.lobby,lobbyAbi,'recoverReleased',[app]);
 assert.deepEqual(await t.base.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'}),expected);
 const resultParameters=getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs;
 for(const entry of state.results){
  const result=decodeAbiParameters(resultParameters,entry.canonical)[0];
  await write('finalize-result-'+entry.id,m.lobby,lobbyAbi,'captureProof',[BigInt(entry.id),result,index.proof(entry.index,{count:index.count,root:index.root})]);
 }
 r.checks.push('Actual hub release, unchanged final root sealed, both historical results recaptured after release');
 r.passed=true;
}catch(e){r.error=String((e as any).shortMessage||(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{r.finishedAt=new Date().toISOString();await flush();await t.close();console.log(JSON.stringify({passed:r.passed,error:r.error,app:r.app,release:r.release},(_,x)=>typeof x==='bigint'?String(x):x));}
