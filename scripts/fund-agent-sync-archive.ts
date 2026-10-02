// One idempotent, bounded test-MON top-up for the released private source.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {formatEther,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {PRIVATE_SYNC_PREDECESSOR} from './private-sync-continuation';

assert.equal(process.env.PONG_SYNC_ARCHIVE_FUND,'released-private-only');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert.equal(r.common.pool.toLowerCase(),PRIVATE_SYNC_PREDECESSOR);
assert.equal(r.prefix,'reusable-agents-20261002-1');
const release=JSON.parse(await readFile('/evidence/sync-release-1.json','utf8'));
assert(release.passed&&release.arenas.length===5&&release.arenas.every((a:any)=>a.release));
const t=await chainTools(r.prefix+':source-finality-reserve');
const report:any={at:new Date().toISOString(),passed:false,pool:r.common.pool};
try{
 const address=r.serviceOperators.archive;
 assert.equal(address.toLowerCase(),'0x17585f8488371c19735380e0215b76229feb2c84');
 const before=await t.base.getBalance({address});report.beforeMon=formatEther(before);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[r.prefix+':source-finality-reserve:archive-10-mon']);
 assert(known.rowCount||before<parseEther('1'),'Review an already funded role before adding another reserve');
 const receipt=await retryOperatorContention(()=>t.submit('archive-10-mon','0x',address,parseEther('10')));
 report.hash=receipt.transactionHash;report.block=String(receipt.blockNumber);report.transferredMon='10';
 report.afterMon=formatEther(await t.base.getBalance({address}));report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,160);process.exitCode=1;}
finally{await t.close();await writeFile('/evidence/source-finality-funding-1.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
