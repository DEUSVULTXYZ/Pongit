// Close only our failed, never-started browser qualification. This is not the
// protected real-user match 190. The normal owner close retains published state;
// the existing keeper owns release, proof-of-absence capture and reopening.
import assert from 'node:assert/strict';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
const app='0x028f656e76cc1973ced7c41d8584d4f94be9e003',pool='0x205d5739136d6cb73d732e1146e1ce034798a613';
const hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595',ref={chainId:10143n,arena:app,epoch:11n,id:212n} as const;
assert.equal(process.env.PONG_FIXTURE_RECOVERY,'own-browser-fixture-212');
assert.equal(new URL(process.env.DATABASE_URL!).pathname,'/pong_relayer');
const t=await chainTools('browser-fixture-212-20260930');
try{
 const block=await t.base.getBlock(),d=await readHubDelegation(t.base,hub,app,block.number);
 assert.equal(d.epoch,11n);
 const entry=await t.base.readContract({address:pool,abi:poolAbi,functionName:'record',args:[ref],blockNumber:block.number});
 assert.equal(entry.a.toLowerCase(),'0x8870e4bae43fa8f18f9e1614b6af2e0fe903de9c');
 assert.equal(entry.b.toLowerCase(),'0x18368267bdfff6c2b018bdf85806c6635bfd16ca');
 assert.equal(entry.tournament,0n);assert.equal(entry.ranked,false);assert.equal(entry.captured,false);
 const [epoch,count]=await t.base.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment',blockNumber:block.number});
 assert.equal(epoch,11n);assert.equal(count,0);
 const health=await fetch('https://il-028f656e76cc1973.fly.dev/health').then(r=>r.json()) as any;
 assert.equal(health.app,app);assert.equal(health.epoch,11);assert.equal(health.committedBatches,0);
 assert.match(health.halted,/401 Unauthorized.*missing or wrong bearer token/);
 const receipt=await t.write('normal-close-unpublished-test',pool,poolAbi,'closeReusableArena',[app]);
 const after=await readHubDelegation(t.base,hub,app);
 assert.equal(after.status,2);assert.equal(after.epoch,11n);
 console.log(JSON.stringify({at:new Date().toISOString(),app,epoch:'11',match:'212',reason:'first-publication-relay-authentication',
  transaction:receipt.transactionHash,block:String(receipt.blockNumber),releaseAt:new Date(Number(after.stakeUnlockAt)*1000).toISOString()}));
}finally{await t.close();}
