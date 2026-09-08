// Run only against a fresh, isolated PublicationProbe deployed through the hosted CLI.
// One engine write, no payment, game or retry of an uncertain transaction.
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, http, keccak256, zeroHash} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {monadTestnet} from "viem/chains";
import {createInterludeClient, memoryStore} from "@interludelayer-sdk/sdk";

assert.equal(process.env.ROOMS_PUBLICATION_PROBE, "isolated-vps");
const manifest = JSON.parse(await readFile(process.env.ROOMS_PROBE_MANIFEST!, "utf8"));
const artifact = JSON.parse(await readFile("contracts/out/PublicationProbe.sol/PublicationProbe.json", "utf8"));
assert.equal(manifest.app.toLowerCase(), process.env.ROOMS_PROBE_APP?.toLowerCase());
const output = process.env.ROOMS_PROBE_REPORT!;
assert(output.startsWith("artifacts/") && !existsSync(output), "Preserve the previous attempt; do not resend uncertain writes");
const base = createPublicClient({chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz", {timeout: 8000, retryCount: 0})});
assert.equal(await base.getChainId(), 10143);
const engine = createInterludeClient({app: manifest.app, abi: artifact.abi, node: manifest.node, base, store: memoryStore(),
  transport: http(manifest.node, {timeout: 5000, retryCount: 0}), fastPath: true});
const report: any = {startedAt: new Date().toISOString(), app: manifest.app, node: manifest.node, events: []};
const save = () => writeFile(output, JSON.stringify(report, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
const detail = (e: any) => String(e.details || e.shortMessage || e.message).split("Request Arguments")[0]
  .split("Request body")[0].replace(/0x[0-9a-fA-F]{130,}/g, "[long hex omitted]").slice(0, 1000);
try {
  assert.equal(await engine.read("value", []), 0n, "Inspect the existing probe instead of resending");
  report.before = await engine.status();
  assert.equal(report.before.chainId, 4242);
  assert.equal(report.before.pendingDiffs.length, 0);
  assert.equal(report.before.committedBatches, 0);
  const owner = privateKeyToAccount(generatePrivateKey());
  const session = await engine.openSession({wallet: createWalletClient({account: owner, chain: monadTestnet, transport: http()}),
    scope: ["increment"], expirySeconds: 300, assertDigest: true});
  report.write = {status: "sending"}; await save();
  const sent = await session.send("increment", []);
  report.write = {status: "accepted", hash: sent.hash, latencyMs: sent.latencyMs};
  report.live = await engine.read("value", []); await save();
  const key = await engine.read("key", []) as `0x${string}`;
  const slot = keccak256(encodeAbiParameters([{type: "bytes32"}, {type: "uint256"}], [key, 0n]));
  const hub = await engine.readSettled("hub", []) as `0x${string}`;
  const diff = {slot, key, mappingBase: zeroHash, isMapping: true, oldValue: zeroHash, newValue: `0x${"0".repeat(63)}1`};
  const data = encodeFunctionData({abi: artifact.abi, functionName: "applyDelegatedDiffs", args: [[diff]]});
  try {
    // eth_call only. This checks the app callback, not the hub's signed commit.
    await base.call({account: hub, to: manifest.app, data}); report.applicationAcceptsDiff = true;
  } catch (e) { report.applicationAcceptsDiff = false; report.applicationError = detail(e); }
  const deadline = Date.now() + 90000;
  do {
    const status = await engine.status();
    report.events.push({at: new Date().toISOString(), head: status.ephemeralBlock, batch: status.committedBatches, pending: status.pendingDiffs.length});
    report.settled = await engine.readSettled("value", []);
    report.health = await fetch(`${manifest.node}/health`, {signal: AbortSignal.timeout(5000)}).then(r => r.json());
    await save();
    if (report.settled === 1n) { report.passed = true; break; }
    if (report.health.halted) throw new Error(report.health.halted);
    await new Promise(r => setTimeout(r, 1000));
  } while (Date.now() < deadline);
  assert(report.passed, "Counter accepted live, publication not observed before deadline");
} catch (e) { report.error = detail(e); report.passed = false; process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({app: report.app, passed: report.passed, error: report.error}));
}
