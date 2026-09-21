// Actual dedicated capacity/rotation probe. No production budget is created.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
assert.equal(process.env.PONG_REUSABLE_HUMAN_RESERVE,'isolated-vps');
const step=process.argv[2];assert(['open','close-idle'].includes(step));
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(m.production,false);assert.equal(m.rulesVersion,14);assert.equal(m.status,'sealed');assert.equal(m.arenas.length,3);
const t=await chainTools(m.prefix+':reserve-qualification',measuredFetch('monad'));
const finishMetrics=await agentMetrics('/diagnostics/reusable','human-reserve-qualification');
const report:any={at:new Date().toISOString(),step,lobby:m.lobby,passed:false};
const read=(app:any,abi:any,name:string,args:any[]=[])=>t.base.readContract({address:app,abi,functionName:name,args}) as Promise<any>;
const config=async()=>{const response=await fetch('http://independent-events-service:4012/independent/config',{signal:AbortSignal.timeout(8000)});assert(response.ok);const c=await response.json() as any;assert.equal(c.manifest.lobby.toLowerCase(),m.lobby.toLowerCase());return c;};
try{
 const app=m.arenas[step==='open'?2:1].app;
 assert.equal((await read(app,arenaAbi,'lobby')).toLowerCase(),m.lobby.toLowerCase());
 assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[app]),0n);
 if(step==='open'){
  const d=await readHubDelegation(t.base,m.hub,app);
  if(d.status===0){
   const [epoch]=await read(app,arenaAbi,'resultCommitment');assert.equal(epoch,0n,'Only the never-opened third reserve is in scope');
   const validator=await read(m.hub,hubAbi,'defaultValidator'),terms=await read(m.hub,hubAbi,'termsOf',[validator]);assert.equal(terms.delegationFee,0n);
  }else{
   assert.equal(d.status,1);assert.equal(d.epoch,1n);
   assert.equal((await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[m.prefix+':reserve-qualification:open-third'])).rows[0]?.status,'confirmed');
  }
  report.hash=(await t.write('open-third',m.lobby,lobbyAbi,'openReusableArena',[app])).transactionHash;
  const deadline=Date.now()+180000;let observed=false;
  while(Date.now()<deadline){const c=await config();observed=c.arenas.some((a:any)=>a.app.toLowerCase()===app.toLowerCase()&&a.online&&a.stage==='available'&&a.epoch==='1');if(observed)break;await new Promise(r=>setTimeout(r,3000));}
  assert(observed,'Reserve is not hosted and ready');report.scope='Actual third arena admission/readiness only; no continuous-service verdict';
 }else{
  const c=await config(),primary=c.arenas.find((a:any)=>a.app.toLowerCase()===m.arenas[0].app.toLowerCase()),reserve=c.arenas.find((a:any)=>a.app.toLowerCase()===m.arenas[2].app.toLowerCase());
  assert.equal(primary.stage,'playing');assert.equal(reserve.stage,'available');
  const id=await read(m.lobby,lobbyAbi,'reservedMatch',[m.arenas[0].app]);assert(id>0n);report.parallelMatch=String(id);report.parallelArena=m.arenas[0].app;
  const prior=await read(app,arenaAbi,'publishedResult');assert(prior.match_.status>=3);
  report.hash=(await t.write('close-idle-second',m.lobby,lobbyAbi,'closeReusableArena',[app])).transactionHash;
  const d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.status,2);report.releaseAt=String(d.stakeUnlockAt);
  assert.equal((await readHubDelegation(t.base,m.hub,m.arenas[0].app)).status,1);
  report.scope='Idle second arena closed while first game remained delegated; its actual continued controls/result require separate browser evidence';
 }
 report.app=app;report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{await mkdir('artifacts/reusable-candidate',{recursive:true});await writeFile(`artifacts/reusable-candidate/reserve-${step}-${Date.now()}.json`,JSON.stringify(report,null,2));await finishMetrics();await t.close();console.log(JSON.stringify(report));}
