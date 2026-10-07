// Read-only proof of the actual public Chaos wager and disconnected payout.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createPublicClient, http, parseAbi, formatEther, type Hex, type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {abi} from '../shared/abi-independent-MarketV4';

const manifest = JSON.parse(await readFile('deployments/independent-v3-20261005.json', 'utf8'));
const browserReport=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):undefined;
assert(!browserReport||browserReport.bet?.shares==='6000000000000000'&&browserReport.lobby.toLowerCase()===manifest.lobby.toLowerCase());
const player = (browserReport?.bet.player??'0xF2E82585A5fFF649A83dD7981B144C67EBDb3a8b') as Address;
const id = BigInt(browserReport?.bet.matchId??'340282366920938463463374607431768211464');
const base = createPublicClient({chain:monadTestnet,transport: http(process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz', {retryCount: 0, timeout: 15000})});
const rows = await (await fetch(`https://pongit.xyz/api/independent/player/${player}/payments?lobby=${manifest.lobby}`)).json();
const row = rows.find((v: any) => v.id === String(id));
assert(row?.payment?.state === 'PayoutPaid');
const payout = await base.readContract({address: manifest.market, abi, functionName: 'payouts', args: [row.payoutId]});
assert.equal(payout[0].toLowerCase(), player.toLowerCase());
assert.equal(payout[2], 2);
assert.equal(payout[3], 1);
const receipt = await base.getTransactionReceipt({hash: row.payment.hash as Hex});
assert.equal(receipt.status, 'success');
const preview=await base.readContract({address:manifest.market,abi:parseAbi(['function claimPreview(uint256,address) view returns(uint256 amount,uint256 refunded,bool ready)']),functionName:'claimPreview',args:[id,player],blockNumber:receipt.blockNumber-1n});
assert(preview[2],'Canonical pre-claim state must be ready');assert.equal(payout[1],preview[0]);
assert(receipt.logs.some(log => log.address.toLowerCase() === manifest.market.toLowerCase() && log.topics[1] === row.payoutId));
const [before, after] = await Promise.all([receipt.blockNumber - 1n, receipt.blockNumber].map(blockNumber => base.getBalance({address: player, blockNumber})));
assert.equal(after - before, payout[1]);
for (const [functionName, args, reason] of [
  ['claim', [id, player], 'claim'],
  ['retryPayout', [row.payoutId], 'not pending'],
] as const) {
  let rejected = false;
  try {await base.simulateContract({address: manifest.market, abi, functionName, args} as any);}
  catch (error) {
    const reverted = (error as any).walk?.((e: any) => e.name === 'ContractFunctionRevertedError');
    assert(reverted, 'An RPC failure is not proof of duplicate-payment protection');
    assert(String(reverted.reason ?? reverted.message).includes(reason));
    rejected = true;
  }
  assert(rejected);
}
const report = {at: new Date().toISOString(), passed: true, player, id, market: manifest.market, amount: payout[1],refunded:preview[1],canonicalPreClaimAmount:preview[0], transaction: receipt.transactionHash, block: receipt.blockNumber, before, after, attempts: payout[3], duplicateClaimRejected: true, duplicateRetryRejected: true};
await writeFile(process.argv[3]??'artifacts/public-human-v3-payment.json', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2),{flag:'wx'});
console.log(JSON.stringify({passed: true, amountMon:formatEther(payout[1]),refundedMon:formatEther(preview[1]),transaction: receipt.transactionHash, duplicatePaymentsRejected: true}));
