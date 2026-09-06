import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import type { Deployment } from "../shared/protocol";
const d: Deployment = JSON.parse(
  await readFile(
    process.env.DEPLOYMENT_FILE || "deployments/testnet.json",
    "utf8",
  ),
);
if (
  ![31337, 10143].includes(d.chainId) ||
  [d.game, d.market, d.tournaments].some(
    (a) => !/^0x[\da-fA-F]{40}$/.test(a) || /^0x0{40}$/.test(a),
  )
)
  throw new Error("A real local or testnet deployment is required");
let config = await readFile("indexer/config.template.yaml", "utf8");
config = config.slice(0, config.indexOf("\nchains:"));
config += `\nchains:\n  - id: ${d.chainId}\n    start_block: ${d.legacy?.startBlock || d.startBlock}\n`;
const rpc = process.env.INDEXER_RPC_URL || process.env.RPC_URL || (d.chainId === 31337 ? "http://host.docker.internal:8545" : "https://testnet-rpc.monad.xyz");
config += `    rpc:\n      url: ${JSON.stringify(rpc)}\n      for: sync\n      initial_block_interval: 99\n      interval_ceiling: 99\n      polling_interval: 1500\n`;
config += "    contracts:\n";
for(const manifest of [d.legacy,d].filter(Boolean) as Deployment[]) {
  const suffix=manifest.version===2?"V2":"";
  for(const [name,address] of [["Game",manifest.game],["Market",manifest.market],["Tournaments",manifest.tournaments]]) config+=`      - name: ${name}${suffix}\n        address: "${address}"\n`;
}
await writeFile("indexer/config.yaml", config);
console.log("Indexer bound to deployment; run npm run codegen in indexer.");
