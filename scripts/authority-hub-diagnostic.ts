// Read-only Monad calls. No signer, private key, deployment or state mutation.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http, zeroAddress, zeroHash, type Address } from "viem";
import { monadTestnet } from "viem/chains";

const manifest = JSON.parse(await readFile("deployments/interlude-rooms.json", "utf8"));
const artifact = JSON.parse(await readFile("node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json", "utf8"));
const client = createPublicClient({chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz", {retryCount: 0, timeout: 15000})});
const block = await client.getBlock();
const common = {address: manifest.hub as Address, abi: artifact.abi, blockNumber: block.number};
const validator = await client.readContract({...common, functionName: "defaultValidator"}) as Address;
const terms = await client.readContract({...common, functionName: "termsOf", args: [validator]}) as {delegationFee: bigint; challengeWindow: bigint; maxDiffsPerCommit: number; maxDelegations: number; open: boolean};
const bond = await client.readContract({...common, functionName: "bondOf", args: [validator]});
// A simulation caller only. It is not a user's account and no key is generated.
let admission: unknown;
try {
  await client.simulateContract({...common, functionName: "openDelegation", args: [zeroHash, [zeroHash], [], zeroAddress, "0x00000000000000000000000000000000000000A1", 0n], account: "0x00000000000000000000000000000000000000A1", value: terms.delegationFee});
  admission = {simulation: "passed", scope: "No hosted node or contract deployment was exercised."};
} catch (error) {
  let cause: any = error, name: string | undefined;
  for (let i=0; cause && i<8; i++, cause=cause.cause) if (cause.data?.errorName) name = cause.data.errorName;
  admission = {simulation: "reverted", error: name ?? "Undecoded simulation failure", scope: "Actual hub bytecode at the recorded Monad block. A probe caller is used; a passing call would not qualify hosted execution."};
}
const report = {at: new Date().toISOString(), chainId: 10143, hub: manifest.hub, block: block.number, blockHash: block.hash, blockTime: new Date(Number(block.timestamp)*1000).toISOString(), validator, terms, bond, admission, publicTransactionsSent: 0};
await mkdir("artifacts/authority", {recursive: true});
const serialized = JSON.stringify(report, (_,v) => typeof v === "bigint" ? v.toString() : v, 2);
await writeFile("artifacts/authority/hub-diagnostic.json", serialized+"\n");
console.log(serialized);
if (process.argv.includes("--require-available") && (admission as {simulation: string}).simulation !== "passed") process.exitCode = 1;
