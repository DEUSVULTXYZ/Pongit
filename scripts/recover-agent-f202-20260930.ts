// Explicit user approval, 30 September: abandon the unpublished match-190
// result, retain its archive, close this epoch and recover under protocol rules.
// This script only submits the close through the original operator journal.
// The existing maintenance/archive services own release, sealing and capture.
import assert from 'node:assert/strict';
import {parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi} from '../shared/abi-ReusableAgentArena';

assert.equal(process.env.PONG_RECOVERY_F202,'approved-20260930');
assert.equal(new URL(process.env.DATABASE_URL!).pathname,'/pong_relayer');
const app='0xf202862714f61d6f6b8b14c1d2f5d3ca7ea3e41b',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const pool='0x205d5739136d6cb73d732e1146e1ce034798a613';
const t=await chainTools('approved-f202-20260930');
try{
 const before=await t.base.getBlock(),d=await readHubDelegation(t.base,hub,app,before.number);
 assert.equal(d.epoch,1n,'Never close a replacement epoch');
 const lane=await t.base.readContract({address:pool,abi:reusableAgentPoolAbi,functionName:'laneRecord',args:[0],blockNumber:before.number});
 assert.equal(lane.ref.arena.toLowerCase(),app);assert.equal(lane.ref.id,190n);assert.equal(lane.ref.epoch,1n);
 const commitment=await t.base.readContract({address:app,abi:reusableAgentArenaAbi,functionName:'resultCommitment',blockNumber:before.number});
 assert.equal(commitment[1],2,'Stop if the missing result has now been published');
 const abi=parseAbi(['function forceClose(address app,bytes32 key)']);
 const job=await t.db.query('SELECT status,hash FROM il_lifecycle_jobs WHERE id=$1',['approved-f202-20260930:force-close-epoch-1']);
 if(d.status!==1&&!job.rowCount)throw Error('Epoch state changed before the authorized close');
 const receipt=await t.write('force-close-epoch-1',hub,abi,'forceClose',[app,zeroHash]);
 const block=await t.base.getBlock(),after=await readHubDelegation(t.base,hub,app,block.number);
 assert.equal(after.epoch,1n);assert.equal(after.status,2);
 console.log(JSON.stringify({at:new Date().toISOString(),app,epoch:'1',match:'190',action:'forceClose',
  transaction:receipt.transactionHash,block:String(receipt.blockNumber),observedBlock:String(block.number),
  status:after.status,releaseAt:new Date(Number(after.stakeUnlockAt)*1000).toISOString(),archivedScoreRetained:'6-1'}));
}finally{await t.close();}
