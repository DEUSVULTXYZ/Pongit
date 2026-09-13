import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { allDeployments, type Deployment } from "../shared/protocol";
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
// Explicit fresh-history rollout. This never deletes a database or changes a
// deployment's financial start block; callers must use a new indexer database.
const historyStart=process.env.INDEXER_HISTORY_START_BLOCK;
if(historyStart!==undefined&&!/^[1-9]\d*$/.test(historyStart))throw Error('Invalid history start block');
const start=(original:number|string)=>historyStart?String(BigInt(original)>BigInt(historyStart)?BigInt(original):BigInt(historyStart)):String(original);
config += `\nchains:\n  - id: ${d.chainId}\n    start_block: ${start(allDeployments(d).at(-1)!.startBlock)}\n`;
const interval=process.env.INDEXER_CHUNKED_RPC==="true"?1999:99;
const rpc = process.env.INDEXER_RPC_URL || process.env.RPC_URL || (d.chainId === 31337 ? "http://host.docker.internal:8545" : "https://testnet-rpc.monad.xyz");
config += `    rpc:\n      url: ${JSON.stringify(rpc)}\n      for: sync\n      initial_block_interval: ${interval}\n      interval_ceiling: ${interval}\n      polling_interval: 1500\n      query_timeout_millis: 120000\n`;
config += "    contracts:\n";
for(const manifest of allDeployments(d).reverse()) {
  const suffix=(manifest.version||1)>=2?`V${manifest.version}`:"";
  for(const [name,address] of [["Game",manifest.game],["Market",manifest.market],["Tournaments",manifest.tournaments]]) config+=`      - name: ${name}${suffix}\n        address: "${address}"\n        start_block: ${start(manifest.startBlock)}\n`;
}
try{
 const independent=JSON.parse(await readFile('deployments/independent.json','utf8'));
 if(independent.chainId!==d.chainId||!/^0x[\da-fA-F]{40}$/.test(independent.ratings)||!/^\d+$/.test(String(independent.startBlock)))throw Error('Independent indexer manifest requires a verified deployment block');
 config+=`      - name: IndependentRatings\n        address: "${independent.ratings}"\n        start_block: ${start(independent.startBlock)}\n`;
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
try{
 const finance=JSON.parse(await readFile('deployments/rooms-finance.json','utf8'));
 for(const m of finance.filter((m:any)=>m.rulesVersion===6)){
  if(m.chainId!==d.chainId||!/^0x[\da-fA-F]{40}$/.test(m.adapter)||!/^\d+$/.test(m.startBlock))throw Error('Invalid events archive manifest');
  config+=`      - name: ChaosEventsArchive\n        address: "${m.adapter}"\n        start_block: ${start(m.startBlock)}\n`;
 }
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
await writeFile("indexer/config.yaml", config);
console.log("Indexer bound to deployment; run npm run codegen in indexer.");
