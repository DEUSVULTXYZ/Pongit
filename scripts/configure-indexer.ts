import "dotenv/config";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { allDeployments, type Deployment } from "../shared/protocol";
import { isChaosEventsRules } from "../shared/chaos-rules";
import type {ChaosArchiveDeployment} from '../indexer/src/chaos-archive';
import type {IndependentArchiveDeployment} from '../indexer/src/independent-archive';
import {agentIndexDeployments} from '../shared/agent-index-manifest';
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
const independentBindings:Record<string,IndependentArchiveDeployment>={};
const independentStarts:Record<string,string>={};
for(const file of ['independent.json','independent-index.json'])try{
 const raw=JSON.parse(await readFile('deployments/'+file,'utf8'));
 for(const independent of file==='independent.json'?[raw]:raw.deployments){
  const address=(a:unknown):a is string=>typeof a==='string'&&/^0x[\da-fA-F]{40}$/.test(a)&&!/^0x0{40}$/.test(a);
  const rules=independent.rulesVersion??4;
  if(independent.archiveContract !== undefined && independent.archiveContract !== 'CurrentIndependentRatings')
   throw Error('Invalid independent archive contract alias');
  const apps=independent.arenas?.map((a:any)=>typeof a==='string'?a:a.app);
  if(independent.chainId!==d.chainId||!address(independent.ratings)||!/^\d+$/.test(String(independent.startBlock))
   ||![4,12,13,14].includes(rules)||!Array.isArray(apps)||!apps.length||apps.length>32||!apps.every(address)
   ||new Set(apps.map((a:string)=>a.toLowerCase())).size!==apps.length)
   throw Error('Independent indexer manifest requires a verified ledger, arenas, rules and deployment block');
  const ledger=independent.ratings.toLowerCase(),binding={apps:apps.map((a:string)=>a.toLowerCase()).sort(),rulesVersion:rules as 4|12|13|14};
  if(independentBindings[ledger]){
   if(JSON.stringify(independentBindings[ledger])!==JSON.stringify(binding)||independentStarts[ledger]!==String(independent.startBlock))
    throw Error('Conflicting independent archive binding');
   continue;
  }
  independentBindings[ledger]=binding;independentStarts[ledger]=String(independent.startBlock);
  config+=`      - name: ${independent.archiveContract??'IndependentRatings'}\n        address: "${independent.ratings}"\n        start_block: ${start(independent.startBlock)}\n`;
 }
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const chaosBindings:Record<string,ChaosArchiveDeployment>={};
try{
 const finance=JSON.parse(await readFile('deployments/rooms-finance.json','utf8'));
 for(const m of finance.filter((m:any)=>isChaosEventsRules(m.rulesVersion))){
  if(m.chainId!==d.chainId||!/^0x[\da-fA-F]{40}$/.test(m.adapter)||!/^0x[\da-fA-F]{40}$/.test(m.app)||!/^\d+$/.test(m.startBlock))throw Error('Invalid events archive manifest');
  const address=m.adapter.toLowerCase(),binding={app:m.app.toLowerCase(),rulesVersion:m.rulesVersion as 6|7|8|9|10};
  if(chaosBindings[address]&&JSON.stringify(chaosBindings[address])!==JSON.stringify(binding))throw Error('Conflicting Chaos archive binding');
  chaosBindings[address]=binding;
  config+=`      - name: ChaosEventsArchive\n        address: "${m.adapter}"\n        start_block: ${start(m.startBlock)}\n`;
 }
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
try{
 const agents=JSON.parse(await readFile('deployments/agents.json','utf8'));
 if(agents.chainId!==d.chainId||!/^0x[\da-fA-F]{40}$/.test(agents.archive)||!/^\d+$/.test(String(agents.archiveStartBlock)))throw Error('Invalid agent archive manifest');
 if(![7,10].includes(agents.rulesVersion)||!/^0x[\da-fA-F]{40}$/.test(agents.app))throw Error('Invalid agent archive rules binding');
 const address=agents.archive.toLowerCase(),binding={app:agents.app.toLowerCase(),rulesVersion:agents.rulesVersion as 7|10};
 if(chaosBindings[address]&&JSON.stringify(chaosBindings[address])!==JSON.stringify(binding))throw Error('Conflicting agent archive binding');
 chaosBindings[address]=binding;
 config+=`      - name: AgentArchive\n        address: "${agents.archive}"\n        start_block: ${start(agents.archiveStartBlock)}\n`;
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const seriesGroups=new Map<string,{addresses:string[];startBlock:bigint}>();
for(const [file,rules] of [['agent-series-index.json',11],['agent-reusable-index.json',15]] as const)try{
 const raw=JSON.parse(await readFile('deployments/'+file,'utf8'));
 for(const series of agentIndexDeployments(raw,d.chainId,rules)){
  const emitter=series.pool;if(chaosBindings[emitter])throw Error('Conflicting series archive emitter');
  chaosBindings[emitter]={apps:series.arenas,rulesVersion:series.rulesVersion};
  // Envio keys chain bindings by name. Repeating the alias discards an older
  // emitter. One address list retains all seasons, starting at the earliest
  // deployment; the per-emitter binding above still selects immutable rules.
  const name=series.archiveContract??'AgentSeriesArchive',block=BigInt(start(series.startBlock));
  const group=seriesGroups.get(name);
  if(group){group.addresses.push(emitter);if(block<group.startBlock)group.startBlock=block;}
  else seriesGroups.set(name,{addresses:[emitter],startBlock:block});
 }
}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
for(const [name,group] of seriesGroups)
 config+=`      - name: ${name}\n        address: ${JSON.stringify(group.addresses.length===1?group.addresses[0]:group.addresses)}\n        start_block: ${group.startBlock}\n`;
// Keep the reviewed, hash-checked runtime patch inside the reproducible image.
// Configuration already generates this build directory; no secret is copied.
await copyFile('ops/pin-envio-rpc-concurrency.mjs','indexer/pin-envio-rpc-concurrency.mjs');
await writeFile("indexer/config.yaml", config);
await writeFile('indexer/src/chaos-deployments.ts','// Generated by scripts/configure-indexer.ts from public finance manifests.\nexport const chaosArchiveDeployments = '+JSON.stringify(chaosBindings,null,2)+' as const;\n');
await writeFile('indexer/src/independent-deployments.ts','// Generated by scripts/configure-indexer.ts from public deployment manifests.\nexport const independentArchiveDeployments = '+JSON.stringify(independentBindings,null,2)+' as const;\n');
console.log("Indexer bound to deployment; run npm run codegen in indexer.");
