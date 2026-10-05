// Bounded, idempotent test-MON recovery of the existing public role accounts.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {formatEther, parseEther, type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';

assert.equal(process.env.PONG_PUBLIC_ROLE_FUNDING, 'public-v3-20261005');
const manifest = JSON.parse(await readFile('/agent-metadata/reusable.json', 'utf8'));
assert.equal(manifest.common.pool.toLowerCase(), '0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
const t = await chainTools('public-v3-role-reserve-20261005');
const report: any = {at: new Date().toISOString(), passed: false, transfers: []};
try {
  for (const [role, expected, amount, threshold] of [
    ['admission', '0x31a5bb21dbf5d78021e87ab307941cb47db25ec2', '8', '1'],
    ['archive', '0x38078433f7a63b3e6abdef49a726599d655f42c5', '2', '4'],
  ]) {
    const address = manifest.serviceOperators[role] as Address;
    assert.equal(address.toLowerCase(), expected);
    const name = `${role}-${amount}`;
    const known = await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1', [`public-v3-role-reserve-20261005:${name}`]);
    const before = await t.base.getBalance({address});
    assert(known.rowCount || before < parseEther(threshold), 'Role is already funded; review before another transfer');
    const tx = await retryOperatorContention(() => t.submit(name, '0x', address, parseEther(amount)));
    report.transfers.push({role, address, amount, before: formatEther(before), after: formatEther(await t.base.getBalance({address})), hash: tx.transactionHash});
  }
  report.operatorRemaining = formatEther(await t.base.getBalance({address: t.account.address}));
  report.passed = true;
} catch (error) {
  report.error = String((error as any).shortMessage ?? (error as Error).message).split('\n')[0].slice(0, 180);
  process.exitCode = 1;
} finally {
  await t.close();
  await writeFile('/evidence/public-role-funding.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
