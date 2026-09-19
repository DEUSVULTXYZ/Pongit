// Explicitly approved human epoch-6 recovery only. Never an agent-retirement alias.
import assert from 'node:assert/strict';
import {parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_HUMAN_RECOVERY,'approved-force-close-epoch-6');
const app='0x78d3341e3452d7ec1add9371de3008639eed8eb0',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const config=await(await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(12000)})).json();
assert.equal(config.app.toLowerCase(),app);
assert.equal(config.admission,false,'Keep human admissions closed');
assert.equal(config.maintenance?.operatorHold,true,'Deploy and verify the supervised lifecycle hold first');
const t=await chainTools('human-recovery-20260919');
try{
 const d=await readHubDelegation(t.base,hub,app);assert.equal(d.epoch,6n);
 assert([1,2].includes(d.status),'Unexpected delegation; review rather than reuse this operation');
 const receipt=await t.write('epoch6-force-close',hub,parseAbi(['function forceClose(address,bytes32)']),'forceClose',[app,zeroHash]);
 const after=await readHubDelegation(t.base,hub,app);assert.equal(after.status,2);
 console.log(JSON.stringify({app,epoch:'6',action:'forceClose',hash:receipt.transactionHash,stakeUnlockAt:String(after.stakeUnlockAt),at:new Date().toISOString()}));
}finally{await t.close();}
