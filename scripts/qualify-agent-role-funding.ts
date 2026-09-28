// One bounded refill of the isolated archive role, preserving its pending nonce.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
assert.equal(process.env.PONG_FIVE_ROLE_FUNDING,'private-archive-30');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert(r.maxMatches===5&&!r.continuation);
const role=r.serviceOperators.archive;
assert.equal(role.toLowerCase(),'0xd8087b6cd4ade3b91c468f749505a28e351f719f');
const t=await chainTools(r.prefix+':five-archive-refill-1',measuredFetch('monad'));
const metrics=await agentMetrics('/diagnostics/reusable','funding-qualification');
try{
 const before=await t.base.getBalance({address:role});
 const tx=await retryOperatorContention(()=>t.submit('archive-30','0x',role,parseEther('30')));
 const after=await t.base.getBalance({address:role});
 await writeFile('artifacts/reusable-candidate/five-archive-refill-1.json',JSON.stringify({at:new Date().toISOString(),role,
  before:String(before),after:String(after),funded:String(parseEther('30')),hash:tx.transactionHash,block:String(tx.blockNumber)},null,2));
}finally{await t.close();await metrics();}
