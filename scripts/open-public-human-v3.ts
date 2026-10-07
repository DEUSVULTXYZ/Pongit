// One journalled initial opening for each new PUBLIC human arena. Hosting is
// performed by the sole service using its nonfinancial owner-consent key.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
const prefix=process.env.PONG_PUBLIC_HUMAN_MIGRATION!,reship=prefix==='public-human-v3-20261007';
assert(reship||prefix==='public-human-v3-20261005');
assert.equal(m.prefix,prefix);assert.equal(m.status,'sealed');assert.equal(m.hub,NO_LEASE_HUB);
if(reship){assert.equal(m.previous[0].lobby.toLowerCase(),'0x527ccb705048820694a4ac209f83528db68fff3f');assert.notEqual(m.lobby.toLowerCase(),m.previous[0].lobby.toLowerCase());}
else assert.equal(m.lobby,'0x527ccb705048820694a4ac209f83528db68fff3f');assert.equal(m.arenas.length,3);
const t=await chainTools(m.prefix+':initial-open'),report:any={startedAt:new Date().toISOString(),lobby:m.lobby,arenas:[],passed:false};
try{
 for(const a of m.arenas){
  assert.equal(await t.base.readContract({address:m.lobby,abi:lobbyAbi,functionName:'reservedMatch',args:[a.app]}),0n);
  let d=await readHubDelegation(t.base,m.hub,a.app);
  const id=m.prefix+':initial-open:open-'+a.index;
  const job=(await t.db.query('SELECT status,hash FROM il_lifecycle_jobs WHERE id=$1',[id])).rows[0];
  if(!job)assert.equal(d.status,0,'New initial opening only');
  const validator=await t.base.readContract({address:m.hub,abi:hubAbi,functionName:'defaultValidator'});
  const terms=await t.base.readContract({address:m.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});
  assert(terms.delegationFee<=parseEther('0.1'),'Opening fee exceeds explicit migration bound');
  const receipt=await retryOperatorContention(()=>t.write('open-'+a.index,m.lobby,lobbyAbi,'openReusableArena',[a.app],terms.delegationFee));
  d=await readHubDelegation(t.base,m.hub,a.app);assert.equal(d.status,1);assert.equal(d.epoch,1n);
  report.arenas.push({app:a.app,epoch:String(d.epoch),baseBlock:String(d.baseBlock),hash:receipt.transactionHash});
 }
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,250);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile('/evidence/initial-open.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});await t.close();console.log(JSON.stringify(report));}
