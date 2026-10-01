// Authorized testnet reserve transfer. Re-running reconciles the same journal entry.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {formatEther, parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';

assert.equal(process.env.PONG_ARCHIVE_REFILL, 'authorized-20261001-100');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/pong_relayer');
const target = '0x38078433f7a63b3e6abdef49a726599d655f42c5' as const;
const tools = await chainTools('flow-funding-20261001');
try {
  const before = await tools.base.getBalance({address: target});
  const receipt = await tools.submit('archive-100', '0x', target, parseEther('100'));
  const block = await tools.base.getBlock({blockNumber: receipt.blockNumber});
  assert.equal(block.hash, receipt.blockHash);
  const after = await tools.base.getBalance({address: target, blockNumber: receipt.blockNumber});
  const reserve = await tools.base.getBalance({address: tools.account.address, blockNumber: receipt.blockNumber});
  const report = {
    at: new Date().toISOString(), chainId: 10143, from: tools.account.address,
    to: target, transferredMon: '100', hash: receipt.transactionHash,
    block: String(receipt.blockNumber), blockHash: receipt.blockHash,
    beforeMon: formatEther(before), afterMon: formatEther(after),
    reserveMon: formatEther(reserve), gasCostMon: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
    passed: true,
  };
  await writeFile('/funding-report/transfer.json', JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({passed: false, message: 'Funding operation requires journal reconciliation; do not create a new operation.', name: error instanceof Error ? error.name : 'UnknownError'}));
  process.exitCode = 1;
} finally {
  await tools.close();
}
