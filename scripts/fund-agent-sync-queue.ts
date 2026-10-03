// One idempotent test-MON refill for the private queue-continuation archive.
// Its existing worker retains ownership of every result and pending transaction.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {formatEther,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {privateSyncContinuation} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_QUEUE_FUND,'private-archive-20');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert(privateSyncContinuation(r,process.env.PONG_PRIVATE_SYNC_CONTINUATION));
assert.equal(r.prefix,'reusable-agents-20261003-2');
assert.equal(r.common.pool.toLowerCase(),'0xd8bc8424c74aafbe3e00cbd04468538e01f6a27d');
const address=r.serviceOperators.archive;
assert.equal(address.toLowerCase(),'0x06202a2165f820bfaeda7efefa3b4c1f680997bf');
const prefix=r.prefix+':archive-reserve';
const t=await chainTools(prefix);
const report:any={at:new Date().toISOString(),pool:r.common.pool,address,passed:false};
try{
 const block=await t.base.getBlock();
 const before=await t.base.getBalance({address,blockNumber:block.number});
 report.beforeMon=formatEther(before);report.observedBlock=String(block.number);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':archive-20-mon']);
 assert(known.rowCount||before<parseEther('1'),'Inspect an already funded role before another reserve');
 assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
 const tx=await retryOperatorContention(()=>t.submit('archive-20-mon','0x',address,parseEther('20')));
 report.hash=tx.transactionHash;report.block=String(tx.blockNumber);report.transferredMon='20';
 report.afterMon=formatEther(await t.base.getBalance({address}));report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160);process.exitCode=1;}
finally{await t.close();await writeFile('/evidence/queue-archive-funding-1.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
