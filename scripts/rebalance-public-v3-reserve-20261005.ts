// Move existing PONGIT test-MON reserves between owned accounts. This uses
// the maintenance signer's existing nonce journal/lock without changing roles.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {formatEther, parseEther, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';

assert.equal(process.env.PONG_PUBLIC_ROLE_FUNDING, 'rebalance-v3-20261005');
const manifest = JSON.parse(await readFile('/agent-metadata/reusable.json', 'utf8'));
assert.equal(manifest.common.pool.toLowerCase(), '0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
const sender = '0xbeeb456231E970aC08420488a2dB91Bfe257686A' as Address;
assert.equal(manifest.serviceOperators.maintenance.toLowerCase(), sender.toLowerCase());
const amounts = new Map([
  ['0x31a5bb21dbf5d78021e87ab307941cb47db25ec2', parseEther('25')],
  ['0x38078433f7a63b3e6abdef49a726599d655f42c5', parseEther('25')],
  ['0x369158ac444278541322643e46e0d5b45ac21c4c', parseEther('20')],
]);
assert.equal(manifest.serviceOperators.admission.toLowerCase(), [...amounts.keys()][0]);
assert.equal(manifest.serviceOperators.archive.toLowerCase(), [...amounts.keys()][1]);
const t = await chainTools('public-v3-rebalance-20261005', undefined, {
  keyFile: '/run/maintenance-funding.json', address: sender,
  allowCall(to, data, value) {assert.equal(data, '0x'); assert.equal(amounts.get(to.toLowerCase()), value);},
});
const report: any = {at: new Date().toISOString(), passed: false, sender, transfers: []};
try {
  for (const [target, value] of amounts) {
    const address = target as Address;
    const balance = await t.base.getBalance({address: sender});
    assert(balance > value + parseEther('75'), 'Keep at least 75 test MON for normal maintenance');
    const tx = await retryOperatorContention(() => t.submit(target.slice(2), '0x', address, value));
    report.transfers.push({address, amount: formatEther(value), hash: tx.transactionHash, after: formatEther(await t.base.getBalance({address}))});
  }
  report.remaining = formatEther(await t.base.getBalance({address: sender}));
  report.passed = true;
} catch (error) {
  report.error = String((error as any).shortMessage ?? (error as Error).message).split('\n')[0].slice(0, 180);
  process.exitCode = 1;
} finally {
  await t.close();
  await writeFile('/evidence/public-reserve-rebalance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
