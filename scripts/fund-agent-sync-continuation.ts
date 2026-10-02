// One reviewed test-MON refill. The existing worker retains all pending jobs.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {formatEther,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {privateSyncContinuation} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_CONTINUATION_FUND,'private-archive-20');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert(privateSyncContinuation(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION));
assert.equal(r.common.pool.toLowerCase(),'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc');
const address=r.serviceOperators.archive;
assert.equal(address.toLowerCase(),'0x8ae9b9d2664fb5d39d522c43a64fa827ef2d123c');
const prefix=r.prefix+':continuation-finality-reserve';
const t=await chainTools(prefix);
const report:any={at:new Date().toISOString(),pool:r.common.pool,address,passed:false};
try{
 const before=await t.base.getBalance({address});report.beforeMon=formatEther(before);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':archive-20-mon']);
 assert(known.rowCount||before<parseEther('1'),'Inspect an already funded role');
 const tx=await retryOperatorContention(()=>t.submit('archive-20-mon','0x',address,parseEther('20')));
 report.hash=tx.transactionHash;report.block=String(tx.blockNumber);report.transferredMon='20';
 report.afterMon=formatEther(await t.base.getBalance({address}));report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160);process.exitCode=1;}
finally{await t.close();await writeFile('/evidence/continuation-finality-funding-1.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
