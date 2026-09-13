// Retire only the drained predecessor of the current human game. Its results,
// ratings, contracts and financial rights remain at their original addresses.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
assert.equal(process.env.PONG_AGENT_RETIRE,'verified-drained-predecessor');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const app='0x695307022ac7add03117e8f3b59369d7ee7a4724' as Address,hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
const active='0x78d3341e3452d7ec1add9371de3008639eed8eb0';
const current=JSON.parse(await readFile('/qualified-modules.json','utf8'));assert.equal(current.app,active);assert.equal(current.previous,app);
const t=await chainTools('agent-capacity-retire-695307-20260913');
try{
 const config=await fetch('https://pongit.xyz/api/interlude/config').then(x=>x.json());assert.equal(config.app,active);assert(config.online&&config.admission);
 let d=await readHubDelegation(t.base,hub,app);assert.equal(d.epoch,1n);
 assert.equal((await t.base.readContract({address:app,abi,functionName:'operator'})).toLowerCase(),t.account.address.toLowerCase());
 const report:any={at:new Date().toISOString(),app,humanApp:active,before:d.status};
 if(d.status===1){
  const hosted=await fetch(`https://control.interludelayer.xyz/sessions/${app}`).then(x=>x.json());const url=hosted.url||hosted.node;assert(new URL(url).protocol==='https:');
  const node=createPublicClient({transport:http(url,{retryCount:0,timeout:10000})});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);assert.equal(session.app.toLowerCase(),app);assert.equal(Number(session.epoch),1);assert.equal(session.pendingDiffs.length,0);
  const health=await fetch(url+'/health').then(x=>x.json());assert(!health.halted&&health.pendingDiffs===0);
  const [live,published]=await Promise.all([node.readContract({address:app,abi,functionName:'activeCount'}),t.base.readContract({address:app,abi,functionName:'activeCount'})]);assert.equal(live,0n);assert.equal(published,0n);
  const pending=(await t.db.query("SELECT id FROM il_engine_jobs WHERE lower(app)=$1 AND status='pending'",[app])).rows;assert.equal(pending.length,0);
  const lobby=(await t.db.query('SELECT document FROM il_lobby WHERE lower(app)=$1',[app])).rows[0]?.document;assert(lobby);
  const now=(await t.base.getBlock()).timestamp;
  for(const room of Object.values(lobby.rooms) as any[])if(room.offer)assert(BigInt(room.offer.expires)<now);
  report.closeHash=(await t.write('close-drained-predecessor',app,abi,'closeEngine')).transactionHash;
  d=await readHubDelegation(t.base,hub,app);
 }
 if(d.status===2&&(await t.base.getBlock()).timestamp>=d.stakeUnlockAt){
  report.releaseHash=(await t.write('release-drained-predecessor',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash])).transactionHash;
  d=await readHubDelegation(t.base,hub,app);
 }
 report.status=d.status;report.releaseAt=String(d.stakeUnlockAt);report.resultsAndBalancesPreserved=true;
 await writeFile('artifacts/agents/archived-capacity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
