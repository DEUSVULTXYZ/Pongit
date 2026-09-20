// Deploy the documented pure example for the existing isolated test creator.
// This does not register, qualify, open a delegation or change any public gate.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encodeDeployData, keccak256, parseAbi, parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {validateStrategyRuntime} from '../shared/agent-strategy-code';
assert.equal(process.env.PONG_POOL_TRACKER_DEPLOY, 'authorized-private-example');
assert.equal(process.getuid?.(), 1000);
const creator = '0x74c2C802efDbDc962624a61b9e2180214bd8c228' as const;
const bytes = await readFile('/compiled/TrackerStrategy.json');
assert.equal(createHash('sha256').update(bytes).digest('hex'), process.env.PONG_TRACKER_ARTIFACT_HASH);
const artifact = JSON.parse(bytes.toString());
validateStrategyRuntime(artifact.deployedBytecode.object);
const metadata = typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata;
assert.equal(metadata.settings.metadata.appendCBOR, false, 'Use the immutable-strategies build profile');
const t = await chainTools('pool-tracker-example-20260920');
try {
  assert.notEqual(creator.toLowerCase(), t.account.address.toLowerCase());
  const receipt = await t.submit('deploy-metadata-free', encodeDeployData({abi: artifact.abi, bytecode: artifact.bytecode.object, args: [creator, 4n]}));
  assert(receipt.contractAddress);
  const strategy = receipt.contractAddress;
  const code = await t.base.getCode({address: strategy}); validateStrategyRuntime(code);
  assert.equal((await t.base.readContract({address: strategy, abi: parseAbi(['function creator() view returns(address)']), functionName: 'creator'})).toLowerCase(), creator.toLowerCase());
  if (await t.base.getBalance({address: creator}) < parseEther('0.01')) await t.submit('creator-test-gas', '0x', creator, parseEther('0.05'));
  const report = {at: new Date().toISOString(), creator, strategy, runtimeHash: keccak256(code!), transaction: receipt.transactionHash,
    block: String(receipt.blockNumber), artifactHash: process.env.PONG_TRACKER_ARTIFACT_HASH, qualified: false};
  await writeFile('/diagnostics/pool-tracker-deployment.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally {await t.close();}
